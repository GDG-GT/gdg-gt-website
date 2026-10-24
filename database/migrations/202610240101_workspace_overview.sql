BEGIN;
-- One bounded projection per panel keeps failures independent. Never return
-- attendee identities, message bodies, or a globally counted finance total.
CREATE FUNCTION public.read_workspace_widget(p_actor uuid,p_session uuid,p_widget text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE u public.admin_users;r jsonb;BEGIN
 SELECT * INTO u FROM public.admin_users WHERE id=p_actor AND is_active AND NOT must_change_password
  AND deleted_at IS NULL AND (locked_until IS NULL OR locked_until<=now());
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.admin_sessions WHERE id=p_session AND admin_user_id=p_actor
  AND revoked_at IS NULL AND idle_expires_at>now() AND absolute_expires_at>now()) THEN
  RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 IF p_widget='registrations' THEN
  WITH eligible AS(SELECT e.id,e.title,e.start_at,e.external_attendees FROM public.events e
   WHERE e.publication_status<>'archived' AND public.can_operate_event(u.id,'read',e.team_id)
   AND (e.team_id IS NULL OR EXISTS(SELECT 1 FROM public.admin_teams t WHERE t.id=e.team_id AND t.is_active AND t.deleted_at IS NULL))),
  latest AS(SELECT * FROM eligible ORDER BY start_at DESC,id DESC LIMIT 8)
  SELECT jsonb_build_object('totalEvents',(SELECT count(*) FROM eligible),'items',coalesce(jsonb_agg(jsonb_build_object(
   'id',e.id,'title',e.title,'internal',(SELECT count(*) FROM public.event_attendance a WHERE a.event_id=e.id AND a.deleted_at IS NULL),
   'external',e.external_attendees) ORDER BY e.start_at DESC,e.id DESC),'[]')) INTO r FROM latest e;
 ELSIF p_widget='funding' THEN
  WITH eligible AS(SELECT f.* FROM public.finances f WHERE f.transaction_type='income'
   AND f.status IN('pending','team-lead-approved','admin-approved','completed') AND public.can_operate_finance(u.id,f.id,'read')),
  states AS(SELECT * FROM unnest(ARRAY['pending','team-lead-approved','admin-approved','completed']) WITH ORDINALITY s(status,position))
  SELECT jsonb_build_object('items',jsonb_agg(jsonb_build_object('status',s.status,
   'count',(SELECT count(*) FROM eligible e WHERE e.status=s.status),
   'amount',(SELECT coalesce(sum(e.amount),0)::numeric(14,2)::text FROM eligible e WHERE e.status=s.status)) ORDER BY s.position)) INTO r FROM states s;
 ELSIF p_widget='tasks' THEN
  WITH eligible AS(SELECT t.* FROM public.communication_tasks t WHERE t.assigned_to_id=u.id AND t.archived_at IS NULL
   AND t.status<>'completed' AND public.can_operate_task(u.id,t.id,'read')),
  upcoming AS(SELECT * FROM eligible ORDER BY due_date NULLS LAST,id LIMIT 8)
  SELECT jsonb_build_object('count',(SELECT count(*) FROM eligible),'items',coalesce(jsonb_agg(jsonb_build_object(
   'id',t.id,'title',t.title,'status',t.status,'due_date',t.due_date,'priority',t.priority) ORDER BY t.due_date NULLS LAST,t.id),'[]')) INTO r FROM upcoming t;
 ELSIF p_widget='messages' THEN
  SELECT jsonb_build_object('unread',count(*)) INTO r FROM public.internal_messages m
   JOIN public.direct_message_threads t ON t.id=m.thread_id
   LEFT JOIN public.direct_thread_states s ON s.thread_id=t.id AND s.user_id=u.id
   WHERE m.to_user_id=u.id AND NOT m.is_read AND m.deleted_at IS NULL AND u.id IN(t.participant_a,t.participant_b)
   AND NOT coalesce(s.is_archived,false) AND public.can_read_direct_thread(u.id,p_session,t.id);
 ELSE RAISE EXCEPTION 'Invalid widget' USING ERRCODE='22023';END IF;
 RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.read_workspace_widget(uuid,uuid,text) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.read_workspace_widget(uuid,uuid,text) TO service_role;
COMMIT;
