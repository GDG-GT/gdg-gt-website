BEGIN;
CREATE FUNCTION public.inspect_community_member_write(p_actor uuid,p_session uuid,p_id uuid,p_action text,p_revision integer,p_document jsonb,p_key_hash text,p_request_hash text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE m public.members;profile public.team_members;k public.idempotency_keys;team uuid;required text;retry boolean;BEGIN
 IF NOT gdg_security.member_transfer_session(p_actor,p_session) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_action IS NULL OR p_action NOT IN('create','update','archive','restore','sync_profile','unmerge') OR(p_action='create') IS DISTINCT FROM(p_id IS NULL) OR p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$' OR p_request_hash IS NULL OR p_request_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 required:=CASE WHEN p_action='create' THEN 'create' WHEN p_action IN('archive','restore') THEN 'delete' WHEN p_action='unmerge' THEN 'merge' ELSE 'update' END;
 IF p_id IS NULL THEN team:=(p_document->>'teamId')::uuid;
 ELSE SELECT * INTO m FROM public.members WHERE id=p_id;IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;team:=m.team_id;END IF;
 IF NOT public.can_operate_member(p_actor,team,'read') OR NOT public.can_operate_member(p_actor,team,required) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_action='sync_profile' THEN
  SELECT * INTO profile FROM public.team_members WHERE member_id=m.id AND deleted_at IS NULL;
  IF NOT public.can_operate_content(p_actor,'team-profiles','read',team) OR(profile.id IS NOT NULL AND profile.team_id IS DISTINCT FROM team) OR NOT(CASE WHEN profile.id IS NULL THEN public.can_operate_content(p_actor,'team-profiles','create',team) ELSE public.can_operate_content(p_actor,'team-profiles','update',team) END) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 END IF;
 SELECT * INTO k FROM public.idempotency_keys WHERE scope='member-write:'||p_actor||':'||p_session||':'||p_action||':'||coalesce(p_id::text,'new') AND key_hash=p_key_hash;
 IF FOUND THEN
  IF k.request_hash IS DISTINCT FROM p_request_hash THEN RAISE EXCEPTION 'CONFLICT';END IF;
  IF k.expires_at<=now() THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  IF p_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.members WHERE id=(k.result->>'id')::uuid AND team_id IS NOT DISTINCT FROM team AND public.can_operate_member(p_actor,team_id,'read')) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 END IF;
 retry:=p_id IS NULL OR(m.revision=p_revision AND(m.merged_into_id IS NULL OR p_action='unmerge') AND(m.deleted_at IS NULL OR p_action IN('restore','unmerge')) AND(p_action<>'restore' OR m.deleted_at IS NOT NULL) AND(p_action<>'unmerge' OR m.merged_into_id IS NOT NULL));
 IF p_action='sync_profile' THEN retry:=retry AND m.is_active AND(profile.id IS NULL OR profile.revision=(p_document->>'profileRevision')::integer);END IF;
 RETURN jsonb_build_object('committed',k.key_hash IS NOT NULL,'canRetry',coalesce(k.key_hash IS NULL AND retry,false),'currentRevision',coalesce(m.revision,0),'receipt',CASE WHEN k.key_hash IS NULL THEN NULL ELSE k.result END);
END $$;
CREATE FUNCTION public.mutate_community_member_write(p_actor uuid,p_session uuid,p_verified_hash text,p_id uuid,p_action text,p_revision integer,p_document jsonb,p_key_hash text,p_request_hash text,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE inspected jsonb;result jsonb;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('team-administration',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('community-members',0));
 PERFORM 1 FROM public.admin_users WHERE id=p_actor FOR UPDATE;PERFORM 1 FROM public.admin_sessions WHERE id=p_session AND admin_user_id=p_actor FOR UPDATE;
 IF p_id IS NOT NULL THEN PERFORM 1 FROM public.members WHERE id=p_id FOR UPDATE;END IF;
 inspected:=public.inspect_community_member_write(p_actor,p_session,p_id,p_action,p_revision,p_document,p_key_hash,p_request_hash);
 IF(inspected->>'committed')::boolean THEN RETURN inspected->'receipt';END IF;
 IF NOT coalesce((inspected->>'canRetry')::boolean,false) THEN RAISE EXCEPTION 'CONFLICT';END IF;
 result:=public.mutate_community_member(p_actor,p_session,p_verified_hash,p_id,p_action,p_revision,p_document,encode(sha256(convert_to('member-write:'||p_session||':'||p_key_hash,'UTF8')),'hex'),p_request_hash,p_request_id);
 result:=jsonb_build_object('id',result->'id','revision',result->'revision','profileId',result->'profileId');
 INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result)VALUES('member-write:'||p_actor||':'||p_session||':'||p_action||':'||coalesce(p_id::text,'new'),p_key_hash,p_request_hash,200,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.inspect_community_member_write(uuid,uuid,uuid,text,integer,jsonb,text,text),public.mutate_community_member_write(uuid,uuid,text,uuid,text,integer,jsonb,text,text,uuid) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.inspect_community_member_write(uuid,uuid,uuid,text,integer,jsonb,text,text),public.mutate_community_member_write(uuid,uuid,text,uuid,text,integer,jsonb,text,text,uuid) TO service_role;
COMMIT;
