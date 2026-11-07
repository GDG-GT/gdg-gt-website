BEGIN;
CREATE FUNCTION public.bootstrap_initial_owner(p_email text,p_name text,p_hash text,p_gate_hash text) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE owner_id uuid;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));
 LOCK TABLE public.admin_users IN EXCLUSIVE MODE;
 IF EXISTS(SELECT 1 FROM public.admin_users) THEN RAISE EXCEPTION 'INITIAL_OWNER_EXISTS';END IF;
 IF length(btrim(coalesce(p_email,''))) NOT BETWEEN 3 AND 255 OR p_email NOT LIKE '%@%' OR length(btrim(coalesce(p_name,''))) NOT BETWEEN 1 AND 100 OR p_hash NOT LIKE 'scrypt$%' OR p_hash IS NULL OR p_gate_hash NOT LIKE 'scrypt$%' OR p_gate_hash IS NULL THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 INSERT INTO public.admin_users(email,display_name,password_hash,role,is_active,must_change_password,password_changed_at)
 VALUES(lower(btrim(p_email)),btrim(p_name),p_hash,'super_admin',true,false,now()) RETURNING id INTO owner_id;
 INSERT INTO public.security_configuration(id,gate_hash) VALUES(true,p_gate_hash)
 ON CONFLICT(id) DO UPDATE SET gate_hash=EXCLUDED.gate_hash,gate_version=public.security_configuration.gate_version+1,updated_at=now();
 UPDATE public.gate_sessions SET revoked_at=now() WHERE revoked_at IS NULL;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id) VALUES(owner_id,'security.initial_owner_created','admin_user',owner_id);
 RETURN owner_id;
END $$;
REVOKE ALL ON FUNCTION public.bootstrap_initial_owner(text,text,text,text) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.bootstrap_initial_owner(text,text,text,text) TO service_role;
COMMIT;
