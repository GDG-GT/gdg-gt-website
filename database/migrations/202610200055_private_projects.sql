BEGIN;
ALTER TABLE public.projects ADD COLUMN team_id uuid REFERENCES public.admin_teams(id) ON DELETE RESTRICT,
 ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK(revision>0),ADD COLUMN deleted_at timestamptz;
ALTER TABLE public.project_members ADD CONSTRAINT project_community_member FOREIGN KEY(member_id) REFERENCES public.members(id) ON DELETE RESTRICT,
 ALTER COLUMN project_id SET NOT NULL,ALTER COLUMN member_id SET NOT NULL,ALTER COLUMN is_active SET NOT NULL;
CREATE INDEX projects_scope_updated ON public.projects(team_id,updated_at DESC,id DESC);
CREATE FUNCTION gdg_security.retain_project_records() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN RAISE EXCEPTION 'PROJECT_RETAINED';END $$;
CREATE TRIGGER retain_projects BEFORE DELETE ON public.projects FOR EACH ROW EXECUTE FUNCTION gdg_security.retain_project_records();
CREATE TRIGGER retain_project_members BEFORE DELETE ON public.project_members FOR EACH ROW EXECUTE FUNCTION gdg_security.retain_project_records();
CREATE FUNCTION public.can_operate_project(p_actor uuid,p_team uuid,p_action text) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT p_action IN('read','create','update','delete') AND EXISTS(SELECT 1 FROM public.admin_users u WHERE u.id=p_actor AND u.is_active AND NOT u.must_change_password AND u.deleted_at IS NULL AND(u.locked_until IS NULL OR u.locked_until<=now()) AND
 ((u.role IN('admin','super_admin') AND(p_action='read' OR p_team IS NULL OR EXISTS(SELECT 1 FROM public.admin_teams WHERE id=p_team AND is_active AND deleted_at IS NULL))) OR
 (u.role='team_member' AND EXISTS(SELECT 1 FROM public.team_memberships m JOIN public.admin_teams t ON t.id=m.team_id AND t.is_active AND t.deleted_at IS NULL
 JOIN public.team_page_access a ON a.team_id=t.id AND a.page_path='/admin/projects' AND a.can_access
 JOIN public.team_permissions p ON p.team_id=t.id AND p.resource_type='projects' AND p.permission='crud'
 WHERE m.admin_user_id=u.id AND m.team_id=p_team AND m.is_active AND CASE p_action WHEN 'read' THEN p.can_read WHEN 'create' THEN p.can_create WHEN 'update' THEN p.can_update WHEN 'delete' THEN p.can_delete ELSE false END))));
$$;
CREATE FUNCTION public.project_projection(p_actor uuid,p_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT to_jsonb(p)||jsonb_build_object('teamName',(SELECT name FROM public.admin_teams WHERE id=p.team_id),
 'actions',(SELECT coalesce(jsonb_agg(a),'[]') FROM unnest(ARRAY['read','create','update','delete'])a WHERE public.can_operate_project(p_actor,p.team_id,a)),
 'memberCount',(SELECT count(*) FROM public.project_members WHERE project_id=p.id AND is_active))
 FROM public.projects p WHERE p.id=p_id AND public.can_operate_project(p_actor,p.team_id,'read');
$$;
CREATE FUNCTION public.list_private_projects(p_actor uuid,p_page integer,p_query text,p_state text,p_status text,p_category text,p_featured boolean) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE r jsonb;BEGIN
 IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 10000 OR p_state IS NULL OR p_state NOT IN('current','trash') OR length(coalesce(p_query,''))>100 OR length(coalesce(p_category,''))>100 OR(p_status IS NOT NULL AND p_status NOT IN('active','completed','on_hold','archived')) THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 WITH eligible AS(SELECT * FROM public.projects p WHERE public.can_operate_project(p_actor,p.team_id,'read') AND(p.deleted_at IS NOT NULL)=(p_state='trash')
 AND(coalesce(p_query,'')='' OR strpos(lower(p.title||' '||p.description||' '||array_to_string(p.tech_stack,' ')),lower(p_query))>0)
 AND(p_status IS NULL OR p.status=p_status) AND(p_category IS NULL OR p.category=p_category) AND(p_featured IS NULL OR p.is_featured=p_featured)),
 page AS(SELECT * FROM eligible ORDER BY updated_at DESC,id DESC LIMIT 30 OFFSET(p_page-1)*30)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(public.project_projection(p_actor,id) ORDER BY updated_at DESC,id DESC) FROM page),'[]'),
 'total',(SELECT count(*) FROM eligible),'pageSize',30,'stats',jsonb_build_object('active',(SELECT count(*) FROM eligible WHERE status='active'),
 'completed',(SELECT count(*) FROM eligible WHERE status='completed'),'featured',(SELECT count(*) FROM eligible WHERE is_featured),
 'categories',coalesce((SELECT jsonb_object_agg(category,n) FROM(SELECT category,count(*) n FROM eligible GROUP BY category)x),'{}'),
 'statuses',coalesce((SELECT jsonb_object_agg(status,n) FROM(SELECT status,count(*) n FROM eligible GROUP BY status)x),'{}'),
 'technologies',coalesce((SELECT jsonb_object_agg(tech,n) FROM(SELECT tech,count(*) n FROM eligible CROSS JOIN LATERAL unnest(tech_stack)tech GROUP BY tech)x),'{}'))) INTO r;
 RETURN r;
END $$;
CREATE FUNCTION public.private_project_detail(p_actor uuid,p_id uuid,p_page integer) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE p jsonb;BEGIN
 p:=public.project_projection(p_actor,p_id);IF p IS NULL THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 RETURN jsonb_build_object('project',p,'members',coalesce((SELECT jsonb_agg(jsonb_build_object('id',x.id,'memberId',x.member_id,'name',m.name,'role',x.role,'joinedAt',x.joined_at,'active',x.is_active,'communityActive',m.is_active) ORDER BY x.joined_at,x.id)
 FROM(SELECT * FROM public.project_members WHERE project_id=p_id ORDER BY joined_at,id LIMIT 30 OFFSET(p_page-1)*30)x JOIN public.members m ON m.id=x.member_id),'[]'),
 'memberTotal',(SELECT count(*) FROM public.project_members WHERE project_id=p_id),'pageSize',30);
END $$;
CREATE FUNCTION public.mutate_private_project(p_actor uuid,p_session uuid,p_verified_hash text,p_id uuid,p_action text,p_revision integer,p_document jsonb,p_key_hash text,p_request_hash text,p_request_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE u public.admin_users;p public.projects;m public.members;k public.idempotency_keys;doc jsonb;team uuid;s text;r jsonb;required text;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('private-projects',0));
 SELECT * INTO u FROM public.admin_users WHERE id=p_actor AND is_active AND NOT must_change_password AND deleted_at IS NULL AND role IN('admin','super_admin','team_member') AND(locked_until IS NULL OR locked_until<=now());
 IF u.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.admin_sessions WHERE id=p_session AND admin_user_id=u.id AND revoked_at IS NULL AND idle_expires_at>now() AND absolute_expires_at>now()) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 IF p_action IS NULL OR p_action NOT IN('create','update','archive','restore','member_save','member_remove') OR p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$' OR p_request_hash IS NULL OR p_request_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 required:=CASE WHEN p_action='create' THEN 'create' WHEN p_action IN('archive','restore') THEN 'delete' ELSE 'update' END;
 IF p_action='create' THEN team:=(p_document->>'teamId')::uuid;
 ELSE SELECT * INTO p FROM public.projects WHERE id=p_id FOR UPDATE;team:=p.team_id;
  IF p.id IS NULL OR NOT public.can_operate_project(u.id,team,'read') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 END IF;
 IF NOT public.can_operate_project(u.id,team,'read') OR NOT public.can_operate_project(u.id,team,required) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 s:='project.'||p_action||':'||u.id||':'||coalesce(p_id::text,'new');
 SELECT * INTO k FROM public.idempotency_keys WHERE scope=s AND key_hash=p_key_hash;
 IF FOUND THEN IF k.request_hash IS DISTINCT FROM p_request_hash THEN RAISE EXCEPTION 'CONFLICT';END IF;RETURN k.result;END IF;
 IF p_action<>'create' THEN
  IF p.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'CONFLICT';END IF;
  IF p.deleted_at IS NOT NULL AND p_action<>'restore' OR p.deleted_at IS NULL AND p_action='restore' THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
 END IF;
 doc:=p_document->'record';
 IF p_action IN('create','update') THEN
  IF length(coalesce(doc->>'title','')) NOT BETWEEN 2 AND 200 OR length(coalesce(doc->>'description','')) NOT BETWEEN 2 AND 20000
  OR doc->>'status' IS NULL OR doc->>'status' NOT IN('active','completed','on_hold','archived') OR doc->>'difficulty_level' IS NULL OR doc->>'difficulty_level' NOT IN('beginner','intermediate','advanced')
  OR coalesce((doc->>'team_size')::integer,0) NOT BETWEEN 1 AND 1000 OR coalesce(length(doc->>'category'),0) NOT BETWEEN 1 AND 100
  OR jsonb_typeof(doc->'tech_stack') IS DISTINCT FROM 'array' OR jsonb_array_length(doc->'tech_stack')>50
  OR jsonb_typeof(doc->'tags') IS DISTINCT FROM 'array' OR jsonb_array_length(doc->'tags')>30
  OR(nullif(doc->>'start_date','')::date IS NOT NULL AND nullif(doc->>'end_date','')::date<nullif(doc->>'start_date','')::date) THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
  IF p_action='create' THEN INSERT INTO public.projects(title,description,team_id,created_by) VALUES(doc->>'title',doc->>'description',team,u.id) RETURNING * INTO p;END IF;
  UPDATE public.projects SET title=doc->>'title',description=doc->>'description',short_description=doc->>'short_description',
   image_url=nullif(doc->>'image_url',''),github_url=nullif(doc->>'github_url',''),demo_url=nullif(doc->>'demo_url',''),
   tech_stack=ARRAY(SELECT jsonb_array_elements_text(doc->'tech_stack')),tags=ARRAY(SELECT jsonb_array_elements_text(doc->'tags')),
   category=doc->>'category',status=doc->>'status',difficulty_level=doc->>'difficulty_level',team_size=(doc->>'team_size')::integer,
   start_date=nullif(doc->>'start_date','')::date,end_date=nullif(doc->>'end_date','')::date,is_featured=(doc->>'is_featured')::boolean,is_open_source=(doc->>'is_open_source')::boolean WHERE id=p.id;
 ELSIF p_action IN('archive','restore') THEN
  IF p_verified_hash IS NULL OR p_verified_hash IS DISTINCT FROM u.password_hash OR p_document->>'confirmation' IS DISTINCT FROM p.title THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
  UPDATE public.projects SET deleted_at=CASE WHEN p_action='archive' THEN now() ELSE NULL END WHERE id=p.id;
 ELSIF p_action='member_save' THEN
  IF length(coalesce(p_document->>'role','')) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
  IF(SELECT count(*) FROM public.members WHERE lower(email)=lower(p_document->>'email') AND is_active)<>1 THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  SELECT * INTO m FROM public.members WHERE lower(email)=lower(p_document->>'email') AND is_active FOR SHARE;
  IF NOT EXISTS(SELECT 1 FROM public.project_members WHERE project_id=p.id AND member_id=m.id AND is_active)
   AND(SELECT count(*) FROM public.project_members WHERE project_id=p.id AND is_active)>=100 THEN RAISE EXCEPTION 'PROJECT_MEMBER_LIMIT';END IF;
  INSERT INTO public.project_members(project_id,member_id,role,is_active) VALUES(p.id,m.id,p_document->>'role',true)
   ON CONFLICT(project_id,member_id) DO UPDATE SET role=EXCLUDED.role,is_active=true;
 ELSIF p_action='member_remove' THEN
  UPDATE public.project_members SET is_active=false WHERE project_id=p.id AND member_id=(p_document->>'memberId')::uuid AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 END IF;
 UPDATE public.projects SET revision=CASE WHEN p_action='create' THEN revision ELSE revision+1 END,updated_at=clock_timestamp() WHERE id=p.id RETURNING * INTO p;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata) VALUES(u.id,'projects.'||p_action,'project',p.id,p_request_id,jsonb_build_object('revision',p.revision,'teamId',p.team_id));
 r:=jsonb_build_object('id',p.id,'revision',p.revision);
 INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result) VALUES(s,p_key_hash,p_request_hash,200,r);RETURN r;
END $$;
REVOKE ALL ON public.projects,public.project_members,public.project_stars FROM PUBLIC,anon,authenticated,gdg_realtime;
DO $$ DECLARE x record;BEGIN FOR x IN SELECT p.oid::regprocedure f FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN('can_operate_project','project_projection','list_private_projects','private_project_detail','mutate_private_project') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,gdg_realtime',x.f);EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',x.f);END LOOP;END $$;
COMMIT;
