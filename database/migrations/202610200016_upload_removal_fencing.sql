BEGIN;
CREATE FUNCTION public.remove_form_upload(p_form uuid,p_id uuid,p_proof text) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE u public.upload_intents;f public.form_uploads;
BEGIN
 -- Same parent lock order as final submission: removal cannot race association.
 PERFORM 1 FROM public.forms WHERE id=p_form FOR UPDATE;
 SELECT * INTO u FROM public.upload_intents WHERE id=p_id AND form_id=p_form AND proof_hash=p_proof FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT * INTO f FROM public.form_uploads WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR f.response_id IS NOT NULL THEN RAISE EXCEPTION 'INVALID_UPLOAD';END IF;
 UPDATE public.form_uploads SET deleted_at=coalesce(deleted_at,now()) WHERE id=p_id;
 UPDATE public.upload_intents SET deleted_at=coalesce(deleted_at,now()) WHERE id=p_id;
END $$;
CREATE OR REPLACE FUNCTION public.finish_upload_scan(p_job uuid,p_lease uuid,p_clean_key text,p_mime text,p_bytes bigint,p_sha256 text,p_reject text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.delivery_jobs;u public.upload_intents;
BEGIN
 SELECT * INTO j FROM public.delivery_jobs WHERE id=p_job AND lease_token=p_lease AND kind='upload_scan'
  AND state='running' AND locked_until>now() FOR UPDATE;
 IF NOT FOUND THEN RETURN false;END IF;
 SELECT * INTO u FROM public.upload_intents WHERE id=(j.payload->>'uploadId')::uuid FOR UPDATE;
 IF NOT FOUND OR u.deleted_at IS NOT NULL OR u.state<>'queued' THEN
  PERFORM public.finish_delivery_job(j.id,p_lease,true,NULL,NULL);
  RETURN false; -- Worker must discard its orphaned promotion object.
 END IF;
 IF p_reject IS NULL AND (p_clean_key IS NULL OR p_clean_key NOT LIKE 'clean/%' OR p_mime IS NULL OR p_bytes NOT BETWEEN 1 AND 26214400 OR p_sha256!~'^[a-f0-9]{64}$') THEN
  RAISE EXCEPTION 'INVALID_UPLOAD';END IF;
 UPDATE public.upload_intents SET state=CASE WHEN p_reject IS NULL THEN 'clean' ELSE 'rejected' END,
  clean_key=p_clean_key,error_code=p_reject,completed_at=now() WHERE id=u.id;
 UPDATE public.form_uploads SET scan_state=CASE WHEN p_reject IS NULL THEN 'clean' ELSE 'rejected' END,
  private_object_key=coalesce(p_clean_key,private_object_key),detected_mime=p_mime,byte_size=coalesce(p_bytes,byte_size),checksum=coalesce(p_sha256,checksum)
  WHERE id=u.id AND deleted_at IS NULL;
 RETURN public.finish_delivery_job(j.id,p_lease,true,NULL,NULL);
END $$;
REVOKE ALL ON FUNCTION public.remove_form_upload(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.remove_form_upload(uuid,uuid,text) TO service_role;
COMMIT;
