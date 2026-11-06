BEGIN;
CREATE FUNCTION public.inspect_contact_write(p_actor uuid,p_session uuid,p_id uuid,p_revision integer,p_action text,p_document jsonb,p_key_hash text,p_request_hash text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE c public.contact_submissions;k public.idempotency_keys;BEGIN
 IF NOT gdg_security.member_transfer_session(p_actor,p_session) OR NOT public.can_access_contact(p_actor) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT * INTO c FROM public.contact_submissions WHERE id=p_id AND redacted_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_action IS NULL OR p_action NOT IN('status','hold') OR p_revision IS NULL OR p_revision<1 OR p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$' OR p_request_hash IS NULL OR p_request_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 SELECT * INTO k FROM public.idempotency_keys WHERE scope='contact-write:'||p_actor||':'||p_session||':'||p_id AND key_hash=p_key_hash;
 IF FOUND THEN
  IF k.request_hash IS DISTINCT FROM p_request_hash OR k.result->>'action' IS DISTINCT FROM p_action THEN RAISE EXCEPTION 'CONFLICT';END IF;
  IF k.expires_at<=now() THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
 END IF;
 RETURN jsonb_build_object('committed',k.key_hash IS NOT NULL,'canRetry',k.key_hash IS NULL AND c.revision=p_revision,'currentRevision',c.revision,'receipt',CASE WHEN k.key_hash IS NULL THEN NULL ELSE k.result END);
END $$;
CREATE FUNCTION public.mutate_contact_write(p_actor uuid,p_session uuid,p_id uuid,p_revision integer,p_action text,p_document jsonb,p_verified_hash text,p_key_hash text,p_request_hash text,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE inspected jsonb;result jsonb;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('contact-uploads',0));
 PERFORM 1 FROM public.admin_users WHERE id=p_actor FOR UPDATE;PERFORM 1 FROM public.admin_sessions WHERE id=p_session AND admin_user_id=p_actor FOR UPDATE;
 PERFORM 1 FROM public.contact_submissions WHERE id=p_id FOR UPDATE;
 inspected:=public.inspect_contact_write(p_actor,p_session,p_id,p_revision,p_action,p_document,p_key_hash,p_request_hash);
 IF(inspected->>'committed')::boolean THEN RETURN inspected->'receipt';END IF;
 IF NOT(inspected->>'canRetry')::boolean THEN RAISE EXCEPTION 'CONFLICT';END IF;
 result:=public.mutate_contact_record(p_actor,p_session,p_id,p_revision,p_action,p_document,p_verified_hash,p_request_id);
 result:=jsonb_build_object('id',result->'id','revision',result->'revision','action',p_action);
 INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result)VALUES('contact-write:'||p_actor||':'||p_session||':'||p_id,p_key_hash,p_request_hash,200,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.inspect_contact_write(uuid,uuid,uuid,integer,text,jsonb,text,text),public.mutate_contact_write(uuid,uuid,uuid,integer,text,jsonb,text,text,text,uuid) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.inspect_contact_write(uuid,uuid,uuid,integer,text,jsonb,text,text),public.mutate_contact_write(uuid,uuid,uuid,integer,text,jsonb,text,text,text,uuid) TO service_role;
COMMIT;
