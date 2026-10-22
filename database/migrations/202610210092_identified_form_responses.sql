BEGIN;
-- Published definitions are immutable. This is a runtime identity requirement,
-- including older published public forms; historical records stay unknown.
ALTER TABLE public.form_responses
 ADD COLUMN respondent_name text, ADD COLUMN respondent_email text,
 ADD COLUMN respondent_source text NOT NULL DEFAULT 'legacy_unknown'
 CHECK(respondent_source IN('legacy_unknown','self_reported','email_verified','account','redacted'));
ALTER TABLE public.form_response_drafts
 ADD COLUMN respondent_name text, ADD COLUMN respondent_email text,
 ADD COLUMN copy_requested boolean NOT NULL DEFAULT false;
CREATE TABLE public.form_respondent_copies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),response_id uuid NOT NULL REFERENCES public.form_responses(id),
 revision integer NOT NULL,created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(response_id,revision)
);
ALTER TABLE public.form_respondent_copies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.form_respondent_copies FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT ALL ON public.form_respondent_copies TO service_role;

CREATE FUNCTION gdg_security.check_form_respondent(p_document jsonb,p_form uuid,p_access uuid,p_actor uuid) RETURNS text
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE mode text;address text:=p_document->'respondent'->>'email';name text:=p_document->'respondent'->>'name';BEGIN
 IF name IS NULL OR length(btrim(name)) NOT BETWEEN 2 AND 100 OR name~'[[:cntrl:]]'
  OR address IS NULL OR length(address)>254 OR address<>lower(btrim(address)) OR address!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  OR jsonb_typeof(p_document->'respondent')<>'object' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 SELECT access_mode INTO mode FROM public.forms WHERE id=p_form;
 IF mode IN('verified','invited') THEN
  IF NOT EXISTS(SELECT 1 FROM public.form_access_tokens WHERE id=p_access AND form_id=p_form AND revoked_at IS NULL
   AND email_hash=p_document->>'respondentHash') THEN RAISE EXCEPTION 'ACCESS_REQUIRED';END IF;
  RETURN 'email_verified';
 ELSIF mode='internal' THEN
  IF NOT EXISTS(SELECT 1 FROM public.admin_users WHERE id=p_actor AND lower(email)=address AND is_active AND deleted_at IS NULL) THEN RAISE EXCEPTION 'ACCESS_REQUIRED';END IF;
  RETURN 'account';
 END IF;
 RETURN 'self_reported';
END $$;

CREATE FUNCTION gdg_security.queue_respondent_copy(p_response uuid,p_requested boolean,p_revision integer) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r public.form_responses;c uuid;BEGIN
 IF NOT p_requested THEN RETURN false;END IF;
 SELECT * INTO r FROM public.form_responses WHERE id=p_response AND deleted_at IS NULL AND redacted_at IS NULL;
 IF r.id IS NULL OR r.respondent_email IS NULL THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
 IF EXISTS(SELECT 1 FROM public.form_respondent_copies WHERE response_id=r.id AND revision=p_revision) THEN RETURN true;END IF;
 IF r.revision<>p_revision THEN RETURN false;END IF;
 -- Across all forms and concurrent requests, not merely per browser or IP.
 PERFORM pg_advisory_xact_lock(hashtextextended('form-copy:'||r.respondent_email,0));
 IF (SELECT count(*) FROM public.form_respondent_copies c JOIN public.form_responses x ON x.id=c.response_id
  WHERE x.respondent_email=r.respondent_email AND c.created_at>now()-interval '1 hour')>=3 THEN RETURN false;END IF;
 INSERT INTO public.form_respondent_copies(response_id,revision) VALUES(r.id,p_revision) ON CONFLICT DO NOTHING RETURNING id INTO c;
 IF c IS NOT NULL THEN
  INSERT INTO public.delivery_jobs(kind,deduplication_key,payload) VALUES('form_respondent_copy','form-respondent-copy:'||c,jsonb_build_object('copyId',c));
 END IF;
 RETURN true;
END $$;

CREATE FUNCTION public.submit_identified_form_response(p_document jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE f uuid:=(p_document->>'form')::uuid;a uuid;source text;result jsonb;r public.form_responses;BEGIN
 PERFORM 1 FROM public.forms WHERE id=f FOR UPDATE;
 SELECT * INTO r FROM public.form_responses WHERE form_id=f AND idempotency_key_hash=p_document->>'keyHash';
 IF FOUND THEN
  IF r.request_hash IS DISTINCT FROM p_document->>'requestHash' THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  RETURN jsonb_build_object('responseId',r.id,'submittedAt',r.submitted_at,'editSecret',r.edit_secret_encrypted,
   'copyQueued',EXISTS(SELECT 1 FROM public.form_respondent_copies WHERE response_id=r.id AND revision=0));
 END IF;
 SELECT id INTO a FROM public.form_access_tokens WHERE form_id=f AND token_hash=p_document->>'accessHash';
 source:=gdg_security.check_form_respondent(p_document,f,a,(p_document->>'actor')::uuid);
 result:=public.submit_form_response(f,(p_document->>'version')::uuid,p_document->>'schemaHash',p_document->'answers',p_document->>'keyHash',p_document->>'requestHash',
  p_document->>'accessHash',p_document->>'identityHash',(p_document->>'actor')::uuid,p_document->>'editHash',p_document->>'editSecret',p_document->>'resumeHash',p_document->>'uploadHash');
 UPDATE public.form_responses SET respondent_name=btrim(p_document->'respondent'->>'name'),respondent_email=p_document->'respondent'->>'email',respondent_source=source
 WHERE id=(result->>'responseId')::uuid;
 -- Supersede automatic legacy receipts, not separately reviewed chapter notices.
 -- No receipt can escape this transaction before the explicit opt-in is known.
 DELETE FROM public.delivery_jobs WHERE kind='form_reviewed_email' AND payload->>'deliveryId' IN
  (SELECT id::text FROM public.form_response_deliveries WHERE response_id=(result->>'responseId')::uuid AND purpose='receipt');
 DELETE FROM public.form_response_deliveries WHERE response_id=(result->>'responseId')::uuid AND purpose='receipt';
 RETURN result||jsonb_build_object('copyQueued',gdg_security.queue_respondent_copy((result->>'responseId')::uuid,coalesce((p_document->>'copyRequested')::boolean,false),0));
END $$;

CREATE FUNCTION public.save_identified_form_draft(p_document jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE f uuid:=(p_document->>'form')::uuid;BEGIN
 PERFORM gdg_security.check_form_respondent(p_document,f,(p_document->>'access')::uuid,(p_document->>'actor')::uuid);
 PERFORM public.save_form_draft(f,(p_document->>'version')::uuid,p_document->>'hash',p_document->'answers',(p_document->>'access')::uuid,(p_document->>'actor')::uuid,p_document->>'uploadHash');
 UPDATE public.form_response_drafts SET respondent_name=btrim(p_document->'respondent'->>'name'),respondent_email=p_document->'respondent'->>'email',
  copy_requested=coalesce((p_document->>'copyRequested')::boolean,false) WHERE form_id=f AND resume_token_hash=p_document->>'hash';
END $$;

CREATE FUNCTION public.edit_identified_form_response(p_document jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.form_responses;result jsonb;BEGIN
 PERFORM 1 FROM public.forms WHERE id=(p_document->>'form')::uuid FOR UPDATE;
 SELECT * INTO r FROM public.form_responses WHERE id=(p_document->>'response')::uuid AND form_id=(p_document->>'form')::uuid
  AND edit_token_hash=p_document->>'tokenHash' AND deleted_at IS NULL AND redacted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 -- An edit capability must not become an email-address substitution tool.
 IF r.respondent_email IS NOT NULL AND (r.respondent_email IS DISTINCT FROM p_document->'respondent'->>'email'
  OR r.respondent_name IS DISTINCT FROM btrim(p_document->'respondent'->>'name')) THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 IF r.respondent_email IS NULL THEN
  -- Old responses have no proven identity; accepting declared details on an
  -- authorized edit never retroactively labels them verified.
  PERFORM gdg_security.check_form_respondent(p_document,r.form_id,r.access_token_id,(p_document->>'actor')::uuid);
  UPDATE public.form_responses SET respondent_name=btrim(p_document->'respondent'->>'name'),respondent_email=p_document->'respondent'->>'email',respondent_source='self_reported' WHERE id=r.id;
 END IF;
 result:=public.edit_form_response(r.form_id,r.id,(p_document->>'version')::uuid,p_document->>'schemaHash',p_document->>'tokenHash',(p_document->>'revision')::integer,
  p_document->'answers',p_document->>'keyHash',p_document->>'requestHash');
 RETURN result||jsonb_build_object('copyQueued',gdg_security.queue_respondent_copy(r.id,coalesce((p_document->>'copyRequested')::boolean,false),(result->>'revision')::integer));
END $$;

CREATE FUNCTION gdg_security.scrub_declared_form_identity() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF NEW.redacted_at IS NOT NULL OR NEW.deleted_at IS NOT NULL THEN
  NEW.respondent_name:=NULL;NEW.respondent_email:=NULL;NEW.respondent_source:='redacted';
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER scrub_declared_form_identity BEFORE UPDATE ON public.form_responses FOR EACH ROW EXECUTE FUNCTION gdg_security.scrub_declared_form_identity();

CREATE FUNCTION public.prepare_form_respondent_copy(p_job uuid,p_lease uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c public.form_respondent_copies;r public.form_responses;v public.form_versions;items jsonb;files jsonb;BEGIN
 SELECT copies.* INTO c FROM public.delivery_jobs j JOIN public.form_respondent_copies copies ON copies.id=(j.payload->>'copyId')::uuid
  WHERE j.id=p_job AND j.kind='form_respondent_copy' AND j.lease_token=p_lease AND j.state='running' AND j.locked_until>now() AND copies.created_at>now()-interval '24 hours';
 IF NOT FOUND THEN RETURN NULL;END IF;
 PERFORM 1 FROM public.forms f JOIN public.form_responses x ON x.form_id=f.id WHERE x.id=c.response_id AND f.state<>'Archived' FOR SHARE OF f;
 IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT * INTO r FROM public.form_responses WHERE id=c.response_id AND deleted_at IS NULL AND redacted_at IS NULL AND respondent_email IS NOT NULL FOR SHARE;
 IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT * INTO v FROM public.form_versions WHERE id=r.version_id;
 IF r.revision=c.revision THEN SELECT coalesce(jsonb_object_agg(field_id,value),'{}') INTO items FROM public.form_answers WHERE response_id=r.id;
 ELSE SELECT answers INTO items FROM public.form_response_revisions WHERE response_id=r.id AND revision=c.revision+1;END IF;
 IF items IS NULL THEN RETURN NULL;END IF;
 SELECT coalesce(jsonb_object_agg(id,original_filename),'{}') INTO files FROM public.form_uploads WHERE response_id=r.id AND deleted_at IS NULL;
 RETURN jsonb_build_object('responseId',r.id,'submittedAt',c.created_at,'name',r.respondent_name,'email',r.respondent_email,
  'title',v.definition->>'title','version',v.version,'definition',v.definition,'values',items,'files',files);
END $$;

CREATE OR REPLACE FUNCTION public.claim_delivery_jobs(p_limit integer) RETURNS SETOF public.delivery_jobs LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT * FROM public.claim_worker_jobs(p_limit,ARRAY['event_confirmation','event_message','event_push_verification','newsletter_confirmation','contact_acknowledgment','contact_notification',
 'form_access','form_response_notification','form_reviewed_email','form_respondent_copy','account_access','team_invite','team_announcement','task_notification','direct_message_notice','chapter_announcement']);
$$;
-- Legacy SQL helpers remain usable by their owner for old migrations/tests,
-- but the API service cannot bypass the mandatory identity boundary.
REVOKE EXECUTE ON FUNCTION public.submit_form_response(uuid,uuid,text,jsonb,text,text,text,text,uuid,text,text,text,text),
 public.save_form_draft(uuid,uuid,text,jsonb,uuid,uuid),public.save_form_draft(uuid,uuid,text,jsonb,uuid,uuid,text),
 public.edit_form_response(uuid,uuid,uuid,text,text,integer,jsonb,text,text) FROM service_role;
REVOKE ALL ON FUNCTION gdg_security.check_form_respondent(jsonb,uuid,uuid,uuid),gdg_security.queue_respondent_copy(uuid,boolean,integer),gdg_security.scrub_declared_form_identity(),
 public.submit_identified_form_response(jsonb),public.save_identified_form_draft(jsonb),public.edit_identified_form_response(jsonb),public.prepare_form_respondent_copy(uuid,uuid) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.submit_identified_form_response(jsonb),public.save_identified_form_draft(jsonb),public.edit_identified_form_response(jsonb),public.prepare_form_respondent_copy(uuid,uuid) TO service_role;
DO $$ DECLARE f record;BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND(p.proname LIKE 'submit_form_response%' OR p.proname LIKE 'save_form_draft%' OR p.proname='edit_form_response') LOOP
  EXECUTE 'REVOKE EXECUTE ON FUNCTION '||f.signature||' FROM service_role';
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.read_form_responses(p_actor uuid,p_form uuid,p_page integer,p_size integer,p_filters jsonb,p_sensitive boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE v_items jsonb;v_total integer;
BEGIN
 IF p_page<1 OR p_size NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'Invalid page' USING ERRCODE='22023';END IF;
 IF NOT public.can_operate_form(p_actor,p_form,'view_responses') OR
  (p_sensitive AND NOT public.can_operate_form(p_actor,p_form,'view_sensitive_responses')) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 WITH eligible AS (
  SELECT r.*,fv.version,fv.definition FROM public.form_responses r JOIN public.form_versions fv ON fv.id=r.version_id
  WHERE r.form_id=p_form AND r.deleted_at IS NULL
   AND (p_filters->>'id' IS NULL OR r.id=(p_filters->>'id')::uuid)
   AND (p_filters->>'version' IS NULL OR fv.version=(p_filters->>'version')::integer)
   AND (p_filters->>'from' IS NULL OR r.submitted_at>=(p_filters->>'from')::timestamptz)
   AND (p_filters->>'to' IS NULL OR r.submitted_at<=(p_filters->>'to')::timestamptz)
   AND (p_filters->>'status' IS NULL OR r.status=p_filters->>'status')
   AND (p_filters->'selected' IS NULL OR r.id IN (SELECT jsonb_array_elements_text(p_filters->'selected')::uuid))
   AND (coalesce(p_filters->>'q','')='' OR strpos(r.id::text,p_filters->>'q')>0 OR strpos(lower(coalesce(r.respondent_name,'')||' '||coalesce(r.respondent_email,'')),lower(p_filters->>'q'))>0 OR EXISTS(
    SELECT 1 FROM public.form_answers a,jsonb_array_elements(fv.definition->'fields') f
    WHERE a.response_id=r.id AND f->>'id'=a.field_id::text AND (p_sensitive OR NOT coalesce((f->>'sensitive')::boolean,false))
     AND strpos(lower(a.value::text),lower(p_filters->>'q'))>0
   ))
 ), page AS (
  SELECT * FROM eligible ORDER BY submitted_at DESC,id LIMIT p_size OFFSET (p_page-1)*p_size
 ) SELECT (SELECT count(*) FROM eligible),coalesce(jsonb_agg(jsonb_build_object(
  'id',page.id,'formId',page.form_id,'versionId',page.version_id,'version',page.version,'submittedAt',page.submitted_at,
  'respondent',jsonb_build_object('name',page.respondent_name,'email',page.respondent_email,'source',page.respondent_source),'status',page.status,'redacted',page.redacted_at IS NOT NULL,'revision',page.revision,
  'answers',coalesce((SELECT jsonb_object_agg(a.field_id,a.value) FROM public.form_answers a,
   jsonb_array_elements(page.definition->'fields') f WHERE a.response_id=page.id AND f->>'id'=a.field_id::text
    AND (p_sensitive OR NOT coalesce((f->>'sensitive')::boolean,false))),'{}'::jsonb)
 )), '[]'::jsonb) INTO v_total,v_items FROM page;
 RETURN jsonb_build_object('items',v_items,'total',v_total,'page',p_page,'pageSize',p_size);
END $$;

CREATE OR REPLACE FUNCTION public.read_form_export_batch(p_job uuid,p_lease uuid,p_offset integer) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.form_export_jobs;items jsonb;BEGIN
 SELECT * INTO j FROM public.form_export_jobs WHERE id=p_job AND lease_token=p_lease AND state='running' AND locked_until>now() AND expires_at>now();
 IF NOT FOUND OR NOT gdg_security.form_export_access(j.requester_id,j.session_id,j.form_id,j.include_sensitive) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_offset NOT BETWEEN 0 AND 20000 OR p_offset%100<>0 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 IF NOT gdg_security.form_export_unchanged(j.id) THEN RAISE EXCEPTION 'FORM_EXPORT_CHANGED';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('formId',j.form_id,'version',v.version,'responseId',r.id,'submittedAt',r.submitted_at,'completionState',r.status,'respondent',jsonb_build_object('name',r.respondent_name,'email',r.respondent_email,'source',r.respondent_source),
  'answers',coalesce((SELECT jsonb_object_agg(a.field_id,jsonb_build_object('label',field->>'label','value',a.value)) FROM public.form_answers a,jsonb_array_elements(v.definition->'fields') field
   WHERE a.response_id=r.id AND field->>'id'=a.field_id::text AND(j.include_sensitive OR NOT coalesce((field->>'sensitive')::boolean,false))
   AND(j.columns IS NULL OR a.field_id=ANY(j.columns))),'{}'::jsonb)) ORDER BY i.ordinal),'[]'::jsonb) INTO items
 FROM(SELECT * FROM public.form_export_items WHERE job_id=j.id ORDER BY ordinal LIMIT 100 OFFSET p_offset) i
 JOIN public.form_responses r ON r.id=i.response_id JOIN public.form_versions v ON v.id=r.version_id;
 RETURN items;
END $$;
CREATE OR REPLACE FUNCTION gdg_security.form_export_fingerprint(r public.form_responses) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT encode(sha256(convert_to(jsonb_build_array(r.id,r.version_id,r.revision,r.status,r.last_edited_at,r.redacted_at,r.deleted_at,r.respondent_name,r.respondent_email,r.respondent_source)::text,'UTF8')),'hex');
$$;

COMMIT;
