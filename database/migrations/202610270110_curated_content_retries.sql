BEGIN;
-- Atomic mutation receipts share the existing bounded, service-only retry store.
-- Every replay rechecks the live session and current resource/action grants.
CREATE FUNCTION public.mutate_curated_content(
 p_actor uuid,p_session uuid,p_namespace text,p_kind text,p_id uuid,p_action text,
 p_revision integer,p_document jsonb,p_key_hash text,p_request_hash text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_table text;v_required text;v_scope text;v_row jsonb;v_result jsonb;
 v_key public.idempotency_keys;v_team uuid;v_target uuid;v_result_team uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));
 PERFORM 1 FROM public.admin_users u JOIN public.admin_sessions s ON s.admin_user_id=u.id
 WHERE u.id=p_actor AND u.is_active AND u.deleted_at IS NULL AND NOT u.must_change_password
 AND(u.locked_until IS NULL OR u.locked_until<=now()) AND s.id=p_session AND s.revoked_at IS NULL
 AND s.idle_expires_at>now() AND s.absolute_expires_at>now() FOR SHARE OF u,s;
 IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';END IF;
 IF p_namespace IS NULL OR p_namespace NOT IN('site','collection') OR p_action IS NULL
 OR p_action NOT IN('create','update','publish','unpublish','archive','restore','duplicate')
 OR p_document IS NULL OR jsonb_typeof(p_document)<>'object'
 OR p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$'
 OR p_request_hash IS NULL OR p_request_hash!~'^[a-f0-9]{64}$'
 OR (p_action='create') IS DISTINCT FROM (p_id IS NULL) THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 v_required:=CASE WHEN p_action IN('archive','restore') THEN 'delete'
  WHEN p_action IN('publish','unpublish') THEN 'publish'
  WHEN p_action IN('create','duplicate') THEN 'create' ELSE 'update' END;
 IF p_namespace='site' THEN
  v_table:=CASE p_kind WHEN 'settings' THEN 'site_settings' WHEN 'pages' THEN 'page_content'
   WHEN 'navigation' THEN 'navigation_items' WHEN 'social' THEN 'social_links' WHEN 'footer' THEN 'footer_content' END;
  IF v_table IS NULL OR p_action='duplicate' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
  IF NOT public.can_manage_site_content(p_actor,'read') OR NOT public.can_manage_site_content(p_actor,v_required)
   THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';END IF;
 ELSE
  v_table:=public.content_collection_table(p_kind);
  IF v_table IS NULL THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 END IF;
 -- Actor-bound keys span collections/actions, so changing their intent conflicts.
 v_scope:='curated-content:'||p_actor;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_scope||':'||p_key_hash,0));
 IF p_id IS NOT NULL THEN
  EXECUTE format('SELECT to_jsonb(r) FROM public.%I r WHERE id=$1 FOR UPDATE',v_table) INTO v_row USING p_id;
  IF v_row IS NULL THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  v_team:=(v_row->>'team_id')::uuid;
 ELSE v_team:=(p_document->>'team_id')::uuid;END IF;
 IF p_namespace='collection' THEN
  IF NOT public.can_operate_content(p_actor,p_kind,'read',v_team)
   OR NOT public.can_operate_content(p_actor,p_kind,v_required,v_team)
   THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';END IF;
  v_target:=(p_document->>'team_id')::uuid;
  IF p_action='update' AND p_document ? 'team_id' AND v_target IS DISTINCT FROM v_team
   AND NOT public.can_operate_content(p_actor,p_kind,'create',v_target)
   THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';END IF;
 END IF;
 SELECT * INTO v_key FROM public.idempotency_keys WHERE scope=v_scope AND key_hash=p_key_hash;
 IF FOUND THEN
  IF v_key.request_hash IS DISTINCT FROM p_request_hash THEN RAISE EXCEPTION 'CONFLICT';END IF;
  -- A created/duplicated result may since have moved teams or been removed.
  EXECUTE format('SELECT to_jsonb(r) FROM public.%I r WHERE id=$1 FOR SHARE',v_table) INTO v_result USING (v_key.result->>'id')::uuid;
  IF v_result IS NULL THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  v_result_team:=(v_result->>'team_id')::uuid;
  IF p_namespace='collection' AND NOT public.can_operate_content(p_actor,p_kind,'read',v_result_team)
   THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  RETURN v_key.result;
 END IF;
 IF p_namespace='site' THEN
  v_result:=public.mutate_site_content(p_actor,p_kind,p_id,p_action,p_revision,p_document,p_request_id);
 ELSE
  v_result:=public.mutate_content_record(p_actor,p_kind,p_id,p_action,p_revision,p_document,p_request_id);
 END IF;
 INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result)
 VALUES(v_scope,p_key_hash,p_request_hash,200,v_result);
 RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.mutate_curated_content(uuid,uuid,text,text,uuid,text,integer,jsonb,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mutate_curated_content(uuid,uuid,text,text,uuid,text,integer,jsonb,text,text,uuid) TO service_role;
COMMIT;
