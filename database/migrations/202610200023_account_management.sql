BEGIN;
ALTER TABLE public.admin_users ADD COLUMN revision integer NOT NULL DEFAULT 1,
 ADD COLUMN deleted_at timestamptz;
CREATE TABLE public.account_access_tokens (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 admin_user_id uuid NOT NULL REFERENCES public.admin_users(id),
 token_hash text NOT NULL UNIQUE CHECK(token_hash~'^[a-f0-9]{64}$'),
 intended_email text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',
 consumed_at timestamptz, revoked_at timestamptz
);
CREATE UNIQUE INDEX account_one_live_access ON public.account_access_tokens(admin_user_id)
 WHERE consumed_at IS NULL AND revoked_at IS NULL;
ALTER TABLE public.account_access_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_access_tokens FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.account_access_tokens TO service_role;

CREATE FUNCTION public.account_summary(p_user public.admin_users) RETURNS jsonb
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('id',p_user.id,'email',p_user.email,'display_name',p_user.display_name,
 'role',p_user.role,'is_active',p_user.is_active,'created_at',p_user.created_at,
 'last_login_at',p_user.last_login_at,'password_changed_at',p_user.password_changed_at,
 'must_change_password',p_user.must_change_password,'locked_until',p_user.locked_until,
 'revision',p_user.revision,'deleted_at',p_user.deleted_at);
$$;
CREATE FUNCTION public.can_manage_account(p_actor public.admin_users,p_target public.admin_users,p_role text)
 RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(p_actor.is_active AND p_actor.deleted_at IS NULL AND p_actor.id<>p_target.id
 AND p_role IN ('super_admin','admin','team_member','blog_editor') AND
 (p_actor.role='super_admin' OR (p_actor.role='admin' AND p_target.role IN ('team_member','blog_editor')
 AND p_role IN ('team_member','blog_editor'))),false);
$$;
CREATE FUNCTION public.mutate_account(p_actor uuid,p_session uuid,p_verified_hash text,p_target uuid,
 p_action text,p_revision integer,p_document jsonb,p_token_hash text,p_secret text,p_request_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE a public.admin_users;t public.admin_users;next_role text;access_id uuid;
BEGIN
 -- Serialize all hierarchy changes, including two concurrent Super Admin removals.
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));
 SELECT * INTO a FROM public.admin_users WHERE id=p_actor FOR UPDATE;
 IF NOT FOUND OR NOT a.is_active OR a.deleted_at IS NOT NULL OR a.must_change_password
  OR a.password_hash IS DISTINCT FROM p_verified_hash OR a.locked_until>now() OR a.role NOT IN ('super_admin','admin') THEN
  RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM public.admin_sessions WHERE id=p_session AND admin_user_id=a.id AND revoked_at IS NULL
  AND idle_expires_at>now() AND absolute_expires_at>now() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 IF p_action='create' THEN
  next_role:=p_document->>'role';
  IF next_role NOT IN ('super_admin','admin','team_member','blog_editor') OR next_role IS NULL OR
   (a.role='admin' AND next_role NOT IN ('team_member','blog_editor')) THEN
   RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
  IF p_document->>'email' IS NULL OR p_document->>'email'<>lower(btrim(p_document->>'email'))
   OR length(p_document->>'email') NOT BETWEEN 3 AND 255 OR p_document->>'display_name' IS NULL
   OR length(p_document->>'display_name') NOT BETWEEN 1 AND 100 OR p_document->>'passwordHash' IS NULL
   OR p_document->>'passwordHash' !~ '^scrypt\$32768\$8\$1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{86}$' THEN
   RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
  INSERT INTO public.admin_users(email,display_name,role,password_hash,is_active,must_change_password,created_by)
   VALUES(p_document->>'email',p_document->>'display_name',next_role,p_document->>'passwordHash',true,true,a.id)
   RETURNING * INTO t;
 ELSE
  SELECT * INTO t FROM public.admin_users WHERE id=p_target FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  next_role:=CASE WHEN p_action='update' THEN p_document->>'role' ELSE t.role END;
  IF NOT public.can_manage_account(a,t,next_role) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
  IF t.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'CONFLICT';END IF;
  IF t.deleted_at IS NOT NULL AND p_action<>'restore' THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  IF t.role='super_admin' AND t.is_active AND NOT t.must_change_password AND
   (p_action IN ('deactivate','archive','reset') OR (p_action='update' AND next_role<>'super_admin')) AND
   NOT EXISTS(SELECT 1 FROM public.admin_users WHERE id<>t.id AND role='super_admin' AND is_active
    AND NOT must_change_password AND deleted_at IS NULL) THEN RAISE EXCEPTION 'LAST_SUPER_ADMIN';END IF;
  IF p_action='update' THEN
   IF length(p_document->>'display_name') NOT BETWEEN 1 AND 100 OR p_document->>'display_name' IS NULL THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
   UPDATE public.admin_users SET display_name=p_document->>'display_name',role=next_role,
    permission_version=permission_version+1 WHERE id=t.id;
  ELSIF p_action IN ('activate','deactivate','archive','restore') THEN
   IF (p_action='restore' AND t.deleted_at IS NULL) OR (p_action<>'restore' AND t.deleted_at IS NOT NULL) THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
   UPDATE public.admin_users SET is_active=(p_action='activate'),
    deleted_at=CASE WHEN p_action='archive' THEN now() WHEN p_action='restore' THEN NULL ELSE deleted_at END,
    permission_version=permission_version+1 WHERE id=t.id;
  ELSIF p_action='reset' THEN
   IF NOT t.is_active THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
   IF EXISTS(SELECT 1 FROM public.account_access_tokens WHERE admin_user_id=t.id AND created_at>now()-interval '1 minute'
    AND consumed_at IS NULL AND revoked_at IS NULL) THEN RAISE EXCEPTION 'RESEND_COOLDOWN';END IF;
   UPDATE public.admin_users SET must_change_password=true,permission_version=permission_version+1 WHERE id=t.id;
  ELSIF p_action<>'revoke_sessions' THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  UPDATE public.admin_users SET revision=revision+1,updated_at=now() WHERE id=t.id;
  -- Role changes and reset also invalidate old session and CSRF capabilities.
  UPDATE public.admin_sessions SET revoked_at=now() WHERE admin_user_id=t.id AND revoked_at IS NULL;
  DELETE FROM public.csrf_tokens WHERE session_id IN (SELECT id FROM public.admin_sessions WHERE admin_user_id=t.id);
  UPDATE public.account_access_tokens SET revoked_at=now() WHERE admin_user_id=t.id AND consumed_at IS NULL AND revoked_at IS NULL;
  SELECT * INTO t FROM public.admin_users WHERE id=t.id;
 END IF;
 IF p_action IN ('create','reset') THEN
  IF p_token_hash IS NULL OR p_token_hash!~'^[a-f0-9]{64}$' OR p_secret IS NULL OR length(p_secret)<40 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
  INSERT INTO public.account_access_tokens(admin_user_id,token_hash,intended_email)
   VALUES(t.id,p_token_hash,t.email) RETURNING id INTO access_id;
  INSERT INTO public.delivery_jobs(kind,deduplication_key,payload,secret_payload)
   VALUES('account_access','account-access:'||access_id,jsonb_build_object('tokenId',access_id,'userId',t.id),p_secret);
 END IF;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata)
  VALUES(a.id,'users.'||p_action,'admin_user',t.id,p_request_id,jsonb_build_object('role',t.role));
 RETURN public.account_summary(t);
END $$;

CREATE FUNCTION public.complete_account_access(p_hash text,p_email text,p_password_hash text,p_request_id uuid)
 RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE t public.account_access_tokens;u public.admin_users;
BEGIN
 IF p_password_hash !~ '^scrypt\$32768\$8\$1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{86}$' OR p_password_hash IS NULL THEN
  RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));
 SELECT * INTO t FROM public.account_access_tokens WHERE token_hash=p_hash FOR UPDATE;
 IF NOT FOUND OR t.consumed_at IS NOT NULL OR t.revoked_at IS NOT NULL OR t.expires_at<=now()
  OR t.intended_email IS DISTINCT FROM p_email THEN RETURN false;END IF;
 SELECT * INTO u FROM public.admin_users WHERE id=t.admin_user_id FOR UPDATE;
 IF NOT FOUND OR NOT u.is_active OR u.deleted_at IS NOT NULL OR u.email<>t.intended_email THEN RETURN false;END IF;
 UPDATE public.admin_users SET password_hash=p_password_hash,must_change_password=false,temporary_password_expires_at=NULL,
  password_changed_at=now(),failed_login_count=0,locked_until=NULL,failed_login_window_at=NULL,
  permission_version=permission_version+1,revision=revision+1,updated_at=now() WHERE id=u.id;
 UPDATE public.account_access_tokens SET consumed_at=now() WHERE id=t.id;
 UPDATE public.account_access_tokens SET revoked_at=now() WHERE admin_user_id=u.id AND id<>t.id AND consumed_at IS NULL AND revoked_at IS NULL;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id) VALUES(u.id,'auth.account_access_completed','admin_user',u.id,p_request_id);
 RETURN true;
END $$;

-- All old temporary-password sessions stop working, not merely the visible UI.
CREATE FUNCTION public.account_credentials_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.password_hash IS DISTINCT FROM OLD.password_hash THEN
  NEW.must_change_password:=false;NEW.temporary_password_expires_at:=NULL;
  UPDATE public.account_access_tokens SET revoked_at=now() WHERE admin_user_id=NEW.id AND consumed_at IS NULL AND revoked_at IS NULL;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER account_credentials_guard BEFORE UPDATE ON public.admin_users FOR EACH ROW EXECUTE FUNCTION public.account_credentials_guard();
CREATE OR REPLACE FUNCTION public.validate_server_session(p_token_hash text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.admin_sessions;u public.admin_users;
BEGIN
 SELECT * INTO s FROM public.admin_sessions WHERE token_hash=p_token_hash FOR UPDATE;
 IF NOT FOUND OR s.revoked_at IS NOT NULL OR s.idle_expires_at<=now() OR s.absolute_expires_at<=now() THEN RETURN NULL;END IF;
 SELECT * INTO u FROM public.admin_users WHERE id=s.admin_user_id;
 IF NOT FOUND OR NOT u.is_active OR u.must_change_password OR u.deleted_at IS NOT NULL
  OR u.temporary_password_expires_at<=now() THEN RETURN NULL;END IF;
 UPDATE public.admin_sessions SET last_seen_at=now(),idle_expires_at=least(now()+interval '8 hours',absolute_expires_at),
  permission_version=u.permission_version WHERE id=s.id;
 RETURN jsonb_build_object('sessionId',s.id,'user',jsonb_build_object('id',u.id,'email',u.email,'role',u.role,
  'display_name',u.display_name,'is_active',u.is_active,'created_at',u.created_at,'permission_version',u.permission_version));
END $$;
CREATE OR REPLACE FUNCTION public.claim_delivery_jobs(p_limit integer) RETURNS SETOF public.delivery_jobs
 LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT * FROM public.claim_worker_jobs(p_limit,ARRAY['event_confirmation','event_message','newsletter_confirmation',
 'contact_acknowledgment','contact_notification','form_access','form_response_notification','account_access']);
$$;
REVOKE ALL ON FUNCTION public.account_summary(public.admin_users),public.can_manage_account(public.admin_users,public.admin_users,text),
 public.mutate_account(uuid,uuid,text,uuid,text,integer,jsonb,text,text,uuid),public.complete_account_access(text,text,text,uuid),
 public.account_credentials_guard() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.account_summary(public.admin_users),public.can_manage_account(public.admin_users,public.admin_users,text),
 public.mutate_account(uuid,uuid,text,uuid,text,integer,jsonb,text,text,uuid),public.complete_account_access(text,text,text,uuid),
 public.account_credentials_guard() TO service_role;
COMMIT;
