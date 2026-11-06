BEGIN;
-- The first semantic UPDATE already advances the revision through its guard.
-- Keep the completed operation at one step from its locked original snapshot.
CREATE OR REPLACE FUNCTION public.mutate_account(p_actor uuid,p_session uuid,p_verified_hash text,p_target uuid,
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
  UPDATE public.admin_users SET revision=t.revision+1,updated_at=now() WHERE id=t.id;
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

CREATE FUNCTION public.mutate_account_workspace(
 p_actor uuid,p_session uuid,p_verified_hash text,p_target uuid,p_action text,p_revision integer,
 p_document jsonb,p_token_hash text,p_secret text,p_key_hash text,p_request_hash text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE a public.admin_users;t public.admin_users;k public.idempotency_keys;v_scope text:='account-workspace:'||p_actor;v_result jsonb;v_role text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));
 SELECT * INTO a FROM public.admin_users WHERE id=p_actor FOR UPDATE;
 IF NOT FOUND OR NOT a.is_active OR a.deleted_at IS NOT NULL OR a.must_change_password
 OR a.password_hash IS DISTINCT FROM p_verified_hash OR a.locked_until>now() OR a.role NOT IN('super_admin','admin')
 THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM public.admin_sessions WHERE id=p_session AND admin_user_id=p_actor AND revoked_at IS NULL
 AND idle_expires_at>now() AND absolute_expires_at>now() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 IF p_action IS NULL OR p_action NOT IN('create','update','activate','deactivate','archive','restore','reset','revoke_sessions')
 OR(p_action='create') IS DISTINCT FROM(p_target IS NULL)
 OR p_document IS NULL OR jsonb_typeof(p_document)<>'object'
 OR p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$'
 OR p_request_hash IS NULL OR p_request_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_scope||':'||p_key_hash,0));
 IF p_target IS NOT NULL THEN
  SELECT * INTO t FROM public.admin_users WHERE id=p_target FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  v_role:=CASE WHEN p_action='update' THEN p_document->>'role' ELSE t.role END;
  IF NOT public.can_manage_account(a,t,v_role) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 ELSE
  v_role:=p_document->>'role';
  IF v_role IS NULL OR v_role NOT IN('super_admin','admin','team_member','blog_editor')
  OR(a.role='admin' AND v_role NOT IN('team_member','blog_editor')) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 END IF;
 SELECT * INTO k FROM public.idempotency_keys WHERE scope=v_scope AND key_hash=p_key_hash;
 IF FOUND THEN
  IF k.request_hash IS DISTINCT FROM p_request_hash THEN RAISE EXCEPTION 'CONFLICT';END IF;
  SELECT * INTO t FROM public.admin_users WHERE id=(k.result->>'id')::uuid FOR SHARE;
  IF NOT FOUND OR NOT public.can_manage_account(a,t,CASE WHEN p_action='update' THEN v_role ELSE t.role END)
  THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  RETURN k.result;
 END IF;
 v_result:=public.mutate_account(p_actor,p_session,p_verified_hash,p_target,p_action,p_revision,p_document,p_token_hash,p_secret,p_request_id);
 INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result)
 VALUES(v_scope,p_key_hash,p_request_hash,200,v_result);
 RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.mutate_account_workspace(uuid,uuid,text,uuid,text,integer,jsonb,text,text,text,text,uuid) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.mutate_account_workspace(uuid,uuid,text,uuid,text,integer,jsonb,text,text,text,text,uuid) TO service_role;
COMMIT;
