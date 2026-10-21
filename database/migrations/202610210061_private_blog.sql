BEGIN;
ALTER TABLE public.blog_posts ADD COLUMN team_id uuid REFERENCES public.admin_teams(id) ON DELETE RESTRICT,
 ADD COLUMN assigned_editor_id uuid REFERENCES public.admin_users(id) ON DELETE RESTRICT,
 ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK(revision>0), ADD COLUMN deleted_at timestamptz;
ALTER TABLE public.blog_categories ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK(revision>0), ADD COLUMN deleted_at timestamptz;
ALTER TABLE public.blog_comments ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK(revision>0), ADD COLUMN deleted_at timestamptz;
ALTER TABLE public.blog_submissions ADD COLUMN team_id uuid REFERENCES public.admin_teams(id) ON DELETE RESTRICT,
 ADD COLUMN created_by uuid REFERENCES public.admin_users(id) ON DELETE RESTRICT,
 ADD COLUMN assigned_editor_id uuid REFERENCES public.admin_users(id) ON DELETE RESTRICT,
 ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK(revision>0), ADD COLUMN deleted_at timestamptz,
 ADD COLUMN scan_status text NOT NULL DEFAULT 'unverified' CHECK(scan_status IN('unverified','pending','clean','rejected'));
CREATE INDEX blog_posts_private_scope ON public.blog_posts(team_id,updated_at DESC,id);
CREATE INDEX blog_posts_private_editor ON public.blog_posts(assigned_editor_id,updated_at DESC);
CREATE INDEX blog_submissions_private_editor ON public.blog_submissions(assigned_editor_id,updated_at DESC);
CREATE TABLE gdg_security.blog_versions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),post_id uuid NOT NULL REFERENCES public.blog_posts(id) ON DELETE RESTRICT,
 revision integer NOT NULL,actor_id uuid NOT NULL REFERENCES public.admin_users(id) ON DELETE RESTRICT,
 action text NOT NULL,document jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(post_id,revision)
);
ALTER TABLE gdg_security.blog_versions ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION gdg_security.retain_blog_records() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN RAISE EXCEPTION 'BLOG_RETAINED';END $$;
DO $$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['blog_posts','blog_categories','blog_comments','blog_submissions','blog_submission_comments','blog_likes'] LOOP
 EXECUTE format('CREATE TRIGGER retain_blog_records BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION gdg_security.retain_blog_records()',t);
END LOOP;END $$;
CREATE TRIGGER retain_blog_versions BEFORE UPDATE OR DELETE ON gdg_security.blog_versions FOR EACH ROW EXECUTE FUNCTION gdg_security.retain_blog_records();

CREATE FUNCTION public.can_operate_blog(p_actor uuid,p_kind text,p_id uuid,p_team uuid,p_action text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE u public.admin_users;team uuid:=p_team;owner uuid;editor uuid;post uuid;BEGIN
 IF p_kind IS NULL OR p_kind NOT IN('posts','categories','submissions','comments') OR p_action IS NULL OR p_action NOT IN('read','create','update','delete','submit','approve','reject','publish','unpublish','assign','review','comment','hide','flag','unflag') THEN RETURN false;END IF;
 IF(p_kind='categories' AND p_action NOT IN('read','create','update','delete')) OR(p_kind='posts' AND p_action NOT IN('read','create','update','delete','submit','approve','reject','publish','unpublish','assign')) OR(p_kind='submissions' AND p_action NOT IN('read','delete','review','comment','assign')) OR(p_kind='comments' AND p_action NOT IN('read','approve','hide','flag','unflag','delete')) THEN RETURN false;END IF;
 SELECT * INTO u FROM public.admin_users WHERE id=p_actor AND is_active AND NOT must_change_password AND deleted_at IS NULL AND(locked_until IS NULL OR locked_until<=now());IF u.id IS NULL THEN RETURN false;END IF;
 IF p_id IS NOT NULL THEN
  IF p_kind='posts' THEN SELECT team_id,created_by,assigned_editor_id INTO team,owner,editor FROM public.blog_posts WHERE id=p_id;
  ELSIF p_kind='submissions' THEN SELECT team_id,created_by,assigned_editor_id INTO team,owner,editor FROM public.blog_submissions WHERE id=p_id;
  ELSIF p_kind='comments' THEN SELECT post_id INTO post FROM public.blog_comments WHERE id=p_id;IF NOT FOUND THEN RETURN false;END IF;
   IF p_action='read' THEN RETURN public.can_operate_blog(p_actor,'posts',post,NULL,'read');END IF;
   SELECT team_id INTO team FROM public.blog_posts WHERE id=post;
  ELSE PERFORM 1 FROM public.blog_categories WHERE id=p_id;
  END IF;
  IF NOT FOUND THEN RETURN false;END IF;
 END IF;
 IF u.role IN('admin','super_admin') THEN RETURN p_action='read' OR team IS NULL OR EXISTS(SELECT 1 FROM public.admin_teams WHERE id=team AND is_active AND deleted_at IS NULL);END IF;
 IF team IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.admin_teams WHERE id=team AND is_active AND deleted_at IS NULL) THEN RETURN false;END IF;
 IF u.role='blog_editor' THEN
  IF p_kind='categories' THEN RETURN p_action='read';END IF;
  IF p_kind='comments' THEN RETURN false;END IF;
  IF p_action NOT IN('read','create','update','delete','submit','comment') THEN RETURN false;END IF;
  IF p_id IS NULL THEN RETURN p_kind='posts' AND team IS NULL AND p_action='create';END IF;
  RETURN coalesce(owner=u.id OR editor=u.id,false) AND(p_kind='posts' OR p_action IN('read','comment'));
 END IF;
 IF u.role<>'team_member' OR p_action NOT IN('read','create','update','delete','submit','comment') THEN RETURN false;END IF;
 IF p_kind='categories' THEN RETURN p_action='read' AND EXISTS(SELECT 1 FROM public.team_memberships m JOIN public.admin_teams t ON t.id=m.team_id AND t.is_active AND t.deleted_at IS NULL JOIN public.team_page_access a ON a.team_id=t.id AND a.page_path='/admin/blog' AND a.can_access JOIN public.team_permissions p ON p.team_id=t.id AND p.resource_type='blog' AND p.permission='crud' AND p.can_read WHERE m.admin_user_id=u.id AND m.is_active);END IF;
 RETURN EXISTS(SELECT 1 FROM public.team_memberships m JOIN public.admin_teams t ON t.id=m.team_id AND t.is_active AND t.deleted_at IS NULL
 JOIN public.team_page_access a ON a.team_id=t.id AND a.page_path='/admin/blog' AND a.can_access
 JOIN public.team_permissions p ON p.team_id=t.id AND p.resource_type='blog' AND p.permission='crud'
 WHERE m.admin_user_id=u.id AND m.is_active AND m.team_id=team AND p.can_read AND CASE p_action WHEN 'read' THEN p.can_read WHEN 'create' THEN p.can_create WHEN 'delete' THEN p.can_delete ELSE p.can_update END);
END $$;

CREATE FUNCTION public.blog_private_projection(p_actor uuid,p_kind text,p_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE d jsonb;is_admin boolean;BEGIN
 IF NOT public.can_operate_blog(p_actor,p_kind,p_id,NULL,'read') THEN RETURN NULL;END IF;
 SELECT role IN('admin','super_admin') INTO is_admin FROM public.admin_users WHERE id=p_actor;
 IF p_kind='posts' THEN
  SELECT to_jsonb(p)-'created_by'-'updated_by'-'approved_by'-'rejected_by'||jsonb_build_object('ownerId',created_by,'editorId',assigned_editor_id,
   'teamName',(SELECT name FROM public.admin_teams WHERE id=p.team_id),
   'actualLikes',(SELECT count(*)::text FROM public.blog_likes WHERE post_id=p.id),
   'actualComments',(SELECT count(*)::text FROM public.blog_comments WHERE post_id=p.id AND deleted_at IS NULL)) INTO d FROM public.blog_posts p WHERE id=p_id;
 ELSIF p_kind='categories' THEN SELECT to_jsonb(c) INTO d FROM public.blog_categories c WHERE id=p_id;
 ELSIF p_kind='submissions' THEN
  SELECT to_jsonb(s)-'file_path'-'created_by'-'assigned_editor_id'-'admin_notes'-'submitter_email'||jsonb_build_object('ownerId',created_by,'editorId',assigned_editor_id,
   'teamName',(SELECT name FROM public.admin_teams WHERE id=s.team_id)) INTO d FROM public.blog_submissions s WHERE id=p_id;
  IF is_admin THEN SELECT d||jsonb_build_object('admin_notes',admin_notes,'submitter_email',submitter_email) INTO d FROM public.blog_submissions WHERE id=p_id;END IF;
 ELSE SELECT to_jsonb(c)-'author_email'||jsonb_build_object('postTitle',(SELECT title FROM public.blog_posts WHERE id=c.post_id)) INTO d FROM public.blog_comments c WHERE id=p_id;
 END IF;
 RETURN d||jsonb_build_object('reference','BLOG-'||upper(replace(p_id::text,'-','')),
 'actions',(SELECT coalesce(jsonb_agg(a),'[]') FROM unnest(ARRAY['read','create','update','delete','submit','approve','reject','publish','unpublish','assign','review','comment','hide','flag','unflag'])a WHERE public.can_operate_blog(p_actor,p_kind,p_id,NULL,a)));
END $$;

CREATE FUNCTION public.list_private_blog(p_actor uuid,p_kind text,p_page integer,p_query text,p_state text,p_status text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE r jsonb;BEGIN
 IF p_kind IS NULL OR p_kind NOT IN('posts','categories','submissions','comments') OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 10000 OR p_state IS NULL OR p_state NOT IN('current','trash') OR length(coalesce(p_query,''))>100 OR length(coalesce(p_status,''))>30 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 WITH inventory AS(
  SELECT id,team_id,title label,updated_at,deleted_at,status state FROM public.blog_posts WHERE p_kind='posts'
  UNION ALL SELECT id,NULL,name,updated_at,deleted_at,CASE WHEN is_active THEN 'active' ELSE 'inactive' END FROM public.blog_categories WHERE p_kind='categories'
  UNION ALL SELECT id,team_id,original_name,updated_at,deleted_at,status FROM public.blog_submissions WHERE p_kind='submissions'
  UNION ALL SELECT c.id,p.team_id,c.content,c.updated_at,c.deleted_at,CASE WHEN c.is_flagged THEN 'flagged' WHEN c.is_approved THEN 'approved' ELSE 'pending' END FROM public.blog_comments c JOIN public.blog_posts p ON p.id=c.post_id WHERE p_kind='comments'),
 eligible AS(SELECT * FROM inventory WHERE public.can_operate_blog(p_actor,p_kind,id,team_id,'read') AND(deleted_at IS NOT NULL)=(p_state='trash')
 AND(coalesce(p_query,'')='' OR strpos(lower(label),lower(p_query))>0) AND(p_status IS NULL OR state=p_status)),
 page AS(SELECT * FROM eligible ORDER BY updated_at DESC,id DESC LIMIT 30 OFFSET(p_page-1)*30)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(
  CASE WHEN p_kind='posts' THEN public.blog_private_projection(p_actor,p_kind,id)-'content'-'pending_changes'-'author_email'-'rejection_reason'-'change_summary'
  WHEN p_kind='submissions' THEN public.blog_private_projection(p_actor,p_kind,id)-'admin_notes'-'submitter_email'
  ELSE public.blog_private_projection(p_actor,p_kind,id) END ORDER BY updated_at DESC,id DESC) FROM page),'[]'),
  'total',(SELECT count(*) FROM eligible),'pageSize',30,'states',coalesce((SELECT jsonb_object_agg(state,n) FROM(SELECT state,count(*) n FROM eligible GROUP BY state)x),'{}')) INTO r;RETURN r;
END $$;

CREATE FUNCTION public.blog_private_detail(p_actor uuid,p_kind text,p_id uuid,p_page integer) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE d jsonb;is_admin boolean;BEGIN
 d:=public.blog_private_projection(p_actor,p_kind,p_id);IF d IS NULL THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 SELECT role IN('admin','super_admin') INTO is_admin FROM public.admin_users WHERE id=p_actor;
 RETURN jsonb_build_object('record',d,'discussion',CASE WHEN p_kind='submissions' THEN coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'type',c.comment_type,'comment',c.comment,'createdAt',c.created_at,'authorName',coalesce(u.display_name,'Chapter operator')) ORDER BY c.created_at DESC,c.id DESC)
  FROM(SELECT * FROM public.blog_submission_comments WHERE submission_id=p_id AND(comment_type<>'internal' OR is_admin) ORDER BY created_at DESC,id DESC LIMIT 30 OFFSET(p_page-1)*30)c JOIN public.admin_users u ON u.id=c.admin_id),'[]') ELSE '[]'::jsonb END,
 'discussionTotal',CASE WHEN p_kind='submissions' THEN(SELECT count(*) FROM public.blog_submission_comments WHERE submission_id=p_id AND(comment_type<>'internal' OR is_admin)) ELSE 0 END,
 'versions',CASE WHEN p_kind='posts' THEN coalesce((SELECT jsonb_agg(jsonb_build_object('revision',revision,'action',action,'createdAt',created_at) ORDER BY revision DESC) FROM(SELECT * FROM gdg_security.blog_versions WHERE post_id=p_id ORDER BY revision DESC LIMIT 30 OFFSET(p_page-1)*30)v),'[]') ELSE '[]'::jsonb END,
 'versionTotal',CASE WHEN p_kind='posts' THEN(SELECT count(*) FROM gdg_security.blog_versions WHERE post_id=p_id) ELSE 0 END,'pageSize',30);
END $$;

CREATE FUNCTION public.mutate_private_blog(p_actor uuid,p_session uuid,p_verified_hash text,p_kind text,p_id uuid,p_action text,p_revision integer,p_document jsonb,p_key_hash text,p_request_hash text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE u public.admin_users;p public.blog_posts;cat public.blog_categories;sub public.blog_submissions;c public.blog_comments;
 d jsonb;doc jsonb;team uuid;current_rev integer;deleted timestamptz;v_id uuid:=p_id;required text;v_scope text;k public.idempotency_keys;r jsonb;editor uuid;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('private-blog',0));
 SELECT * INTO u FROM public.admin_users WHERE admin_users.id=p_actor AND is_active AND NOT must_change_password AND deleted_at IS NULL AND(locked_until IS NULL OR locked_until<=now());
 IF u.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.admin_sessions WHERE admin_sessions.id=p_session AND admin_user_id=u.id AND revoked_at IS NULL AND idle_expires_at>now() AND absolute_expires_at>now()) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 IF p_kind IS NULL OR p_kind NOT IN('posts','categories','submissions','comments') OR p_action IS NULL OR p_action NOT IN('create','update','archive','restore','submit','approve','reject','publish','unpublish','assign','comment','review','hide','flag','unflag') OR p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$' OR p_request_hash IS NULL OR p_request_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 required:=CASE WHEN p_action IN('archive','restore') THEN 'delete' ELSE p_action END;
 IF p_action='create' THEN
  IF p_id IS NOT NULL OR p_kind NOT IN('posts','categories') THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;team:=(p_document->>'teamId')::uuid;
 ELSE
  IF p_kind='posts' THEN SELECT * INTO p FROM public.blog_posts WHERE blog_posts.id=p_id FOR UPDATE;team:=p.team_id;current_rev:=p.revision;deleted:=p.deleted_at;
  ELSIF p_kind='categories' THEN SELECT * INTO cat FROM public.blog_categories WHERE blog_categories.id=p_id FOR UPDATE;current_rev:=cat.revision;deleted:=cat.deleted_at;
  ELSIF p_kind='submissions' THEN SELECT * INTO sub FROM public.blog_submissions WHERE blog_submissions.id=p_id FOR UPDATE;team:=sub.team_id;current_rev:=sub.revision;deleted:=sub.deleted_at;
  ELSE SELECT * INTO c FROM public.blog_comments WHERE blog_comments.id=p_id FOR UPDATE;current_rev:=c.revision;deleted:=c.deleted_at;
  END IF;
  IF current_rev IS NULL OR NOT public.can_operate_blog(u.id,p_kind,v_id,team,'read') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 END IF;
 IF NOT public.can_operate_blog(u.id,p_kind,v_id,team,required) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 IF p_action IN('approve','reject','publish','unpublish','assign','review','hide','flag','unflag','archive','restore') THEN
  IF p_verified_hash IS NULL OR p_verified_hash IS DISTINCT FROM u.password_hash OR p_document->>'confirmation' IS DISTINCT FROM 'BLOG-'||upper(replace(v_id::text,'-','')) THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 END IF;
 v_scope:='blog.'||p_kind||'.'||p_action||':'||u.id||':'||coalesce(v_id::text,'new');SELECT * INTO k FROM public.idempotency_keys WHERE idempotency_keys.scope=v_scope AND key_hash=p_key_hash;
 IF FOUND THEN IF k.request_hash IS DISTINCT FROM p_request_hash THEN RAISE EXCEPTION 'CONFLICT';END IF;RETURN k.result;END IF;
 IF p_action<>'create' AND(current_rev IS DISTINCT FROM p_revision OR(deleted IS NOT NULL AND p_action<>'restore') OR(deleted IS NULL AND p_action='restore')) THEN RAISE EXCEPTION 'CONFLICT';END IF;
 doc:=p_document->'record';
 IF p_kind='posts' THEN
  IF p_action IN('create','update') THEN
   IF length(coalesce(doc->>'title','')) NOT BETWEEN 2 AND 200 OR length(coalesce(doc->>'content','')) NOT BETWEEN 2 AND 180000 OR coalesce(doc->>'slug','')!~'^[a-z0-9]+(-[a-z0-9]+)*$' OR length(doc->>'slug')>150 OR length(coalesce(doc->>'author_name','')) NOT BETWEEN 1 AND 100 OR jsonb_typeof(doc->'tags') IS DISTINCT FROM 'array' OR jsonb_array_length(doc->'tags')>30 OR coalesce((doc->>'read_time_minutes')::integer,0) NOT BETWEEN 1 AND 180 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
   IF (doc->>'category_id')::uuid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.blog_categories WHERE blog_categories.id=(doc->>'category_id')::uuid AND((is_active AND deleted_at IS NULL) OR blog_categories.id=p.category_id)) THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
   IF p_action='create' THEN
    INSERT INTO public.blog_posts(title,slug,content,author_name,created_by,updated_by,team_id,status,requires_approval,approval_status) VALUES(doc->>'title',doc->>'slug',doc->>'content',doc->>'author_name',u.id,u.id,team,'draft',true,'pending') RETURNING * INTO p;v_id:=p.id;
   END IF;
   UPDATE public.blog_posts SET pending_changes=doc,requires_approval=true,approval_status='pending',change_summary=coalesce(p_document->>'summary',''),approved_by=NULL,approved_at=NULL,rejected_by=NULL,rejected_at=NULL,rejection_reason=NULL WHERE blog_posts.id=v_id;
  ELSIF p_action='submit' THEN
   IF p.pending_changes IS NULL THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
   UPDATE public.blog_posts SET requires_approval=true,approval_status='pending',change_summary=p_document->>'summary',rejection_reason=NULL,rejected_at=NULL,rejected_by=NULL WHERE blog_posts.id=v_id;
  ELSIF p_action='approve' THEN
   IF p.approval_status<>'pending' OR p.pending_changes IS NULL THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
   doc:=p.pending_changes;
   IF jsonb_typeof(doc)<>'object' OR length(coalesce(doc->>'title','')) NOT BETWEEN 2 AND 200 OR length(coalesce(doc->>'content','')) NOT BETWEEN 2 AND 180000 OR jsonb_typeof(doc->'tags') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
   UPDATE public.blog_posts SET title=doc->>'title',slug=doc->>'slug',content=doc->>'content',excerpt=doc->>'excerpt',author_name=doc->>'author_name',author_email=nullif(doc->>'author_email',''),featured_image_url=nullif(doc->>'featured_image_url',''),author_avatar_url=nullif(doc->>'author_avatar_url',''),category_id=(doc->>'category_id')::uuid,tags=ARRAY(SELECT jsonb_array_elements_text(doc->'tags')),is_featured=(doc->>'is_featured')::boolean,read_time_minutes=(doc->>'read_time_minutes')::integer,
    pending_changes=NULL,requires_approval=false,approval_status='approved',approved_by=u.id,approved_at=now(),rejected_by=NULL,rejected_at=NULL,rejection_reason=NULL WHERE blog_posts.id=v_id;
  ELSIF p_action='reject' THEN
   IF p.pending_changes IS NULL OR length(coalesce(p_document->>'reason','')) NOT BETWEEN 2 AND 2000 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
   UPDATE public.blog_posts SET approval_status='rejected',rejected_by=u.id,rejected_at=now(),rejection_reason=p_document->>'reason' WHERE blog_posts.id=v_id;
  ELSIF p_action='publish' THEN
   IF p.status<>'draft' OR p.approval_status<>'approved' OR p.requires_approval OR p.pending_changes IS NOT NULL THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
   UPDATE public.blog_posts SET status='published',published_at=now() WHERE blog_posts.id=v_id;
  ELSIF p_action='unpublish' THEN
   IF p.status<>'published' THEN RAISE EXCEPTION 'INVALID_STATE';END IF;UPDATE public.blog_posts SET status='draft' WHERE blog_posts.id=v_id;
  ELSIF p_action='assign' THEN
   editor:=(p_document->>'editorId')::uuid;
   IF editor IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.admin_users WHERE admin_users.id=editor AND role='blog_editor' AND is_active AND NOT must_change_password AND deleted_at IS NULL AND(locked_until IS NULL OR locked_until<=now())) THEN RAISE EXCEPTION 'ACCOUNT_NOT_READY';END IF;
   UPDATE public.blog_posts SET assigned_editor_id=editor WHERE blog_posts.id=v_id;
  ELSIF p_action IN('archive','restore') THEN
   IF u.role='blog_editor' AND(p.status='published' OR p.assigned_editor_id=u.id AND p.created_by<>u.id) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
   UPDATE public.blog_posts SET deleted_at=CASE WHEN p_action='archive' THEN now() ELSE NULL END,status=CASE WHEN p_action='archive' THEN 'archived' ELSE 'draft' END WHERE blog_posts.id=v_id;
  ELSE RAISE EXCEPTION 'INVALID_STATE';END IF;
  UPDATE public.blog_posts SET revision=CASE WHEN p_action='create' THEN 1 ELSE revision+1 END,updated_at=clock_timestamp(),updated_by=u.id WHERE blog_posts.id=v_id RETURNING * INTO p;current_rev:=p.revision;
  INSERT INTO gdg_security.blog_versions(post_id,revision,actor_id,action,document) VALUES(v_id,p.revision,u.id,p_action,to_jsonb(p)-'created_by'-'updated_by'-'approved_by'-'rejected_by');
 ELSIF p_kind='categories' THEN
  IF u.role NOT IN('admin','super_admin') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
  IF p_action IN('create','update') THEN
   IF team IS NOT NULL OR length(coalesce(doc->>'name','')) NOT BETWEEN 2 AND 100 OR coalesce(doc->>'slug','')!~'^[a-z0-9]+(-[a-z0-9]+)*$' OR length(doc->>'slug')>150 OR coalesce(doc->>'color','')!~'^#[a-fA-F0-9]{6}$' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
   IF p_action='create' THEN INSERT INTO public.blog_categories(name,slug) VALUES(doc->>'name',doc->>'slug') RETURNING blog_categories.id INTO v_id;END IF;
   UPDATE public.blog_categories SET name=doc->>'name',slug=doc->>'slug',description=doc->>'description',color=doc->>'color',order_index=(doc->>'order_index')::integer,is_active=(doc->>'is_active')::boolean WHERE blog_categories.id=v_id;
  ELSIF p_action IN('archive','restore') THEN UPDATE public.blog_categories SET deleted_at=CASE WHEN p_action='archive' THEN now() ELSE NULL END,is_active=false WHERE blog_categories.id=v_id;
  ELSE RAISE EXCEPTION 'INVALID_STATE';END IF;
  UPDATE public.blog_categories SET revision=CASE WHEN p_action='create' THEN 1 ELSE revision+1 END,updated_at=clock_timestamp() WHERE blog_categories.id=v_id RETURNING revision INTO current_rev;
 ELSIF p_kind='submissions' THEN
  IF p_action='comment' THEN
   IF length(coalesce(p_document->>'comment','')) NOT BETWEEN 1 AND 5000 OR p_document->>'type' IS NULL OR p_document->>'type' NOT IN('general','feedback','internal') OR(p_document->>'type'='internal' AND u.role NOT IN('admin','super_admin')) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
   INSERT INTO public.blog_submission_comments(submission_id,admin_id,comment,comment_type) VALUES(v_id,u.id,p_document->>'comment',p_document->>'type');
  ELSIF p_action='review' THEN
   IF p_document->>'status' IS NULL OR p_document->>'status' NOT IN('reviewed','approved','rejected') THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
   UPDATE public.blog_submissions SET status=p_document->>'status',admin_notes=p_document->>'notes' WHERE blog_submissions.id=v_id;
  ELSIF p_action='assign' THEN
   editor:=(p_document->>'editorId')::uuid;IF editor IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.admin_users WHERE admin_users.id=editor AND role='blog_editor' AND is_active AND NOT must_change_password AND deleted_at IS NULL AND(locked_until IS NULL OR locked_until<=now())) THEN RAISE EXCEPTION 'ACCOUNT_NOT_READY';END IF;
   UPDATE public.blog_submissions SET assigned_editor_id=editor WHERE blog_submissions.id=v_id;
  ELSIF p_action IN('archive','restore') THEN UPDATE public.blog_submissions SET deleted_at=CASE WHEN p_action='archive' THEN now() ELSE NULL END WHERE blog_submissions.id=v_id;
  ELSE RAISE EXCEPTION 'INVALID_STATE';END IF;
  UPDATE public.blog_submissions SET revision=revision+1,updated_at=clock_timestamp() WHERE blog_submissions.id=v_id RETURNING revision INTO current_rev;
 ELSE
  IF p_action IN('approve','hide') THEN UPDATE public.blog_comments SET is_approved=(p_action='approve') WHERE blog_comments.id=v_id;
  ELSIF p_action IN('flag','unflag') THEN UPDATE public.blog_comments SET is_flagged=(p_action='flag') WHERE blog_comments.id=v_id;
  ELSIF p_action IN('archive','restore') THEN UPDATE public.blog_comments SET deleted_at=CASE WHEN p_action='archive' THEN now() ELSE NULL END,is_approved=false WHERE blog_comments.id=v_id;
  ELSE RAISE EXCEPTION 'INVALID_STATE';END IF;
  UPDATE public.blog_comments SET revision=revision+1,updated_at=clock_timestamp() WHERE blog_comments.id=v_id RETURNING revision INTO current_rev;
 END IF;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata) VALUES(u.id,'blog.'||p_kind||'.'||p_action,'private_blog',v_id,p_request_id,jsonb_build_object('revision',current_rev,'teamId',team));
 r:=jsonb_build_object('id',v_id,'revision',current_rev);INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result) VALUES(v_scope,p_key_hash,p_request_hash,200,r);RETURN r;
END $$;

CREATE FUNCTION gdg_security.archive_team_blog() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF(OLD.is_active AND NOT NEW.is_active) OR(OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL) THEN
  UPDATE public.blog_posts SET status='draft',revision=revision+1,updated_at=clock_timestamp() WHERE team_id=NEW.id AND status='published';
 END IF;RETURN NEW;END $$;
CREATE TRIGGER archive_team_blog AFTER UPDATE ON public.admin_teams FOR EACH ROW EXECUTE FUNCTION gdg_security.archive_team_blog();
REVOKE ALL ON public.blog_posts,public.blog_categories,public.blog_comments,public.blog_likes,public.blog_submissions,public.blog_submission_comments,gdg_security.blog_versions FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT ALL ON gdg_security.blog_versions TO service_role;
DO $$ DECLARE x record;BEGIN FOR x IN SELECT p.oid::regprocedure f FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN('can_operate_blog','blog_private_projection','list_private_blog','blog_private_detail','mutate_private_blog') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,gdg_realtime',x.f);EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',x.f);END LOOP;END $$;
COMMIT;
