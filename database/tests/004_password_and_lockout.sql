BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active)
VALUES('40000000-0000-4000-8000-000000000001','password-fixture@example.test','fixture-old-hash','super_admin',true);
DO $$ DECLARE v_id uuid := '40000000-0000-4000-8000-000000000001'; v_session uuid; BEGIN
  FOR n IN 1..5 LOOP PERFORM public.record_login_failure(v_id,'fixture-old-hash'); END LOOP;
  IF NOT EXISTS(SELECT 1 FROM public.admin_users WHERE id=v_id AND failed_login_count=5 AND locked_until>now()) THEN
    RAISE EXCEPTION 'Persistent account lockout failed';
  END IF;
  UPDATE public.admin_users SET locked_until=NULL WHERE id=v_id;
  INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(v_id,repeat('4',64)) RETURNING id INTO v_session;
  INSERT INTO public.csrf_tokens(session_id,token_hash,expires_at) VALUES(v_session,repeat('5',64),now()+interval '8 hours');
  INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(v_id,repeat('6',64));
  PERFORM public.change_password_atomic(v_id,v_session,'fixture-old-hash',
    'scrypt$32768$8$1$'||repeat('A',22)||'$'||repeat('B',86),repeat('7',64),repeat('8',64),gen_random_uuid());
  IF EXISTS(SELECT 1 FROM public.admin_sessions WHERE token_hash=repeat('6',64) AND revoked_at IS NULL)
    OR NOT EXISTS(SELECT 1 FROM public.admin_sessions WHERE id=v_session AND token_hash=repeat('7',64) AND revoked_at IS NULL)
    OR NOT EXISTS(SELECT 1 FROM public.csrf_tokens WHERE session_id=v_session AND token_hash=repeat('8',64)) THEN
    RAISE EXCEPTION 'Atomic password token rotation or other-session revocation failed';
  END IF;
  BEGIN
    PERFORM public.change_password_atomic(v_id,v_session,'fixture-old-hash',
      'scrypt$32768$8$1$'||repeat('A',22)||'$'||repeat('B',86),repeat('9',64),repeat('a',64),gen_random_uuid());
    RAISE EXCEPTION 'Stale verified hash accepted';
  EXCEPTION WHEN invalid_authorization_specification THEN NULL;
  END;
END $$;
ROLLBACK;
