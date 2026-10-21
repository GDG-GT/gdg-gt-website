BEGIN;
CREATE FUNCTION public.read_media_event_options(p_actor uuid,p_session uuid,p_team uuid,p_query text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NOT gdg_security.member_transfer_session(p_actor,p_session) OR NOT public.can_operate_media(p_actor,p_team,'read') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF length(coalesce(p_query,''))>100 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(e)) FROM(SELECT id,title,publication_status FROM public.events WHERE team_id IS NOT DISTINCT FROM p_team AND publication_status<>'archived'
  AND(publication_status='published' OR public.can_operate_event(p_actor,'read',team_id)) AND(coalesce(p_query,'')='' OR strpos(lower(title),lower(p_query))>0) ORDER BY start_at DESC,id LIMIT 50)e),'[]');
END $$;
REVOKE ALL ON FUNCTION public.read_media_event_options(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.read_media_event_options(uuid,uuid,uuid,text) TO service_role;
COMMIT;
