BEGIN;
CREATE OR REPLACE FUNCTION public.mutate_whiteboard(p_actor uuid,p_session uuid,p_verified_hash text,p_id uuid,p_action text,p_version integer,p_updated_at timestamptz,p_document jsonb,
 p_key_hash text,p_request_hash text,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE u public.admin_users;b public.whiteboards;k public.idempotency_keys;target public.admin_users;v_scope text;result jsonb;BEGIN
 -- Shared hierarchy lock prevents concurrent account deactivation racing a save.
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('whiteboard:'||coalesce(p_id::text,p_actor::text),0));
 SELECT * INTO u FROM public.admin_users WHERE id=p_actor AND is_active AND NOT must_change_password AND deleted_at IS NULL FOR SHARE;
 PERFORM 1 FROM public.admin_sessions WHERE id=p_session AND admin_user_id=p_actor AND revoked_at IS NULL AND idle_expires_at>now() AND absolute_expires_at>now();
 IF u.id IS NULL OR NOT FOUND THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 IF p_action IN ('share','unshare') AND (u.password_hash IS DISTINCT FROM p_verified_hash OR u.locked_until>now()) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 IF p_action IS NULL OR p_action NOT IN ('create','save','rename','archive','restore','share','unshare') THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
 IF p_action='create' THEN
  IF NOT public.can_operate_whiteboard(u.id,NULL,'create',(p_document->>'teamId')::uuid) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 ELSE
  SELECT * INTO b FROM public.whiteboards WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_operate_whiteboard(u.id,b.id,'read') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  IF NOT public.can_operate_whiteboard(u.id,b.id,CASE p_action WHEN 'save' THEN 'update' WHEN 'rename' THEN 'update' WHEN 'archive' THEN 'delete' WHEN 'restore' THEN 'restore' ELSE 'manage' END)
   THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 END IF;
 v_scope:='whiteboards.'||p_action||':'||u.id||':'||coalesce(p_id::text,'new');
 SELECT * INTO k FROM public.idempotency_keys WHERE idempotency_keys.scope=v_scope AND key_hash=p_key_hash;
 IF FOUND THEN IF k.request_hash<>p_request_hash THEN RAISE EXCEPTION 'CONFLICT';END IF;RETURN k.result;END IF;
 IF p_action='create' THEN
  IF length(trim(p_document->>'name')) NOT BETWEEN 2 AND 100 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
  INSERT INTO public.whiteboards(name,team_id,created_by,updated_by,document) VALUES(trim(p_document->>'name'),(p_document->>'teamId')::uuid,u.id,u.id,
   '{"elements":[],"appState":{"viewBackgroundColor":"#f2f3f5"}}') RETURNING * INTO b;
 ELSE
  IF b.version IS DISTINCT FROM p_version OR b.updated_at IS DISTINCT FROM p_updated_at THEN RAISE EXCEPTION 'CONFLICT';END IF;
  IF p_action='save' THEN
   IF jsonb_typeof(p_document->'elements') IS DISTINCT FROM 'array' OR octet_length(p_document::text)>2097152 OR jsonb_array_length(p_document->'elements')>2000 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
   UPDATE public.whiteboards SET document=p_document WHERE id=b.id;
  ELSIF p_action='rename' THEN
   IF length(trim(p_document->>'name')) NOT BETWEEN 2 AND 100 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
   UPDATE public.whiteboards SET name=trim(p_document->>'name') WHERE id=b.id;
  ELSIF p_action='archive' THEN UPDATE public.whiteboards SET deleted_at=now() WHERE id=b.id;
  ELSIF p_action='restore' THEN
   IF b.deleted_at IS NULL THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
   UPDATE public.whiteboards SET deleted_at=NULL WHERE id=b.id;
  ELSE
   SELECT * INTO target FROM public.admin_users WHERE email=p_document->>'email';
   IF NOT FOUND OR target.id=b.created_by OR (u.role<>'super_admin' AND target.role='super_admin') THEN RAISE EXCEPTION 'ACCOUNT_NOT_READY';END IF;
   IF p_action='share' AND (NOT target.is_active OR target.must_change_password OR target.deleted_at IS NOT NULL) THEN RAISE EXCEPTION 'ACCOUNT_NOT_READY';END IF;
   IF p_action='share' AND b.team_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.team_memberships WHERE team_id=b.team_id AND admin_user_id=target.id AND is_active)
    THEN RAISE EXCEPTION 'ACCOUNT_NOT_READY';END IF;
   IF p_action='share' THEN
    IF p_document->>'role' NOT IN ('viewer','editor') THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
    INSERT INTO public.whiteboard_collaborators(board_id,user_id,role) VALUES(b.id,target.id,p_document->>'role') ON CONFLICT(board_id,user_id)
     DO UPDATE SET role=EXCLUDED.role,is_active=true,updated_at=now();
   ELSE UPDATE public.whiteboard_collaborators SET is_active=false,updated_at=now() WHERE board_id=b.id AND user_id=target.id;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
   END IF;
  END IF;
  UPDATE public.whiteboards SET version=version+1,updated_at=clock_timestamp(),updated_by=u.id WHERE id=b.id RETURNING * INTO b;
 END IF;
 result:=coalesce(public.whiteboard_metadata(u.id,b.id),to_jsonb(b)-'document'||'{"actions":[]}'::jsonb);
 INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result) VALUES(v_scope,p_key_hash,p_request_hash,200,result);
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata) VALUES(u.id,'whiteboards.'||p_action,'whiteboard',b.id,p_request_id,jsonb_build_object('version',b.version));
 RETURN result;
END $$;
COMMIT;

