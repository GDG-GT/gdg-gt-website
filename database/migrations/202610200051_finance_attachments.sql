BEGIN;
ALTER TABLE public.upload_intents ADD COLUMN finance_id uuid REFERENCES public.finances(id) ON DELETE RESTRICT,
 ADD COLUMN finance_revision integer,ADD COLUMN owner_session uuid REFERENCES public.admin_sessions(id) ON DELETE RESTRICT;
ALTER TABLE public.upload_intents ADD CONSTRAINT finance_upload_scope CHECK(purpose<>'finance' OR
 (finance_id IS NOT NULL AND finance_revision>0 AND owner_id IS NOT NULL AND owner_session IS NOT NULL AND bucket='finance-attachments'
  AND form_id IS NULL AND expected_bytes<=10485760 AND declared_mime IN('application/pdf','image/png','image/jpeg','image/webp')));
ALTER TABLE public.finance_attachments DROP CONSTRAINT finance_attachments_finance_id_fkey,
 DROP CONSTRAINT finance_attachments_uploaded_by_fkey;
ALTER TABLE public.finance_attachments ADD CONSTRAINT finance_attachments_finance_id_fkey FOREIGN KEY(finance_id) REFERENCES public.finances(id) ON DELETE RESTRICT,
 ADD CONSTRAINT finance_attachments_uploaded_by_fkey FOREIGN KEY(uploaded_by) REFERENCES public.admin_users(id) ON DELETE RESTRICT,
 ADD COLUMN upload_id uuid UNIQUE REFERENCES public.upload_intents(id) ON DELETE RESTRICT,
 ADD COLUMN scan_state text NOT NULL DEFAULT 'pending' CHECK(scan_state IN('pending','queued','clean','rejected','expired')),
 ADD COLUMN private_object_key text,ADD COLUMN checksum text;
CREATE INDEX finance_upload_parent ON public.upload_intents(finance_id,created_at DESC) WHERE purpose='finance';
CREATE FUNCTION gdg_security.protect_finance_attachment() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'FINANCE_RETAINED';END IF;
 IF OLD.scan_state='clean' AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN RAISE EXCEPTION 'FINANCE_IMMUTABLE';END IF;
 IF NEW.finance_id IS DISTINCT FROM OLD.finance_id OR NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by OR NEW.upload_id IS DISTINCT FROM OLD.upload_id OR NEW.file_name IS DISTINCT FROM OLD.file_name
 THEN RAISE EXCEPTION 'FINANCE_IMMUTABLE';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER finance_attachment_guard BEFORE UPDATE OR DELETE ON public.finance_attachments FOR EACH ROW EXECUTE FUNCTION gdg_security.protect_finance_attachment();
CREATE FUNCTION public.mutate_finance_upload(p_actor uuid,p_session uuid,p_finance uuid,p_upload uuid,p_action text,p_document jsonb,p_key_hash text,p_request_hash text,p_request_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE f public.finances;u public.upload_intents;k public.idempotency_keys;r jsonb;s text;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('finance-administration',0));
 IF NOT EXISTS(SELECT 1 FROM public.admin_sessions WHERE id=p_session AND admin_user_id=p_actor AND revoked_at IS NULL AND idle_expires_at>now() AND absolute_expires_at>now())
 OR NOT public.can_operate_finance(p_actor,p_finance,'upload') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 SELECT * INTO f FROM public.finances WHERE id=p_finance FOR UPDATE;
 IF p_action IS NULL OR p_action NOT IN('create','complete') OR p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$' OR p_request_hash IS NULL OR p_request_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 s:='finance-uploads.'||p_action||':'||p_actor||':'||p_finance||':'||coalesce(p_upload::text,'new');
 SELECT * INTO k FROM public.idempotency_keys WHERE scope=s AND key_hash=p_key_hash;
 IF FOUND THEN IF k.request_hash IS DISTINCT FROM p_request_hash THEN RAISE EXCEPTION 'CONFLICT';END IF;RETURN k.result;END IF;
 IF p_action='create' THEN
  IF (p_document->>'revision')::integer IS DISTINCT FROM f.revision THEN RAISE EXCEPTION 'CONFLICT';END IF;
  IF p_document->>'mime' IS NULL OR p_document->>'mime' NOT IN('application/pdf','image/png','image/jpeg','image/webp') OR (p_document->>'bytes')::bigint NOT BETWEEN 1 AND 10485760
   OR p_document->>'sha256' IS NULL OR p_document->>'sha256'!~'^[a-f0-9]{64}$' OR p_document->>'key' IS NULL OR p_document->>'key'!~'^quarantine/[a-f0-9-]{36}/[a-f0-9-]{36}$'
   OR length(coalesce(p_document->>'filename','')) NOT BETWEEN 1 AND 180 THEN RAISE EXCEPTION 'INVALID_UPLOAD';END IF;
  IF(SELECT count(*) FROM public.upload_intents WHERE finance_id=f.id AND purpose='finance' AND deleted_at IS NULL AND(state='clean' OR(state IN('pending','queued') AND expires_at>now())))>=10 THEN RAISE EXCEPTION 'UPLOAD_QUOTA';END IF;
  INSERT INTO public.upload_intents(purpose,finance_id,finance_revision,owner_id,owner_session,proof_hash,bucket,quarantine_key,filename,declared_mime,expected_bytes,expected_sha256)
   VALUES('finance',f.id,f.revision,p_actor,p_session,p_request_hash,'finance-attachments',p_document->>'key',p_document->>'filename',p_document->>'mime',(p_document->>'bytes')::bigint,p_document->>'sha256') RETURNING * INTO u;
  INSERT INTO public.finance_attachments(id,finance_id,file_name,file_url,file_type,file_size,uploaded_by,upload_id)
   VALUES(u.id,f.id,u.filename,'',u.declared_mime,u.expected_bytes::integer,p_actor,u.id);
 ELSE
  SELECT * INTO u FROM public.upload_intents WHERE id=p_upload AND finance_id=f.id AND purpose='finance' AND owner_id=p_actor AND owner_session=p_session AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  IF u.finance_revision IS DISTINCT FROM f.revision THEN RAISE EXCEPTION 'CONFLICT';END IF;
  IF u.state='pending' THEN
   IF u.expires_at<=now() THEN RAISE EXCEPTION 'INVALID_UPLOAD';END IF;
   UPDATE public.upload_intents SET state='queued',completed_at=now() WHERE id=u.id RETURNING * INTO u;
   UPDATE public.finance_attachments SET scan_state='queued' WHERE id=u.id;
   INSERT INTO public.delivery_jobs(kind,deduplication_key,payload) VALUES('upload_scan','upload_scan:'||u.id,jsonb_build_object('uploadId',u.id));
  ELSIF u.state NOT IN('queued','clean') THEN RAISE EXCEPTION 'INVALID_UPLOAD';END IF;
 END IF;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata) VALUES(p_actor,'finances.upload_'||p_action,'finance',f.id,p_request_id,jsonb_build_object('uploadId',u.id,'revision',f.revision));
 r:=jsonb_build_object('uploadId',u.id,'state',u.state);
 INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result) VALUES(s,p_key_hash,p_request_hash,200,r);RETURN r;
END $$;
CREATE FUNCTION public.finance_attachment_list(p_actor uuid,p_finance uuid,p_page integer DEFAULT 1) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE r jsonb;BEGIN
 IF NOT public.can_operate_finance(p_actor,p_finance,'read') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',a.id,'filename',a.file_name,'mime',a.file_type,'bytes',a.file_size,
  'state',CASE WHEN a.scan_state='pending' AND u.expires_at<=now() THEN 'expired' ELSE a.scan_state END,'createdAt',a.created_at,'uploaderName',(SELECT display_name FROM public.admin_users WHERE id=a.uploaded_by)) ORDER BY a.created_at DESC,a.id DESC)
  FROM(SELECT * FROM public.finance_attachments WHERE finance_id=p_finance ORDER BY created_at DESC,id DESC LIMIT 30 OFFSET(p_page-1)*30)a JOIN public.upload_intents u ON u.id=a.upload_id),'[]'),
  'total',(SELECT count(*) FROM public.finance_attachments WHERE finance_id=p_finance),'pageSize',30,
  'canUpload',public.can_operate_finance(p_actor,p_finance,'upload'),'revision',(SELECT revision FROM public.finances WHERE id=p_finance)) INTO r;RETURN r;
END $$;
CREATE FUNCTION public.finance_attachment_download(p_actor uuid,p_finance uuid,p_upload uuid,p_request_id uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE a public.finance_attachments;u public.upload_intents;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('finance-administration',0));
 IF NOT public.can_operate_finance(p_actor,p_finance,'download') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT * INTO a FROM public.finance_attachments WHERE id=p_upload AND finance_id=p_finance AND scan_state='clean';
 SELECT * INTO u FROM public.upload_intents WHERE id=a.upload_id AND purpose='finance' AND state='clean' AND deleted_at IS NULL;
 IF a.id IS NULL OR u.id IS NULL OR a.private_object_key IS NULL OR a.private_object_key IS DISTINCT FROM u.clean_key THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata) VALUES(p_actor,'finances.file_downloaded','finance',p_finance,p_request_id,jsonb_build_object('fileId',a.id));
 RETURN jsonb_build_object('key',a.private_object_key,'filename',a.file_name);
END $$;
CREATE OR REPLACE FUNCTION public.finish_upload_scan(p_job uuid,p_lease uuid,p_clean_key text,p_mime text,p_bytes bigint,p_sha256 text,p_reject text)
 RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.delivery_jobs;u public.upload_intents;reject_reason text:=p_reject;BEGIN
 -- Finance mutations and membership/account changes use the same lock order.
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('finance-administration',0));
 SELECT * INTO j FROM public.delivery_jobs WHERE id=p_job AND lease_token=p_lease AND kind='upload_scan' AND state='running' AND locked_until>now() FOR UPDATE;
 IF NOT FOUND THEN RETURN false;END IF;
 SELECT * INTO u FROM public.upload_intents WHERE id=(j.payload->>'uploadId')::uuid FOR UPDATE;
 IF NOT FOUND OR u.deleted_at IS NOT NULL OR u.state<>'queued' THEN PERFORM public.finish_delivery_job(j.id,p_lease,true,NULL,NULL);RETURN false;END IF;
 IF u.purpose NOT IN('form','finance') THEN RAISE EXCEPTION 'INVALID_UPLOAD';END IF;
 IF u.purpose='finance' AND(NOT public.can_operate_finance(u.owner_id,u.finance_id,'upload') OR
  u.finance_revision IS DISTINCT FROM(SELECT revision FROM public.finances WHERE id=u.finance_id) OR
  NOT EXISTS(SELECT 1 FROM public.admin_sessions WHERE id=u.owner_session AND admin_user_id=u.owner_id AND revoked_at IS NULL AND idle_expires_at>now() AND absolute_expires_at>now())) THEN reject_reason:='ACCESS_CHANGED';END IF;
 IF reject_reason IS NULL AND(p_clean_key IS NULL OR p_clean_key NOT LIKE 'clean/%' OR p_mime IS NULL OR p_bytes IS NULL OR p_bytes NOT BETWEEN 1 AND 26214400 OR p_sha256 IS NULL OR p_sha256!~'^[a-f0-9]{64}$') THEN RAISE EXCEPTION 'INVALID_UPLOAD';END IF;
 IF reject_reason IS NULL AND u.purpose='finance' AND(p_mime NOT IN('application/pdf','image/png','image/jpeg','image/webp') OR p_bytes>10485760) THEN reject_reason:='INVALID_UPLOAD';END IF;
 UPDATE public.upload_intents SET state=CASE WHEN reject_reason IS NULL THEN 'clean' ELSE 'rejected' END,
  clean_key=CASE WHEN reject_reason IS NULL THEN p_clean_key ELSE NULL END,error_code=reject_reason,completed_at=now() WHERE id=u.id;
 IF u.purpose='form' THEN
  UPDATE public.form_uploads SET scan_state=CASE WHEN reject_reason IS NULL THEN 'clean' ELSE 'rejected' END,private_object_key=coalesce(p_clean_key,private_object_key),
   detected_mime=p_mime,byte_size=coalesce(p_bytes,byte_size),checksum=coalesce(p_sha256,checksum) WHERE id=u.id AND deleted_at IS NULL;
 ELSE
  UPDATE public.finance_attachments SET scan_state=CASE WHEN reject_reason IS NULL THEN 'clean' ELSE 'rejected' END,
   private_object_key=CASE WHEN reject_reason IS NULL THEN p_clean_key ELSE NULL END,file_type=coalesce(p_mime,file_type),file_size=coalesce(p_bytes,file_size),checksum=p_sha256 WHERE id=u.id;
  INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,metadata) VALUES(u.owner_id,'finances.upload_scanned','finance',u.finance_id,jsonb_build_object('fileId',u.id,'state',CASE WHEN reject_reason IS NULL THEN 'clean' ELSE 'rejected' END));
 END IF;
 PERFORM public.finish_delivery_job(j.id,p_lease,true,NULL,NULL);
 -- Discard normalized objects created after a scope/revision change.
 RETURN reject_reason IS NOT DISTINCT FROM p_reject;
END $$;
CREATE FUNCTION public.finance_state_counts(p_actor uuid,p_filter jsonb) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(jsonb_object_agg(status,n),'{}') FROM(SELECT status,count(*) n FROM public.finances f
  WHERE public.can_operate_finance(p_actor,f.id,'read') AND public.finance_matches_filter(f.id,p_filter) GROUP BY status)s;
$$;
CREATE FUNCTION public.claim_finance_upload_cleanup(p_limit integer) RETURNS SETOF public.upload_intents
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE candidate uuid;u public.upload_intents;BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('finance-administration',0));
 FOR candidate IN SELECT id FROM public.upload_intents WHERE purpose='finance' AND purged_at IS NULL AND state<>'clean'
  AND(expires_at<now()-interval '24 hours' OR deleted_at<now()-interval '3 minutes') ORDER BY created_at,id LIMIT p_limit LOOP
  SELECT * INTO u FROM public.upload_intents WHERE id=candidate FOR UPDATE;
  IF u.state='clean' OR u.purged_at IS NOT NULL THEN CONTINUE;END IF;
  IF EXISTS(SELECT 1 FROM public.delivery_jobs WHERE kind='upload_scan' AND payload->>'uploadId'=u.id::text AND state='running' AND locked_until>now()) THEN CONTINUE;END IF;
  UPDATE public.upload_intents SET deleted_at=coalesce(deleted_at,now()),state=CASE WHEN state='pending' THEN 'expired' ELSE state END WHERE id=u.id RETURNING * INTO u;
  UPDATE public.finance_attachments SET scan_state=CASE WHEN scan_state='pending' THEN 'expired' ELSE scan_state END WHERE upload_id=u.id;
  RETURN NEXT u;
 END LOOP;
END $$;
-- Add a bounded approver projection without exposing account contact details.
CREATE OR REPLACE FUNCTION public.finance_projection(p_actor uuid,p_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('id',f.id,'reference','FIN-'||upper(left(replace(f.id::text,'-',''),12)),
 'transactionType',f.transaction_type,'category',f.category,'amount',f.amount::text,'currency',f.currency,'description',f.description,
 'vendorName',f.vendor_name,'referenceNumber',f.reference_number,'transactionDate',f.transaction_date,
 'teamId',f.team_id,'teamName',(SELECT name FROM public.admin_teams WHERE id=f.team_id),'budgetId',f.budget_id,
 'budgetName',(SELECT name FROM public.budget_allocations WHERE id=f.budget_id),'eventId',f.event_id,'projectId',f.project_id,
 'recurringFrequency',f.recurring_frequency,'requiresTeamApproval',f.requires_team_approval,'status',f.status,'revision',f.revision,
 'createdBy',f.created_by,'creatorName',(SELECT display_name FROM public.admin_users WHERE id=f.created_by),
 'submittedBy',f.submitted_by,'submittedAt',f.submitted_at,'createdAt',f.created_at,'updatedAt',f.updated_at,
 'approverName',(SELECT display_name FROM public.admin_users WHERE id=f.approved_by),'teamApproverName',(SELECT display_name FROM public.admin_users WHERE id=f.team_approved_by),
 'rejectionReason',f.rejection_reason,'actions',(SELECT coalesce(jsonb_agg(a),'[]') FROM unnest(ARRAY['read','update','submit','team_approve','admin_approve','reject','complete','cancel','note','upload','download','export'])a
 WHERE public.can_operate_finance(p_actor,f.id,a))) FROM public.finances f WHERE f.id=p_id AND public.can_operate_finance(p_actor,f.id,'read');
$$;
REVOKE ALL ON FUNCTION gdg_security.protect_finance_attachment(),public.mutate_finance_upload(uuid,uuid,uuid,uuid,text,jsonb,text,text,uuid),
 public.finance_attachment_list(uuid,uuid,integer),public.finance_attachment_download(uuid,uuid,uuid,uuid),public.finance_state_counts(uuid,jsonb),public.finance_projection(uuid,uuid),public.claim_finance_upload_cleanup(integer)
 FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.mutate_finance_upload(uuid,uuid,uuid,uuid,text,jsonb,text,text,uuid),public.finance_attachment_list(uuid,uuid,integer),
 public.finance_attachment_download(uuid,uuid,uuid,uuid),public.finance_state_counts(uuid,jsonb),public.finance_projection(uuid,uuid),public.claim_finance_upload_cleanup(integer) TO service_role;
COMMIT;
