BEGIN;
-- Preserve legacy cached counters and private star rows; report actual retained
-- row count separately without exposing voter identifiers or rewriting history.
CREATE OR REPLACE FUNCTION public.project_projection(p_actor uuid,p_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT to_jsonb(p)||jsonb_build_object('teamName',(SELECT name FROM public.admin_teams WHERE id=p.team_id),
 'actions',(SELECT coalesce(jsonb_agg(a),'[]') FROM unnest(ARRAY['read','create','update','delete'])a WHERE public.can_operate_project(p_actor,p.team_id,a)),
 'memberCount',(SELECT count(*) FROM public.project_members WHERE project_id=p.id AND is_active),
 'starCount',(SELECT count(*)::text FROM public.project_stars WHERE project_id=p.id))
 FROM public.projects p WHERE p.id=p_id AND public.can_operate_project(p_actor,p.team_id,'read');
$$;
REVOKE ALL ON FUNCTION public.project_projection(uuid,uuid) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.project_projection(uuid,uuid) TO service_role;
COMMIT;
