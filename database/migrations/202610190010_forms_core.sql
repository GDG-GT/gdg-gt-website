BEGIN;
CREATE TABLE public.forms (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),slug text NOT NULL UNIQUE CHECK(slug~'^[a-z0-9]+(-[a-z0-9]+)*$'),
 title text NOT NULL,description text NOT NULL DEFAULT '',owner_id uuid NOT NULL REFERENCES public.admin_users(id),
 team_id uuid REFERENCES public.admin_teams(id),state text NOT NULL DEFAULT 'Draft' CHECK(state IN ('Draft','Open','Scheduled','Closed','Archived')),
 access_mode text NOT NULL DEFAULT 'public' CHECK(access_mode IN ('public','verified','unlisted','invited','internal')),
 draft_revision integer NOT NULL DEFAULT 1,draft_definition jsonb NOT NULL,published_version_id uuid,
 opens_at timestamptz,closes_at timestamptz,response_limit integer NOT NULL DEFAULT 0 CHECK(response_limit>=0),
 one_response boolean NOT NULL DEFAULT false,settings jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),archived_at timestamptz,
 CHECK(closes_at IS NULL OR opens_at IS NULL OR closes_at>opens_at),CHECK(NOT one_response OR access_mode<>'public')
);
CREATE TABLE public.form_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),form_id uuid NOT NULL REFERENCES public.forms(id),
 version integer NOT NULL CHECK(version>0),definition jsonb NOT NULL,schema_hash text NOT NULL CHECK(schema_hash~'^[a-f0-9]{64}$'),
 published_by uuid NOT NULL REFERENCES public.admin_users(id),published_at timestamptz NOT NULL DEFAULT now(),UNIQUE(form_id,version),UNIQUE(id,form_id)
);
ALTER TABLE public.forms ADD CONSTRAINT forms_current_version_fkey FOREIGN KEY(published_version_id,id) REFERENCES public.form_versions(id,form_id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE public.form_collaborators (
 form_id uuid NOT NULL REFERENCES public.forms(id),admin_user_id uuid NOT NULL REFERENCES public.admin_users(id),
 actions text[] NOT NULL,created_by uuid NOT NULL REFERENCES public.admin_users(id),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(form_id,admin_user_id),CHECK(actions<@ARRAY['view','edit','publish','manage_access','view_responses','view_sensitive_responses','export_responses','delete']::text[])
);
CREATE TABLE public.form_access_tokens (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),form_id uuid NOT NULL REFERENCES public.forms(id),
 token_type text NOT NULL CHECK(token_type IN ('unlisted','invited','verified')),token_hash text NOT NULL UNIQUE CHECK(token_hash~'^[a-f0-9]{64}$'),
 intended_email_encrypted text,email_hash text,use_limit integer NOT NULL DEFAULT 1 CHECK(use_limit>0),used_count integer NOT NULL DEFAULT 0 CHECK(used_count>=0),
 delivery_state text NOT NULL DEFAULT 'pending',last_sent_at timestamptz,expires_at timestamptz NOT NULL,revoked_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,form_id),CHECK(used_count<=use_limit)
);
CREATE TABLE public.form_response_drafts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),form_id uuid NOT NULL REFERENCES public.forms(id),version_id uuid NOT NULL,
 resume_token_hash text NOT NULL UNIQUE CHECK(resume_token_hash~'^[a-f0-9]{64}$'),access_token_id uuid,
 answers jsonb NOT NULL DEFAULT '{}',expires_at timestamptz NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,
 FOREIGN KEY(version_id,form_id) REFERENCES public.form_versions(id,form_id),FOREIGN KEY(access_token_id,form_id) REFERENCES public.form_access_tokens(id,form_id)
);
CREATE TABLE public.form_responses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),form_id uuid NOT NULL REFERENCES public.forms(id),version_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'complete' CHECK(status IN ('complete','redacted','deleted','held')),
 identity_hash text,access_token_id uuid,idempotency_key_hash text NOT NULL CHECK(idempotency_key_hash~'^[a-f0-9]{64}$'),
 request_hash text NOT NULL CHECK(request_hash~'^[a-f0-9]{64}$'),submitted_at timestamptz NOT NULL DEFAULT now(),last_edited_at timestamptz,
 edit_token_hash text CHECK(edit_token_hash~'^[a-f0-9]{64}$'),edit_secret_encrypted text,source_metadata_hash text,deleted_at timestamptz,redacted_at timestamptz,
 FOREIGN KEY(version_id,form_id) REFERENCES public.form_versions(id,form_id),FOREIGN KEY(access_token_id,form_id) REFERENCES public.form_access_tokens(id,form_id),
 UNIQUE(form_id,idempotency_key_hash),UNIQUE(id,form_id)
);
CREATE INDEX form_responses_live ON public.form_responses(form_id,submitted_at DESC) WHERE deleted_at IS NULL;
CREATE TABLE public.form_response_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),response_id uuid NOT NULL REFERENCES public.form_responses(id),revision integer NOT NULL,
 change_metadata jsonb NOT NULL DEFAULT '{}',answers jsonb NOT NULL,editor_type text NOT NULL,editor_id uuid REFERENCES public.admin_users(id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(response_id,revision)
);
CREATE TABLE public.form_answers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),response_id uuid NOT NULL REFERENCES public.form_responses(id),field_id uuid NOT NULL,
 value jsonb NOT NULL,search_value text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(response_id,field_id)
);
CREATE TABLE public.form_uploads (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),form_id uuid NOT NULL REFERENCES public.forms(id),version_id uuid NOT NULL,field_id uuid NOT NULL,
 response_id uuid,draft_id uuid REFERENCES public.form_response_drafts(id),private_object_key text NOT NULL UNIQUE,original_filename text NOT NULL,
 detected_mime text,byte_size bigint CHECK(byte_size>0 AND byte_size<=26214400),checksum text,
 scan_state text NOT NULL DEFAULT 'pending' CHECK(scan_state IN ('pending','scanning','clean','rejected','failed')),
 upload_token_hash text NOT NULL CHECK(upload_token_hash~'^[a-f0-9]{64}$'),uploaded_at timestamptz,attached_at timestamptz,deleted_at timestamptz,
 FOREIGN KEY(version_id,form_id) REFERENCES public.form_versions(id,form_id),FOREIGN KEY(response_id,form_id) REFERENCES public.form_responses(id,form_id)
);
CREATE TABLE public.form_export_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),form_id uuid NOT NULL REFERENCES public.forms(id),requester_id uuid NOT NULL REFERENCES public.admin_users(id),
 format text NOT NULL CHECK(format IN ('csv','xlsx','json')),filters jsonb NOT NULL DEFAULT '{}',state text NOT NULL DEFAULT 'pending',
 private_object_key text,expires_at timestamptz,error_code text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.form_saved_views (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),form_id uuid NOT NULL REFERENCES public.forms(id),owner_id uuid NOT NULL REFERENCES public.admin_users(id),
 name text NOT NULL,filters jsonb NOT NULL DEFAULT '{}',columns text[] NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(form_id,owner_id,name)
);
CREATE TRIGGER form_versions_immutable BEFORE UPDATE OR DELETE ON public.form_versions FOR EACH ROW EXECUTE FUNCTION public.protect_audit_rows();
ALTER TABLE public.notifications ADD COLUMN delivery_key text UNIQUE;

CREATE FUNCTION public.can_operate_form(p_actor uuid,p_form uuid,p_action text,p_team uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE v_role text;v_form public.forms;v_team uuid:=p_team;v_owner uuid;
BEGIN
 SELECT role INTO v_role FROM public.admin_users WHERE id=p_actor AND is_active;
 IF v_role IS NULL OR v_role='blog_editor' OR p_action NOT IN ('view','create','edit','publish','manage_access','view_responses','view_sensitive_responses','export_responses','delete') THEN RETURN false;END IF;
 IF v_role IN ('super_admin','admin') THEN RETURN true;END IF;
 IF p_form IS NOT NULL THEN
  SELECT * INTO v_form FROM public.forms WHERE id=p_form;
  IF NOT FOUND THEN RETURN false;END IF;v_team:=v_form.team_id;v_owner:=v_form.owner_id;
 END IF;
 IF v_team IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.team_memberships m JOIN public.admin_teams t ON t.id=m.team_id
  WHERE m.admin_user_id=p_actor AND m.team_id=v_team AND m.is_active AND t.is_active) THEN RETURN false;END IF;
 IF p_form IS NOT NULL AND EXISTS(SELECT 1 FROM public.form_collaborators WHERE form_id=p_form AND admin_user_id=p_actor AND p_action=ANY(actions)) THEN RETURN true;END IF;
 IF p_form IS NOT NULL AND v_team IS NULL AND v_owner<>p_actor THEN RETURN false;END IF;
 RETURN EXISTS(SELECT 1 FROM public.team_memberships m JOIN public.admin_teams t ON t.id=m.team_id AND t.is_active
  JOIN public.team_page_access a ON a.team_id=m.team_id AND a.page_path='/admin/forms' AND a.can_access
  JOIN public.team_permissions p ON p.team_id=m.team_id AND p.resource_type='forms'
  WHERE m.admin_user_id=p_actor AND m.is_active AND (v_team IS NULL OR m.team_id=v_team) AND
   CASE p_action WHEN 'view' THEN p.can_read WHEN 'create' THEN p.can_create WHEN 'edit' THEN p.can_update WHEN 'delete' THEN p.can_delete
   ELSE p.permission IN (p_action,'forms.'||p_action) END);
END $$;

CREATE FUNCTION public.list_forms(p_actor uuid,p_page integer,p_size integer,p_query text,p_team uuid,p_owner uuid,p_state text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE v_items jsonb;v_total integer;
BEGIN
 IF p_page<1 OR p_size NOT BETWEEN 1 AND 100 OR length(p_query)>100 THEN RAISE EXCEPTION 'Invalid page' USING ERRCODE='22023';END IF;
 WITH eligible AS (
  SELECT f.* FROM public.forms f WHERE public.can_operate_form(p_actor,f.id,'view')
   AND (p_query IS NULL OR strpos(lower(f.title),lower(p_query))>0) AND (p_team IS NULL OR f.team_id=p_team)
   AND (p_owner IS NULL OR f.owner_id=p_owner) AND (p_state IS NULL OR f.state=p_state)
 ), page AS (
  SELECT * FROM eligible ORDER BY updated_at DESC,id LIMIT p_size OFFSET (p_page-1)*p_size
 ) SELECT (SELECT count(*) FROM eligible),coalesce(jsonb_agg(to_jsonb(page)||jsonb_build_object(
  'response_count',CASE WHEN public.can_operate_form(p_actor,page.id,'view_responses') THEN
   (SELECT count(*) FROM public.form_responses WHERE form_id=page.id AND deleted_at IS NULL) ELSE NULL END,
  'actions',(SELECT jsonb_agg(a) FROM unnest(ARRAY['view','edit','publish','manage_access','view_responses','view_sensitive_responses','export_responses','delete']) a WHERE public.can_operate_form(p_actor,page.id,a))
 )), '[]'::jsonb) INTO v_total,v_items FROM page;
 RETURN jsonb_build_object('items',v_items,'total',v_total,'page',p_page,'pageSize',p_size);
END $$;

CREATE FUNCTION public.mutate_form(p_actor uuid,p_id uuid,p_action text,p_revision integer,p_document jsonb,p_schema_hash text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v public.forms;v_version uuid;v_number integer;v_definition jsonb;v_settings jsonb;v_team uuid;
BEGIN
 IF p_action='create' THEN
  v_team:=(p_document->>'team_id')::uuid;
  IF NOT public.can_operate_form(p_actor,NULL,'create',v_team) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';END IF;
  v_definition:=p_document->'definition';
  INSERT INTO public.forms(slug,title,description,owner_id,team_id,draft_definition)
  VALUES(p_document->>'slug',v_definition->>'title',v_definition->>'description',p_actor,v_team,v_definition) RETURNING * INTO v;
 ELSE
  SELECT * INTO v FROM public.forms WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_operate_form(p_actor,p_id,CASE WHEN p_action='publish' OR p_action='state' THEN 'publish' WHEN p_action='archive' OR p_action='restore' THEN 'delete' ELSE 'edit' END) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  IF v.draft_revision<>p_revision THEN RAISE EXCEPTION 'CONFLICT';END IF;
  IF p_action='draft' THEN
   IF v.state='Archived' THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
   v_definition:=p_document->'definition';v_team:=coalesce((p_document->>'team_id')::uuid,v.team_id);
   IF v_team IS DISTINCT FROM v.team_id AND NOT public.can_operate_form(p_actor,NULL,'create',v_team) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';END IF;
   UPDATE public.forms SET slug=coalesce(p_document->>'slug',slug),title=v_definition->>'title',description=v_definition->>'description',
    team_id=v_team,draft_definition=v_definition,draft_revision=draft_revision+1,updated_at=now() WHERE id=p_id RETURNING * INTO v;
  ELSIF p_action='publish' THEN
   IF v.state='Archived' OR p_schema_hash!~'^[a-f0-9]{64}$' OR p_document->'definition' IS DISTINCT FROM v.draft_definition THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
   SELECT coalesce(max(version),0)+1 INTO v_number FROM public.form_versions WHERE form_id=v.id;
   INSERT INTO public.form_versions(form_id,version,definition,schema_hash,published_by) VALUES(v.id,v_number,v.draft_definition,p_schema_hash,p_actor) RETURNING id INTO v_version;
   v_settings:=v.draft_definition->'settings';
   UPDATE public.forms SET published_version_id=v_version,access_mode=v_settings->>'access',settings=v_settings,
    opens_at=nullif(v_settings->>'opensAt','')::timestamptz,closes_at=nullif(v_settings->>'closesAt','')::timestamptz,
    response_limit=(v_settings->>'limit')::integer,one_response=coalesce((v_settings->>'oneResponse')::boolean,false),
    state=CASE WHEN nullif(v_settings->>'closesAt','')::timestamptz<=now() THEN 'Closed' WHEN nullif(v_settings->>'opensAt','')::timestamptz>now() THEN 'Scheduled' ELSE 'Open' END,
    draft_revision=draft_revision+1,updated_at=now() WHERE id=v.id RETURNING * INTO v;
  ELSIF p_action='state' THEN
   IF v.published_version_id IS NULL OR v.state='Archived' OR p_document->>'state' NOT IN ('Open','Closed','Scheduled') THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
   UPDATE public.forms SET state=p_document->>'state',draft_revision=draft_revision+1,updated_at=now() WHERE id=v.id RETURNING * INTO v;
  ELSIF p_action IN ('archive','restore') THEN
   IF p_action='restore' AND v.state<>'Archived' THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
   UPDATE public.forms SET state=CASE WHEN p_action='archive' THEN 'Archived' ELSE 'Draft' END,
    archived_at=CASE WHEN p_action='archive' THEN now() ELSE NULL END,draft_revision=draft_revision+1,updated_at=now() WHERE id=v.id RETURNING * INTO v;
  ELSE RAISE EXCEPTION 'INVALID_STATE';END IF;
 END IF;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata)
 VALUES(p_actor,'forms.'||p_action,'form',v.id,p_request_id,jsonb_build_object('revision',v.draft_revision,'versionId',v_version));
 RETURN to_jsonb(v);
END $$;

CREATE FUNCTION public.submit_form_response(p_form uuid,p_version uuid,p_schema_hash text,p_answers jsonb,
 p_key_hash text,p_request_hash text,p_access_hash text,p_identity_hash text,p_actor uuid,p_edit_hash text,p_edit_secret text,
 p_resume_hash text,p_upload_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v public.forms;v_version public.form_versions;v_old public.form_responses;v_access public.form_access_tokens;
 v_id uuid;v_file uuid;v_field jsonb;v_entry record;v_identity text:=p_identity_hash;v_count integer;
BEGIN
 SELECT * INTO v FROM public.forms WHERE id=p_form FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT * INTO v_old FROM public.form_responses WHERE form_id=v.id AND idempotency_key_hash=p_key_hash;
 IF FOUND THEN
  IF v_old.request_hash<>p_request_hash THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  RETURN jsonb_build_object('responseId',v_old.id,'submittedAt',v_old.submitted_at,'editSecret',v_old.edit_secret_encrypted);
 END IF;
 SELECT * INTO v_version FROM public.form_versions WHERE id=p_version AND form_id=v.id FOR SHARE;
 IF NOT FOUND OR v_version.schema_hash<>p_schema_hash OR v.published_version_id<>p_version THEN RAISE EXCEPTION 'CONFLICT';END IF;
 IF v.state NOT IN ('Open','Scheduled') OR v.opens_at>now() OR v.closes_at<=now() THEN RAISE EXCEPTION 'FORM_CLOSED';END IF;
 IF v.access_mode='internal' THEN
  IF NOT EXISTS(SELECT 1 FROM public.admin_users WHERE id=p_actor AND is_active) OR
   (v.team_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.admin_users WHERE id=p_actor AND is_active AND role IN ('admin','super_admin')) AND
    NOT EXISTS(SELECT 1 FROM public.team_memberships m JOIN public.admin_teams t ON t.id=m.team_id AND t.is_active WHERE m.team_id=v.team_id AND m.admin_user_id=p_actor AND m.is_active)) THEN RAISE EXCEPTION 'ACCESS_REQUIRED';END IF;
  IF p_identity_hash IS NULL OR p_identity_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'ACCESS_REQUIRED';END IF;
  v_identity:=p_identity_hash;
 ELSIF v.access_mode<>'public' THEN
  SELECT * INTO v_access FROM public.form_access_tokens WHERE form_id=v.id AND token_hash=p_access_hash AND token_type=v.access_mode FOR UPDATE;
  IF NOT FOUND OR v_access.revoked_at IS NOT NULL OR v_access.expires_at<=now() OR v_access.used_count>=v_access.use_limit THEN RAISE EXCEPTION 'ACCESS_REQUIRED';END IF;
  v_identity:=coalesce(v_access.email_hash,v_access.id::text);
 END IF;
 IF v.one_response AND (v_identity IS NULL OR EXISTS(SELECT 1 FROM public.form_responses WHERE form_id=v.id AND identity_hash=v_identity AND deleted_at IS NULL)) THEN RAISE EXCEPTION 'DUPLICATE';END IF;
 SELECT count(*) INTO v_count FROM public.form_responses WHERE form_id=v.id AND deleted_at IS NULL;
 IF v.response_limit>0 AND v_count>=v.response_limit THEN RAISE EXCEPTION 'FORM_FULL';END IF;
 INSERT INTO public.form_responses(form_id,version_id,identity_hash,access_token_id,idempotency_key_hash,request_hash,edit_token_hash,edit_secret_encrypted)
 VALUES(v.id,v_version.id,v_identity,v_access.id,p_key_hash,p_request_hash,p_edit_hash,p_edit_secret) RETURNING id INTO v_id;
 FOR v_entry IN SELECT key,value FROM jsonb_each(p_answers) LOOP
  INSERT INTO public.form_answers(response_id,field_id,value) VALUES(v_id,v_entry.key::uuid,v_entry.value);
 END LOOP;
 FOR v_field IN SELECT value FROM jsonb_array_elements(v_version.definition->'fields') WHERE value->>'type'='file' LOOP
  FOR v_file IN SELECT jsonb_array_elements_text(coalesce(p_answers->(v_field->>'id'),'[]'))::uuid LOOP
   UPDATE public.form_uploads SET response_id=v_id,attached_at=now() WHERE id=v_file AND form_id=v.id AND version_id=v_version.id
    AND field_id=(v_field->>'id')::uuid AND scan_state='clean' AND response_id IS NULL AND deleted_at IS NULL AND upload_token_hash=p_upload_hash;
   IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_UPLOAD';END IF;
  END LOOP;
 END LOOP;
 IF v_access.id IS NOT NULL THEN UPDATE public.form_access_tokens SET used_count=used_count+1 WHERE id=v_access.id;END IF;
 IF p_resume_hash IS NOT NULL THEN UPDATE public.form_response_drafts SET completed_at=now(),answers='{}' WHERE form_id=v.id AND version_id=v_version.id AND resume_token_hash=p_resume_hash AND completed_at IS NULL;END IF;
 INSERT INTO public.delivery_jobs(kind,deduplication_key,payload) VALUES('form_response_notification','form-notification:'||v_id,jsonb_build_object('formId',v.id,'responseId',v_id));
 RETURN jsonb_build_object('responseId',v_id,'submittedAt',now(),'editSecret',p_edit_secret);
END $$;

DO $$ DECLARE name text;BEGIN
 FOREACH name IN ARRAY ARRAY['forms','form_versions','form_collaborators','form_access_tokens','form_response_drafts','form_responses','form_response_revisions','form_answers','form_uploads','form_export_jobs','form_saved_views'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',name);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',name);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',name);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.can_operate_form(uuid,uuid,text,uuid),public.mutate_form(uuid,uuid,text,integer,jsonb,text,uuid),
 public.submit_form_response(uuid,uuid,text,jsonb,text,text,text,text,uuid,text,text,text,text),public.list_forms(uuid,integer,integer,text,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.can_operate_form(uuid,uuid,text,uuid),public.mutate_form(uuid,uuid,text,integer,jsonb,text,uuid),
 public.submit_form_response(uuid,uuid,text,jsonb,text,text,text,text,uuid,text,text,text,text),public.list_forms(uuid,integer,integer,text,uuid,uuid,text) TO service_role;
COMMIT;
