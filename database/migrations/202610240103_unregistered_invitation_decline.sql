BEGIN;
CREATE OR REPLACE FUNCTION public.decline_team_invite(p_hash text,p_email text,p_actor uuid,p_session uuid,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE i public.team_invites;u public.admin_users;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('team-administration',0));
 IF public.inspect_team_invite(p_hash,p_email) IS NULL THEN RAISE EXCEPTION 'INVITE_INVALID';END IF;
 SELECT * INTO i FROM public.team_invites WHERE token_hash=p_hash AND email=p_email FOR UPDATE;
 SELECT * INTO u FROM public.admin_users WHERE email=p_email;
 IF FOUND THEN
  IF u.id IS DISTINCT FROM p_actor OR NOT EXISTS(SELECT 1 FROM public.admin_sessions WHERE id=p_session AND admin_user_id=u.id
   AND revoked_at IS NULL AND idle_expires_at>now() AND absolute_expires_at>now()) THEN RAISE EXCEPTION 'INVITE_SIGNIN_REQUIRED';END IF;
 ELSIF p_actor IS NOT NULL OR p_session IS NOT NULL THEN RAISE EXCEPTION 'INVITE_SIGNIN_REQUIRED';END IF;
 UPDATE public.team_invites SET status='declined',revision=revision+1 WHERE id=i.id;
 -- The team activity feed requires an actual chapter account. A recipient who
 -- declines before registering has no account; keep the truthful null actor in
 -- the append-only audit instead of manufacturing an identity or membership.
 IF u.id IS NOT NULL THEN
  INSERT INTO public.team_activity_log(team_id,actor_id,action,details)
   VALUES(i.team_id,u.id,'invite_declined',jsonb_build_object('inviteId',i.id));
 END IF;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id)
  VALUES(u.id,'teams.invite_declined','team_invite',i.id,p_request_id);
 RETURN jsonb_build_object('declined',true);
END $$;
REVOKE ALL ON FUNCTION public.decline_team_invite(text,text,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.decline_team_invite(text,text,uuid,uuid,uuid) TO service_role;
COMMIT;
