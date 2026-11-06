BEGIN;
-- Upload proofs are high-entropy respondent capabilities. Keep raw proofs, files
-- and signed URLs out of receipts; the caller must pass current form access too.
CREATE FUNCTION public.inspect_form_upload_preparation(p_form uuid,p_version uuid,p_field uuid,p_proof text,p_key_hash text,p_request_hash text,p_actor uuid,p_session uuid,p_access_hash text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE f public.forms;k public.idempotency_keys;u public.upload_intents;BEGIN
 IF p_form IS NULL OR p_version IS NULL OR p_field IS NULL OR p_proof IS NULL OR p_proof!~'^[a-f0-9]{64}$' OR p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$' OR p_request_hash IS NULL OR p_request_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 SELECT * INTO f FROM public.forms WHERE id=p_form;
 IF NOT FOUND OR f.permanently_deleted_at IS NOT NULL OR f.state NOT IN('Open','Scheduled') OR f.published_version_id IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF f.access_mode='internal' THEN
  IF NOT gdg_security.member_transfer_session(p_actor,p_session) OR(f.team_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.admin_users WHERE id=p_actor AND role IN('admin','super_admin')) AND NOT EXISTS(SELECT 1 FROM public.team_memberships m JOIN public.admin_teams t ON t.id=m.team_id WHERE m.admin_user_id=p_actor AND m.team_id=f.team_id AND m.is_active AND t.is_active AND t.deleted_at IS NULL)) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 ELSIF f.access_mode<>'public' THEN
  IF p_access_hash IS NULL OR NOT EXISTS(SELECT 1 FROM public.form_access_tokens a WHERE a.form_id=f.id AND a.token_type=f.access_mode AND a.token_hash=p_access_hash AND a.revoked_at IS NULL AND a.expires_at>now() AND a.used_count<a.use_limit) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.form_versions v CROSS JOIN LATERAL jsonb_array_elements(v.definition->'fields') field WHERE v.id=p_version AND v.form_id=f.id AND field->>'id'=p_field::text AND field->>'type'='file') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT * INTO k FROM public.idempotency_keys WHERE scope='form-upload-prepare:'||p_form||':'||p_version||':'||p_field||':'||p_proof AND key_hash=p_key_hash;
 IF FOUND THEN
  IF k.request_hash IS DISTINCT FROM p_request_hash THEN RAISE EXCEPTION 'CONFLICT';END IF;
  IF k.expires_at<=now() THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  SELECT * INTO u FROM public.upload_intents WHERE id=(k.result->>'uploadId')::uuid AND purpose='form' AND form_id=p_form AND version_id=p_version AND field_id=p_field AND proof_hash=p_proof;
  IF NOT FOUND OR u.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  RETURN jsonb_build_object('committed',true,'canRetry',false,'uploadId',u.id,'state',CASE WHEN u.state='pending' AND u.expires_at<=now() THEN 'expired' ELSE u.state END);
 END IF;
 RETURN jsonb_build_object('committed',false,'canRetry',coalesce((f.opens_at IS NULL OR f.opens_at<=now()) AND(f.closes_at IS NULL OR f.closes_at>now()),false),'uploadId',NULL,'state',NULL);
END $$;
CREATE FUNCTION public.prepare_form_upload(p_form uuid,p_version uuid,p_field uuid,p_proof text,p_document jsonb,p_key_hash text,p_request_hash text,p_actor uuid,p_session uuid,p_access_hash text) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE inspected jsonb;created uuid;BEGIN
 -- Serialize all identical requests and quota checks with ordinary submission.
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));
 IF p_actor IS NOT NULL THEN
  PERFORM 1 FROM public.admin_users WHERE id=p_actor FOR UPDATE;
  PERFORM 1 FROM public.admin_sessions WHERE id=p_session AND admin_user_id=p_actor FOR UPDATE;
 END IF;
 PERFORM 1 FROM public.forms WHERE id=p_form FOR UPDATE;
 IF p_access_hash IS NOT NULL THEN PERFORM 1 FROM public.form_access_tokens WHERE form_id=p_form AND token_hash=p_access_hash FOR UPDATE;END IF;
 inspected:=public.inspect_form_upload_preparation(p_form,p_version,p_field,p_proof,p_key_hash,p_request_hash,p_actor,p_session,p_access_hash);
 IF(inspected->>'committed')::boolean THEN RETURN(inspected->>'uploadId')::uuid;END IF;
 IF NOT(inspected->>'canRetry')::boolean THEN RAISE EXCEPTION 'FORM_CLOSED';END IF;
 created:=public.create_form_upload(p_form,p_version,p_field,p_proof,p_document);
 INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result)VALUES('form-upload-prepare:'||p_form||':'||p_version||':'||p_field||':'||p_proof,p_key_hash,p_request_hash,200,jsonb_build_object('uploadId',created));
 RETURN created;
END $$;
REVOKE ALL ON FUNCTION public.inspect_form_upload_preparation(uuid,uuid,uuid,text,text,text,uuid,uuid,text),public.prepare_form_upload(uuid,uuid,uuid,text,jsonb,text,text,uuid,uuid,text) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.inspect_form_upload_preparation(uuid,uuid,uuid,text,text,text,uuid,uuid,text),public.prepare_form_upload(uuid,uuid,uuid,text,jsonb,text,text,uuid,uuid,text) TO service_role;
COMMIT;
