BEGIN;
ALTER TABLE public.contact_submissions ADD COLUMN revision integer NOT NULL DEFAULT 1,ADD COLUMN redacted_at timestamptz,ADD COLUMN hold_reason text;
ALTER TABLE public.upload_intents ADD COLUMN contact_id uuid REFERENCES public.contact_submissions(id),ADD COLUMN contact_risk_hash text,ADD COLUMN contact_clean_candidate text;
ALTER TABLE public.upload_intents ADD CONSTRAINT contact_upload_scope CHECK(purpose<>'contact' OR(bucket='contact-attachments' AND owner_id IS NULL AND form_id IS NULL AND finance_id IS NULL AND blog_submission_id IS NULL AND expected_bytes<=10485760 AND declared_mime IN('application/pdf','image/png','image/jpeg','image/webp') AND contact_risk_hash~'^[a-f0-9]{64}$'));
ALTER TABLE public.contact_submissions ADD CONSTRAINT contact_attachment_ref FOREIGN KEY(attachment_upload_id) REFERENCES public.upload_intents(id);
CREATE INDEX contact_upload_retention ON public.upload_intents(contact_id,expires_at) WHERE purpose='contact';
CREATE INDEX contact_submission_retention ON public.contact_submissions(resolved_at) WHERE redacted_at IS NULL AND NOT retention_hold;
CREATE FUNCTION public.can_access_contact(p_actor uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.admin_users WHERE id=p_actor AND role IN('admin','super_admin') AND is_active AND NOT must_change_password AND deleted_at IS NULL AND(locked_until IS NULL OR locked_until<=now()));
$$;
CREATE FUNCTION public.mutate_contact_upload(p_upload uuid,p_proof text,p_risk text,p_action text,p_document jsonb,p_key_hash text,p_request_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ DECLARE u public.upload_intents;k public.idempotency_keys;scope_name text;result jsonb;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('contact-uploads',0));
 IF p_proof IS NULL OR p_proof!~'^[a-f0-9]{64}$' OR p_action IS NULL OR p_action NOT IN('create','complete','status','remove') THEN RAISE EXCEPTION 'INVALID_UPLOAD';END IF;
 IF p_action<>'create' THEN SELECT * INTO u FROM public.upload_intents WHERE id=p_upload AND purpose='contact' AND proof_hash=p_proof AND purged_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  IF p_action='status' THEN RETURN jsonb_build_object('uploadId',u.id,'state',CASE WHEN u.contact_id IS NOT NULL THEN 'attached' WHEN u.deleted_at IS NOT NULL OR(u.state IN('pending','queued','clean') AND u.expires_at<=now()) THEN 'expired' ELSE u.state END,'filename',CASE WHEN u.deleted_at IS NULL THEN u.filename ELSE NULL END,'expiresAt',u.expires_at);END IF;
 END IF;
 IF p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$' OR p_request_hash IS NULL OR p_request_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 scope_name:='contact.upload.'||p_action||':'||p_proof||':'||coalesce(p_upload::text,'new');
 SELECT * INTO k FROM public.idempotency_keys WHERE scope=scope_name AND key_hash=p_key_hash;
 IF FOUND THEN IF k.request_hash IS DISTINCT FROM p_request_hash THEN RAISE EXCEPTION 'CONFLICT';END IF;RETURN k.result;END IF;
 IF p_action='create' THEN
  IF p_risk IS NULL OR p_risk!~'^[a-f0-9]{64}$' OR p_document->>'mime' IS NULL OR p_document->>'mime' NOT IN('application/pdf','image/png','image/jpeg','image/webp') OR(p_document->>'bytes')::bigint NOT BETWEEN 1 AND 10485760 OR p_document->>'sha256' IS NULL OR p_document->>'sha256'!~'^[a-f0-9]{64}$' OR length(coalesce(p_document->>'filename','')) NOT BETWEEN 1 AND 180 OR p_document->>'key' IS NULL OR p_document->>'key'!~'^quarantine/[a-f0-9-]{36}/[a-f0-9-]{36}$' THEN RAISE EXCEPTION 'INVALID_UPLOAD';END IF;
  IF(SELECT count(*) FROM public.upload_intents WHERE purpose='contact' AND contact_risk_hash=p_risk AND created_at>now()-interval '24 hours')>=10
   OR EXISTS(SELECT 1 FROM public.upload_intents WHERE purpose='contact' AND proof_hash=p_proof AND deleted_at IS NULL AND contact_id IS NULL AND expires_at>now())
   OR(SELECT count(*) FROM public.upload_intents WHERE purpose='contact' AND contact_risk_hash=p_risk AND state IN('pending','queued') AND deleted_at IS NULL AND expires_at>now())>=3 THEN RAISE EXCEPTION 'CONTACT_UPLOAD_QUOTA';END IF;
  INSERT INTO public.upload_intents(purpose,proof_hash,bucket,quarantine_key,filename,declared_mime,expected_bytes,expected_sha256,contact_risk_hash)
   VALUES('contact',p_proof,'contact-attachments',p_document->>'key',p_document->>'filename',p_document->>'mime',(p_document->>'bytes')::bigint,p_document->>'sha256',p_risk) RETURNING * INTO u;
 ELSIF p_action='remove' THEN
  IF u.contact_id IS NOT NULL THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  UPDATE public.upload_intents SET deleted_at=coalesce(deleted_at,now()),state=CASE WHEN state IN('pending','queued','clean') THEN 'expired' ELSE state END WHERE id=u.id RETURNING * INTO u;
  UPDATE public.delivery_jobs SET state='dead',lease_token=NULL,locked_until=NULL,last_error_code='UPLOAD_REMOVED' WHERE kind='contact_upload_scan' AND payload->>'uploadId'=u.id::text AND state IN('pending','running');
 ELSE
  IF u.contact_id IS NOT NULL OR u.deleted_at IS NOT NULL OR u.expires_at<=now() THEN RAISE EXCEPTION 'INVALID_UPLOAD';END IF;
  IF u.state='pending' THEN
   UPDATE public.upload_intents SET state='queued',completed_at=now() WHERE id=u.id RETURNING * INTO u;
   INSERT INTO public.delivery_jobs(kind,deduplication_key,payload) VALUES('contact_upload_scan','contact_upload_scan:'||u.id,jsonb_build_object('uploadId',u.id));
  ELSIF u.state NOT IN('queued','clean') THEN RAISE EXCEPTION 'INVALID_UPLOAD';END IF;
 END IF;
 result:=jsonb_build_object('uploadId',u.id,'state',u.state,'expiresAt',u.expires_at);
 INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result) VALUES(scope_name,p_key_hash,p_request_hash,200,result);RETURN result;
END $$;
CREATE FUNCTION public.reserve_contact_scan_object(p_job uuid,p_lease uuid) RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.delivery_jobs;u public.upload_intents;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('contact-uploads',0));
 SELECT * INTO j FROM public.delivery_jobs WHERE id=p_job AND lease_token=p_lease AND state='running' AND locked_until>now() AND kind='contact_upload_scan' FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT * INTO u FROM public.upload_intents WHERE id=(j.payload->>'uploadId')::uuid AND purpose='contact' AND state='queued' AND deleted_at IS NULL AND expires_at>now() FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL;END IF;
 UPDATE public.upload_intents SET contact_clean_candidate=coalesce(contact_clean_candidate,'clean/'||id||'/'||gen_random_uuid()) WHERE id=u.id RETURNING contact_clean_candidate INTO u.contact_clean_candidate;
 RETURN u.contact_clean_candidate;
END $$;
CREATE FUNCTION public.finish_contact_upload_scan(p_job uuid,p_lease uuid,p_clean_key text,p_mime text,p_bytes bigint,p_sha256 text,p_reject text) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ DECLARE j public.delivery_jobs;u public.upload_intents;reject_reason text:=p_reject;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('contact-uploads',0));
 SELECT * INTO j FROM public.delivery_jobs WHERE id=p_job AND lease_token=p_lease AND state='running' AND locked_until>now() AND kind='contact_upload_scan' FOR UPDATE;
 IF NOT FOUND THEN RETURN false;END IF;
 SELECT * INTO u FROM public.upload_intents WHERE id=(j.payload->>'uploadId')::uuid AND purpose='contact' FOR UPDATE;
 IF NOT FOUND OR u.deleted_at IS NOT NULL OR u.state<>'queued' THEN PERFORM public.finish_delivery_job(j.id,p_lease,true,NULL,NULL);RETURN false;END IF;
 IF u.expires_at<=now() THEN reject_reason:='UPLOAD_EXPIRED';END IF;
 IF reject_reason IS NULL AND(p_clean_key IS NULL OR p_clean_key IS DISTINCT FROM u.contact_clean_candidate OR p_mime IS NULL OR p_mime NOT IN('application/pdf','image/png','image/jpeg','image/webp') OR p_bytes IS NULL OR p_bytes NOT BETWEEN 1 AND 10485760 OR p_sha256 IS NULL OR p_sha256!~'^[a-f0-9]{64}$') THEN RAISE EXCEPTION 'INVALID_UPLOAD';END IF;
 UPDATE public.upload_intents SET state=CASE WHEN reject_reason IS NULL THEN 'clean' ELSE 'rejected' END,clean_key=CASE WHEN reject_reason IS NULL THEN p_clean_key ELSE NULL END,error_code=reject_reason,completed_at=now() WHERE id=u.id;
 PERFORM public.finish_delivery_job(j.id,p_lease,true,NULL,NULL);RETURN reject_reason IS NOT DISTINCT FROM p_reject;
END $$;
CREATE OR REPLACE FUNCTION public.submit_contact(p_document jsonb,p_key_hash text,p_request_hash text) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c public.contact_submissions;u public.upload_intents;result uuid;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('contact-uploads',0));PERFORM pg_advisory_xact_lock(hashtextextended('contact:'||p_key_hash,0));
 SELECT * INTO c FROM public.contact_submissions WHERE idempotency_key_hash=p_key_hash FOR UPDATE;
 IF FOUND THEN IF c.request_hash IS DISTINCT FROM p_request_hash THEN RAISE EXCEPTION 'INVALID_STATE';END IF;RETURN c.id;END IF;
 IF p_document?'uploadId' THEN
  SELECT * INTO u FROM public.upload_intents WHERE id=(p_document->>'uploadId')::uuid AND purpose='contact' AND proof_hash=p_document->>'uploadProof' FOR UPDATE;
  IF NOT FOUND OR u.state<>'clean' OR u.contact_id IS NOT NULL OR u.deleted_at IS NOT NULL OR u.expires_at<=now() OR u.clean_key IS NULL THEN RAISE EXCEPTION 'INVALID_UPLOAD';END IF;
 END IF;
 INSERT INTO public.contact_submissions(name,email,inquiry_type,message,interests,attachment_upload_id,idempotency_key_hash,request_hash)
 VALUES(p_document->>'name',p_document->>'email',p_document->>'type',p_document->>'message',ARRAY(SELECT jsonb_array_elements_text(coalesce(p_document->'interests','[]'))),u.id,p_key_hash,p_request_hash) RETURNING id INTO result;
 IF u.id IS NOT NULL THEN UPDATE public.upload_intents SET contact_id=result WHERE id=u.id;END IF;
 INSERT INTO public.delivery_jobs(kind,deduplication_key,payload) VALUES('contact_acknowledgment','contact-ack:'||result,jsonb_build_object('contactId',result)),('contact_notification','contact-notice:'||result,jsonb_build_object('contactId',result));
 RETURN result;
END $$;
CREATE FUNCTION public.contact_inbox(p_actor uuid,p_session uuid,p_id uuid,p_filters jsonb,p_page integer) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;BEGIN
 IF NOT gdg_security.member_transfer_session(p_actor,p_session) OR NOT public.can_access_contact(p_actor) OR p_page NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 WITH eligible AS(SELECT c.* FROM public.contact_submissions c WHERE(p_id IS NULL OR id=p_id) AND(p_filters->>'status' IS NULL OR status=p_filters->>'status') AND(coalesce(p_filters->>'q','')='' OR strpos(lower(name||' '||email||' '||message),lower(p_filters->>'q'))>0)),
 records AS(SELECT * FROM eligible ORDER BY created_at DESC,id LIMIT 50 OFFSET(p_page-1)*50)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'email',c.email,'type',c.inquiry_type,'message',c.message,'interests',c.interests,'status',c.status,'revision',c.revision,'createdAt',c.created_at,'resolvedAt',c.resolved_at,'redactedAt',c.redacted_at,'hold',c.retention_hold,'holdReason',c.hold_reason,
 'attachment',CASE WHEN u.id IS NOT NULL AND u.deleted_at IS NULL AND u.purged_at IS NULL THEN jsonb_build_object('id',u.id,'filename',u.filename,'state',u.state,'bytes',u.expected_bytes,'canDownload',u.state='clean' AND u.clean_key IS NOT NULL) ELSE NULL END)) FROM records c LEFT JOIN public.upload_intents u ON u.id=c.attachment_upload_id),'[]'),'total',(SELECT count(*) FROM eligible),'page',p_page,'pageSize',50) INTO result;
 IF p_id IS NOT NULL AND jsonb_array_length(result->'items')=0 THEN RAISE EXCEPTION 'NOT_FOUND';END IF;RETURN result;
END $$;
CREATE FUNCTION public.mutate_contact_record(p_actor uuid,p_session uuid,p_id uuid,p_revision integer,p_action text,p_document jsonb,p_verified_hash text,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ DECLARE c public.contact_submissions;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('contact-uploads',0));
 IF NOT gdg_security.member_transfer_session(p_actor,p_session) OR NOT public.can_access_contact(p_actor) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT * INTO c FROM public.contact_submissions WHERE id=p_id AND redacted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF c.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'CONFLICT';END IF;
 IF p_action='status' THEN
  IF p_document->>'status' IS NULL OR p_document->>'status' NOT IN('new','in_progress','resolved') THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
  UPDATE public.contact_submissions SET status=p_document->>'status',resolved_at=CASE WHEN p_document->>'status'='resolved' THEN coalesce(resolved_at,now()) ELSE NULL END,revision=revision+1,updated_at=now() WHERE id=c.id;
 ELSIF p_action='hold' THEN
  IF NOT EXISTS(SELECT 1 FROM public.admin_users WHERE id=p_actor AND password_hash=p_verified_hash) OR p_document->>'enabled' NOT IN('true','false') OR(p_document->>'enabled'='true' AND length(btrim(coalesce(p_document->>'reason',''))) NOT BETWEEN 10 AND 1000) THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
  UPDATE public.contact_submissions SET retention_hold=(p_document->>'enabled')::boolean,hold_reason=CASE WHEN(p_document->>'enabled')::boolean THEN btrim(p_document->>'reason') ELSE NULL END,revision=revision+1,updated_at=now() WHERE id=c.id;
 ELSE RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata) VALUES(p_actor,'contact.'||p_action,'contact_submission',c.id,p_request_id,jsonb_build_object('revision',c.revision+1));
 RETURN jsonb_build_object('id',c.id,'revision',c.revision+1);
END $$;
CREATE FUNCTION public.contact_attachment_download(p_actor uuid,p_session uuid,p_contact uuid,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ DECLARE u public.upload_intents;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('contact-uploads',0));
 IF NOT gdg_security.member_transfer_session(p_actor,p_session) OR NOT public.can_access_contact(p_actor) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT u1.* INTO u FROM public.upload_intents u1 JOIN public.contact_submissions c ON c.id=u1.contact_id AND c.attachment_upload_id=u1.id AND c.redacted_at IS NULL WHERE c.id=p_contact AND u1.purpose='contact' AND u1.state='clean' AND u1.deleted_at IS NULL AND u1.purged_at IS NULL AND u1.clean_key IS NOT NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata) VALUES(p_actor,'contact.attachment_downloaded','contact_submission',p_contact,p_request_id,jsonb_build_object('uploadId',u.id));
 RETURN jsonb_build_object('key',u.clean_key,'filename',u.filename);
END $$;
CREATE FUNCTION public.claim_contact_upload_cleanup(p_limit integer) RETURNS SETOF public.upload_intents LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ DECLARE u public.upload_intents;BEGIN
 IF p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('contact-uploads',0));
 -- Resolution retention redacts the message and queues its private file together.
 UPDATE public.contact_submissions SET name='Removed contact',email='',message='Removed by contact retention.',interests='{}',status='redacted',redacted_at=now(),hold_reason=NULL,revision=revision+1,updated_at=now()
 WHERE id IN(SELECT id FROM public.contact_submissions WHERE resolved_at<now()-interval '180 days' AND NOT retention_hold AND redacted_at IS NULL ORDER BY resolved_at LIMIT 500);
 FOR u IN SELECT x.* FROM public.upload_intents x WHERE x.purpose='contact' AND x.purged_at IS NULL
  AND((x.contact_id IS NULL AND(x.expires_at<now()-interval '24 hours' OR x.deleted_at<now()-interval '3 minutes')) OR EXISTS(SELECT 1 FROM public.contact_submissions c WHERE c.id=x.contact_id AND c.redacted_at IS NOT NULL AND NOT c.retention_hold))
  AND NOT EXISTS(SELECT 1 FROM public.delivery_jobs j WHERE j.kind='contact_upload_scan' AND j.payload->>'uploadId'=x.id::text AND j.state='running' AND j.locked_until>now()) ORDER BY x.created_at,x.id LIMIT p_limit FOR UPDATE LOOP
  UPDATE public.upload_intents SET deleted_at=coalesce(deleted_at,now()),state='expired' WHERE id=u.id RETURNING * INTO u;
  RETURN NEXT u;
 END LOOP;
END $$;
CREATE FUNCTION public.finish_contact_upload_cleanup(p_upload uuid) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('contact-uploads',0));
 UPDATE public.upload_intents SET purged_at=now(),filename='',contact_risk_hash=NULL WHERE id=p_upload AND purpose='contact' AND deleted_at IS NOT NULL AND(contact_id IS NULL OR EXISTS(SELECT 1 FROM public.contact_submissions c WHERE c.id=contact_id AND c.redacted_at IS NOT NULL AND NOT c.retention_hold));
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.can_access_contact(uuid),public.mutate_contact_upload(uuid,text,text,text,jsonb,text,text),public.reserve_contact_scan_object(uuid,uuid),public.finish_contact_upload_scan(uuid,uuid,text,text,bigint,text,text),public.contact_inbox(uuid,uuid,uuid,jsonb,integer),public.mutate_contact_record(uuid,uuid,uuid,integer,text,jsonb,text,uuid),public.contact_attachment_download(uuid,uuid,uuid,uuid),public.claim_contact_upload_cleanup(integer),public.finish_contact_upload_cleanup(uuid) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.can_access_contact(uuid),public.mutate_contact_upload(uuid,text,text,text,jsonb,text,text),public.reserve_contact_scan_object(uuid,uuid),public.finish_contact_upload_scan(uuid,uuid,text,text,bigint,text,text),public.contact_inbox(uuid,uuid,uuid,jsonb,integer),public.mutate_contact_record(uuid,uuid,uuid,integer,text,jsonb,text,uuid),public.contact_attachment_download(uuid,uuid,uuid,uuid),public.claim_contact_upload_cleanup(integer),public.finish_contact_upload_cleanup(uuid) TO service_role;
COMMIT;
