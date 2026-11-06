BEGIN;
ALTER TABLE public.form_collaborators ADD COLUMN record_id uuid NOT NULL DEFAULT gen_random_uuid(),ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK(revision>=1),ADD CONSTRAINT form_collaborator_record_unique UNIQUE(record_id);
CREATE FUNCTION gdg_security.advance_form_collaborator_revision() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN NEW.record_id:=OLD.record_id;NEW.revision:=OLD.revision+1;NEW.updated_at:=clock_timestamp();RETURN NEW;END $$;
CREATE TRIGGER advance_form_collaborator_revision BEFORE UPDATE ON public.form_collaborators FOR EACH ROW EXECUTE FUNCTION gdg_security.advance_form_collaborator_revision();
CREATE FUNCTION gdg_security.form_collaborator_access(p_actor uuid,p_session uuid,p_form uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT gdg_security.member_transfer_session(p_actor,p_session) AND EXISTS(SELECT 1 FROM public.forms WHERE id=p_form AND permanently_deleted_at IS NULL)
 AND public.can_operate_form(p_actor,p_form,'view') AND public.can_operate_form(p_actor,p_form,'manage_access');
$$;
CREATE FUNCTION gdg_security.form_collaborator_target_eligible(p_form uuid,p_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.forms f JOIN public.admin_users u ON u.id=p_user AND u.is_active AND u.deleted_at IS NULL AND u.role<>'blog_editor' AND u.id<>f.owner_id
 WHERE f.id=p_form AND(f.team_id IS NULL OR u.role IN('admin','super_admin') OR EXISTS(SELECT 1 FROM public.team_memberships m JOIN public.admin_teams t ON t.id=m.team_id
  WHERE m.team_id=f.team_id AND m.admin_user_id=u.id AND m.is_active AND t.is_active AND t.deleted_at IS NULL)));
$$;
CREATE OR REPLACE FUNCTION public.list_form_access_accounts(p_actor uuid,p_form uuid,p_kind text,p_page integer,p_size integer,p_query text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE v public.forms;v_items jsonb;v_total integer;
BEGIN
 IF p_kind IS NULL OR p_kind NOT IN('candidates','collaborators') OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 10000
 OR p_size IS NULL OR p_size NOT BETWEEN 1 AND 100 OR length(p_query)>100 THEN
  RAISE EXCEPTION 'Invalid access inventory filter' USING ERRCODE='22023';END IF;
 SELECT * INTO v FROM public.forms WHERE id=p_form;
 IF NOT FOUND OR NOT public.can_operate_form(p_actor,p_form,'manage_access') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 WITH eligible AS (
  SELECT u.id,coalesce(nullif(u.display_name,''),'Chapter account') AS display_name,u.role,
   coalesce(c.actions,ARRAY[]::text[]) AS actions,c.created_at,c.updated_at,c.record_id AS grant_id,coalesce(c.revision,0) AS grant_revision
  FROM public.admin_users u LEFT JOIN public.form_collaborators c ON c.form_id=p_form AND c.admin_user_id=u.id
  WHERE (p_kind='collaborators' AND c.admin_user_id IS NOT NULL OR p_kind='candidates' AND
   u.is_active AND u.deleted_at IS NULL AND u.role<>'blog_editor' AND u.id<>v.owner_id AND
   (v.team_id IS NULL OR u.role IN('admin','super_admin') OR EXISTS(
    SELECT 1 FROM public.team_memberships m JOIN public.admin_teams t ON t.id=m.team_id
    WHERE m.team_id=v.team_id AND m.admin_user_id=u.id AND m.is_active AND t.is_active AND t.deleted_at IS NULL)))
  AND (p_query IS NULL OR strpos(lower(coalesce(nullif(u.display_name,''),'Chapter account')),lower(p_query))>0)
 ), page AS (
  SELECT * FROM eligible ORDER BY display_name,id LIMIT p_size OFFSET (p_page-1)*p_size
 ) SELECT (SELECT count(*) FROM eligible),coalesce(jsonb_agg(
  CASE WHEN p_kind='candidates' THEN jsonb_build_object('id',page.id,'display_name',page.display_name,'role',page.role,'actions',page.actions,'grantId',page.grant_id,'grantRevision',page.grant_revision)
  ELSE jsonb_build_object('admin_user_id',page.id,'display_name',page.display_name,'role',page.role,'actions',page.actions,'created_at',page.created_at,'updated_at',page.updated_at,'grantId',page.grant_id,'grantRevision',page.grant_revision) END
  ORDER BY page.display_name,page.id),'[]'::jsonb) INTO v_total,v_items FROM page;
 RETURN jsonb_build_object('items',v_items,'total',v_total,'page',p_page,'pageSize',p_size);
END $$;

CREATE FUNCTION public.read_form_collaborator_accounts(p_actor uuid,p_session uuid,p_form uuid,p_kind text,p_page integer,p_size integer,p_query text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NOT gdg_security.form_collaborator_access(p_actor,p_session,p_form) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 RETURN public.list_form_access_accounts(p_actor,p_form,p_kind,p_page,p_size,p_query);
END $$;
CREATE FUNCTION public.inspect_form_collaborator_write(p_actor uuid,p_session uuid,p_form uuid,p_user uuid,p_action text,p_key_hash text,p_request_hash text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE f public.forms;c public.form_collaborators;k public.idempotency_keys;grant_meta jsonb;can_save boolean;can_remove boolean;BEGIN
 IF p_action IS NULL OR p_action NOT IN('save','remove') OR p_user IS NULL OR p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$' OR(p_request_hash IS NOT NULL AND p_request_hash!~'^[a-f0-9]{64}$') THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 IF NOT gdg_security.form_collaborator_access(p_actor,p_session,p_form) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT * INTO f FROM public.forms WHERE id=p_form;
 SELECT * INTO c FROM public.form_collaborators WHERE form_id=p_form AND admin_user_id=p_user;
 grant_meta:=CASE WHEN c.record_id IS NULL THEN NULL ELSE jsonb_build_object('id',c.record_id,'revision',c.revision,'actions',c.actions) END;
 can_save:=gdg_security.form_collaborator_target_eligible(p_form,p_user);
 can_remove:=c.record_id IS NOT NULL AND p_user<>f.owner_id;
 SELECT * INTO k FROM public.idempotency_keys WHERE scope='form-collaborator-write:'||p_actor||':'||p_session AND key_hash=p_key_hash;
 IF FOUND THEN
  IF k.result->>'formId' IS DISTINCT FROM p_form::text OR k.result->>'userId' IS DISTINCT FROM p_user::text OR k.result->>'action' IS DISTINCT FROM p_action
    OR(p_request_hash IS NOT NULL AND k.request_hash IS DISTINCT FROM p_request_hash) THEN RAISE EXCEPTION 'CONFLICT';END IF;
  IF k.expires_at<=now() THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
 END IF;
 RETURN jsonb_build_object('committed',k.key_hash IS NOT NULL,'canRetry',k.key_hash IS NULL AND CASE WHEN p_action='save' THEN can_save ELSE can_remove END,
  'formId',p_form,'userId',p_user,'formRevision',f.draft_revision,'allowedActions',coalesce((SELECT jsonb_agg(a) FROM unnest(ARRAY['view','edit','publish','manage_access','view_responses','view_sensitive_responses','export_responses','delete'])a WHERE public.can_operate_form(p_actor,p_form,a)),'[]'::jsonb),'canSave',can_save,'canRemove',can_remove,'grant',grant_meta,
  'receipt',CASE WHEN k.key_hash IS NULL THEN NULL ELSE k.result END);
END $$;
CREATE FUNCTION public.mutate_form_collaborator_write(p_actor uuid,p_session uuid,p_form uuid,p_user uuid,p_action text,p_document jsonb,p_key_hash text,p_request_hash text,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE f public.forms;c public.form_collaborators;inspected jsonb;expected_id uuid;expected_revision integer;result jsonb;actions text[];receipt jsonb;BEGIN
 IF p_document IS NULL OR jsonb_typeof(p_document)<>'object' OR p_request_hash IS NULL OR p_request_hash!~'^[a-f0-9]{64}$'
  OR jsonb_typeof(p_document->'formRevision') IS DISTINCT FROM 'number' OR(p_document->>'formRevision')::numeric<1 OR(p_document->>'formRevision')::numeric<>trunc((p_document->>'formRevision')::numeric)
  OR jsonb_typeof(p_document->'grantRevision') IS DISTINCT FROM 'number' OR(p_document->>'grantRevision')::numeric<0 OR(p_document->>'grantRevision')::numeric<>trunc((p_document->>'grantRevision')::numeric)
  OR NOT p_document ? 'grantId' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 expected_id:=(p_document->>'grantId')::uuid;expected_revision:=(p_document->>'grantRevision')::integer;
 IF(expected_id IS NULL AND expected_revision<>0) OR(expected_id IS NOT NULL AND expected_revision<1) OR(p_action='remove' AND expected_id IS NULL) THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));
 PERFORM 1 FROM public.admin_users WHERE id=p_actor FOR UPDATE;
 PERFORM 1 FROM public.admin_sessions WHERE id=p_session AND admin_user_id=p_actor FOR UPDATE;
 SELECT * INTO f FROM public.forms WHERE id=p_form FOR UPDATE;
 SELECT * INTO c FROM public.form_collaborators WHERE form_id=p_form AND admin_user_id=p_user FOR UPDATE;
 inspected:=public.inspect_form_collaborator_write(p_actor,p_session,p_form,p_user,p_action,p_key_hash,p_request_hash);
 IF(inspected->>'committed')::boolean THEN RETURN inspected;END IF;
 IF f.draft_revision IS DISTINCT FROM(p_document->>'formRevision')::integer OR c.record_id IS DISTINCT FROM expected_id OR coalesce(c.revision,0) IS DISTINCT FROM expected_revision THEN RAISE EXCEPTION 'CONFLICT';END IF;
 IF NOT(inspected->>'canRetry')::boolean THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
 actions:=CASE WHEN p_action='remove' THEN ARRAY[]::text[] ELSE ARRAY(SELECT jsonb_array_elements_text(p_document->'actions')) END;
 PERFORM public.mutate_form_collaborator(p_actor,p_form,p_user,actions,p_action='remove',p_request_id);
 SELECT * INTO c FROM public.form_collaborators WHERE form_id=p_form AND admin_user_id=p_user;
 receipt:=jsonb_build_object('formId',p_form,'userId',p_user,'action',p_action);
 INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result) VALUES('form-collaborator-write:'||p_actor||':'||p_session,p_key_hash,p_request_hash,200,receipt);
 RETURN jsonb_build_object('committed',true,'canRetry',false,'formId',p_form,'userId',p_user,'formRevision',f.draft_revision,
  'allowedActions',inspected->'allowedActions','canSave',gdg_security.form_collaborator_target_eligible(p_form,p_user),'canRemove',c.record_id IS NOT NULL AND p_user<>f.owner_id,
  'grant',CASE WHEN c.record_id IS NULL THEN NULL ELSE jsonb_build_object('id',c.record_id,'revision',c.revision,'actions',c.actions) END,'receipt',receipt);
END $$;
REVOKE ALL ON FUNCTION gdg_security.advance_form_collaborator_revision(),gdg_security.form_collaborator_access(uuid,uuid,uuid),gdg_security.form_collaborator_target_eligible(uuid,uuid),
 public.read_form_collaborator_accounts(uuid,uuid,uuid,text,integer,integer,text),public.inspect_form_collaborator_write(uuid,uuid,uuid,uuid,text,text,text),
 public.mutate_form_collaborator_write(uuid,uuid,uuid,uuid,text,jsonb,text,text,uuid) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION gdg_security.advance_form_collaborator_revision(),gdg_security.form_collaborator_access(uuid,uuid,uuid),gdg_security.form_collaborator_target_eligible(uuid,uuid),
 public.read_form_collaborator_accounts(uuid,uuid,uuid,text,integer,integer,text),public.inspect_form_collaborator_write(uuid,uuid,uuid,uuid,text,text,text),
 public.mutate_form_collaborator_write(uuid,uuid,uuid,uuid,text,jsonb,text,text,uuid) TO service_role;
COMMIT;
