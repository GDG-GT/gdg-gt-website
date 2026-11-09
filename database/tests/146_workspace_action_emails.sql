BEGIN;
DO $$ DECLARE a uuid;u uuid;t uuid;j public.delivery_jobs;r jsonb;n uuid;BEGIN
 INSERT INTO public.admin_users(email,password_hash,role,is_active) VALUES('deadline-owner@example.test','fictional','admin',true) RETURNING id INTO a;
 INSERT INTO public.admin_users(email,password_hash,role,is_active) VALUES('deadline-assignee@example.test','fictional','team_member',true) RETURNING id INTO u;
 INSERT INTO public.communication_tasks(title,description,assigned_by_id,assigned_to_id,due_date,status,priority) VALUES('Fictional private deadline','Private content must stay in workspace',a,u,(now() AT TIME ZONE 'UTC')::date+1,'pending','high') RETURNING id INTO t;
 r:=public.advance_overdue_tasks();IF(r->>'dueSoonNotified')::integer<>1 THEN RAISE EXCEPTION 'Due-soon notice missing';END IF;
 r:=public.advance_overdue_tasks();IF(r->>'dueSoonNotified')::integer<>0 THEN RAISE EXCEPTION 'Due reminder duplicated';END IF;
 SELECT id INTO n FROM public.notifications WHERE delivery_key LIKE 'task:due:'||t||':%';
 SELECT * INTO j FROM public.delivery_jobs WHERE kind='workspace_notice_email' AND payload->>'notificationId'=n::text;
 IF j.id IS NULL OR j.payload::text LIKE '%Private content%' THEN RAISE EXCEPTION 'Targeted due email missing or private content leaked';END IF;
 UPDATE public.delivery_jobs SET state='running',lease_token=gen_random_uuid(),locked_until=now()+interval '5 minutes' WHERE id=j.id RETURNING * INTO j;
 IF public.prepare_workspace_notice_email(j.id,gen_random_uuid()) IS NOT NULL THEN RAISE EXCEPTION 'Wrong notice lease accepted';END IF;
 r:=public.prepare_workspace_notice_email(j.id,j.lease_token);IF r->>'email'<>'deadline-assignee@example.test' OR r->>'kind'<>'due' OR r::text LIKE '%Fictional private deadline%' THEN RAISE EXCEPTION 'Wrong recipient or leaked task content';END IF;
 UPDATE public.communication_tasks SET due_date=due_date+5,deadline_occurrence=gen_random_uuid() WHERE id=t;
 IF public.prepare_workspace_notice_email(j.id,j.lease_token) IS NOT NULL THEN RAISE EXCEPTION 'Rescheduled reminder remained active';END IF;
 UPDATE public.communication_tasks SET due_date=(now() AT TIME ZONE 'UTC')::date,status='completed' WHERE id=t;
 IF(public.advance_overdue_tasks()->>'dueSoonNotified')::integer<>0 THEN RAISE EXCEPTION 'Completed task reminded';END IF;
END $$;
DO $$ BEGIN
 IF has_function_privilege('anon','public.prepare_workspace_notice_email(uuid,uuid)','execute') OR has_function_privilege('authenticated','public.advance_overdue_tasks()','execute') THEN RAISE EXCEPTION 'Workspace email RPC permissions leaked';END IF;
END $$;
ROLLBACK;
