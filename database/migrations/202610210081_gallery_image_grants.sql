BEGIN;
CREATE FUNCTION public.can_operate_media_file(p_actor uuid,p_team uuid,p_kind text,p_action text) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT public.can_operate_media(p_actor,p_team,p_action) OR(p_kind='image' AND public.can_operate_media(p_actor,p_team,p_action,true));
$$;
REVOKE ALL ON FUNCTION public.can_operate_media_file(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.can_operate_media_file(uuid,uuid,text,text) TO service_role;
CREATE OR REPLACE FUNCTION public.read_media_workspace(p_actor uuid,p_session uuid,p_filters jsonb,p_page integer,p_size integer) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$ DECLARE result jsonb;folder uuid:=(p_filters->>'folderId')::uuid;team uuid:=(p_filters->>'teamId')::uuid;BEGIN
 IF NOT gdg_security.member_transfer_session(p_actor,p_session) OR p_page NOT BETWEEN 1 AND 10000 OR p_size NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
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
  AND(p_filters->>'tag' IS NULL OR f.tags? (p_filters->>'tag'))),page AS(SELECT id FROM eligible ORDER BY updated_at DESC,id LIMIT p_size OFFSET(p_page-1)*p_size)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(gdg_security.media_file_record(p_actor,id)) FROM page),'[]'),'total',(SELECT count(*) FROM eligible),
  'page',p_page,'pageSize',p_size,'folderId',folder,'folders',coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.id,'name',d.name,'description',coalesce(d.description,''),'parentId',d.parent_id,'teamId',d.team_id,'revision',d.revision)
   ORDER BY d.name,d.id) FROM public.media_folders d WHERE d.deleted_at IS NULL AND d.parent_id IS NOT DISTINCT FROM folder AND public.can_operate_media_file(p_actor,d.team_id,'image','read') AND(NOT(p_filters?'teamId') OR d.team_id IS NOT DISTINCT FROM team)),'[]'),
  'teams',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'canCreate',public.can_operate_media_file(p_actor,id,CASE WHEN p_filters->>'view'='gallery' THEN 'image' ELSE 'other' END,'create'),'canManageFolders',public.can_operate_media(p_actor,id,'create'))) FROM public.admin_teams WHERE is_active AND deleted_at IS NULL AND public.can_operate_media_file(p_actor,id,'image','read')),'[]'),
  'folder',(SELECT jsonb_build_object('id',d.id,'name',d.name,'parentId',d.parent_id,'teamId',d.team_id,'revision',d.revision) FROM public.media_folders d WHERE d.id=folder),
  'chapterCreate',public.can_operate_media_file(p_actor,NULL,CASE WHEN p_filters->>'view'='gallery' THEN 'image' ELSE 'other' END,'create'),'chapterFolders',public.can_operate_media(p_actor,NULL,'create')) INTO result;RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.mutate_media_files(p_actor uuid,p_session uuid,p_action text,p_files jsonb,p_document jsonb,p_key_hash text,p_request_hash text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE f public.media_files;folder public.media_folders;item jsonb;k public.idempotency_keys;scope_key text;team uuid;result jsonb:='[]';combined_tags jsonb;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('private-media',0));
 IF NOT gdg_security.member_transfer_session(p_actor,p_session) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_action IS NULL OR p_action NOT IN('metadata','star','tags','move','archive','restore') OR jsonb_typeof(p_files) IS DISTINCT FROM 'array'
 OR jsonb_array_length(p_files) NOT BETWEEN 1 AND 50 OR p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$' OR p_request_hash IS NULL OR p_request_hash!~'^[a-f0-9]{64}$'
 OR(SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(p_files))<>jsonb_array_length(p_files) THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 -- Recheck every source grant even on an idempotent replay; no cached metadata
 -- can leak after a team/page/session grant is withdrawn.
 FOR item IN SELECT value FROM jsonb_array_elements(p_files) ORDER BY value->>'id' LOOP
  SELECT * INTO f FROM public.media_files WHERE id=(item->>'id')::uuid FOR UPDATE;
  IF NOT FOUND OR NOT public.can_operate_media_file(p_actor,f.team_id,f.file_type,'read') OR NOT public.can_operate_media_file(p_actor,f.team_id,f.file_type,CASE WHEN p_action='archive' THEN 'delete' ELSE 'update' END) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
   IF f.cleanup_started_at IS NOT NULL THEN RAISE EXCEPTION 'MEDIA_CLEANUP_STARTED';END IF;
 END LOOP;
 IF p_action='move' THEN
  team:=(p_document->>'teamId')::uuid;
  IF EXISTS(SELECT 1 FROM public.media_files src WHERE src.id IN(SELECT(value->>'id')::uuid FROM jsonb_array_elements(p_files)) AND(NOT public.can_operate_media_file(p_actor,team,src.file_type,'read') OR NOT public.can_operate_media_file(p_actor,team,src.file_type,'create'))) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  IF p_document->>'folderId' IS NOT NULL THEN
   SELECT * INTO folder FROM public.media_folders WHERE id=(p_document->>'folderId')::uuid AND deleted_at IS NULL FOR UPDATE;
   IF NOT FOUND OR folder.team_id IS DISTINCT FROM team THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  END IF;
 END IF;
 scope_key:='media.files:'||p_actor||':'||p_session;
 SELECT * INTO k FROM public.idempotency_keys WHERE scope=scope_key AND key_hash=p_key_hash;
 IF FOUND THEN IF k.request_hash IS DISTINCT FROM p_request_hash THEN RAISE EXCEPTION 'CONFLICT';END IF;RETURN k.result;END IF;
 IF p_action='metadata' THEN
  IF jsonb_array_length(p_files)<>1 OR length(btrim(coalesce(p_document->>'name',''))) NOT BETWEEN 1 AND 100 OR length(coalesce(p_document->>'alt',''))>300
   OR length(coalesce(p_document->>'description',''))>1000 OR length(coalesce(p_document->>'seoTitle',''))>255 OR length(coalesce(p_document->>'seoDescription',''))>1000 OR jsonb_typeof(p_document->'tags') IS DISTINCT FROM 'array' OR jsonb_array_length(p_document->'tags')>20
   OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_document->'tags') v WHERE length(btrim(v)) NOT BETWEEN 1 AND 40)
   OR(SELECT count(DISTINCT lower(v)) FROM jsonb_array_elements_text(p_document->'tags') v)<>jsonb_array_length(p_document->'tags')
   OR(p_document->>'order')::integer NOT BETWEEN 0 AND 1000000 OR jsonb_typeof(p_document->'allowDownload') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_files) ORDER BY value->>'id' LOOP
  SELECT * INTO f FROM public.media_files WHERE id=(item->>'id')::uuid;
  IF f.revision IS DISTINCT FROM(item->>'revision')::integer THEN RAISE EXCEPTION 'CONFLICT';END IF;
  IF f.purged_at IS NOT NULL OR(f.deleted_at IS NOT NULL AND p_action<>'restore') OR(f.deleted_at IS NULL AND p_action='restore') THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  IF p_action IN('move','archive') AND(coalesce(f.is_public,false) OR gdg_security.media_in_use(f.id) OR f.scan_state IN('pending','queued') OR EXISTS(SELECT 1 FROM public.media_publications WHERE file_id=f.id AND state='queued')) THEN RAISE EXCEPTION 'MEDIA_IN_USE';END IF;
  IF p_action='move' AND f.team_id IS DISTINCT FROM team AND
   (coalesce((SELECT sum(file_size) FROM public.media_files WHERE team_id IS NOT DISTINCT FROM team AND purged_at IS NULL),0)+f.file_size>1073741824
    OR(SELECT count(*) FROM public.media_files WHERE team_id IS NOT DISTINCT FROM team AND purged_at IS NULL)>=1000) THEN RAISE EXCEPTION 'MEDIA_QUOTA';END IF;
  IF p_action='tags' THEN
   IF p_document->>'mode' IS NULL OR p_document->>'mode' NOT IN('add','remove','replace') OR jsonb_typeof(p_document->'tags') IS DISTINCT FROM 'array' OR jsonb_array_length(p_document->'tags')>20
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_document->'tags') x WHERE jsonb_typeof(x) IS DISTINCT FROM 'string')
    OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_document->'tags') x WHERE length(btrim(x)) NOT BETWEEN 1 AND 40) THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
   SELECT coalesce(jsonb_agg(tag ORDER BY n),'[]') INTO combined_tags FROM(
    SELECT DISTINCT ON(lower(value)) value tag,n FROM jsonb_array_elements_text(CASE p_document->>'mode' WHEN 'replace' THEN p_document->'tags' WHEN 'add' THEN coalesce(f.tags,'[]')||(p_document->'tags') ELSE coalesce(f.tags,'[]') END) WITH ORDINALITY AS x(value,n)
    WHERE p_document->>'mode'<>'remove' OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_document->'tags') removed WHERE lower(removed)=lower(x.value)) ORDER BY lower(value),n) tags;
   IF jsonb_array_length(combined_tags)>20 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
   UPDATE public.media_files SET tags=combined_tags,revision=revision+1,updated_at=now() WHERE id=f.id;
  ELSIF p_action='metadata' THEN
   -- Published metadata changes require an explicit revoke/review cycle, so a
   -- caption or download permission cannot silently change an approved image.
   IF coalesce(f.is_public,false) THEN RAISE EXCEPTION 'MEDIA_IN_USE';END IF;
   IF p_document->>'eventId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.events e WHERE e.id=(p_document->>'eventId')::uuid AND e.publication_status<>'archived' AND e.team_id IS NOT DISTINCT FROM f.team_id) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
   UPDATE public.media_files SET name=btrim(p_document->>'name'),alt_text=p_document->>'alt',description=p_document->>'description',tags=p_document->'tags',event_id=(p_document->>'eventId')::uuid,
    seo_title=coalesce(p_document->>'seoTitle',''),seo_description=coalesce(p_document->>'seoDescription',''),gallery_order=(p_document->>'order')::integer,allow_download=(p_document->>'allowDownload')::boolean,revision=revision+1,updated_at=now() WHERE id=f.id;
  ELSIF p_action='star' THEN
   IF jsonb_typeof(p_document->'starred') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
   UPDATE public.media_files SET is_starred=(p_document->>'starred')::boolean,revision=revision+1,updated_at=now() WHERE id=f.id;
  ELSIF p_action='move' THEN UPDATE public.media_files SET team_id=team,folder_id=folder.id,revision=revision+1,updated_at=now() WHERE id=f.id;
  ELSIF p_action='archive' THEN UPDATE public.media_files SET deleted_at=now(),revision=revision+1,updated_at=now() WHERE id=f.id;
  ELSIF p_action='restore' THEN
   IF f.folder_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.media_folders WHERE id=f.folder_id AND deleted_at IS NULL AND team_id IS NOT DISTINCT FROM f.team_id) THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
   UPDATE public.media_files SET deleted_at=NULL,is_public=false,revision=revision+1,updated_at=now() WHERE id=f.id;
  END IF;
  INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata) VALUES(p_actor,'media.file_'||p_action,'media_file',f.id,p_request_id,jsonb_build_object('revision',f.revision+1,'sourceTeamId',f.team_id,'teamId',CASE WHEN p_action='move' THEN team ELSE f.team_id END));
  result:=result||jsonb_build_array(gdg_security.media_file_record(p_actor,f.id));
 END LOOP;
 result:=jsonb_build_object('items',result);
 INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result) VALUES(scope_key,p_key_hash,p_request_hash,200,result);RETURN result;
END $$;
CREATE OR REPLACE FUNCTION gdg_security.media_file_record(p_actor uuid,p_file uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('id',f.id,'name',f.name,'originalName',f.original_name,'fileType',f.file_type,'mime',f.mime_type,'bytes',f.file_size,
  'folderId',f.folder_id,'teamId',f.team_id,'revision',f.revision,'deletedAt',f.deleted_at,'purgedAt',f.purged_at,'cleanupStartedAt',f.cleanup_started_at,'scanState',f.scan_state,
  'seoTitle',coalesce(f.seo_title,''),'seoDescription',coalesce(f.seo_description,''),'starred',coalesce(f.is_starred,false),'public',coalesce(f.is_public,false),'alt',coalesce(f.alt_text,''),'description',coalesce(f.description,''),
  'tags',coalesce(f.tags,'[]'),'eventId',f.event_id,'order',f.gallery_order,'allowDownload',f.allow_download,'width',f.width,'height',f.height,'createdAt',f.created_at,'updatedAt',f.updated_at,
  'publicationState',(SELECT state FROM public.media_publications WHERE file_id=f.id ORDER BY created_at DESC,id DESC LIMIT 1),
  'usageCount',(SELECT count(*) FROM public.media_usage WHERE file_id=f.id),'duration',f.duration,
  'inUse',gdg_security.media_in_use(f.id),'actions',(SELECT coalesce(jsonb_agg(action),'[]') FROM unnest(ARRAY['read','update','delete']) action WHERE public.can_operate_media_file(p_actor,f.team_id,f.file_type,action) AND f.cleanup_started_at IS NULL),
  'canPublish',public.can_operate_media_file(p_actor,f.team_id,f.file_type,'update') AND public.can_operate_media(p_actor,f.team_id,'publish',true))
 FROM public.media_files f WHERE f.id=p_file AND public.can_operate_media_file(p_actor,f.team_id,f.file_type,'read');
$$;
CREATE OR REPLACE FUNCTION public.mutate_media_upload(p_actor uuid,p_session uuid,p_upload uuid,p_action text,p_document jsonb,p_key_hash text,p_request_hash text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE f public.media_files;u public.upload_intents;folder public.media_folders;k public.idempotency_keys;scope_key text;team uuid;r jsonb;mime text:=p_document->>'mime';kind text;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('private-media',0));
 IF NOT gdg_security.member_transfer_session(p_actor,p_session) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_action IS NULL OR p_action NOT IN('create','complete') OR p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$' OR p_request_hash IS NULL OR p_request_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 IF p_action='create' THEN
  team:=(p_document->>'teamId')::uuid;
  IF p_document->>'folderId' IS NOT NULL THEN
   SELECT * INTO folder FROM public.media_folders WHERE id=(p_document->>'folderId')::uuid AND deleted_at IS NULL FOR UPDATE;
   IF NOT FOUND OR folder.team_id IS DISTINCT FROM team THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  END IF;
 ELSE
  SELECT * INTO u FROM public.upload_intents WHERE id=p_upload AND purpose='media' AND owner_id=p_actor AND owner_session=p_session AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  SELECT * INTO f FROM public.media_files WHERE id=u.media_id AND upload_id=u.id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;team:=f.team_id;
 END IF;
 IF NOT public.can_operate_media_file(p_actor,team,CASE WHEN p_action='create' THEN CASE WHEN mime LIKE 'image/%' THEN 'image' ELSE 'other' END ELSE f.file_type END,'read') OR NOT public.can_operate_media_file(p_actor,team,CASE WHEN p_action='create' THEN CASE WHEN mime LIKE 'image/%' THEN 'image' ELSE 'other' END ELSE f.file_type END,'create') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 scope_key:='media.upload:'||p_action||':'||p_actor||':'||p_session||':'||coalesce(p_upload::text,'new');
 SELECT * INTO k FROM public.idempotency_keys WHERE scope=scope_key AND key_hash=p_key_hash;
 IF FOUND THEN IF k.request_hash IS DISTINCT FROM p_request_hash THEN RAISE EXCEPTION 'CONFLICT';END IF;RETURN k.result;END IF;
 IF p_action='create' THEN
  IF p_upload IS NOT NULL OR mime IS NULL OR gdg_security.media_mime_limit(mime)=0 OR(p_document->>'bytes')::bigint NOT BETWEEN 1 AND gdg_security.media_mime_limit(mime)
   OR p_document->>'sha256' IS NULL OR p_document->>'sha256'!~'^[a-f0-9]{64}$' OR p_document->>'key' IS NULL OR p_document->>'key'!~'^quarantine/[a-f0-9-]{36}/[a-f0-9-]{36}$'
   OR length(coalesce(p_document->>'filename','')) NOT BETWEEN 1 AND 180 OR strpos(p_document->>'filename','/')>0 OR strpos(p_document->>'filename',chr(92))>0 OR p_document->>'filename'~'[[:cntrl:]]' THEN RAISE EXCEPTION 'INVALID_UPLOAD';END IF;
  IF(SELECT count(*) FROM public.upload_intents WHERE purpose='media' AND owner_id=p_actor AND created_at>now()-interval '24 hours')>=25
   OR coalesce((SELECT sum(expected_bytes) FROM public.upload_intents WHERE purpose='media' AND owner_id=p_actor AND created_at>now()-interval '24 hours'),0)+(p_document->>'bytes')::bigint>524288000
   OR(SELECT count(*) FROM public.upload_intents WHERE purpose='media' AND owner_id=p_actor AND state IN('pending','queued') AND deleted_at IS NULL AND expires_at>now())>=5
   OR coalesce((SELECT sum(file_size) FROM public.media_files WHERE team_id IS NOT DISTINCT FROM team AND purged_at IS NULL),0)+(p_document->>'bytes')::bigint>1073741824
   OR(SELECT count(*) FROM public.media_files WHERE team_id IS NOT DISTINCT FROM team AND purged_at IS NULL)>=1000 THEN RAISE EXCEPTION 'MEDIA_QUOTA';END IF;
  kind:=CASE WHEN mime LIKE 'image/%' THEN 'image' WHEN mime LIKE 'video/%' THEN 'video' WHEN mime LIKE 'audio/%' THEN 'audio' WHEN mime='application/zip' THEN 'archive' ELSE 'document' END;
  INSERT INTO public.media_files(name,original_name,file_type,mime_type,file_size,file_path,folder_id,uploaded_by,team_id,scan_state,is_public,tags)
   VALUES(left(p_document->>'filename',100),p_document->>'filename',kind,mime,(p_document->>'bytes')::bigint,'',folder.id,p_actor,team,'pending',false,'[]') RETURNING * INTO f;
  INSERT INTO public.upload_intents(purpose,media_id,owner_id,owner_session,proof_hash,bucket,quarantine_key,filename,declared_mime,expected_bytes,expected_sha256)
   VALUES('media',f.id,p_actor,p_session,p_request_hash,'media',p_document->>'key',p_document->>'filename',mime,(p_document->>'bytes')::bigint,p_document->>'sha256') RETURNING * INTO u;
  UPDATE public.media_files SET upload_id=u.id WHERE id=f.id;
 ELSE
  IF u.state='pending' THEN
   IF u.expires_at<=now() OR f.scan_state<>'pending' THEN RAISE EXCEPTION 'INVALID_UPLOAD';END IF;
   UPDATE public.upload_intents SET state='queued',completed_at=now() WHERE id=u.id RETURNING * INTO u;
   UPDATE public.media_files SET scan_state='queued',revision=revision+1,updated_at=now() WHERE id=f.id;
   INSERT INTO public.delivery_jobs(kind,deduplication_key,payload) VALUES('media_upload_scan','media_upload_scan:'||u.id,jsonb_build_object('uploadId',u.id));
  ELSIF u.state NOT IN('queued','clean') THEN RAISE EXCEPTION 'INVALID_UPLOAD';END IF;
 END IF;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata) VALUES(p_actor,'media.upload_'||p_action,'media_file',f.id,p_request_id,jsonb_build_object('uploadId',u.id));
 r:=jsonb_build_object('uploadId',u.id,'fileId',f.id,'state',u.state);
 INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result) VALUES(scope_key,p_key_hash,p_request_hash,200,r);RETURN r;
END $$;
CREATE OR REPLACE FUNCTION public.finish_media_upload_scan_unregistered(p_job uuid,p_lease uuid,p_clean_key text,p_mime text,p_bytes bigint,p_sha256 text,p_metadata jsonb,p_reject text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.delivery_jobs;u public.upload_intents;f public.media_files;reject_reason text:=p_reject;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('private-media',0));
 SELECT * INTO j FROM public.delivery_jobs WHERE id=p_job AND lease_token=p_lease AND kind='media_upload_scan' AND state='running' AND locked_until>now() FOR UPDATE;
 IF NOT FOUND THEN RETURN false;END IF;
 SELECT * INTO u FROM public.upload_intents WHERE id=(j.payload->>'uploadId')::uuid AND purpose='media' FOR UPDATE;
 SELECT * INTO f FROM public.media_files WHERE id=u.media_id AND upload_id=u.id FOR UPDATE;
 IF u.id IS NULL OR f.id IS NULL OR u.deleted_at IS NOT NULL OR u.state<>'queued' THEN PERFORM public.finish_delivery_job(j.id,p_lease,true,NULL,NULL);RETURN false;END IF;
 IF f.deleted_at IS NOT NULL OR f.scan_state<>'queued' OR NOT gdg_security.member_transfer_session(u.owner_id,u.owner_session)
  OR NOT public.can_operate_media_file(u.owner_id,f.team_id,f.file_type,'read') OR NOT public.can_operate_media_file(u.owner_id,f.team_id,f.file_type,'create')
  OR(f.folder_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.media_folders WHERE id=f.folder_id AND deleted_at IS NULL AND team_id IS NOT DISTINCT FROM f.team_id)) THEN reject_reason:='ACCESS_CHANGED';END IF;
 IF reject_reason IS NULL AND(p_clean_key IS NULL OR p_clean_key!~('^clean/'||u.id||'/[a-f0-9-]{36}$') OR p_mime IS DISTINCT FROM u.declared_mime OR p_bytes IS NULL OR p_bytes NOT BETWEEN 1 AND gdg_security.media_mime_limit(p_mime)
  OR p_sha256 IS NULL OR p_sha256!~'^[a-f0-9]{64}$') THEN RAISE EXCEPTION 'INVALID_UPLOAD';END IF;
 IF reject_reason IS NULL AND coalesce((SELECT sum(file_size) FROM public.media_files WHERE team_id IS NOT DISTINCT FROM f.team_id AND purged_at IS NULL AND id<>f.id),0)+p_bytes>1073741824 THEN reject_reason:='MEDIA_QUOTA';END IF;
 IF reject_reason IS NULL AND f.file_type='image' AND((p_metadata->>'width')::integer NOT BETWEEN 1 AND 16000 OR(p_metadata->>'height')::integer NOT BETWEEN 1 AND 16000 OR p_metadata->>'width' IS NULL OR p_metadata->>'height' IS NULL) THEN RAISE EXCEPTION 'INVALID_UPLOAD';END IF;
 UPDATE public.upload_intents SET state=CASE WHEN reject_reason IS NULL THEN 'clean' ELSE 'rejected' END,clean_key=CASE WHEN reject_reason IS NULL THEN p_clean_key ELSE NULL END,media_clean_sha256=CASE WHEN reject_reason IS NULL THEN p_sha256 ELSE NULL END,error_code=reject_reason,completed_at=now() WHERE id=u.id;
 UPDATE public.media_files SET scan_state=CASE WHEN reject_reason IS NULL THEN 'clean' ELSE 'rejected' END,file_path=CASE WHEN reject_reason IS NULL THEN p_clean_key ELSE '' END,
  mime_type=coalesce(p_mime,mime_type),file_size=CASE WHEN reject_reason IS NULL THEN p_bytes ELSE file_size END,width=(p_metadata->>'width')::integer,height=(p_metadata->>'height')::integer,duration=(p_metadata->>'duration')::numeric,
  revision=revision+1,updated_at=now() WHERE id=f.id;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,metadata) VALUES(u.owner_id,'media.upload_scanned','media_file',f.id,jsonb_build_object('uploadId',u.id,'state',CASE WHEN reject_reason IS NULL THEN 'clean' ELSE 'rejected' END));
 PERFORM public.finish_delivery_job(j.id,p_lease,true,NULL,NULL);RETURN reject_reason IS NOT DISTINCT FROM p_reject;
END $$;
CREATE OR REPLACE FUNCTION public.media_private_file(p_actor uuid,p_session uuid,p_file uuid,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE f public.media_files;u public.upload_intents;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('private-media',0));
 IF NOT gdg_security.member_transfer_session(p_actor,p_session) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT * INTO f FROM public.media_files WHERE id=p_file AND deleted_at IS NULL AND scan_state='clean' AND purged_at IS NULL;
 SELECT * INTO u FROM public.upload_intents WHERE id=f.upload_id AND media_id=f.id AND purpose='media' AND state='clean' AND deleted_at IS NULL AND clean_key=f.file_path;
 IF f.id IS NULL OR u.id IS NULL OR NOT public.can_operate_media_file(p_actor,f.team_id,f.file_type,'read') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata) VALUES(p_actor,'media.file_downloaded','media_file',f.id,p_request_id,'{}');
 RETURN jsonb_build_object('key',u.clean_key,'filename',u.filename,'mime',f.mime_type,'kind',f.file_type);
END $$;
CREATE OR REPLACE FUNCTION gdg_security.media_publication_allowed(p_publication uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.media_publications p JOIN public.media_files f ON f.id=p.file_id JOIN public.upload_intents u ON u.id=f.upload_id AND u.media_id=f.id
 JOIN public.admin_users a ON a.id=p.actor_id WHERE p.id=p_publication AND p.state='queued' AND p.expires_at>now() AND p.verified_hash=a.password_hash
 AND gdg_security.member_transfer_session(p.actor_id,p.session_id) AND public.can_operate_media_file(p.actor_id,f.team_id,f.file_type,'read') AND public.can_operate_media_file(p.actor_id,f.team_id,f.file_type,'update') AND public.can_operate_media(p.actor_id,f.team_id,'publish',true)
 AND f.revision=p.source_revision AND f.deleted_at IS NULL AND f.purged_at IS NULL AND NOT coalesce(f.is_public,false) AND f.scan_state='clean' AND f.file_type='image'
 AND f.mime_type IN('image/png','image/jpeg','image/webp') AND length(btrim(coalesce(f.alt_text,'')))>0 AND u.purpose='media' AND u.state='clean' AND u.deleted_at IS NULL AND f.file_path=u.clean_key AND u.media_clean_sha256 IS NOT NULL
 AND(f.team_id IS NULL OR EXISTS(SELECT 1 FROM public.admin_teams WHERE id=f.team_id AND is_active AND deleted_at IS NULL))
 AND(f.event_id IS NULL OR EXISTS(SELECT 1 FROM public.events e WHERE e.id=f.event_id AND e.publication_status='published' AND e.team_id IS NOT DISTINCT FROM f.team_id)));
$$;
CREATE OR REPLACE FUNCTION public.mutate_media_publication(p_actor uuid,p_session uuid,p_file uuid,p_revision integer,p_action text,p_verified_hash text,p_key_hash text,p_request_hash text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE f public.media_files;p public.media_publications;k public.idempotency_keys;scope_key text;r jsonb;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('private-media',0));
 IF NOT gdg_security.member_transfer_session(p_actor,p_session) OR NOT EXISTS(SELECT 1 FROM public.admin_users WHERE id=p_actor AND password_hash=p_verified_hash) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT * INTO f FROM public.media_files WHERE id=p_file AND deleted_at IS NULL AND purged_at IS NULL FOR UPDATE;
 IF NOT FOUND OR NOT public.can_operate_media_file(p_actor,f.team_id,f.file_type,'read') OR NOT public.can_operate_media_file(p_actor,f.team_id,f.file_type,'update') OR NOT public.can_operate_media(p_actor,f.team_id,'publish',true) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_action IS NULL OR p_action NOT IN('publish','revoke') OR p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$' OR p_request_hash IS NULL OR p_request_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 scope_key:='media.publication:'||p_actor||':'||p_session||':'||f.id;
 SELECT * INTO k FROM public.idempotency_keys WHERE scope=scope_key AND key_hash=p_key_hash;
 IF FOUND THEN IF k.request_hash IS DISTINCT FROM p_request_hash THEN RAISE EXCEPTION 'CONFLICT';END IF;RETURN k.result;END IF;
 IF f.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'CONFLICT';END IF;
 IF p_action='publish' THEN
  IF coalesce(f.is_public,false) OR EXISTS(SELECT 1 FROM public.media_publications WHERE file_id=f.id AND state='queued') THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  INSERT INTO public.media_publications(file_id,actor_id,session_id,verified_hash,source_revision) VALUES(f.id,p_actor,p_session,p_verified_hash,f.revision) RETURNING * INTO p;
  IF NOT gdg_security.media_publication_allowed(p.id) THEN RAISE EXCEPTION 'MEDIA_PUBLICATION_BLOCKED';END IF;
  INSERT INTO public.delivery_jobs(kind,deduplication_key,payload) VALUES('media_publish','media_publish:'||p.id,jsonb_build_object('publicationId',p.id));
  r:=jsonb_build_object('publicationId',p.id,'state','queued','revision',f.revision);
 ELSE
  UPDATE public.media_publications SET state='revoked',revoked_at=now(),verified_hash=NULL WHERE file_id=f.id AND state IN('queued','published');
  UPDATE public.delivery_jobs SET state='dead',locked_until=NULL,lease_token=NULL,last_error_code='MEDIA_REVOKED' WHERE kind='media_publish' AND state IN('pending','running') AND payload->>'publicationId' IN(SELECT id::text FROM public.media_publications WHERE file_id=f.id AND state='revoked');
  UPDATE public.media_files SET is_public=false,publication_id=NULL,revision=revision+1,updated_at=now() WHERE id=f.id;
  r:=jsonb_build_object('state','revoked','revision',f.revision+1);
 END IF;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata) VALUES(p_actor,'media.publication_'||p_action,'media_file',f.id,p_request_id,jsonb_build_object('publicationId',p.id,'revision',f.revision));
 INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result) VALUES(scope_key,p_key_hash,p_request_hash,200,r);RETURN r;
END $$;
CREATE OR REPLACE FUNCTION public.read_media_event_options(p_actor uuid,p_session uuid,p_team uuid,p_query text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NOT gdg_security.member_transfer_session(p_actor,p_session) OR NOT public.can_operate_media_file(p_actor,p_team,'image','read') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF length(coalesce(p_query,''))>100 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(e)) FROM(SELECT id,title,publication_status FROM public.events WHERE team_id IS NOT DISTINCT FROM p_team AND publication_status<>'archived'
  AND(publication_status='published' OR public.can_operate_event(p_actor,'read',team_id)) AND(coalesce(p_query,'')='' OR strpos(lower(title),lower(p_query))>0) ORDER BY start_at DESC,id LIMIT 50)e),'[]');
END $$;
CREATE OR REPLACE FUNCTION gdg_security.media_in_use(p_file uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.media_usage WHERE file_id=p_file)
 OR EXISTS(SELECT 1 FROM public.finance_attachments WHERE strpos(coalesce(file_url,'')||coalesce(storage_path,''),p_file::text)>0)
 OR EXISTS(SELECT 1 FROM public.events WHERE image_media_id=p_file)
 OR EXISTS(SELECT 1 FROM public.site_content WHERE strpos(to_jsonb(site_content)::text,p_file::text)>0)
 OR EXISTS(SELECT 1 FROM public.team_members WHERE strpos(coalesce(image_url,''),p_file::text)>0)
 OR EXISTS(SELECT 1 FROM public.sponsors WHERE strpos(coalesce(logo_url,''),p_file::text)>0)
 OR EXISTS(SELECT 1 FROM public.blog_posts WHERE strpos(coalesce(featured_image_url,'')||coalesce(content,''),p_file::text)>0)
 OR EXISTS(SELECT 1 FROM public.linktree_profiles WHERE strpos(coalesce(avatar_url,''),p_file::text)>0);
$$;
CREATE OR REPLACE FUNCTION public.read_public_media_asset(p_file uuid,p_width integer,p_download boolean) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('key',d.object_key,'sha256',d.sha256,'bytes',d.byte_size,'width',d.width,'height',d.height)
 FROM public.media_files f JOIN public.media_publications p ON p.id=f.publication_id AND p.file_id=f.id AND p.state='published'
 JOIN public.media_derivatives d ON d.publication_id=p.id AND d.state='approved' AND d.width_key=p_width AND d.purged_at IS NULL
 WHERE f.id=p_file AND f.is_public AND f.scan_state='clean' AND f.deleted_at IS NULL AND f.purged_at IS NULL AND f.file_type='image'
 AND(NOT p_download OR f.allow_download) AND d.object_key LIKE 'public/'||f.id||'/'||p.id||'/%'
 AND(f.team_id IS NULL OR EXISTS(SELECT 1 FROM public.admin_teams WHERE id=f.team_id AND is_active AND deleted_at IS NULL))
 AND(f.event_id IS NULL OR EXISTS(SELECT 1 FROM public.events WHERE id=f.event_id AND publication_status='published' AND team_id IS NOT DISTINCT FROM f.team_id));
$$;
COMMIT;
