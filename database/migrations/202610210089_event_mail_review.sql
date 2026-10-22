BEGIN;
CREATE TABLE public.event_mail_reviews(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),event_id uuid NOT NULL REFERENCES public.events(id),
 actor_id uuid NOT NULL REFERENCES public.admin_users(id),session_id uuid NOT NULL REFERENCES public.admin_sessions(id),
 event_revision integer NOT NULL,subject text NOT NULL,message text NOT NULL,recipient_snapshot jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT now()+interval '5 minutes',used_at timestamptz
);
ALTER TABLE public.event_mail_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_mail_reviews FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT ALL ON public.event_mail_reviews TO service_role;
ALTER TABLE public.event_messages ADD COLUMN approval_password_hash text;
CREATE OR REPLACE FUNCTION public.can_event_audience(p_actor uuid,p_event uuid,p_action text) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT p_action IN('send_email','export') AND EXISTS(
  SELECT 1 FROM public.events e JOIN public.admin_users u ON u.id=p_actor WHERE e.id=p_event
  AND u.is_active AND NOT u.must_change_password AND u.deleted_at IS NULL AND(u.locked_until IS NULL OR u.locked_until<=now())
  AND(e.team_id IS NULL OR EXISTS(SELECT 1 FROM public.admin_teams t WHERE t.id=e.team_id AND t.is_active AND t.deleted_at IS NULL))
  AND(u.role IN('admin','super_admin') OR(u.role='team_member' AND public.can_operate_event(u.id,'read',e.team_id)
   AND EXISTS(SELECT 1 FROM public.team_permissions p WHERE p.team_id=e.team_id AND p.resource_type='events'
    AND p.can_read AND p.permission IN(p_action,'events.'||p_action)))))
$$;
CREATE FUNCTION gdg_security.event_mail_audience(p_event uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE audience jsonb;BEGIN
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'email',a.attendee_email) ORDER BY a.id),'[]') INTO audience FROM(
  SELECT id,attendee_email FROM public.event_attendance WHERE event_id=p_event AND deleted_at IS NULL ORDER BY id LIMIT 1001)a;
 IF jsonb_array_length(audience) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'EVENT_MAIL_AUDIENCE_LIMIT';END IF;
 RETURN audience;
END $$;
CREATE FUNCTION public.review_event_mail(p_actor uuid,p_session uuid,p_event uuid,p_subject text,p_message text,p_request_id uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE e public.events;r public.event_mail_reviews;audience jsonb;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('team-administration',0));
 IF NOT gdg_security.member_transfer_session(p_actor,p_session) OR NOT public.can_event_audience(p_actor,p_event,'send_email') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT * INTO e FROM public.events WHERE id=p_event FOR UPDATE;
 IF NOT public.can_event_audience(p_actor,e.id,'send_email') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF e.publication_status NOT IN('published','cancelled') THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
 IF p_subject IS NULL OR length(btrim(p_subject)) NOT BETWEEN 2 AND 200 OR p_message IS NULL OR length(btrim(p_message)) NOT BETWEEN 10 AND 10000 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 IF(SELECT count(*) FROM public.event_mail_reviews WHERE actor_id=p_actor AND created_at>now()-interval '1 hour')>=30 THEN RAISE EXCEPTION 'EVENT_MAIL_REVIEW_LIMIT';END IF;
 audience:=gdg_security.event_mail_audience(e.id);
 INSERT INTO public.event_mail_reviews(event_id,actor_id,session_id,event_revision,subject,message,recipient_snapshot)
  VALUES(e.id,p_actor,p_session,e.revision,p_subject,p_message,audience) RETURNING * INTO r;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata)
  VALUES(p_actor,'events.email_reviewed','event',e.id,p_request_id,jsonb_build_object('reviewId',r.id,'count',jsonb_array_length(audience)));
 RETURN jsonb_build_object('reviewId',r.id,'expiresAt',r.expires_at,'count',jsonb_array_length(audience),'recipients',audience,'subject',r.subject,'message',r.message);
END $$;
-- Retire the count-only approval path. A service caller cannot accidentally
-- bypass the current session, reviewed identities/content or password fence.
CREATE OR REPLACE FUNCTION public.queue_event_message(p_actor uuid,p_event uuid,p_subject text,p_message text,p_expected_count integer,
 p_key_hash text,p_request_hash text,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'EVENT_MAIL_REVIEW_REQUIRED';END $$;
CREATE FUNCTION public.commit_event_mail(p_actor uuid,p_session uuid,p_event uuid,p_review uuid,p_verified_hash text,p_confirmation text,
 p_key_hash text,p_request_hash text,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE e public.events;r public.event_mail_reviews;k public.idempotency_keys;scope_key text;mid uuid;result jsonb;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('team-administration',0));
 IF NOT gdg_security.member_transfer_session(p_actor,p_session) OR NOT public.can_event_audience(p_actor,p_event,'send_email')
  OR NOT EXISTS(SELECT 1 FROM public.admin_users WHERE id=p_actor AND password_hash=p_verified_hash) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT * INTO e FROM public.events WHERE id=p_event FOR UPDATE;
 IF NOT public.can_event_audience(p_actor,e.id,'send_email') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$' OR p_request_hash IS NULL OR p_request_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 scope_key:='event-mail:'||p_actor||':'||p_session||':'||p_event;
 SELECT * INTO k FROM public.idempotency_keys WHERE scope=scope_key AND key_hash=p_key_hash;
 IF FOUND THEN IF k.request_hash IS DISTINCT FROM p_request_hash THEN RAISE EXCEPTION 'CONFLICT';END IF;RETURN k.result;END IF;
 SELECT * INTO r FROM public.event_mail_reviews WHERE id=p_review AND event_id=e.id AND actor_id=p_actor AND session_id=p_session AND used_at IS NULL AND expires_at>now() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'EVENT_MAIL_REVIEW_REQUIRED';END IF;
 IF r.event_revision<>e.revision OR e.publication_status NOT IN('published','cancelled') THEN RAISE EXCEPTION 'CONFLICT';END IF;
 IF p_confirmation IS DISTINCT FROM 'SEND '||jsonb_array_length(r.recipient_snapshot) THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 IF gdg_security.event_mail_audience(e.id) IS DISTINCT FROM r.recipient_snapshot THEN RAISE EXCEPTION 'AUDIENCE_CHANGED';END IF;
 IF(SELECT count(*) FROM public.event_messages WHERE created_by=p_actor AND created_at>now()-interval '24 hours')>=10 THEN RAISE EXCEPTION 'EVENT_MAIL_SEND_LIMIT';END IF;
 INSERT INTO public.event_messages(event_id,created_by,subject,message,key_hash,request_hash,recipient_count,approval_password_hash)
  VALUES(e.id,p_actor,r.subject,r.message,p_key_hash,p_request_hash,jsonb_array_length(r.recipient_snapshot),p_verified_hash) RETURNING id INTO mid;
 INSERT INTO public.event_message_recipients(message_id,registration_id,recipient_email)
  SELECT mid,(value->>'id')::uuid,value->>'email' FROM jsonb_array_elements(r.recipient_snapshot);
 INSERT INTO public.delivery_jobs(kind,deduplication_key,payload)
  SELECT 'event_message','event-message:'||mid||':'||registration_id,jsonb_build_object('messageId',mid,'registrationId',registration_id)
  FROM public.event_message_recipients WHERE message_id=mid;
 UPDATE public.event_mail_reviews SET used_at=now() WHERE id=r.id;
 result:=jsonb_build_object('messageId',mid,'recipientCount',jsonb_array_length(r.recipient_snapshot),'queued',true);
 INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result) VALUES(scope_key,p_key_hash,p_request_hash,200,result);
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata)
  VALUES(p_actor,'events.email_queued','event',e.id,p_request_id,jsonb_build_object('messageId',mid,'reviewId',r.id,'recipientCount',jsonb_array_length(r.recipient_snapshot)));
 RETURN result;
END $$;
CREATE FUNCTION public.prepare_event_mail(p_job uuid,p_lease uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.delivery_jobs;m public.event_messages;r public.event_message_recipients;e public.events;BEGIN
 SELECT * INTO j FROM public.delivery_jobs WHERE id=p_job AND lease_token=p_lease AND kind='event_message' AND state='running' AND locked_until>now() FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT * INTO m FROM public.event_messages WHERE id=(j.payload->>'messageId')::uuid;
 IF NOT FOUND OR m.created_at<now()-interval '20 hours' OR m.approval_password_hash IS NULL OR NOT public.can_event_audience(m.created_by,m.event_id,'send_email')
  OR NOT EXISTS(SELECT 1 FROM public.admin_users WHERE id=m.created_by AND password_hash=m.approval_password_hash) THEN RETURN NULL;END IF;
 SELECT * INTO e FROM public.events WHERE id=m.event_id;
 IF e.publication_status NOT IN('published','cancelled') THEN RETURN NULL;END IF;
 SELECT * INTO r FROM public.event_message_recipients WHERE message_id=m.id AND registration_id=(j.payload->>'registrationId')::uuid;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.event_attendance WHERE id=r.registration_id AND event_id=m.event_id AND deleted_at IS NULL AND attendee_email=r.recipient_email) THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('email',r.recipient_email,'subject',m.subject,'message',m.message);
END $$;
CREATE FUNCTION public.cleanup_event_mail_reviews() RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE n integer;BEGIN
 DELETE FROM public.event_mail_reviews WHERE id IN(SELECT id FROM public.event_mail_reviews WHERE expires_at<now()-interval '24 hours' ORDER BY expires_at,id LIMIT 1000 FOR UPDATE SKIP LOCKED);
 GET DIAGNOSTICS n=ROW_COUNT;RETURN n;
END $$;
REVOKE ALL ON FUNCTION gdg_security.event_mail_audience(uuid),public.review_event_mail(uuid,uuid,uuid,text,text,uuid),
 public.commit_event_mail(uuid,uuid,uuid,uuid,text,text,text,text,uuid),public.prepare_event_mail(uuid,uuid),public.cleanup_event_mail_reviews() FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION gdg_security.event_mail_audience(uuid),public.review_event_mail(uuid,uuid,uuid,text,text,uuid),
 public.commit_event_mail(uuid,uuid,uuid,uuid,text,text,text,text,uuid),public.prepare_event_mail(uuid,uuid),public.cleanup_event_mail_reviews() TO service_role;
COMMIT;
