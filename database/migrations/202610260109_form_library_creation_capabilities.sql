BEGIN;
-- Derive creation/copy capabilities in the existing authorized inventory read.
-- Copying uses the destination scope's create grant, independently of edit.
CREATE OR REPLACE FUNCTION public.list_form_library(p_actor uuid,p_page integer,p_size integer,p_query text,p_team uuid,p_owner uuid,p_state text,
 p_from date,p_to date,p_template text,p_chapter boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE v_items jsonb;v_total integer;
BEGIN
 IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 10000 OR p_size IS NULL OR p_size NOT BETWEEN 1 AND 100 OR length(p_query)>100
 OR (p_from IS NOT NULL AND p_to IS NOT NULL AND p_from>p_to)
 OR (p_state IS NOT NULL AND p_state NOT IN ('Draft','Open','Scheduled','Closed','Archived'))
 OR (p_template IS NOT NULL AND p_template NOT IN ('blank','interest','feedback','volunteer','application','survey','unspecified'))
 OR (p_chapter AND p_team IS NOT NULL) THEN RAISE EXCEPTION 'Invalid library filter' USING ERRCODE='22023';END IF;
 WITH eligible AS (
  SELECT f.* FROM public.forms f WHERE public.can_operate_form(p_actor,f.id,'view')
   AND (p_query IS NULL OR strpos(lower(f.title),lower(p_query))>0)
   AND (p_team IS NULL OR f.team_id=p_team) AND (NOT coalesce(p_chapter,false) OR f.team_id IS NULL)
   AND (p_owner IS NULL OR f.owner_id=p_owner) AND (p_state IS NULL OR f.state=p_state)
   AND (p_from IS NULL OR f.updated_at>=(p_from::timestamp AT TIME ZONE 'UTC'))
   AND (p_to IS NULL OR f.updated_at<((p_to+1)::timestamp AT TIME ZONE 'UTC'))
   AND (p_template IS NULL OR CASE WHEN p_template='unspecified' THEN f.template_key IS NULL ELSE f.template_key=p_template END)
 ), page AS (
  SELECT * FROM eligible ORDER BY updated_at DESC,id LIMIT p_size OFFSET (p_page-1)*p_size
 ) SELECT (SELECT count(*) FROM eligible),coalesce(jsonb_agg(to_jsonb(page)||jsonb_build_object(
  'owner_label',(SELECT coalesce(nullif(u.display_name,''),'Chapter user') FROM public.admin_users u WHERE u.id=page.owner_id),
  'team_label',CASE WHEN page.team_id IS NULL THEN 'Chapter' ELSE (SELECT t.name FROM public.admin_teams t WHERE t.id=page.team_id) END,
  'response_count',CASE WHEN public.can_operate_form(p_actor,page.id,'view_responses') THEN
   (SELECT count(*) FROM public.form_responses WHERE form_id=page.id AND deleted_at IS NULL) ELSE NULL END,
  'can_duplicate',public.can_operate_form(p_actor,NULL,'create',page.team_id),
  'actions',(SELECT jsonb_agg(a) FROM unnest(ARRAY['view','edit','publish','manage_access','view_responses','view_sensitive_responses','export_responses','delete']) a WHERE public.can_operate_form(p_actor,page.id,a))
 ) ORDER BY page.updated_at DESC,page.id),'[]'::jsonb) INTO v_total,v_items FROM page;
 RETURN jsonb_build_object('items',v_items,'total',v_total,'page',p_page,'pageSize',p_size,
  'canCreate',public.can_operate_form(p_actor,NULL,'create'));
END $$;
REVOKE ALL ON FUNCTION public.list_form_library(uuid,integer,integer,text,uuid,uuid,text,date,date,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_form_library(uuid,integer,integer,text,uuid,uuid,text,date,date,text,boolean) TO service_role;
COMMIT;
