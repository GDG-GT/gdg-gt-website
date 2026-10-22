BEGIN;
-- Keep the existing authorization/state/version implementation private. The
-- only callable mutation entry acquires locks in the same order as media jobs.
ALTER FUNCTION public.mutate_form(uuid,uuid,text,integer,jsonb,text,uuid) SET SCHEMA gdg_security;
ALTER FUNCTION gdg_security.mutate_form(uuid,uuid,text,integer,jsonb,text,uuid) RENAME TO mutate_form_without_media;
REVOKE ALL ON FUNCTION gdg_security.mutate_form_without_media(uuid,uuid,text,integer,jsonb,text,uuid) FROM PUBLIC,anon,authenticated,gdg_realtime,service_role;

CREATE FUNCTION public.mutate_form(p_actor uuid,p_id uuid,p_action text,p_revision integer,p_document jsonb,p_schema_hash text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE definition jsonb;image_id uuid;header text;result jsonb;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('private-media',0));
 -- Authorization precedes any image existence check, including direct RPC use.
 IF p_action='create' THEN
  IF NOT public.can_operate_form(p_actor,NULL,'create',(p_document->>'team_id')::uuid) THEN RAISE EXCEPTION 'FORBIDDEN';END IF;
 ELSIF NOT public.can_operate_form(p_actor,p_id,CASE WHEN p_action IN('publish','state') THEN 'publish' WHEN p_action IN('archive','restore') THEN 'delete' ELSE 'edit' END)
 THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 definition:=p_document->'definition';
 IF p_action IN('create','draft','publish') AND definition IS NOT NULL THEN
  IF jsonb_typeof(definition->'fields') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(definition->'fields') f WHERE f->>'type'='image')>20 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
  header:=coalesce(definition#>>'{settings,headerMedia}','');
  IF header<>'' AND header!~'^/api/v1/media/public/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
  IF p_action='publish' AND ((header<>'' AND btrim(coalesce(definition#>>'{settings,headerAlt}',''))='') OR EXISTS(
   SELECT 1 FROM jsonb_array_elements(definition->'fields') f WHERE f->>'type'='image' AND(nullif(f->>'imageMediaId','') IS NULL OR btrim(coalesce(f->>'label',''))='')))
  THEN RAISE EXCEPTION 'FORM_IMAGE_REQUIRED';END IF;
  FOR image_id IN SELECT DISTINCT reference::uuid FROM(
   SELECT f->>'imageMediaId' reference FROM jsonb_array_elements(definition->'fields') f WHERE f->>'type'='image'
   UNION ALL SELECT nullif(split_part(header,'/',6),'') WHERE header<>'') refs WHERE reference IS NOT NULL ORDER BY 1
  LOOP
   IF public.read_public_media_asset(image_id,960,false) IS NULL THEN RAISE EXCEPTION 'FORM_IMAGE_UNAVAILABLE';END IF;
  END LOOP;
 END IF;
 result:=gdg_security.mutate_form_without_media(p_actor,p_id,p_action,p_revision,p_document,p_schema_hash,p_request_id);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.mutate_form(uuid,uuid,text,integer,jsonb,text,uuid) FROM PUBLIC,anon,authenticated,gdg_realtime,service_role;
GRANT EXECUTE ON FUNCTION public.mutate_form(uuid,uuid,text,integer,jsonb,text,uuid) TO service_role;

CREATE INDEX forms_media_references ON public.forms USING gin(draft_definition jsonb_path_ops) WHERE permanently_deleted_at IS NULL;
CREATE INDEX form_versions_media_references ON public.form_versions USING gin(definition jsonb_path_ops);
CREATE OR REPLACE FUNCTION gdg_security.media_in_use(p_file uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.media_usage WHERE file_id=p_file)
 OR EXISTS(SELECT 1 FROM public.finance_attachments WHERE strpos(coalesce(file_url,'')||coalesce(storage_path,''),p_file::text)>0)
 OR EXISTS(SELECT 1 FROM public.events WHERE image_media_id=p_file)
 OR EXISTS(SELECT 1 FROM public.site_content WHERE strpos(to_jsonb(site_content)::text,p_file::text)>0)
 OR EXISTS(SELECT 1 FROM public.team_members WHERE strpos(coalesce(image_url,''),p_file::text)>0)
 OR EXISTS(SELECT 1 FROM public.sponsors WHERE strpos(coalesce(logo_url,''),p_file::text)>0)
 OR EXISTS(SELECT 1 FROM public.blog_posts WHERE strpos(coalesce(featured_image_url,'')||coalesce(content,''),p_file::text)>0)
 OR EXISTS(SELECT 1 FROM public.linktree_profiles WHERE strpos(coalesce(avatar_url,''),p_file::text)>0)
 OR EXISTS(SELECT 1 FROM public.forms f WHERE f.permanently_deleted_at IS NULL AND(
  f.draft_definition @> jsonb_build_object('fields',jsonb_build_array(jsonb_build_object('type','image','imageMediaId',p_file::text)))
  OR f.draft_definition @> jsonb_build_object('settings',jsonb_build_object('headerMedia','/api/v1/media/public/'||p_file))))
 OR EXISTS(SELECT 1 FROM public.form_versions v JOIN public.forms f ON f.id=v.form_id WHERE f.permanently_deleted_at IS NULL AND(
  v.definition @> jsonb_build_object('fields',jsonb_build_array(jsonb_build_object('type','image','imageMediaId',p_file::text)))
  OR v.definition @> jsonb_build_object('settings',jsonb_build_object('headerMedia','/api/v1/media/public/'||p_file))));
$$;
REVOKE ALL ON FUNCTION gdg_security.media_in_use(uuid) FROM PUBLIC,anon,authenticated,gdg_realtime,service_role;
GRANT EXECUTE ON FUNCTION gdg_security.media_in_use(uuid) TO service_role;
COMMIT;
