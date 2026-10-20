BEGIN;
-- No source invitations were imported. Refuse a raw legacy token rather than
-- silently treating it as a hash or invalidating somebody's live invitation.
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.team_invites WHERE token!~'^[a-f0-9]{64}$') THEN
 RAISE EXCEPTION 'Legacy invitation data needs a reviewed migration';END IF;END $$;
ALTER TABLE public.team_invites RENAME COLUMN token TO token_hash;
ALTER TABLE public.team_invites ADD CONSTRAINT team_invites_hashed_token CHECK(token_hash~'^[a-f0-9]{64}$'),
 ADD CONSTRAINT team_invites_normalized_email CHECK(email=lower(btrim(email))),
 ADD COLUMN intended_account_id uuid REFERENCES public.admin_users(id),
 ADD COLUMN revision integer NOT NULL DEFAULT 1,ADD COLUMN last_sent_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX team_invites_one_pending_email ON public.team_invites(team_id,email) WHERE status='pending';
CREATE FUNCTION public.safe_team_invite(p_invite public.team_invites) RETURNS jsonb
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('id',p_invite.id,'team_id',p_invite.team_id,'email',p_invite.email,'role',p_invite.role,
 'status',CASE WHEN p_invite.status='pending' AND p_invite.expires_at<=now() THEN 'expired' ELSE p_invite.status END,
 'expires_at',p_invite.expires_at,'created_at',p_invite.created_at,'accepted_at',p_invite.accepted_at,
 'last_sent_at',p_invite.last_sent_at,'revision',p_invite.revision);
$$;
CREATE FUNCTION public.mutate_team_invite(p_actor uuid,p_session uuid,p_verified_hash text,p_team uuid,p_id uuid,p_revision integer,
 p_action text,p_email text,p_role text,p_hash text,p_secret text,p_request_id uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE a public.admin_users;t public.admin_teams;i public.team_invites;u public.admin_users;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('team-administration',0));
 SELECT * INTO a FROM public.admin_users WHERE id=p_actor AND is_active AND NOT must_change_password AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND OR a.password_hash IS DISTINCT FROM p_verified_hash OR a.locked_until>now() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM public.admin_sessions WHERE id=p_session AND admin_user_id=a.id AND revoked_at IS NULL AND idle_expires_at>now() AND absolute_expires_at>now();
 IF NOT FOUND OR NOT public.can_operate_team(a.id,p_team,'manage') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT * INTO t FROM public.admin_teams WHERE id=p_team AND is_active AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
 IF p_action='create' THEN
  IF p_email IS NULL OR p_email<>lower(btrim(p_email)) OR length(p_email) NOT BETWEEN 3 AND 255 OR p_role IS NULL
   OR p_role NOT IN ('member','co_lead','lead') OR (a.role='team_member' AND p_role<>'member') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
  SELECT * INTO u FROM public.admin_users WHERE email=p_email;
  IF FOUND AND (NOT u.is_active OR u.must_change_password OR u.deleted_at IS NOT NULL OR u.role='blog_editor' OR (a.role='admin' AND u.role='super_admin')
    OR (a.role='team_member' AND u.role<>'team_member')) THEN RAISE EXCEPTION 'ACCOUNT_NOT_READY';END IF;
  IF u.id IS NOT NULL AND EXISTS(SELECT 1 FROM public.team_memberships WHERE team_id=t.id AND admin_user_id=u.id AND is_active) THEN RAISE EXCEPTION 'DUPLICATE';END IF;
  UPDATE public.team_invites SET status='expired',revision=revision+1 WHERE team_id=t.id AND email=p_email AND status='pending' AND expires_at<=now();
  SELECT * INTO i FROM public.team_invites WHERE team_id=t.id AND email=p_email AND status='pending' FOR UPDATE;
  IF FOUND THEN RETURN public.safe_team_invite(i);END IF;
  INSERT INTO public.team_invites(team_id,email,role,invited_by,token_hash,status,expires_at,intended_account_id)
   VALUES(t.id,p_email,p_role,a.id,p_hash,'pending',now()+interval '7 days',u.id) RETURNING * INTO i;
 ELSE
  SELECT * INTO i FROM public.team_invites WHERE id=p_id AND team_id=t.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  IF i.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'CONFLICT';END IF;
  IF i.status<>'pending' OR i.expires_at<=now() THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  IF a.role='team_member' AND (i.role<>'member' OR i.invited_by<>a.id) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
  IF p_action='revoke' THEN
   UPDATE public.team_invites SET status='cancelled',revision=revision+1 WHERE id=i.id RETURNING * INTO i;
  ELSIF p_action='resend' THEN
   IF i.last_sent_at>now()-interval '1 minute' THEN RAISE EXCEPTION 'RESEND_COOLDOWN';END IF;
   UPDATE public.team_invites SET token_hash=p_hash,expires_at=now()+interval '7 days',last_sent_at=now(),
    revision=revision+1,invited_by=a.id WHERE id=i.id RETURNING * INTO i;
  ELSE RAISE EXCEPTION 'INVALID_STATE';END IF;
 END IF;
 IF p_action<>'revoke' THEN
  IF p_hash IS NULL OR p_hash!~'^[a-f0-9]{64}$' OR p_secret IS NULL OR length(p_secret)<40 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
  INSERT INTO public.delivery_jobs(kind,deduplication_key,payload,secret_payload) VALUES('team_invite','team-invite:'||i.id||':'||i.revision,
   jsonb_build_object('inviteId',i.id,'teamId',t.id,'tokenHash',p_hash),p_secret);
 END IF;
 INSERT INTO public.team_activity_log(team_id,actor_id,action,details) VALUES(t.id,a.id,'invite_'||p_action,jsonb_build_object('inviteId',i.id));
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id) VALUES(a.id,'teams.invite_'||p_action,'team_invite',i.id,p_request_id);
 RETURN public.safe_team_invite(i);
END $$;
CREATE FUNCTION public.inspect_team_invite(p_hash text,p_email text) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE i public.team_invites;t public.admin_teams;u public.admin_users;inviter public.admin_users;BEGIN
 SELECT * INTO i FROM public.team_invites WHERE token_hash=p_hash AND email=p_email AND status='pending' AND expires_at>now();
 IF NOT FOUND OR NOT public.can_operate_team(i.invited_by,i.team_id,'manage') THEN RETURN NULL;END IF;
 SELECT * INTO t FROM public.admin_teams WHERE id=i.team_id AND is_active AND deleted_at IS NULL;
 IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT * INTO inviter FROM public.admin_users WHERE id=i.invited_by;
 IF i.role<>'member' AND inviter.role NOT IN ('super_admin','admin') THEN RETURN NULL;END IF;
 SELECT * INTO u FROM public.admin_users WHERE email=i.email;
 IF (i.intended_account_id IS NOT NULL AND i.intended_account_id IS DISTINCT FROM u.id) OR (u.id IS NOT NULL AND
  (NOT u.is_active OR u.deleted_at IS NOT NULL OR u.must_change_password OR u.role='blog_editor'
   OR (inviter.role='admin' AND u.role='super_admin') OR (inviter.role='team_member' AND u.role<>'team_member'))) THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('teamName',t.name,'role',i.role,'expiresAt',i.expires_at,'requiresSignIn',u.id IS NOT NULL);
END $$;
CREATE FUNCTION public.accept_team_invite(p_hash text,p_email text,p_actor uuid,p_session uuid,p_name text,p_new_hash text,p_request_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE i public.team_invites;u public.admin_users;result jsonb;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('team-administration',0));
 result:=public.inspect_team_invite(p_hash,p_email);
 IF result IS NULL THEN RAISE EXCEPTION 'INVITE_INVALID';END IF;
 SELECT * INTO i FROM public.team_invites WHERE token_hash=p_hash FOR UPDATE;
 SELECT * INTO u FROM public.admin_users WHERE email=i.email FOR UPDATE;
 IF FOUND THEN
  IF u.id IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'INVITE_SIGNIN_REQUIRED';END IF;
  PERFORM 1 FROM public.admin_sessions WHERE id=p_session AND admin_user_id=u.id AND revoked_at IS NULL AND idle_expires_at>now() AND absolute_expires_at>now();
  IF NOT FOUND THEN RAISE EXCEPTION 'INVITE_SIGNIN_REQUIRED';END IF;
 ELSE
  IF p_new_hash IS NULL OR p_new_hash!~'^scrypt\$32768\$8\$1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{86}$'
   OR p_name IS NULL OR length(p_name) NOT BETWEEN 2 AND 100 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
  INSERT INTO public.admin_users(email,password_hash,display_name,role,is_active,must_change_password,created_by)
   VALUES(i.email,p_new_hash,p_name,'team_member',true,false,i.invited_by) RETURNING * INTO u;
 END IF;
 INSERT INTO public.team_memberships(team_id,admin_user_id,role,added_by) VALUES(i.team_id,u.id,i.role,i.invited_by)
  ON CONFLICT(team_id,admin_user_id) DO UPDATE SET is_active=true,role=CASE WHEN public.team_memberships.is_active THEN public.team_memberships.role ELSE EXCLUDED.role END,
  revision=public.team_memberships.revision+1,updated_at=now();
 UPDATE public.team_invites SET status='accepted',accepted_at=now(),intended_account_id=u.id,revision=revision+1 WHERE id=i.id;
 UPDATE public.admin_users SET permission_version=permission_version+1 WHERE id=u.id;
 UPDATE public.admin_teams SET revision=revision+1,updated_at=now() WHERE id=i.team_id;
 INSERT INTO public.team_activity_log(team_id,actor_id,action,target_user_id,details)
  VALUES(i.team_id,u.id,'invite_accepted',u.id,jsonb_build_object('inviteId',i.id));
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id) VALUES(u.id,'teams.invite_accepted','team_invite',i.id,p_request_id);
 RETURN jsonb_build_object('accepted',true,'teamName',result->>'teamName','requiresSignIn',p_actor IS NULL);
END $$;
CREATE OR REPLACE FUNCTION public.claim_delivery_jobs(p_limit integer) RETURNS SETOF public.delivery_jobs
 LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT * FROM public.claim_worker_jobs(p_limit,ARRAY['event_confirmation','event_message','newsletter_confirmation',
 'contact_acknowledgment','contact_notification','form_access','form_response_notification','account_access','team_invite']);
$$;
REVOKE ALL ON FUNCTION public.safe_team_invite(public.team_invites),public.mutate_team_invite(uuid,uuid,text,uuid,uuid,integer,text,text,text,text,text,uuid),
 public.inspect_team_invite(text,text),public.accept_team_invite(text,text,uuid,uuid,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.safe_team_invite(public.team_invites),public.mutate_team_invite(uuid,uuid,text,uuid,uuid,integer,text,text,text,text,text,uuid),
 public.inspect_team_invite(text,text),public.accept_team_invite(text,text,uuid,uuid,text,text,uuid) TO service_role;
COMMIT;
