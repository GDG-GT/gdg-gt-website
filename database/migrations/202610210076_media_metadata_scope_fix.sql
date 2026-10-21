BEGIN;
-- Forward-only correction: events use publication_status, not deleted_at.
-- Preserve fractional native media duration and enforce destination quotas.
ALTER TABLE public.media_files ALTER COLUMN duration TYPE numeric USING duration::numeric;
CREATE OR REPLACE FUNCTION public.mutate_media_files(p_actor uuid,p_session uuid,p_action text,p_files jsonb,p_document jsonb,p_key_hash text,p_request_hash text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE f public.media_files;folder public.media_folders;item jsonb;k public.idempotency_keys;scope_key text;team uuid;result jsonb:='[]';BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('private-media',0));
 IF NOT gdg_security.member_transfer_session(p_actor,p_session) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_action IS NULL OR p_action NOT IN('metadata','star','move','archive','restore') OR jsonb_typeof(p_files) IS DISTINCT FROM 'array'
 OR jsonb_array_length(p_files) NOT BETWEEN 1 AND 50 OR p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$' OR p_request_hash IS NULL OR p_request_hash!~'^[a-f0-9]{64}$'
 OR(SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(p_files))<>jsonb_array_length(p_files) THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 -- Recheck every source grant even on an idempotent replay; no cached metadata
 -- can leak after a team/page/session grant is withdrawn.
 FOR item IN SELECT value FROM jsonb_array_elements(p_files) ORDER BY value->>'id' LOOP
  SELECT * INTO f FROM public.media_files WHERE id=(item->>'id')::uuid FOR UPDATE;
  IF NOT FOUND OR NOT public.can_operate_media(p_actor,f.team_id,'read') OR NOT public.can_operate_media(p_actor,f.team_id,CASE WHEN p_action='archive' THEN 'delete' ELSE 'update' END) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 END LOOP;
 IF p_action='move' THEN
  team:=(p_document->>'teamId')::uuid;
  IF NOT public.can_operate_media(p_actor,team,'read') OR NOT public.can_operate_media(p_actor,team,'create') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
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
   OR length(coalesce(p_document->>'description',''))>1000 OR jsonb_typeof(p_document->'tags') IS DISTINCT FROM 'array' OR jsonb_array_length(p_document->'tags')>20
   OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_document->'tags') v WHERE length(btrim(v)) NOT BETWEEN 1 AND 40)
   OR(SELECT count(DISTINCT lower(v)) FROM jsonb_array_elements_text(p_document->'tags') v)<>jsonb_array_length(p_document->'tags')
   OR(p_document->>'order')::integer NOT BETWEEN 0 AND 1000000 OR jsonb_typeof(p_document->'allowDownload') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_files) ORDER BY value->>'id' LOOP
  SELECT * INTO f FROM public.media_files WHERE id=(item->>'id')::uuid;
  IF f.revision IS DISTINCT FROM(item->>'revision')::integer THEN RAISE EXCEPTION 'CONFLICT';END IF;
  IF f.purged_at IS NOT NULL OR(f.deleted_at IS NOT NULL AND p_action<>'restore') OR(f.deleted_at IS NULL AND p_action='restore') THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  IF p_action IN('move','archive') AND(coalesce(f.is_public,false) OR gdg_security.media_in_use(f.id) OR f.scan_state IN('pending','queued')) THEN RAISE EXCEPTION 'MEDIA_IN_USE';END IF;
  IF p_action='move' AND f.team_id IS DISTINCT FROM team AND
   (coalesce((SELECT sum(file_size) FROM public.media_files WHERE team_id IS NOT DISTINCT FROM team AND purged_at IS NULL),0)+f.file_size>1073741824
    OR(SELECT count(*) FROM public.media_files WHERE team_id IS NOT DISTINCT FROM team AND purged_at IS NULL)>=1000) THEN RAISE EXCEPTION 'MEDIA_QUOTA';END IF;
  IF p_action='metadata' THEN
   -- Published metadata changes require an explicit revoke/review cycle, so a
   -- caption or download permission cannot silently change an approved image.
   IF coalesce(f.is_public,false) THEN RAISE EXCEPTION 'MEDIA_IN_USE';END IF;
   IF p_document->>'eventId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.events e WHERE e.id=(p_document->>'eventId')::uuid AND e.publication_status<>'archived' AND e.team_id IS NOT DISTINCT FROM f.team_id) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
   UPDATE public.media_files SET name=btrim(p_document->>'name'),alt_text=p_document->>'alt',description=p_document->>'description',tags=p_document->'tags',event_id=(p_document->>'eventId')::uuid,
    gallery_order=(p_document->>'order')::integer,allow_download=(p_document->>'allowDownload')::boolean,revision=revision+1,updated_at=now() WHERE id=f.id;
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
COMMIT;

