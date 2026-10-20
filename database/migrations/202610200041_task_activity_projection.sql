BEGIN;
CREATE OR REPLACE FUNCTION public.list_task_comments(p_actor uuid,p_task uuid,p_before timestamptz,p_before_id uuid) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;BEGIN
 IF NOT public.can_operate_task(p_actor,p_task,'read') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 WITH page AS(SELECT c.* FROM public.task_comments c WHERE task_id=p_task AND (p_before IS NULL OR(c.created_at,c.id)<(p_before,p_before_id)) ORDER BY created_at DESC,id DESC LIMIT 50)
 SELECT jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object('id',c.id,'user_id',c.user_id,'authorName',(SELECT display_name FROM public.admin_users WHERE id=c.user_id),
  'comment',CASE WHEN deleted_at IS NULL THEN comment ELSE '' END,'comment_type',comment_type,'revision',revision,'deleted_at',deleted_at,'created_at',created_at,'updated_at',updated_at,
  'change',CASE c.comment_type WHEN 'status_change' THEN jsonb_build_object('from',c.metadata->>'from','to',c.metadata->>'to')
  WHEN 'assignment_change' THEN jsonb_build_object('from',(SELECT display_name FROM public.admin_users WHERE id::text=c.metadata->>'from'),
  'to',(SELECT display_name FROM public.admin_users WHERE id::text=c.metadata->>'to')) ELSE NULL END,
  'canEdit',c.comment_type='comment' AND c.deleted_at IS NULL AND c.user_id=p_actor AND public.can_operate_task(p_actor,p_task,'comment'),
  'canDelete',c.comment_type='comment' AND c.deleted_at IS NULL AND public.can_operate_task(p_actor,p_task,'comment') AND(c.user_id=p_actor OR public.can_operate_task(p_actor,p_task,'update')))
  ORDER BY c.created_at,c.id),'[]')) INTO result FROM page c;RETURN result;
END $$;
COMMIT;

