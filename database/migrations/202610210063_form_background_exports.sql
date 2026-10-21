BEGIN;
-- Background exports retain membership/revision fingerprints, never a second
-- answer database. Every read, promotion and download rechecks current access.
ALTER TABLE public.form_export_jobs
 ADD COLUMN session_id uuid REFERENCES public.admin_sessions(id),
 ADD COLUMN key_hash text,
 ADD COLUMN request_hash text,
 ADD COLUMN include_sensitive boolean NOT NULL DEFAULT false,
 ADD COLUMN columns uuid[],
 ADD COLUMN response_count integer NOT NULL DEFAULT 0,
 ADD COLUMN attempt_count integer NOT NULL DEFAULT 0,
 ADD COLUMN lease_token uuid,
 ADD COLUMN locked_until timestamptz,
 ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT now(),
 ADD COLUMN byte_size bigint,
 ADD COLUMN checksum text,
 ADD CONSTRAINT form_export_identity UNIQUE(requester_id,session_id,key_hash),
 ADD CONSTRAINT form_export_state CHECK(state IN('pending','running','ready','failed','cancelled','expired'));
CREATE TABLE public.form_export_items (
 job_id uuid NOT NULL REFERENCES public.form_export_jobs(id),
 ordinal integer NOT NULL,
 response_id uuid NOT NULL REFERENCES public.form_responses(id),
 fingerprint text NOT NULL,
 PRIMARY KEY(job_id,ordinal),UNIQUE(job_id,response_id)
);
CREATE TABLE public.form_export_artifacts (
 job_id uuid NOT NULL REFERENCES public.form_export_jobs(id),lease_token uuid NOT NULL,
 object_key text NOT NULL UNIQUE,created_at timestamptz NOT NULL DEFAULT now(),purged_at timestamptz,
 PRIMARY KEY(job_id,lease_token)
);
CREATE INDEX form_exports_due ON public.form_export_jobs(next_attempt_at,id) WHERE state IN('pending','running');
CREATE INDEX form_exports_owner ON public.form_export_jobs(requester_id,session_id,created_at DESC);
ALTER TABLE public.form_export_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_export_artifacts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.form_export_items,public.form_export_artifacts FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT ALL ON public.form_export_items,public.form_export_artifacts TO service_role;

CREATE FUNCTION gdg_security.form_export_fingerprint(r public.form_responses) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT encode(sha256(convert_to(jsonb_build_array(r.id,r.version_id,r.revision,r.status,r.last_edited_at,r.redacted_at,r.deleted_at)::text,'UTF8')),'hex');
$$;
CREATE FUNCTION gdg_security.form_export_access(p_actor uuid,p_session uuid,p_form uuid,p_sensitive boolean) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.admin_users u JOIN public.admin_sessions s ON s.admin_user_id=u.id
  WHERE u.id=p_actor AND u.is_active AND u.deleted_at IS NULL AND NOT u.must_change_password
  AND(u.locked_until IS NULL OR u.locked_until<=now()) AND s.id=p_session AND s.revoked_at IS NULL
  AND s.idle_expires_at>now() AND s.absolute_expires_at>now())
 AND EXISTS(SELECT 1 FROM public.forms WHERE id=p_form)
 AND public.can_operate_form(p_actor,p_form,'view') AND public.can_operate_form(p_actor,p_form,'view_responses')
 AND public.can_operate_form(p_actor,p_form,'export_responses')
 AND(NOT p_sensitive OR public.can_operate_form(p_actor,p_form,'view_sensitive_responses'));
$$;
CREATE FUNCTION gdg_security.form_export_unchanged(p_job uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT NOT EXISTS(SELECT 1 FROM public.form_export_items i LEFT JOIN public.form_responses r ON r.id=i.response_id
  WHERE i.job_id=p_job AND(r.id IS NULL OR r.deleted_at IS NOT NULL OR i.fingerprint IS DISTINCT FROM gdg_security.form_export_fingerprint(r)));
$$;

CREATE FUNCTION public.create_form_export(p_actor uuid,p_session uuid,p_form uuid,p_document jsonb,p_key_hash text,p_request_hash text,p_request_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.form_export_jobs;sensitive boolean:=coalesce((p_document->>'sensitive')::boolean,false);f jsonb:=coalesce(p_document->'filters','{}');n integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('form-export:'||p_actor,0));
 PERFORM 1 FROM public.forms WHERE id=p_form FOR UPDATE;
 IF NOT gdg_security.form_export_access(p_actor,p_session,p_form,sensitive) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$' OR p_request_hash IS NULL OR p_request_hash!~'^[a-f0-9]{64}$'
  OR p_document->>'format' IS NULL OR p_document->>'format' NOT IN('csv','xlsx','json') THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 SELECT * INTO j FROM public.form_export_jobs WHERE requester_id=p_actor AND session_id=p_session AND key_hash=p_key_hash;
 IF FOUND THEN
  IF j.form_id<>p_form OR j.request_hash IS DISTINCT FROM p_request_hash THEN RAISE EXCEPTION 'CONFLICT';END IF;RETURN j.id;
 END IF;
 IF(SELECT count(*) FROM public.form_export_jobs WHERE requester_id=p_actor AND created_at>now()-interval '24 hours')>=20
  OR(SELECT count(*) FROM public.form_export_jobs WHERE requester_id=p_actor AND state IN('pending','running') AND expires_at>now())>=3 THEN RAISE EXCEPTION 'FORM_EXPORT_QUOTA';END IF;
 IF jsonb_typeof(f)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(f) k WHERE k NOT IN('q','version','from','to','status','selected'))
  OR length(coalesce(f->>'q',''))>100 OR(jsonb_typeof(f->'selected') IS NOT NULL AND(jsonb_typeof(f->'selected')<>'array' OR jsonb_array_length(f->'selected') NOT BETWEEN 1 AND 100))
  OR(f->>'from' IS NOT NULL AND f->>'to' IS NOT NULL AND(f->>'from')::timestamptz>(f->>'to')::timestamptz)
  OR(jsonb_typeof(p_document->'columns') IS NOT NULL AND(jsonb_typeof(p_document->'columns')<>'array' OR jsonb_array_length(p_document->'columns')>200)) THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 INSERT INTO public.form_export_jobs(form_id,requester_id,session_id,format,filters,include_sensitive,columns,key_hash,request_hash,expires_at)
 VALUES(p_form,p_actor,p_session,p_document->>'format',f,sensitive,
  CASE WHEN p_document->'columns' IS NULL THEN NULL ELSE ARRAY(SELECT jsonb_array_elements_text(p_document->'columns')::uuid) END,
  p_key_hash,p_request_hash,now()+interval '24 hours') RETURNING * INTO j;
 INSERT INTO public.form_export_items(job_id,ordinal,response_id,fingerprint)
 SELECT j.id,row_number() OVER(ORDER BY r.submitted_at DESC,r.id),r.id,gdg_security.form_export_fingerprint(r)
 FROM public.form_responses r JOIN public.form_versions v ON v.id=r.version_id
 WHERE r.form_id=p_form AND r.deleted_at IS NULL
  AND(f->>'version' IS NULL OR v.version=(f->>'version')::integer)
  AND(f->>'from' IS NULL OR r.submitted_at>=(f->>'from')::timestamptz)
  AND(f->>'to' IS NULL OR r.submitted_at<=(f->>'to')::timestamptz)
  AND(f->>'status' IS NULL OR r.status=f->>'status')
  AND(f->'selected' IS NULL OR r.id IN(SELECT jsonb_array_elements_text(f->'selected')::uuid))
  AND(coalesce(f->>'q','')='' OR strpos(r.id::text,f->>'q')>0 OR EXISTS(
   SELECT 1 FROM public.form_answers a,jsonb_array_elements(v.definition->'fields') field
   WHERE a.response_id=r.id AND field->>'id'=a.field_id::text AND(sensitive OR NOT coalesce((field->>'sensitive')::boolean,false))
   AND strpos(lower(a.value::text),lower(f->>'q'))>0))
 ORDER BY r.submitted_at DESC,r.id LIMIT 20001;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n>20000 OR(n>10000 AND(f->>'from' IS NULL OR f->>'to' IS NULL)) THEN RAISE EXCEPTION 'FORM_EXPORT_RANGE';END IF;
 UPDATE public.form_export_jobs SET response_count=n WHERE id=j.id;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata)
 VALUES(p_actor,CASE WHEN sensitive THEN 'forms.sensitive_export_queued' ELSE 'forms.export_queued' END,'form_export',j.id,p_request_id,
  jsonb_build_object('formId',p_form,'format',j.format,'count',n,'filterHash',encode(sha256(convert_to(f::text,'UTF8')),'hex')));
 RETURN j.id;
END $$;

CREATE FUNCTION public.claim_form_exports(p_limit integer) RETURNS SETOF public.form_export_jobs
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.form_export_jobs;BEGIN
 IF p_limit NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 UPDATE public.form_export_jobs SET state='expired',private_object_key=NULL,updated_at=now()
 WHERE expires_at<=now() AND state NOT IN('expired','cancelled');
 UPDATE public.form_export_jobs SET state='failed',error_code='LEASE_EXHAUSTED',updated_at=now()
 WHERE state='running' AND locked_until<=now() AND attempt_count>=3;
 FOR j IN SELECT * FROM public.form_export_jobs WHERE expires_at>now() AND attempt_count<3 AND
  ((state='pending' AND next_attempt_at<=now()) OR(state='running' AND locked_until<=now()))
  ORDER BY next_attempt_at,id FOR UPDATE SKIP LOCKED LIMIT p_limit LOOP
  IF NOT gdg_security.form_export_access(j.requester_id,j.session_id,j.form_id,j.include_sensitive) OR NOT gdg_security.form_export_unchanged(j.id) THEN
   UPDATE public.form_export_jobs SET state='failed',error_code='SOURCE_OR_ACCESS_CHANGED',updated_at=now() WHERE id=j.id;CONTINUE;
  END IF;
  UPDATE public.form_export_jobs SET state='running',attempt_count=attempt_count+1,lease_token=gen_random_uuid(),locked_until=now()+interval '5 minutes',updated_at=now()
  WHERE id=j.id RETURNING * INTO j;
  INSERT INTO public.form_export_artifacts(job_id,lease_token,object_key) VALUES(j.id,j.lease_token,'exports/'||j.id||'/'||j.lease_token||'.'||j.format);
  RETURN NEXT j;
 END LOOP;
END $$;
CREATE FUNCTION public.read_form_export_batch(p_job uuid,p_lease uuid,p_offset integer) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.form_export_jobs;items jsonb;BEGIN
 SELECT * INTO j FROM public.form_export_jobs WHERE id=p_job AND lease_token=p_lease AND state='running' AND locked_until>now() AND expires_at>now();
 IF NOT FOUND OR NOT gdg_security.form_export_access(j.requester_id,j.session_id,j.form_id,j.include_sensitive) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_offset NOT BETWEEN 0 AND 20000 OR p_offset%100<>0 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 IF NOT gdg_security.form_export_unchanged(j.id) THEN RAISE EXCEPTION 'FORM_EXPORT_CHANGED';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('formId',j.form_id,'version',v.version,'responseId',r.id,'submittedAt',r.submitted_at,'completionState',r.status,
  'answers',coalesce((SELECT jsonb_object_agg(a.field_id,jsonb_build_object('label',field->>'label','value',a.value)) FROM public.form_answers a,jsonb_array_elements(v.definition->'fields') field
   WHERE a.response_id=r.id AND field->>'id'=a.field_id::text AND(j.include_sensitive OR NOT coalesce((field->>'sensitive')::boolean,false))
   AND(j.columns IS NULL OR a.field_id=ANY(j.columns))),'{}'::jsonb)) ORDER BY i.ordinal),'[]'::jsonb) INTO items
 FROM(SELECT * FROM public.form_export_items WHERE job_id=j.id ORDER BY ordinal LIMIT 100 OFFSET p_offset) i
 JOIN public.form_responses r ON r.id=i.response_id JOIN public.form_versions v ON v.id=r.version_id;
 RETURN items;
END $$;
CREATE FUNCTION public.finish_form_export(p_job uuid,p_lease uuid,p_bytes bigint,p_checksum text,p_error text) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.form_export_jobs;problem text:=p_error;BEGIN
 SELECT * INTO j FROM public.form_export_jobs WHERE id=p_job AND lease_token=p_lease AND state='running' AND locked_until>now() AND expires_at>now() FOR UPDATE;
 IF NOT FOUND THEN RETURN false;END IF;
 PERFORM 1 FROM public.forms WHERE id=j.form_id FOR UPDATE;
 IF NOT gdg_security.form_export_access(j.requester_id,j.session_id,j.form_id,j.include_sensitive) OR NOT gdg_security.form_export_unchanged(j.id) THEN problem:='SOURCE_OR_ACCESS_CHANGED';END IF;
 IF problem IS NULL AND(p_bytes IS NULL OR p_bytes NOT BETWEEN 1 AND 67108864 OR p_checksum IS NULL OR p_checksum!~'^[a-f0-9]{64}$') THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
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
CREATE FUNCTION public.form_export_download(p_actor uuid,p_session uuid,p_form uuid,p_job uuid,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.form_export_jobs;BEGIN
 SELECT * INTO j FROM public.form_export_jobs WHERE id=p_job AND form_id=p_form AND requester_id=p_actor AND session_id=p_session AND state='ready' AND expires_at>now() FOR SHARE;
 IF NOT FOUND OR NOT gdg_security.form_export_access(p_actor,p_session,p_form,j.include_sensitive) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF NOT gdg_security.form_export_unchanged(j.id) THEN RAISE EXCEPTION 'FORM_EXPORT_CHANGED';END IF;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata)
 VALUES(p_actor,CASE WHEN j.include_sensitive THEN 'forms.sensitive_export_downloaded' ELSE 'forms.export_downloaded' END,'form_export',j.id,p_request_id,jsonb_build_object('formId',p_form,'count',j.response_count));
 RETURN jsonb_build_object('key',j.private_object_key,'filename','form-'||p_form||'-responses.'||j.format);
END $$;
CREATE FUNCTION public.cancel_form_export(p_actor uuid,p_session uuid,p_form uuid,p_job uuid,p_request_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.form_export_jobs;BEGIN
 SELECT * INTO j FROM public.form_export_jobs WHERE id=p_job AND form_id=p_form AND requester_id=p_actor AND session_id=p_session FOR UPDATE;
 IF NOT FOUND OR NOT gdg_security.form_export_access(p_actor,p_session,p_form,j.include_sensitive) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 UPDATE public.form_export_jobs SET state='cancelled',private_object_key=NULL,updated_at=now() WHERE id=j.id;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata)
 VALUES(p_actor,'forms.export_cancelled','form_export',j.id,p_request_id,jsonb_build_object('formId',p_form));
END $$;
CREATE FUNCTION public.claim_form_export_cleanup(p_limit integer) RETURNS SETOF public.form_export_artifacts
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN
 IF p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 UPDATE public.form_export_jobs SET state='expired',private_object_key=NULL,updated_at=now()
 WHERE expires_at<=now() AND state NOT IN('expired','cancelled');
 RETURN QUERY SELECT a.* FROM public.form_export_artifacts a JOIN public.form_export_jobs j ON j.id=a.job_id
 WHERE a.purged_at IS NULL AND
  (j.state IN('cancelled','expired','failed') OR(a.created_at<now()-interval '10 minutes' AND a.lease_token IS DISTINCT FROM j.lease_token))
  AND NOT(j.state='running' AND j.lease_token=a.lease_token AND j.locked_until>now())
 ORDER BY a.created_at,a.job_id LIMIT p_limit FOR UPDATE OF a SKIP LOCKED;
END $$;
REVOKE ALL ON FUNCTION gdg_security.form_export_fingerprint(public.form_responses),gdg_security.form_export_access(uuid,uuid,uuid,boolean),gdg_security.form_export_unchanged(uuid),
 public.create_form_export(uuid,uuid,uuid,jsonb,text,text,uuid),public.claim_form_exports(integer),public.read_form_export_batch(uuid,uuid,integer),
 public.finish_form_export(uuid,uuid,bigint,text,text),public.form_export_download(uuid,uuid,uuid,uuid,uuid),public.cancel_form_export(uuid,uuid,uuid,uuid,uuid),public.claim_form_export_cleanup(integer)
 FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION gdg_security.form_export_fingerprint(public.form_responses),gdg_security.form_export_access(uuid,uuid,uuid,boolean),gdg_security.form_export_unchanged(uuid),
 public.create_form_export(uuid,uuid,uuid,jsonb,text,text,uuid),public.claim_form_exports(integer),public.read_form_export_batch(uuid,uuid,integer),
 public.finish_form_export(uuid,uuid,bigint,text,text),public.form_export_download(uuid,uuid,uuid,uuid,uuid),public.cancel_form_export(uuid,uuid,uuid,uuid,uuid),public.claim_form_export_cleanup(integer) TO service_role;
COMMIT;
