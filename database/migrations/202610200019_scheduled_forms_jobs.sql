BEGIN;
CREATE TABLE public.scheduled_job_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),job_name text NOT NULL,occurrence bigint NOT NULL,attempt integer NOT NULL,
 state text NOT NULL DEFAULT 'running' CHECK(state IN ('running','completed','failed')),lease_token uuid NOT NULL DEFAULT gen_random_uuid(),
 locked_until timestamptz NOT NULL DEFAULT now()+interval '5 minutes',request_id uuid NOT NULL,
 counts jsonb NOT NULL DEFAULT '{}',error_code text,started_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,
 UNIQUE(job_name,occurrence,attempt)
);
CREATE INDEX scheduled_jobs_recent ON public.scheduled_job_runs(job_name,started_at DESC);
ALTER TABLE public.scheduled_job_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scheduled_job_runs FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.scheduled_job_runs TO service_role;
CREATE FUNCTION public.begin_scheduled_job(p_name text,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE cadence integer;occurrence_id bigint;attempt_id integer;r public.scheduled_job_runs;
BEGIN
 cadence:=CASE p_name WHEN 'form-schedules' THEN 300 WHEN 'form-cleanup' THEN 3600 WHEN 'delivery' THEN 60 ELSE NULL END;
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
CREATE FUNCTION public.finish_scheduled_job(p_id uuid,p_lease uuid,p_success boolean,p_counts jsonb,p_error text) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF pg_column_size(p_counts)>4096 OR EXISTS(SELECT 1 FROM jsonb_each(p_counts) e WHERE jsonb_typeof(e.value)<>'number') THEN RAISE EXCEPTION 'Invalid counters' USING ERRCODE='22023';END IF;
 UPDATE public.scheduled_job_runs SET state=CASE WHEN p_success THEN 'completed' ELSE 'failed' END,counts=p_counts,
  error_code=CASE WHEN p_success THEN NULL ELSE p_error END,completed_at=now()
 WHERE id=p_id AND lease_token=p_lease AND state='running' AND locked_until>now();
 RETURN FOUND;
END $$;
CREATE FUNCTION public.advance_form_schedules() RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE f public.forms;opened integer:=0;closed integer:=0;target text;
BEGIN
 FOR f IN SELECT * FROM public.forms WHERE (state='Scheduled' AND opens_at<=now()) OR (state IN ('Open','Scheduled') AND closes_at<=now())
  ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1000 LOOP
  target:=CASE WHEN f.closes_at<=now() THEN 'Closed' ELSE 'Open' END;
  UPDATE public.forms SET state=target,revision=revision+1,updated_at=now() WHERE id=f.id;
  IF target='Open' THEN opened:=opened+1;ELSE closed:=closed+1;END IF;
  INSERT INTO public.admin_actions(action,target_type,target_id,metadata) VALUES('forms.schedule_advanced','form',f.id,jsonb_build_object('from',f.state,'to',target));
 END LOOP;
 RETURN jsonb_build_object('opened',opened,'closed',closed);
END $$;
CREATE FUNCTION public.expire_form_drafts(p_limit integer) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE selected uuid[];deleted integer;
BEGIN
 IF p_limit NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Invalid batch' USING ERRCODE='22023';END IF;
 SELECT array_agg(id) INTO selected FROM (SELECT id FROM public.form_response_drafts WHERE expires_at<=now()
  ORDER BY expires_at,id FOR UPDATE SKIP LOCKED LIMIT p_limit) candidates;
 UPDATE public.form_uploads SET draft_id=NULL WHERE draft_id=ANY(selected);
 DELETE FROM public.form_response_drafts WHERE id=ANY(selected);
 GET DIAGNOSTICS deleted=ROW_COUNT;RETURN deleted;
END $$;
REVOKE ALL ON FUNCTION public.begin_scheduled_job(text,uuid),public.finish_scheduled_job(uuid,uuid,boolean,jsonb,text),
 public.advance_form_schedules(),public.expire_form_drafts(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_scheduled_job(text,uuid),public.finish_scheduled_job(uuid,uuid,boolean,jsonb,text),
 public.advance_form_schedules(),public.expire_form_drafts(integer) TO service_role;
COMMIT;
