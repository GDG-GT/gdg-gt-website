BEGIN;
ALTER TABLE public.upload_intents ADD COLUMN media_id uuid REFERENCES public.media_files(id) ON DELETE RESTRICT,ADD COLUMN media_clean_sha256 text CHECK(media_clean_sha256~'^[a-f0-9]{64}$');
ALTER TABLE public.upload_intents ADD CONSTRAINT media_upload_scope CHECK(purpose<>'media' OR(media_id IS NOT NULL AND owner_id IS NOT NULL AND owner_session IS NOT NULL AND bucket='media' AND form_id IS NULL AND finance_id IS NULL AND blog_submission_id IS NULL));
CREATE FUNCTION gdg_security.media_mime_limit(p_mime text) RETURNS bigint LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN p_mime IN('image/png','image/jpeg','image/webp') THEN 20971520 WHEN p_mime IN('video/mp4','video/webm') THEN 262144000
 WHEN p_mime IN('audio/mpeg','audio/wav','audio/ogg') THEN 52428800 WHEN p_mime IN('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain','text/markdown','application/zip') THEN 26214400 ELSE 0 END::bigint;
$$;
CREATE FUNCTION public.mutate_media_upload(p_actor uuid,p_session uuid,p_upload uuid,p_action text,p_document jsonb,p_key_hash text,p_request_hash text,p_request_id uuid)
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
 IF NOT public.can_operate_media(p_actor,team,'read') OR NOT public.can_operate_media(p_actor,team,'create') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
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
CREATE FUNCTION public.finish_media_upload_scan(p_job uuid,p_lease uuid,p_clean_key text,p_mime text,p_bytes bigint,p_sha256 text,p_metadata jsonb,p_reject text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.delivery_jobs;u public.upload_intents;f public.media_files;reject_reason text:=p_reject;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('private-media',0));
 SELECT * INTO j FROM public.delivery_jobs WHERE id=p_job AND lease_token=p_lease AND kind='media_upload_scan' AND state='running' AND locked_until>now() FOR UPDATE;
 IF NOT FOUND THEN RETURN false;END IF;
 SELECT * INTO u FROM public.upload_intents WHERE id=(j.payload->>'uploadId')::uuid AND purpose='media' FOR UPDATE;
 SELECT * INTO f FROM public.media_files WHERE id=u.media_id AND upload_id=u.id FOR UPDATE;
 IF u.id IS NULL OR f.id IS NULL OR u.deleted_at IS NOT NULL OR u.state<>'queued' THEN PERFORM public.finish_delivery_job(j.id,p_lease,true,NULL,NULL);RETURN false;END IF;
 IF f.deleted_at IS NOT NULL OR f.scan_state<>'queued' OR NOT gdg_security.member_transfer_session(u.owner_id,u.owner_session)
  OR NOT public.can_operate_media(u.owner_id,f.team_id,'read') OR NOT public.can_operate_media(u.owner_id,f.team_id,'create')
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
CREATE FUNCTION public.media_private_file(p_actor uuid,p_session uuid,p_file uuid,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE f public.media_files;u public.upload_intents;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('private-media',0));
 IF NOT gdg_security.member_transfer_session(p_actor,p_session) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT * INTO f FROM public.media_files WHERE id=p_file AND deleted_at IS NULL AND scan_state='clean' AND purged_at IS NULL;
 SELECT * INTO u FROM public.upload_intents WHERE id=f.upload_id AND media_id=f.id AND purpose='media' AND state='clean' AND deleted_at IS NULL AND clean_key=f.file_path;
 IF f.id IS NULL OR u.id IS NULL OR NOT public.can_operate_media(p_actor,f.team_id,'read') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata) VALUES(p_actor,'media.file_downloaded','media_file',f.id,p_request_id,'{}');
 RETURN jsonb_build_object('key',u.clean_key,'filename',u.filename,'mime',f.mime_type,'kind',f.file_type);
END $$;
REVOKE ALL ON FUNCTION gdg_security.media_mime_limit(text),public.mutate_media_upload(uuid,uuid,uuid,text,jsonb,text,text,uuid),public.finish_media_upload_scan(uuid,uuid,text,text,bigint,text,jsonb,text),public.media_private_file(uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION gdg_security.media_mime_limit(text),public.mutate_media_upload(uuid,uuid,uuid,text,jsonb,text,text,uuid),public.finish_media_upload_scan(uuid,uuid,text,text,bigint,text,jsonb,text),public.media_private_file(uuid,uuid,uuid,uuid) TO service_role;
COMMIT;
