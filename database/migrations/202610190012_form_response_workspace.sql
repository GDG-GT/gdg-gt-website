BEGIN;
CREATE FUNCTION public.read_form_responses(p_actor uuid,p_form uuid,p_page integer,p_size integer,p_filters jsonb,p_sensitive boolean DEFAULT false)
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
   AND (coalesce(p_filters->>'q','')='' OR strpos(r.id::text,p_filters->>'q')>0 OR EXISTS(
    SELECT 1 FROM public.form_answers a,jsonb_array_elements(fv.definition->'fields') f
    WHERE a.response_id=r.id AND f->>'id'=a.field_id::text AND (p_sensitive OR NOT coalesce((f->>'sensitive')::boolean,false))
     AND strpos(lower(a.value::text),lower(p_filters->>'q'))>0
   ))
 ), page AS (
  SELECT * FROM eligible ORDER BY submitted_at DESC,id LIMIT p_size OFFSET (p_page-1)*p_size
 ) SELECT (SELECT count(*) FROM eligible),coalesce(jsonb_agg(jsonb_build_object(
  'id',page.id,'formId',page.form_id,'versionId',page.version_id,'version',page.version,'submittedAt',page.submitted_at,
  'status',page.status,'redacted',page.redacted_at IS NOT NULL,'revision',page.revision,
  'answers',coalesce((SELECT jsonb_object_agg(a.field_id,a.value) FROM public.form_answers a,
   jsonb_array_elements(page.definition->'fields') f WHERE a.response_id=page.id AND f->>'id'=a.field_id::text
    AND (p_sensitive OR NOT coalesce((f->>'sensitive')::boolean,false))),'{}'::jsonb)
 )), '[]'::jsonb) INTO v_total,v_items FROM page;
 RETURN jsonb_build_object('items',v_items,'total',v_total,'page',p_page,'pageSize',p_size);
END $$;

CREATE FUNCTION public.mutate_form_response(p_actor uuid,p_form uuid,p_response uuid,p_action text,p_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v public.forms;r public.form_responses;v_fields uuid[];
BEGIN
 SELECT * INTO v FROM public.forms WHERE id=p_form FOR UPDATE;
 IF NOT FOUND OR NOT public.can_operate_form(p_actor,p_form,'delete') OR NOT public.can_operate_form(p_actor,p_form,'view_responses') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT * INTO r FROM public.form_responses WHERE id=p_response AND form_id=p_form AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF coalesce((v.settings->>'hold')::boolean,false) THEN RAISE EXCEPTION 'RETENTION_HOLD';END IF;
 IF p_action='delete' THEN
  DELETE FROM public.form_answers WHERE response_id=r.id;
  DELETE FROM public.form_response_revisions WHERE response_id=r.id;
  UPDATE public.form_responses SET status='deleted',deleted_at=now() WHERE id=r.id;
 ELSIF p_action='redact' THEN
  SELECT array_agg((f->>'id')::uuid) INTO v_fields FROM public.form_versions fv,jsonb_array_elements(fv.definition->'fields') f
   WHERE fv.id=r.version_id AND (coalesce((f->>'sensitive')::boolean,false) OR f->>'type' IN ('email','phone','file')
    OR f->>'label'~*'\m(name|e-?mail|phone|address|student[[:space:]]*id)\M');
  UPDATE public.form_answers SET value='"[Identity redacted]"'::jsonb,search_value=NULL,updated_at=now() WHERE response_id=r.id AND field_id=ANY(v_fields);
  UPDATE public.form_response_revisions SET answers=coalesce((SELECT jsonb_object_agg(key,CASE WHEN key::uuid=ANY(v_fields) THEN '"[Identity redacted]"'::jsonb ELSE value END) FROM jsonb_each(answers)),'{}'::jsonb) WHERE response_id=r.id;
  UPDATE public.form_responses SET status='redacted',redacted_at=now() WHERE id=r.id;
 ELSE RAISE EXCEPTION 'INVALID_STATE';END IF;
 UPDATE public.form_responses SET identity_hash=NULL,access_token_id=NULL,edit_token_hash=NULL,edit_secret_encrypted=NULL WHERE id=r.id;
 UPDATE public.form_uploads SET deleted_at=now() WHERE response_id=r.id AND deleted_at IS NULL;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata)
 VALUES(p_actor,'forms.response_'||p_action,'form_response',r.id,p_request_id,jsonb_build_object('formId',p_form,'versionId',r.version_id));
END $$;

CREATE FUNCTION public.mutate_form_view(p_actor uuid,p_form uuid,p_id uuid,p_name text,p_filters jsonb,p_columns text[],p_delete boolean,p_request_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_id uuid;
BEGIN
 IF NOT public.can_operate_form(p_actor,p_form,'view_responses') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_delete THEN
  DELETE FROM public.form_saved_views WHERE id=p_id AND form_id=p_form AND owner_id=p_actor RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 ELSE
  INSERT INTO public.form_saved_views(form_id,owner_id,name,filters,columns) VALUES(p_form,p_actor,p_name,p_filters,p_columns)
  ON CONFLICT(form_id,owner_id,name) DO UPDATE SET filters=excluded.filters,columns=excluded.columns,updated_at=now() RETURNING id INTO v_id;
 END IF;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata)
 VALUES(p_actor,CASE WHEN p_delete THEN 'forms.saved_view_removed' ELSE 'forms.saved_view_saved' END,'form',p_form,p_request_id,jsonb_build_object('viewId',v_id));
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.read_form_responses(uuid,uuid,integer,integer,jsonb,boolean),public.mutate_form_response(uuid,uuid,uuid,text,uuid),
 public.mutate_form_view(uuid,uuid,uuid,text,jsonb,text[],boolean,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_form_responses(uuid,uuid,integer,integer,jsonb,boolean),public.mutate_form_response(uuid,uuid,uuid,text,uuid),
 public.mutate_form_view(uuid,uuid,uuid,text,jsonb,text[],boolean,uuid) TO service_role;
COMMIT;
