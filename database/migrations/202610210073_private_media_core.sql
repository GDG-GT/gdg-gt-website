BEGIN;
ALTER TABLE public.media_folders ADD COLUMN team_id uuid REFERENCES public.admin_teams(id),ADD COLUMN revision integer NOT NULL DEFAULT 1,ADD COLUMN deleted_at timestamptz;
ALTER TABLE public.media_files ADD COLUMN team_id uuid REFERENCES public.admin_teams(id),ADD COLUMN revision integer NOT NULL DEFAULT 1,ADD COLUMN deleted_at timestamptz,
 ADD COLUMN purged_at timestamptz,ADD COLUMN upload_id uuid UNIQUE REFERENCES public.upload_intents(id),
 ADD COLUMN scan_state text NOT NULL DEFAULT 'unverified' CHECK(scan_state IN('unverified','pending','queued','clean','rejected','expired')),
 ADD COLUMN gallery_order integer NOT NULL DEFAULT 0,ADD COLUMN allow_download boolean NOT NULL DEFAULT false;
CREATE INDEX media_private_scope ON public.media_files(team_id,folder_id,updated_at DESC,id);
CREATE INDEX media_folder_scope ON public.media_folders(team_id,parent_id,id);
CREATE FUNCTION public.can_operate_media(p_actor uuid,p_team uuid,p_action text,p_gallery boolean DEFAULT false) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$ DECLARE actor public.admin_users;BEGIN
 SELECT * INTO actor FROM public.admin_users WHERE id=p_actor AND is_active AND deleted_at IS NULL AND NOT must_change_password AND(locked_until IS NULL OR locked_until<=now());
 IF NOT FOUND OR actor.role='blog_editor' OR p_action NOT IN('read','create','update','delete','publish') THEN RETURN false;END IF;
 IF p_team IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.admin_teams WHERE id=p_team AND is_active AND deleted_at IS NULL) AND p_action<>'read' THEN RETURN false;END IF;
 IF actor.role IN('admin','super_admin') THEN RETURN p_team IS NULL OR EXISTS(SELECT 1 FROM public.admin_teams WHERE id=p_team);END IF;
 IF p_team IS NULL THEN RETURN false;END IF;
 RETURN EXISTS(SELECT 1 FROM public.team_memberships m JOIN public.admin_teams t ON t.id=m.team_id AND t.is_active AND t.deleted_at IS NULL
 JOIN public.team_page_access a ON a.team_id=t.id AND a.page_path=CASE WHEN p_gallery THEN '/admin/gallery' ELSE '/admin/media' END AND a.can_access
 JOIN public.team_permissions p ON p.team_id=t.id AND p.resource_type=CASE WHEN p_gallery THEN 'gallery' ELSE 'media' END
 WHERE m.admin_user_id=actor.id AND m.is_active AND m.team_id=p_team AND
 CASE p_action WHEN 'read' THEN p.can_read WHEN 'create' THEN p.can_create WHEN 'update' THEN p.can_update WHEN 'delete' THEN p.can_delete WHEN 'publish' THEN p.can_update AND p.permission IN('publish','gallery.publish','media.publish') ELSE false END);
END $$;
CREATE FUNCTION gdg_security.media_in_use(p_file uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.media_usage WHERE file_id=p_file)
 OR EXISTS(SELECT 1 FROM public.events WHERE image_media_id=p_file)
 OR EXISTS(SELECT 1 FROM public.site_content WHERE strpos(to_jsonb(site_content)::text,p_file::text)>0)
 OR EXISTS(SELECT 1 FROM public.team_members WHERE strpos(coalesce(image_url,''),p_file::text)>0)
 OR EXISTS(SELECT 1 FROM public.sponsors WHERE strpos(coalesce(logo_url,''),p_file::text)>0)
 OR EXISTS(SELECT 1 FROM public.blog_posts WHERE strpos(coalesce(featured_image_url,'')||coalesce(content,''),p_file::text)>0)
 OR EXISTS(SELECT 1 FROM public.linktree_profiles WHERE strpos(coalesce(avatar_url,''),p_file::text)>0);
$$;
CREATE FUNCTION gdg_security.media_file_record(p_actor uuid,p_file uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('id',f.id,'name',f.name,'originalName',f.original_name,'fileType',f.file_type,'mime',f.mime_type,'bytes',f.file_size,
  'folderId',f.folder_id,'teamId',f.team_id,'revision',f.revision,'deletedAt',f.deleted_at,'purgedAt',f.purged_at,'scanState',f.scan_state,
  'starred',coalesce(f.is_starred,false),'public',coalesce(f.is_public,false),'alt',coalesce(f.alt_text,''),'description',coalesce(f.description,''),
  'tags',coalesce(f.tags,'[]'),'eventId',f.event_id,'order',f.gallery_order,'allowDownload',f.allow_download,'width',f.width,'height',f.height,'createdAt',f.created_at,'updatedAt',f.updated_at,
  'inUse',gdg_security.media_in_use(f.id),'actions',(SELECT coalesce(jsonb_agg(action),'[]') FROM unnest(ARRAY['read','update','delete']) action WHERE public.can_operate_media(p_actor,f.team_id,action)),
  'canPublish',public.can_operate_media(p_actor,f.team_id,'update') AND public.can_operate_media(p_actor,f.team_id,'publish',true))
 FROM public.media_files f WHERE f.id=p_file AND public.can_operate_media(p_actor,f.team_id,'read');
$$;
CREATE FUNCTION public.read_media_workspace(p_actor uuid,p_session uuid,p_filters jsonb,p_page integer,p_size integer) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$ DECLARE result jsonb;folder uuid:=(p_filters->>'folderId')::uuid;team uuid:=(p_filters->>'teamId')::uuid;BEGIN
 IF NOT gdg_security.member_transfer_session(p_actor,p_session) OR p_page NOT BETWEEN 1 AND 10000 OR p_size NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF NOT(public.can_operate_media(p_actor,NULL,'read') OR EXISTS(SELECT 1 FROM public.admin_teams WHERE public.can_operate_media(p_actor,id,'read'))) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF folder IS NOT NULL THEN
  SELECT team_id INTO team FROM public.media_folders WHERE id=folder AND deleted_at IS NULL AND public.can_operate_media(p_actor,team_id,'read');
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  IF p_filters?'teamId' AND(p_filters->>'teamId')::uuid IS DISTINCT FROM team THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 END IF;
 WITH eligible AS(SELECT f.* FROM public.media_files f WHERE public.can_operate_media(p_actor,f.team_id,'read')
  AND(f.deleted_at IS NOT NULL)=(coalesce(p_filters->>'state','current')='trash')
  AND(NOT(p_filters?'folderId') OR f.folder_id IS NOT DISTINCT FROM folder)
  AND(NOT(p_filters?'teamId') OR f.team_id IS NOT DISTINCT FROM team)
  AND(coalesce(p_filters->>'q','')='' OR strpos(lower(f.name||' '||f.original_name||' '||coalesce(f.description,'')),lower(p_filters->>'q'))>0)
  AND(p_filters->>'type' IS NULL OR f.file_type=p_filters->>'type') AND(NOT coalesce((p_filters->>'starred')::boolean,false) OR f.is_starred)
  AND(p_filters->>'tag' IS NULL OR f.tags? (p_filters->>'tag'))),page AS(SELECT id FROM eligible ORDER BY updated_at DESC,id LIMIT p_size OFFSET(p_page-1)*p_size)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(gdg_security.media_file_record(p_actor,id)) FROM page),'[]'),'total',(SELECT count(*) FROM eligible),
  'page',p_page,'pageSize',p_size,'folderId',folder,'folders',coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.id,'name',d.name,'description',coalesce(d.description,''),'parentId',d.parent_id,'teamId',d.team_id,'revision',d.revision)
   ORDER BY d.name,d.id) FROM public.media_folders d WHERE d.deleted_at IS NULL AND d.parent_id IS NOT DISTINCT FROM folder AND public.can_operate_media(p_actor,d.team_id,'read') AND(NOT(p_filters?'teamId') OR d.team_id IS NOT DISTINCT FROM team)),'[]'),
  'teams',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'canCreate',public.can_operate_media(p_actor,id,'create'))) FROM public.admin_teams WHERE is_active AND deleted_at IS NULL AND public.can_operate_media(p_actor,id,'read')),'[]'),
  'folder',(SELECT jsonb_build_object('id',d.id,'name',d.name,'parentId',d.parent_id,'teamId',d.team_id,'revision',d.revision) FROM public.media_folders d WHERE d.id=folder),
  'chapterCreate',public.can_operate_media(p_actor,NULL,'create')) INTO result;RETURN result;
END $$;
CREATE FUNCTION public.mutate_media_folder(p_actor uuid,p_session uuid,p_folder uuid,p_action text,p_revision integer,p_document jsonb,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ DECLARE f public.media_folders;parent public.media_folders;team uuid;depth integer:=0;subtree integer:=1;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('private-media',0));
 IF NOT gdg_security.member_transfer_session(p_actor,p_session) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_action='create' THEN team:=(p_document->>'teamId')::uuid;
 ELSE SELECT * INTO f FROM public.media_folders WHERE id=p_folder AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR NOT public.can_operate_media(p_actor,f.team_id,'read') OR NOT public.can_operate_media(p_actor,f.team_id,CASE WHEN p_action='delete' THEN 'delete' ELSE 'update' END) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  IF f.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'CONFLICT';END IF;team:=f.team_id;
 END IF;
 IF p_action IN('create','move') THEN
  IF NOT public.can_operate_media(p_actor,team,'create') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  IF p_document->>'parentId' IS NOT NULL THEN
   SELECT * INTO parent FROM public.media_folders WHERE id=(p_document->>'parentId')::uuid AND deleted_at IS NULL FOR UPDATE;
   IF NOT FOUND OR parent.team_id IS DISTINCT FROM team OR NOT public.can_operate_media(p_actor,parent.team_id,'update') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
   WITH RECURSIVE ancestry AS(SELECT id,parent_id,1 depth FROM public.media_folders WHERE id=parent.id UNION ALL SELECT d.id,d.parent_id,a.depth+1 FROM public.media_folders d JOIN ancestry a ON d.id=a.parent_id WHERE a.depth<9)
   SELECT max(ancestry.depth) INTO depth FROM ancestry;
   IF depth>=8 OR parent.id=p_folder OR EXISTS(WITH RECURSIVE ancestors AS(SELECT id,parent_id FROM public.media_folders WHERE id=parent.id UNION SELECT d.id,d.parent_id FROM public.media_folders d JOIN ancestors a ON d.id=a.parent_id) SELECT 1 FROM ancestors WHERE id=p_folder) THEN RAISE EXCEPTION 'MEDIA_FOLDER_CYCLE';END IF;
  END IF;
  IF p_action='move' THEN
   WITH RECURSIVE descendants AS(SELECT id,1 level FROM public.media_folders WHERE id=f.id UNION ALL SELECT d.id,a.level+1 FROM public.media_folders d JOIN descendants a ON d.parent_id=a.id WHERE d.deleted_at IS NULL AND a.level<9)
   SELECT max(level) INTO subtree FROM descendants;
   IF depth+coalesce(subtree,1)>8 THEN RAISE EXCEPTION 'MEDIA_FOLDER_CYCLE';END IF;
  END IF;
 END IF;
 IF p_action IN('create','update') AND(length(btrim(coalesce(p_document->>'name',''))) NOT BETWEEN 1 AND 100 OR length(coalesce(p_document->>'description',''))>1000) THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 IF p_action IN('create','update','move') AND EXISTS(SELECT 1 FROM public.media_folders d WHERE d.id IS DISTINCT FROM p_folder AND d.deleted_at IS NULL AND d.team_id IS NOT DISTINCT FROM team
  AND d.parent_id IS NOT DISTINCT FROM CASE WHEN p_action IN('create','move') THEN parent.id ELSE f.parent_id END
  AND lower(btrim(d.name))=lower(btrim(CASE WHEN p_action='move' THEN f.name ELSE p_document->>'name' END))) THEN RAISE EXCEPTION 'DUPLICATE';END IF;
 IF p_action='create' THEN
  INSERT INTO public.media_folders(name,description,parent_id,path,created_by,team_id) VALUES(btrim(p_document->>'name'),p_document->>'description',parent.id,'',p_actor,team) RETURNING * INTO f;
 ELSIF p_action='update' THEN UPDATE public.media_folders SET name=btrim(p_document->>'name'),description=p_document->>'description',revision=revision+1,updated_at=now() WHERE id=f.id RETURNING * INTO f;
 ELSIF p_action='move' THEN UPDATE public.media_folders SET parent_id=parent.id,revision=revision+1,updated_at=now() WHERE id=f.id RETURNING * INTO f;
 ELSIF p_action='delete' THEN
  IF EXISTS(SELECT 1 FROM public.media_files WHERE folder_id=f.id AND purged_at IS NULL) OR EXISTS(SELECT 1 FROM public.media_folders WHERE parent_id=f.id AND deleted_at IS NULL) THEN RAISE EXCEPTION 'MEDIA_FOLDER_NOT_EMPTY';END IF;
  UPDATE public.media_files SET folder_id=NULL WHERE folder_id=f.id AND purged_at IS NOT NULL;
  UPDATE public.media_folders SET deleted_at=now(),revision=revision+1,updated_at=now() WHERE id=f.id RETURNING * INTO f;
 ELSE RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata) VALUES(p_actor,'media.folder_'||p_action,'media_folder',f.id,p_request_id,jsonb_build_object('revision',f.revision,'teamId',f.team_id));
 RETURN jsonb_build_object('id',f.id,'revision',f.revision);
END $$;
REVOKE ALL ON FUNCTION public.can_operate_media(uuid,uuid,text,boolean),gdg_security.media_in_use(uuid),gdg_security.media_file_record(uuid,uuid),
 public.read_media_workspace(uuid,uuid,jsonb,integer,integer),public.mutate_media_folder(uuid,uuid,uuid,text,integer,jsonb,uuid) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.can_operate_media(uuid,uuid,text,boolean),gdg_security.media_in_use(uuid),gdg_security.media_file_record(uuid,uuid),
 public.read_media_workspace(uuid,uuid,jsonb,integer,integer),public.mutate_media_folder(uuid,uuid,uuid,text,integer,jsonb,uuid) TO service_role;
COMMIT;
