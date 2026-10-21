BEGIN;
ALTER TABLE public.upload_intents ADD COLUMN blog_submission_id uuid REFERENCES public.blog_submissions(id) ON DELETE RESTRICT,ADD COLUMN blog_revision integer;
ALTER TABLE public.blog_submissions ADD COLUMN upload_id uuid UNIQUE REFERENCES public.upload_intents(id) ON DELETE RESTRICT;
ALTER TABLE public.upload_intents ADD CONSTRAINT blog_upload_scope CHECK(purpose<>'blog' OR
 (blog_submission_id IS NOT NULL AND blog_revision>0 AND owner_id IS NOT NULL AND owner_session IS NOT NULL AND bucket='blog-submissions'
 AND form_id IS NULL AND finance_id IS NULL AND expected_bytes<=20971520 AND declared_mime IN('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain','image/png','image/jpeg','image/webp')));
CREATE INDEX blog_upload_parent ON public.upload_intents(blog_submission_id,created_at DESC) WHERE purpose='blog';
CREATE FUNCTION gdg_security.protect_blog_submission_file() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.team_id IS DISTINCT FROM OLD.team_id THEN RAISE EXCEPTION 'BLOG_RETAINED';END IF;
 IF OLD.upload_id IS NOT NULL AND(NEW.upload_id IS DISTINCT FROM OLD.upload_id OR NEW.original_name IS DISTINCT FROM OLD.original_name) THEN RAISE EXCEPTION 'BLOG_RETAINED';END IF;
 IF OLD.scan_status='clean' AND(NEW.scan_status IS DISTINCT FROM OLD.scan_status OR NEW.file_path IS DISTINCT FROM OLD.file_path OR NEW.file_size IS DISTINCT FROM OLD.file_size OR NEW.mime_type IS DISTINCT FROM OLD.mime_type) THEN RAISE EXCEPTION 'BLOG_RETAINED';END IF;
 IF NEW.scan_status='clean' AND NOT EXISTS(SELECT 1 FROM public.upload_intents WHERE id=NEW.upload_id AND purpose='blog' AND blog_submission_id=NEW.id AND state='clean' AND deleted_at IS NULL AND clean_key=NEW.file_path) THEN RAISE EXCEPTION 'INVALID_UPLOAD';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_blog_submission_file BEFORE UPDATE ON public.blog_submissions FOR EACH ROW EXECUTE FUNCTION gdg_security.protect_blog_submission_file();

CREATE FUNCTION public.mutate_blog_upload(p_actor uuid,p_session uuid,p_upload uuid,p_action text,p_document jsonb,p_key_hash text,p_request_hash text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE actor public.admin_users;sub public.blog_submissions;u public.upload_intents;k public.idempotency_keys;r jsonb;scope_key text;team uuid;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('private-blog',0));
 SELECT * INTO actor FROM public.admin_users WHERE id=p_actor AND is_active AND NOT must_change_password AND deleted_at IS NULL AND(locked_until IS NULL OR locked_until<=now());
 IF actor.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.admin_sessions WHERE id=p_session AND admin_user_id=p_actor AND revoked_at IS NULL AND idle_expires_at>now() AND absolute_expires_at>now()) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 IF p_action IS NULL OR p_action NOT IN('create','complete') OR p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$' OR p_request_hash IS NULL OR p_request_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 IF p_action='create' THEN team:=(p_document->>'teamId')::uuid;
 ELSE SELECT * INTO u FROM public.upload_intents WHERE id=p_upload AND purpose='blog' AND owner_id=p_actor AND owner_session=p_session AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  SELECT * INTO sub FROM public.blog_submissions WHERE id=u.blog_submission_id FOR UPDATE;team:=sub.team_id;
  IF sub.id IS NULL OR sub.deleted_at IS NOT NULL OR NOT public.can_operate_blog(p_actor,'submissions',sub.id,NULL,'read') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 END IF;
 IF NOT public.can_operate_blog(p_actor,'posts',NULL,team,'create') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 scope_key:='blog-uploads.'||p_action||':'||p_actor||':'||p_session||':'||coalesce(p_upload::text,'new');
 SELECT * INTO k FROM public.idempotency_keys WHERE scope=scope_key AND key_hash=p_key_hash;
 IF FOUND THEN IF k.request_hash IS DISTINCT FROM p_request_hash THEN RAISE EXCEPTION 'CONFLICT';END IF;RETURN k.result;END IF;
 IF p_action='create' THEN
  IF p_upload IS NOT NULL OR p_document->>'mime' IS NULL OR p_document->>'mime' NOT IN('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain','image/png','image/jpeg','image/webp')
   OR(p_document->>'bytes')::bigint NOT BETWEEN 1 AND 20971520 OR p_document->>'sha256' IS NULL OR p_document->>'sha256'!~'^[a-f0-9]{64}$'
   OR p_document->>'key' IS NULL OR p_document->>'key'!~'^quarantine/[a-f0-9-]{36}/[a-f0-9-]{36}$' OR length(coalesce(p_document->>'filename','')) NOT BETWEEN 1 AND 180 THEN RAISE EXCEPTION 'INVALID_UPLOAD';END IF;
  IF(SELECT count(*) FROM public.upload_intents WHERE purpose='blog' AND owner_id=p_actor AND created_at>now()-interval '24 hours')>=25 OR
   coalesce((SELECT sum(expected_bytes) FROM public.upload_intents WHERE purpose='blog' AND owner_id=p_actor AND created_at>now()-interval '24 hours'),0)+(p_document->>'bytes')::bigint>262144000 OR
   (SELECT count(*) FROM public.upload_intents WHERE purpose='blog' AND owner_id=p_actor AND state IN('pending','queued') AND deleted_at IS NULL AND expires_at>now())>=5 THEN RAISE EXCEPTION 'UPLOAD_QUOTA';END IF;
  INSERT INTO public.blog_submissions(file_path,original_name,submitter_name,submitter_email,file_size,mime_type,team_id,created_by,scan_status)
   VALUES('',p_document->>'filename',coalesce(actor.display_name,'Chapter contributor'),actor.email,(p_document->>'bytes')::bigint,p_document->>'mime',team,actor.id,'pending') RETURNING * INTO sub;
  INSERT INTO public.upload_intents(purpose,blog_submission_id,blog_revision,owner_id,owner_session,proof_hash,bucket,quarantine_key,filename,declared_mime,expected_bytes,expected_sha256)
   VALUES('blog',sub.id,sub.revision,actor.id,p_session,p_request_hash,'blog-submissions',p_document->>'key',p_document->>'filename',p_document->>'mime',(p_document->>'bytes')::bigint,p_document->>'sha256') RETURNING * INTO u;
  UPDATE public.blog_submissions SET upload_id=u.id WHERE id=sub.id;
 ELSE
  IF u.blog_revision IS DISTINCT FROM sub.revision THEN RAISE EXCEPTION 'CONFLICT';END IF;
  IF u.state='pending' THEN
   IF u.expires_at<=now() THEN RAISE EXCEPTION 'INVALID_UPLOAD';END IF;
   UPDATE public.upload_intents SET state='queued',completed_at=now() WHERE id=u.id RETURNING * INTO u;
   INSERT INTO public.delivery_jobs(kind,deduplication_key,payload) VALUES('upload_scan','upload_scan:'||u.id,jsonb_build_object('uploadId',u.id));
  ELSIF u.state NOT IN('queued','clean') THEN RAISE EXCEPTION 'INVALID_UPLOAD';END IF;
 END IF;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata) VALUES(p_actor,'blog.upload_'||p_action,'private_blog',sub.id,p_request_id,jsonb_build_object('uploadId',u.id,'revision',sub.revision));
 r:=jsonb_build_object('uploadId',u.id,'submissionId',sub.id,'state',u.state);
 INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result) VALUES(scope_key,p_key_hash,p_request_hash,200,r);RETURN r;
END $$;

CREATE FUNCTION public.blog_file_download(p_actor uuid,p_upload uuid,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE sub public.blog_submissions;u public.upload_intents;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('private-blog',0));
 SELECT * INTO u FROM public.upload_intents WHERE id=p_upload AND purpose='blog' AND state='clean' AND deleted_at IS NULL;
 SELECT * INTO sub FROM public.blog_submissions WHERE id=u.blog_submission_id AND upload_id=u.id AND scan_status='clean' AND file_path=u.clean_key;
 IF sub.id IS NULL OR NOT public.can_operate_blog(p_actor,'submissions',sub.id,NULL,'read') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata) VALUES(p_actor,'blog.file_downloaded','private_blog',sub.id,p_request_id,jsonb_build_object('uploadId',u.id));
 RETURN jsonb_build_object('key',u.clean_key,'filename',u.filename);
END $$;

ALTER FUNCTION public.finish_upload_scan(uuid,uuid,text,text,bigint,text,text) RENAME TO finish_form_finance_upload_scan;
CREATE FUNCTION public.finish_upload_scan(p_job uuid,p_lease uuid,p_clean_key text,p_mime text,p_bytes bigint,p_sha256 text,p_reject text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.delivery_jobs;u public.upload_intents;sub public.blog_submissions;purpose text;reject_reason text:=p_reject;BEGIN
 SELECT i.purpose INTO purpose FROM public.delivery_jobs d JOIN public.upload_intents i ON i.id=(d.payload->>'uploadId')::uuid WHERE d.id=p_job AND d.kind='upload_scan';
 IF purpose IS DISTINCT FROM 'blog' THEN RETURN public.finish_form_finance_upload_scan(p_job,p_lease,p_clean_key,p_mime,p_bytes,p_sha256,p_reject);END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('private-blog',0));
 SELECT * INTO j FROM public.delivery_jobs WHERE id=p_job AND lease_token=p_lease AND kind='upload_scan' AND state='running' AND locked_until>now() FOR UPDATE;
 IF NOT FOUND THEN RETURN false;END IF;
 SELECT * INTO u FROM public.upload_intents WHERE id=(j.payload->>'uploadId')::uuid FOR UPDATE;
 IF NOT FOUND OR u.deleted_at IS NOT NULL OR u.state<>'queued' THEN PERFORM public.finish_delivery_job(j.id,p_lease,true,NULL,NULL);RETURN false;END IF;
 SELECT * INTO sub FROM public.blog_submissions WHERE id=u.blog_submission_id FOR UPDATE;
 IF u.purpose<>'blog' OR sub.id IS NULL THEN RAISE EXCEPTION 'INVALID_UPLOAD';END IF;
 IF sub.deleted_at IS NOT NULL OR sub.revision IS DISTINCT FROM u.blog_revision OR NOT public.can_operate_blog(u.owner_id,'submissions',sub.id,NULL,'read') OR NOT public.can_operate_blog(u.owner_id,'posts',NULL,sub.team_id,'create')
  OR NOT EXISTS(SELECT 1 FROM public.admin_sessions WHERE id=u.owner_session AND admin_user_id=u.owner_id AND revoked_at IS NULL AND idle_expires_at>now() AND absolute_expires_at>now()) THEN reject_reason:='ACCESS_CHANGED';END IF;
 IF reject_reason IS NULL AND(p_clean_key IS NULL OR p_clean_key NOT LIKE 'clean/%' OR p_mime IS NULL OR p_mime NOT IN('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain','image/png','image/jpeg','image/webp') OR p_bytes IS NULL OR p_bytes NOT BETWEEN 1 AND 20971520 OR p_sha256 IS NULL OR p_sha256!~'^[a-f0-9]{64}$') THEN RAISE EXCEPTION 'INVALID_UPLOAD';END IF;
 UPDATE public.upload_intents SET state=CASE WHEN reject_reason IS NULL THEN 'clean' ELSE 'rejected' END,clean_key=CASE WHEN reject_reason IS NULL THEN p_clean_key ELSE NULL END,error_code=reject_reason,completed_at=now() WHERE id=u.id;
 UPDATE public.blog_submissions SET scan_status=CASE WHEN reject_reason IS NULL THEN 'clean' ELSE 'rejected' END,file_path=CASE WHEN reject_reason IS NULL THEN p_clean_key ELSE '' END,mime_type=coalesce(p_mime,mime_type),file_size=coalesce(p_bytes,file_size),revision=revision+1,updated_at=clock_timestamp() WHERE id=sub.id;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,metadata) VALUES(u.owner_id,'blog.upload_scanned','private_blog',sub.id,jsonb_build_object('uploadId',u.id,'state',CASE WHEN reject_reason IS NULL THEN 'clean' ELSE 'rejected' END));
 PERFORM public.finish_delivery_job(j.id,p_lease,true,NULL,NULL);RETURN reject_reason IS NOT DISTINCT FROM p_reject;
END $$;

CREATE FUNCTION public.claim_blog_upload_cleanup(p_limit integer) RETURNS SETOF public.upload_intents LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE candidate uuid;u public.upload_intents;BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('private-blog',0));
 FOR candidate IN SELECT id FROM public.upload_intents WHERE purpose='blog' AND purged_at IS NULL AND state<>'clean' AND(expires_at<now()-interval '24 hours' OR deleted_at<now()-interval '3 minutes') ORDER BY created_at,id LIMIT p_limit LOOP
  SELECT * INTO u FROM public.upload_intents WHERE id=candidate FOR UPDATE;
  IF u.state='clean' OR u.purged_at IS NOT NULL OR EXISTS(SELECT 1 FROM public.delivery_jobs WHERE kind='upload_scan' AND payload->>'uploadId'=u.id::text AND state='running' AND locked_until>now()) THEN CONTINUE;END IF;
  UPDATE public.upload_intents SET deleted_at=coalesce(deleted_at,now()),state=CASE WHEN state='pending' THEN 'expired' ELSE state END WHERE id=u.id RETURNING * INTO u;
  UPDATE public.blog_submissions SET scan_status='rejected',revision=revision+1,updated_at=clock_timestamp() WHERE id=u.blog_submission_id AND scan_status<>'clean';
  RETURN NEXT u;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION gdg_security.protect_blog_submission_file(),public.mutate_blog_upload(uuid,uuid,uuid,text,jsonb,text,text,uuid),public.blog_file_download(uuid,uuid,uuid),public.finish_upload_scan(uuid,uuid,text,text,bigint,text,text),public.claim_blog_upload_cleanup(integer) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.mutate_blog_upload(uuid,uuid,uuid,text,jsonb,text,text,uuid),public.blog_file_download(uuid,uuid,uuid),public.finish_upload_scan(uuid,uuid,text,text,bigint,text,text),public.claim_blog_upload_cleanup(integer) TO service_role;
COMMIT;
