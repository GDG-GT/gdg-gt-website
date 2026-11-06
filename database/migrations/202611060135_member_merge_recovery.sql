BEGIN;
CREATE FUNCTION public.inspect_member_merge_write(p_actor uuid,p_session uuid,p_action text,p_document jsonb,p_token_hash text,p_key_hash text,p_request_hash text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE a public.members;b public.members;v gdg_security.member_merge_reviews;k public.idempotency_keys;r jsonb;retry boolean;BEGIN
 IF NOT gdg_security.member_transfer_session(p_actor,p_session) OR NOT public.can_operate_member(p_actor,NULL,'merge') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_action='preview' THEN
  SELECT * INTO a FROM public.members WHERE id=(p_document->>'sourceId')::uuid;
  SELECT * INTO b FROM public.members WHERE id=(p_document->>'targetId')::uuid;
 ELSE
  SELECT * INTO v FROM gdg_security.member_merge_reviews WHERE id=(p_document->>'reviewId')::uuid AND actor_id=p_actor AND session_id=p_session AND token_hash=p_token_hash;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  SELECT * INTO a FROM public.members WHERE id=v.source_id;SELECT * INTO b FROM public.members WHERE id=v.target_id;
 END IF;
 IF a.id IS NULL OR b.id IS NULL OR a.id=b.id OR NOT public.can_operate_member(p_actor,a.team_id,'merge') OR NOT public.can_operate_member(p_actor,b.team_id,'merge') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_action IS NULL OR p_action NOT IN('preview','commit') OR p_token_hash IS NULL OR p_token_hash!~'^[a-f0-9]{64}$' OR p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$' OR p_request_hash IS NULL OR p_request_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 SELECT * INTO k FROM public.idempotency_keys WHERE scope='member-merge:'||p_actor||':'||p_session||':'||p_action AND key_hash=p_key_hash;
 IF FOUND THEN
  IF k.request_hash IS DISTINCT FROM p_request_hash THEN RAISE EXCEPTION 'CONFLICT';END IF;
  IF k.expires_at<=now() THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
 END IF;
 retry:=a.team_id IS NOT DISTINCT FROM b.team_id AND a.merged_into_id IS NULL AND b.merged_into_id IS NULL AND b.is_active AND b.deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM public.project_members WHERE member_id=a.id AND is_active) AND NOT EXISTS(SELECT 1 FROM public.team_members WHERE member_id=a.id AND deleted_at IS NULL);
 IF p_action='preview' THEN
  retry:=retry AND a.revision=(p_document->>'sourceRevision')::integer AND b.revision=(p_document->>'targetRevision')::integer;
  IF k.key_hash IS NOT NULL THEN
   SELECT * INTO v FROM gdg_security.member_merge_reviews WHERE id=(k.result->>'reviewId')::uuid AND actor_id=p_actor AND session_id=p_session AND token_hash=p_token_hash;
   IF v.id IS NULL OR v.source_id<>a.id OR v.target_id<>b.id OR v.used_at IS NOT NULL OR v.expires_at<=now() THEN RAISE EXCEPTION 'MEMBER_REVIEW_EXPIRED';END IF;
   IF NOT retry OR v.source_revision<>a.revision OR v.target_revision<>b.revision THEN RAISE EXCEPTION 'CONFLICT';END IF;
   r:=jsonb_build_object('reviewId',v.id,'expiresAt',v.expires_at,'source',public.community_member_projection(p_actor,a.id),'target',public.community_member_projection(p_actor,b.id),'policy','Target fields stay unchanged. Source is retained as an inactive merged reference. No account, permissions, responses or finance records are combined. Active project/profile links must be reviewed first.');
  END IF;
 ELSE
  retry:=retry AND v.used_at IS NULL AND v.expires_at>now() AND a.revision=v.source_revision AND b.revision=v.target_revision AND p_document->>'sourceConfirmation'='MEM-'||upper(replace(a.id::text,'-','')) AND p_document->>'targetConfirmation'='MEM-'||upper(replace(b.id::text,'-',''));
  IF k.key_hash IS NOT NULL THEN r:=k.result;END IF;
 END IF;
 RETURN jsonb_build_object('committed',k.key_hash IS NOT NULL,'canRetry',coalesce(k.key_hash IS NULL AND retry,false),'receipt',r);
END $$;
CREATE FUNCTION public.mutate_member_merge_write(p_actor uuid,p_session uuid,p_action text,p_document jsonb,p_token_hash text,p_verified_hash text,p_key_hash text,p_request_hash text,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE inspected jsonb;r jsonb;s text;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('team-administration',0));PERFORM pg_advisory_xact_lock(hashtextextended('community-members',0));
 PERFORM 1 FROM public.admin_users WHERE id=p_actor FOR UPDATE;PERFORM 1 FROM public.admin_sessions WHERE id=p_session AND admin_user_id=p_actor FOR UPDATE;
 inspected:=public.inspect_member_merge_write(p_actor,p_session,p_action,p_document,p_token_hash,p_key_hash,p_request_hash);
 IF(inspected->>'committed')::boolean THEN RETURN inspected->'receipt';END IF;
 IF NOT(inspected->>'canRetry')::boolean THEN RAISE EXCEPTION 'CONFLICT';END IF;
 s:='member-merge:'||p_actor||':'||p_session||':'||p_action;
 IF p_action='preview' THEN
  r:=public.preview_member_merge(p_actor,p_session,(p_document->>'sourceId')::uuid,(p_document->>'targetId')::uuid,(p_document->>'sourceRevision')::integer,(p_document->>'targetRevision')::integer,p_token_hash,p_request_id);
  INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result)VALUES(s,p_key_hash,p_request_hash,200,jsonb_build_object('reviewId',r->'reviewId'));
 ELSE
  r:=public.commit_member_merge(p_actor,p_session,p_verified_hash,(p_document->>'reviewId')::uuid,p_token_hash,p_document->>'sourceConfirmation',p_document->>'targetConfirmation',encode(sha256(convert_to('member-merge:'||p_session||':'||p_key_hash,'UTF8')),'hex'),p_request_hash,p_request_id);
  INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result)VALUES(s,p_key_hash,p_request_hash,200,r);
 END IF;
 RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.inspect_member_merge_write(uuid,uuid,text,jsonb,text,text,text),public.mutate_member_merge_write(uuid,uuid,text,jsonb,text,text,text,text,uuid) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.inspect_member_merge_write(uuid,uuid,text,jsonb,text,text,text),public.mutate_member_merge_write(uuid,uuid,text,jsonb,text,text,text,text,uuid) TO service_role;
COMMIT;
