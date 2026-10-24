BEGIN;
ALTER TABLE public.team_invites DROP CONSTRAINT team_invites_status_check;
ALTER TABLE public.team_invites ADD CONSTRAINT team_invites_status_check
 CHECK(status IN('pending','accepted','expired','cancelled','declined'));
CREATE FUNCTION public.describe_team_invite(p_hash text,p_email text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE r jsonb;name text;BEGIN
 r:=public.inspect_team_invite(p_hash,p_email);
 IF r IS NULL THEN RETURN NULL;END IF;
 SELECT coalesce(nullif(btrim(u.display_name),''),'Chapter team lead') INTO name
  FROM public.team_invites i JOIN public.admin_users u ON u.id=i.invited_by WHERE i.token_hash=p_hash AND i.email=p_email;
 RETURN r||jsonb_build_object('inviterName',name,'state','pending');
END $$;
CREATE FUNCTION public.decline_team_invite(p_hash text,p_email text,p_actor uuid,p_session uuid,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE i public.team_invites;u public.admin_users;BEGIN
 -- Same locks and current binding checks as acceptance: accept/decline/resend
 -- cannot race and a used, expired, revoked or reassigned link cannot mutate.
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
 INSERT INTO public.team_activity_log(team_id,actor_id,action,details)
  VALUES(i.team_id,u.id,'invite_declined',jsonb_build_object('inviteId',i.id));
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id)
  VALUES(u.id,'teams.invite_declined','team_invite',i.id,p_request_id);
 RETURN jsonb_build_object('declined',true);
END $$;
REVOKE ALL ON FUNCTION public.describe_team_invite(text,text),public.decline_team_invite(text,text,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.describe_team_invite(text,text),public.decline_team_invite(text,text,uuid,uuid,uuid) TO service_role;
COMMIT;
