BEGIN;
ALTER TABLE public.members ADD COLUMN team_id uuid REFERENCES public.admin_teams(id) ON DELETE RESTRICT,
 ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK(revision>0),ADD COLUMN deleted_at timestamptz,
 ADD COLUMN is_core_team boolean NOT NULL DEFAULT false,ADD COLUMN created_by uuid REFERENCES public.admin_users(id) ON DELETE RESTRICT,
 ADD COLUMN merged_into_id uuid REFERENCES public.members(id) ON DELETE RESTRICT,ADD CONSTRAINT community_member_not_self CHECK(merged_into_id IS DISTINCT FROM id);
CREATE UNIQUE INDEX community_email_normalized ON public.members(lower(btrim(email)));
ALTER TABLE public.members ALTER COLUMN category SET NOT NULL,ALTER COLUMN interests SET NOT NULL,ALTER COLUMN is_active SET NOT NULL,ALTER COLUMN team_section SET NOT NULL;
CREATE UNIQUE INDEX community_current_public_profile ON public.team_members(member_id) WHERE member_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX community_scope_updated ON public.members(team_id,updated_at DESC,id DESC);
CREATE TABLE gdg_security.member_merge_reviews(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_id uuid NOT NULL REFERENCES public.admin_users(id),session_id uuid NOT NULL REFERENCES public.admin_sessions(id),
 source_id uuid NOT NULL REFERENCES public.members(id),target_id uuid NOT NULL REFERENCES public.members(id),source_revision integer NOT NULL,target_revision integer NOT NULL,
 token_hash text NOT NULL UNIQUE CHECK(token_hash~'^[a-f0-9]{64}$'),expires_at timestamptz NOT NULL DEFAULT now()+interval '5 minutes',used_at timestamptz,CHECK(source_id<>target_id));
ALTER TABLE gdg_security.member_merge_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON gdg_security.member_merge_reviews FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT SELECT,INSERT,UPDATE ON gdg_security.member_merge_reviews TO service_role;
CREATE FUNCTION gdg_security.retain_community_members() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN RAISE EXCEPTION 'MEMBER_RETAINED';END $$;
CREATE TRIGGER retain_community_members BEFORE DELETE ON public.members FOR EACH ROW EXECUTE FUNCTION gdg_security.retain_community_members();
CREATE FUNCTION public.can_operate_member(p_actor uuid,p_team uuid,p_action text) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT p_action IN('read','create','update','delete','merge') AND EXISTS(SELECT 1 FROM public.admin_users u WHERE u.id=p_actor AND u.is_active AND NOT u.must_change_password AND u.deleted_at IS NULL AND(u.locked_until IS NULL OR u.locked_until<=now()) AND
 ((u.role IN('admin','super_admin') AND(p_action='read' OR p_team IS NULL OR EXISTS(SELECT 1 FROM public.admin_teams WHERE id=p_team AND is_active AND deleted_at IS NULL))) OR
 (u.role='team_member' AND p_action<>'merge' AND EXISTS(SELECT 1 FROM public.team_memberships m JOIN public.admin_teams t ON t.id=m.team_id AND t.is_active AND t.deleted_at IS NULL
 JOIN public.team_page_access a ON a.team_id=t.id AND a.page_path='/admin/members' AND a.can_access
 JOIN public.team_permissions p ON p.team_id=t.id AND p.resource_type='members' AND p.permission='crud'
 WHERE m.admin_user_id=u.id AND m.team_id=p_team AND m.is_active AND CASE p_action WHEN 'read' THEN p.can_read WHEN 'create' THEN p.can_create WHEN 'update' THEN p.can_update WHEN 'delete' THEN p.can_delete ELSE false END))));
$$;
CREATE FUNCTION public.community_member_projection(p_actor uuid,p_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT (to_jsonb(m)-'created_by')||jsonb_build_object('reference','MEM-'||upper(replace(m.id::text,'-','')),'teamName',(SELECT name FROM public.admin_teams WHERE id=m.team_id),
 'actions',(SELECT coalesce(jsonb_agg(a),'[]') FROM unnest(ARRAY['read','create','update','delete','merge'])a WHERE public.can_operate_member(p_actor,m.team_id,a)),
 'publicProfile',(SELECT jsonb_build_object('id',p.id,'revision',p.revision,'active',p.is_active,'name',p.name) FROM public.team_members p WHERE p.member_id=m.id AND p.deleted_at IS NULL AND p.team_id IS NOT DISTINCT FROM m.team_id AND public.can_operate_content(p_actor,'team-profiles','read',p.team_id) LIMIT 1),
 'canSyncProfile',m.is_active AND m.deleted_at IS NULL AND m.merged_into_id IS NULL AND public.can_operate_member(p_actor,m.team_id,'update') AND public.can_operate_content(p_actor,'team-profiles','read',m.team_id)
 AND CASE WHEN EXISTS(SELECT 1 FROM public.team_members WHERE member_id=m.id AND deleted_at IS NULL) THEN EXISTS(SELECT 1 FROM public.team_members p WHERE p.member_id=m.id AND p.deleted_at IS NULL AND p.team_id IS NOT DISTINCT FROM m.team_id AND public.can_operate_content(p_actor,'team-profiles','update',p.team_id)) ELSE public.can_operate_content(p_actor,'team-profiles','create',m.team_id) END,
 'activeProjectCount',(SELECT count(*) FROM public.project_members pm JOIN public.projects p ON p.id=pm.project_id WHERE pm.member_id=m.id AND pm.is_active AND public.can_operate_project(p_actor,p.team_id,'read')))
 FROM public.members m WHERE m.id=p_id AND public.can_operate_member(p_actor,m.team_id,'read');
$$;
CREATE FUNCTION public.list_community_members(p_actor uuid,p_page integer,p_query text,p_state text,p_category text,p_year text,p_active boolean,p_core boolean) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE r jsonb;BEGIN
 IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 10000 OR p_state IS NULL OR p_state NOT IN('current','trash') OR length(coalesce(p_query,''))>100 OR length(coalesce(p_year,''))>50 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 WITH eligible AS(SELECT * FROM public.members m WHERE public.can_operate_member(p_actor,m.team_id,'read') AND(m.deleted_at IS NOT NULL)=(p_state='trash')
 AND(coalesce(p_query,'')='' OR strpos(lower(m.name||' '||m.email||' '||coalesce(m.major,'')),lower(p_query))>0)
 AND(p_category IS NULL OR m.category=p_category) AND(p_year IS NULL OR m.year=p_year) AND(p_active IS NULL OR m.is_active=p_active) AND(p_core IS NULL OR m.is_core_team=p_core)),
 page AS(SELECT * FROM eligible ORDER BY updated_at DESC,id DESC LIMIT 30 OFFSET(p_page-1)*30)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(public.community_member_projection(p_actor,id) ORDER BY updated_at DESC,id DESC) FROM page),'[]'),'total',(SELECT count(*) FROM eligible),'pageSize',30,
 'stats',jsonb_build_object('active',(SELECT count(*) FROM eligible WHERE is_active),'core',(SELECT count(*) FROM eligible WHERE is_core_team),
 'categories',coalesce((SELECT jsonb_object_agg(category,n) FROM(SELECT category,count(*) n FROM eligible GROUP BY category)x),'{}'))) INTO r;RETURN r;
END $$;
CREATE FUNCTION public.mutate_community_member(p_actor uuid,p_session uuid,p_verified_hash text,p_id uuid,p_action text,p_revision integer,p_document jsonb,p_key_hash text,p_request_hash text,p_request_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE u public.admin_users;m public.members;p public.team_members;k public.idempotency_keys;doc jsonb;team uuid;s text;r jsonb;required text;identity_changed boolean;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('community-members',0));
 SELECT * INTO u FROM public.admin_users WHERE id=p_actor AND is_active AND NOT must_change_password AND deleted_at IS NULL AND role IN('admin','super_admin','team_member') AND(locked_until IS NULL OR locked_until<=now());
 IF u.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.admin_sessions WHERE id=p_session AND admin_user_id=u.id AND revoked_at IS NULL AND idle_expires_at>now() AND absolute_expires_at>now()) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 IF p_action IS NULL OR p_action NOT IN('create','update','archive','restore','sync_profile','unmerge') OR p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$' OR p_request_hash IS NULL OR p_request_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 required:=CASE WHEN p_action='create' THEN 'create' WHEN p_action IN('archive','restore') THEN 'delete' WHEN p_action='unmerge' THEN 'merge' ELSE 'update' END;
 IF p_action='create' THEN team:=(p_document->>'teamId')::uuid;
 ELSE SELECT * INTO m FROM public.members WHERE id=p_id FOR UPDATE;team:=m.team_id;
  IF m.id IS NULL OR NOT public.can_operate_member(u.id,team,'read') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 END IF;
 IF NOT public.can_operate_member(u.id,team,'read') OR NOT public.can_operate_member(u.id,team,required) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 IF p_action='sync_profile' THEN
  SELECT * INTO p FROM public.team_members WHERE member_id=m.id AND deleted_at IS NULL;
  IF NOT public.can_operate_content(u.id,'team-profiles','read',m.team_id) OR(p.id IS NOT NULL AND p.team_id IS DISTINCT FROM m.team_id)
   OR NOT(public.can_operate_content(u.id,'team-profiles','create',m.team_id) OR public.can_operate_content(u.id,'team-profiles','update',m.team_id)) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 END IF;
 IF p_action IN('archive','restore','sync_profile','unmerge') AND(p_verified_hash IS NULL OR p_verified_hash IS DISTINCT FROM u.password_hash OR p_document->>'confirmation' IS DISTINCT FROM 'MEM-'||upper(replace(m.id::text,'-',''))) THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 s:='member.'||p_action||':'||u.id||':'||coalesce(p_id::text,'new');SELECT * INTO k FROM public.idempotency_keys WHERE scope=s AND key_hash=p_key_hash;
 IF FOUND THEN IF k.request_hash IS DISTINCT FROM p_request_hash THEN RAISE EXCEPTION 'CONFLICT';END IF;RETURN k.result;END IF;
 IF p_action<>'create' THEN
  IF m.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'CONFLICT';END IF;
  IF m.merged_into_id IS NOT NULL AND p_action<>'unmerge' OR m.deleted_at IS NOT NULL AND p_action NOT IN('restore','unmerge') OR p_action='restore' AND m.deleted_at IS NULL OR p_action='unmerge' AND m.merged_into_id IS NULL THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
 END IF;
 doc:=p_document->'record';
 IF p_action IN('create','update') THEN
  IF length(coalesce(doc->>'name','')) NOT BETWEEN 2 AND 100 OR length(coalesce(doc->>'email','')) NOT BETWEEN 3 AND 254 OR doc->>'email' NOT LIKE '%@%' OR coalesce(doc->>'category','') NOT IN('founder','organizer','lead','active','member','alumni') OR jsonb_typeof(doc->'interests') IS DISTINCT FROM 'array' OR jsonb_array_length(doc->'interests')>30 OR jsonb_typeof(doc->'is_active') IS DISTINCT FROM 'boolean' OR jsonb_typeof(doc->'is_core_team') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
  IF p_action='create' THEN INSERT INTO public.members(name,email,team_id,created_by) VALUES(doc->>'name',lower(btrim(doc->>'email')),team,u.id) RETURNING * INTO m;END IF;
  identity_changed:=(doc->>'name' IS DISTINCT FROM m.name OR lower(btrim(doc->>'email')) IS DISTINCT FROM m.email OR doc->>'team_section' IS DISTINCT FROM m.team_section);
  UPDATE public.members SET name=doc->>'name',email=lower(btrim(doc->>'email')),phone=nullif(doc->>'phone',''),year=nullif(doc->>'year',''),major=nullif(doc->>'major',''),category=doc->>'category',
   interests=ARRAY(SELECT jsonb_array_elements_text(doc->'interests')),is_active=(doc->>'is_active')::boolean,is_core_team=(doc->>'is_core_team')::boolean,team_section=doc->>'team_section' WHERE id=m.id RETURNING * INTO m;
  -- Contact/name changes never silently publish or rewrite a public profile.
  UPDATE public.team_members SET is_active=false,revision=revision+1,updated_at=clock_timestamp() WHERE member_id=m.id AND is_active
   AND(NOT m.is_active OR identity_changed);
 ELSIF p_action IN('archive','restore','unmerge') THEN
  UPDATE public.members SET is_active=false,deleted_at=CASE WHEN p_action='archive' THEN now() ELSE NULL END,merged_into_id=CASE WHEN p_action='unmerge' THEN NULL ELSE merged_into_id END WHERE id=m.id RETURNING * INTO m;
  UPDATE public.team_members SET is_active=false,revision=revision+1,updated_at=clock_timestamp() WHERE member_id=m.id AND is_active;
 ELSIF p_action='sync_profile' THEN
  IF NOT m.is_active THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  SELECT * INTO p FROM public.team_members WHERE member_id=m.id AND deleted_at IS NULL FOR UPDATE;
  IF p.id IS NULL THEN
   IF NOT public.can_operate_content(u.id,'team-profiles','create',m.team_id) OR NOT public.can_operate_content(u.id,'team-profiles','read',m.team_id) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
   INSERT INTO public.team_members(name,role,email,member_id,team_section,team_id,created_by,is_active)
    VALUES(m.name,CASE m.category WHEN 'founder' THEN 'Founder' WHEN 'organizer' THEN 'Organizer' WHEN 'lead' THEN 'Team Lead' WHEN 'alumni' THEN 'Alumni' ELSE 'Community Member' END,m.email,m.id,m.team_section,m.team_id,u.id,false) RETURNING * INTO p;
  ELSE
   IF p.team_id IS DISTINCT FROM m.team_id OR NOT public.can_operate_content(u.id,'team-profiles','read',p.team_id) OR NOT public.can_operate_content(u.id,'team-profiles','update',p.team_id) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
   IF p.revision IS DISTINCT FROM(p_document->>'profileRevision')::integer THEN RAISE EXCEPTION 'CONFLICT';END IF;
   UPDATE public.team_members SET name=m.name,email=m.email,team_section=m.team_section,is_active=false,revision=revision+1,updated_at=clock_timestamp() WHERE id=p.id;
  END IF;
 END IF;
 UPDATE public.members SET revision=CASE WHEN p_action='create' THEN revision ELSE revision+1 END,updated_at=clock_timestamp() WHERE id=m.id RETURNING * INTO m;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata) VALUES(u.id,'members.'||p_action,'member',m.id,p_request_id,jsonb_build_object('revision',m.revision,'teamId',m.team_id,'profileId',p.id));
 r:=jsonb_build_object('id',m.id,'revision',m.revision,'profileId',p.id);INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result) VALUES(s,p_key_hash,p_request_hash,200,r);RETURN r;
END $$;
CREATE FUNCTION public.preview_member_merge(p_actor uuid,p_session uuid,p_source uuid,p_target uuid,p_source_revision integer,p_target_revision integer,p_token_hash text,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE a public.members;b public.members;review gdg_security.member_merge_reviews;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('community-members',0));
 SELECT * INTO a FROM public.members WHERE id=p_source;SELECT * INTO b FROM public.members WHERE id=p_target;
 IF NOT public.can_operate_member(p_actor,a.team_id,'merge') OR NOT public.can_operate_member(p_actor,b.team_id,'merge') OR NOT EXISTS(SELECT 1 FROM public.admin_sessions WHERE id=p_session AND admin_user_id=p_actor AND revoked_at IS NULL AND idle_expires_at>now() AND absolute_expires_at>now()) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 IF a.id IS NULL OR b.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF a.id=b.id OR a.merged_into_id IS NOT NULL OR b.merged_into_id IS NOT NULL OR b.deleted_at IS NOT NULL OR NOT b.is_active OR a.team_id IS DISTINCT FROM b.team_id THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
 IF a.revision IS DISTINCT FROM p_source_revision OR b.revision IS DISTINCT FROM p_target_revision THEN RAISE EXCEPTION 'CONFLICT';END IF;
 IF EXISTS(SELECT 1 FROM public.project_members WHERE member_id=a.id AND is_active) OR EXISTS(SELECT 1 FROM public.team_members WHERE member_id=a.id AND deleted_at IS NULL) THEN RAISE EXCEPTION 'MEMBER_LINK_REVIEW';END IF;
 IF p_token_hash IS NULL OR p_token_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 SELECT * INTO review FROM gdg_security.member_merge_reviews WHERE token_hash=p_token_hash;
 IF FOUND THEN
  IF review.actor_id IS DISTINCT FROM p_actor OR review.session_id IS DISTINCT FROM p_session OR review.source_id IS DISTINCT FROM a.id OR review.target_id IS DISTINCT FROM b.id OR review.source_revision IS DISTINCT FROM a.revision OR review.target_revision IS DISTINCT FROM b.revision THEN RAISE EXCEPTION 'CONFLICT';END IF;
  IF review.used_at IS NOT NULL OR review.expires_at<=now() THEN RAISE EXCEPTION 'MEMBER_REVIEW_EXPIRED';END IF;
 ELSE
 INSERT INTO gdg_security.member_merge_reviews(actor_id,session_id,source_id,target_id,source_revision,target_revision,token_hash) VALUES(p_actor,p_session,a.id,b.id,a.revision,b.revision,p_token_hash) RETURNING * INTO review;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata) VALUES(p_actor,'members.merge_reviewed','member',a.id,p_request_id,jsonb_build_object('reviewId',review.id,'targetId',b.id));
 END IF;
 RETURN jsonb_build_object('reviewId',review.id,'expiresAt',review.expires_at,'source',public.community_member_projection(p_actor,a.id),'target',public.community_member_projection(p_actor,b.id),
 'policy','Target fields stay unchanged. Source is retained as an inactive merged reference. No account, permissions, responses or finance records are combined. Active project/profile links must be reviewed first.');
END $$;
CREATE FUNCTION public.commit_member_merge(p_actor uuid,p_session uuid,p_verified_hash text,p_review uuid,p_token_hash text,p_source_confirmation text,p_target_confirmation text,p_key_hash text,p_request_hash text,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE u public.admin_users;a public.members;b public.members;review gdg_security.member_merge_reviews;k public.idempotency_keys;s text;r jsonb;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('community-members',0));
 SELECT * INTO review FROM gdg_security.member_merge_reviews WHERE id=p_review AND actor_id=p_actor AND session_id=p_session AND token_hash=p_token_hash FOR UPDATE;
 SELECT * INTO u FROM public.admin_users WHERE id=p_actor;SELECT * INTO a FROM public.members WHERE id=review.source_id FOR UPDATE;SELECT * INTO b FROM public.members WHERE id=review.target_id FOR UPDATE;
 IF review.id IS NULL OR NOT public.can_operate_member(p_actor,a.team_id,'merge') OR NOT public.can_operate_member(p_actor,b.team_id,'merge') OR p_verified_hash IS NULL OR p_verified_hash IS DISTINCT FROM u.password_hash OR NOT EXISTS(SELECT 1 FROM public.admin_sessions WHERE id=p_session AND admin_user_id=p_actor AND revoked_at IS NULL AND idle_expires_at>now() AND absolute_expires_at>now()) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 IF p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$' OR p_request_hash IS NULL OR p_request_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 s:='member.merge:'||p_actor||':'||p_review;SELECT * INTO k FROM public.idempotency_keys WHERE scope=s AND key_hash=p_key_hash;
 IF FOUND THEN IF k.request_hash IS DISTINCT FROM p_request_hash THEN RAISE EXCEPTION 'CONFLICT';END IF;RETURN k.result;END IF;
 IF review.used_at IS NOT NULL OR review.expires_at<=now() THEN RAISE EXCEPTION 'MEMBER_REVIEW_EXPIRED';END IF;
 IF a.revision IS DISTINCT FROM review.source_revision OR b.revision IS DISTINCT FROM review.target_revision THEN RAISE EXCEPTION 'CONFLICT';END IF;
 IF a.merged_into_id IS NOT NULL OR b.merged_into_id IS NOT NULL OR b.deleted_at IS NOT NULL OR NOT b.is_active OR a.team_id IS DISTINCT FROM b.team_id THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
 IF EXISTS(SELECT 1 FROM public.project_members WHERE member_id=a.id AND is_active) OR EXISTS(SELECT 1 FROM public.team_members WHERE member_id=a.id AND deleted_at IS NULL) THEN RAISE EXCEPTION 'MEMBER_LINK_REVIEW';END IF;
 IF p_source_confirmation IS DISTINCT FROM 'MEM-'||upper(replace(a.id::text,'-','')) OR p_target_confirmation IS DISTINCT FROM 'MEM-'||upper(replace(b.id::text,'-','')) THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 UPDATE public.members SET is_active=false,deleted_at=now(),merged_into_id=b.id,revision=revision+1,updated_at=clock_timestamp() WHERE id=a.id RETURNING * INTO a;
 UPDATE public.members SET revision=revision+1,updated_at=clock_timestamp() WHERE id=b.id RETURNING * INTO b;
 UPDATE gdg_security.member_merge_reviews SET used_at=now() WHERE id=review.id;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata) VALUES(p_actor,'members.merged','member',a.id,p_request_id,jsonb_build_object('reviewId',review.id,'targetId',b.id,'sourceRevision',a.revision,'targetRevision',b.revision));
 r:=jsonb_build_object('id',b.id,'revision',b.revision,'sourceId',a.id);INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result) VALUES(s,p_key_hash,p_request_hash,200,r);RETURN r;
END $$;
CREATE FUNCTION gdg_security.guard_member_profile_publication() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ DECLARE m public.members;BEGIN
 IF NEW.is_active AND NEW.member_id IS NOT NULL THEN
  -- Recheck the current row after concurrent deactivation, not a stale snapshot.
  SELECT * INTO m FROM public.members WHERE id=NEW.member_id AND is_active AND deleted_at IS NULL AND merged_into_id IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  IF m.team_id IS NOT NULL THEN
   PERFORM 1 FROM public.admin_teams WHERE id=m.team_id AND is_active AND deleted_at IS NULL FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  END IF;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER member_profile_status_guard BEFORE INSERT OR UPDATE ON public.team_members FOR EACH ROW EXECUTE FUNCTION gdg_security.guard_member_profile_publication();
CREATE FUNCTION gdg_security.unpublish_inactive_team_member_profiles() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF NOT NEW.is_active OR NEW.deleted_at IS NOT NULL THEN
  UPDATE public.team_members p SET is_active=false,revision=p.revision+1,updated_at=clock_timestamp()
   WHERE p.is_active AND EXISTS(SELECT 1 FROM public.members m WHERE m.id=p.member_id AND m.team_id=NEW.id);
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER inactive_team_member_profiles AFTER UPDATE OF is_active,deleted_at ON public.admin_teams FOR EACH ROW EXECUTE FUNCTION gdg_security.unpublish_inactive_team_member_profiles();
REVOKE ALL ON public.members FROM PUBLIC,anon,authenticated,gdg_realtime;
DO $$ DECLARE x record;BEGIN FOR x IN SELECT p.oid::regprocedure f FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN('can_operate_member','community_member_projection','list_community_members','mutate_community_member','preview_member_merge','commit_member_merge') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,gdg_realtime',x.f);EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',x.f);END LOOP;END $$;
COMMIT;
