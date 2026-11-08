-- The Supabase-owned net schema must remain excluded from the Data API. Its
-- extension SQL grants are managed by Supabase; ordinary website users have no
-- direct SQL login. Do not expose net or Vault through PostgREST.
-- Install only in the hosted Supabase project after authenticated worker
-- acceptance. Requires pg_net, pg_cron and the existing encrypted Vault
-- gdg_gt_cron_secret. No bearer value is stored in source or cron commands.
BEGIN;
CREATE TABLE IF NOT EXISTS gdg_security.private_worker_dispatch (
 worker_group text PRIMARY KEY CHECK(worker_group IN('uploads','media','exports')),
 enabled boolean NOT NULL DEFAULT false,
 last_requested_at timestamptz,
 last_request_id bigint
);
REVOKE ALL ON TABLE gdg_security.private_worker_dispatch FROM PUBLIC,anon,authenticated,service_role,gdg_realtime;
INSERT INTO gdg_security.private_worker_dispatch(worker_group) VALUES('uploads'),('media'),('exports') ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION gdg_security.dispatch_private_worker(p_group text) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owned gdg_security.private_worker_dispatch;credential text;request_id bigint;is_due boolean;
BEGIN
 SELECT * INTO owned FROM gdg_security.private_worker_dispatch WHERE worker_group=p_group AND enabled FOR UPDATE SKIP LOCKED;
 IF NOT FOUND OR owned.last_requested_at>now()-interval '10 seconds' THEN RETURN NULL;END IF;
 IF p_group='exports' THEN
  SELECT EXISTS(SELECT 1 FROM public.form_export_jobs WHERE expires_at>now() AND
   ((state='pending' AND next_attempt_at<=now()) OR(state='running' AND locked_until<=now())))
   OR EXISTS(SELECT 1 FROM public.form_export_artifacts a JOIN public.form_export_jobs j ON j.id=a.job_id
    WHERE a.purged_at IS NULL AND (j.expires_at<=now() OR j.state IN('cancelled','expired','failed')
     OR(a.created_at<now()-interval '10 minutes' AND a.lease_token IS DISTINCT FROM j.lease_token))
    AND NOT(j.state='running' AND j.lease_token=a.lease_token AND j.locked_until>now())) INTO is_due;
 ELSE
  SELECT EXISTS(SELECT 1 FROM public.delivery_jobs WHERE
   kind=ANY(CASE WHEN p_group='media' THEN ARRAY['media_upload_scan','media_publish'] ELSE ARRAY['upload_scan','contact_upload_scan'] END)
   AND((state='pending' AND next_attempt_at<=now()) OR(state='running' AND locked_until<=now()))) INTO is_due;
 END IF;
 IF NOT is_due THEN RETURN NULL;END IF;
 SELECT decrypted_secret INTO credential FROM vault.decrypted_secrets WHERE name='gdg_gt_cron_secret';
 IF credential IS NULL OR length(credential)<32 THEN RETURN NULL;END IF;
 SELECT net.http_post(url:='https://gdggt.dev/api/worker',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||credential),
  body:=jsonb_build_object('group',p_group),timeout_milliseconds:=300000) INTO request_id;
 UPDATE gdg_security.private_worker_dispatch SET last_requested_at=now(),last_request_id=request_id WHERE worker_group=p_group;
 RETURN request_id;
END $$;
CREATE OR REPLACE FUNCTION gdg_security.dispatch_due_private_workers() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 PERFORM gdg_security.dispatch_private_worker('uploads');
 PERFORM gdg_security.dispatch_private_worker('media');
 PERFORM gdg_security.dispatch_private_worker('exports');
END $$;
CREATE OR REPLACE FUNCTION gdg_security.private_worker_wakeup() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF NEW.state<>'pending' THEN RETURN NEW;END IF;
 IF TG_TABLE_NAME='form_export_jobs' THEN PERFORM gdg_security.dispatch_private_worker('exports');
 ELSIF NEW.kind IN('upload_scan','contact_upload_scan') THEN PERFORM gdg_security.dispatch_private_worker('uploads');
 ELSIF NEW.kind IN('media_upload_scan','media_publish') THEN PERFORM gdg_security.dispatch_private_worker('media');END IF;
 RETURN NEW;
EXCEPTION WHEN OTHERS THEN
 -- A transient dispatch failure must not roll back a valid user submission.
 -- The minute-based database recovery checks the same durable queue again.
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION gdg_security.dispatch_private_worker(text),gdg_security.dispatch_due_private_workers(),gdg_security.private_worker_wakeup() FROM PUBLIC,anon,authenticated,service_role,gdg_realtime;
DROP TRIGGER IF EXISTS private_worker_wakeup ON public.delivery_jobs;
CREATE TRIGGER private_worker_wakeup AFTER INSERT ON public.delivery_jobs FOR EACH ROW EXECUTE FUNCTION gdg_security.private_worker_wakeup();
DROP TRIGGER IF EXISTS private_worker_wakeup ON public.form_export_jobs;
CREATE TRIGGER private_worker_wakeup AFTER INSERT ON public.form_export_jobs FOR EACH ROW EXECUTE FUNCTION gdg_security.private_worker_wakeup();
-- Activation and the single deduplicated cron entry are separate verified steps.
COMMIT;
