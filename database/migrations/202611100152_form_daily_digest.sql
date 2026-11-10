BEGIN;
-- Counts only. Answers, identities and private files never enter the digest.
CREATE FUNCTION public.queue_form_daily_digest(p_now timestamptz DEFAULT now()) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE local_now timestamp;day_start timestamptz;cutoff timestamptz;entries jsonb;inserted integer;
BEGIN
 local_now:=p_now AT TIME ZONE 'America/New_York';
 IF local_now::time<time '23:00' THEN RETURN 0;END IF;
 day_start:=local_now::date::timestamp AT TIME ZONE 'America/New_York';
 cutoff:=(local_now::date+time '23:00') AT TIME ZONE 'America/New_York';
 PERFORM pg_advisory_xact_lock(hashtextextended('form-digest:'||local_now::date,0));
 IF EXISTS(SELECT 1 FROM public.delivery_jobs WHERE deduplication_key='form-digest:'||local_now::date) THEN RETURN 0;END IF;
 SELECT jsonb_agg(jsonb_build_object('id',f.id,'title',f.title,
  'total',(SELECT count(*) FROM public.form_responses r WHERE r.form_id=f.id AND r.deleted_at IS NULL AND r.submitted_at<=cutoff),
  'today',(SELECT count(*) FROM public.form_responses r WHERE r.form_id=f.id AND r.deleted_at IS NULL AND r.submitted_at>=day_start AND r.submitted_at<=cutoff)) ORDER BY lower(f.title),f.id)
 INTO entries FROM public.forms f WHERE f.state='Open' AND f.archived_at IS NULL AND f.published_version_id IS NOT NULL
  AND(f.opens_at IS NULL OR f.opens_at<=cutoff) AND(f.closes_at IS NULL OR f.closes_at>cutoff);
 IF entries IS NULL THEN RETURN 0;END IF;
 INSERT INTO public.delivery_jobs(kind,deduplication_key,payload)
 VALUES('form_daily_digest','form-digest:'||local_now::date,jsonb_build_object('date',local_now::date,'forms',entries)) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS inserted=ROW_COUNT;
 RETURN inserted;
END $$;
CREATE FUNCTION public.prepare_form_daily_digest(p_job uuid,p_lease uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT payload FROM public.delivery_jobs WHERE id=p_job AND kind='form_daily_digest' AND state='running'
  AND lease_token=p_lease AND locked_until>now() AND created_at>now()-interval '48 hours';
$$;
-- Reuse the existing five-minute form scheduler and minute-based mail worker.
ALTER FUNCTION public.advance_form_schedules() SET SCHEMA gdg_security;
CREATE FUNCTION public.advance_form_schedules() RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;BEGIN
 result:=gdg_security.advance_form_schedules();
 RETURN result||jsonb_build_object('digestQueued',public.queue_form_daily_digest());
END $$;
CREATE OR REPLACE FUNCTION public.claim_delivery_jobs(p_limit integer) RETURNS SETOF public.delivery_jobs
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT * FROM public.claim_worker_jobs(p_limit,ARRAY['event_confirmation','event_message','event_push_verification','newsletter_confirmation','contact_acknowledgment','contact_notification',
 'form_access','form_response_notification','form_reviewed_email','form_respondent_copy','form_daily_digest','account_access','team_invite','team_announcement','task_notification','direct_message_notice','chapter_announcement','reward_credential_email','workspace_notice_email']);
$$;
REVOKE ALL ON FUNCTION public.queue_form_daily_digest(timestamptz),public.prepare_form_daily_digest(uuid,uuid),public.advance_form_schedules(),gdg_security.advance_form_schedules() FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.queue_form_daily_digest(timestamptz),public.prepare_form_daily_digest(uuid,uuid),public.advance_form_schedules(),gdg_security.advance_form_schedules() TO service_role;
-- Historical review follows section order, then question order within each section.
CREATE OR REPLACE FUNCTION public.review_form_response_history(p_actor uuid,p_session uuid,p_form uuid,p_response uuid,p_revision integer,p_page integer,p_sensitive boolean,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r public.form_responses;v public.form_versions;raw jsonb;items jsonb;result jsonb;at_time timestamptz;BEGIN
 IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 10000 OR(p_revision IS NOT NULL AND p_revision<0) THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.admin_users u JOIN public.admin_sessions s ON s.admin_user_id=u.id
  WHERE u.id=p_actor AND u.is_active AND u.deleted_at IS NULL AND NOT u.must_change_password
  AND(u.locked_until IS NULL OR u.locked_until<=now()) AND s.id=p_session AND s.revoked_at IS NULL
  AND s.idle_expires_at>now() AND s.absolute_expires_at>now())
  OR NOT public.can_operate_form(p_actor,p_form,'view') OR NOT public.can_operate_form(p_actor,p_form,'view_responses')
  OR(p_sensitive AND NOT public.can_operate_form(p_actor,p_form,'view_sensitive_responses')) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 PERFORM 1 FROM public.forms WHERE id=p_form FOR SHARE;
 SELECT * INTO r FROM public.form_responses WHERE id=p_response AND form_id=p_form AND deleted_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT * INTO v FROM public.form_versions WHERE id=r.version_id AND form_id=p_form;
 IF p_revision IS NULL THEN
  WITH revisions AS (
   SELECT r.revision AS revision,coalesce(r.last_edited_at,r.submitted_at) AS recorded_at,true AS current
   UNION ALL
   SELECT h.revision-1,CASE WHEN h.revision=1 THEN r.submitted_at ELSE
    (SELECT previous.created_at FROM public.form_response_revisions previous WHERE previous.response_id=r.id AND previous.revision=h.revision-1) END,false
   FROM public.form_response_revisions h WHERE h.response_id=r.id
  ), page AS(SELECT * FROM revisions ORDER BY revision DESC LIMIT 20 OFFSET(p_page-1)*20)
  SELECT coalesce(jsonb_agg(jsonb_build_object('revision',revision,'recordedAt',recorded_at,'current',current) ORDER BY revision DESC),'[]'::jsonb) INTO items FROM page;
  result:=jsonb_build_object('items',items,'page',p_page,'pageSize',20,'total',(SELECT count(*)+1 FROM public.form_response_revisions WHERE response_id=r.id),
   'currentRevision',r.revision,'version',v.version,'redacted',r.redacted_at IS NOT NULL);
 ELSE
  IF p_revision=r.revision THEN
   SELECT coalesce(jsonb_object_agg(field_id,value),'{}'::jsonb) INTO raw FROM public.form_answers WHERE response_id=r.id;
   at_time:=coalesce(r.last_edited_at,r.submitted_at);
  ELSE
   SELECT answers INTO raw FROM public.form_response_revisions WHERE response_id=r.id AND revision=p_revision+1;
   IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
   IF p_revision=0 THEN at_time:=r.submitted_at;ELSE
    SELECT created_at INTO at_time FROM public.form_response_revisions WHERE response_id=r.id AND revision=p_revision;
   END IF;
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',field->>'id','label',field->>'label','type',field->>'type',
   'sensitive',coalesce((field->>'sensitive')::boolean,false),'masked',coalesce((field->>'sensitive')::boolean,false) AND NOT p_sensitive,
   'answered',raw ? (field->>'id'),
   'value',CASE WHEN p_sensitive OR NOT coalesce((field->>'sensitive')::boolean,false) THEN raw->(field->>'id') ELSE NULL END) ORDER BY coalesce((SELECT section_order FROM jsonb_array_elements(v.definition->'sections') WITH ORDINALITY AS s(section,section_order) WHERE section->>'id'=field->>'sectionId'),9223372036854775807),ordinal),'[]'::jsonb) INTO items
  FROM jsonb_array_elements(v.definition->'fields') WITH ORDINALITY AS f(field,ordinal)
  WHERE field->>'type' NOT IN('title','description','image','divider');
  result:=jsonb_build_object('responseId',r.id,'revision',p_revision,'version',v.version,'current',p_revision=r.revision,
   'recordedAt',at_time,'redacted',r.redacted_at IS NOT NULL,'fields',items);
 END IF;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata)
 VALUES(p_actor,CASE WHEN p_sensitive AND p_revision IS NOT NULL THEN 'forms.sensitive_history_viewed' ELSE 'forms.history_viewed' END,'form_response',r.id,p_request_id,
  jsonb_build_object('formId',p_form,'versionId',r.version_id,'revision',p_revision,'page',p_page));
 RETURN result;
END $$;
COMMIT;
