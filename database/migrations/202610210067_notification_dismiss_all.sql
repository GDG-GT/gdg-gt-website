BEGIN;
CREATE OR REPLACE FUNCTION public.mutate_own_notification(p_actor uuid,p_id uuid,p_action text,p_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE affected integer;BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.admin_users WHERE id=p_actor AND is_active AND deleted_at IS NULL AND NOT must_change_password AND(locked_until IS NULL OR locked_until<=now())) THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';END IF;
 IF p_action='read_all' AND p_id IS NULL THEN
  UPDATE public.notifications SET is_read=true WHERE user_id=p_actor AND NOT is_read;
 ELSIF p_action='dismiss_all_read' AND p_id IS NULL THEN
  -- A notification arriving after Mark all read stays unread and is never
  -- silently swept away by the later Dismiss all click.
  DELETE FROM public.notifications WHERE user_id=p_actor AND is_read;
 ELSIF p_action='read' AND p_id IS NOT NULL THEN
  UPDATE public.notifications SET is_read=true WHERE id=p_id AND user_id=p_actor;
 ELSIF p_action='delete' AND p_id IS NOT NULL THEN
  DELETE FROM public.notifications WHERE id=p_id AND user_id=p_actor;
 ELSE RAISE EXCEPTION 'INVALID_STATE';END IF;
 GET DIAGNOSTICS affected=ROW_COUNT;
 IF p_id IS NOT NULL AND affected=0 THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata)
 VALUES(p_actor,'notifications.'||p_action,'notification',p_id,p_request_id,jsonb_build_object('affected',affected));
END $$;
COMMIT;
