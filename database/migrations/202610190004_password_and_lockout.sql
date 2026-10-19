BEGIN;
ALTER TABLE public.admin_users ADD COLUMN failed_login_window_at timestamptz;
CREATE OR REPLACE FUNCTION public.create_server_session(p_admin_id uuid,p_token_hash text,p_csrf_hash text,
  p_gate_hash text,p_verified_password_hash text,p_request_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM 1 FROM public.security_configuration WHERE id FOR SHARE;
  PERFORM 1 FROM public.gate_sessions g JOIN public.security_configuration c ON c.id
    WHERE g.token_hash=p_gate_hash AND g.gate_version=c.gate_version AND g.revoked_at IS NULL
      AND g.expires_at>now() FOR SHARE OF g;
  IF NOT FOUND THEN RAISE EXCEPTION 'Gate unavailable' USING ERRCODE='28000'; END IF;
  PERFORM 1 FROM public.admin_users WHERE id=p_admin_id AND is_active AND password_hash=p_verified_password_hash
    AND (locked_until IS NULL OR locked_until<=now()) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account unavailable' USING ERRCODE='28000'; END IF;
  INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(p_admin_id,p_token_hash) RETURNING id INTO v_id;
  INSERT INTO public.csrf_tokens(session_id,token_hash,expires_at) VALUES(v_id,p_csrf_hash,now()+interval '8 hours');
  UPDATE public.admin_users SET last_login_at=now(),failed_login_count=0,failed_login_window_at=NULL,locked_until=NULL WHERE id=p_admin_id;
  INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id)
    VALUES(p_admin_id,'auth.login','admin_session',v_id,p_request_id);
  RETURN v_id;
END $$;
CREATE FUNCTION public.record_login_failure(p_admin_id uuid,p_verified_hash text) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  UPDATE public.admin_users SET
    failed_login_count=CASE WHEN failed_login_window_at>now()-interval '15 minutes' THEN failed_login_count+1 ELSE 1 END,
    failed_login_window_at=CASE WHEN failed_login_window_at>now()-interval '15 minutes' THEN failed_login_window_at ELSE now() END,
    locked_until=CASE WHEN failed_login_window_at>now()-interval '15 minutes' AND failed_login_count>=4
      THEN now()+interval '15 minutes' ELSE locked_until END
    WHERE id=p_admin_id AND password_hash=p_verified_hash;
END $$;
CREATE FUNCTION public.change_password_atomic(p_admin_id uuid,p_session_id uuid,p_verified_hash text,
  p_new_hash text,p_token_hash text,p_csrf_hash text,p_request_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF p_new_hash !~ '^scrypt\$32768\$8\$1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{86}$'
    OR p_token_hash !~ '^[a-f0-9]{64}$' OR p_csrf_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'VALIDATION_ERROR' USING ERRCODE='22023';
  END IF;
  PERFORM 1 FROM public.admin_sessions WHERE id=p_session_id AND admin_user_id=p_admin_id
    AND revoked_at IS NULL AND idle_expires_at>now() AND absolute_expires_at>now() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Session unavailable' USING ERRCODE='28000'; END IF;
  PERFORM 1 FROM public.admin_users WHERE id=p_admin_id AND is_active AND password_hash=p_verified_hash FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account unavailable' USING ERRCODE='28000'; END IF;
  UPDATE public.admin_users SET password_hash=p_new_hash,password_changed_at=now(),updated_at=now(),
    failed_login_count=0,failed_login_window_at=NULL,locked_until=NULL WHERE id=p_admin_id;
  -- The password trigger revokes every old bearer token. Rotate the current
  -- session and CSRF together; other sessions remain revoked.
  UPDATE public.admin_sessions SET token_hash=p_token_hash,revoked_at=NULL,last_seen_at=now(),
    idle_expires_at=least(now()+interval '8 hours',absolute_expires_at) WHERE id=p_session_id;
  UPDATE public.csrf_tokens SET token_hash=p_csrf_hash,rotated_at=now(),expires_at=now()+interval '8 hours' WHERE session_id=p_session_id;
  INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id)
    VALUES(p_admin_id,'auth.password_changed','admin_user',p_admin_id,p_request_id);
END $$;
REVOKE ALL ON FUNCTION public.record_login_failure(uuid,text),
  public.change_password_atomic(uuid,uuid,text,text,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_login_failure(uuid,text),
  public.change_password_atomic(uuid,uuid,text,text,text,text,uuid) TO service_role;
COMMIT;
