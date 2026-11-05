BEGIN;
-- Current account/team state protects both initial operations and receipt replay.
CREATE OR REPLACE FUNCTION public.can_operate_event(p_actor uuid,p_action text,p_team uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT p_action IN('read','create','update','delete','publish') AND EXISTS(
  SELECT 1 FROM public.admin_users u WHERE u.id=p_actor AND u.is_active AND u.deleted_at IS NULL
  AND NOT u.must_change_password AND(u.locked_until IS NULL OR u.locked_until<=now())
  AND(p_team IS NULL OR(p_action='read' AND u.role IN('super_admin','admin'))
   OR EXISTS(SELECT 1 FROM public.admin_teams t WHERE t.id=p_team AND t.is_active AND t.deleted_at IS NULL))
  AND(u.role IN('super_admin','admin') OR(u.role='team_member' AND p_team IS NOT NULL AND EXISTS(
   SELECT 1 FROM public.team_memberships m JOIN public.team_permissions p ON p.team_id=m.team_id
    JOIN public.team_page_access a ON a.team_id=m.team_id
   WHERE m.admin_user_id=u.id AND m.is_active AND m.team_id=p_team
    AND a.page_path='/admin/events' AND a.can_access AND p.resource_type='events'
    AND CASE p_action WHEN 'read' THEN p.can_read WHEN 'create' THEN p.can_create
      WHEN 'update' THEN p.can_update WHEN 'delete' THEN p.can_delete
      WHEN 'publish' THEN p.can_update AND p.permission IN('publish','events.publish') ELSE false END))))
$$;

CREATE FUNCTION public.mutate_event_workspace(
 p_actor uuid,p_session uuid,p_id uuid,p_action text,p_revision integer,p_document jsonb,
 p_registration uuid,p_updated_at timestamptz,p_key_hash text,p_request_hash text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE e public.events;a public.event_attendance;k public.idempotency_keys;
 v_scope text:='event-workspace:'||p_actor;v_required text;v_team uuid;v_result jsonb;v_result_team uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('team-administration',0));
 IF NOT gdg_security.member_transfer_session(p_actor,p_session) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';END IF;
 IF p_action IS NULL OR p_action NOT IN('create','update','publish','unpublish','cancel','archive','duplicate','attendee.update','attendee.remove')
 OR p_document IS NULL OR jsonb_typeof(p_document)<>'object'
 OR p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$'
 OR p_request_hash IS NULL OR p_request_hash!~'^[a-f0-9]{64}$'
 OR (p_action='create') IS DISTINCT FROM(p_id IS NULL)
 OR (p_action LIKE 'attendee.%') IS DISTINCT FROM(p_registration IS NOT NULL)
 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 v_required:=CASE WHEN p_action IN('create','duplicate') THEN 'create'
  WHEN p_action IN('publish','unpublish') THEN 'publish' WHEN p_action='archive' THEN 'delete' ELSE 'update' END;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_scope||':'||p_key_hash,0));
 IF p_id IS NOT NULL THEN
  SELECT * INTO e FROM public.events WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_operate_event(p_actor,'read',e.team_id) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  v_team:=e.team_id;
 ELSE v_team:=(p_document->>'team_id')::uuid;END IF;
 IF NOT public.can_operate_event(p_actor,'read',v_team) OR NOT public.can_operate_event(p_actor,v_required,v_team)
 THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';END IF;
 IF p_action='update' AND p_document ? 'team_id' AND (p_document->>'team_id')::uuid IS DISTINCT FROM v_team
 AND (NOT public.can_operate_event(p_actor,'read',(p_document->>'team_id')::uuid)
  OR NOT public.can_operate_event(p_actor,'create',(p_document->>'team_id')::uuid))
 THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';END IF;
 SELECT * INTO k FROM public.idempotency_keys WHERE scope=v_scope AND key_hash=p_key_hash;
 IF FOUND THEN
  IF k.request_hash IS DISTINCT FROM p_request_hash THEN RAISE EXCEPTION 'CONFLICT';END IF;
  IF p_action NOT LIKE 'attendee.%' THEN
   SELECT team_id INTO v_result_team FROM public.events WHERE id=(k.result->>'id')::uuid FOR SHARE;
   IF NOT FOUND OR NOT public.can_operate_event(p_actor,'read',v_result_team) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  END IF;
  RETURN k.result;
 END IF;
 IF p_action LIKE 'attendee.%' THEN
  SELECT * INTO a FROM public.event_attendance WHERE id=p_registration AND event_id=p_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  IF p_updated_at IS NULL OR p_updated_at IS DISTINCT FROM a.updated_at THEN RAISE EXCEPTION 'CONFLICT';END IF;
  v_result:=public.mutate_attendee(p_actor,p_id,p_registration,p_document,p_action='attendee.remove',p_request_id);
 ELSE
  v_result:=public.mutate_event(p_actor,p_id,p_action,p_revision,p_document,p_request_id);
 END IF;
 INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result)
 VALUES(v_scope,p_key_hash,p_request_hash,200,v_result);
 RETURN v_result;
END $$;
CREATE FUNCTION public.event_workspace_permissions(p_actor uuid,p_ids uuid[]) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object(
  'globalCreate',public.can_operate_event(p_actor,'create',NULL),
  'teams',coalesce((SELECT jsonb_agg(jsonb_build_object('id',t.id,'name',t.name) ORDER BY t.name,t.id)
   FROM public.admin_teams t WHERE t.is_active AND t.deleted_at IS NULL
   AND public.can_operate_event(p_actor,'read',t.id) AND public.can_operate_event(p_actor,'create',t.id)),'[]'::jsonb),
  'records',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'actions',
   (SELECT coalesce(jsonb_agg(action),'[]'::jsonb) FROM unnest(ARRAY['read','create','update','delete','publish']) action
    WHERE public.can_operate_event(p_actor,action,e.team_id)),
   'canExport',public.can_event_audience(p_actor,e.id,'export'),
   'canEmail',public.can_event_audience(p_actor,e.id,'send_email')))
   FROM public.events e WHERE e.id=ANY(p_ids) AND public.can_operate_event(p_actor,'read',e.team_id)),'[]'::jsonb))
$$;
REVOKE ALL ON FUNCTION public.can_operate_event(uuid,text,uuid),
 public.event_workspace_permissions(uuid,uuid[]),
 public.mutate_event_workspace(uuid,uuid,uuid,text,integer,jsonb,uuid,timestamptz,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.can_operate_event(uuid,text,uuid),
 public.event_workspace_permissions(uuid,uuid[]),
 public.mutate_event_workspace(uuid,uuid,uuid,text,integer,jsonb,uuid,timestamptz,text,text,uuid) TO service_role;
COMMIT;
