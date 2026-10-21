BEGIN;
CREATE TABLE public.media_publications(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),file_id uuid NOT NULL REFERENCES public.media_files(id),actor_id uuid NOT NULL REFERENCES public.admin_users(id),session_id uuid NOT NULL REFERENCES public.admin_sessions(id),
 verified_hash text,source_revision integer NOT NULL,state text NOT NULL DEFAULT 'queued' CHECK(state IN('queued','published','revoked','failed')),
 error_code text,created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT now()+interval '30 minutes',published_at timestamptz,revoked_at timestamptz);
CREATE UNIQUE INDEX media_single_queued_publication ON public.media_publications(file_id) WHERE state='queued';
CREATE TABLE public.media_derivatives(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),publication_id uuid NOT NULL REFERENCES public.media_publications(id),lease_token uuid NOT NULL,
 object_key text NOT NULL UNIQUE,width_key integer NOT NULL CHECK(width_key IN(360,960,1920)),width integer,height integer,byte_size integer,sha256 text,
 state text NOT NULL DEFAULT 'reserved' CHECK(state IN('reserved','approved','deleted')),created_at timestamptz NOT NULL DEFAULT now(),purged_at timestamptz,
 UNIQUE(publication_id,lease_token,width_key));
ALTER TABLE public.media_files ADD COLUMN publication_id uuid REFERENCES public.media_publications(id);
ALTER TABLE public.media_publications ENABLE ROW LEVEL SECURITY;ALTER TABLE public.media_derivatives ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.media_publications,public.media_derivatives FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT ALL ON public.media_publications,public.media_derivatives TO service_role;
CREATE FUNCTION gdg_security.media_publication_allowed(p_publication uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.media_publications p JOIN public.media_files f ON f.id=p.file_id JOIN public.upload_intents u ON u.id=f.upload_id AND u.media_id=f.id
 JOIN public.admin_users a ON a.id=p.actor_id WHERE p.id=p_publication AND p.state='queued' AND p.expires_at>now() AND p.verified_hash=a.password_hash
 AND gdg_security.member_transfer_session(p.actor_id,p.session_id) AND public.can_operate_media(p.actor_id,f.team_id,'read') AND public.can_operate_media(p.actor_id,f.team_id,'update') AND public.can_operate_media(p.actor_id,f.team_id,'publish',true)
 AND f.revision=p.source_revision AND f.deleted_at IS NULL AND f.purged_at IS NULL AND NOT coalesce(f.is_public,false) AND f.scan_state='clean' AND f.file_type='image'
 AND f.mime_type IN('image/png','image/jpeg','image/webp') AND length(btrim(coalesce(f.alt_text,'')))>0 AND u.purpose='media' AND u.state='clean' AND u.deleted_at IS NULL AND f.file_path=u.clean_key AND u.media_clean_sha256 IS NOT NULL
 AND(f.team_id IS NULL OR EXISTS(SELECT 1 FROM public.admin_teams WHERE id=f.team_id AND is_active AND deleted_at IS NULL))
 AND(f.event_id IS NULL OR EXISTS(SELECT 1 FROM public.events e WHERE e.id=f.event_id AND e.publication_status='published' AND e.team_id IS NOT DISTINCT FROM f.team_id)));
$$;
CREATE FUNCTION public.mutate_media_publication(p_actor uuid,p_session uuid,p_file uuid,p_revision integer,p_action text,p_verified_hash text,p_key_hash text,p_request_hash text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE f public.media_files;p public.media_publications;k public.idempotency_keys;scope_key text;r jsonb;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('private-media',0));
 IF NOT gdg_security.member_transfer_session(p_actor,p_session) OR NOT EXISTS(SELECT 1 FROM public.admin_users WHERE id=p_actor AND password_hash=p_verified_hash) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT * INTO f FROM public.media_files WHERE id=p_file AND deleted_at IS NULL AND purged_at IS NULL FOR UPDATE;
 IF NOT FOUND OR NOT public.can_operate_media(p_actor,f.team_id,'read') OR NOT public.can_operate_media(p_actor,f.team_id,'update') OR NOT public.can_operate_media(p_actor,f.team_id,'publish',true) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
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
CREATE FUNCTION public.prepare_media_publication(p_job uuid,p_lease uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.delivery_jobs;p public.media_publications;f public.media_files;u public.upload_intents;w integer;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('private-media',0));
 SELECT * INTO j FROM public.delivery_jobs WHERE id=p_job AND lease_token=p_lease AND kind='media_publish' AND state='running' AND locked_until>now() FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT * INTO p FROM public.media_publications WHERE id=(j.payload->>'publicationId')::uuid FOR UPDATE;
 IF p.id IS NULL OR NOT gdg_security.media_publication_allowed(p.id) THEN
  UPDATE public.media_publications SET state='failed',error_code='SOURCE_OR_ACCESS_CHANGED',verified_hash=NULL WHERE id=p.id AND state='queued';
  PERFORM public.finish_delivery_job(j.id,p_lease,true,NULL,NULL);RETURN NULL;
 END IF;
 SELECT * INTO f FROM public.media_files WHERE id=p.file_id;
 SELECT * INTO u FROM public.upload_intents WHERE id=f.upload_id;
 FOREACH w IN ARRAY ARRAY[360,960,1920] LOOP
  INSERT INTO public.media_derivatives(publication_id,lease_token,width_key,object_key) VALUES(p.id,p_lease,w,'public/'||f.id||'/'||p.id||'/'||p_lease||'/'||w||'.webp') ON CONFLICT(publication_id,lease_token,width_key) DO NOTHING;
 END LOOP;
 RETURN jsonb_build_object('publicationId',p.id,'fileId',f.id,'sourceKey',u.clean_key,'sha256',u.media_clean_sha256,'bytes',f.file_size,'variants',(SELECT jsonb_agg(jsonb_build_object('widthKey',width_key,'key',object_key) ORDER BY width_key) FROM public.media_derivatives WHERE publication_id=p.id AND lease_token=p_lease));
END $$;
CREATE FUNCTION public.finish_media_publication(p_job uuid,p_lease uuid,p_variants jsonb,p_error text) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.delivery_jobs;p public.media_publications;v jsonb;d public.media_derivatives;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('private-media',0));
 SELECT * INTO j FROM public.delivery_jobs WHERE id=p_job AND lease_token=p_lease AND kind='media_publish' AND state='running' AND locked_until>now() FOR UPDATE;
 IF NOT FOUND THEN RETURN false;END IF;
 SELECT * INTO p FROM public.media_publications WHERE id=(j.payload->>'publicationId')::uuid FOR UPDATE;
 IF p.id IS NULL THEN PERFORM public.finish_delivery_job(j.id,p_lease,true,NULL,NULL);RETURN false;END IF;
 IF p_error IS NOT NULL OR NOT gdg_security.media_publication_allowed(p.id) THEN
  UPDATE public.media_publications SET state='failed',error_code=coalesce(p_error,'SOURCE_OR_ACCESS_CHANGED'),verified_hash=NULL WHERE id=p.id AND state='queued';
  PERFORM public.finish_delivery_job(j.id,p_lease,true,NULL,NULL);RETURN false;
 END IF;
 IF jsonb_typeof(p_variants) IS DISTINCT FROM 'array' OR jsonb_array_length(p_variants)<>3 OR(SELECT count(DISTINCT value->>'widthKey') FROM jsonb_array_elements(p_variants))<>3 THEN RAISE EXCEPTION 'INVALID_UPLOAD';END IF;
 FOR v IN SELECT value FROM jsonb_array_elements(p_variants) LOOP
  SELECT * INTO d FROM public.media_derivatives WHERE publication_id=p.id AND lease_token=p_lease AND width_key=(v->>'widthKey')::integer AND state='reserved' FOR UPDATE;
  IF NOT FOUND OR(v->>'bytes')::integer NOT BETWEEN 1 AND 3670016 OR(v->>'width')::integer NOT BETWEEN 1 AND d.width_key OR(v->>'height')::integer NOT BETWEEN 1 AND 16000
   OR v->>'sha256' IS NULL OR v->>'sha256'!~'^[a-f0-9]{64}$' OR v->>'width' IS NULL OR v->>'height' IS NULL OR v->>'bytes' IS NULL THEN RAISE EXCEPTION 'INVALID_UPLOAD';END IF;
  UPDATE public.media_derivatives SET state='approved',byte_size=(v->>'bytes')::integer,width=(v->>'width')::integer,height=(v->>'height')::integer,sha256=v->>'sha256' WHERE id=d.id;
 END LOOP;
 UPDATE public.media_publications SET state='published',published_at=now(),verified_hash=NULL WHERE id=p.id;
 UPDATE public.media_files SET is_public=true,publication_id=p.id,revision=revision+1,updated_at=now() WHERE id=p.file_id;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,metadata) VALUES(p.actor_id,'media.publication_approved','media_file',p.file_id,jsonb_build_object('publicationId',p.id,'sourceRevision',p.source_revision));
 PERFORM public.finish_delivery_job(j.id,p_lease,true,NULL,NULL);RETURN true;
END $$;
-- Current record checks apply on every asset request. Never resolve legacy
-- is_public flags, quarantine keys or caller-supplied storage paths.
CREATE FUNCTION public.read_public_media_asset(p_file uuid,p_width integer,p_download boolean) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('key',d.object_key,'sha256',d.sha256,'bytes',d.byte_size,'width',d.width,'height',d.height)
 FROM public.media_files f JOIN public.media_publications p ON p.id=f.publication_id AND p.file_id=f.id AND p.state='published'
 JOIN public.media_derivatives d ON d.publication_id=p.id AND d.state='approved' AND d.width_key=p_width AND d.purged_at IS NULL
 WHERE f.id=p_file AND f.is_public AND f.scan_state='clean' AND f.deleted_at IS NULL AND f.purged_at IS NULL AND f.file_type='image'
 AND(NOT p_download OR f.allow_download) AND d.object_key LIKE 'public/'||f.id||'/'||p.id||'/%'
 AND(f.team_id IS NULL OR EXISTS(SELECT 1 FROM public.admin_teams WHERE id=f.team_id AND is_active AND deleted_at IS NULL))
 AND(f.event_id IS NULL OR EXISTS(SELECT 1 FROM public.events WHERE id=f.event_id AND publication_status='published'));
$$;
CREATE FUNCTION public.read_public_gallery(p_event uuid,p_page integer) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;BEGIN
 IF p_page NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 WITH eligible AS(SELECT f.id,f.alt_text,f.description,f.width,f.height,f.event_id,f.gallery_order,f.created_at,f.allow_download,e.title event_title
 FROM public.media_files f LEFT JOIN public.events e ON e.id=f.event_id
 WHERE(p_event IS NULL OR f.event_id=p_event) AND public.read_public_media_asset(f.id,960,false) IS NOT NULL),
 page AS(SELECT * FROM eligible ORDER BY gallery_order,created_at DESC,id LIMIT 30 OFFSET(p_page-1)*30)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(page) ORDER BY gallery_order,created_at DESC,id) FROM page),'[]'),'total',(SELECT count(*) FROM eligible),'page',p_page,'pageSize',30) INTO result;RETURN result;
END $$;
REVOKE ALL ON FUNCTION gdg_security.media_publication_allowed(uuid),public.mutate_media_publication(uuid,uuid,uuid,integer,text,text,text,text,uuid),public.prepare_media_publication(uuid,uuid),public.finish_media_publication(uuid,uuid,jsonb,text),public.read_public_media_asset(uuid,integer,boolean),public.read_public_gallery(uuid,integer) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION gdg_security.media_publication_allowed(uuid),public.mutate_media_publication(uuid,uuid,uuid,integer,text,text,text,text,uuid),public.prepare_media_publication(uuid,uuid),public.finish_media_publication(uuid,uuid,jsonb,text),public.read_public_media_asset(uuid,integer,boolean),public.read_public_gallery(uuid,integer) TO service_role;
CREATE OR REPLACE FUNCTION gdg_security.media_file_record(p_actor uuid,p_file uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('id',f.id,'name',f.name,'originalName',f.original_name,'fileType',f.file_type,'mime',f.mime_type,'bytes',f.file_size,
  'folderId',f.folder_id,'teamId',f.team_id,'revision',f.revision,'deletedAt',f.deleted_at,'purgedAt',f.purged_at,'scanState',f.scan_state,
  'starred',coalesce(f.is_starred,false),'public',coalesce(f.is_public,false),'alt',coalesce(f.alt_text,''),'description',coalesce(f.description,''),
  'tags',coalesce(f.tags,'[]'),'eventId',f.event_id,'order',f.gallery_order,'allowDownload',f.allow_download,'width',f.width,'height',f.height,'createdAt',f.created_at,'updatedAt',f.updated_at,
  'publicationState',(SELECT state FROM public.media_publications WHERE file_id=f.id ORDER BY created_at DESC,id DESC LIMIT 1),
  'usageCount',(SELECT count(*) FROM public.media_usage WHERE file_id=f.id),'duration',f.duration,
  'inUse',gdg_security.media_in_use(f.id),'actions',(SELECT coalesce(jsonb_agg(action),'[]') FROM unnest(ARRAY['read','update','delete']) action WHERE public.can_operate_media(p_actor,f.team_id,action)),
  'canPublish',public.can_operate_media(p_actor,f.team_id,'update') AND public.can_operate_media(p_actor,f.team_id,'publish',true))
 FROM public.media_files f WHERE f.id=p_file AND public.can_operate_media(p_actor,f.team_id,'read');
$$;
COMMIT;
