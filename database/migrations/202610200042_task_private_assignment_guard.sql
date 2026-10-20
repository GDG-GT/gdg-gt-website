BEGIN;
CREATE OR REPLACE FUNCTION public.mutate_task(p_actor uuid,p_session uuid,p_verified_hash text,p_id uuid,p_action text,p_revision integer,p_document jsonb,
 p_key_hash text,p_request_hash text,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE u public.admin_users;t public.communication_tasks;target public.admin_users;k public.idempotency_keys;
 v_scope text;result jsonb;team uuid;required_action text;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('task:'||coalesce(p_id::text,p_actor::text),0));
 SELECT * INTO u FROM public.admin_users WHERE id=p_actor AND is_active AND NOT must_change_password AND deleted_at IS NULL FOR SHARE;
 PERFORM 1 FROM public.admin_sessions WHERE id=p_session AND admin_user_id=p_actor AND revoked_at IS NULL AND idle_expires_at>now() AND absolute_expires_at>now();
 IF u.id IS NULL OR NOT FOUND THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 IF p_action IS NULL OR p_action NOT IN ('create','update','assign','status','archive','restore') THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
 IF p_action='create' THEN
  team:=(p_document->>'teamId')::uuid;
  IF NOT public.can_operate_task(u.id,NULL,'create',team) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 ELSE
  SELECT * INTO t FROM public.communication_tasks WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_operate_task(u.id,t.id,'read') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  required_action:=CASE p_action WHEN 'archive' THEN 'delete' ELSE p_action END;
  IF NOT public.can_operate_task(u.id,t.id,required_action) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
  IF p_action='assign' AND (u.password_hash IS DISTINCT FROM p_verified_hash OR u.locked_until>now()) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
  team:=t.team_id;
 END IF;
 v_scope:='tasks.'||p_action||':'||u.id||':'||coalesce(p_id::text,'new');
 SELECT * INTO k FROM public.idempotency_keys WHERE scope=v_scope AND key_hash=p_key_hash;
 IF FOUND THEN IF k.request_hash<>p_request_hash THEN RAISE EXCEPTION 'CONFLICT';END IF;RETURN k.result;END IF;
 IF p_action IN ('create','assign') THEN
  IF u.role NOT IN ('super_admin','admin') AND team IS NULL AND coalesce(p_document->>'assigneeEmail',u.email) IS DISTINCT FROM u.email THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
  SELECT * INTO target FROM public.admin_users WHERE email=coalesce(p_document->>'assigneeEmail',u.email) AND is_active AND NOT must_change_password AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNT_NOT_READY';END IF;
  IF team IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.team_memberships WHERE team_id=team AND admin_user_id=target.id AND is_active) THEN RAISE EXCEPTION 'ACCOUNT_NOT_READY';END IF;
  IF u.role NOT IN ('super_admin','admin') AND team IS NULL AND target.id<>u.id THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 END IF;
 IF p_action='create' THEN
  INSERT INTO public.communication_tasks(title,description,assigned_to_id,assigned_by_id,due_date,priority,tags,team_id,status)
   VALUES(p_document->>'title',p_document->>'description',target.id,u.id,(p_document->>'dueDate')::date,p_document->>'priority',p_document->'tags',team,'pending') RETURNING * INTO t;
  PERFORM public.enqueue_task_notice(t.id,'assignment');
 ELSE
  IF t.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'CONFLICT';END IF;
  IF p_action='update' THEN
   UPDATE public.communication_tasks SET title=p_document->>'title',description=p_document->>'description',priority=p_document->>'priority',tags=p_document->'tags',
    due_date=(p_document->>'dueDate')::date,deadline_occurrence=CASE WHEN due_date IS DISTINCT FROM(p_document->>'dueDate')::date THEN gen_random_uuid() ELSE deadline_occurrence END,
    status=CASE WHEN status='overdue' AND ((p_document->>'dueDate') IS NULL OR(p_document->>'dueDate')::date>=(now() AT TIME ZONE 'UTC')::date) THEN 'pending' ELSE status END WHERE id=t.id;
  ELSIF p_action='assign' THEN
   IF target.id=t.assigned_to_id THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
   UPDATE public.communication_tasks SET assigned_to_id=target.id,assignment_occurrence=gen_random_uuid(),deadline_occurrence=gen_random_uuid() WHERE id=t.id;
   INSERT INTO public.task_comments(task_id,user_id,comment,comment_type,metadata) VALUES(t.id,u.id,'Task reassigned.','assignment_change',jsonb_build_object('from',t.assigned_to_id,'to',target.id));
  ELSIF p_action='status' THEN
   IF p_document->>'status' IS NULL OR p_document->>'status' NOT IN ('pending','in-progress','completed') THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
   IF p_document->>'status'=t.status THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
   UPDATE public.communication_tasks SET status=p_document->>'status',completed_at=CASE WHEN p_document->>'status'='completed' THEN now() ELSE NULL END WHERE id=t.id;
   INSERT INTO public.task_comments(task_id,user_id,comment,comment_type,metadata) VALUES(t.id,u.id,'Task status changed.','status_change',jsonb_build_object('from',t.status,'to',p_document->>'status'));
  ELSIF p_action='archive' THEN UPDATE public.communication_tasks SET archived_at=now() WHERE id=t.id;
  ELSIF p_action='restore' THEN
   IF t.archived_at IS NULL THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
   UPDATE public.communication_tasks SET archived_at=NULL WHERE id=t.id;
  END IF;
  UPDATE public.communication_tasks SET revision=revision+1,updated_at=clock_timestamp() WHERE id=t.id RETURNING * INTO t;
  IF p_action='assign' THEN PERFORM public.enqueue_task_notice(t.id,'assignment');END IF;
 END IF;
 result:=jsonb_build_object('id',t.id,'revision',t.revision);
 INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result) VALUES(v_scope,p_key_hash,p_request_hash,200,result);
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata) VALUES(u.id,'tasks.'||p_action,'task',t.id,p_request_id,jsonb_build_object('revision',t.revision));
 RETURN result;
END $$;
COMMIT;

