BEGIN;
-- The edit transaction stores the superseded answers with revision N+1.
-- Review exposes their actual revision N; immutable form-version labels apply.
CREATE FUNCTION public.review_form_response_history(p_actor uuid,p_session uuid,p_form uuid,p_response uuid,p_revision integer,p_page integer,p_sensitive boolean,p_request_id uuid)
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
   'value',CASE WHEN p_sensitive OR NOT coalesce((field->>'sensitive')::boolean,false) THEN raw->(field->>'id') ELSE NULL END) ORDER BY ordinal),'[]'::jsonb) INTO items
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
REVOKE ALL ON FUNCTION public.review_form_response_history(uuid,uuid,uuid,uuid,integer,integer,boolean,uuid) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.review_form_response_history(uuid,uuid,uuid,uuid,integer,integer,boolean,uuid) TO service_role;
COMMIT;
