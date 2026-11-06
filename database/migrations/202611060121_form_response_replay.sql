BEGIN;
-- Irreversible response actions bind the reviewed respondent-edit revision and
-- privacy state. Receipts contain references only, never identity or answers.
CREATE FUNCTION public.inspect_form_response_write(p_actor uuid,p_session uuid,p_form uuid,p_response uuid,p_action text,p_key_hash text,p_request_hash text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE r public.form_responses;k public.idempotency_keys;metadata jsonb;BEGIN
 IF p_action IS NULL OR p_action NOT IN('delete','redact') OR p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$'
  OR(p_request_hash IS NOT NULL AND p_request_hash!~'^[a-f0-9]{64}$') THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 IF NOT gdg_security.member_transfer_session(p_actor,p_session)
  OR NOT EXISTS(SELECT 1 FROM public.forms WHERE id=p_form AND permanently_deleted_at IS NULL)
  OR NOT public.can_operate_form(p_actor,p_form,'view') OR NOT public.can_operate_form(p_actor,p_form,'view_responses')
  OR NOT public.can_operate_form(p_actor,p_form,'delete') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT * INTO r FROM public.form_responses WHERE id=p_response AND form_id=p_form;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 metadata:=jsonb_build_object('id',r.id,'revision',r.revision,'status',r.status,'redacted',r.redacted_at IS NOT NULL,'deleted',r.deleted_at IS NOT NULL);
 SELECT * INTO k FROM public.idempotency_keys WHERE scope='form-response-write:'||p_actor||':'||p_session AND key_hash=p_key_hash;
 IF FOUND THEN
  IF k.result->>'formId' IS DISTINCT FROM p_form::text OR k.result->>'id' IS DISTINCT FROM p_response::text
   OR k.result->>'action' IS DISTINCT FROM p_action OR(p_request_hash IS NOT NULL AND k.request_hash IS DISTINCT FROM p_request_hash) THEN RAISE EXCEPTION 'CONFLICT';END IF;
  IF k.expires_at<=now() THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  RETURN jsonb_build_object('committed',true,'receipt',k.result,'response',metadata,'canRetry',false);
 END IF;
 IF r.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 RETURN jsonb_build_object('committed',false,'response',metadata,'held',gdg_security.form_held(p_form,p_response) OR r.status='held',
  'canRetry',NOT gdg_security.form_held(p_form,p_response) AND r.status<>'held' AND(p_action<>'redact' OR r.redacted_at IS NULL));
END $$;
CREATE FUNCTION public.mutate_form_response_write(p_actor uuid,p_session uuid,p_form uuid,p_response uuid,p_action text,p_document jsonb,p_key_hash text,p_request_hash text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r public.form_responses;inspected jsonb;BEGIN
 IF p_document IS NULL OR jsonb_typeof(p_document)<>'object' OR p_request_hash IS NULL
  OR jsonb_typeof(p_document->'revision') IS DISTINCT FROM 'number' OR(p_document->>'revision')::numeric<0
  OR(p_document->>'revision')::numeric<>trunc((p_document->>'revision')::numeric)
  OR p_document->>'status' IS NULL OR p_document->>'status' NOT IN('complete','redacted','held')
  OR jsonb_typeof(p_document->'redacted') IS DISTINCT FROM 'boolean'
  OR p_document->>'confirmation' IS DISTINCT FROM upper(p_action) THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('private-media',0));
 PERFORM 1 FROM public.admin_users WHERE id=p_actor FOR UPDATE;
 PERFORM 1 FROM public.admin_sessions WHERE id=p_session AND admin_user_id=p_actor FOR UPDATE;
 PERFORM 1 FROM public.forms WHERE id=p_form FOR UPDATE;
 SELECT * INTO r FROM public.form_responses WHERE id=p_response AND form_id=p_form FOR UPDATE;
 inspected:=public.inspect_form_response_write(p_actor,p_session,p_form,p_response,p_action,p_key_hash,p_request_hash);
 IF(inspected->>'committed')::boolean THEN RETURN inspected;END IF;
 IF r.revision IS DISTINCT FROM(p_document->>'revision')::integer OR r.status IS DISTINCT FROM p_document->>'status'
  OR(r.redacted_at IS NOT NULL) IS DISTINCT FROM(p_document->>'redacted')::boolean THEN RAISE EXCEPTION 'CONFLICT';END IF;
 IF(inspected->>'held')::boolean THEN RAISE EXCEPTION 'RETENTION_HOLD';END IF;
 IF NOT(inspected->>'canRetry')::boolean THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
 PERFORM public.mutate_form_response(p_actor,p_form,p_response,p_action,p_request_id);
 INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result)
 VALUES('form-response-write:'||p_actor||':'||p_session,p_key_hash,p_request_hash,200,jsonb_build_object('id',p_response,'formId',p_form,'action',p_action));
 SELECT * INTO r FROM public.form_responses WHERE id=p_response AND form_id=p_form;
 RETURN jsonb_build_object('committed',true,'receipt',jsonb_build_object('id',p_response,'formId',p_form,'action',p_action),
  'response',jsonb_build_object('id',r.id,'revision',r.revision,'status',r.status,'redacted',r.redacted_at IS NOT NULL,'deleted',r.deleted_at IS NOT NULL),'canRetry',false);
END $$;
REVOKE ALL ON FUNCTION public.inspect_form_response_write(uuid,uuid,uuid,uuid,text,text,text),
 public.mutate_form_response_write(uuid,uuid,uuid,uuid,text,jsonb,text,text,uuid) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.inspect_form_response_write(uuid,uuid,uuid,uuid,text,text,text),
 public.mutate_form_response_write(uuid,uuid,uuid,uuid,text,jsonb,text,text,uuid) TO service_role;
COMMIT;
