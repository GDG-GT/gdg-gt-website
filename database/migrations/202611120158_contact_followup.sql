BEGIN;
ALTER TABLE public.contact_submissions ADD COLUMN assigned_task_id uuid REFERENCES public.communication_tasks(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX contact_assigned_task ON public.contact_submissions(assigned_task_id) WHERE assigned_task_id IS NOT NULL;
CREATE TABLE public.contact_replies(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),contact_id uuid NOT NULL REFERENCES public.contact_submissions(id),
 sender_id uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,delivery_state text NOT NULL DEFAULT 'queued' CHECK(delivery_state IN('queued','sent','failed','cancelled')),body text NOT NULL CHECK(length(body)<=5000),
 delivery_job_id uuid REFERENCES public.delivery_jobs(id) ON DELETE SET NULL,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.contact_replies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contact_replies FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT ALL ON public.contact_replies TO service_role;

CREATE FUNCTION gdg_security.track_contact_reply_delivery() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NEW.kind='contact_reply' AND NEW.state IS DISTINCT FROM OLD.state THEN
  UPDATE public.contact_replies SET delivery_state=CASE NEW.state WHEN 'completed' THEN CASE WHEN NEW.provider_message_id IS NULL THEN 'cancelled' ELSE 'sent' END WHEN 'dead' THEN 'failed' ELSE 'queued' END WHERE delivery_job_id=NEW.id;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER track_contact_reply_delivery AFTER UPDATE OF state ON public.delivery_jobs FOR EACH ROW EXECUTE FUNCTION gdg_security.track_contact_reply_delivery();

CREATE FUNCTION gdg_security.assign_contact_followup() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE owner uuid;task uuid;BEGIN
 IF NEW.status NOT IN('new','in_progress') OR NEW.redacted_at IS NOT NULL OR NEW.assigned_task_id IS NOT NULL THEN RETURN NEW;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('contact-routing',0));
 SELECT u.id INTO owner FROM public.admin_users u
 WHERE public.can_access_contact(u.id) AND NOT u.must_change_password AND (u.locked_until IS NULL OR u.locked_until<=now())
 AND(u.role='super_admin' OR EXISTS(SELECT 1 FROM public.team_members m WHERE m.admin_user_id=u.id AND m.is_active AND m.role~*'(^|[^[:alpha:]])secretary([^[:alpha:]]|$)'))
 ORDER BY CASE WHEN EXISTS(SELECT 1 FROM public.team_members m WHERE m.admin_user_id=u.id AND m.is_active AND m.role~*'(^|[^[:alpha:]])secretary([^[:alpha:]]|$)') THEN 0 ELSE 1 END,
 (SELECT count(*) FROM public.contact_submissions c JOIN public.communication_tasks t ON t.id=c.assigned_task_id WHERE c.redacted_at IS NULL AND c.status<>'resolved' AND t.archived_at IS NULL AND t.assigned_to_id=u.id),u.created_at,u.id LIMIT 1;
 IF owner IS NULL THEN RETURN NEW;END IF;
 INSERT INTO public.communication_tasks(title,description,assigned_to_id,assigned_by_id,status,priority,tags)
 VALUES('Reply to '||left(NEW.inquiry_type,40)||' inquiry','Review and reply in the contact inbox: /admin/communications?tab=contact&contact='||NEW.id,owner,owner,'pending','medium','["contact-inquiry"]') RETURNING id INTO task;
 NEW.assigned_task_id:=task;
 PERFORM public.enqueue_task_notice(task,'assignment');
 INSERT INTO public.admin_actions(action,target_type,target_id,metadata) VALUES('contact.auto_assigned','contact_submission',NEW.id,jsonb_build_object('taskId',task,'assigneeId',owner));
 RETURN NEW;
END $$;
CREATE TRIGGER assign_contact_followup BEFORE INSERT OR UPDATE OF assigned_task_id ON public.contact_submissions FOR EACH ROW EXECUTE FUNCTION gdg_security.assign_contact_followup();

CREATE FUNCTION gdg_security.sync_contact_followup() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NEW.assigned_task_id IS NOT NULL AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.redacted_at IS DISTINCT FROM OLD.redacted_at) THEN
  UPDATE public.communication_tasks SET status=CASE WHEN NEW.status IN('resolved','redacted') THEN 'completed' WHEN NEW.status='in_progress' THEN 'in-progress' ELSE 'pending' END,
   completed_at=CASE WHEN NEW.status IN('resolved','redacted') THEN now() ELSE NULL END,revision=revision+1,updated_at=now()
   WHERE id=NEW.assigned_task_id AND archived_at IS NULL;
 END IF;
 IF NEW.redacted_at IS NOT NULL AND OLD.redacted_at IS NULL THEN UPDATE public.contact_replies SET body='' WHERE contact_id=NEW.id;END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sync_contact_followup AFTER UPDATE OF status,redacted_at ON public.contact_submissions FOR EACH ROW EXECUTE FUNCTION gdg_security.sync_contact_followup();


CREATE OR REPLACE FUNCTION public.contact_inbox(p_actor uuid,p_session uuid,p_id uuid,p_filters jsonb,p_page integer) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;BEGIN
 IF NOT gdg_security.member_transfer_session(p_actor,p_session) OR NOT public.can_access_contact(p_actor) OR p_page NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 WITH eligible AS(SELECT c.* FROM public.contact_submissions c WHERE(p_id IS NULL OR id=p_id) AND(p_filters->>'status' IS NULL OR status=p_filters->>'status') AND(coalesce(p_filters->>'q','')='' OR strpos(lower(name||' '||email||' '||message),lower(p_filters->>'q'))>0)),
 records AS(SELECT * FROM eligible ORDER BY created_at DESC,id LIMIT 50 OFFSET(p_page-1)*50)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'email',c.email,'type',c.inquiry_type,'message',c.message,'interests',c.interests,'status',c.status,'revision',c.revision,'createdAt',c.created_at,'resolvedAt',c.resolved_at,'redactedAt',c.redacted_at,'hold',c.retention_hold,'holdReason',c.hold_reason,
 'assignment',(SELECT jsonb_build_object('taskId',t.id,'name',coalesce(u.display_name,u.email),'userId',u.id) FROM public.communication_tasks t JOIN public.admin_users u ON u.id=t.assigned_to_id WHERE t.id=c.assigned_task_id AND t.archived_at IS NULL),
 'replies',CASE WHEN p_id IS NULL THEN '[]'::jsonb ELSE coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r."createdAt",r.id) FROM(SELECT cr.id,cr.body,cr.created_at AS "createdAt",coalesce(a.display_name,'Chapter team') AS "senderName",cr.delivery_state AS state FROM public.contact_replies cr LEFT JOIN public.admin_users a ON a.id=cr.sender_id WHERE cr.contact_id=c.id ORDER BY cr.created_at DESC,cr.id DESC LIMIT 50)r),'[]'::jsonb) END,
 'attachment',CASE WHEN u.id IS NOT NULL AND u.deleted_at IS NULL AND u.purged_at IS NULL THEN jsonb_build_object('id',u.id,'filename',u.filename,'state',u.state,'bytes',u.expected_bytes,'canDownload',u.state='clean' AND u.clean_key IS NOT NULL) ELSE NULL END)) FROM records c LEFT JOIN public.upload_intents u ON u.id=c.attachment_upload_id),'[]'),'total',(SELECT count(*) FROM eligible),'page',p_page,'pageSize',50) INTO result;
 IF p_id IS NOT NULL AND jsonb_array_length(result->'items')=0 THEN RAISE EXCEPTION 'NOT_FOUND';END IF;RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.mutate_contact_record(p_actor uuid,p_session uuid,p_id uuid,p_revision integer,p_action text,p_document jsonb,p_verified_hash text,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ DECLARE c public.contact_submissions;reply_id uuid;job_id uuid;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('contact-uploads',0));
 IF NOT gdg_security.member_transfer_session(p_actor,p_session) OR NOT public.can_access_contact(p_actor) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT * INTO c FROM public.contact_submissions WHERE id=p_id AND redacted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF c.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'CONFLICT';END IF;
 IF p_action='status' THEN
  IF p_document->>'status' IS NULL OR p_document->>'status' NOT IN('new','in_progress','resolved') THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
  UPDATE public.contact_submissions SET status=p_document->>'status',resolved_at=CASE WHEN p_document->>'status'='resolved' THEN coalesce(resolved_at,now()) ELSE NULL END,revision=revision+1,updated_at=now() WHERE id=c.id;
 ELSIF p_action='assign' THEN
  IF c.assigned_task_id IS NOT NULL OR c.status NOT IN('new','in_progress') THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  UPDATE public.contact_submissions SET assigned_task_id=NULL,revision=revision+1,updated_at=now() WHERE id=c.id;
  IF NOT EXISTS(SELECT 1 FROM public.contact_submissions WHERE id=c.id AND assigned_task_id IS NOT NULL) THEN RAISE EXCEPTION 'ACCOUNT_NOT_READY';END IF;
 ELSIF p_action='reply' THEN
  IF c.status='redacted' OR c.email='' OR length(btrim(coalesce(p_document->>'body',''))) NOT BETWEEN 1 AND 5000 OR (p_document->>'body')~'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
  INSERT INTO public.contact_replies(contact_id,sender_id,body) VALUES(c.id,p_actor,btrim(p_document->>'body')) RETURNING id INTO reply_id;
  INSERT INTO public.delivery_jobs(kind,deduplication_key,payload) VALUES('contact_reply','contact-reply:'||reply_id,jsonb_build_object('contactId',c.id,'replyId',reply_id)) RETURNING id INTO job_id;
  UPDATE public.contact_replies SET delivery_job_id=job_id WHERE id=reply_id;
  UPDATE public.contact_submissions SET status=CASE WHEN status='new' THEN 'in_progress' ELSE status END,revision=revision+1,updated_at=now() WHERE id=c.id;
 ELSIF p_action='hold' THEN
  IF NOT EXISTS(SELECT 1 FROM public.admin_users WHERE id=p_actor AND password_hash=p_verified_hash) OR p_document->>'enabled' NOT IN('true','false') OR(p_document->>'enabled'='true' AND length(btrim(coalesce(p_document->>'reason',''))) NOT BETWEEN 10 AND 1000) THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
  UPDATE public.contact_submissions SET retention_hold=(p_document->>'enabled')::boolean,hold_reason=CASE WHEN(p_document->>'enabled')::boolean THEN btrim(p_document->>'reason') ELSE NULL END,revision=revision+1,updated_at=now() WHERE id=c.id;
 ELSE RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata) VALUES(p_actor,'contact.'||p_action,'contact_submission',c.id,p_request_id,jsonb_build_object('revision',c.revision+1));
 RETURN jsonb_build_object('id',c.id,'revision',c.revision+1);
END $$;

CREATE OR REPLACE FUNCTION public.inspect_contact_write(p_actor uuid,p_session uuid,p_id uuid,p_revision integer,p_action text,p_document jsonb,p_key_hash text,p_request_hash text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE c public.contact_submissions;k public.idempotency_keys;BEGIN
 IF NOT gdg_security.member_transfer_session(p_actor,p_session) OR NOT public.can_access_contact(p_actor) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT * INTO c FROM public.contact_submissions WHERE id=p_id AND redacted_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_action IS NULL OR p_action NOT IN('status','hold','reply','assign') OR p_revision IS NULL OR p_revision<1 OR p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$' OR p_request_hash IS NULL OR p_request_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 SELECT * INTO k FROM public.idempotency_keys WHERE scope='contact-write:'||p_actor||':'||p_session||':'||p_id AND key_hash=p_key_hash;
 IF FOUND THEN
  IF k.request_hash IS DISTINCT FROM p_request_hash OR k.result->>'action' IS DISTINCT FROM p_action THEN RAISE EXCEPTION 'CONFLICT';END IF;
  IF k.expires_at<=now() THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
 END IF;
 RETURN jsonb_build_object('committed',k.key_hash IS NOT NULL,'canRetry',k.key_hash IS NULL AND c.revision=p_revision,'currentRevision',c.revision,'receipt',CASE WHEN k.key_hash IS NULL THEN NULL ELSE k.result END);
END $$;

CREATE OR REPLACE FUNCTION public.claim_contact_upload_cleanup(p_limit integer) RETURNS SETOF public.upload_intents LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ DECLARE u public.upload_intents;BEGIN
 IF p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('contact-uploads',0));
 -- Resolution retention redacts the message and queues its private file together.
 UPDATE public.contact_submissions SET name='Removed contact',email='',message='Removed by contact retention.',interests='{}',status='redacted',redacted_at=now(),hold_reason=NULL,revision=revision+1,updated_at=now()
 WHERE id IN(SELECT id FROM public.contact_submissions WHERE resolved_at<now()-interval '365 days' AND NOT retention_hold AND redacted_at IS NULL ORDER BY resolved_at LIMIT 500);
 FOR u IN SELECT x.* FROM public.upload_intents x WHERE x.purpose='contact' AND x.purged_at IS NULL
  AND((x.contact_id IS NULL AND(x.expires_at<now()-interval '24 hours' OR x.deleted_at<now()-interval '3 minutes')) OR EXISTS(SELECT 1 FROM public.contact_submissions c WHERE c.id=x.contact_id AND c.redacted_at IS NOT NULL AND NOT c.retention_hold))
  AND NOT EXISTS(SELECT 1 FROM public.delivery_jobs j WHERE j.kind='contact_upload_scan' AND j.payload->>'uploadId'=x.id::text AND j.state='running' AND j.locked_until>now()) ORDER BY x.created_at,x.id LIMIT p_limit FOR UPDATE LOOP
  UPDATE public.upload_intents SET deleted_at=coalesce(deleted_at,now()),state='expired' WHERE id=u.id RETURNING * INTO u;
  RETURN NEXT u;
 END LOOP;
END $$;

CREATE FUNCTION public.prepare_contact_reply(p_job uuid,p_lease uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.delivery_jobs;r public.contact_replies;c public.contact_submissions;BEGIN
 SELECT * INTO j FROM public.delivery_jobs WHERE id=p_job AND lease_token=p_lease AND kind='contact_reply' AND state='running' AND locked_until>now() FOR SHARE;
 IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT * INTO r FROM public.contact_replies WHERE id=(j.payload->>'replyId')::uuid AND delivery_job_id=j.id FOR SHARE;
 IF NOT FOUND OR NOT public.can_access_contact(r.sender_id) OR NOT EXISTS(SELECT 1 FROM public.admin_users WHERE id=r.sender_id AND NOT must_change_password AND (locked_until IS NULL OR locked_until<=now())) THEN RETURN NULL;END IF;
 SELECT * INTO c FROM public.contact_submissions WHERE id=r.contact_id AND id=(j.payload->>'contactId')::uuid AND redacted_at IS NULL FOR SHARE;
 IF NOT FOUND OR c.email='' OR r.body='' THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('email',c.email,'name',c.name,'type',c.inquiry_type,'body',r.body);
END $$;
CREATE OR REPLACE FUNCTION public.claim_delivery_jobs(p_limit integer) RETURNS SETOF public.delivery_jobs LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT * FROM public.claim_worker_jobs(p_limit,ARRAY['event_confirmation','event_message','event_push_verification','newsletter_confirmation','contact_acknowledgment','contact_notification','contact_reply',
 'form_access','form_response_notification','form_reviewed_email','form_respondent_copy','form_daily_digest','account_access','team_invite','team_announcement','task_notification','direct_message_notice','chapter_announcement','reward_credential_email','workspace_notice_email']);
$$;
REVOKE ALL ON FUNCTION gdg_security.track_contact_reply_delivery(),gdg_security.assign_contact_followup(),gdg_security.sync_contact_followup(),public.prepare_contact_reply(uuid,uuid) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION gdg_security.track_contact_reply_delivery(),gdg_security.assign_contact_followup(),gdg_security.sync_contact_followup(),public.prepare_contact_reply(uuid,uuid) TO service_role;
COMMIT;
