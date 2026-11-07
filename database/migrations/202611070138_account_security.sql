BEGIN;
CREATE FUNCTION public.read_account_security(p_actor uuid,p_session uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NOT gdg_security.member_transfer_session(p_actor,p_session) OR NOT EXISTS(SELECT 1 FROM public.admin_users WHERE id=p_actor AND role='super_admin') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 RETURN (SELECT jsonb_build_object('version',gate_version,'rotatedAt',updated_at,'checkedAt',now(),
  'activeAccounts',(SELECT count(*) FROM public.admin_users WHERE is_active AND deleted_at IS NULL),
  'lockedAccounts',(SELECT count(*) FROM public.admin_users WHERE locked_until>now() AND deleted_at IS NULL),
  'setupRequired',(SELECT count(*) FROM public.admin_users WHERE must_change_password AND is_active AND deleted_at IS NULL),
  'activeSessions',(SELECT count(*) FROM public.admin_sessions s JOIN public.admin_users u ON u.id=s.admin_user_id WHERE u.is_active AND u.deleted_at IS NULL AND s.revoked_at IS NULL AND s.idle_expires_at>now() AND s.absolute_expires_at>now())) FROM public.security_configuration WHERE id);
END $$;
CREATE FUNCTION public.rotate_gate_reviewed(p_actor uuid,p_session uuid,p_verified_hash text,p_expected_version bigint,p_hash text,p_key_hash text,p_request_hash text,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE k public.idempotency_keys;v bigint;r jsonb;scope_key text:='security.gate:'||p_actor||':'||p_session;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));
 PERFORM 1 FROM public.admin_users WHERE id=p_actor FOR UPDATE;
 PERFORM 1 FROM public.admin_sessions WHERE id=p_session AND admin_user_id=p_actor FOR UPDATE;
 IF NOT gdg_security.member_transfer_session(p_actor,p_session) OR NOT EXISTS(SELECT 1 FROM public.admin_users WHERE id=p_actor AND role='super_admin' AND password_hash=p_verified_hash AND (locked_until IS NULL OR locked_until<=now())) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$' OR p_request_hash IS NULL OR p_request_hash!~'^[a-f0-9]{64}$' OR p_hash IS NULL OR p_hash NOT LIKE 'scrypt$%' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 SELECT * INTO k FROM public.idempotency_keys WHERE scope=scope_key AND key_hash=p_key_hash;
 IF FOUND THEN
  IF k.request_hash IS DISTINCT FROM p_request_hash THEN RAISE EXCEPTION 'CONFLICT';END IF;
  IF k.expires_at<=now() THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  RETURN k.result;
 END IF;
 SELECT gate_version INTO v FROM public.security_configuration WHERE id FOR UPDATE;
 IF v IS NULL OR v IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'CONFLICT';END IF;
 UPDATE public.security_configuration SET gate_hash=p_hash,gate_version=gate_version+1,updated_at=now() WHERE id RETURNING gate_version INTO v;
 UPDATE public.gate_sessions SET revoked_at=now() WHERE revoked_at IS NULL;
 INSERT INTO public.admin_actions(actor_id,action,target_type,request_id,metadata) VALUES(p_actor,'security.gate_rotated','security_configuration',p_request_id,jsonb_build_object('version',v));
 r:=jsonb_build_object('rotated',true,'version',v);
 INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result) VALUES(scope_key,p_key_hash,p_request_hash,200,r);
 RETURN r;
END $$;
-- Retire the old mutation without session/password/version protection.
REVOKE ALL ON FUNCTION public.rotate_gate_atomic(uuid,text,uuid) FROM service_role;
REVOKE ALL ON FUNCTION public.read_account_security(uuid,uuid),public.rotate_gate_reviewed(uuid,uuid,text,bigint,text,text,text,uuid) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.read_account_security(uuid,uuid),public.rotate_gate_reviewed(uuid,uuid,text,bigint,text,text,text,uuid) TO service_role;
COMMIT;
