BEGIN;
-- All newsletter mutations use the same lock order, including public tokens.
CREATE OR REPLACE FUNCTION public.subscribe_newsletter(p_email text,p_name text,p_key_hash text,p_request_hash text,p_token_hash text,p_secret_payload text) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v public.newsletter_subscribers;k public.idempotency_keys;t uuid;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('newsletter-workspace',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('newsletter:'||p_email,0));
 SELECT * INTO k FROM public.idempotency_keys WHERE scope='newsletter.subscribe' AND key_hash=p_key_hash FOR UPDATE;
 IF FOUND THEN IF k.request_hash<>p_request_hash THEN RAISE EXCEPTION 'INVALID_STATE';END IF;RETURN;END IF;
 SELECT * INTO v FROM public.newsletter_subscribers WHERE email=p_email FOR UPDATE;
 IF NOT FOUND THEN INSERT INTO public.newsletter_subscribers(email,name,is_active,state,consent_at) VALUES(p_email,p_name,false,'pending',now()) RETURNING * INTO v;END IF;
 IF v.state<>'active' AND v.deleted_at IS NULL AND v.suppressed_at IS NULL
  AND(v.team_id IS NULL OR EXISTS(SELECT 1 FROM public.admin_teams WHERE id=v.team_id AND is_active AND deleted_at IS NULL))
  AND NOT EXISTS(SELECT 1 FROM public.newsletter_tokens WHERE subscriber_id=v.id AND purpose='confirm' AND consumed_at IS NULL AND created_at>now()-interval '15 minutes') THEN
  UPDATE public.newsletter_subscribers SET state='pending',is_active=false,consent_at=now(),updated_at=now() WHERE id=v.id;
  UPDATE public.newsletter_tokens SET consumed_at=now() WHERE subscriber_id=v.id AND purpose='confirm' AND consumed_at IS NULL;
  INSERT INTO public.newsletter_tokens(subscriber_id,purpose,token_hash,expires_at) VALUES(v.id,'confirm',p_token_hash,now()+interval '24 hours') RETURNING id INTO t;
  INSERT INTO public.delivery_jobs(kind,deduplication_key,payload,secret_payload) VALUES('newsletter_confirmation','newsletter-confirm:'||t,jsonb_build_object('subscriberId',v.id,'tokenId',t),p_secret_payload);
 END IF;
 INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status) VALUES('newsletter.subscribe',p_key_hash,p_request_hash,200);
END $$;
CREATE OR REPLACE FUNCTION public.consume_newsletter_token(p_hash text,p_purpose text) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE t public.newsletter_tokens;s public.newsletter_subscribers;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('newsletter-workspace',0));
 IF p_purpose IS NULL OR p_purpose NOT IN('confirm','unsubscribe') THEN RETURN false;END IF;
 SELECT * INTO t FROM public.newsletter_tokens WHERE token_hash=p_hash AND purpose=p_purpose FOR UPDATE;
 IF NOT FOUND OR t.expires_at<=now() THEN RETURN false;END IF;
 SELECT * INTO s FROM public.newsletter_subscribers WHERE id=t.subscriber_id FOR UPDATE;
 IF NOT FOUND THEN RETURN false;END IF;
 IF t.consumed_at IS NOT NULL THEN RETURN p_purpose='unsubscribe' AND s.state='unsubscribed';END IF;
 IF p_purpose='confirm' AND(s.state<>'pending' OR s.deleted_at IS NOT NULL OR s.suppressed_at IS NOT NULL OR(s.team_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.admin_teams WHERE id=s.team_id AND is_active AND deleted_at IS NULL))) THEN RETURN false;END IF;
 UPDATE public.newsletter_tokens SET consumed_at=now() WHERE id=t.id;
 IF p_purpose='confirm' THEN UPDATE public.newsletter_subscribers SET state='active',is_active=true,confirmed_at=now(),updated_at=now() WHERE id=s.id;
 ELSE
  UPDATE public.newsletter_subscribers SET state='unsubscribed',is_active=false,unsubscribed_at=now(),updated_at=now() WHERE id=s.id;
  UPDATE public.newsletter_tokens SET consumed_at=now() WHERE subscriber_id=s.id AND consumed_at IS NULL;
 END IF;RETURN true;
END $$;
CREATE FUNCTION public.bulk_newsletter_subscribers(p_actor uuid,p_session uuid,p_verified_hash text,p_action text,p_records jsonb,p_confirmation text,p_key_hash text,p_request_hash text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE k public.idempotency_keys;bulk_scope text;r jsonb;s public.newsletter_subscribers;result jsonb;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('newsletter-workspace',0));
 IF NOT gdg_security.member_transfer_session(p_actor,p_session) OR NOT EXISTS(SELECT 1 FROM public.admin_users WHERE id=p_actor AND password_hash=p_verified_hash) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_action IS NULL OR p_action NOT IN('deactivate','archive','restore') OR jsonb_typeof(p_records) IS DISTINCT FROM 'array' OR jsonb_array_length(p_records) NOT BETWEEN 1 AND 50
  OR p_confirmation IS DISTINCT FROM upper(p_action)||' '||jsonb_array_length(p_records) OR p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$' OR p_request_hash IS NULL OR p_request_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 IF(SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(p_records))<>jsonb_array_length(p_records) THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 -- Reauthorize before returning any idempotent success after a grant change.
 FOR r IN SELECT value FROM jsonb_array_elements(p_records) LOOP
  SELECT * INTO s FROM public.newsletter_subscribers WHERE id=(r->>'id')::uuid FOR UPDATE;
  IF NOT FOUND OR NOT public.can_operate_newsletter(p_actor,s.team_id,'read') OR NOT public.can_operate_newsletter(p_actor,s.team_id,'delete') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 END LOOP;
 bulk_scope:='newsletter.bulk:'||p_actor||':'||p_session;
 SELECT * INTO k FROM public.idempotency_keys WHERE scope=bulk_scope AND key_hash=p_key_hash;
 IF FOUND THEN IF k.request_hash IS DISTINCT FROM p_request_hash THEN RAISE EXCEPTION 'CONFLICT';END IF;RETURN k.result;END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(p_records) LOOP
  PERFORM public.mutate_newsletter_record(p_actor,p_session,'subscribers',(r->>'id')::uuid,p_action,(r->>'revision')::integer,'{}',encode(sha256((p_key_hash||(r->>'id'))::bytea),'hex'),p_request_hash,p_request_id);
 END LOOP;
 result:=jsonb_build_object('count',jsonb_array_length(p_records),'action',p_action);
 INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result) VALUES(bulk_scope,p_key_hash,p_request_hash,200,result);
 INSERT INTO public.admin_actions(actor_id,action,target_type,request_id,metadata) VALUES(p_actor,'newsletter.subscribers_bulk_'||p_action,'newsletter_subscribers',p_request_id,jsonb_build_object('count',jsonb_array_length(p_records)));
 RETURN result;
END $$;
CREATE FUNCTION public.cleanup_newsletter_tokens() RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ DECLARE n integer;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('newsletter-workspace',0));
 DELETE FROM public.newsletter_tokens WHERE id IN(SELECT id FROM public.newsletter_tokens WHERE expires_at<now()-interval '24 hours' OR consumed_at<now()-interval '30 days' ORDER BY expires_at LIMIT 1000);GET DIAGNOSTICS n=ROW_COUNT;RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.bulk_newsletter_subscribers(uuid,uuid,text,text,jsonb,text,text,text,uuid),public.cleanup_newsletter_tokens() FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.bulk_newsletter_subscribers(uuid,uuid,text,text,jsonb,text,text,text,uuid),public.cleanup_newsletter_tokens() TO service_role;
COMMIT;
