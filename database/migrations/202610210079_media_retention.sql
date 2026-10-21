BEGIN;
ALTER TABLE public.media_files ADD COLUMN cleanup_started_at timestamptz;
CREATE FUNCTION gdg_security.media_cleanup_restore_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF OLD.cleanup_started_at IS NOT NULL AND NEW.deleted_at IS NULL THEN RAISE EXCEPTION 'MEDIA_CLEANUP_STARTED';END IF;RETURN NEW;
END $$;
CREATE TRIGGER media_cleanup_restore_guard BEFORE UPDATE OF deleted_at ON public.media_files FOR EACH ROW EXECUTE FUNCTION gdg_security.media_cleanup_restore_guard();
CREATE TABLE public.media_scan_objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),upload_id uuid NOT NULL REFERENCES public.upload_intents(id),job_id uuid NOT NULL REFERENCES public.delivery_jobs(id),
 lease_token uuid NOT NULL,object_key text NOT NULL UNIQUE,created_at timestamptz NOT NULL DEFAULT now(),purged_at timestamptz,UNIQUE(job_id,lease_token));
ALTER TABLE public.media_scan_objects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.media_scan_objects FROM PUBLIC,anon,authenticated,gdg_realtime;GRANT ALL ON public.media_scan_objects TO service_role;
CREATE FUNCTION public.reserve_media_scan_object(p_job uuid,p_lease uuid) RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.delivery_jobs;u public.upload_intents;key text;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('private-media',0));
 SELECT * INTO j FROM public.delivery_jobs WHERE id=p_job AND lease_token=p_lease AND kind='media_upload_scan' AND state='running' AND locked_until>now() FOR UPDATE;
 SELECT * INTO u FROM public.upload_intents WHERE id=(j.payload->>'uploadId')::uuid AND purpose='media' AND state='queued' AND deleted_at IS NULL;
 IF j.id IS NULL OR u.id IS NULL THEN RETURN NULL;END IF;
 key:='clean/'||u.id||'/'||p_lease;
 INSERT INTO public.media_scan_objects(upload_id,job_id,lease_token,object_key) VALUES(u.id,j.id,p_lease,key) ON CONFLICT(job_id,lease_token) DO NOTHING;RETURN key;
END $$;
ALTER FUNCTION public.finish_media_upload_scan(uuid,uuid,text,text,bigint,text,jsonb,text) RENAME TO finish_media_upload_scan_unregistered;
CREATE FUNCTION public.finish_media_upload_scan(p_job uuid,p_lease uuid,p_clean_key text,p_mime text,p_bytes bigint,p_sha256 text,p_metadata jsonb,p_reject text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('private-media',0));
 IF NOT EXISTS(SELECT 1 FROM public.delivery_jobs WHERE id=p_job AND lease_token=p_lease AND kind='media_upload_scan' AND state='running' AND locked_until>now()) THEN RETURN false;END IF;
 IF p_reject IS NULL AND NOT EXISTS(SELECT 1 FROM public.media_scan_objects WHERE job_id=p_job AND lease_token=p_lease AND object_key=p_clean_key AND purged_at IS NULL) THEN RAISE EXCEPTION 'INVALID_UPLOAD';END IF;
 RETURN public.finish_media_upload_scan_unregistered(p_job,p_lease,p_clean_key,p_mime,p_bytes,p_sha256,p_metadata,p_reject);
END $$;
CREATE FUNCTION public.claim_media_upload_cleanup(p_limit integer) RETURNS SETOF public.upload_intents LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE candidate uuid;u public.upload_intents;f public.media_files;BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('private-media',0));
 FOR candidate IN SELECT i.id FROM public.upload_intents i JOIN public.media_files m ON m.id=i.media_id WHERE i.purpose='media' AND i.purged_at IS NULL AND
  ((i.state<>'clean' AND i.expires_at<now()-interval '24 hours') OR(m.deleted_at<now()-interval '30 days')) ORDER BY i.created_at,i.id LIMIT p_limit LOOP
  SELECT * INTO u FROM public.upload_intents WHERE id=candidate FOR UPDATE;SELECT * INTO f FROM public.media_files WHERE id=u.media_id FOR UPDATE;
  IF u.purged_at IS NOT NULL OR f.purged_at IS NOT NULL OR coalesce(f.is_public,false) OR gdg_security.media_in_use(f.id)
   OR EXISTS(SELECT 1 FROM public.media_publications WHERE file_id=f.id AND state IN('queued','published'))
   OR EXISTS(SELECT 1 FROM public.delivery_jobs WHERE kind='media_upload_scan' AND payload->>'uploadId'=u.id::text AND state='running' AND locked_until>now()) THEN CONTINUE;END IF;
  UPDATE public.upload_intents SET deleted_at=coalesce(deleted_at,now()),state=CASE WHEN state IN('pending','queued') THEN 'expired' ELSE state END WHERE id=u.id RETURNING * INTO u;
  UPDATE public.media_files SET deleted_at=coalesce(deleted_at,now()),cleanup_started_at=coalesce(cleanup_started_at,now()),scan_state=CASE WHEN scan_state IN('pending','queued') THEN 'expired' ELSE scan_state END,revision=revision+1,updated_at=now() WHERE id=f.id;
  UPDATE public.delivery_jobs SET state='dead',lease_token=NULL,locked_until=NULL,last_error_code='MEDIA_EXPIRED' WHERE kind='media_upload_scan' AND payload->>'uploadId'=u.id::text AND state IN('pending','running');
  RETURN NEXT u;
 END LOOP;
END $$;
CREATE FUNCTION public.finish_media_upload_cleanup(p_upload uuid) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE u public.upload_intents;f public.media_files;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('private-media',0));
 SELECT * INTO u FROM public.upload_intents WHERE id=p_upload AND purpose='media' FOR UPDATE;SELECT * INTO f FROM public.media_files WHERE id=u.media_id FOR UPDATE;
 IF u.id IS NULL OR f.id IS NULL OR u.deleted_at IS NULL OR f.deleted_at IS NULL OR coalesce(f.is_public,false) OR gdg_security.media_in_use(f.id)
  OR EXISTS(SELECT 1 FROM public.media_publications WHERE file_id=f.id AND state IN('queued','published'))
  OR EXISTS(SELECT 1 FROM public.delivery_jobs WHERE kind='media_upload_scan' AND payload->>'uploadId'=u.id::text AND state='running' AND locked_until>now()) THEN RETURN false;END IF;
 UPDATE public.upload_intents SET purged_at=coalesce(purged_at,now()),filename='',clean_key=NULL,media_clean_sha256=NULL WHERE id=u.id;
 UPDATE public.media_scan_objects SET purged_at=coalesce(purged_at,now()) WHERE upload_id=u.id AND object_key=u.clean_key;
 UPDATE public.media_files SET purged_at=coalesce(purged_at,now()),name='Removed media file',original_name='',file_path='',thumbnail_path=NULL,file_size=0,alt_text=NULL,description=NULL,tags='[]',seo_title=NULL,seo_description=NULL,width=NULL,height=NULL,duration=NULL,revision=revision+1,updated_at=now() WHERE id=f.id;
 DELETE FROM public.idempotency_keys WHERE scope LIKE 'media.%' AND(strpos(result::text,f.id::text)>0 OR strpos(scope,f.id::text)>0);
 RETURN true;
END $$;
CREATE FUNCTION public.claim_media_object_cleanup(p_limit integer) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('private-media',0));
 UPDATE public.media_publications p SET state='failed',error_code='PUBLICATION_EXPIRED',verified_hash=NULL WHERE p.state='queued' AND(p.expires_at<now() OR EXISTS(SELECT 1 FROM public.delivery_jobs j WHERE j.kind='media_publish' AND j.payload->>'publicationId'=p.id::text AND j.state='dead'));
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(c)) FROM(
  SELECT d.id,'derivative' kind,d.object_key key FROM public.media_derivatives d JOIN public.media_publications p ON p.id=d.publication_id JOIN public.media_files f ON f.id=p.file_id
  WHERE d.purged_at IS NULL AND d.created_at<now()-interval '24 hours' AND NOT(d.state='approved' AND p.state='published' AND f.is_public AND f.publication_id=p.id)
   AND NOT EXISTS(SELECT 1 FROM public.delivery_jobs j WHERE j.kind='media_publish' AND j.payload->>'publicationId'=p.id::text AND j.state='running' AND j.locked_until>now())
  UNION ALL
  SELECT o.id,'scan' kind,o.object_key key FROM public.media_scan_objects o JOIN public.upload_intents u ON u.id=o.upload_id WHERE o.purged_at IS NULL AND o.created_at<now()-interval '24 hours'
   AND NOT(u.state='clean' AND u.clean_key=o.object_key AND u.purged_at IS NULL)
   AND NOT EXISTS(SELECT 1 FROM public.delivery_jobs j WHERE j.id=o.job_id AND j.lease_token=o.lease_token AND j.state='running' AND j.locked_until>now())
  ORDER BY id LIMIT p_limit)c),'[]');
END $$;
CREATE FUNCTION public.finish_media_object_cleanup(p_object uuid,p_kind text) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('private-media',0));
 IF p_kind='derivative' THEN
  UPDATE public.media_derivatives d SET state='deleted',purged_at=coalesce(purged_at,now()) WHERE d.id=p_object
   AND NOT EXISTS(SELECT 1 FROM public.media_publications p JOIN public.media_files f ON f.publication_id=p.id WHERE p.id=d.publication_id AND p.state='published' AND f.is_public AND d.state='approved');RETURN FOUND;
 ELSIF p_kind='scan' THEN
  UPDATE public.media_scan_objects o SET purged_at=coalesce(purged_at,now()) WHERE o.id=p_object AND NOT EXISTS(SELECT 1 FROM public.upload_intents u WHERE u.id=o.upload_id AND u.state='clean' AND u.clean_key=o.object_key AND u.purged_at IS NULL);RETURN FOUND;
 END IF;RETURN false;
END $$;
CREATE OR REPLACE FUNCTION public.read_public_gallery(p_event uuid,p_page integer) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;BEGIN
 IF p_page NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 WITH approved AS(SELECT f.id,f.alt_text,f.description,f.width,f.height,f.event_id,f.gallery_order,f.created_at,f.allow_download,e.title event_title FROM public.media_files f LEFT JOIN public.events e ON e.id=f.event_id WHERE public.read_public_media_asset(f.id,960,false) IS NOT NULL),
 eligible AS(SELECT * FROM approved WHERE p_event IS NULL OR event_id=p_event),page AS(SELECT * FROM eligible ORDER BY gallery_order,created_at DESC,id LIMIT 30 OFFSET(p_page-1)*30)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(page) ORDER BY gallery_order,created_at DESC,id) FROM page),'[]'),'total',(SELECT count(*) FROM eligible),'page',p_page,'pageSize',30,
  'events',coalesce((SELECT jsonb_agg(jsonb_build_object('id',event_id,'title',event_title) ORDER BY event_title) FROM(SELECT DISTINCT event_id,event_title FROM approved WHERE event_id IS NOT NULL)e),'[]')) INTO result;RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.reserve_media_scan_object(uuid,uuid),public.finish_media_upload_scan(uuid,uuid,text,text,bigint,text,jsonb,text),public.claim_media_upload_cleanup(integer),public.finish_media_upload_cleanup(uuid),public.claim_media_object_cleanup(integer),public.finish_media_object_cleanup(uuid,text) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.reserve_media_scan_object(uuid,uuid),public.finish_media_upload_scan(uuid,uuid,text,text,bigint,text,jsonb,text),public.claim_media_upload_cleanup(integer),public.finish_media_upload_cleanup(uuid),public.claim_media_object_cleanup(integer),public.finish_media_object_cleanup(uuid,text) TO service_role;
CREATE OR REPLACE FUNCTION gdg_security.media_file_record(p_actor uuid,p_file uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('id',f.id,'name',f.name,'originalName',f.original_name,'fileType',f.file_type,'mime',f.mime_type,'bytes',f.file_size,
  'folderId',f.folder_id,'teamId',f.team_id,'revision',f.revision,'deletedAt',f.deleted_at,'purgedAt',f.purged_at,'cleanupStartedAt',f.cleanup_started_at,'scanState',f.scan_state,
  'starred',coalesce(f.is_starred,false),'public',coalesce(f.is_public,false),'alt',coalesce(f.alt_text,''),'description',coalesce(f.description,''),
  'tags',coalesce(f.tags,'[]'),'eventId',f.event_id,'order',f.gallery_order,'allowDownload',f.allow_download,'width',f.width,'height',f.height,'createdAt',f.created_at,'updatedAt',f.updated_at,
  'publicationState',(SELECT state FROM public.media_publications WHERE file_id=f.id ORDER BY created_at DESC,id DESC LIMIT 1),
  'usageCount',(SELECT count(*) FROM public.media_usage WHERE file_id=f.id),'duration',f.duration,
  'inUse',gdg_security.media_in_use(f.id),'actions',(SELECT coalesce(jsonb_agg(action),'[]') FROM unnest(ARRAY['read','update','delete']) action WHERE public.can_operate_media(p_actor,f.team_id,action) AND f.cleanup_started_at IS NULL),
  'canPublish',public.can_operate_media(p_actor,f.team_id,'update') AND public.can_operate_media(p_actor,f.team_id,'publish',true))
 FROM public.media_files f WHERE f.id=p_file AND public.can_operate_media(p_actor,f.team_id,'read');
$$;
REVOKE ALL ON FUNCTION gdg_security.media_cleanup_restore_guard() FROM PUBLIC,anon,authenticated,gdg_realtime;
COMMIT;
