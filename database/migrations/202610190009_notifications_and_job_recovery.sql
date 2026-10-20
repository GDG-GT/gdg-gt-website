BEGIN;
CREATE FUNCTION public.mutate_own_notification(p_actor uuid,p_id uuid,p_action text,p_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_count integer;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.admin_users WHERE id=p_actor AND is_active) THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
 END IF;
 IF p_action='read_all' AND p_id IS NULL THEN
  UPDATE public.notifications SET is_read=true WHERE user_id=p_actor AND NOT is_read;
 ELSIF p_action='read' AND p_id IS NOT NULL THEN
  UPDATE public.notifications SET is_read=true WHERE id=p_id AND user_id=p_actor;
 ELSIF p_action='delete' AND p_id IS NOT NULL THEN
  DELETE FROM public.notifications WHERE id=p_id AND user_id=p_actor;
 ELSE RAISE EXCEPTION 'INVALID_STATE';END IF;
 GET DIAGNOSTICS v_count=ROW_COUNT;
 IF p_id IS NOT NULL AND v_count=0 THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata)
 VALUES(p_actor,'notifications.'||p_action,'notification',p_id,p_request_id,jsonb_build_object('affected',v_count));
END $$;
REVOKE ALL ON FUNCTION public.mutate_own_notification(uuid,uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mutate_own_notification(uuid,uuid,text,uuid) TO service_role;

-- A worker that crashes on its final attempt must not leave a permanent lease.
CREATE OR REPLACE FUNCTION public.claim_delivery_jobs(p_limit integer) RETURNS SETOF public.delivery_jobs
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid batch' USING ERRCODE='22023';END IF;
 UPDATE public.delivery_jobs SET state='dead',locked_until=NULL,lease_token=NULL,
  last_error_code='LEASE_EXHAUSTED',updated_at=now()
 WHERE state='running' AND locked_until<=now() AND attempt_count>=8;
 RETURN QUERY WITH due AS (
  SELECT id FROM public.delivery_jobs WHERE attempt_count<8 AND
   ((state='pending' AND next_attempt_at<=now()) OR (state='running' AND locked_until<=now()))
   ORDER BY next_attempt_at,id FOR UPDATE SKIP LOCKED LIMIT p_limit
 ) UPDATE public.delivery_jobs j SET state='running',attempt_count=attempt_count+1,
  locked_until=now()+interval '5 minutes',lease_token=gen_random_uuid(),updated_at=now()
 FROM due WHERE j.id=due.id RETURNING j.*;
END $$;
CREATE INDEX notifications_owner_unread ON public.notifications(user_id,created_at DESC) WHERE NOT is_read;
COMMIT;
