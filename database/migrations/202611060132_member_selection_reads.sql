BEGIN;
CREATE FUNCTION gdg_security.member_merge_source(p_actor uuid,p_session uuid,p_source uuid) RETURNS public.members
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE source public.members;BEGIN
 IF NOT gdg_security.member_transfer_session(p_actor,p_session) OR NOT public.can_operate_member(p_actor,NULL,'merge') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT * INTO source FROM public.members WHERE id=p_source;
 IF source.id IS NULL OR source.merged_into_id IS NOT NULL OR NOT public.can_operate_member(p_actor,source.team_id,'merge') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 RETURN source;
END $$;
CREATE FUNCTION public.member_merge_candidates(p_actor uuid,p_session uuid,p_source uuid,p_page integer,p_query text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE source public.members;result jsonb;BEGIN
 source:=gdg_security.member_merge_source(p_actor,p_session,p_source);
 IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 10000 OR length(coalesce(p_query,''))>100 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 WITH eligible AS(SELECT m.* FROM public.members m WHERE m.id<>source.id AND m.team_id IS NOT DISTINCT FROM source.team_id AND m.is_active AND m.deleted_at IS NULL AND m.merged_into_id IS NULL AND public.can_operate_member(p_actor,m.team_id,'merge') AND(coalesce(p_query,'')='' OR strpos(lower(m.name||' '||m.email),lower(p_query))>0)),
 page AS(SELECT * FROM eligible ORDER BY lower(name),id LIMIT 30 OFFSET(p_page-1)*30)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'email',email,'revision',revision,'team_id',team_id) ORDER BY lower(name),id) FROM page),'[]'),'total',(SELECT count(*) FROM eligible),'page',p_page,'pageSize',30,'sourceRevision',source.revision) INTO result;
 RETURN result;
END $$;
CREATE FUNCTION public.member_merge_target(p_actor uuid,p_session uuid,p_source uuid,p_target uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE source public.members;target public.members;BEGIN
 source:=gdg_security.member_merge_source(p_actor,p_session,p_source);
 SELECT * INTO target FROM public.members WHERE id=p_target AND id<>source.id AND team_id IS NOT DISTINCT FROM source.team_id AND is_active AND deleted_at IS NULL AND merged_into_id IS NULL;
 IF target.id IS NULL OR NOT public.can_operate_member(p_actor,target.team_id,'merge') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 RETURN jsonb_build_object('member',public.community_member_projection(p_actor,target.id),'sourceRevision',source.revision);
END $$;
CREATE FUNCTION public.member_creation_destinations(p_actor uuid,p_session uuid,p_page integer) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;BEGIN
 IF NOT gdg_security.member_transfer_session(p_actor,p_session) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 WITH eligible AS(SELECT id,name FROM public.admin_teams WHERE is_active AND deleted_at IS NULL AND public.can_operate_member(p_actor,id,'read') AND public.can_operate_member(p_actor,id,'create')),
 page AS(SELECT * FROM eligible ORDER BY lower(name),id LIMIT 100 OFFSET(p_page-1)*100)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY lower(name),id) FROM page),'[]'),'total',(SELECT count(*) FROM eligible),'page',p_page,'pageSize',100) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION gdg_security.member_merge_source(uuid,uuid,uuid),public.member_merge_candidates(uuid,uuid,uuid,integer,text),public.member_merge_target(uuid,uuid,uuid,uuid),public.member_creation_destinations(uuid,uuid,integer) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION gdg_security.member_merge_source(uuid,uuid,uuid),public.member_merge_candidates(uuid,uuid,uuid,integer,text),public.member_merge_target(uuid,uuid,uuid,uuid),public.member_creation_destinations(uuid,uuid,integer) TO service_role;
COMMIT;
