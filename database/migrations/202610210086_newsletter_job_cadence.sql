BEGIN;
CREATE OR REPLACE FUNCTION public.begin_scheduled_job(p_name text,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE cadence integer;occurrence_id bigint;attempt_id integer;r public.scheduled_job_runs;
BEGIN
 cadence:=CASE p_name WHEN 'form-schedules' THEN 300 WHEN 'form-cleanup' THEN 3600 WHEN 'delivery' THEN 60 WHEN 'task-overdue' THEN 900 WHEN 'announcements' THEN 300 WHEN 'newsletter-campaigns' THEN 300 ELSE NULL END;
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
-- Campaign links follow the campaign's scope and immutable approved content.
CREATE OR REPLACE FUNCTION gdg_security.form_integration_source(p_actor uuid,p_kind text,p_resource uuid,p_edit boolean) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.admin_users WHERE id=p_actor AND is_active AND deleted_at IS NULL AND NOT must_change_password AND(locked_until IS NULL OR locked_until<=now())) THEN RETURN false;END IF;
 IF p_kind='event' THEN RETURN EXISTS(SELECT 1 FROM public.events e WHERE e.id=p_resource
  AND(e.team_id IS NULL OR EXISTS(SELECT 1 FROM public.admin_teams WHERE id=e.team_id AND is_active AND deleted_at IS NULL))
  AND public.can_operate_event(p_actor,'read',e.team_id) AND(NOT p_edit OR public.can_operate_event(p_actor,'update',e.team_id)));
 ELSIF p_kind='team' THEN RETURN public.can_operate_team(p_actor,p_resource,CASE WHEN p_edit THEN 'manage' ELSE 'read' END);
 ELSIF p_kind='campaign' THEN RETURN EXISTS(SELECT 1 FROM public.newsletter_campaigns c WHERE c.id=p_resource
  AND public.can_operate_newsletter(p_actor,c.team_id,'read')
  AND(NOT p_edit OR(c.status='draft' AND c.deleted_at IS NULL AND public.can_operate_newsletter(p_actor,c.team_id,'update'))));
 END IF;RETURN false;
END $$;
COMMIT;
