BEGIN;
DO $$ DECLARE name text;BEGIN
 FOREACH name IN ARRAY ARRAY['resources','sponsors','sponsorship_tiers','sponsor_impact_stats','team_members'] LOOP
  EXECUTE format('ALTER TABLE public.%I ADD COLUMN team_id uuid REFERENCES public.admin_teams(id),ADD COLUMN revision integer NOT NULL DEFAULT 1,ADD COLUMN deleted_at timestamptz,ADD COLUMN created_by uuid REFERENCES public.admin_users(id)',name);
 END LOOP;
END $$;
CREATE FUNCTION public.content_collection_table(p_kind text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE p_kind WHEN 'resources' THEN 'resources' WHEN 'sponsors' THEN 'sponsors' WHEN 'sponsor-tiers' THEN 'sponsorship_tiers'
  WHEN 'sponsor-stats' THEN 'sponsor_impact_stats' WHEN 'team-profiles' THEN 'team_members' ELSE NULL END;
$$;
CREATE FUNCTION public.can_operate_content(p_actor uuid,p_kind text,p_action text,p_team uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT public.content_collection_table(p_kind) IS NOT NULL AND EXISTS(SELECT 1 FROM public.admin_users u WHERE u.id=p_actor AND u.is_active AND
 (u.role IN ('super_admin','admin') OR (u.role='team_member' AND p_team IS NOT NULL AND EXISTS(
  SELECT 1 FROM public.team_memberships m JOIN public.admin_teams t ON t.id=m.team_id AND t.is_active
   JOIN public.team_page_access a ON a.team_id=m.team_id JOIN public.team_permissions p ON p.team_id=m.team_id
  WHERE m.admin_user_id=u.id AND m.is_active AND m.team_id=p_team AND a.can_access
   AND a.page_path=CASE p_kind WHEN 'resources' THEN '/admin/resources' WHEN 'team-profiles' THEN '/admin/team' ELSE '/admin/sponsors' END
   AND p.resource_type=CASE p_kind WHEN 'team-profiles' THEN 'team_members' WHEN 'resources' THEN 'resources' ELSE 'sponsors' END
   AND CASE p_action WHEN 'read' THEN p.can_read WHEN 'create' THEN p.can_create WHEN 'update' THEN p.can_update WHEN 'delete' THEN p.can_delete
    WHEN 'publish' THEN p.can_update AND p.permission IN ('publish',p.resource_type||'.publish') ELSE false END))))
$$;
CREATE FUNCTION public.list_content_records(p_actor uuid,p_kind text,p_page integer,p_size integer,p_filters jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE table_name text:=public.content_collection_table(p_kind);label text;result jsonb;BEGIN
 IF table_name IS NULL THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_page NOT BETWEEN 1 AND 10000 OR p_size NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid pagination' USING ERRCODE='22023';END IF;
 label:=CASE p_kind WHEN 'resources' THEN 'title' WHEN 'sponsor-tiers' THEN 'tier_name' WHEN 'sponsor-stats' THEN 'stat_label' ELSE 'name' END;
 EXECUTE format('WITH allowed AS (SELECT * FROM public.%I r WHERE public.can_operate_content($1,$2,''read'',r.team_id)
  AND (coalesce($3->>''state'',''current'')=''trash'')=(r.deleted_at IS NOT NULL)
  AND (coalesce($3->>''state'',''current'') NOT IN (''published'',''draft'') OR r.is_active=(($3->>''state'')=''published''))
  AND (NOT ($3 ? ''team'') OR r.team_id=($3->>''team'')::uuid)
  AND (coalesce($3->>''q'','''')='''' OR position(lower($3->>''q'') in lower(r.%I))>0)
 ), page AS (SELECT * FROM allowed ORDER BY order_index,id LIMIT $4 OFFSET $5)
 SELECT jsonb_build_object(''items'',coalesce((SELECT jsonb_agg(to_jsonb(page)||jsonb_build_object(''actions'',
 (SELECT jsonb_agg(action) FROM unnest(ARRAY[''read'',''update'',''delete'',''publish'',''create'']) action WHERE public.can_operate_content($1,$2,action,page.team_id)))) FROM page),''[]''),''total'',(SELECT count(*) FROM allowed))',table_name,label)
 INTO result USING p_actor,p_kind,p_filters,p_size,(p_page-1)*p_size;
 RETURN result;
END $$;
CREATE FUNCTION public.mutate_content_record(p_actor uuid,p_kind text,p_id uuid,p_action text,p_revision integer,p_document jsonb,p_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_table text:=public.content_collection_table(p_kind);allowed text[];record jsonb;next_record jsonb;target uuid;id uuid;team uuid;required_action text;
BEGIN
 IF v_table IS NULL THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 allowed:=CASE p_kind WHEN 'resources' THEN ARRAY['title','description','type','category','url','duration','level','status','provider','amount','requirements','materials','tags','speaker','icon','color','order_index','team_id']
  WHEN 'sponsors' THEN ARRAY['name','logo_url','website_url','tier','order_index','team_id']
  WHEN 'sponsor-tiers' THEN ARRAY['tier_name','tier_level','amount','color_gradient','benefits','order_index','team_id']
  WHEN 'sponsor-stats' THEN ARRAY['stat_label','stat_value','stat_description','icon_name','order_index','team_id']
  WHEN 'team-profiles' THEN ARRAY['name','role','bio','image_url','linkedin_url','github_url','email','team_section','order_index','team_id'] END;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_document) key WHERE NOT key=ANY(allowed)) THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 IF p_action='create' THEN
  team:=(p_document->>'team_id')::uuid;
  IF NOT public.can_operate_content(p_actor,p_kind,'create',team) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';END IF;
  id:=gen_random_uuid();
  next_record:=jsonb_build_object('id',id,'created_by',p_actor,'created_at',now(),'updated_at',now(),'order_index',0,'revision',1,'is_active',false,
   'views',0,'status','Available','benefits','[]'::jsonb,'team_section','Active Members')||p_document;
  EXECUTE format('INSERT INTO public.%1$I SELECT (jsonb_populate_record(NULL::public.%1$I,$1)).* RETURNING to_jsonb(%1$I)',v_table) INTO record USING next_record;
 ELSE
  EXECUTE format('SELECT to_jsonb(r) FROM public.%I r WHERE id=$1 FOR UPDATE',v_table) INTO record USING p_id;
  team:=(record->>'team_id')::uuid;
  IF record IS NULL OR NOT public.can_operate_content(p_actor,p_kind,'read',team) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  IF (record->>'revision')::integer IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'CONFLICT';END IF;
  required_action:=CASE p_action WHEN 'update' THEN 'update' WHEN 'publish' THEN 'publish' WHEN 'unpublish' THEN 'publish' WHEN 'archive' THEN 'delete' WHEN 'restore' THEN 'delete' WHEN 'duplicate' THEN 'create' ELSE NULL END;
  IF required_action IS NULL THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  IF NOT public.can_operate_content(p_actor,p_kind,required_action,team) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';END IF;
  IF p_action<>'restore' AND record->>'deleted_at' IS NOT NULL THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  IF p_action='duplicate' THEN
   id:=gen_random_uuid();next_record:=record||jsonb_build_object('id',id,'revision',1,'created_at',now(),'updated_at',now(),'created_by',p_actor,'is_active',false,'deleted_at',NULL);
   IF p_kind='team-profiles' THEN next_record:=next_record||jsonb_build_object('admin_user_id',NULL,'member_id',NULL,'email',NULL);END IF;
   EXECUTE format('INSERT INTO public.%1$I SELECT (jsonb_populate_record(NULL::public.%1$I,$1)).* RETURNING to_jsonb(%1$I)',v_table) INTO record USING next_record;
  ELSE
   next_record:=record;
   IF p_action='update' THEN
    target:=(p_document->>'team_id')::uuid;
    IF p_document ? 'team_id' AND target IS DISTINCT FROM team AND NOT public.can_operate_content(p_actor,p_kind,'create',target) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';END IF;
    next_record:=record||p_document;
   ELSIF p_action IN ('publish','unpublish') THEN next_record:=record||jsonb_build_object('is_active',p_action='publish');
   ELSIF p_action='archive' THEN next_record:=record||jsonb_build_object('is_active',false,'deleted_at',now());
   ELSIF p_action='restore' THEN next_record:=record||jsonb_build_object('is_active',false,'deleted_at',NULL);
   END IF;
   next_record:=next_record||jsonb_build_object('updated_at',now(),'revision',p_revision+1);
   EXECUTE format('UPDATE public.%1$I r SET (%2$s)=(SELECT %2$s FROM jsonb_populate_record(NULL::public.%1$I,$1)) WHERE id=$2 RETURNING to_jsonb(r)',v_table,
    array_to_string(ARRAY(SELECT quote_ident(c.column_name) FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name=v_table AND c.column_name<>'id' ORDER BY c.ordinal_position),','))
    INTO record USING next_record,p_id;
  END IF;
 END IF;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata) VALUES(p_actor,'content.'||p_kind||'.'||p_action,v_table,(record->>'id')::uuid,p_request,jsonb_build_object('revision',record->'revision'));
 RETURN record;
END $$;
REVOKE ALL ON FUNCTION public.content_collection_table(text),public.can_operate_content(uuid,text,text,uuid),public.list_content_records(uuid,text,integer,integer,jsonb),
 public.mutate_content_record(uuid,text,uuid,text,integer,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.content_collection_table(text),public.can_operate_content(uuid,text,text,uuid),public.list_content_records(uuid,text,integer,integer,jsonb),
 public.mutate_content_record(uuid,text,uuid,text,integer,jsonb,uuid) TO service_role;
COMMIT;
