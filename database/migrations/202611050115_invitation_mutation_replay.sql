BEGIN;
CREATE FUNCTION public.mutate_team_invite_workspace(
 p_actor uuid,p_session uuid,p_verified_hash text,p_team uuid,p_id uuid,p_revision integer,
 p_action text,p_email text,p_role text,p_hash text,p_secret text,p_key_hash text,p_request_hash text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE a public.admin_users;t public.admin_teams;i public.team_invites;u public.admin_users;
 k public.idempotency_keys;v_scope text:='team-invitation:'||p_actor;v_result jsonb;
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
 IF p_action IS NULL OR p_action NOT IN('create','resend','revoke')
 OR(p_action='create') IS DISTINCT FROM(p_id IS NULL)
 OR p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$'
 OR p_request_hash IS NULL OR p_request_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 SELECT * INTO t FROM public.admin_teams WHERE id=p_team AND is_active AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND OR NOT public.can_operate_team(p_actor,p_team,'manage') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_id IS NOT NULL THEN
  SELECT * INTO i FROM public.team_invites WHERE id=p_id AND team_id=p_team FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  IF a.role='team_member' AND(i.role<>'member' OR i.invited_by<>p_actor) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 ELSE
  IF p_email IS NULL OR p_email<>lower(btrim(p_email)) OR length(p_email) NOT BETWEEN 3 AND 255
  OR p_role IS NULL OR p_role NOT IN('member','co_lead','lead') OR(a.role='team_member' AND p_role<>'member')
  THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 END IF;
 SELECT * INTO u FROM public.admin_users WHERE email=coalesce(i.email,p_email);
 IF FOUND AND p_action<>'revoke' AND(NOT u.is_active OR u.deleted_at IS NOT NULL OR u.must_change_password OR u.role='blog_editor'
  OR(a.role='admin' AND u.role='super_admin') OR(a.role='team_member' AND u.role<>'team_member'))
 THEN RAISE EXCEPTION 'ACCOUNT_NOT_READY';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_scope||':'||p_key_hash,0));
 SELECT * INTO k FROM public.idempotency_keys WHERE scope=v_scope AND key_hash=p_key_hash;
 IF FOUND THEN
  IF k.request_hash IS DISTINCT FROM p_request_hash THEN RAISE EXCEPTION 'CONFLICT';END IF;
  SELECT * INTO i FROM public.team_invites WHERE id=(k.result->>'id')::uuid AND team_id=p_team;
  IF NOT FOUND OR(a.role='team_member' AND(i.role<>'member' OR i.invited_by<>p_actor)) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  RETURN public.safe_team_invite(i);
 END IF;
 v_result:=public.mutate_team_invite(p_actor,p_session,p_verified_hash,p_team,p_id,p_revision,p_action,p_email,p_role,p_hash,p_secret,p_request_id);
 INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result)
 VALUES(v_scope,p_key_hash,p_request_hash,200,jsonb_build_object('id',v_result->>'id'));
 RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.mutate_team_invite_workspace(uuid,uuid,text,uuid,uuid,integer,text,text,text,text,text,text,text,uuid) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.mutate_team_invite_workspace(uuid,uuid,text,uuid,uuid,integer,text,text,text,text,text,text,text,uuid) TO service_role;
COMMIT;
