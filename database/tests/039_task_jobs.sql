BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES
 ('de000000-0000-4000-8000-000000000001','task-job-admin@example.test','fixture-admin','admin',true),
 ('de000000-0000-4000-8000-000000000002','task-job-assignee@example.test','fixture-member','team_member',true);
DO $$ DECLARE t uuid;j uuid;lease uuid;r jsonb;counted integer;BEGIN
 INSERT INTO public.communication_tasks(title,description,assigned_by_id,assigned_to_id,due_date,status,priority) VALUES('Private fictional deadline','Never put this body in notification',
  'de000000-0000-4000-8000-000000000001','de000000-0000-4000-8000-000000000002',(now() AT TIME ZONE 'UTC')::date-1,'pending','high') RETURNING id INTO t;
 r:=public.advance_overdue_tasks();
 IF (r->>'marked')::integer<>1 OR (r->>'notified')::integer<>1 OR NOT EXISTS(SELECT 1 FROM public.communication_tasks WHERE id=t AND status='overdue') THEN RAISE EXCEPTION 'Overdue job did not advance task once';END IF;
 r:=public.advance_overdue_tasks();IF (r->>'marked')::integer<>0 OR (r->>'notified')::integer<>0 THEN RAISE EXCEPTION 'Overdue occurrence repeated';END IF;
 UPDATE public.delivery_jobs SET state='running',lease_token=gen_random_uuid(),locked_until=now()+interval '1 minute' WHERE kind='task_notification' AND payload->>'taskId'=t::text RETURNING id,lease_token INTO j,lease;
 IF public.deliver_task_notification(j,gen_random_uuid())<>0 THEN RAISE EXCEPTION 'Wrong worker lease accepted';END IF;
 counted:=public.deliver_task_notification(j,lease);IF counted<>1 OR public.deliver_task_notification(j,lease)<>0 THEN RAISE EXCEPTION 'Notification delivery is not idempotent';END IF;
 IF EXISTS(SELECT 1 FROM public.notifications WHERE delivery_key LIKE 'task:%' AND(message LIKE '%Never put%' OR title LIKE '%Private fictional%')) THEN RAISE EXCEPTION 'Task content leaked into notification';END IF;
 UPDATE public.communication_tasks SET status='pending' WHERE id=t;
 r:=public.advance_overdue_tasks();IF (r->>'marked')::integer<>1 OR (r->>'notified')::integer<>0 THEN RAISE EXCEPTION 'Reopen resent same deadline notice';END IF;
 UPDATE public.communication_tasks SET due_date=due_date-1,deadline_occurrence=gen_random_uuid() WHERE id=t;
 r:=public.advance_overdue_tasks();IF (r->>'notified')::integer<>1 THEN RAISE EXCEPTION 'Changed deadline did not get a distinct occurrence';END IF;
 SELECT id INTO j FROM public.delivery_jobs WHERE kind='task_notification' AND payload->>'taskId'=t::text AND state<>'running';
 UPDATE public.delivery_jobs SET state='running',lease_token=gen_random_uuid(),locked_until=now()+interval '1 minute' WHERE id=j RETURNING lease_token INTO lease;
 UPDATE public.communication_tasks SET status='completed' WHERE id=t;
 IF public.deliver_task_notification(j,lease)<>0 THEN RAISE EXCEPTION 'Completed task received stale overdue notice';END IF;
 UPDATE public.communication_tasks SET status='pending',deadline_occurrence=gen_random_uuid(),archived_at=now() WHERE id=t;
 r:=public.advance_overdue_tasks();IF (r->>'marked')::integer<>0 THEN RAISE EXCEPTION 'Archived task marked overdue';END IF;
 r:=public.begin_scheduled_job('task-overdue',gen_random_uuid());IF r->>'runId' IS NULL THEN RAISE EXCEPTION 'Task scheduler cadence unavailable';END IF;
 IF public.begin_scheduled_job('task-overdue',gen_random_uuid())->>'skipped'<>'busy' THEN RAISE EXCEPTION 'Task job duplicate lease accepted';END IF;
END $$;
ROLLBACK;
