BEGIN;
CREATE TABLE gdg_security.operational_metrics(
 minute timestamptz NOT NULL,metric text NOT NULL CHECK(metric IN('requests','server_failures','auth_failures','event_conflicts','database_failures','database_slow','storage_failures','form_rejections','form_limits','scan_failures','export_failures','email_rejections','push_failures','csp_violations')),
 count bigint NOT NULL CHECK(count>=0),PRIMARY KEY(minute,metric));
CREATE TABLE gdg_security.operational_alerts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code text NOT NULL,window_start timestamptz NOT NULL,
 count bigint NOT NULL CHECK(count>=0),threshold integer NOT NULL CHECK(threshold>0),
 first_seen_at timestamptz NOT NULL DEFAULT now(),last_seen_at timestamptz NOT NULL DEFAULT now(),resolved_at timestamptz,
 UNIQUE(code,window_start));
CREATE TABLE gdg_security.operational_monitor_state(id boolean PRIMARY KEY DEFAULT true CHECK(id),installed_at timestamptz NOT NULL DEFAULT now(),last_evaluated_at timestamptz);
INSERT INTO gdg_security.operational_monitor_state(id) VALUES(true);
ALTER TABLE gdg_security.operational_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE gdg_security.operational_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE gdg_security.operational_monitor_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON gdg_security.operational_metrics,gdg_security.operational_alerts,gdg_security.operational_monitor_state FROM PUBLIC,anon,authenticated,gdg_realtime,service_role;
GRANT SELECT ON gdg_security.operational_metrics,gdg_security.operational_alerts,gdg_security.operational_monitor_state TO service_role;

CREATE FUNCTION public.record_operational_metrics(p_counts jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item record;BEGIN
 IF p_counts IS NULL OR jsonb_typeof(p_counts)<>'object' OR pg_column_size(p_counts)>2048 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 FOR item IN SELECT key,value FROM jsonb_each(p_counts) ORDER BY key LOOP
  IF item.key NOT IN('requests','server_failures','auth_failures','event_conflicts','database_failures','database_slow','storage_failures','form_rejections','form_limits','scan_failures','export_failures','email_rejections','push_failures','csp_violations')
   OR jsonb_typeof(item.value)<>'number' OR item.value::text!~'^[0-9]{1,4}$' OR(item.value::text)::integer>1000 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
  INSERT INTO gdg_security.operational_metrics(minute,metric,count) VALUES(date_trunc('minute',now()),item.key,(item.value::text)::integer)
   ON CONFLICT(minute,metric) DO UPDATE SET count=gdg_security.operational_metrics.count+excluded.count;
 END LOOP;RETURN true;
END $$;
CREATE FUNCTION gdg_security.observe_worker_failure() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE metric text;BEGIN
 IF TG_TABLE_NAME='upload_intents' THEN
  IF NEW.state='rejected' AND OLD.state IS DISTINCT FROM NEW.state THEN metric:='scan_failures';END IF;
 ELSIF TG_TABLE_NAME='form_export_jobs' THEN
  IF NEW.state='failed' AND OLD.state IS DISTINCT FROM NEW.state THEN metric:='export_failures';END IF;
 ELSIF TG_TABLE_NAME='push_delivery_log' THEN
  IF NEW.state='failed' AND OLD.state IS DISTINCT FROM NEW.state THEN metric:='push_failures';END IF;
 ELSIF TG_TABLE_NAME='newsletter_campaign_recipients' THEN
  IF(NEW.state='failed' AND OLD.state IS DISTINCT FROM NEW.state) OR(NEW.provider_state IN('email.bounced','email.complained','email.failed','email.suppressed') AND coalesce(OLD.provider_state,'') NOT IN('email.bounced','email.complained','email.failed','email.suppressed')) THEN metric:='email_rejections';END IF;
 ELSIF TG_TABLE_NAME='delivery_jobs' THEN
  IF NEW.state='dead' AND OLD.state IS DISTINCT FROM NEW.state AND NEW.kind<>'newsletter_campaign'
   AND NEW.last_error_code IN('PROVIDER_RETRY','DELIVERY_RETRY','NEWSLETTER_DELIVERY_RETRY','NEWSLETTER_DELIVERY_REJECTED') THEN metric:='email_rejections';END IF;
 END IF;
 IF metric IS NOT NULL THEN PERFORM public.record_operational_metrics(jsonb_build_object(metric,1));END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER observe_scan_failure AFTER UPDATE OF state ON public.upload_intents FOR EACH ROW EXECUTE FUNCTION gdg_security.observe_worker_failure();
CREATE TRIGGER observe_export_failure AFTER UPDATE OF state ON public.form_export_jobs FOR EACH ROW EXECUTE FUNCTION gdg_security.observe_worker_failure();
CREATE TRIGGER observe_push_failure AFTER UPDATE OF state ON public.push_delivery_log FOR EACH ROW EXECUTE FUNCTION gdg_security.observe_worker_failure();
CREATE TRIGGER observe_newsletter_failure AFTER UPDATE OF state,provider_state ON public.newsletter_campaign_recipients FOR EACH ROW EXECUTE FUNCTION gdg_security.observe_worker_failure();
CREATE TRIGGER observe_email_failure AFTER UPDATE OF state ON public.delivery_jobs FOR EACH ROW EXECUTE FUNCTION gdg_security.observe_worker_failure();

CREATE FUNCTION gdg_security.job_cadence(p_name text) RETURNS integer LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE p_name WHEN 'form-schedules' THEN 300 WHEN 'form-cleanup' THEN 3600 WHEN 'delivery' THEN 60 WHEN 'task-overdue' THEN 900 WHEN 'announcements' THEN 300 WHEN 'newsletter-campaigns' THEN 300 WHEN 'event-push' THEN 300
  WHEN 'session-cleanup' THEN 86400 WHEN 'notification-cleanup' THEN 86400 WHEN 'report-cache-cleanup' THEN 86400 WHEN 'operations-monitor' THEN 300 ELSE NULL END;
$$;
CREATE OR REPLACE FUNCTION public.begin_scheduled_job(p_name text,p_request uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE cadence integer;occurrence_id bigint;attempt_id integer;r public.scheduled_job_runs;BEGIN
 cadence:=gdg_security.job_cadence(p_name);IF cadence IS NULL THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('scheduled-job:'||p_name,0));occurrence_id:=floor(extract(epoch FROM now())/cadence)::bigint;
 IF EXISTS(SELECT 1 FROM public.scheduled_job_runs WHERE job_name=p_name AND state='running' AND locked_until>now()) THEN RETURN jsonb_build_object('skipped','busy');END IF;
 IF EXISTS(SELECT 1 FROM public.scheduled_job_runs WHERE job_name=p_name AND occurrence=occurrence_id AND state='completed') THEN RETURN jsonb_build_object('skipped','already_completed');END IF;
 UPDATE public.scheduled_job_runs SET state='failed',error_code='LEASE_EXPIRED',completed_at=now() WHERE job_name=p_name AND state='running' AND locked_until<=now();
 SELECT coalesce(max(attempt),0)+1 INTO attempt_id FROM public.scheduled_job_runs WHERE job_name=p_name AND occurrence=occurrence_id;
 IF attempt_id>8 THEN RETURN jsonb_build_object('skipped','attempts_exhausted');END IF;
 INSERT INTO public.scheduled_job_runs(job_name,occurrence,attempt,request_id) VALUES(p_name,occurrence_id,attempt_id,p_request) RETURNING * INTO r;
 RETURN jsonb_build_object('runId',r.id,'lease',r.lease_token,'lockedUntil',r.locked_until);
END $$;
CREATE FUNCTION public.evaluate_operational_alerts(p_run uuid,p_lease uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE installed timestamptz;window_begin timestamptz:=date_trunc('hour',now());item record;observed bigint;raised integer:=0;resolved integer:=0;metrics_deleted integer;alerts_deleted integer;run_deleted integer;
BEGIN
 PERFORM 1 FROM public.scheduled_job_runs WHERE id=p_run AND lease_token=p_lease AND job_name='operations-monitor' AND state='running' AND locked_until>now() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'JOB_LEASE_LOST';END IF;
 SELECT installed_at INTO installed FROM gdg_security.operational_monitor_state WHERE id FOR UPDATE;
 FOR item IN SELECT * FROM(VALUES
  ('auth_failures',20),('server_failures',5),('email_rejections',5),('jobs_missed',1),('jobs_duplicated',1),('event_conflicts',10),
  ('database_failures',3),('database_slow',5),('storage_failures',5),('form_rejections',10),('form_limits',5),('scan_failures',3),('export_failures',3),('push_failures',5),('csp_violations',10)) thresholds(code,threshold) LOOP
  IF item.code='jobs_missed' THEN
   SELECT count(*) INTO observed FROM unnest(ARRAY['form-schedules','form-cleanup','delivery','task-overdue','announcements','newsletter-campaigns','event-push','session-cleanup','notification-cleanup','report-cache-cleanup']) jobs(name)
    WHERE now()>installed+make_interval(secs=>2*gdg_security.job_cadence(name)) AND NOT EXISTS(SELECT 1 FROM public.scheduled_job_runs j WHERE j.job_name=name
     AND((j.state='completed' AND j.completed_at>now()-make_interval(secs=>2*gdg_security.job_cadence(name))) OR(j.state='running' AND j.locked_until>now())));
  ELSIF item.code='jobs_duplicated' THEN
   SELECT count(*) INTO observed FROM(SELECT job_name,occurrence FROM public.scheduled_job_runs WHERE state='completed' AND completed_at>=now()-interval '15 minutes' GROUP BY job_name,occurrence HAVING count(*)>1) duplicates;
  ELSE SELECT coalesce(sum(count),0) INTO observed FROM gdg_security.operational_metrics WHERE metric=item.code AND minute>=date_trunc('minute',now())-interval '14 minutes';
  END IF;
  IF observed>=item.threshold THEN
   INSERT INTO gdg_security.operational_alerts(code,window_start,count,threshold) VALUES(item.code,window_begin,observed,item.threshold)
    ON CONFLICT(code,window_start) DO UPDATE SET count=excluded.count,last_seen_at=now(),resolved_at=NULL;
   raised:=raised+1;
  ELSE
   UPDATE gdg_security.operational_alerts SET resolved_at=now() WHERE code=item.code AND resolved_at IS NULL;GET DIAGNOSTICS observed=ROW_COUNT;resolved:=resolved+observed;
  END IF;
 END LOOP;
 UPDATE gdg_security.operational_monitor_state SET last_evaluated_at=now() WHERE id;
 DELETE FROM gdg_security.operational_metrics WHERE minute<now()-interval '24 hours';GET DIAGNOSTICS metrics_deleted=ROW_COUNT;
 DELETE FROM gdg_security.operational_alerts WHERE resolved_at<now()-interval '1 year';GET DIAGNOSTICS alerts_deleted=ROW_COUNT;
 DELETE FROM public.scheduled_job_runs WHERE id IN(SELECT id FROM public.scheduled_job_runs WHERE state<>'running' AND completed_at<now()-interval '90 days' ORDER BY completed_at,id LIMIT 1000);GET DIAGNOSTICS run_deleted=ROW_COUNT;
 RETURN jsonb_build_object('conditionsAboveThreshold',raised,'alertsResolved',resolved,'metricBucketsExpired',metrics_deleted,'alertsExpired',alerts_deleted,'jobHistoryExpired',run_deleted);
END $$;
CREATE FUNCTION public.read_operational_status(p_actor uuid,p_session uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;BEGIN
 IF NOT gdg_security.member_transfer_session(p_actor,p_session) OR NOT EXISTS(SELECT 1 FROM public.admin_users WHERE id=p_actor AND role='super_admin') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT jsonb_build_object('checkedAt',now(),'lastEvaluatedAt',last_evaluated_at,'installedAt',installed_at,
  'alerts',coalesce((SELECT jsonb_agg(to_jsonb(a)) FROM(SELECT id,code,count,threshold,first_seen_at,last_seen_at,resolved_at FROM gdg_security.operational_alerts ORDER BY(resolved_at IS NULL) DESC,last_seen_at DESC LIMIT 50)a),'[]'),
  'jobs',coalesce((SELECT jsonb_agg(to_jsonb(j)) FROM(SELECT DISTINCT ON(job_name) job_name,state,started_at,completed_at,error_code,counts FROM public.scheduled_job_runs ORDER BY job_name,started_at DESC,id DESC)j),'[]'),
  'rateAggregates',coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM(SELECT day,scope,attempts FROM gdg_security.auth_rate_daily ORDER BY day DESC,scope LIMIT 360)r),'[]')) INTO result
 FROM gdg_security.operational_monitor_state WHERE id;RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.record_operational_metrics(jsonb),gdg_security.observe_worker_failure(),gdg_security.job_cadence(text),public.evaluate_operational_alerts(uuid,uuid),public.read_operational_status(uuid,uuid) FROM PUBLIC,anon,authenticated,gdg_realtime,service_role;
GRANT EXECUTE ON FUNCTION public.record_operational_metrics(jsonb),gdg_security.job_cadence(text),public.evaluate_operational_alerts(uuid,uuid),public.read_operational_status(uuid,uuid) TO service_role;
COMMIT;
