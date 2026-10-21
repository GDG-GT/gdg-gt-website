BEGIN;
-- Lists/pickers do not need the detail view's phone, academic values or interests.
CREATE OR REPLACE FUNCTION public.list_community_members(p_actor uuid,p_page integer,p_query text,p_state text,p_category text,p_year text,p_active boolean,p_core boolean) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE r jsonb;BEGIN
 IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 10000 OR p_state IS NULL OR p_state NOT IN('current','trash') OR length(coalesce(p_query,''))>100 OR length(coalesce(p_year,''))>50 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 WITH eligible AS(SELECT * FROM public.members m WHERE public.can_operate_member(p_actor,m.team_id,'read') AND(m.deleted_at IS NOT NULL)=(p_state='trash')
 AND(coalesce(p_query,'')='' OR strpos(lower(m.name||' '||m.email||' '||coalesce(m.major,'')),lower(p_query))>0)
 AND(p_category IS NULL OR m.category=p_category) AND(p_year IS NULL OR m.year=p_year) AND(p_active IS NULL OR m.is_active=p_active) AND(p_core IS NULL OR m.is_core_team=p_core)),
 page AS(SELECT * FROM eligible ORDER BY updated_at DESC,id DESC LIMIT 30 OFFSET(p_page-1)*30)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(public.community_member_projection(p_actor,id)-ARRAY['phone','year','major','interests'] ORDER BY updated_at DESC,id DESC) FROM page),'[]'),'total',(SELECT count(*) FROM eligible),'pageSize',30,
 'stats',jsonb_build_object('active',(SELECT count(*) FROM eligible WHERE is_active),'core',(SELECT count(*) FROM eligible WHERE is_core_team),
 'categories',coalesce((SELECT jsonb_object_agg(category,n) FROM(SELECT category,count(*) n FROM eligible GROUP BY category)x),'{}'))) INTO r;RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.list_community_members(uuid,integer,text,text,text,text,boolean,boolean) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.list_community_members(uuid,integer,text,text,text,text,boolean,boolean) TO service_role;
COMMIT;
