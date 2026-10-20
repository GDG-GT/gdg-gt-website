BEGIN;
CREATE FUNCTION public.advance_overdue_tasks() RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE t public.communication_tasks;marked integer:=0;notified integer:=0;BEGIN
 FOR t IN SELECT * FROM public.communication_tasks x WHERE x.archived_at IS NULL AND x.status<>'completed' AND x.due_date<(now() AT TIME ZONE 'UTC')::date
  AND(x.status<>'overdue' OR x.overdue_notified_occurrence IS DISTINCT FROM x.deadline_occurrence)
  AND(x.team_id IS NULL OR EXISTS(SELECT 1 FROM public.admin_teams WHERE id=x.team_id AND is_active AND deleted_at IS NULL))
  ORDER BY x.due_date,x.id FOR UPDATE SKIP LOCKED LIMIT 1000 LOOP
  UPDATE public.communication_tasks SET status='overdue',completed_at=NULL,overdue_notified_occurrence=deadline_occurrence,revision=revision+1,updated_at=clock_timestamp() WHERE id=t.id;
  marked:=marked+1;
  IF t.overdue_notified_occurrence IS DISTINCT FROM t.deadline_occurrence THEN PERFORM public.enqueue_task_notice(t.id,'overdue');notified:=notified+1;END IF;
  INSERT INTO public.admin_actions(action,target_type,target_id,metadata) VALUES('tasks.marked_overdue','task',t.id,jsonb_build_object('deadlineOccurrence',t.deadline_occurrence));
 END LOOP;
 RETURN jsonb_build_object('marked',marked,'notified',notified);
END $$;
CREATE FUNCTION public.deliver_task_notification(p_job uuid,p_lease uuid) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.delivery_jobs;t public.communication_tasks;recipient uuid;v_kind text;sent integer;BEGIN
 SELECT * INTO j FROM public.delivery_jobs WHERE id=p_job AND lease_token=p_lease AND state='running' AND kind='task_notification' AND locked_until>now() FOR UPDATE;
 IF NOT FOUND THEN RETURN 0;END IF;
 SELECT * INTO t FROM public.communication_tasks WHERE id=(j.payload->>'taskId')::uuid FOR SHARE;
 recipient:=(j.payload->>'recipientId')::uuid;v_kind:=j.payload->>'kind';
 IF NOT FOUND OR t.archived_at IS NOT NULL OR t.assigned_to_id IS DISTINCT FROM recipient OR recipient IS NULL OR v_kind IS NULL OR v_kind NOT IN ('assignment','overdue')
  OR NOT public.can_operate_task(recipient,t.id,'read') THEN RETURN 0;END IF;
 IF(v_kind='assignment' AND t.assignment_occurrence IS DISTINCT FROM(j.payload->>'occurrence')::uuid) OR(v_kind='overdue' AND
  (t.deadline_occurrence IS DISTINCT FROM(j.payload->>'occurrence')::uuid OR t.status<>'overdue' OR t.due_date IS NULL OR t.due_date>=(now() AT TIME ZONE 'UTC')::date)) THEN RETURN 0;END IF;
 INSERT INTO public.notifications(user_id,type,title,message,link,delivery_key) VALUES(recipient,'system',CASE v_kind WHEN 'assignment' THEN 'Task assigned' ELSE 'Task overdue' END,
  CASE v_kind WHEN 'assignment' THEN 'A task has been assigned to you. Review its details in your workspace.' ELSE 'An assigned task is overdue. Review its status and due date in your workspace.' END,
  '/admin/communications?tab=tasks&task='||t.id,'task:'||v_kind||':'||t.id||':'||(j.payload->>'occurrence')||':'||recipient)
  ON CONFLICT(delivery_key) DO NOTHING;
 GET DIAGNOSTICS sent=ROW_COUNT;RETURN sent;
END $$;
CREATE OR REPLACE FUNCTION public.claim_delivery_jobs(p_limit integer) RETURNS SETOF public.delivery_jobs LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT * FROM public.claim_worker_jobs(p_limit,ARRAY['event_confirmation','event_message','newsletter_confirmation','contact_acknowledgment','contact_notification',
 'form_access','form_response_notification','account_access','team_invite','team_announcement','task_notification']);
$$;
REVOKE ALL ON FUNCTION public.advance_overdue_tasks(),public.deliver_task_notification(uuid,uuid) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.advance_overdue_tasks(),public.deliver_task_notification(uuid,uuid) TO service_role;
COMMIT;
