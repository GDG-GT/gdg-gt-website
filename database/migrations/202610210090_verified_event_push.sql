BEGIN;
CREATE TABLE public.event_push_verifications(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),registration_id uuid NOT NULL REFERENCES public.event_attendance(id),
 email_hash text NOT NULL,token_hash text NOT NULL UNIQUE CHECK(token_hash~'^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',verified_at timestamptz
);
CREATE TABLE public.push_subscriptions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),event_id uuid NOT NULL REFERENCES public.events(id),
 admin_user_id uuid REFERENCES public.admin_users(id),registration_id uuid REFERENCES public.event_attendance(id),registration_email_hash text,
 endpoint_hash text NOT NULL CHECK(endpoint_hash~'^[a-f0-9]{64}$'),management_hash text NOT NULL CHECK(management_hash~'^[a-f0-9]{64}$'),
 endpoint_encrypted text,permission_state text NOT NULL DEFAULT 'granted' CHECK(permission_state IN('granted','revoked','expired')),
 failure_count integer NOT NULL DEFAULT 0,last_failure_at timestamptz,last_success_at timestamptz,revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(event_id,endpoint_hash),
 CHECK((admin_user_id IS NOT NULL AND registration_id IS NULL AND registration_email_hash IS NULL) OR
       (admin_user_id IS NULL AND registration_id IS NOT NULL AND registration_email_hash IS NOT NULL AND registration_email_hash~'^[a-f0-9]{64}$'))
);
CREATE TABLE public.push_delivery_log(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),event_id uuid NOT NULL REFERENCES public.events(id),subscription_id uuid NOT NULL REFERENCES public.push_subscriptions(id),
 event_start timestamptz NOT NULL,state text NOT NULL DEFAULT 'queued' CHECK(state IN('queued','accepted','skipped','failed')),
 attempt_count integer NOT NULL DEFAULT 0,provider_status integer,last_error_code text,accepted_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(event_id,subscription_id,event_start)
);
CREATE INDEX push_active_events ON public.push_subscriptions(event_id,id) WHERE revoked_at IS NULL;
ALTER TABLE public.event_push_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_delivery_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_push_verifications,public.push_subscriptions,public.push_delivery_log FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT ALL ON public.event_push_verifications,public.push_subscriptions,public.push_delivery_log TO service_role;
CREATE FUNCTION gdg_security.push_session(p_actor uuid,p_session uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.admin_users u JOIN public.admin_sessions s ON s.admin_user_id=u.id WHERE u.id=p_actor AND s.id=p_session
  AND u.is_active AND NOT u.must_change_password AND u.deleted_at IS NULL AND(u.locked_until IS NULL OR u.locked_until<=now())
  AND s.revoked_at IS NULL AND s.idle_expires_at>now() AND s.absolute_expires_at>now());
$$;
CREATE FUNCTION public.request_event_push_verification(p_slug text,p_email_hash text,p_token_hash text,p_secret text) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r public.event_attendance;v uuid;BEGIN
 IF p_token_hash IS NULL OR p_token_hash!~'^[a-f0-9]{64}$' OR p_email_hash IS NULL OR p_email_hash!~'^[a-f0-9]{64}$' OR p_secret IS NULL OR p_secret NOT LIKE 'v1.%' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 SELECT a.* INTO r FROM public.event_attendance a JOIN public.events e ON e.id=a.event_id WHERE e.slug=p_slug AND e.publication_status='published' AND e.start_at>now()
  AND a.deleted_at IS NULL AND encode(sha256(convert_to(a.attendee_email,'UTF8')),'hex')=p_email_hash FOR UPDATE OF a;
 IF NOT FOUND THEN RETURN;END IF;
 IF(SELECT count(*) FROM public.event_push_verifications WHERE registration_id=r.id AND created_at>now()-interval '1 hour')>=3 THEN RETURN;END IF;
 INSERT INTO public.event_push_verifications(registration_id,email_hash,token_hash) VALUES(r.id,p_email_hash,p_token_hash) RETURNING id INTO v;
 INSERT INTO public.delivery_jobs(kind,deduplication_key,payload,secret_payload) VALUES('event_push_verification','event-push-verification:'||v,jsonb_build_object('verificationId',v),p_secret);
END $$;
CREATE FUNCTION public.inspect_event_push_verification(p_token_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v public.event_push_verifications;r public.event_attendance;e public.events;BEGIN
 SELECT * INTO v FROM public.event_push_verifications WHERE token_hash=p_token_hash AND expires_at>now() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'PUSH_VERIFICATION_REQUIRED';END IF;
 SELECT * INTO r FROM public.event_attendance WHERE id=v.registration_id AND deleted_at IS NULL;
 IF NOT FOUND OR encode(sha256(convert_to(r.attendee_email,'UTF8')),'hex')<>v.email_hash THEN RAISE EXCEPTION 'PUSH_VERIFICATION_REQUIRED';END IF;
 SELECT * INTO e FROM public.events WHERE id=r.event_id AND publication_status='published' AND start_at>now();
 IF NOT FOUND THEN RAISE EXCEPTION 'PUSH_VERIFICATION_REQUIRED';END IF;
 UPDATE public.event_push_verifications SET verified_at=coalesce(verified_at,now()) WHERE id=v.id;
 RETURN jsonb_build_object('eventId',e.id,'slug',e.slug,'title',e.title,'expiresAt',v.expires_at);
END $$;
CREATE FUNCTION public.prepare_event_push_verification(p_job uuid,p_lease uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.delivery_jobs;v public.event_push_verifications;r public.event_attendance;e public.events;BEGIN
 SELECT * INTO j FROM public.delivery_jobs WHERE id=p_job AND lease_token=p_lease AND kind='event_push_verification' AND state='running' AND locked_until>now();
 IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT * INTO v FROM public.event_push_verifications WHERE id=(j.payload->>'verificationId')::uuid AND expires_at>now() AND verified_at IS NULL;
 IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT * INTO r FROM public.event_attendance WHERE id=v.registration_id AND deleted_at IS NULL;
 IF NOT FOUND OR encode(sha256(convert_to(r.attendee_email,'UTF8')),'hex')<>v.email_hash THEN RETURN NULL;END IF;
 SELECT * INTO e FROM public.events WHERE id=r.event_id AND publication_status='published' AND start_at>now();
 IF NOT FOUND THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('email',r.attendee_email,'slug',e.slug,'tokenHash',v.token_hash);
END $$;
CREATE FUNCTION public.mutate_push_subscription(p_actor uuid,p_session uuid,p_token_hash text,p_event uuid,p_endpoint_hash text,p_management_hash text,p_encrypted text,p_action text,p_request_id uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.push_subscriptions;e public.events;v public.event_push_verifications;reg uuid;email_hash text;BEGIN
 IF p_action IS NULL OR p_action NOT IN('subscribe','status','unsubscribe') OR p_endpoint_hash IS NULL OR p_endpoint_hash!~'^[a-f0-9]{64}$' OR p_management_hash IS NULL OR p_management_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('event-push:'||p_endpoint_hash,0));
 SELECT * INTO s FROM public.push_subscriptions WHERE event_id=p_event AND endpoint_hash=p_endpoint_hash FOR UPDATE;
 IF p_action IN('status','unsubscribe') THEN
  IF s.id IS NULL OR s.management_hash<>p_management_hash THEN RETURN jsonb_build_object('subscribed',false);END IF;
  IF p_action='unsubscribe' THEN UPDATE public.push_subscriptions SET revoked_at=coalesce(revoked_at,now()),permission_state='revoked',endpoint_encrypted=NULL,updated_at=now() WHERE id=s.id;END IF;
  RETURN jsonb_build_object('subscribed',p_action='status' AND s.revoked_at IS NULL,'id',s.id);
 END IF;
 SELECT * INTO e FROM public.events WHERE id=p_event AND publication_status='published' AND start_at>now() FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_actor IS NOT NULL THEN
  IF NOT gdg_security.push_session(p_actor,p_session) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 ELSE
  PERFORM public.inspect_event_push_verification(p_token_hash);
  SELECT * INTO v FROM public.event_push_verifications WHERE token_hash=p_token_hash AND expires_at>now() AND verified_at IS NOT NULL;
  SELECT a.id INTO reg FROM public.event_attendance a WHERE a.id=v.registration_id AND a.event_id=e.id AND a.deleted_at IS NULL;
  IF reg IS NULL THEN RAISE EXCEPTION 'PUSH_VERIFICATION_REQUIRED';END IF;email_hash:=v.email_hash;
 END IF;
 IF p_encrypted IS NULL OR p_encrypted NOT LIKE 'v1.%' OR length(p_encrypted)>20000 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 IF s.id IS NOT NULL AND s.revoked_at IS NULL AND(s.admin_user_id IS DISTINCT FROM p_actor OR s.registration_id IS DISTINCT FROM reg OR s.management_hash<>p_management_hash) THEN RAISE EXCEPTION 'PUSH_DEVICE_BOUND';END IF;
 IF s.id IS NULL AND((SELECT count(*) FROM public.push_subscriptions WHERE revoked_at IS NULL AND endpoint_hash=p_endpoint_hash)>=50 OR
  (SELECT count(*) FROM public.push_subscriptions WHERE revoked_at IS NULL AND((p_actor IS NOT NULL AND admin_user_id=p_actor) OR(reg IS NOT NULL AND registration_id=reg)))>=50) THEN RAISE EXCEPTION 'PUSH_QUOTA';END IF;
 INSERT INTO public.push_subscriptions(event_id,admin_user_id,registration_id,registration_email_hash,endpoint_hash,management_hash,endpoint_encrypted)
 VALUES(e.id,p_actor,reg,email_hash,p_endpoint_hash,p_management_hash,p_encrypted) ON CONFLICT(event_id,endpoint_hash) DO UPDATE
  SET admin_user_id=excluded.admin_user_id,registration_id=excluded.registration_id,registration_email_hash=excluded.registration_email_hash,
  management_hash=excluded.management_hash,endpoint_encrypted=excluded.endpoint_encrypted,permission_state='granted',revoked_at=NULL,failure_count=0,updated_at=now() RETURNING * INTO s;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata) VALUES(p_actor,'push.event_subscribed','push_subscription',s.id,p_request_id,jsonb_build_object('eventId',e.id,'ownerType',CASE WHEN p_actor IS NULL THEN 'registration' ELSE 'account' END));
 RETURN jsonb_build_object('subscribed',true,'id',s.id);
END $$;
CREATE FUNCTION gdg_security.push_owner_current(p_subscription uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.push_subscriptions s WHERE s.id=p_subscription AND s.revoked_at IS NULL AND s.permission_state='granted' AND s.endpoint_encrypted IS NOT NULL AND
  ((s.admin_user_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.admin_users u WHERE u.id=s.admin_user_id AND u.is_active AND NOT u.must_change_password AND u.deleted_at IS NULL AND(u.locked_until IS NULL OR u.locked_until<=now()))) OR
   (s.registration_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.event_attendance a WHERE a.id=s.registration_id AND a.event_id=s.event_id AND a.deleted_at IS NULL AND encode(sha256(convert_to(a.attendee_email,'UTF8')),'hex')=s.registration_email_hash))));
$$;
CREATE FUNCTION public.advance_event_push() RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE n integer;BEGIN
 WITH candidates AS(SELECT s.id,e.id AS event_id,e.start_at FROM public.push_subscriptions s JOIN public.events e ON e.id=s.event_id
  WHERE e.publication_status='published' AND e.start_at-interval '24 hours'<=now() AND e.start_at-interval '23 hours 30 minutes'>now()
   AND gdg_security.push_owner_current(s.id) AND NOT EXISTS(SELECT 1 FROM public.push_delivery_log l WHERE l.subscription_id=s.id AND l.event_start=e.start_at)
  ORDER BY e.start_at,s.id LIMIT 1000), inserted AS(
 INSERT INTO public.push_delivery_log(event_id,subscription_id,event_start) SELECT event_id,id,start_at FROM candidates ON CONFLICT DO NOTHING RETURNING *)
 INSERT INTO public.delivery_jobs(kind,deduplication_key,payload) SELECT 'event_push_reminder','event-push-reminder:'||id,jsonb_build_object('deliveryId',id) FROM inserted ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS n=ROW_COUNT;RETURN jsonb_build_object('queued',n);
END $$;
CREATE FUNCTION public.prepare_event_push(p_job uuid,p_lease uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.delivery_jobs;l public.push_delivery_log;s public.push_subscriptions;e public.events;BEGIN
 SELECT * INTO j FROM public.delivery_jobs WHERE id=p_job AND lease_token=p_lease AND kind='event_push_reminder' AND state='running' AND locked_until>now() FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT * INTO l FROM public.push_delivery_log WHERE id=(j.payload->>'deliveryId')::uuid AND state='queued';IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT * INTO e FROM public.events WHERE id=l.event_id;
 IF e.publication_status<>'published' OR e.start_at<>l.event_start OR now()>l.event_start-interval '23 hours 30 minutes' OR NOT gdg_security.push_owner_current(l.subscription_id) THEN
  UPDATE public.push_delivery_log SET state='skipped',last_error_code='SCOPE_OR_OCCURRENCE_CHANGED',updated_at=now() WHERE id=l.id;RETURN NULL;
 END IF;
 SELECT * INTO s FROM public.push_subscriptions WHERE id=l.subscription_id;
 RETURN jsonb_build_object('deliveryId',l.id,'encrypted',s.endpoint_encrypted,'slug',e.slug,'title',e.title,'eventStart',e.start_at);
END $$;
CREATE FUNCTION public.finish_event_push(p_job uuid,p_lease uuid,p_result text,p_provider_status integer) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.delivery_jobs;l public.push_delivery_log;terminal boolean;BEGIN
 IF p_result IS NULL OR p_result NOT IN('accepted','skipped','expired','retry','failed') OR(p_provider_status IS NOT NULL AND p_provider_status NOT BETWEEN 100 AND 599) THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 SELECT * INTO j FROM public.delivery_jobs WHERE id=p_job AND lease_token=p_lease AND kind='event_push_reminder' AND state='running' AND locked_until>now() FOR UPDATE;
 IF NOT FOUND THEN RETURN false;END IF;
 SELECT * INTO l FROM public.push_delivery_log WHERE id=(j.payload->>'deliveryId')::uuid FOR UPDATE;IF NOT FOUND THEN RETURN false;END IF;
 terminal:=p_result<>'retry' OR j.attempt_count>=6 OR now()>l.event_start-interval '23 hours 30 minutes';
 UPDATE public.push_delivery_log SET state=CASE WHEN p_result='accepted' THEN 'accepted' WHEN p_result='skipped' THEN 'skipped' WHEN terminal THEN 'failed' ELSE 'queued' END,
  attempt_count=j.attempt_count,provider_status=p_provider_status,last_error_code=CASE WHEN p_result IN('accepted','skipped') THEN NULL ELSE 'PUSH_'||upper(p_result) END,
  accepted_at=CASE WHEN p_result='accepted' THEN now() ELSE NULL END,updated_at=now() WHERE id=l.id;
 IF p_result='accepted' THEN UPDATE public.push_subscriptions SET failure_count=0,last_success_at=now() WHERE id=l.subscription_id;
 ELSIF p_result IN('expired','retry','failed') THEN UPDATE public.push_subscriptions SET failure_count=failure_count+1,last_failure_at=now(),
  revoked_at=CASE WHEN p_result='expired' THEN now() ELSE revoked_at END,permission_state=CASE WHEN p_result='expired' THEN 'expired' ELSE permission_state END,
  endpoint_encrypted=CASE WHEN p_result='expired' THEN NULL ELSE endpoint_encrypted END
  WHERE id=l.subscription_id OR(p_result='expired' AND endpoint_hash=(SELECT endpoint_hash FROM public.push_subscriptions WHERE id=l.subscription_id));END IF;
 UPDATE public.delivery_jobs SET state=CASE WHEN NOT terminal THEN 'pending' WHEN p_result IN('accepted','skipped') THEN 'completed' ELSE 'dead' END,
  next_attempt_at=now()+make_interval(secs=>least(300,30*(2^least(j.attempt_count-1,4))::integer)),locked_until=NULL,lease_token=NULL,
  last_error_code=CASE WHEN p_result IN('accepted','skipped') THEN NULL ELSE 'PUSH_'||upper(p_result) END,updated_at=now() WHERE id=j.id;
 RETURN true;
END $$;
CREATE FUNCTION public.cleanup_event_push() RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE verifications integer;subscriptions integer;logs integer;BEGIN
 DELETE FROM public.event_push_verifications WHERE id IN(SELECT id FROM public.event_push_verifications WHERE expires_at<now()-interval '1 day' ORDER BY expires_at LIMIT 1000 FOR UPDATE SKIP LOCKED);GET DIAGNOSTICS verifications=ROW_COUNT;
 UPDATE public.push_subscriptions SET revoked_at=coalesce(revoked_at,now()),permission_state='expired',endpoint_encrypted=NULL,updated_at=now()
 WHERE id IN(SELECT s.id FROM public.push_subscriptions s JOIN public.events e ON e.id=s.event_id WHERE s.revoked_at IS NULL AND(e.start_at<now()-interval '1 day' OR e.publication_status IN('cancelled','archived') OR NOT gdg_security.push_owner_current(s.id)) LIMIT 1000 FOR UPDATE OF s SKIP LOCKED);GET DIAGNOSTICS subscriptions=ROW_COUNT;
 DELETE FROM public.push_delivery_log WHERE id IN(SELECT id FROM public.push_delivery_log WHERE created_at<now()-interval '90 days' AND state<>'queued' ORDER BY created_at LIMIT 1000 FOR UPDATE SKIP LOCKED);GET DIAGNOSTICS logs=ROW_COUNT;
 RETURN jsonb_build_object('verificationsExpired',verifications,'subscriptionsRevoked',subscriptions,'logsExpired',logs);
END $$;
CREATE OR REPLACE FUNCTION public.claim_delivery_jobs(p_limit integer) RETURNS SETOF public.delivery_jobs LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT * FROM public.claim_worker_jobs(p_limit,ARRAY['event_confirmation','event_message','event_push_verification','newsletter_confirmation','contact_acknowledgment','contact_notification',
 'form_access','form_response_notification','form_reviewed_email','account_access','team_invite','team_announcement','task_notification','direct_message_notice','chapter_announcement']);
$$;
-- Reuse the precise authenticated scheduler boundary; no browser timer dispatches.
CREATE OR REPLACE FUNCTION public.begin_scheduled_job(p_name text,p_request uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE cadence integer;occurrence_id bigint;attempt_id integer;r public.scheduled_job_runs;BEGIN
 cadence:=CASE p_name WHEN 'form-schedules' THEN 300 WHEN 'form-cleanup' THEN 3600 WHEN 'delivery' THEN 60 WHEN 'task-overdue' THEN 900 WHEN 'announcements' THEN 300 WHEN 'newsletter-campaigns' THEN 300 WHEN 'event-push' THEN 300 ELSE NULL END;
 IF cadence IS NULL THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('scheduled-job:'||p_name,0));occurrence_id:=floor(extract(epoch FROM now())/cadence)::bigint;
 IF EXISTS(SELECT 1 FROM public.scheduled_job_runs WHERE job_name=p_name AND state='running' AND locked_until>now()) THEN RETURN jsonb_build_object('skipped','busy');END IF;
 IF EXISTS(SELECT 1 FROM public.scheduled_job_runs WHERE job_name=p_name AND occurrence=occurrence_id AND state='completed') THEN RETURN jsonb_build_object('skipped','already_completed');END IF;
 UPDATE public.scheduled_job_runs SET state='failed',error_code='LEASE_EXPIRED',completed_at=now() WHERE job_name=p_name AND state='running' AND locked_until<=now();
 SELECT coalesce(max(attempt),0)+1 INTO attempt_id FROM public.scheduled_job_runs WHERE job_name=p_name AND occurrence=occurrence_id;
 IF attempt_id>8 THEN RETURN jsonb_build_object('skipped','attempts_exhausted');END IF;
 INSERT INTO public.scheduled_job_runs(job_name,occurrence,attempt,request_id) VALUES(p_name,occurrence_id,attempt_id,p_request) RETURNING * INTO r;
 RETURN jsonb_build_object('runId',r.id,'lease',r.lease_token,'lockedUntil',r.locked_until);
END $$;
REVOKE ALL ON FUNCTION gdg_security.push_session(uuid,uuid),public.request_event_push_verification(text,text,text,text),public.inspect_event_push_verification(text),public.prepare_event_push_verification(uuid,uuid),
 public.mutate_push_subscription(uuid,uuid,text,uuid,text,text,text,text,uuid),gdg_security.push_owner_current(uuid),public.advance_event_push(),public.prepare_event_push(uuid,uuid),public.finish_event_push(uuid,uuid,text,integer),public.cleanup_event_push() FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION gdg_security.push_session(uuid,uuid),public.request_event_push_verification(text,text,text,text),public.inspect_event_push_verification(text),public.prepare_event_push_verification(uuid,uuid),
 public.mutate_push_subscription(uuid,uuid,text,uuid,text,text,text,text,uuid),gdg_security.push_owner_current(uuid),public.advance_event_push(),public.prepare_event_push(uuid,uuid),public.finish_event_push(uuid,uuid,text,integer),public.cleanup_event_push() TO service_role;
COMMIT;
