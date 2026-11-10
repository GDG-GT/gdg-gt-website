BEGIN;
-- Optional URLs have one empty representation. Reject new duplicate identities
-- atomically, without altering pre-existing profiles during a schema migration.
CREATE FUNCTION gdg_security.guard_team_profile_identity() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));
 NEW.portfolio_url:=nullif(btrim(NEW.portfolio_url),'');
 NEW.email:=nullif(lower(btrim(NEW.email)),'');
 IF NEW.email IS NOT NULL AND NEW.deleted_at IS NULL AND
  (TG_OP='INSERT' OR NEW.email IS DISTINCT FROM OLD.email OR NEW.team_id IS DISTINCT FROM OLD.team_id OR OLD.deleted_at IS NOT NULL) AND
  EXISTS(SELECT 1 FROM public.team_members p WHERE p.id<>NEW.id AND p.deleted_at IS NULL
   AND p.team_id IS NOT DISTINCT FROM NEW.team_id AND lower(btrim(p.email))=NEW.email) THEN
  RAISE EXCEPTION 'PROFILE_DUPLICATES';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER a_profile_identity_guard BEFORE INSERT OR UPDATE ON public.team_members FOR EACH ROW EXECUTE FUNCTION gdg_security.guard_team_profile_identity();
CREATE FUNCTION gdg_security.find_team_profile(p_email text,p_team uuid,p_member uuid,p_admin uuid) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE p public.team_members;n integer;BEGIN
 SELECT count(*) INTO n FROM public.team_members t WHERE t.deleted_at IS NULL AND t.team_id IS NOT DISTINCT FROM p_team
 AND((p_member IS NOT NULL AND t.member_id=p_member) OR(p_admin IS NOT NULL AND t.admin_user_id=p_admin)
 OR(nullif(btrim(p_email),'') IS NOT NULL AND lower(btrim(t.email))=lower(btrim(p_email))));
 IF n>1 THEN RAISE EXCEPTION 'PROFILE_DUPLICATES';END IF;
 SELECT * INTO p FROM public.team_members t WHERE t.deleted_at IS NULL AND t.team_id IS NOT DISTINCT FROM p_team
 AND((p_member IS NOT NULL AND t.member_id=p_member) OR(p_admin IS NOT NULL AND t.admin_user_id=p_admin)
 OR(nullif(btrim(p_email),'') IS NOT NULL AND lower(btrim(t.email))=lower(btrim(p_email))));
 IF(p_member IS NOT NULL AND p.member_id IS NOT NULL AND p.member_id<>p_member) OR
   (p_admin IS NOT NULL AND p.admin_user_id IS NOT NULL AND p.admin_user_id<>p_admin) THEN RAISE EXCEPTION 'PROFILE_IDENTITY_CONFLICT';END IF;
 IF p.id IS NOT NULL AND (
  (p.member_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.members m WHERE m.id=p.member_id AND m.team_id IS NOT DISTINCT FROM p_team AND lower(btrim(m.email))=lower(btrim(p_email)))) OR
  (p.admin_user_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.admin_users u WHERE u.id=p.admin_user_id AND lower(btrim(u.email))=lower(btrim(p_email))))) THEN RAISE EXCEPTION 'PROFILE_IDENTITY_CONFLICT';END IF;
 RETURN p.id;
END $$;
CREATE FUNCTION gdg_security.member_profile_candidate(p_member uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce((SELECT p.id FROM public.team_members p WHERE p.member_id=m.id AND p.deleted_at IS NULL LIMIT 1),
 (SELECT min(p.id::text)::uuid FROM public.team_members p WHERE p.member_id IS NULL AND p.deleted_at IS NULL
 AND p.team_id IS NOT DISTINCT FROM m.team_id AND lower(btrim(p.email))=lower(btrim(m.email)) HAVING count(*)=1))
 FROM public.members m WHERE m.id=p_member;
$$;
-- Linking two records for the same identity changes no public content.
DO $$ DECLARE source text;updated text;BEGIN
 source:=pg_get_functiondef('public.guard_content_revision()'::regprocedure);
 updated:=replace(source,'''views'',''deleted_at'']','''views'',''deleted_at'',''member_id'',''admin_user_id'']');
 IF updated=source THEN RAISE EXCEPTION 'Profile identity revision guard target changed';END IF;EXECUTE updated;
 source:=pg_get_functiondef('public.community_member_projection(uuid,uuid)'::regprocedure);
 updated:=replace(source,'p.member_id=m.id AND p.deleted_at IS NULL','p.id=gdg_security.member_profile_candidate(m.id) AND p.deleted_at IS NULL');
 updated:=replace(updated,'WHERE member_id=m.id AND deleted_at IS NULL','WHERE id=gdg_security.member_profile_candidate(m.id) AND deleted_at IS NULL');
 IF updated=source THEN RAISE EXCEPTION 'Member profile projection target changed';END IF;EXECUTE updated;
 source:=pg_get_functiondef('public.mutate_community_member(uuid,uuid,text,uuid,text,integer,jsonb,text,text,uuid)'::regprocedure);
 updated:=replace(source,'SELECT * INTO p FROM public.team_members WHERE member_id=m.id AND deleted_at IS NULL FOR UPDATE;',
 'SELECT * INTO p FROM public.team_members WHERE id=gdg_security.find_team_profile(m.email,m.team_id,m.id,NULL) FOR UPDATE;');
 updated:=replace(updated,'SET name=m.name,email=m.email,team_section=m.team_section,is_active=false,revision=revision+1',
 'SET member_id=m.id,name=m.name,email=m.email,team_section=m.team_section,is_active=(p.is_active AND p.name=m.name AND lower(btrim(p.email))=lower(btrim(m.email)) AND p.team_section=m.team_section),revision=revision+1');
 updated:=replace(updated,'''profileId'',p.id)', '''profileId'',p.id,''profileActive'',coalesce((SELECT is_active FROM public.team_members WHERE id=p.id),false))');
 IF updated=source THEN RAISE EXCEPTION 'Member sync identity target changed';END IF;EXECUTE updated;
 source:=pg_get_functiondef('public.mutate_community_member_write(uuid,uuid,text,uuid,text,integer,jsonb,text,text,uuid)'::regprocedure);
 updated:=replace(source,'''profileId'',result->''profileId'')','''profileId'',result->''profileId'',''profileActive'',result->''profileActive'')');
 IF updated=source THEN RAISE EXCEPTION 'Member receipt identity target changed';END IF;EXECUTE updated;
END $$;
CREATE OR REPLACE FUNCTION public.update_own_profile(p_actor uuid,p_display_name text,p_profile jsonb,p_request_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v public.team_members;v_email text;mid uuid;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));
 SELECT email INTO v_email FROM public.admin_users WHERE id=p_actor AND is_active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='28000';END IF;
 IF p_display_name IS NOT NULL THEN UPDATE public.admin_users SET display_name=p_display_name,updated_at=now() WHERE id=p_actor;END IF;
 IF p_profile IS NOT NULL THEN
  SELECT * INTO v FROM public.team_members WHERE admin_user_id=p_actor FOR UPDATE;
  IF NOT FOUND THEN
   SELECT * INTO v FROM public.team_members WHERE id=gdg_security.find_team_profile(v_email,NULL,NULL,p_actor) FOR UPDATE;
   IF FOUND THEN UPDATE public.team_members SET admin_user_id=p_actor WHERE id=v.id;
   ELSE
    SELECT id INTO mid FROM public.members WHERE lower(btrim(email))=lower(btrim(v_email)) AND team_id IS NULL AND deleted_at IS NULL AND merged_into_id IS NULL;
    INSERT INTO public.team_members(name,role,email,admin_user_id,member_id,is_active)
     VALUES(p_profile->>'name',p_profile->>'role',v_email,p_actor,mid,false) RETURNING * INTO v;
   END IF;
  END IF;
  UPDATE public.team_members SET name=p_profile->>'name',role=p_profile->>'role',bio=p_profile->>'bio',image_url=p_profile->>'imageUrl',
   linkedin_url=p_profile->>'linkedinUrl',github_url=p_profile->>'githubUrl',portfolio_url=nullif(btrim(p_profile->>'portfolioUrl'),''),updated_at=now() WHERE id=v.id;
 END IF;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id) VALUES(p_actor,'profile.updated','admin_user',p_actor,p_request_id);
END $$;
CREATE FUNCTION public.review_team_profile_duplicates(p_actor uuid,p_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE p public.team_members;profiles jsonb;BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.admin_users WHERE id=p_actor AND role='super_admin' AND is_active AND deleted_at IS NULL) THEN RAISE EXCEPTION 'FORBIDDEN';END IF;
 SELECT * INTO p FROM public.team_members WHERE id=p_id AND deleted_at IS NULL;
 IF NOT FOUND OR nullif(btrim(p.email),'') IS NULL THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'role',t.role,'revision',t.revision,'published',t.is_active,
 'accountLinked',t.admin_user_id IS NOT NULL,'memberLinked',t.member_id IS NOT NULL) ORDER BY t.is_active DESC,t.created_at,t.id) INTO profiles
 FROM public.team_members t WHERE t.deleted_at IS NULL AND t.team_id IS NOT DISTINCT FROM p.team_id AND lower(btrim(t.email))=lower(btrim(p.email));
 IF jsonb_array_length(profiles)>10 THEN RAISE EXCEPTION 'PROFILE_IDENTITY_CONFLICT';END IF;
 RETURN jsonb_build_object('email',p.email,'profiles',profiles);
END $$;
CREATE FUNCTION public.reconcile_team_profiles(p_actor uuid,p_session uuid,p_id uuid,p_keep uuid,p_profiles jsonb,p_key_hash text,p_request_hash text,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE p public.team_members;keep public.team_members;r public.team_members;k public.idempotency_keys;review jsonb;mid uuid;aid uuid;ids uuid[];result jsonb;s text;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('community-members',0));
 IF NOT EXISTS(SELECT 1 FROM public.admin_users u JOIN public.admin_sessions s ON s.admin_user_id=u.id WHERE u.id=p_actor AND u.role='super_admin' AND u.is_active AND u.deleted_at IS NULL AND NOT u.must_change_password
 AND(u.locked_until IS NULL OR u.locked_until<=now()) AND s.id=p_session AND s.revoked_at IS NULL AND s.idle_expires_at>now() AND s.absolute_expires_at>now()) THEN RAISE EXCEPTION 'FORBIDDEN';END IF;
 IF p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$' OR p_request_hash IS NULL OR p_request_hash!~'^[a-f0-9]{64}$' OR jsonb_typeof(p_profiles) IS DISTINCT FROM 'array' OR jsonb_array_length(p_profiles) NOT BETWEEN 2 AND 10 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 s:='profile-reconcile:'||p_actor||':'||p_session;
 SELECT * INTO k FROM public.idempotency_keys WHERE scope=s AND key_hash=p_key_hash;
 IF FOUND THEN IF k.request_hash<>p_request_hash THEN RAISE EXCEPTION 'CONFLICT';END IF;IF k.expires_at<=now() THEN RAISE EXCEPTION 'INVALID_STATE';END IF;RETURN k.result;END IF;
 review:=public.review_team_profile_duplicates(p_actor,p_id);
 IF jsonb_array_length(review->'profiles')<>jsonb_array_length(p_profiles) OR
  EXISTS(SELECT 1 FROM jsonb_array_elements(review->'profiles') a WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_profiles) b WHERE b->>'id'=a->>'id' AND b->>'revision'=a->>'revision')) THEN RAISE EXCEPTION 'CONFLICT';END IF;
 SELECT * INTO keep FROM public.team_members WHERE id=p_keep AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(review->'profiles') a WHERE a->>'id'=p_keep::text) THEN RAISE EXCEPTION 'CONFLICT';END IF;
 -- Two accounts or members must never be merged as a side effect of profile cleanup.
 IF(SELECT count(DISTINCT t.member_id) FROM public.team_members t JOIN jsonb_array_elements(p_profiles) a ON t.id=(a->>'id')::uuid)>1 OR
   (SELECT count(DISTINCT t.admin_user_id) FROM public.team_members t JOIN jsonb_array_elements(p_profiles) a ON t.id=(a->>'id')::uuid)>1 THEN RAISE EXCEPTION 'PROFILE_IDENTITY_CONFLICT';END IF;
 SELECT min(t.member_id::text)::uuid,min(t.admin_user_id::text)::uuid,array_agg(t.id) FILTER(WHERE t.id<>p_keep) INTO mid,aid,ids
 FROM public.team_members t JOIN jsonb_array_elements(p_profiles) a ON t.id=(a->>'id')::uuid;
 IF(mid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.members m WHERE m.id=mid AND lower(btrim(m.email))=lower(btrim(keep.email)) AND m.team_id IS NOT DISTINCT FROM keep.team_id AND m.deleted_at IS NULL AND m.merged_into_id IS NULL AND(NOT keep.is_active OR m.is_active))) OR
   (aid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.admin_users u WHERE u.id=aid AND lower(btrim(u.email))=lower(btrim(keep.email)))) THEN RAISE EXCEPTION 'PROFILE_IDENTITY_CONFLICT';END IF;
 UPDATE public.team_members SET admin_user_id=NULL,is_active=false,deleted_at=clock_timestamp(),revision=revision+1,updated_at=clock_timestamp() WHERE id=ANY(ids);
 UPDATE public.team_members SET member_id=mid,admin_user_id=aid,revision=revision+1,updated_at=clock_timestamp() WHERE id=p_keep RETURNING * INTO keep;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata) VALUES(p_actor,'profiles.reconciled','team_members',p_keep,p_request_id,jsonb_build_object('archivedIds',ids,'memberId',mid,'accountId',aid));
 result:=jsonb_build_object('record',to_jsonb(keep),'archived',cardinality(ids));
 INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result) VALUES(s,p_key_hash,p_request_hash,200,result);RETURN result;
END $$;
REVOKE ALL ON FUNCTION gdg_security.guard_team_profile_identity(),gdg_security.find_team_profile(text,uuid,uuid,uuid),gdg_security.member_profile_candidate(uuid),public.review_team_profile_duplicates(uuid,uuid),public.reconcile_team_profiles(uuid,uuid,uuid,uuid,jsonb,text,text,uuid) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION gdg_security.guard_team_profile_identity(),gdg_security.find_team_profile(text,uuid,uuid,uuid),gdg_security.member_profile_candidate(uuid),public.review_team_profile_duplicates(uuid,uuid),public.reconcile_team_profiles(uuid,uuid,uuid,uuid,jsonb,text,text,uuid) TO service_role;
COMMIT;
