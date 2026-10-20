BEGIN;
ALTER TABLE public.site_settings ADD COLUMN is_active boolean NOT NULL DEFAULT true;
DO $$ DECLARE name text;BEGIN
 FOREACH name IN ARRAY ARRAY['site_settings','page_content','navigation_items','social_links','footer_content'] LOOP
  EXECUTE format('ALTER TABLE public.%I ADD COLUMN revision integer NOT NULL DEFAULT 1,ADD COLUMN deleted_at timestamptz',name);
 END LOOP;
END $$;
CREATE FUNCTION public.can_manage_site_content(p_actor uuid,p_action text) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.admin_users u WHERE u.id=p_actor AND u.is_active AND
 (u.role IN ('admin','super_admin') OR (u.role='team_member' AND EXISTS(
  SELECT 1 FROM public.team_memberships m JOIN public.admin_teams t ON t.id=m.team_id AND t.is_active
   JOIN public.team_permissions p ON p.team_id=m.team_id JOIN public.team_page_access a ON a.team_id=m.team_id
  WHERE m.admin_user_id=u.id AND m.is_active AND a.page_path='/admin/content' AND a.can_access AND p.resource_type IN ('content','site_content')
   AND CASE p_action WHEN 'read' THEN p.can_read WHEN 'create' THEN p.can_create WHEN 'update' THEN p.can_update WHEN 'delete' THEN p.can_delete
    WHEN 'publish' THEN p.can_update AND p.permission IN ('publish','content.publish','site_content.publish') ELSE false END))))
$$;
CREATE FUNCTION public.mutate_site_content(p_actor uuid,p_kind text,p_id uuid,p_action text,p_revision integer,p_document jsonb,p_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_table text;allowed text[];record jsonb;next_record jsonb;action text;created uuid;
BEGIN
 v_table:=CASE p_kind WHEN 'settings' THEN 'site_settings' WHEN 'pages' THEN 'page_content' WHEN 'navigation' THEN 'navigation_items' WHEN 'social' THEN 'social_links' WHEN 'footer' THEN 'footer_content' ELSE NULL END;
 IF v_table IS NULL THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF NOT public.can_manage_site_content(p_actor,'read') THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';END IF;
 allowed:=CASE p_kind WHEN 'settings' THEN ARRAY['key','value','description'] WHEN 'pages' THEN ARRAY['page_slug','section_key','content','order_index']
  WHEN 'navigation' THEN ARRAY['label','href','icon','order_index','parent_id'] WHEN 'social' THEN ARRAY['platform','url','icon','order_index'] WHEN 'footer' THEN ARRAY['section_key','content','order_index'] END;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_document) key WHERE NOT key=ANY(allowed)) THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 action:=CASE p_action WHEN 'create' THEN 'create' WHEN 'update' THEN 'update' WHEN 'archive' THEN 'delete' WHEN 'restore' THEN 'delete' WHEN 'publish' THEN 'publish' WHEN 'unpublish' THEN 'publish' ELSE NULL END;
 IF action IS NULL THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
 IF NOT public.can_manage_site_content(p_actor,action) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';END IF;
 -- Serialize navigation hierarchy checks and unique setting/section edits.
 PERFORM pg_advisory_xact_lock(hashtextextended('site-content:'||p_kind,0));
 IF p_action='create' THEN
  next_record:=jsonb_build_object('id',gen_random_uuid(),'updated_at',now(),'updated_by',p_actor,'revision',1,'is_active',false,'order_index',0)||p_document;
 ELSE
  EXECUTE format('SELECT to_jsonb(r) FROM public.%I r WHERE id=$1 FOR UPDATE',v_table) INTO record USING p_id;
  IF record IS NULL THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  IF (record->>'revision')::integer IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'CONFLICT';END IF;
  IF record->>'deleted_at' IS NOT NULL AND p_action<>'restore' THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  next_record:=record||jsonb_build_object('updated_at',now(),'updated_by',p_actor,'revision',p_revision+1);
  IF p_action='update' THEN next_record:=next_record||p_document||'{"is_active":false}';
  ELSIF p_action='publish' THEN next_record:=next_record||'{"is_active":true}';
  ELSIF p_action='unpublish' THEN next_record:=next_record||'{"is_active":false}';
  ELSIF p_action='archive' THEN next_record:=next_record||jsonb_build_object('deleted_at',now(),'is_active',false);
  ELSIF p_action='restore' THEN next_record:=next_record||jsonb_build_object('deleted_at',NULL,'is_active',false);END IF;
 END IF;
 IF p_kind='navigation' AND next_record->>'parent_id' IS NOT NULL THEN
  IF p_id=(next_record->>'parent_id')::uuid OR NOT EXISTS(SELECT 1 FROM public.navigation_items WHERE id=(next_record->>'parent_id')::uuid AND deleted_at IS NULL AND parent_id IS NULL)
   OR EXISTS(SELECT 1 FROM public.navigation_items WHERE parent_id=p_id AND deleted_at IS NULL) THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
 END IF;
 IF p_action='create' THEN
  EXECUTE format('INSERT INTO public.%1$I SELECT (jsonb_populate_record(NULL::public.%1$I,$1)).* RETURNING to_jsonb(%1$I)',v_table) INTO record USING next_record;
 ELSE
  EXECUTE format('UPDATE public.%1$I r SET (%2$s)=(SELECT %2$s FROM jsonb_populate_record(NULL::public.%1$I,$1)) WHERE id=$2 RETURNING to_jsonb(r)',v_table,
   array_to_string(ARRAY(SELECT quote_ident(c.column_name) FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name=v_table AND c.column_name<>'id' ORDER BY c.ordinal_position),',')) INTO record USING next_record,p_id;
 END IF;
 created:=(record->>'id')::uuid;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata) VALUES(p_actor,'site_content.'||p_kind||'.'||p_action,v_table,created,p_request,jsonb_build_object('revision',record->'revision'));
 RETURN record;
END $$;
REVOKE ALL ON FUNCTION public.can_manage_site_content(uuid,text),public.mutate_site_content(uuid,text,uuid,text,integer,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_site_content(uuid,text),public.mutate_site_content(uuid,text,uuid,text,integer,jsonb,uuid) TO service_role;
COMMIT;
