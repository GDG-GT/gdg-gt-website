BEGIN;
CREATE FUNCTION public.read_media_cursor(p_actor uuid,p_session uuid,p_filters jsonb,p_after_created timestamptz,p_after_id uuid,p_size integer) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$ DECLARE result jsonb;folder uuid:=(p_filters->>'folderId')::uuid;team uuid:=(p_filters->>'teamId')::uuid;BEGIN
 IF NOT gdg_security.member_transfer_session(p_actor,p_session) OR (p_after_created IS NULL)<>(p_after_id IS NULL) OR p_size NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF NOT(public.can_operate_media_file(p_actor,NULL,'image','read') OR EXISTS(SELECT 1 FROM public.admin_teams WHERE public.can_operate_media_file(p_actor,id,'image','read'))) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF folder IS NOT NULL THEN
  SELECT team_id INTO team FROM public.media_folders WHERE id=folder AND deleted_at IS NULL AND public.can_operate_media_file(p_actor,team_id,'image','read');
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  IF p_filters?'teamId' AND(p_filters->>'teamId')::uuid IS DISTINCT FROM team THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 END IF;
 WITH eligible AS(SELECT f.* FROM public.media_files f WHERE public.can_operate_media_file(p_actor,f.team_id,f.file_type,'read')
  AND(p_filters->>'view' IS DISTINCT FROM 'gallery' OR f.file_type='image') AND(f.deleted_at IS NOT NULL)=(coalesce(p_filters->>'state','current')='trash')
  AND(NOT(p_filters?'folderId') OR f.folder_id IS NOT DISTINCT FROM folder)
  AND(NOT(p_filters?'teamId') OR f.team_id IS NOT DISTINCT FROM team)
  AND(coalesce(p_filters->>'q','')='' OR strpos(lower(f.name||' '||f.original_name||' '||coalesce(f.description,'')),lower(p_filters->>'q'))>0)
  AND(p_filters->>'type' IS NULL OR f.file_type=p_filters->>'type') AND(NOT coalesce((p_filters->>'starred')::boolean,false) OR f.is_starred)
  AND(p_filters->>'tag' IS NULL OR f.tags? (p_filters->>'tag'))),windowed AS(SELECT id,created_at FROM eligible WHERE p_after_created IS NULL OR (created_at,id)<(p_after_created,p_after_id) ORDER BY created_at DESC,id DESC LIMIT p_size+1),page AS(SELECT id,created_at FROM windowed ORDER BY created_at DESC,id DESC LIMIT p_size)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(gdg_security.media_file_record(p_actor,id) ORDER BY created_at DESC,id DESC) FROM page),'[]'),'total',(SELECT count(*) FROM eligible),
  'hasMore',(SELECT count(*)>p_size FROM windowed),'pageSize',p_size,'folderId',folder,'folders',coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.id,'name',d.name,'description',coalesce(d.description,''),'parentId',d.parent_id,'teamId',d.team_id,'revision',d.revision)
   ORDER BY d.name,d.id) FROM public.media_folders d WHERE d.deleted_at IS NULL AND d.parent_id IS NOT DISTINCT FROM folder AND public.can_operate_media_file(p_actor,d.team_id,'image','read') AND(NOT(p_filters?'teamId') OR d.team_id IS NOT DISTINCT FROM team)),'[]'),
  'teams',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'canCreate',public.can_operate_media_file(p_actor,id,CASE WHEN p_filters->>'view'='gallery' THEN 'image' ELSE 'other' END,'create'),'canManageFolders',public.can_operate_media(p_actor,id,'create'))) FROM public.admin_teams WHERE is_active AND deleted_at IS NULL AND public.can_operate_media_file(p_actor,id,'image','read')),'[]'),
  'folder',(SELECT jsonb_build_object('id',d.id,'name',d.name,'parentId',d.parent_id,'teamId',d.team_id,'revision',d.revision) FROM public.media_folders d WHERE d.id=folder),
  'chapterCreate',public.can_operate_media_file(p_actor,NULL,CASE WHEN p_filters->>'view'='gallery' THEN 'image' ELSE 'other' END,'create'),'chapterFolders',public.can_operate_media(p_actor,NULL,'create')) INTO result;RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.read_media_cursor(uuid,uuid,jsonb,timestamptz,uuid,integer) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.read_media_cursor(uuid,uuid,jsonb,timestamptz,uuid,integer) TO service_role;
COMMIT;
