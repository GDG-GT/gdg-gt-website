BEGIN;
-- Creation provenance is organizational metadata, never authorization. Unknown
-- historical origins stay NULL instead of being guessed from question text.
ALTER TABLE public.forms ADD COLUMN template_key text
 CHECK(template_key IN ('blank','interest','feedback','volunteer','application','survey'));
CREATE INDEX forms_library_updated ON public.forms(updated_at DESC,id);
CREATE INDEX forms_library_owner ON public.forms(owner_id,updated_at DESC,id);
CREATE INDEX forms_library_team ON public.forms(team_id,updated_at DESC,id);
CREATE INDEX forms_library_template ON public.forms(template_key,updated_at DESC,id);

CREATE FUNCTION public.create_form_from_template(p_actor uuid,p_document jsonb,p_template text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v jsonb;
BEGIN
 IF p_template IS NOT NULL AND p_template NOT IN ('blank','interest','feedback','volunteer','application','survey') THEN
  RAISE EXCEPTION 'Invalid template' USING ERRCODE='22023';END IF;
 -- The existing transactional entry retains account/scope/media authorization,
 -- publication checks and audit. Provenance cannot bypass any of those checks.
 v:=public.mutate_form(p_actor,NULL,'create',NULL,p_document,NULL,p_request_id);
 UPDATE public.forms SET template_key=p_template WHERE id=(v->>'id')::uuid;
 RETURN v||jsonb_build_object('template_key',p_template);
END $$;

CREATE FUNCTION public.list_form_library(p_actor uuid,p_page integer,p_size integer,p_query text,p_team uuid,p_owner uuid,p_state text,
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
  'actions',(SELECT jsonb_agg(a) FROM unnest(ARRAY['view','edit','publish','manage_access','view_responses','view_sensitive_responses','export_responses','delete']) a WHERE public.can_operate_form(p_actor,page.id,a))
 ) ORDER BY page.updated_at DESC,page.id),'[]'::jsonb) INTO v_total,v_items FROM page;
 RETURN jsonb_build_object('items',v_items,'total',v_total,'page',p_page,'pageSize',p_size);
END $$;

CREATE FUNCTION public.list_form_library_options(p_actor uuid,p_kind text,p_page integer,p_size integer,p_query text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE v_items jsonb;v_total integer;
BEGIN
 IF p_kind IS NULL OR p_kind NOT IN ('owner','team') OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 10000
 OR p_size IS NULL OR p_size NOT BETWEEN 1 AND 100 OR length(p_query)>100 THEN
  RAISE EXCEPTION 'Invalid library options' USING ERRCODE='22023';END IF;
 WITH visible AS MATERIALIZED (
  SELECT f.owner_id,f.team_id FROM public.forms f WHERE public.can_operate_form(p_actor,f.id,'view')
 ), options AS (
  SELECT DISTINCT u.id,coalesce(nullif(u.display_name,''),'Chapter user') label
   FROM visible f JOIN public.admin_users u ON u.id=f.owner_id WHERE p_kind='owner'
  UNION
  SELECT DISTINCT t.id,t.name label FROM visible f JOIN public.admin_teams t ON t.id=f.team_id WHERE p_kind='team'
 ), eligible AS (
  SELECT * FROM options WHERE p_query IS NULL OR strpos(lower(label),lower(p_query))>0
 ), page AS (
  SELECT * FROM eligible ORDER BY lower(label),id LIMIT p_size OFFSET (p_page-1)*p_size
 ) SELECT (SELECT count(*) FROM eligible),coalesce(jsonb_agg(to_jsonb(page) ORDER BY lower(page.label),page.id),'[]'::jsonb)
 INTO v_total,v_items FROM page;
 RETURN jsonb_build_object('items',v_items,'total',v_total,'page',p_page,'pageSize',p_size);
END $$;

REVOKE ALL ON FUNCTION public.create_form_from_template(uuid,jsonb,text,uuid),
 public.list_form_library(uuid,integer,integer,text,uuid,uuid,text,date,date,text,boolean),
 public.list_form_library_options(uuid,text,integer,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_form_from_template(uuid,jsonb,text,uuid),
 public.list_form_library(uuid,integer,integer,text,uuid,uuid,text,date,date,text,boolean),
 public.list_form_library_options(uuid,text,integer,integer,text) TO service_role;
-- Explicit grants remain correct under both pre/post October 30 defaults.
COMMIT;
