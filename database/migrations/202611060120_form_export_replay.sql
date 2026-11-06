BEGIN;
-- Export receipts contain identifiers only. Every inspection rechecks the
-- current session, form and target's sensitive capability before projection.
CREATE FUNCTION public.inspect_form_export_write(p_actor uuid,p_session uuid,p_form uuid,p_action text,p_job uuid,p_sensitive boolean,p_key_hash text,p_request_hash text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE k public.idempotency_keys;j public.form_export_jobs;BEGIN
 IF p_action IS NULL OR p_action NOT IN('create','cancel') OR(p_action='create') IS DISTINCT FROM(p_job IS NULL)
  OR p_sensitive IS NULL OR p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$'
  OR(p_request_hash IS NOT NULL AND p_request_hash!~'^[a-f0-9]{64}$') THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 IF NOT gdg_security.form_export_access(p_actor,p_session,p_form,p_sensitive)
  OR NOT EXISTS(SELECT 1 FROM public.forms WHERE id=p_form AND permanently_deleted_at IS NULL) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT * INTO k FROM public.idempotency_keys WHERE scope='form-export-write:'||p_actor||':'||p_session AND key_hash=p_key_hash;
 IF FOUND THEN
  IF k.result->>'action' IS DISTINCT FROM p_action OR k.result->>'formId' IS DISTINCT FROM p_form::text
   OR k.result->>'sourceId' IS DISTINCT FROM p_job::text OR(p_request_hash IS NOT NULL AND k.request_hash IS DISTINCT FROM p_request_hash)
   THEN RAISE EXCEPTION 'CONFLICT';END IF;
  IF k.expires_at<=now() THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  SELECT * INTO j FROM public.form_export_jobs WHERE id=(k.result->>'id')::uuid AND form_id=p_form AND requester_id=p_actor AND session_id=p_session;
  IF NOT FOUND OR NOT gdg_security.form_export_access(p_actor,p_session,p_form,j.include_sensitive) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  IF p_action='create' AND j.include_sensitive IS DISTINCT FROM p_sensitive THEN RAISE EXCEPTION 'CONFLICT';END IF;
  RETURN jsonb_build_object('committed',true,'receipt',k.result,'job',to_jsonb(j),'canRetry',false);
 END IF;
 IF p_action='cancel' THEN
  SELECT * INTO j FROM public.form_export_jobs WHERE id=p_job AND form_id=p_form AND requester_id=p_actor AND session_id=p_session;
  IF NOT FOUND OR NOT gdg_security.form_export_access(p_actor,p_session,p_form,j.include_sensitive) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  RETURN jsonb_build_object('committed',false,'job',to_jsonb(j),'canRetry',j.state IN('pending','running','ready') AND j.expires_at>now());
 END IF;
 RETURN jsonb_build_object('committed',false,'job',NULL,'canRetry',true);
END $$;
CREATE FUNCTION public.mutate_form_export_write(p_actor uuid,p_session uuid,p_form uuid,p_action text,p_job uuid,p_document jsonb,p_document_hash text,p_key_hash text,p_request_hash text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE inspected jsonb;j public.form_export_jobs;created uuid;sensitive boolean;BEGIN
 IF p_document IS NULL OR jsonb_typeof(p_document)<>'object' OR p_request_hash IS NULL
  OR(p_action='create' AND(p_document_hash IS NULL OR p_document_hash!~'^[a-f0-9]{64}$')) THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 sensitive:=CASE WHEN p_action='create' THEN coalesce((p_document->>'sensitive')::boolean,false) ELSE false END;
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('form-export:'||p_actor,0));
 PERFORM 1 FROM public.admin_users WHERE id=p_actor FOR UPDATE;
 PERFORM 1 FROM public.admin_sessions WHERE id=p_session AND admin_user_id=p_actor FOR UPDATE;
 -- Cancellation follows worker promotion's job -> form lock order. Creation
 -- keeps the existing per-actor export lock before taking its form lock.
 IF p_action='cancel' THEN PERFORM 1 FROM public.form_export_jobs WHERE id=p_job FOR UPDATE;END IF;
 PERFORM 1 FROM public.forms WHERE id=p_form FOR UPDATE;
 inspected:=public.inspect_form_export_write(p_actor,p_session,p_form,p_action,p_job,sensitive,p_key_hash,p_request_hash);
 IF(inspected->>'committed')::boolean THEN RETURN inspected->'job';END IF;
 IF NOT(inspected->>'canRetry')::boolean THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
 IF p_action='create' THEN
  created:=public.create_form_export(p_actor,p_session,p_form,p_document,p_key_hash,p_document_hash,p_request_id);
 ELSE
  PERFORM public.cancel_form_export(p_actor,p_session,p_form,p_job,p_request_id);created:=p_job;
 END IF;
 SELECT * INTO j FROM public.form_export_jobs WHERE id=created AND form_id=p_form AND requester_id=p_actor AND session_id=p_session;
 IF NOT FOUND OR NOT gdg_security.form_export_access(p_actor,p_session,p_form,j.include_sensitive) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result)
 VALUES('form-export-write:'||p_actor||':'||p_session,p_key_hash,p_request_hash,200,jsonb_build_object('id',j.id,'formId',p_form,'sourceId',p_job,'action',p_action));
 RETURN to_jsonb(j);
END $$;
REVOKE ALL ON FUNCTION public.inspect_form_export_write(uuid,uuid,uuid,text,uuid,boolean,text,text),
 public.mutate_form_export_write(uuid,uuid,uuid,text,uuid,jsonb,text,text,text,uuid) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.inspect_form_export_write(uuid,uuid,uuid,text,uuid,boolean,text,text),
 public.mutate_form_export_write(uuid,uuid,uuid,text,uuid,jsonb,text,text,text,uuid) TO service_role;
COMMIT;
