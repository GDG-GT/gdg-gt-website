BEGIN;
-- Hold/release receipts expose references and revisions only. Outcome checks
-- do not need a password; any explicit unaccepted retry still needs fresh proof.
CREATE FUNCTION public.inspect_form_privacy_write(p_actor uuid,p_session uuid,p_form uuid,p_response uuid,p_key_hash text,p_request_hash text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE k public.idempotency_keys;v_scope text;rev integer;held boolean;exists_now boolean;can_release boolean;BEGIN
 IF p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$' OR(p_request_hash IS NOT NULL AND p_request_hash!~'^[a-f0-9]{64}$') THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 IF NOT gdg_security.member_transfer_session(p_actor,p_session) OR NOT gdg_security.form_privacy_access(p_actor,p_session,p_form)
  OR NOT EXISTS(SELECT 1 FROM public.forms WHERE id=p_form AND permanently_deleted_at IS NULL) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 v_scope:='forms.privacy:'||p_actor||':'||p_session||':'||p_form||':'||coalesce(p_response::text,'form');
 SELECT * INTO k FROM public.idempotency_keys WHERE idempotency_keys.scope=v_scope AND key_hash=p_key_hash;
 IF FOUND THEN
  IF p_request_hash IS NOT NULL AND k.request_hash IS DISTINCT FROM p_request_hash THEN RAISE EXCEPTION 'CONFLICT';END IF;
  IF k.expires_at<=now() OR jsonb_typeof(k.result->'revision') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
 END IF;
 can_release:=EXISTS(SELECT 1 FROM public.admin_users WHERE id=p_actor AND role IN('admin','super_admin'));
 exists_now:=p_response IS NULL OR EXISTS(SELECT 1 FROM public.form_responses WHERE id=p_response AND form_id=p_form AND deleted_at IS NULL);
 IF p_response IS NULL THEN
  SELECT coalesce((SELECT revision FROM public.form_privacy_policies WHERE form_id=p_form),0),gdg_security.form_held(p_form) INTO rev,held;
 ELSE
  SELECT coalesce((SELECT revision FROM public.form_response_holds WHERE response_id=p_response AND form_id=p_form),0),coalesce((SELECT h.held FROM public.form_response_holds h WHERE response_id=p_response AND form_id=p_form),false) INTO rev,held;
 END IF;
 IF k.key_hash IS NULL AND NOT exists_now THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 RETURN jsonb_build_object('committed',k.key_hash IS NOT NULL,'canRetry',k.key_hash IS NULL AND exists_now,
  'formId',p_form,'responseId',p_response,'currentRevision',rev,'held',held,'canRelease',can_release,'targetExists',exists_now,
  'receipt',CASE WHEN k.key_hash IS NULL THEN NULL ELSE jsonb_build_object('formId',p_form,'responseId',p_response,'revision',k.result->'revision') END);
END $$;
ALTER FUNCTION public.review_form_privacy(uuid,uuid,text,uuid,uuid,integer,jsonb,text,text,uuid) RENAME TO review_form_privacy_before_replay;
CREATE FUNCTION public.review_form_privacy(p_actor uuid,p_session uuid,p_verified_hash text,p_form uuid,p_response uuid,p_revision integer,p_document jsonb,p_key_hash text,p_request_hash text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));
 PERFORM 1 FROM public.admin_users WHERE id=p_actor FOR UPDATE;
 PERFORM 1 FROM public.admin_sessions WHERE id=p_session AND admin_user_id=p_actor FOR UPDATE;
 PERFORM 1 FROM public.forms WHERE id=p_form FOR UPDATE;
 PERFORM public.inspect_form_privacy_write(p_actor,p_session,p_form,p_response,p_key_hash,p_request_hash);
 RETURN public.review_form_privacy_before_replay(p_actor,p_session,p_verified_hash,p_form,p_response,p_revision,p_document,p_key_hash,p_request_hash,p_request_id);
END $$;
REVOKE ALL ON FUNCTION public.inspect_form_privacy_write(uuid,uuid,uuid,uuid,text,text),
 public.review_form_privacy(uuid,uuid,text,uuid,uuid,integer,jsonb,text,text,uuid),
 public.review_form_privacy_before_replay(uuid,uuid,text,uuid,uuid,integer,jsonb,text,text,uuid) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.inspect_form_privacy_write(uuid,uuid,uuid,uuid,text,text),
 public.review_form_privacy(uuid,uuid,text,uuid,uuid,integer,jsonb,text,text,uuid),
 public.review_form_privacy_before_replay(uuid,uuid,text,uuid,uuid,integer,jsonb,text,text,uuid) TO service_role;
COMMIT;
