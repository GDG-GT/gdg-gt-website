BEGIN;
CREATE TABLE public.reward_event_connections(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),title text NOT NULL CHECK(length(title) BETWEEN 2 AND 120),origin text NOT NULL CHECK(origin~'^https://[^/]+/$'),opens_at timestamptz NOT NULL,closes_at timestamptz NOT NULL,is_active boolean NOT NULL DEFAULT false,activity_id uuid REFERENCES public.reward_activities(id),key_hash text NOT NULL CHECK(key_hash~'^[a-f0-9]{64}$'),encrypted_key text NOT NULL,revision integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),CHECK(closes_at>opens_at AND closes_at<=opens_at+interval '31 days'));
CREATE TABLE public.reward_event_links(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),event_id uuid NOT NULL REFERENCES public.reward_event_connections(id),member_id uuid NOT NULL REFERENCES public.members(id),account_hash text NOT NULL CHECK(account_hash~'^[a-f0-9]{64}$'),member_email text NOT NULL,linked_at timestamptz NOT NULL DEFAULT now(),revoked_at timestamptz,UNIQUE(event_id,member_id),UNIQUE(event_id,account_hash));
CREATE TABLE public.reward_event_codes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),event_id uuid NOT NULL REFERENCES public.reward_event_connections(id),member_id uuid NOT NULL REFERENCES public.members(id),session_hash text NOT NULL,token_hash text UNIQUE NOT NULL,encrypted_code text NOT NULL,expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes',consumed_at timestamptz);
CREATE TABLE public.reward_event_reviews(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),event_id uuid NOT NULL REFERENCES public.reward_event_connections(id),event_revision integer NOT NULL,member_id uuid NOT NULL REFERENCES public.members(id),credential_id uuid NOT NULL REFERENCES public.reward_credentials(id),link_id uuid NOT NULL REFERENCES public.reward_event_links(id),actor_id uuid NOT NULL REFERENCES public.admin_users(id),expires_at timestamptz NOT NULL DEFAULT now()+interval '5 minutes');
CREATE TABLE public.reward_event_checkins(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),event_id uuid NOT NULL REFERENCES public.reward_event_connections(id),member_id uuid NOT NULL REFERENCES public.members(id),link_id uuid NOT NULL REFERENCES public.reward_event_links(id),actor_id uuid NOT NULL REFERENCES public.admin_users(id),state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','completed')),external_id text,created_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,UNIQUE(event_id,member_id));
CREATE TABLE public.reward_event_audit(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),event_id uuid REFERENCES public.reward_event_connections(id),actor_id uuid REFERENCES public.admin_users(id),action text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
DO $$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['reward_event_connections','reward_event_links','reward_event_codes','reward_event_reviews','reward_event_checkins','reward_event_audit'] LOOP EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC,anon,authenticated,gdg_realtime',t);EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.%I TO service_role',t);END LOOP;END $$;
CREATE FUNCTION public.reward_event_admin(p_actor uuid,p_session uuid,p_action text,p_document jsonb,p_key_hash text DEFAULT NULL,p_request_hash text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE e public.reward_event_connections;c public.reward_credentials;l public.reward_event_links;v public.reward_event_reviews;k public.reward_event_checkins;m public.members;old public.reward_receipts;r jsonb;rid uuid;
BEGIN
 PERFORM gdg_security.reward_admin(p_actor,p_session);
 IF p_action='list' THEN RETURN jsonb_build_object('events',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM(SELECT id,title,origin,opens_at,closes_at,is_active,activity_id,revision FROM public.reward_event_connections ORDER BY created_at DESC LIMIT 200)x),'checkins',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM(SELECT ci.id,ci.event_id,ci.state,ci.created_at,ci.completed_at,mb.name FROM public.reward_event_checkins ci JOIN public.members mb ON mb.id=ci.member_id ORDER BY ci.created_at DESC LIMIT 100)x));END IF;
 IF p_action='connection' THEN SELECT * INTO e FROM public.reward_event_connections WHERE id=(p_document->>'id')::uuid;IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;RETURN to_jsonb(e);END IF;
 IF p_action='lookup' THEN
  SELECT * INTO e FROM public.reward_event_connections WHERE id=(p_document->>'eventId')::uuid AND is_active FOR SHARE;IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  SELECT * INTO c FROM public.reward_credentials WHERE token_hash=p_document->>'credentialHash' AND revoked_at IS NULL FOR SHARE;IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  PERFORM gdg_security.reward_active_member(c.member_id);SELECT * INTO m FROM public.members WHERE id=c.member_id;
  SELECT * INTO l FROM public.reward_event_links WHERE event_id=e.id AND member_id=m.id AND revoked_at IS NULL AND member_email=lower(btrim(m.email));
  RETURN jsonb_build_object('event',to_jsonb(e),'member',jsonb_build_object('id',m.id,'name',m.name),'credentialId',c.id,'memberRef',l.id);
 END IF;
 IF p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$' OR p_request_hash IS NULL OR p_request_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('reward-event:'||p_actor||':'||p_key_hash,0));
 SELECT * INTO old FROM public.reward_receipts WHERE actor='event-admin:'||p_actor AND key_hash=p_key_hash;IF FOUND THEN IF old.request_hash<>p_request_hash THEN RAISE EXCEPTION 'CONFLICT';END IF;RETURN old.result;END IF;
 IF p_action IN('save','rotate','revoke') THEN
  rid:=(p_document->>'id')::uuid;
  IF rid IS NULL AND p_action='save' THEN
   IF(SELECT count(*) FROM public.reward_event_connections)>=200 THEN RAISE EXCEPTION 'INVENTORY_LIMIT';END IF;
   INSERT INTO public.reward_event_connections(title,origin,opens_at,closes_at,is_active,activity_id,key_hash,encrypted_key) VALUES(p_document->>'title',p_document->>'origin',(p_document->>'opensAt')::timestamptz,(p_document->>'closesAt')::timestamptz,(p_document->>'active')::boolean,(p_document->>'activityId')::uuid,p_document->>'keyHash',p_document->>'encryptedKey') RETURNING * INTO e;
  ELSE
   SELECT * INTO e FROM public.reward_event_connections WHERE id=rid FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
   IF e.revision<>(p_document->>'revision')::int THEN RAISE EXCEPTION 'CONFLICT';END IF;
   IF p_action='save' THEN UPDATE public.reward_event_connections SET title=p_document->>'title',origin=p_document->>'origin',opens_at=(p_document->>'opensAt')::timestamptz,closes_at=(p_document->>'closesAt')::timestamptz,is_active=(p_document->>'active')::boolean,activity_id=(p_document->>'activityId')::uuid,revision=revision+1 WHERE id=rid RETURNING * INTO e;
   ELSIF p_action='rotate' THEN UPDATE public.reward_event_connections SET key_hash=p_document->>'keyHash',encrypted_key=p_document->>'encryptedKey',revision=revision+1 WHERE id=rid RETURNING * INTO e;
   ELSE UPDATE public.reward_event_connections SET is_active=false,key_hash=p_document->>'keyHash',encrypted_key=p_document->>'encryptedKey',revision=revision+1 WHERE id=rid RETURNING * INTO e;END IF;
  END IF;
  r:=to_jsonb(e)-'key_hash'-'encrypted_key';IF p_action='rotate' OR(rid IS NULL AND p_action='save') THEN r:=r||jsonb_build_object('encryptedKey',e.encrypted_key);END IF;
 ELSIF p_action='review' THEN
  PERFORM public.reward_event_admin(p_actor,p_session,'lookup',p_document);
  SELECT * INTO e FROM public.reward_event_connections WHERE id=(p_document->>'eventId')::uuid;
  IF e.revision<>(p_document->>'eventRevision')::int OR ((now()<e.opens_at OR now()>e.closes_at) AND NOT EXISTS(SELECT 1 FROM public.reward_event_checkins WHERE event_id=e.id AND member_id=(SELECT member_id FROM public.reward_credentials WHERE token_hash=p_document->>'credentialHash') AND state='pending')) THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  SELECT * INTO c FROM public.reward_credentials WHERE token_hash=p_document->>'credentialHash' AND revoked_at IS NULL;
  SELECT * INTO l FROM public.reward_event_links WHERE event_id=e.id AND member_id=c.member_id AND id=(p_document->>'memberRef')::uuid AND revoked_at IS NULL;IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  INSERT INTO public.reward_event_reviews(event_id,event_revision,member_id,credential_id,link_id,actor_id) VALUES(e.id,e.revision,c.member_id,c.id,l.id,p_actor) RETURNING id INTO rid;r:=jsonb_build_object('reviewId',rid,'expiresIn',300);
 ELSIF p_action IN('begin','finish') THEN
  SELECT * INTO v FROM public.reward_event_reviews WHERE id=(p_document->>'reviewId')::uuid AND actor_id=p_actor;IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  SELECT * INTO e FROM public.reward_event_connections WHERE id=v.event_id AND is_active FOR SHARE;IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  PERFORM gdg_security.reward_active_member(v.member_id);
  SELECT * INTO l FROM public.reward_event_links WHERE id=v.link_id AND revoked_at IS NULL AND member_email=(SELECT lower(btrim(email)) FROM public.members WHERE id=v.member_id);IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.reward_credentials WHERE id=v.credential_id AND revoked_at IS NULL) THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('event-checkin:'||e.id||':'||v.member_id,0));
  SELECT * INTO k FROM public.reward_event_checkins WHERE event_id=e.id AND member_id=v.member_id;
  IF k.state='completed' THEN RETURN jsonb_build_object('id',k.id,'state',k.state,'externalId',k.external_id,'alreadyCheckedIn',true);END IF;
  IF e.revision<>v.event_revision THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  IF k.id IS NULL AND (now()<e.opens_at OR now()>e.closes_at OR v.expires_at<now()) THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  IF p_action='begin' THEN
   INSERT INTO public.reward_event_checkins(event_id,member_id,link_id,actor_id) VALUES(e.id,v.member_id,l.id,p_actor) ON CONFLICT(event_id,member_id) DO NOTHING;
   SELECT * INTO k FROM public.reward_event_checkins WHERE event_id=e.id AND member_id=v.member_id;
   RETURN jsonb_build_object('id',k.id,'state',k.state,'memberRef',l.id,'event',to_jsonb(e),'recoveryOnly',now()<e.opens_at OR now()>e.closes_at OR v.expires_at<now());
  END IF;
  IF k.id IS NULL OR p_document->>'externalId' IS NULL OR length(p_document->>'externalId') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  UPDATE public.reward_event_checkins SET state='completed',external_id=p_document->>'externalId',completed_at=now() WHERE id=k.id RETURNING * INTO k;r:=jsonb_build_object('id',k.id,'state',k.state,'externalId',k.external_id);
 ELSIF p_action='points' THEN
  SELECT * INTO k FROM public.reward_event_checkins WHERE id=(p_document->>'checkinId')::uuid AND state='completed';IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  SELECT * INTO e FROM public.reward_event_connections WHERE id=k.event_id AND is_active;IF NOT FOUND OR e.activity_id IS NULL THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('event-points:'||e.id||':'||k.member_id,0));
  SELECT id INTO rid FROM public.reward_ledger WHERE member_id=k.member_id AND activity_id=e.activity_id;
  IF rid IS NOT NULL THEN RETURN jsonb_build_object('id',rid,'alreadyAwarded',true);END IF;
  r:=public.reward_admin_mutate(p_actor,p_session,'award',jsonb_build_object('memberId',k.member_id,'activityId',e.activity_id),p_key_hash,p_request_hash,gen_random_uuid());
 ELSE RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 INSERT INTO public.reward_receipts(actor,key_hash,request_hash,result) VALUES('event-admin:'||p_actor,p_key_hash,p_request_hash,r);
 INSERT INTO public.reward_event_audit(event_id,actor_id,action) VALUES(coalesce(e.id,v.event_id),p_actor,p_action);
 RETURN r;
END $$;
CREATE FUNCTION public.reward_event_member(p_hash text,p_csrf text,p_action text,p_document jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ DECLARE m jsonb;e public.reward_event_connections;r jsonb;BEGIN
 m:=public.reward_member_read(p_hash);
 IF p_action='list' THEN RETURN jsonb_build_object('events',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'origin',origin)),'[]') FROM public.reward_event_connections WHERE is_active AND closes_at>now()),'links',(SELECT coalesce(jsonb_agg(jsonb_build_object('eventId',event_id,'memberRef',id,'linkedAt',linked_at)),'[]') FROM public.reward_event_links WHERE member_id=(m->>'id')::uuid AND revoked_at IS NULL));END IF;
 IF m->>'csrfHash' IS DISTINCT FROM p_csrf OR p_csrf IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';END IF;
 SELECT * INTO e FROM public.reward_event_connections WHERE id=(p_document->>'eventId')::uuid AND is_active AND closes_at>now() FOR SHARE;IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_action='unlink' THEN UPDATE public.reward_event_links SET revoked_at=now() WHERE event_id=e.id AND member_id=(m->>'id')::uuid;UPDATE public.reward_event_codes SET consumed_at=now() WHERE event_id=e.id AND member_id=(m->>'id')::uuid AND consumed_at IS NULL;RETURN jsonb_build_object('unlinked',true);END IF;
 IF p_action<>'code' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 DELETE FROM public.reward_event_codes WHERE expires_at<now()-interval '1 day';
 PERFORM pg_advisory_xact_lock(hashtextextended('event-code:'||e.id||':'||(m->>'id'),0));
 IF(SELECT count(*) FROM public.reward_event_codes WHERE member_id=(m->>'id')::uuid AND expires_at>now())>=10 THEN RAISE EXCEPTION 'INVENTORY_LIMIT';END IF;
 INSERT INTO public.reward_event_codes(event_id,member_id,session_hash,token_hash,encrypted_code) VALUES(e.id,(m->>'id')::uuid,p_hash,p_document->>'tokenHash',p_document->>'encryptedCode') RETURNING jsonb_build_object('encryptedCode',encrypted_code,'expiresAt',expires_at) INTO r;RETURN r;
END $$;
CREATE FUNCTION public.reward_event_external(p_event uuid,p_key_hash text,p_action text,p_document jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ DECLARE e public.reward_event_connections;c public.reward_event_codes;l public.reward_event_links;m public.members;r jsonb;receipt public.reward_receipts;BEGIN
 SELECT * INTO e FROM public.reward_event_connections WHERE id=p_event AND is_active AND closes_at+interval '7 days'>now() AND key_hash=p_key_hash FOR SHARE;IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';END IF;
 IF p_action='redeem' THEN
  SELECT * INTO c FROM public.reward_event_codes WHERE token_hash=p_document->>'codeHash' AND event_id=e.id FOR UPDATE;
  IF NOT FOUND OR c.expires_at<now() THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  SELECT * INTO receipt FROM public.reward_receipts WHERE actor='event-redeem:'||e.id AND key_hash=p_document->>'codeHash';
  IF FOUND THEN
   IF receipt.request_hash<>p_document->>'accountHash' THEN RAISE EXCEPTION 'CONFLICT';END IF;
   PERFORM public.reward_member_read(c.session_hash);
   SELECT * INTO l FROM public.reward_event_links WHERE id=(receipt.result->>'memberRef')::uuid AND revoked_at IS NULL AND member_email=(SELECT lower(btrim(email)) FROM public.members WHERE id=c.member_id);
   IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_STATE';END IF;RETURN receipt.result;
  END IF;
  IF c.consumed_at IS NOT NULL THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  PERFORM public.reward_member_read(c.session_hash);PERFORM gdg_security.reward_active_member(c.member_id);
  SELECT * INTO m FROM public.members WHERE id=c.member_id;
  SELECT * INTO l FROM public.reward_event_links WHERE event_id=e.id AND member_id=m.id FOR UPDATE;
  IF FOUND AND l.account_hash<>p_document->>'accountHash' THEN RAISE EXCEPTION 'CONFLICT';END IF;
  INSERT INTO public.reward_event_links(event_id,member_id,account_hash,member_email) VALUES(e.id,m.id,p_document->>'accountHash',lower(btrim(m.email))) ON CONFLICT(event_id,member_id) DO UPDATE SET revoked_at=NULL,member_email=excluded.member_email,linked_at=now() RETURNING * INTO l;
  UPDATE public.reward_event_codes SET consumed_at=now() WHERE id=c.id;
  INSERT INTO public.reward_receipts(actor,key_hash,request_hash,result) VALUES('event-redeem:'||e.id,p_document->>'codeHash',p_document->>'accountHash',jsonb_build_object('memberRef',l.id,'active',true));
  INSERT INTO public.reward_event_audit(event_id,action) VALUES(e.id,'link_redeemed');
 ELSE
  IF p_action<>'membership' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
  SELECT * INTO l FROM public.reward_event_links WHERE id=(p_document->>'memberRef')::uuid AND event_id=e.id AND revoked_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  SELECT * INTO m FROM public.members WHERE id=l.member_id AND is_active AND deleted_at IS NULL AND merged_into_id IS NULL AND lower(btrim(email))=l.member_email;
  IF NOT FOUND THEN RETURN jsonb_build_object('memberRef',l.id,'active',false);END IF;
 END IF;
 RETURN jsonb_build_object('memberRef',l.id,'active',true);
END $$;
-- Directory changes must invalidate event linking, not just NFC cards and sessions.
CREATE FUNCTION gdg_security.reward_event_member_changed() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF NEW.is_active IS DISTINCT FROM OLD.is_active OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at OR NEW.merged_into_id IS DISTINCT FROM OLD.merged_into_id OR lower(btrim(NEW.email)) IS DISTINCT FROM lower(btrim(OLD.email)) THEN UPDATE public.reward_event_links SET revoked_at=now() WHERE member_id=NEW.id;UPDATE public.reward_event_codes SET consumed_at=now() WHERE member_id=NEW.id AND consumed_at IS NULL;END IF;RETURN NEW;END $$;
CREATE TRIGGER reward_event_member_changed AFTER UPDATE ON public.members FOR EACH ROW EXECUTE FUNCTION gdg_security.reward_event_member_changed();
DO $$ DECLARE f record;BEGIN FOR f IN SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname IN('reward_event_admin','reward_event_member','reward_event_external','reward_event_member_changed') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC,anon,authenticated,gdg_realtime',f.nspname,f.proname,f.args);EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO service_role',f.nspname,f.proname,f.args);END LOOP;END $$;
COMMIT;
