BEGIN;
-- New targeted notifications only. Existing history is never replayed as email.
CREATE FUNCTION gdg_security.workspace_email_created() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NEW.delivery_key LIKE 'task:%' OR NEW.delivery_key LIKE 'team-announcement:%' THEN
  INSERT INTO public.delivery_jobs(kind,deduplication_key,payload) VALUES('workspace_notice_email','workspace-notice:'||NEW.id,jsonb_build_object('notificationId',NEW.id)) ON CONFLICT DO NOTHING;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER workspace_email_created AFTER INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION gdg_security.workspace_email_created();

CREATE FUNCTION public.prepare_workspace_notice_email(p_job uuid,p_lease uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.delivery_jobs;n public.notifications;u public.admin_users;t public.communication_tasks;a public.team_announcements;kind text;destination text;
BEGIN
 SELECT * INTO j FROM public.delivery_jobs d WHERE d.id=p_job AND d.kind='workspace_notice_email' AND d.state='running' AND d.lease_token=p_lease AND d.locked_until>now() AND d.created_at>now()-interval '24 hours' FOR SHARE;
 IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT * INTO n FROM public.notifications WHERE id=(j.payload->>'notificationId')::uuid FOR SHARE;
 IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT * INTO u FROM public.admin_users WHERE id=n.user_id AND is_active AND NOT must_change_password AND deleted_at IS NULL AND (locked_until IS NULL OR locked_until<=now()) FOR SHARE;
 IF NOT FOUND THEN RETURN NULL;END IF;
 IF n.delivery_key LIKE 'task:%' THEN
  kind:=split_part(n.delivery_key,':',2);
  SELECT * INTO t FROM public.communication_tasks WHERE id=split_part(n.delivery_key,':',3)::uuid FOR SHARE;
  IF NOT FOUND OR t.archived_at IS NOT NULL OR t.status='completed' OR t.assigned_to_id IS DISTINCT FROM u.id OR NOT public.can_operate_task(u.id,t.id,'read') THEN RETURN NULL;END IF;
  IF kind='assignment' THEN
   IF t.assignment_occurrence::text<>split_part(n.delivery_key,':',4) THEN RETURN NULL;END IF;
  ELSIF kind IN('due','overdue') THEN
   IF t.deadline_occurrence::text<>split_part(n.delivery_key,':',4) OR t.due_date IS NULL THEN RETURN NULL;END IF;
   IF kind='overdue' AND(t.status<>'overdue' OR t.due_date>=(now() AT TIME ZONE 'UTC')::date) THEN RETURN NULL;END IF;
   IF kind='due' AND(t.due_date<(now() AT TIME ZONE 'UTC')::date OR t.due_date>(now() AT TIME ZONE 'UTC')::date+1) THEN RETURN NULL;END IF;
  ELSE RETURN NULL;END IF;
  destination:='/admin/communications?tab=tasks&task='||t.id;
  RETURN jsonb_build_object('email',u.email,'kind',kind,'link',destination,'dueDate',t.due_date);
 ELSIF n.delivery_key LIKE 'team-announcement:%' THEN
  SELECT * INTO a FROM public.team_announcements WHERE id=split_part(n.delivery_key,':',2)::uuid FOR SHARE;
  IF NOT FOUND OR NOT a.is_active OR NOT a.is_published OR a.deleted_at IS NOT NULL OR a.publication_version::text<>split_part(n.delivery_key,':',3) OR a.scheduled_for>now() OR a.expires_at<=now()
   OR NOT public.can_read_team_announcement(u.id,a.id) THEN RETURN NULL;END IF;
  RETURN jsonb_build_object('email',u.email,'kind','team_announcement','link','/admin/team/'||a.team_id||'?section=announcements');
 END IF;
 RETURN NULL;
END $$;

-- Reuse the existing 15-minute deadline job; no extra scheduler or recurring cost.
ALTER FUNCTION public.advance_overdue_tasks() SET SCHEMA gdg_security;
CREATE FUNCTION public.advance_overdue_tasks() RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;notified integer;
BEGIN
 result:=gdg_security.advance_overdue_tasks();
 INSERT INTO public.notifications(user_id,type,title,message,link,delivery_key)
 SELECT t.assigned_to_id,'system','Task due soon','An assigned task is due soon. Review its deadline in your workspace.',
 '/admin/communications?tab=tasks&task='||t.id,'task:due:'||t.id||':'||t.deadline_occurrence||':'||t.assigned_to_id
 FROM public.communication_tasks t WHERE t.archived_at IS NULL AND t.status<>'completed' AND t.assigned_to_id IS NOT NULL
 AND t.due_date BETWEEN (now() AT TIME ZONE 'UTC')::date AND (now() AT TIME ZONE 'UTC')::date+1
 AND public.can_operate_task(t.assigned_to_id,t.id,'read') ORDER BY t.due_date,t.id LIMIT 1000
 ON CONFLICT(delivery_key) DO NOTHING;
 GET DIAGNOSTICS notified=ROW_COUNT;
 RETURN result||jsonb_build_object('dueSoonNotified',notified);
END $$;
CREATE OR REPLACE FUNCTION public.claim_delivery_jobs(p_limit integer) RETURNS SETOF public.delivery_jobs LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT * FROM public.claim_worker_jobs(p_limit,ARRAY['event_confirmation','event_message','event_push_verification','newsletter_confirmation','contact_acknowledgment','contact_notification',
 'form_access','form_response_notification','form_reviewed_email','form_respondent_copy','account_access','team_invite','team_announcement','task_notification','direct_message_notice','chapter_announcement','reward_credential_email','workspace_notice_email']);
$$;
REVOKE ALL ON FUNCTION gdg_security.workspace_email_created(),public.prepare_workspace_notice_email(uuid,uuid),public.advance_overdue_tasks() FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION gdg_security.workspace_email_created(),public.prepare_workspace_notice_email(uuid,uuid),public.advance_overdue_tasks(),gdg_security.advance_overdue_tasks() TO service_role;
COMMIT;
