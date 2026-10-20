BEGIN;
CREATE OR REPLACE FUNCTION public.begin_scheduled_job(p_name text,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE cadence integer;occurrence_id bigint;attempt_id integer;r public.scheduled_job_runs;
BEGIN
 cadence:=CASE p_name WHEN 'form-schedules' THEN 300 WHEN 'form-cleanup' THEN 3600 WHEN 'delivery' THEN 60 WHEN 'task-overdue' THEN 900 ELSE NULL END;
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
COMMIT;

