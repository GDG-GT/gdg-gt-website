BEGIN;
DO $$ DECLARE t record; f record; role_name text; v_exists boolean; BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid=('public.'||quote_ident(t.tablename))::regclass) THEN
      RAISE EXCEPTION 'SEC-TEST-001: RLS missing on %',t.tablename;
    END IF;
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF has_table_privilege(role_name,'public.'||quote_ident(t.tablename),'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
        RAISE EXCEPTION 'SEC-TEST-002: direct browser privilege on % for %',t.tablename,role_name;
      END IF;
    END LOOP;
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I)',t.tablename) INTO v_exists;
    IF v_exists THEN RAISE EXCEPTION 'SEC-TEST-003: unexpected seed record in %',t.tablename; END IF;
  END LOOP;
  FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' LOOP
    IF has_function_privilege('anon',f.oid,'EXECUTE') OR has_function_privilege('authenticated',f.oid,'EXECUTE') THEN
      RAISE EXCEPTION 'SEC-TEST-004: browser function execution privilege';
    END IF;
  END LOOP;
END $$;

INSERT INTO public.admin_users(id,email,password_hash,role,display_name)
VALUES ('10000000-0000-4000-8000-000000000001','security-fixture@example.test','fixture-not-a-password','super_admin','Security fixture');
INSERT INTO public.security_configuration(gate_hash) VALUES('fixture-gate-hash');
INSERT INTO public.gate_sessions(token_hash,gate_version) VALUES(repeat('d',64),1);
DO $$ DECLARE v_id uuid; v_result jsonb; v_expiry timestamptz; n integer; BEGIN
  v_id := public.create_server_session('10000000-0000-4000-8000-000000000001',repeat('a',64),repeat('b',64),repeat('d',64),'fixture-not-a-password',gen_random_uuid());
  IF NOT EXISTS(SELECT 1 FROM public.csrf_tokens WHERE session_id=v_id AND token_hash=repeat('b',64) AND expires_at>now()) THEN
    RAISE EXCEPTION 'AUTH-TEST-001: CSRF not bound to server session';
  END IF;
  v_result := public.validate_server_session(repeat('a',64));
  IF v_result->'user'->>'role' <> 'super_admin' OR (v_result->'user') ? 'password_hash' THEN
    RAISE EXCEPTION 'AUTH-TEST-002: invalid or excessive session response';
  END IF;
  IF public.validate_server_session(repeat('f',64)) IS NOT NULL THEN RAISE EXCEPTION 'AUTH-TEST-003: forged session accepted'; END IF;
  UPDATE public.admin_users SET role='team_member' WHERE id='10000000-0000-4000-8000-000000000001';
  v_result := public.validate_server_session(repeat('a',64));
  IF v_result->'user'->>'role' <> 'team_member' THEN RAISE EXCEPTION 'AUTH-TEST-004: stale role trusted'; END IF;
  UPDATE public.admin_sessions SET idle_expires_at=now()-interval '1 second' WHERE id=v_id;
  IF public.validate_server_session(repeat('a',64)) IS NOT NULL THEN RAISE EXCEPTION 'AUTH-TEST-005: idle expiry ignored'; END IF;
  UPDATE public.admin_sessions SET idle_expires_at=now()+interval '8 hours',absolute_expires_at=now()+interval '1 hour' WHERE id=v_id;
  PERFORM public.validate_server_session(repeat('a',64));
  IF EXISTS(SELECT 1 FROM public.admin_sessions WHERE id=v_id AND idle_expires_at>absolute_expires_at) THEN
    RAISE EXCEPTION 'AUTH-TEST-006: idle refresh exceeds absolute expiry';
  END IF;
  UPDATE public.admin_users SET is_active=false WHERE id='10000000-0000-4000-8000-000000000001';
  IF public.validate_server_session(repeat('a',64)) IS NOT NULL OR EXISTS(SELECT 1 FROM public.admin_sessions WHERE id=v_id AND revoked_at IS NULL) THEN
    RAISE EXCEPTION 'AUTH-TEST-007: deactivation did not revoke access';
  END IF;
  FOR n IN 1..5 LOOP
    v_result := public.take_rate_limit('gate-test',repeat('c',64),5,900);
    IF NOT (v_result->>'allowed')::boolean THEN RAISE EXCEPTION 'AUTH-TEST-008: premature lockout'; END IF;
  END LOOP;
  v_result := public.take_rate_limit('gate-test',repeat('c',64),5,900);
  IF (v_result->>'allowed')::boolean THEN RAISE EXCEPTION 'AUTH-TEST-009: lockout absent'; END IF;
  -- A recent attempt in the previous wall-clock bucket still belongs to the sliding window.
  UPDATE public.rate_limit_windows SET window_start=window_start-interval '14 minutes',expires_at=now()+interval '1 minute'
    WHERE scope='gate-test';
  v_result := public.take_rate_limit('gate-test',repeat('c',64),5,900);
  IF (v_result->>'allowed')::boolean THEN RAISE EXCEPTION 'AUTH-TEST-010: sliding window bypass'; END IF;
END $$;
INSERT INTO public.admin_actions(action) VALUES ('test.append-only');
SET LOCAL ROLE service_role;
DO $$ BEGIN
  BEGIN
    UPDATE public.admin_actions SET action='tampered';
    RAISE EXCEPTION 'SEC-TEST-005: audit update was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    DELETE FROM public.admin_actions;
    RAISE EXCEPTION 'SEC-TEST-006: audit deletion was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
