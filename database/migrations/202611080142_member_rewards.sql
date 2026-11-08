BEGIN;
CREATE TABLE public.reward_profiles(member_id uuid PRIMARY KEY REFERENCES public.members(id),alias text CHECK(length(alias) BETWEEN 2 AND 40),is_public boolean NOT NULL DEFAULT false,provider_subject text UNIQUE,created_at timestamptz NOT NULL DEFAULT now(),CHECK(NOT is_public OR alias IS NOT NULL));
CREATE UNIQUE INDEX reward_alias_unique ON public.reward_profiles(lower(alias)) WHERE alias IS NOT NULL;
CREATE TABLE public.reward_rules(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),title text NOT NULL CHECK(length(title) BETWEEN 2 AND 120),points integer NOT NULL CHECK(points BETWEEN 1 AND 10000),is_active boolean NOT NULL DEFAULT true,revision integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.reward_activities(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),rule_id uuid NOT NULL REFERENCES public.reward_rules(id),title text NOT NULL CHECK(length(title) BETWEEN 2 AND 160),points integer NOT NULL CHECK(points BETWEEN 1 AND 10000),opens_at timestamptz NOT NULL,closes_at timestamptz NOT NULL,is_active boolean NOT NULL DEFAULT true,revision integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),CHECK(closes_at>opens_at AND closes_at<=opens_at+interval '31 days'));
CREATE TABLE public.reward_perks(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),title text NOT NULL CHECK(length(title) BETWEEN 2 AND 120),description text NOT NULL CHECK(length(description) BETWEEN 2 AND 2000),threshold integer NOT NULL CHECK(threshold BETWEEN 0 AND 1000000),inventory integer CHECK(inventory BETWEEN 0 AND 100000),is_active boolean NOT NULL DEFAULT false,revision integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.reward_credentials(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),member_id uuid NOT NULL REFERENCES public.members(id),kind text NOT NULL CHECK(kind IN('card','wallet','qr')),label text NOT NULL CHECK(length(label) BETWEEN 1 AND 80),token_hash text UNIQUE NOT NULL CHECK(token_hash~'^[a-f0-9]{64}$'),encrypted_token text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),revoked_at timestamptz);
CREATE INDEX reward_member_credentials ON public.reward_credentials(member_id,created_at DESC);
CREATE TABLE public.reward_ledger(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),member_id uuid NOT NULL REFERENCES public.members(id),activity_id uuid REFERENCES public.reward_activities(id),points integer NOT NULL CHECK(points BETWEEN -10000 AND 10000 AND points<>0),reason text NOT NULL CHECK(length(reason) BETWEEN 2 AND 500),actor_id uuid NOT NULL REFERENCES public.admin_users(id),reversal_of uuid UNIQUE REFERENCES public.reward_ledger(id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(member_id,activity_id));
CREATE INDEX reward_member_ledger ON public.reward_ledger(member_id,created_at DESC);
CREATE TABLE public.reward_claims(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),member_id uuid NOT NULL REFERENCES public.members(id),perk_id uuid NOT NULL REFERENCES public.reward_perks(id),status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','approved','fulfilled','rejected','cancelled')),revision integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(member_id,perk_id));
CREATE TABLE public.reward_receipts(actor text NOT NULL,key_hash text NOT NULL CHECK(key_hash~'^[a-f0-9]{64}$'),request_hash text NOT NULL CHECK(request_hash~'^[a-f0-9]{64}$'),result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(actor,key_hash));
CREATE TABLE public.reward_member_sessions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),member_id uuid NOT NULL REFERENCES public.members(id),email text NOT NULL,subject text NOT NULL,token_hash text UNIQUE NOT NULL CHECK(token_hash~'^[a-f0-9]{64}$'),csrf_hash text NOT NULL CHECK(csrf_hash~'^[a-f0-9]{64}$'),created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT now()+interval '12 hours',revoked_at timestamptz);
CREATE TABLE public.reward_auth_flows(token_hash text PRIMARY KEY CHECK(token_hash~'^[a-f0-9]{64}$'),encrypted_verifier text NOT NULL,origin text NOT NULL,expires_at timestamptz NOT NULL DEFAULT now()+interval '5 minutes',consumed_at timestamptz);
DO $$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['reward_profiles','reward_rules','reward_activities','reward_perks','reward_credentials','reward_ledger','reward_claims','reward_receipts','reward_member_sessions','reward_auth_flows'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,gdg_realtime',t);
 EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO service_role',t);
END LOOP;END $$;
CREATE FUNCTION gdg_security.reward_admin(p_actor uuid,p_session uuid) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN
 PERFORM 1 FROM public.admin_users u JOIN public.admin_sessions s ON s.admin_user_id=u.id WHERE u.id=p_actor AND u.role='super_admin' AND u.is_active AND u.deleted_at IS NULL AND NOT u.must_change_password AND(u.locked_until IS NULL OR u.locked_until<=now()) AND s.id=p_session AND s.revoked_at IS NULL AND s.idle_expires_at>now() AND s.absolute_expires_at>now() FOR SHARE OF u,s;
 IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';END IF;
END $$;
CREATE FUNCTION gdg_security.reward_balance(p_member uuid) RETURNS bigint LANGUAGE sql STABLE SET search_path='' AS $$ SELECT coalesce(sum(points),0)::bigint FROM public.reward_ledger WHERE member_id=p_member $$;
CREATE FUNCTION gdg_security.reward_active_member(p_member uuid) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 PERFORM 1 FROM public.members WHERE id=p_member AND is_active AND deleted_at IS NULL AND merged_into_id IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
END $$;
CREATE FUNCTION gdg_security.reward_immutable_ledger() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN RAISE EXCEPTION 'REWARDS_LEDGER_IMMUTABLE' USING ERRCODE='42501';END $$;
CREATE TRIGGER reward_ledger_immutable BEFORE UPDATE OR DELETE ON public.reward_ledger FOR EACH ROW EXECUTE FUNCTION gdg_security.reward_immutable_ledger();
-- Existing directory merges cannot silently lose or double-count points. A
-- reconciliation must precede a merge when either person has rewards history.
CREATE FUNCTION gdg_security.reward_merge_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF NEW.merged_into_id IS DISTINCT FROM OLD.merged_into_id AND NEW.merged_into_id IS NOT NULL AND(EXISTS(SELECT 1 FROM public.reward_ledger WHERE member_id IN(NEW.id,NEW.merged_into_id)) OR EXISTS(SELECT 1 FROM public.reward_claims WHERE member_id IN(NEW.id,NEW.merged_into_id))) THEN RAISE EXCEPTION 'REWARD_MERGE_REVIEW_REQUIRED';END IF;
 IF (OLD.is_active AND NOT NEW.is_active) OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at OR NEW.merged_into_id IS DISTINCT FROM OLD.merged_into_id OR lower(NEW.email) IS DISTINCT FROM lower(OLD.email) THEN
  UPDATE public.reward_credentials SET revoked_at=now() WHERE member_id=NEW.id AND revoked_at IS NULL;
  UPDATE public.reward_member_sessions SET revoked_at=now() WHERE member_id=NEW.id AND revoked_at IS NULL;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER reward_member_change BEFORE UPDATE ON public.members FOR EACH ROW EXECUTE FUNCTION gdg_security.reward_merge_guard();
CREATE FUNCTION public.reward_admin_mutate(p_actor uuid,p_session uuid,p_action text,p_document jsonb,p_key_hash text,p_request_hash text,p_request uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE d jsonb:=p_document;r jsonb;receipt public.reward_receipts;mid uuid;rid uuid;entry public.reward_ledger;activity public.reward_activities;perk public.reward_perks;claim public.reward_claims;v_points integer;v_table text;v_count integer;
BEGIN
 PERFORM gdg_security.reward_admin(p_actor,p_session);
 IF p_action IS NULL OR p_action NOT IN('rule','activity','perk','credential','revoke','award','adjust','reverse','claim_status') OR d IS NULL OR jsonb_typeof(d)<>'object' OR p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$' OR p_request_hash IS NULL OR p_request_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('rewards-admin:'||p_actor||':'||p_key_hash,0));
 SELECT * INTO receipt FROM public.reward_receipts WHERE actor=p_actor::text AND key_hash=p_key_hash;
 IF FOUND THEN IF receipt.request_hash<>p_request_hash THEN RAISE EXCEPTION 'CONFLICT';END IF;RETURN receipt.result;END IF;
 rid:=(d->>'id')::uuid;mid:=(d->>'memberId')::uuid;
 IF mid IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended('reward-member:'||mid,0));PERFORM gdg_security.reward_active_member(mid);END IF;
 IF p_action='rule' THEN
  IF rid IS NULL THEN IF(SELECT count(*) FROM public.reward_rules)>=200 THEN RAISE EXCEPTION 'INVENTORY_LIMIT';END IF;
   INSERT INTO public.reward_rules(title,points,is_active) VALUES(d->>'title',(d->>'points')::integer,(d->>'active')::boolean) RETURNING to_jsonb(reward_rules) INTO r;
  ELSE UPDATE public.reward_rules SET title=d->>'title',points=(d->>'points')::integer,is_active=(d->>'active')::boolean,revision=revision+1 WHERE id=rid AND revision=(d->>'revision')::integer RETURNING to_jsonb(reward_rules) INTO r;END IF;
 ELSIF p_action='activity' THEN
  IF rid IS NULL THEN
   SELECT * INTO activity FROM public.reward_activities WHERE false;
   SELECT points INTO v_points FROM public.reward_rules WHERE id=(d->>'ruleId')::uuid AND is_active FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
   IF(SELECT count(*) FROM public.reward_activities WHERE is_active)>=200 THEN RAISE EXCEPTION 'INVENTORY_LIMIT';END IF;
   INSERT INTO public.reward_activities(rule_id,title,points,opens_at,closes_at) VALUES((d->>'ruleId')::uuid,d->>'title',v_points,(d->>'opensAt')::timestamptz,(d->>'closesAt')::timestamptz) RETURNING to_jsonb(reward_activities) INTO r;
  ELSE UPDATE public.reward_activities SET is_active=(d->>'active')::boolean,revision=revision+1 WHERE id=rid AND revision=(d->>'revision')::integer RETURNING to_jsonb(reward_activities) INTO r;END IF;
 ELSIF p_action='perk' THEN
  IF rid IS NULL THEN IF(SELECT count(*) FROM public.reward_perks)>=200 THEN RAISE EXCEPTION 'INVENTORY_LIMIT';END IF;
   INSERT INTO public.reward_perks(title,description,threshold,inventory,is_active) VALUES(d->>'title',d->>'description',(d->>'threshold')::integer,(d->>'inventory')::integer,(d->>'active')::boolean) RETURNING to_jsonb(reward_perks) INTO r;
  ELSE
   PERFORM 1 FROM public.reward_perks WHERE id=rid FOR UPDATE;
   IF (d->>'inventory') IS NOT NULL AND (d->>'inventory')::integer<(SELECT count(*) FROM public.reward_claims WHERE perk_id=rid AND status IN('pending','approved','fulfilled')) THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
   UPDATE public.reward_perks SET title=d->>'title',description=d->>'description',threshold=(d->>'threshold')::integer,inventory=(d->>'inventory')::integer,is_active=(d->>'active')::boolean,revision=revision+1 WHERE id=rid AND revision=(d->>'revision')::integer RETURNING to_jsonb(reward_perks) INTO r;END IF;
 ELSIF p_action='credential' THEN
  IF mid IS NULL THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
  INSERT INTO public.reward_profiles(member_id) VALUES(mid) ON CONFLICT DO NOTHING;
  IF(SELECT count(*) FROM public.reward_credentials WHERE member_id=mid AND revoked_at IS NULL)>=5 THEN RAISE EXCEPTION 'INVENTORY_LIMIT';END IF;
  INSERT INTO public.reward_credentials(member_id,kind,label,token_hash,encrypted_token) VALUES(mid,d->>'kind',d->>'label',d->>'tokenHash',d->>'encryptedToken') RETURNING jsonb_build_object('id',id,'member_id',member_id,'encryptedToken',encrypted_token) INTO r;
 ELSIF p_action='revoke' THEN
  UPDATE public.reward_credentials SET revoked_at=coalesce(revoked_at,now()) WHERE id=rid RETURNING jsonb_build_object('id',id,'revoked',true) INTO r;
 ELSIF p_action IN('award','adjust','reverse') THEN
  IF p_action='reverse' THEN SELECT * INTO entry FROM public.reward_ledger WHERE id=rid FOR SHARE;IF NOT FOUND OR entry.reversal_of IS NOT NULL THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
   mid:=entry.member_id;PERFORM pg_advisory_xact_lock(hashtextextended('reward-member:'||mid,0));PERFORM gdg_security.reward_active_member(mid);v_points:=-entry.points;
  ELSIF p_action='award' THEN
   IF d ? 'credentialId' THEN PERFORM 1 FROM public.reward_credentials WHERE id=(d->>'credentialId')::uuid AND member_id=mid AND revoked_at IS NULL FOR SHARE;IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;END IF;
   SELECT * INTO activity FROM public.reward_activities WHERE id=(d->>'activityId')::uuid AND is_active AND now()>=opens_at AND now()<=closes_at FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_STATE';END IF;v_points:=activity.points;
  ELSE v_points:=(d->>'points')::integer;END IF;
  IF mid IS NULL OR v_points IS NULL OR v_points=0 OR gdg_security.reward_balance(mid)+v_points<0 THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  INSERT INTO public.reward_profiles(member_id) VALUES(mid) ON CONFLICT DO NOTHING;
  INSERT INTO public.reward_ledger(member_id,activity_id,points,reason,actor_id,reversal_of) VALUES(mid,CASE WHEN p_action='award' THEN activity.id END,v_points,CASE WHEN p_action='award' THEN activity.title ELSE d->>'reason' END,p_actor,CASE WHEN p_action='reverse' THEN entry.id END) RETURNING jsonb_build_object('id',id,'memberId',member_id,'points',points) INTO r;
 ELSIF p_action='claim_status' THEN
  SELECT * INTO claim FROM public.reward_claims WHERE id=rid;IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('reward-member:'||claim.member_id,0));
  PERFORM 1 FROM public.reward_perks WHERE id=claim.perk_id FOR UPDATE;
  SELECT * INTO claim FROM public.reward_claims WHERE id=rid FOR UPDATE;
  IF claim.revision<>(d->>'revision')::integer THEN RAISE EXCEPTION 'CONFLICT';END IF;
  IF NOT((claim.status='pending' AND d->>'status' IN('approved','rejected')) OR(claim.status='approved' AND d->>'status' IN('fulfilled','rejected'))) THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  IF d->>'status' IN('approved','fulfilled') THEN PERFORM gdg_security.reward_active_member(claim.member_id);SELECT * INTO perk FROM public.reward_perks WHERE id=claim.perk_id;IF NOT perk.is_active OR gdg_security.reward_balance(claim.member_id)<perk.threshold THEN RAISE EXCEPTION 'INVALID_STATE';END IF;END IF;
  UPDATE public.reward_claims SET status=d->>'status',revision=revision+1,updated_at=now() WHERE id=rid RETURNING to_jsonb(reward_claims) INTO r;
 END IF;
 IF r IS NULL THEN RAISE EXCEPTION 'CONFLICT';END IF;
 INSERT INTO public.reward_receipts(actor,key_hash,request_hash,result) VALUES(p_actor::text,p_key_hash,p_request_hash,r);
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata) VALUES(p_actor,'rewards.'||p_action,'rewards',(r->>'id')::uuid,p_request,jsonb_build_object('memberId',mid));
 RETURN r;
END $$;
CREATE FUNCTION public.reward_admin_read(p_actor uuid,p_session uuid,p_query text,p_page integer,p_member uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN
 PERFORM gdg_security.reward_admin(p_actor,p_session);
 IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 10000 OR length(coalesce(p_query,''))>100 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 RETURN jsonb_build_object(
 'selectedMember',(SELECT jsonb_build_object('id',m.id,'name',m.name,'email',m.email,'points',gdg_security.reward_balance(m.id)) FROM public.members m WHERE m.id=p_member AND m.is_active AND m.deleted_at IS NULL AND m.merged_into_id IS NULL),
 'members',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM(SELECT m.id,m.name,m.email,gdg_security.reward_balance(m.id) AS points,p.alias,p.is_public FROM public.members m LEFT JOIN public.reward_profiles p ON p.member_id=m.id WHERE m.is_active AND m.deleted_at IS NULL AND m.merged_into_id IS NULL AND(coalesce(p_query,'')='' OR position(lower(p_query) in lower(m.name||' '||m.email))>0) ORDER BY m.name,m.id LIMIT 25 OFFSET(p_page-1)*25)x),
 'total',(SELECT count(*) FROM public.members m WHERE m.is_active AND m.deleted_at IS NULL AND m.merged_into_id IS NULL AND(coalesce(p_query,'')='' OR position(lower(p_query) in lower(m.name||' '||m.email))>0)),
 'rules',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM(SELECT * FROM public.reward_rules ORDER BY created_at,id)x),
 'activities',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM(SELECT * FROM public.reward_activities WHERE is_active ORDER BY opens_at DESC,id LIMIT 200)x),
 'perks',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM(SELECT * FROM public.reward_perks ORDER BY threshold,id)x),
 'credentials',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM(SELECT id,member_id,kind,label,created_at,revoked_at FROM public.reward_credentials WHERE member_id=p_member ORDER BY created_at DESC LIMIT 100)x),
 'ledger',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM(SELECT id,member_id,activity_id,points,reason,reversal_of,created_at FROM public.reward_ledger WHERE member_id=p_member ORDER BY created_at DESC,id LIMIT 100)x),
 'claims',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM(SELECT c.*,p.title,m.name FROM public.reward_claims c JOIN public.reward_perks p ON p.id=c.perk_id JOIN public.members m ON m.id=c.member_id WHERE c.status IN('pending','approved') ORDER BY c.created_at,c.id LIMIT 100)x));
END $$;
CREATE FUNCTION public.reward_resolve(p_actor uuid,p_session uuid,p_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ DECLARE r jsonb;BEGIN
 PERFORM gdg_security.reward_admin(p_actor,p_session);
 SELECT jsonb_build_object('id',m.id,'name',m.name,'email',m.email,'points',gdg_security.reward_balance(m.id),'credentialId',c.id,'label',c.label) INTO r FROM public.reward_credentials c JOIN public.members m ON m.id=c.member_id WHERE c.token_hash=p_hash AND c.revoked_at IS NULL AND m.is_active AND m.deleted_at IS NULL AND m.merged_into_id IS NULL;
 IF r IS NULL THEN RAISE EXCEPTION 'NOT_FOUND';END IF;RETURN r;
END $$;
CREATE FUNCTION public.reward_public_board(p_page integer) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN
 IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 RETURN jsonb_build_object('items',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM(SELECT p.alias,gdg_security.reward_balance(p.member_id) AS points,rank() OVER(ORDER BY gdg_security.reward_balance(p.member_id) DESC) AS rank FROM public.reward_profiles p JOIN public.members m ON m.id=p.member_id WHERE p.is_public AND m.is_active AND m.deleted_at IS NULL AND m.merged_into_id IS NULL ORDER BY points DESC,lower(p.alias) LIMIT 25 OFFSET(p_page-1)*25)x),'total',(SELECT count(*) FROM public.reward_profiles p JOIN public.members m ON m.id=p.member_id WHERE p.is_public AND m.is_active AND m.deleted_at IS NULL AND m.merged_into_id IS NULL),'perks',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'description',description,'threshold',threshold) ORDER BY threshold,id),'[]') FROM public.reward_perks WHERE is_active));
END $$;
CREATE FUNCTION public.reward_open_session(p_email text,p_subject text,p_token text,p_csrf text) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ DECLARE mid uuid;linked text;sid uuid;BEGIN
 SELECT id INTO mid FROM public.members WHERE lower(btrim(email))=lower(btrim(p_email)) AND is_active AND deleted_at IS NULL AND merged_into_id IS NULL FOR SHARE;
 IF mid IS NULL OR p_subject IS NULL OR length(p_subject) NOT BETWEEN 1 AND 500 OR p_token!~'^[a-f0-9]{64}$' OR p_csrf!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';END IF;
 INSERT INTO public.reward_profiles(member_id,provider_subject) VALUES(mid,p_subject) ON CONFLICT(member_id) DO NOTHING;
 SELECT provider_subject INTO linked FROM public.reward_profiles WHERE member_id=mid FOR UPDATE;
 IF linked IS NULL THEN UPDATE public.reward_profiles SET provider_subject=p_subject WHERE member_id=mid;ELSIF linked<>p_subject THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';END IF;
 INSERT INTO public.reward_member_sessions(member_id,email,subject,token_hash,csrf_hash) VALUES(mid,lower(btrim(p_email)),p_subject,p_token,p_csrf) RETURNING id INTO sid;RETURN sid;
END $$;
CREATE FUNCTION public.reward_member_read(p_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ DECLARE s public.reward_member_sessions;r jsonb;BEGIN
 SELECT * INTO s FROM public.reward_member_sessions WHERE token_hash=p_hash AND revoked_at IS NULL AND expires_at>now();IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';END IF;
 PERFORM gdg_security.reward_active_member(s.member_id);
 IF NOT EXISTS(SELECT 1 FROM public.members WHERE id=s.member_id AND lower(btrim(email))=s.email) OR NOT EXISTS(SELECT 1 FROM public.reward_profiles WHERE member_id=s.member_id AND provider_subject=s.subject) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';END IF;
 SELECT jsonb_build_object('id',m.id,'name',m.name,'points',gdg_security.reward_balance(m.id),'alias',p.alias,'isPublic',p.is_public,'sessionId',s.id,'csrfHash',s.csrf_hash,'ledger',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM(SELECT id,points,reason,created_at FROM public.reward_ledger WHERE member_id=m.id ORDER BY created_at DESC,id LIMIT 100)x),'claims',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'perkId',c.perk_id,'status',c.status,'title',p.title)),'[]') FROM public.reward_claims c JOIN public.reward_perks p ON p.id=c.perk_id WHERE c.member_id=m.id)) INTO r FROM public.members m JOIN public.reward_profiles p ON p.member_id=m.id WHERE m.id=s.member_id;
 RETURN r;
END $$;
CREATE FUNCTION public.reward_member_mutate(p_hash text,p_csrf text,p_action text,p_document jsonb,p_key_hash text,p_request_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ DECLARE m jsonb;mid uuid;r jsonb;old public.reward_receipts;p public.reward_perks;BEGIN
 m:=public.reward_member_read(p_hash);mid:=(m->>'id')::uuid;
 IF m->>'csrfHash' IS DISTINCT FROM p_csrf OR p_csrf IS NULL OR p_action IS NULL OR p_action NOT IN('profile','claim','cancel') OR p_document IS NULL OR jsonb_typeof(p_document)<>'object' OR p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$' OR p_request_hash IS NULL OR p_request_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('reward-member:'||mid,0));
 SELECT * INTO old FROM public.reward_receipts WHERE actor='member:'||mid AND key_hash=p_key_hash;
 IF FOUND THEN IF old.request_hash<>p_request_hash THEN RAISE EXCEPTION 'CONFLICT';END IF;RETURN old.result;END IF;
 IF p_action='profile' THEN
  UPDATE public.reward_profiles SET alias=nullif(btrim(p_document->>'alias'),''),is_public=(p_document->>'public')::boolean WHERE member_id=mid RETURNING jsonb_build_object('alias',alias,'isPublic',is_public) INTO r;
 ELSIF p_action='claim' THEN
  SELECT * INTO p FROM public.reward_perks WHERE id=(p_document->>'perkId')::uuid AND is_active FOR UPDATE;
  IF NOT FOUND OR gdg_security.reward_balance(mid)<p.threshold OR(p.inventory IS NOT NULL AND(SELECT count(*) FROM public.reward_claims WHERE perk_id=p.id AND status IN('pending','approved','fulfilled'))>=p.inventory) THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  INSERT INTO public.reward_claims(member_id,perk_id) VALUES(mid,p.id) RETURNING jsonb_build_object('id',id,'status',status) INTO r;
 ELSE
  PERFORM 1 FROM public.reward_perks WHERE id=(SELECT perk_id FROM public.reward_claims WHERE id=(p_document->>'id')::uuid AND member_id=mid) FOR UPDATE;
  UPDATE public.reward_claims SET status='cancelled',revision=revision+1,updated_at=now() WHERE id=(p_document->>'id')::uuid AND member_id=mid AND status='pending' RETURNING jsonb_build_object('id',id,'status',status) INTO r;
 END IF;
 IF r IS NULL THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
 INSERT INTO public.reward_receipts(actor,key_hash,request_hash,result) VALUES('member:'||mid,p_key_hash,p_request_hash,r);RETURN r;
END $$;
CREATE FUNCTION public.reward_consume_flow(p_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ DECLARE r jsonb;BEGIN
 UPDATE public.reward_auth_flows SET consumed_at=now() WHERE token_hash=p_hash AND consumed_at IS NULL AND expires_at>now() RETURNING jsonb_build_object('encryptedVerifier',encrypted_verifier,'origin',origin) INTO r;RETURN r;
END $$;
DO $$ DECLARE f record;BEGIN FOR f IN SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE(n.nspname='public' AND p.proname LIKE 'reward_%') OR(n.nspname='gdg_security' AND p.proname LIKE 'reward_%') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC,anon,authenticated,gdg_realtime',f.nspname,f.proname,f.args);
 EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO service_role',f.nspname,f.proname,f.args);
END LOOP;END $$;
COMMIT;
