BEGIN;
CREATE FUNCTION public.mutate_team_workspace(
 p_actor uuid,p_session uuid,p_verified_hash text,p_team uuid,p_action text,p_revision integer,
 p_document jsonb,p_key_hash text,p_request_hash text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE a public.admin_users;t public.admin_teams;dest public.admin_teams;m public.team_memberships;u public.admin_users;
 k public.idempotency_keys;v_scope text:='team-workspace:'||p_actor;v_required text;v_result jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('team-administration',0));
 SELECT * INTO a FROM public.admin_users WHERE id=p_actor FOR UPDATE;
 IF NOT FOUND OR NOT a.is_active OR a.deleted_at IS NOT NULL OR a.must_change_password
 OR a.password_hash IS DISTINCT FROM p_verified_hash OR a.locked_until>now()
 THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM public.admin_sessions WHERE id=p_session AND admin_user_id=p_actor AND revoked_at IS NULL
 AND idle_expires_at>now() AND absolute_expires_at>now() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 IF p_action IS NULL OR p_action NOT IN('create','update','archive','restore','permissions','member_add','member_role','member_remove','member_transfer')
 OR(p_action='create') IS DISTINCT FROM(p_team IS NULL)
 OR p_document IS NULL OR jsonb_typeof(p_document)<>'object'
 OR p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$'
 OR p_request_hash IS NULL OR p_request_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 v_required:=CASE WHEN p_action='create' THEN 'create' WHEN p_action IN('update','archive','restore') THEN 'settings'
  WHEN p_action='permissions' THEN 'permissions' ELSE 'manage' END;
 IF p_team IS NOT NULL THEN
  SELECT * INTO t FROM public.admin_teams WHERE id=p_team FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 END IF;
 IF NOT public.can_operate_team(p_actor,p_team,v_required) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 -- Replaying an earlier member operation still requires its current target/destination authority.
 IF p_action IN('member_add','member_role','member_remove','member_transfer') THEN
  IF p_action='member_add' THEN SELECT * INTO u FROM public.admin_users WHERE email=p_document->>'email';
  ELSE
   SELECT * INTO m FROM public.team_memberships WHERE id=(p_document->>'membershipId')::uuid AND team_id=p_team FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
   SELECT * INTO u FROM public.admin_users WHERE id=m.admin_user_id;
  END IF;
  IF u.id IS NOT NULL AND((a.role='admin' AND u.role='super_admin') OR(a.role='team_member' AND
    (u.role<>'team_member' OR coalesce(p_document->>'role','member')<>'member' OR(m.id IS NOT NULL AND m.role<>'member') OR p_action='member_transfer')))
   THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
  IF p_action='member_transfer' THEN
   SELECT * INTO dest FROM public.admin_teams WHERE id=(p_document->>'destinationId')::uuid AND is_active AND deleted_at IS NULL FOR UPDATE;
   IF NOT FOUND OR NOT public.can_operate_team(p_actor,dest.id,'manage') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  END IF;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_scope||':'||p_key_hash,0));
 SELECT * INTO k FROM public.idempotency_keys WHERE scope=v_scope AND key_hash=p_key_hash;
 IF FOUND THEN
  IF k.request_hash IS DISTINCT FROM p_request_hash THEN RAISE EXCEPTION 'CONFLICT';END IF;
  -- Re-project current role-sensitive members/grants, never replay stale private emails/grants.
  RETURN public.team_workspace(p_actor,(k.result->>'id')::uuid);
 END IF;
 v_result:=public.mutate_team(p_actor,p_session,p_verified_hash,p_team,p_action,p_revision,p_document,p_request_id);
 INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result)
 VALUES(v_scope,p_key_hash,p_request_hash,200,jsonb_build_object('id',v_result->'team'->>'id'));
 RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.mutate_team_workspace(uuid,uuid,text,uuid,text,integer,jsonb,text,text,uuid) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.mutate_team_workspace(uuid,uuid,text,uuid,text,integer,jsonb,text,text,uuid) TO service_role;
COMMIT;
