BEGIN;
ALTER TABLE public.form_response_drafts ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.form_responses ADD COLUMN revision integer NOT NULL DEFAULT 0;
CREATE FUNCTION public.save_form_draft(p_form uuid,p_version uuid,p_hash text,p_answers jsonb,p_access uuid,p_actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v public.forms;v_draft public.form_response_drafts;
BEGIN
 SELECT * INTO v FROM public.forms WHERE id=p_form FOR SHARE;
 IF NOT FOUND OR v.state NOT IN ('Open','Scheduled') OR v.published_version_id<>p_version
  OR NOT coalesce((v.settings->>'resume')::boolean,false) THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
 IF v.access_mode NOT IN ('public','internal') AND NOT EXISTS(SELECT 1 FROM public.form_access_tokens WHERE id=p_access AND form_id=v.id
  AND token_type=v.access_mode AND revoked_at IS NULL AND expires_at>now() AND used_count<use_limit) THEN RAISE EXCEPTION 'ACCESS_REQUIRED';END IF;
 IF v.access_mode='internal' AND (NOT EXISTS(SELECT 1 FROM public.admin_users WHERE id=p_actor AND is_active) OR
  (v.team_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.admin_users WHERE id=p_actor AND is_active AND role IN ('admin','super_admin')) AND
   NOT EXISTS(SELECT 1 FROM public.team_memberships WHERE team_id=v.team_id AND admin_user_id=p_actor AND is_active))) THEN RAISE EXCEPTION 'ACCESS_REQUIRED';END IF;
 SELECT * INTO v_draft FROM public.form_response_drafts WHERE resume_token_hash=p_hash FOR UPDATE;
 IF FOUND THEN
  IF v_draft.form_id<>p_form OR v_draft.version_id<>p_version OR v_draft.expires_at<=now() OR v_draft.completed_at IS NOT NULL
   OR v_draft.access_token_id IS DISTINCT FROM p_access THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  UPDATE public.form_response_drafts SET answers=p_answers,updated_at=now() WHERE id=v_draft.id;
 ELSE
  INSERT INTO public.form_response_drafts(form_id,version_id,resume_token_hash,access_token_id,answers,expires_at)
  VALUES(p_form,p_version,p_hash,p_access,p_answers,now()+interval '7 days');
 END IF;
END $$;
CREATE FUNCTION public.edit_form_response(p_form uuid,p_response uuid,p_version uuid,p_schema_hash text,p_token_hash text,
 p_revision integer,p_answers jsonb,p_key_hash text,p_request_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v public.forms;r public.form_responses;k public.idempotency_keys;previous jsonb;result jsonb;
BEGIN
 SELECT * INTO v FROM public.forms WHERE id=p_form FOR SHARE;
 SELECT * INTO r FROM public.form_responses WHERE id=p_response AND form_id=p_form AND edit_token_hash=p_token_hash FOR UPDATE;
 IF NOT FOUND OR r.deleted_at IS NOT NULL OR r.redacted_at IS NOT NULL THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF r.access_token_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.form_access_tokens WHERE id=r.access_token_id AND revoked_at IS NOT NULL) THEN RAISE EXCEPTION 'ACCESS_REQUIRED';END IF;
 IF v.state NOT IN ('Open','Scheduled') OR v.closes_at<=now() OR NOT coalesce((v.settings->>'editing')::boolean,false) THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
 SELECT * INTO k FROM public.idempotency_keys WHERE scope='forms.edit:'||r.id AND key_hash=p_key_hash;
 IF FOUND THEN IF k.request_hash<>p_request_hash THEN RAISE EXCEPTION 'INVALID_STATE';END IF;RETURN k.result;END IF;
 IF r.version_id<>p_version OR r.revision<>p_revision OR NOT EXISTS(SELECT 1 FROM public.form_versions WHERE id=r.version_id AND schema_hash=p_schema_hash) THEN RAISE EXCEPTION 'CONFLICT';END IF;
 -- New uploads attach through the separate scan/ownership transaction, not by ID substitution.
 IF EXISTS(SELECT 1 FROM public.form_versions fv,jsonb_array_elements(fv.definition->'fields') f
  WHERE fv.id=r.version_id AND f->>'type'='file' AND p_answers->(f->>'id') IS DISTINCT FROM
   (SELECT value FROM public.form_answers WHERE response_id=r.id AND field_id=(f->>'id')::uuid)) THEN RAISE EXCEPTION 'INVALID_UPLOAD';END IF;
 SELECT coalesce(jsonb_object_agg(field_id,value),'{}') INTO previous FROM public.form_answers WHERE response_id=r.id;
 INSERT INTO public.form_response_revisions(response_id,revision,change_metadata,answers,editor_type)
 VALUES(r.id,r.revision+1,jsonb_build_object('versionId',r.version_id),previous,'respondent');
 DELETE FROM public.form_answers WHERE response_id=r.id;
 INSERT INTO public.form_answers(response_id,field_id,value) SELECT r.id,key::uuid,value FROM jsonb_each(p_answers);
 UPDATE public.form_responses SET revision=revision+1,last_edited_at=now() WHERE id=r.id;
 INSERT INTO public.admin_actions(action,target_type,target_id,metadata) VALUES('forms.response_edited','form_response',r.id,jsonb_build_object('formId',v.id,'revision',r.revision+1));
 result:=jsonb_build_object('responseId',r.id,'revision',r.revision+1,'updatedAt',now());
 INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result) VALUES('forms.edit:'||r.id,p_key_hash,p_request_hash,200,result);
 RETURN result;
END $$;
CREATE FUNCTION public.mutate_form_collaborator(p_actor uuid,p_form uuid,p_user uuid,p_actions text[],p_delete boolean,p_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v public.forms;v_role text;
BEGIN
 SELECT * INTO v FROM public.forms WHERE id=p_form FOR UPDATE;
 IF NOT FOUND OR NOT public.can_operate_form(p_actor,p_form,'manage_access') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_user=v.owner_id THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
 SELECT role INTO v_role FROM public.admin_users WHERE id=p_user AND is_active;
 IF v_role IS NULL OR v_role='blog_editor' THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
 IF v.team_id IS NOT NULL AND v_role NOT IN ('admin','super_admin') AND NOT EXISTS(SELECT 1 FROM public.team_memberships WHERE team_id=v.team_id AND admin_user_id=p_user AND is_active) THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
 IF p_delete THEN DELETE FROM public.form_collaborators WHERE form_id=p_form AND admin_user_id=p_user;
 ELSE
  IF cardinality(p_actions) NOT BETWEEN 1 AND 8 OR NOT 'view'=ANY(p_actions) OR EXISTS(SELECT 1 FROM unnest(p_actions) a WHERE NOT public.can_operate_form(p_actor,p_form,a)) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';END IF;
  INSERT INTO public.form_collaborators(form_id,admin_user_id,actions,created_by) VALUES(p_form,p_user,p_actions,p_actor)
  ON CONFLICT(form_id,admin_user_id) DO UPDATE SET actions=excluded.actions,updated_at=now();
 END IF;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata)
 VALUES(p_actor,CASE WHEN p_delete THEN 'forms.collaborator_removed' ELSE 'forms.collaborator_updated' END,'form',p_form,p_request_id,jsonb_build_object('userId',p_user,'actions',p_actions));
END $$;
REVOKE ALL ON FUNCTION public.save_form_draft(uuid,uuid,text,jsonb,uuid,uuid),public.edit_form_response(uuid,uuid,uuid,text,text,integer,jsonb,text,text),
 public.mutate_form_collaborator(uuid,uuid,uuid,text[],boolean,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_form_draft(uuid,uuid,text,jsonb,uuid,uuid),public.edit_form_response(uuid,uuid,uuid,text,text,integer,jsonb,text,text),
 public.mutate_form_collaborator(uuid,uuid,uuid,text[],boolean,uuid) TO service_role;
COMMIT;
