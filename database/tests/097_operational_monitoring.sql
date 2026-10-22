BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES
 ('f9700000-0000-4000-8000-000000000001','monitor-root@example.test','fixture-password','super_admin',true),
 ('f9700000-0000-4000-8000-000000000002','monitor-admin@example.test','fixture-password','admin',true);
INSERT INTO public.admin_sessions(id,admin_user_id,token_hash) VALUES
 ('f9700000-0000-4000-8000-000000000003','f9700000-0000-4000-8000-000000000001',repeat('1',64)),
 ('f9700000-0000-4000-8000-000000000004','f9700000-0000-4000-8000-000000000002',repeat('2',64));
DO $$ DECLARE run jsonb;result jsonb;counted integer;value jsonb;job uuid;before_count bigint;name text;BEGIN
 IF has_table_privilege('service_role','gdg_security.operational_metrics','INSERT') OR has_table_privilege('authenticated','gdg_security.operational_alerts','SELECT')
  OR has_function_privilege('anon','public.record_operational_metrics(jsonb)','EXECUTE') OR has_function_privilege('authenticated','public.read_operational_status(uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'OPS-TEST-002: monitoring privileges exposed';END IF;
 FOR value IN SELECT v FROM(VALUES('[]'::jsonb),('{"email":"private@example.test"}'::jsonb),('{"requests":1001}'::jsonb),('{"requests":-1}'::jsonb),('{"requests":1.5}'::jsonb),('{"requests":"1"}'::jsonb)) rejected(v) LOOP
  BEGIN PERFORM public.record_operational_metrics(value);RAISE EXCEPTION 'Unsafe/unbounded metrics accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'VALIDATION_ERROR' THEN RAISE;END IF;END;
 END LOOP;
 BEGIN PERFORM public.read_operational_status('f9700000-0000-4000-8000-000000000002','f9700000-0000-4000-8000-000000000004');RAISE EXCEPTION 'Ordinary Admin read monitoring';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 BEGIN PERFORM public.read_operational_status('f9700000-0000-4000-8000-000000000001','f9700000-0000-4000-8000-000000000004');RAISE EXCEPTION 'Foreign session read monitoring';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 DELETE FROM gdg_security.operational_metrics;
 SELECT coalesce(sum(count),0) INTO before_count FROM gdg_security.operational_metrics WHERE metric='email_rejections';
 INSERT INTO public.delivery_jobs(kind,deduplication_key) VALUES('event_confirmation','monitor-fixture') RETURNING id INTO job;
 UPDATE public.delivery_jobs SET state='dead',last_error_code='PERSON_PRIVACY' WHERE id=job;
 IF(SELECT coalesce(sum(count),0) FROM gdg_security.operational_metrics WHERE metric='email_rejections')<>before_count THEN RAISE EXCEPTION 'Privacy cancellation misreported as provider failure';END IF;
 UPDATE public.delivery_jobs SET state='pending' WHERE id=job;
 UPDATE public.delivery_jobs SET state='dead',last_error_code='PROVIDER_RETRY' WHERE id=job;
 UPDATE public.delivery_jobs SET state='dead',last_error_code='PROVIDER_RETRY' WHERE id=job;
 IF(SELECT coalesce(sum(count),0) FROM gdg_security.operational_metrics WHERE metric='email_rejections')<>before_count+1 THEN RAISE EXCEPTION 'Provider failure missing or counted twice';END IF;
 DELETE FROM gdg_security.operational_metrics;
 PERFORM public.record_operational_metrics('{"requests":100,"server_failures":5,"auth_failures":20,"event_conflicts":10,"database_failures":3,"database_slow":5,"storage_failures":5,"form_rejections":10,"form_limits":5,"scan_failures":3,"export_failures":3,"email_rejections":5,"push_failures":5,"csp_violations":10}');
 run:=public.begin_scheduled_job('operations-monitor',gen_random_uuid());
 BEGIN PERFORM public.evaluate_operational_alerts((run->>'runId')::uuid,gen_random_uuid());RAISE EXCEPTION 'Forged monitor lease accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'JOB_LEASE_LOST' THEN RAISE;END IF;END;
 result:=public.evaluate_operational_alerts((run->>'runId')::uuid,(run->>'lease')::uuid);
 IF result->>'conditionsAboveThreshold'<>'13' THEN RAISE EXCEPTION 'OPS-TEST-003: required threshold alerts missing: %',result;END IF;
 PERFORM public.evaluate_operational_alerts((run->>'runId')::uuid,(run->>'lease')::uuid);
 IF(SELECT count(*) FROM gdg_security.operational_alerts WHERE resolved_at IS NULL)<>13 THEN RAISE EXCEPTION 'Monitor retry duplicated alert windows';END IF;
 result:=public.read_operational_status('f9700000-0000-4000-8000-000000000001','f9700000-0000-4000-8000-000000000003');
 IF jsonb_array_length(result->'alerts')<>13 OR result::text LIKE '%monitor-root@example.test%' OR result::text LIKE '%lease_token%' THEN RAISE EXCEPTION 'Monitor status disclosed identity/capabilities or lost alerts';END IF;
 UPDATE gdg_security.operational_monitor_state SET installed_at=now()-interval '3 days' WHERE id;
 PERFORM public.evaluate_operational_alerts((run->>'runId')::uuid,(run->>'lease')::uuid);
 IF NOT EXISTS(SELECT 1 FROM gdg_security.operational_alerts WHERE code='jobs_missed' AND resolved_at IS NULL) THEN RAISE EXCEPTION 'OPS-TEST-004: missed jobs not detected after cadence grace';END IF;
 INSERT INTO public.scheduled_job_runs(job_name,occurrence,attempt,request_id,state,completed_at) VALUES('form-schedules',-970,1,gen_random_uuid(),'completed',now()),('form-schedules',-970,2,gen_random_uuid(),'completed',now());
 PERFORM public.evaluate_operational_alerts((run->>'runId')::uuid,(run->>'lease')::uuid);
 IF NOT EXISTS(SELECT 1 FROM gdg_security.operational_alerts WHERE code='jobs_duplicated' AND resolved_at IS NULL) THEN RAISE EXCEPTION 'OPS-TEST-005: duplicate completed occurrences not detected';END IF;
 DELETE FROM public.scheduled_job_runs WHERE occurrence=-970;
 DELETE FROM gdg_security.operational_metrics;
 FOREACH name IN ARRAY ARRAY['form-schedules','form-cleanup','delivery','task-overdue','announcements','newsletter-campaigns','event-push','session-cleanup','notification-cleanup','report-cache-cleanup'] LOOP
  INSERT INTO public.scheduled_job_runs(job_name,occurrence,attempt,request_id,state,completed_at) VALUES(name,-971,1,gen_random_uuid(),'completed',now());
 END LOOP;
 PERFORM public.evaluate_operational_alerts((run->>'runId')::uuid,(run->>'lease')::uuid);
 IF EXISTS(SELECT 1 FROM gdg_security.operational_alerts WHERE resolved_at IS NULL) THEN RAISE EXCEPTION 'Healthy evaluation did not resolve old alert conditions';END IF;
END $$;
ROLLBACK;
