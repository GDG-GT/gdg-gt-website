BEGIN;
DO $$ DECLARE r jsonb;next_run jsonb;BEGIN
 r:=public.begin_scheduled_job('form-schedules',gen_random_uuid());
 IF r->>'runId' IS NULL THEN RAISE EXCEPTION 'Job did not start';END IF;
 IF public.begin_scheduled_job('form-schedules',gen_random_uuid())->>'skipped'<>'busy' THEN RAISE EXCEPTION 'Concurrent scheduler lock failed';END IF;
 IF public.finish_scheduled_job((r->>'runId')::uuid,gen_random_uuid(),true,'{}',NULL) THEN RAISE EXCEPTION 'Stale scheduler lease accepted';END IF;
 IF NOT public.finish_scheduled_job((r->>'runId')::uuid,(r->>'lease')::uuid,false,'{"retried":1}','TEST_RETRY') THEN RAISE EXCEPTION 'Failure not recorded';END IF;
 next_run:=public.begin_scheduled_job('form-schedules',gen_random_uuid());
 IF next_run->>'runId' IS NULL OR next_run->>'runId'=r->>'runId' THEN RAISE EXCEPTION 'Failed occurrence cannot retry';END IF;
 IF NOT public.finish_scheduled_job((next_run->>'runId')::uuid,(next_run->>'lease')::uuid,true,'{"opened":0,"closed":0}',NULL) THEN RAISE EXCEPTION 'Success not recorded';END IF;
 IF public.begin_scheduled_job('form-schedules',gen_random_uuid())->>'skipped'<>'already_completed' THEN RAISE EXCEPTION 'Successful occurrence ran twice';END IF;
 IF has_table_privilege('anon','public.scheduled_job_runs','SELECT') OR has_function_privilege('authenticated','public.begin_scheduled_job(text,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Job privileges exposed';END IF;
END $$;
ROLLBACK;
