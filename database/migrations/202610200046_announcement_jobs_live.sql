BEGIN;
CREATE OR REPLACE FUNCTION public.begin_scheduled_job(p_name text,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE cadence integer;occurrence_id bigint;attempt_id integer;r public.scheduled_job_runs;
BEGIN
 cadence:=CASE p_name WHEN 'form-schedules' THEN 300 WHEN 'form-cleanup' THEN 3600 WHEN 'delivery' THEN 60 WHEN 'task-overdue' THEN 900 WHEN 'announcements' THEN 300 ELSE NULL END;
 IF cadence IS NULL THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('scheduled-job:'||p_name,0));
 occurrence_id:=floor(extract(epoch FROM now())/cadence)::bigint;
 IF EXISTS(SELECT 1 FROM public.scheduled_job_runs WHERE job_name=p_name AND state='running' AND locked_until>now()) THEN RETURN jsonb_build_object('skipped','busy');END IF;
 IF EXISTS(SELECT 1 FROM public.scheduled_job_runs WHERE job_name=p_name AND occurrence=occurrence_id AND state='completed') THEN RETURN jsonb_build_object('skipped','already_completed');END IF;
 UPDATE public.scheduled_job_runs SET state='failed',error_code='LEASE_EXPIRED',completed_at=now() WHERE job_name=p_name AND state='running' AND locked_until<=now();
 SELECT coalesce(max(attempt),0)+1 INTO attempt_id FROM public.scheduled_job_runs WHERE job_name=p_name AND occurrence=occurrence_id;
 IF attempt_id>8 THEN RETURN jsonb_build_object('skipped','attempts_exhausted');END IF;
 INSERT INTO public.scheduled_job_runs(job_name,occurrence,attempt,request_id) VALUES(p_name,occurrence_id,attempt_id,p_request) RETURNING * INTO r;
 RETURN jsonb_build_object('runId',r.id,'lease',r.lease_token,'lockedUntil',r.locked_until);
END $$;
CREATE OR REPLACE FUNCTION public.claim_delivery_jobs(p_limit integer) RETURNS SETOF public.delivery_jobs LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT * FROM public.claim_worker_jobs(p_limit,ARRAY['event_confirmation','event_message','newsletter_confirmation','contact_acknowledgment','contact_notification',
 'form_access','form_response_notification','account_access','team_invite','team_announcement','task_notification','direct_message_notice','chapter_announcement']);
$$;
CREATE FUNCTION gdg_security.broadcast_chapter_announcement() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ids uuid[];target uuid;BEGIN
 IF to_regprocedure('realtime.send(jsonb,text,text,boolean)') IS NULL THEN RETURN NULL;END IF;
 ids:=public.announcement_audience_ids(NEW.target_audience);
 IF TG_OP='UPDATE' THEN ids:=ids||public.announcement_audience_ids(OLD.target_audience);END IF;
 -- This is an invalidation, not a content fan-out. HTTP always reauthorizes.
 -- The periodic protected refresh remains a backstop for very large chapters.
 FOR target IN SELECT id FROM public.admin_users WHERE is_active AND deleted_at IS NULL AND NOT must_change_password AND(id=ANY(ids) OR role IN('super_admin','admin')) LIMIT 1100 LOOP
  PERFORM realtime.send(jsonb_build_object('kind','announcement-directory'),'changed','gdg:user:'||target,true);
 END LOOP;
 RETURN NULL;
END $$;
CREATE TRIGGER chapter_announcement_live AFTER INSERT OR UPDATE ON public.announcements FOR EACH ROW EXECUTE FUNCTION gdg_security.broadcast_chapter_announcement();
REVOKE ALL ON FUNCTION gdg_security.broadcast_chapter_announcement() FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION gdg_security.broadcast_chapter_announcement() TO service_role;
COMMIT;
