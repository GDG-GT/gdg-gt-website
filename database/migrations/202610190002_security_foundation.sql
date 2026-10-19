BEGIN;

-- Empty target only: never transform source sessions or import credentials.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.admin_sessions) OR EXISTS (SELECT 1 FROM public.csrf_tokens) THEN
    RAISE EXCEPTION 'Target security migration requires an empty, non-source database';
  END IF;
END $$;
ALTER TABLE public.admin_sessions RENAME COLUMN admin_id TO admin_user_id;
ALTER TABLE public.admin_sessions
  DROP COLUMN session_token, DROP COLUMN refresh_token,
  DROP COLUMN ip_address, DROP COLUMN user_agent, DROP COLUMN expires_at,
  DROP COLUMN last_activity, DROP COLUMN is_active,
  ADD COLUMN token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  ADD COLUMN last_seen_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN idle_expires_at timestamptz NOT NULL DEFAULT now() + interval '8 hours',
  ADD COLUMN absolute_expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  ADD COLUMN revoked_at timestamptz,
  ADD COLUMN permission_version bigint NOT NULL DEFAULT 1;
ALTER TABLE public.csrf_tokens
  DROP COLUMN token, DROP COLUMN admin_id, DROP COLUMN used,
  ADD COLUMN session_id uuid NOT NULL UNIQUE REFERENCES public.admin_sessions(id) ON DELETE CASCADE,
  ADD COLUMN token_hash text NOT NULL CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  ADD COLUMN rotated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.admin_users
  ADD COLUMN IF NOT EXISTS failed_login_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until timestamptz,
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz,
  ADD COLUMN IF NOT EXISTS password_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS permission_version bigint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.admin_users DROP CONSTRAINT IF EXISTS admin_users_role_check;
ALTER TABLE public.admin_users ADD CONSTRAINT admin_users_role_check
  CHECK (role IN ('super_admin','admin','team_member','blog_editor'));
CREATE UNIQUE INDEX admin_users_normalized_email_key ON public.admin_users (lower(btrim(email)));
ALTER TABLE public.admin_users ADD CONSTRAINT admin_users_normalized_email_check
  CHECK (email = lower(btrim(email)));
ALTER TABLE public.admin_users ALTER COLUMN password_hash SET NOT NULL;

CREATE TABLE public.gate_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  gate_version bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '15 minutes',
  revoked_at timestamptz
);
CREATE TABLE public.security_configuration (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  gate_hash text NOT NULL,
  gate_version bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.rate_limit_windows (
  scope text NOT NULL,
  risk_key_hash text NOT NULL CHECK (risk_key_hash ~ '^[a-f0-9]{64}$'),
  window_start timestamptz NOT NULL,
  attempts integer NOT NULL CHECK (attempts > 0),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (scope, risk_key_hash, window_start)
);
CREATE INDEX rate_limit_expiry ON public.rate_limit_windows(expires_at);
CREATE TABLE public.idempotency_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL,
  key_hash text NOT NULL CHECK (key_hash ~ '^[a-f0-9]{64}$'),
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  result_status integer,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '48 hours',
  UNIQUE (scope, key_hash)
);
CREATE TABLE public.delivery_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  deduplication_key text NOT NULL UNIQUE,
  payload jsonb NOT NULL DEFAULT '{}',
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','running','completed','failed','dead')),
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX delivery_jobs_due ON public.delivery_jobs(next_attempt_at) WHERE state='pending';
ALTER TABLE public.admin_actions
  ADD COLUMN IF NOT EXISTS actor_id uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS target_type text,
  ADD COLUMN IF NOT EXISTS target_id uuid,
  ADD COLUMN IF NOT EXISTS result text NOT NULL DEFAULT 'success',
  ADD COLUMN IF NOT EXISTS request_id uuid,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}';
ALTER TABLE public.admin_actions DROP CONSTRAINT IF EXISTS admin_actions_action_check;
ALTER TABLE public.admin_actions ADD CONSTRAINT admin_actions_action_check
  CHECK (action ~ '^[a-z][a-z0-9_.-]{0,99}$');
ALTER TABLE public.admin_actions DROP CONSTRAINT IF EXISTS admin_actions_admin_id_fkey;
ALTER TABLE public.admin_actions ADD CONSTRAINT admin_actions_admin_id_fkey
  FOREIGN KEY (admin_id) REFERENCES public.admin_users(id) ON DELETE SET NULL;

CREATE FUNCTION public.take_rate_limit(p_scope text, p_risk_hash text, p_limit integer, p_window_seconds integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_start timestamptz; v_count integer; v_expiry timestamptz;
BEGIN
  IF p_limit < 1 OR p_limit > 100000 OR p_window_seconds < 1 OR p_window_seconds > 86400
     OR length(p_scope) > 100 OR p_risk_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Invalid rate limit configuration' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_scope || ':' || p_risk_hash,0));
  v_start := clock_timestamp();
  v_expiry := v_start + make_interval(secs => p_window_seconds);
  DELETE FROM public.rate_limit_windows WHERE scope=p_scope AND risk_key_hash=p_risk_hash AND expires_at <= v_start;
  SELECT coalesce(sum(attempts),0),min(expires_at) INTO v_count,v_expiry
    FROM public.rate_limit_windows WHERE scope=p_scope AND risk_key_hash=p_risk_hash;
  IF v_count >= p_limit THEN
    RETURN jsonb_build_object('allowed',false,'remaining',0,
      'retryAfter',greatest(1,ceil(extract(epoch FROM v_expiry-v_start))::integer));
  END IF;
  v_expiry := v_start + make_interval(secs => p_window_seconds);
  INSERT INTO public.rate_limit_windows(scope,risk_key_hash,window_start,attempts,expires_at)
  VALUES(p_scope,p_risk_hash,v_start,1,v_expiry)
  ON CONFLICT (scope,risk_key_hash,window_start) DO UPDATE
    SET attempts = public.rate_limit_windows.attempts + 1
  ;
  RETURN jsonb_build_object('allowed',true,'remaining',greatest(0,p_limit-v_count-1),
    'retryAfter',greatest(1,ceil(extract(epoch FROM v_expiry-clock_timestamp()))::integer));
END $$;

CREATE FUNCTION public.validate_server_session(p_token_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_session public.admin_sessions; v_user public.admin_users;
BEGIN
  SELECT * INTO v_session FROM public.admin_sessions WHERE token_hash=p_token_hash FOR UPDATE;
  IF NOT FOUND OR v_session.revoked_at IS NOT NULL
    OR v_session.idle_expires_at <= now() OR v_session.absolute_expires_at <= now() THEN RETURN NULL; END IF;
  SELECT * INTO v_user FROM public.admin_users WHERE id=v_session.admin_user_id;
  IF NOT FOUND OR NOT v_user.is_active THEN RETURN NULL; END IF;
  UPDATE public.admin_sessions SET last_seen_at=now(),
    idle_expires_at=least(now()+interval '8 hours',absolute_expires_at),permission_version=v_user.permission_version
    WHERE id=v_session.id;
  RETURN jsonb_build_object('sessionId',v_session.id,'user',jsonb_build_object(
    'id',v_user.id,'email',v_user.email,'role',v_user.role,'display_name',v_user.display_name,
    'is_active',v_user.is_active,'created_at',v_user.created_at,'permission_version',v_user.permission_version));
END $$;

CREATE FUNCTION public.create_server_session(p_admin_id uuid, p_token_hash text, p_csrf_hash text,
  p_gate_hash text, p_verified_password_hash text, p_request_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM 1 FROM public.security_configuration WHERE id FOR SHARE;
  PERFORM 1 FROM public.gate_sessions g JOIN public.security_configuration c ON c.id
    WHERE g.token_hash=p_gate_hash AND g.gate_version=c.gate_version AND g.revoked_at IS NULL
      AND g.expires_at>now() FOR SHARE OF g;
  IF NOT FOUND THEN RAISE EXCEPTION 'Gate unavailable' USING ERRCODE='28000'; END IF;
  PERFORM 1 FROM public.admin_users WHERE id=p_admin_id AND is_active AND password_hash=p_verified_password_hash FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account unavailable' USING ERRCODE='28000'; END IF;
  INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(p_admin_id,p_token_hash) RETURNING id INTO v_id;
  INSERT INTO public.csrf_tokens(session_id,token_hash,expires_at) VALUES(v_id,p_csrf_hash,now()+interval '8 hours');
  UPDATE public.admin_users SET last_login_at=now(),failed_login_count=0,locked_until=NULL WHERE id=p_admin_id;
  INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id)
    VALUES(p_admin_id,'auth.login','admin_session',v_id,p_request_id);
  RETURN v_id;
END $$;

CREATE FUNCTION public.rotate_gate_atomic(p_actor_id uuid,p_hash text,p_request_id uuid)
RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_version bigint;
BEGIN
  PERFORM 1 FROM public.security_configuration WHERE id FOR UPDATE;
  PERFORM 1 FROM public.admin_users WHERE id=p_actor_id AND is_active AND role='super_admin' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  UPDATE public.security_configuration SET gate_hash=p_hash,gate_version=gate_version+1,updated_at=now()
    WHERE id RETURNING gate_version INTO v_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'Gate configuration missing'; END IF;
  UPDATE public.gate_sessions SET revoked_at=now() WHERE revoked_at IS NULL;
  INSERT INTO public.admin_actions(actor_id,action,target_type,request_id,metadata)
    VALUES(p_actor_id,'security.gate_rotated','security_configuration',p_request_id,jsonb_build_object('version',v_version));
  RETURN v_version;
END $$;

CREATE FUNCTION public.protect_audit_rows() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF current_user NOT IN ('postgres','supabase_admin') THEN
    RAISE EXCEPTION 'Audit records are append-only' USING ERRCODE='42501';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER admin_actions_append_only BEFORE UPDATE OR DELETE ON public.admin_actions
  FOR EACH ROW EXECUTE FUNCTION public.protect_audit_rows();
CREATE FUNCTION public.revoke_disabled_account() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF (OLD.is_active AND NOT NEW.is_active) OR OLD.password_hash IS DISTINCT FROM NEW.password_hash THEN
    UPDATE public.admin_sessions SET revoked_at=now() WHERE admin_user_id=NEW.id AND revoked_at IS NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER admin_user_revoke_sessions AFTER UPDATE ON public.admin_users
  FOR EACH ROW EXECUTE FUNCTION public.revoke_disabled_account();

DO $$ DECLARE t record; BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t.tablename);
  END LOOP;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
COMMIT;
