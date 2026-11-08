-- User-approved Supabase Free ceiling. Historical migrations remain immutable.
BEGIN;
CREATE OR REPLACE FUNCTION gdg_security.media_mime_limit(p_mime text) RETURNS bigint LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN p_mime IN('image/png','image/jpeg','image/webp') THEN 20971520
 WHEN p_mime IN('video/mp4','video/webm','audio/mpeg','audio/wav','audio/ogg') THEN 52428800
 WHEN p_mime IN('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain','text/markdown','application/zip') THEN 26214400 ELSE 0 END::bigint;
$$;
-- NOT VALID preserves already recorded historical large intents; all new or
-- changed rows must meet the free storage contract.
ALTER TABLE public.upload_intents ADD CONSTRAINT free_storage_file_ceiling CHECK(expected_bytes<=52428800) NOT VALID;
CREATE OR REPLACE FUNCTION public.finish_form_export(p_job uuid,p_lease uuid,p_bytes bigint,p_checksum text,p_error text) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.form_export_jobs;problem text:=p_error;BEGIN
 SELECT * INTO j FROM public.form_export_jobs WHERE id=p_job AND lease_token=p_lease AND state='running' AND locked_until>now() AND expires_at>now() FOR UPDATE;
 IF NOT FOUND THEN RETURN false;END IF;
 PERFORM 1 FROM public.forms WHERE id=j.form_id FOR UPDATE;
 IF NOT gdg_security.form_export_access(j.requester_id,j.session_id,j.form_id,j.include_sensitive) OR NOT gdg_security.form_export_unchanged(j.id) THEN problem:='SOURCE_OR_ACCESS_CHANGED';END IF;
 IF problem IS NULL AND(p_bytes IS NULL OR p_bytes NOT BETWEEN 1 AND 52428800 OR p_checksum IS NULL OR p_checksum!~'^[a-f0-9]{64}$') THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 IF problem IS NOT NULL THEN
  IF problem NOT IN('SOURCE_OR_ACCESS_CHANGED','EXPORT_TOO_LARGE','EXPORT_RETRY','FORM_EXPORT_CHANGED') THEN problem:='EXPORT_RETRY';END IF;
  UPDATE public.form_export_jobs SET state=CASE WHEN problem='EXPORT_RETRY' AND attempt_count<3 THEN 'pending' ELSE 'failed' END,
   error_code=problem,locked_until=NULL,next_attempt_at=now()+interval '30 seconds'*power(2,attempt_count),updated_at=now() WHERE id=j.id;
  RETURN false;
 END IF;
 UPDATE public.form_export_jobs SET state='ready',private_object_key=(SELECT object_key FROM public.form_export_artifacts WHERE job_id=j.id AND lease_token=p_lease),
  byte_size=p_bytes,checksum=p_checksum,error_code=NULL,locked_until=NULL,updated_at=now() WHERE id=j.id;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,metadata) VALUES(j.requester_id,'forms.export_ready','form_export',j.id,jsonb_build_object('formId',j.form_id,'count',j.response_count,'bytes',p_bytes));
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION gdg_security.media_mime_limit(text),public.finish_form_export(uuid,uuid,bigint,text,text) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION gdg_security.media_mime_limit(text),public.finish_form_export(uuid,uuid,bigint,text,text) TO service_role;
COMMIT;
