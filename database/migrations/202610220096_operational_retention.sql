BEGIN;
-- Retained business records must not keep expired authentication rows alive.
-- Null historical session references NEVER confer access: live-session checks
-- and the original short review/export deadlines still apply.
ALTER TABLE public.upload_intents DROP CONSTRAINT upload_intents_owner_session_fkey,
 ADD CONSTRAINT upload_intents_owner_session_fkey FOREIGN KEY(owner_session) REFERENCES public.admin_sessions(id) ON DELETE SET NULL;
ALTER TABLE public.upload_intents DROP CONSTRAINT finance_upload_scope,
 ADD CONSTRAINT finance_upload_scope CHECK(purpose<>'finance' OR
 (finance_id IS NOT NULL AND finance_revision>0 AND owner_id IS NOT NULL
  AND(owner_session IS NOT NULL OR state IN('clean','rejected','expired')) AND bucket='finance-attachments'
  AND form_id IS NULL AND expected_bytes<=10485760 AND declared_mime IN('application/pdf','image/png','image/jpeg','image/webp'))),
 DROP CONSTRAINT blog_upload_scope,
 ADD CONSTRAINT blog_upload_scope CHECK(purpose<>'blog' OR
 (blog_submission_id IS NOT NULL AND blog_revision>0 AND owner_id IS NOT NULL
  AND(owner_session IS NOT NULL OR state IN('clean','rejected','expired')) AND bucket='blog-submissions'
  AND form_id IS NULL AND finance_id IS NULL AND expected_bytes<=20971520 AND declared_mime IN('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain','image/png','image/jpeg','image/webp'))),
 DROP CONSTRAINT media_upload_scope,
 ADD CONSTRAINT media_upload_scope CHECK(purpose<>'media' OR(media_id IS NOT NULL AND owner_id IS NOT NULL
  AND(owner_session IS NOT NULL OR state IN('clean','rejected','expired')) AND bucket='media' AND form_id IS NULL AND finance_id IS NULL AND blog_submission_id IS NULL));
ALTER TABLE public.form_export_jobs DROP CONSTRAINT form_export_jobs_session_id_fkey,
 ADD CONSTRAINT form_export_jobs_session_id_fkey FOREIGN KEY(session_id) REFERENCES public.admin_sessions(id) ON DELETE SET NULL;
ALTER TABLE public.media_publications ALTER COLUMN session_id DROP NOT NULL,
 DROP CONSTRAINT media_publications_session_id_fkey,
 ADD CONSTRAINT media_publications_session_id_fkey FOREIGN KEY(session_id) REFERENCES public.admin_sessions(id) ON DELETE SET NULL;
ALTER TABLE public.person_privacy_reviews ALTER COLUMN session_id DROP NOT NULL,
 DROP CONSTRAINT person_privacy_reviews_session_id_fkey,
 ADD CONSTRAINT person_privacy_reviews_session_id_fkey FOREIGN KEY(session_id) REFERENCES public.admin_sessions(id) ON DELETE SET NULL;
ALTER TABLE public.form_deletion_reviews DROP CONSTRAINT form_deletion_reviews_session_id_fkey,
 ADD CONSTRAINT form_deletion_reviews_session_id_fkey FOREIGN KEY(session_id) REFERENCES public.admin_sessions(id) ON DELETE CASCADE;
ALTER TABLE public.event_mail_reviews DROP CONSTRAINT event_mail_reviews_session_id_fkey,
 ADD CONSTRAINT event_mail_reviews_session_id_fkey FOREIGN KEY(session_id) REFERENCES public.admin_sessions(id) ON DELETE CASCADE;
ALTER TABLE public.newsletter_send_reviews DROP CONSTRAINT newsletter_send_reviews_session_id_fkey,
 ADD CONSTRAINT newsletter_send_reviews_session_id_fkey FOREIGN KEY(session_id) REFERENCES public.admin_sessions(id) ON DELETE CASCADE;
ALTER TABLE public.newsletter_test_sends DROP CONSTRAINT newsletter_test_sends_session_id_fkey,
 ADD CONSTRAINT newsletter_test_sends_session_id_fkey FOREIGN KEY(session_id) REFERENCES public.admin_sessions(id) ON DELETE CASCADE;
ALTER TABLE public.member_import_reviews DROP CONSTRAINT member_import_reviews_session_id_fkey,
 ADD CONSTRAINT member_import_reviews_session_id_fkey FOREIGN KEY(session_id) REFERENCES public.admin_sessions(id) ON DELETE CASCADE;
ALTER TABLE gdg_security.announcement_previews DROP CONSTRAINT announcement_previews_session_id_fkey,
 ADD CONSTRAINT announcement_previews_session_id_fkey FOREIGN KEY(session_id) REFERENCES public.admin_sessions(id) ON DELETE CASCADE;
ALTER TABLE gdg_security.direct_review_sessions DROP CONSTRAINT direct_review_sessions_session_id_fkey,
 ADD CONSTRAINT direct_review_sessions_session_id_fkey FOREIGN KEY(session_id) REFERENCES public.admin_sessions(id) ON DELETE CASCADE;

CREATE TABLE gdg_security.auth_rate_daily(
 day date NOT NULL,scope text NOT NULL CHECK(scope IN('auth.gate.requests','auth.gate.failures','auth.login.ip','auth.login.account')),
 attempts bigint NOT NULL CHECK(attempts>=0),PRIMARY KEY(day,scope));
ALTER TABLE gdg_security.auth_rate_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON gdg_security.auth_rate_daily FROM PUBLIC,anon,authenticated,gdg_realtime,service_role;
GRANT SELECT ON gdg_security.auth_rate_daily TO service_role;
CREATE FUNCTION gdg_security.aggregate_auth_rate() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE delta bigint;BEGIN
 IF NEW.scope IN('auth.gate.requests','auth.gate.failures','auth.login.ip','auth.login.account') THEN
  delta:=CASE WHEN TG_OP='INSERT' THEN NEW.attempts ELSE greatest(0,NEW.attempts-OLD.attempts) END;
  INSERT INTO gdg_security.auth_rate_daily(day,scope,attempts) VALUES((now() AT TIME ZONE 'UTC')::date,NEW.scope,delta)
   ON CONFLICT(day,scope) DO UPDATE SET attempts=gdg_security.auth_rate_daily.attempts+excluded.attempts;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER auth_rate_aggregate AFTER INSERT OR UPDATE OF attempts ON public.rate_limit_windows FOR EACH ROW EXECUTE FUNCTION gdg_security.aggregate_auth_rate();
-- Only aggregate extant windows; older deleted windows cannot be reconstructed.
INSERT INTO gdg_security.auth_rate_daily(day,scope,attempts)
 SELECT(window_start AT TIME ZONE 'UTC')::date,scope,sum(attempts) FROM public.rate_limit_windows
 WHERE scope IN('auth.gate.requests','auth.gate.failures','auth.login.ip','auth.login.account') AND window_start>=now()-interval '90 days'
 GROUP BY 1,2 ON CONFLICT(day,scope) DO UPDATE SET attempts=excluded.attempts;

CREATE INDEX admin_sessions_retention ON public.admin_sessions((least(idle_expires_at,absolute_expires_at,coalesce(revoked_at,'infinity'::timestamptz))),id);
CREATE INDEX csrf_retention ON public.csrf_tokens(expires_at,id);
CREATE INDEX gate_retention ON public.gate_sessions((least(expires_at,coalesce(revoked_at,'infinity'::timestamptz))),id);
CREATE INDEX notifications_retention ON public.notifications(created_at,id);
CREATE INDEX delivery_detail_retention ON public.delivery_jobs(updated_at,id) WHERE state IN('completed','dead','failed');

CREATE OR REPLACE FUNCTION public.begin_scheduled_job(p_name text,p_request uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE cadence integer;occurrence_id bigint;attempt_id integer;r public.scheduled_job_runs;BEGIN
 cadence:=CASE p_name WHEN 'form-schedules' THEN 300 WHEN 'form-cleanup' THEN 3600 WHEN 'delivery' THEN 60 WHEN 'task-overdue' THEN 900 WHEN 'announcements' THEN 300 WHEN 'newsletter-campaigns' THEN 300 WHEN 'event-push' THEN 300
  WHEN 'session-cleanup' THEN 86400 WHEN 'notification-cleanup' THEN 86400 WHEN 'report-cache-cleanup' THEN 86400 ELSE NULL END;
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

CREATE FUNCTION public.run_operational_retention(p_run uuid,p_lease uuid,p_limit integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE job public.scheduled_job_runs;ids uuid[];n integer;counts jsonb:='{}';BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 SELECT * INTO job FROM public.scheduled_job_runs WHERE id=p_run AND lease_token=p_lease AND state='running' AND locked_until>now()
  AND job_name IN('session-cleanup','notification-cleanup','report-cache-cleanup') FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'JOB_LEASE_LOST';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));
 IF job.job_name='session-cleanup' THEN
  SELECT array_agg(id) INTO ids FROM(SELECT id FROM public.admin_sessions
   WHERE least(idle_expires_at,absolute_expires_at,coalesce(revoked_at,'infinity'::timestamptz))<now()-interval '30 days'
   ORDER BY least(idle_expires_at,absolute_expires_at,coalesce(revoked_at,'infinity'::timestamptz)),id FOR UPDATE SKIP LOCKED LIMIT p_limit)s;
  -- A decades-stale abandoned upload must not pin a session. Never touch clean
  -- business evidence or any file bytes here. Existing cleanup workers handle
  -- expired quarantine objects, with their own holds and lease fences.
  UPDATE public.upload_intents SET state='expired',error_code='SESSION_EXPIRED',completed_at=now()
   WHERE owner_session=ANY(ids) AND state IN('pending','queued');GET DIAGNOSTICS n=ROW_COUNT;
  counts:=counts||jsonb_build_object('abandonedUploadsExpired',n);
  DELETE FROM public.admin_sessions WHERE id=ANY(ids);GET DIAGNOSTICS n=ROW_COUNT;
  counts:=counts||jsonb_build_object('sessionsExpired',n);
  DELETE FROM public.csrf_tokens WHERE id IN(SELECT id FROM public.csrf_tokens WHERE expires_at<now()-interval '30 days' ORDER BY expires_at,id FOR UPDATE SKIP LOCKED LIMIT p_limit);GET DIAGNOSTICS n=ROW_COUNT;
  counts:=counts||jsonb_build_object('csrfExpired',n);
  DELETE FROM public.gate_sessions WHERE id IN(SELECT id FROM public.gate_sessions WHERE least(expires_at,coalesce(revoked_at,'infinity'::timestamptz))<now()-interval '30 days' ORDER BY expires_at,id FOR UPDATE SKIP LOCKED LIMIT p_limit);GET DIAGNOSTICS n=ROW_COUNT;
  counts:=counts||jsonb_build_object('gatesExpired',n);
  DELETE FROM public.rate_limit_windows WHERE(scope,risk_key_hash,window_start) IN(SELECT scope,risk_key_hash,window_start FROM public.rate_limit_windows WHERE expires_at<=now() ORDER BY expires_at FOR UPDATE SKIP LOCKED LIMIT p_limit);GET DIAGNOSTICS n=ROW_COUNT;
  counts:=counts||jsonb_build_object('riskWindowsExpired',n);
  DELETE FROM gdg_security.auth_rate_daily WHERE day<(now() AT TIME ZONE 'UTC')::date-90;GET DIAGNOSTICS n=ROW_COUNT;
  counts:=counts||jsonb_build_object('rateAggregatesExpired',n);
  DELETE FROM public.idempotency_keys WHERE id IN(SELECT id FROM public.idempotency_keys WHERE expires_at<=now() ORDER BY expires_at,id FOR UPDATE SKIP LOCKED LIMIT p_limit);GET DIAGNOSTICS n=ROW_COUNT;
  counts:=counts||jsonb_build_object('idempotencyExpired',n);
  DELETE FROM public.security_events WHERE id IN(SELECT id FROM public.security_events WHERE created_at<now()-interval '1 year' ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT p_limit);GET DIAGNOSTICS n=ROW_COUNT;
  counts:=counts||jsonb_build_object('securityEventsExpired',n);
  UPDATE public.delivery_jobs SET payload='{}',secret_payload=NULL,last_error_code=NULL,provider_message_id=NULL
   WHERE id IN(SELECT id FROM public.delivery_jobs WHERE state IN('completed','dead','failed') AND updated_at<now()-interval '90 days'
    AND(payload<>'{}'::jsonb OR secret_payload IS NOT NULL OR last_error_code IS NOT NULL OR provider_message_id IS NOT NULL)
    ORDER BY updated_at,id FOR UPDATE SKIP LOCKED LIMIT p_limit);GET DIAGNOSTICS n=ROW_COUNT;
  counts:=counts||jsonb_build_object('deliveryDetailsExpired',n);
 ELSIF job.job_name='notification-cleanup' THEN
  -- Local operating policy: read notices 90 days; unread notices 180 days.
  -- Dismissed notices already follow the user's immediate removal action.
  DELETE FROM public.notifications WHERE id IN(SELECT id FROM public.notifications
   WHERE created_at<now()-CASE WHEN is_read THEN interval '90 days' ELSE interval '180 days' END
   ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT p_limit);GET DIAGNOSTICS n=ROW_COUNT;
  counts:=jsonb_build_object('notificationsExpired',n);
 ELSE
  DELETE FROM public.finance_report_cache WHERE id IN(SELECT id FROM public.finance_report_cache WHERE expires_at<=now() ORDER BY expires_at,id FOR UPDATE SKIP LOCKED LIMIT p_limit);GET DIAGNOSTICS n=ROW_COUNT;
  counts:=jsonb_build_object('reportCachesExpired',n);
 END IF;
 -- Audit rows, finance records and finance attachments are NEVER deleted here.
 RETURN counts;
END $$;
REVOKE ALL ON FUNCTION gdg_security.aggregate_auth_rate(),public.run_operational_retention(uuid,uuid,integer) FROM PUBLIC,anon,authenticated,gdg_realtime,service_role;
GRANT EXECUTE ON FUNCTION public.run_operational_retention(uuid,uuid,integer) TO service_role;
COMMIT;
