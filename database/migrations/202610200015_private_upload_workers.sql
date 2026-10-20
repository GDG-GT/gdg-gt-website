BEGIN;
-- Each worker claims only the kinds it implements. Leases fence stale workers.
CREATE FUNCTION public.claim_worker_jobs(p_limit integer,p_kinds text[]) RETURNS SETOF public.delivery_jobs
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF p_limit NOT BETWEEN 1 AND 100 OR cardinality(p_kinds) NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'Invalid batch' USING ERRCODE='22023';END IF;
 UPDATE public.delivery_jobs SET state='dead',locked_until=NULL,lease_token=NULL,last_error_code='LEASE_EXHAUSTED',updated_at=now()
 WHERE kind=ANY(p_kinds) AND state='running' AND locked_until<=now() AND attempt_count>=8;
 RETURN QUERY WITH due AS (
  SELECT id FROM public.delivery_jobs WHERE kind=ANY(p_kinds) AND attempt_count<8 AND
   ((state='pending' AND next_attempt_at<=now()) OR (state='running' AND locked_until<=now()))
   ORDER BY next_attempt_at,id FOR UPDATE SKIP LOCKED LIMIT p_limit
 ) UPDATE public.delivery_jobs j SET state='running',attempt_count=attempt_count+1,
  locked_until=now()+interval '5 minutes',lease_token=gen_random_uuid(),updated_at=now()
 FROM due WHERE j.id=due.id RETURNING j.*;
END $$;
CREATE OR REPLACE FUNCTION public.claim_delivery_jobs(p_limit integer) RETURNS SETOF public.delivery_jobs
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT * FROM public.claim_worker_jobs(p_limit,ARRAY['event_confirmation','event_message','newsletter_confirmation',
 'contact_acknowledgment','contact_notification','form_access','form_response_notification']);
$$;
CREATE TABLE public.upload_intents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),purpose text NOT NULL CHECK(purpose IN ('form','contact','media','blog','finance')),
 form_id uuid REFERENCES public.forms(id),version_id uuid,field_id uuid,owner_id uuid REFERENCES public.admin_users(id),
 proof_hash text NOT NULL CHECK(proof_hash~'^[a-f0-9]{64}$'),bucket text NOT NULL,
 quarantine_key text NOT NULL UNIQUE,clean_key text UNIQUE,filename text NOT NULL,
 declared_mime text NOT NULL,expected_bytes bigint NOT NULL CHECK(expected_bytes BETWEEN 1 AND 262144000),
 expected_sha256 text NOT NULL CHECK(expected_sha256~'^[a-f0-9]{64}$'),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','queued','clean','rejected','expired')),
 error_code text,created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes',
 completed_at timestamptz,deleted_at timestamptz,
 FOREIGN KEY(version_id,form_id) REFERENCES public.form_versions(id,form_id)
);
CREATE INDEX upload_intents_expiry ON public.upload_intents(expires_at) WHERE deleted_at IS NULL;
CREATE INDEX upload_intents_form_group ON public.upload_intents(form_id,proof_hash) WHERE deleted_at IS NULL;
ALTER TABLE public.upload_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.upload_intents FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.upload_intents TO service_role;
CREATE FUNCTION public.create_form_upload(p_form uuid,p_version uuid,p_field uuid,p_proof text,p_document jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE f public.forms;v public.form_versions;field jsonb;created uuid;
BEGIN
 SELECT * INTO f FROM public.forms WHERE id=p_form FOR UPDATE;
 IF NOT FOUND OR f.state NOT IN ('Open','Scheduled') OR f.opens_at>now() OR f.closes_at<=now() THEN RAISE EXCEPTION 'FORM_CLOSED';END IF;
 IF f.published_version_id<>p_version THEN RAISE EXCEPTION 'CONFLICT';END IF;
 SELECT * INTO v FROM public.form_versions WHERE id=p_version AND form_id=f.id;
 SELECT value INTO field FROM jsonb_array_elements(v.definition->'fields') WHERE value->>'id'=p_field::text AND value->>'type'='file';
 IF field IS NULL THEN RAISE EXCEPTION 'INVALID_UPLOAD';END IF;
 IF (p_document->>'bytes')::bigint>coalesce((field->>'maxFileBytes')::bigint,26214400) THEN RAISE EXCEPTION 'INVALID_UPLOAD';END IF;
 IF (SELECT count(*) FROM public.upload_intents WHERE form_id=f.id AND proof_hash=p_proof AND deleted_at IS NULL
  AND state NOT IN ('expired','rejected') AND (state='clean' OR expires_at>now()))>=10 OR
  (SELECT count(*) FROM public.upload_intents WHERE form_id=f.id AND version_id=v.id AND field_id=p_field AND proof_hash=p_proof
  AND deleted_at IS NULL AND state NOT IN ('expired','rejected') AND (state='clean' OR expires_at>now()))>=coalesce((field->>'maxFiles')::integer,1)
 THEN RAISE EXCEPTION 'UPLOAD_QUOTA';END IF;
 INSERT INTO public.upload_intents(purpose,form_id,version_id,field_id,proof_hash,bucket,quarantine_key,filename,declared_mime,expected_bytes,expected_sha256)
 VALUES('form',f.id,v.id,p_field,p_proof,'form-uploads',p_document->>'key',p_document->>'filename',p_document->>'mime',
  (p_document->>'bytes')::bigint,p_document->>'sha256') RETURNING id INTO created;
 INSERT INTO public.form_uploads(id,form_id,version_id,field_id,private_object_key,original_filename,byte_size,checksum,upload_token_hash)
 VALUES(created,f.id,v.id,p_field,p_document->>'key',p_document->>'filename',(p_document->>'bytes')::bigint,p_document->>'sha256',p_proof);
 RETURN created;
END $$;
CREATE FUNCTION public.queue_upload_scan(p_id uuid,p_proof text) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE u public.upload_intents;
BEGIN
 SELECT * INTO u FROM public.upload_intents WHERE id=p_id AND proof_hash=p_proof AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF u.state IN ('queued','clean') THEN RETURN;END IF;
 IF u.state<>'pending' OR u.expires_at<=now() THEN RAISE EXCEPTION 'INVALID_UPLOAD';END IF;
 UPDATE public.upload_intents SET state='queued',completed_at=now() WHERE id=u.id;
 UPDATE public.form_uploads SET uploaded_at=now() WHERE id=u.id;
 INSERT INTO public.delivery_jobs(kind,deduplication_key,payload) VALUES('upload_scan','upload-scan:'||u.id,jsonb_build_object('uploadId',u.id));
END $$;
CREATE FUNCTION public.finish_upload_scan(p_job uuid,p_lease uuid,p_clean_key text,p_mime text,p_bytes bigint,p_sha256 text,p_reject text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.delivery_jobs;u public.upload_intents;
BEGIN
 SELECT * INTO j FROM public.delivery_jobs WHERE id=p_job AND lease_token=p_lease AND kind='upload_scan'
  AND state='running' AND locked_until>now() FOR UPDATE;
 IF NOT FOUND THEN RETURN false;END IF;
 SELECT * INTO u FROM public.upload_intents WHERE id=(j.payload->>'uploadId')::uuid FOR UPDATE;
 IF NOT FOUND OR u.deleted_at IS NOT NULL OR u.state<>'queued' THEN
  RETURN public.finish_delivery_job(j.id,p_lease,true,NULL,NULL);
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
REVOKE ALL ON FUNCTION public.claim_worker_jobs(integer,text[]),public.create_form_upload(uuid,uuid,uuid,text,jsonb),
 public.queue_upload_scan(uuid,text),public.finish_upload_scan(uuid,uuid,text,text,bigint,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_worker_jobs(integer,text[]),public.create_form_upload(uuid,uuid,uuid,text,jsonb),
 public.queue_upload_scan(uuid,text),public.finish_upload_scan(uuid,uuid,text,text,bigint,text,text) TO service_role;
COMMIT;
