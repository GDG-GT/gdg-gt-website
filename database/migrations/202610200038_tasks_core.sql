BEGIN;
ALTER TABLE public.communication_tasks ADD COLUMN team_id uuid REFERENCES public.admin_teams(id),
 ADD COLUMN revision integer NOT NULL DEFAULT 1,ADD COLUMN archived_at timestamptz,ADD COLUMN completed_at timestamptz,
 ADD COLUMN assignment_occurrence uuid NOT NULL DEFAULT gen_random_uuid(),ADD COLUMN deadline_occurrence uuid NOT NULL DEFAULT gen_random_uuid(),
 ADD COLUMN overdue_notified_occurrence uuid;
ALTER TABLE public.task_comments ADD COLUMN revision integer NOT NULL DEFAULT 1,ADD COLUMN deleted_at timestamptz,
 ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX task_due_work ON public.communication_tasks(due_date,id) WHERE archived_at IS NULL AND status<>'completed';
CREATE INDEX task_comment_history ON public.task_comments(task_id,created_at DESC,id DESC);
CREATE FUNCTION public.task_team_action(p_actor uuid,p_team uuid,p_action text) RETURNS boolean
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.team_memberships m JOIN public.admin_teams t ON t.id=m.team_id AND t.is_active AND t.deleted_at IS NULL
  JOIN public.team_page_access a ON a.team_id=t.id AND a.page_path='/admin/communications' AND a.can_access
  JOIN public.team_permissions p ON p.team_id=t.id AND p.resource_type='communications' AND p.permission='crud'
  WHERE m.admin_user_id=p_actor AND m.team_id=p_team AND m.is_active AND CASE p_action
  WHEN 'read' THEN p.can_read WHEN 'create' THEN p.can_create WHEN 'update' THEN p.can_update WHEN 'delete' THEN p.can_delete ELSE false END);
$$;
CREATE FUNCTION public.can_operate_task(p_actor uuid,p_task uuid,p_action text,p_team uuid DEFAULT NULL) RETURNS boolean
 LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE u public.admin_users;t public.communication_tasks;BEGIN
 SELECT * INTO u FROM public.admin_users WHERE id=p_actor AND is_active AND NOT must_change_password AND deleted_at IS NULL;
 IF NOT FOUND OR p_action IS NULL OR p_action NOT IN ('read','create','update','assign','status','comment','delete','restore') THEN RETURN false;END IF;
 IF p_action='create' THEN
  IF p_team IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.admin_teams WHERE id=p_team AND is_active AND deleted_at IS NULL) THEN RETURN false;END IF;
  RETURN u.role IN ('super_admin','admin') OR (u.role='team_member' AND (p_team IS NULL OR public.task_team_action(u.id,p_team,'create')));
 END IF;
 SELECT * INTO t FROM public.communication_tasks WHERE id=p_task;
 IF NOT FOUND THEN RETURN false;END IF;
 IF u.role IN ('super_admin','admin') THEN
  RETURN p_action='read' OR ((p_action='restore' OR t.archived_at IS NULL) AND
   (t.team_id IS NULL OR EXISTS(SELECT 1 FROM public.admin_teams WHERE id=t.team_id AND is_active AND deleted_at IS NULL)));
 END IF;
 IF t.team_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.team_memberships m JOIN public.admin_teams x ON x.id=m.team_id AND x.is_active AND x.deleted_at IS NULL
  WHERE m.team_id=t.team_id AND m.admin_user_id=u.id AND m.is_active) THEN RETURN false;END IF;
 IF p_action='read' THEN RETURN coalesce(t.assigned_to_id=u.id,false) OR t.assigned_by_id=u.id OR (u.role='team_member' AND public.task_team_action(u.id,t.team_id,'read'));END IF;
 IF t.archived_at IS NOT NULL AND p_action<>'restore' THEN RETURN false;END IF;
 IF p_action IN ('status','comment') AND t.assigned_to_id=u.id THEN RETURN true;END IF;
 IF u.role<>'team_member' THEN RETURN false;END IF;
 IF t.team_id IS NULL THEN RETURN t.assigned_by_id=u.id AND p_action<>'assign';END IF;
 RETURN public.task_team_action(u.id,t.team_id,CASE p_action WHEN 'delete' THEN 'delete' WHEN 'restore' THEN 'delete' ELSE 'update' END);
END $$;
CREATE FUNCTION public.task_projection(p_actor uuid,p_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('id',t.id,'title',t.title,'description',t.description,'team_id',t.team_id,'assigned_to_id',t.assigned_to_id,'assigned_by_id',t.assigned_by_id,
  'assigneeName',(SELECT display_name FROM public.admin_users WHERE id=t.assigned_to_id),'creatorName',(SELECT display_name FROM public.admin_users WHERE id=t.assigned_by_id),
  'due_date',t.due_date,'status',t.status,'priority',t.priority,'tags',t.tags,'revision',t.revision,'created_at',t.created_at,'updated_at',t.updated_at,
  'archived_at',t.archived_at,'completed_at',t.completed_at,'commentCount',(SELECT count(*) FROM public.task_comments WHERE task_id=t.id AND comment_type='comment' AND deleted_at IS NULL),
  'actions',(SELECT coalesce(jsonb_agg(action),'[]') FROM unnest(ARRAY['read','update','assign','status','comment','delete','restore']) action WHERE public.can_operate_task(p_actor,t.id,action)))
 FROM public.communication_tasks t WHERE t.id=p_id AND public.can_operate_task(p_actor,t.id,'read');
$$;
CREATE FUNCTION public.list_tasks(p_actor uuid,p_page integer,p_query text,p_state text,p_priority text,p_scope text,p_archived boolean) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;BEGIN
 IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 10000 OR length(p_query)>100 OR p_state IS NULL OR p_state NOT IN ('all','pending','in-progress','completed','overdue')
  OR p_priority IS NULL OR p_priority NOT IN ('all','low','medium','high') OR p_scope IS NULL OR p_scope NOT IN ('all','assigned','created') OR p_archived IS NULL THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 WITH eligible AS(SELECT t.* FROM public.communication_tasks t WHERE public.can_operate_task(p_actor,t.id,'read') AND (t.archived_at IS NOT NULL)=p_archived
  AND (p_query IS NULL OR strpos(lower(t.title),lower(p_query))>0) AND(p_state='all' OR t.status=p_state) AND(p_priority='all' OR t.priority=p_priority)
  AND(p_scope='all' OR(p_scope='assigned' AND t.assigned_to_id=p_actor)OR(p_scope='created' AND t.assigned_by_id=p_actor))),
 page AS(SELECT * FROM eligible ORDER BY updated_at DESC,id DESC LIMIT 30 OFFSET(p_page-1)*30)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(public.task_projection(p_actor,id) ORDER BY updated_at DESC,id DESC) FROM page),'[]'),
  'total',(SELECT count(*) FROM eligible),'pageSize',30) INTO result;RETURN result;
END $$;
CREATE FUNCTION public.enqueue_task_notice(p_task uuid,p_kind text) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE t public.communication_tasks;occurrence uuid;BEGIN
 SELECT * INTO t FROM public.communication_tasks WHERE id=p_task;
 IF NOT FOUND OR t.assigned_to_id IS NULL OR p_kind IS NULL OR p_kind NOT IN ('assignment','overdue') THEN RETURN;END IF;
 occurrence:=CASE p_kind WHEN 'assignment' THEN t.assignment_occurrence ELSE t.deadline_occurrence END;
 INSERT INTO public.delivery_jobs(kind,deduplication_key,payload) VALUES('task_notification','task:'||p_kind||':'||t.id||':'||occurrence,
  jsonb_build_object('taskId',t.id,'recipientId',t.assigned_to_id,'kind',p_kind,'occurrence',occurrence)) ON CONFLICT(deduplication_key) DO NOTHING;
END $$;
CREATE FUNCTION public.mutate_task(p_actor uuid,p_session uuid,p_verified_hash text,p_id uuid,p_action text,p_revision integer,p_document jsonb,
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
CREATE FUNCTION public.list_task_comments(p_actor uuid,p_task uuid,p_before timestamptz,p_before_id uuid) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;BEGIN
 IF NOT public.can_operate_task(p_actor,p_task,'read') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 WITH page AS(SELECT c.* FROM public.task_comments c WHERE task_id=p_task AND (p_before IS NULL OR(c.created_at,c.id)<(p_before,p_before_id)) ORDER BY created_at DESC,id DESC LIMIT 50)
 SELECT jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object('id',c.id,'user_id',c.user_id,'authorName',(SELECT display_name FROM public.admin_users WHERE id=c.user_id),
  'comment',CASE WHEN deleted_at IS NULL THEN comment ELSE '' END,'comment_type',comment_type,'revision',revision,'deleted_at',deleted_at,'created_at',created_at,'updated_at',updated_at,
  'canEdit',c.comment_type='comment' AND c.deleted_at IS NULL AND c.user_id=p_actor AND public.can_operate_task(p_actor,p_task,'comment'),
  'canDelete',c.comment_type='comment' AND c.deleted_at IS NULL AND public.can_operate_task(p_actor,p_task,'comment') AND(c.user_id=p_actor OR public.can_operate_task(p_actor,p_task,'update')))
  ORDER BY c.created_at,c.id),'[]')) INTO result FROM page c;RETURN result;
END $$;
CREATE FUNCTION public.mutate_task_comment(p_actor uuid,p_session uuid,p_task uuid,p_id uuid,p_action text,p_revision integer,p_comment text,
 p_key_hash text,p_request_hash text,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE t public.communication_tasks;c public.task_comments;k public.idempotency_keys;v_scope text;result jsonb;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));
 SELECT * INTO t FROM public.communication_tasks WHERE id=p_task FOR UPDATE;
 IF NOT FOUND OR NOT public.can_operate_task(p_actor,t.id,'comment') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 PERFORM 1 FROM public.admin_sessions WHERE id=p_session AND admin_user_id=p_actor AND revoked_at IS NULL AND idle_expires_at>now() AND absolute_expires_at>now();
 IF NOT FOUND THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 IF p_action IS NULL OR p_action NOT IN ('create','edit','delete') THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
 v_scope:='tasks.comment:'||t.id||':'||p_actor||':'||p_action||':'||coalesce(p_id::text,'new');
 SELECT * INTO k FROM public.idempotency_keys WHERE scope=v_scope AND key_hash=p_key_hash;
 IF FOUND THEN IF k.request_hash<>p_request_hash THEN RAISE EXCEPTION 'CONFLICT';END IF;RETURN k.result;END IF;
 IF p_action IN ('create','edit') AND(length(trim(p_comment)) NOT BETWEEN 1 AND 5000 OR p_comment IS NULL) THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 IF p_action='create' THEN
  INSERT INTO public.task_comments(task_id,user_id,comment,comment_type) VALUES(t.id,p_actor,p_comment,'comment') RETURNING * INTO c;
 ELSE
  SELECT * INTO c FROM public.task_comments WHERE id=p_id AND task_id=t.id FOR UPDATE;
  IF NOT FOUND OR c.comment_type<>'comment' OR c.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  IF c.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'CONFLICT';END IF;
  IF c.user_id<>p_actor AND(p_action='edit' OR NOT public.can_operate_task(p_actor,t.id,'update')) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
  UPDATE public.task_comments SET comment=CASE WHEN p_action='edit' THEN p_comment ELSE comment END,deleted_at=CASE WHEN p_action='delete' THEN now() ELSE NULL END,
   revision=revision+1,updated_at=clock_timestamp() WHERE id=c.id RETURNING * INTO c;
 END IF;
 result:=jsonb_build_object('id',c.id,'revision',c.revision);
 INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result) VALUES(v_scope,p_key_hash,p_request_hash,200,result);
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id) VALUES(p_actor,'tasks.comment_'||p_action,'task_comment',c.id,p_request_id);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.task_team_action(uuid,uuid,text),public.can_operate_task(uuid,uuid,text,uuid),public.task_projection(uuid,uuid),
 public.list_tasks(uuid,integer,text,text,text,text,boolean),public.enqueue_task_notice(uuid,text),public.mutate_task(uuid,uuid,text,uuid,text,integer,jsonb,text,text,uuid),
 public.list_task_comments(uuid,uuid,timestamptz,uuid),public.mutate_task_comment(uuid,uuid,uuid,uuid,text,integer,text,text,text,uuid) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.task_team_action(uuid,uuid,text),public.can_operate_task(uuid,uuid,text,uuid),public.task_projection(uuid,uuid),
 public.list_tasks(uuid,integer,text,text,text,text,boolean),public.enqueue_task_notice(uuid,text),public.mutate_task(uuid,uuid,text,uuid,text,integer,jsonb,text,text,uuid),
 public.list_task_comments(uuid,uuid,timestamptz,uuid),public.mutate_task_comment(uuid,uuid,uuid,uuid,text,integer,text,text,text,uuid) TO service_role;
COMMIT;
