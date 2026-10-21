BEGIN;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.linktree_profiles) OR EXISTS(SELECT 1 FROM public.linktree_links) OR EXISTS(SELECT 1 FROM public.linktree_analytics)
 THEN RAISE EXCEPTION 'Linktree foundation requires reviewed empty target tables';END IF;END $$;
ALTER TABLE public.linktree_profiles ADD COLUMN team_id uuid REFERENCES public.admin_teams(id) ON DELETE RESTRICT,
 ADD COLUMN created_by uuid REFERENCES public.admin_users(id) ON DELETE RESTRICT,ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 ADD COLUMN deleted_at timestamptz,ADD COLUMN view_count bigint NOT NULL DEFAULT 0 CHECK(view_count>=0),
 ALTER COLUMN is_active SET DEFAULT false,ALTER COLUMN is_active SET NOT NULL,ALTER COLUMN theme SET DEFAULT 'light',
 ALTER COLUMN background_value SET DEFAULT '{"type":"color","value":"#f8d8c6"}';
CREATE UNIQUE INDEX linktree_username_folded ON public.linktree_profiles(lower(username));
ALTER TABLE public.linktree_profiles ADD CONSTRAINT linktree_username_safe CHECK(username~'^[a-z0-9]([a-z0-9_-]*[a-z0-9])?$');
CREATE TABLE public.linktree_username_reservations(username text PRIMARY KEY,profile_id uuid NOT NULL REFERENCES public.linktree_profiles(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.linktree_username_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.linktree_username_reservations FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT SELECT,INSERT ON public.linktree_username_reservations TO service_role;
ALTER TABLE public.linktree_links ADD COLUMN deleted_at timestamptz,
 ALTER COLUMN profile_id SET NOT NULL,ALTER COLUMN is_active SET DEFAULT false,ALTER COLUMN is_active SET NOT NULL,
 ALTER COLUMN button_color SET DEFAULT '#f4f5f7',ALTER COLUMN text_color SET DEFAULT '#25282f',ALTER COLUMN show_click_count SET DEFAULT false,
 ALTER COLUMN click_count TYPE bigint,ALTER COLUMN click_count SET NOT NULL;
ALTER TABLE public.linktree_links DROP CONSTRAINT linktree_links_embed_type_check;
ALTER TABLE public.linktree_links ADD CONSTRAINT linktree_links_embed_type_check CHECK(embed_type IN('none','google_form','youtube')),
 ADD CONSTRAINT linktree_parent_identity UNIQUE(id,profile_id);
ALTER TABLE public.linktree_analytics ADD COLUMN day date NOT NULL DEFAULT(current_timestamp AT TIME ZONE 'UTC')::date,
 ADD COLUMN event_count bigint NOT NULL DEFAULT 1 CHECK(event_count>0),ALTER COLUMN profile_id SET NOT NULL,
 ADD CONSTRAINT linktree_aggregate_only CHECK(visitor_ip IS NULL AND user_agent IS NULL AND referrer IS NULL AND country IS NULL AND city IS NULL),
 ADD CONSTRAINT linktree_daily_unique UNIQUE NULLS NOT DISTINCT(profile_id,link_id,day),
 ADD CONSTRAINT linktree_analytics_parent FOREIGN KEY(link_id,profile_id) REFERENCES public.linktree_links(id,profile_id) ON DELETE RESTRICT;
CREATE FUNCTION gdg_security.retain_linktree_records() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN RAISE EXCEPTION 'LINKTREE_RETAINED';END $$;
CREATE TRIGGER retain_linktree_profiles BEFORE DELETE ON public.linktree_profiles FOR EACH ROW EXECUTE FUNCTION gdg_security.retain_linktree_records();
CREATE TRIGGER retain_linktree_links BEFORE DELETE ON public.linktree_links FOR EACH ROW EXECUTE FUNCTION gdg_security.retain_linktree_records();
CREATE FUNCTION public.can_operate_linktree(p_actor uuid,p_team uuid,p_action text) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT p_action IN('read','create','update','delete','publish') AND EXISTS(SELECT 1 FROM public.admin_users u WHERE u.id=p_actor AND u.is_active AND NOT u.must_change_password AND u.deleted_at IS NULL AND(u.locked_until IS NULL OR u.locked_until<=now()) AND
 ((u.role IN('admin','super_admin') AND(p_action='read' OR p_team IS NULL OR EXISTS(SELECT 1 FROM public.admin_teams WHERE id=p_team AND is_active AND deleted_at IS NULL))) OR
 (u.role='team_member' AND EXISTS(SELECT 1 FROM public.team_memberships m JOIN public.admin_teams t ON t.id=m.team_id AND t.is_active AND t.deleted_at IS NULL
 JOIN public.team_page_access a ON a.team_id=t.id AND a.page_path='/admin/linktree' AND a.can_access
 JOIN public.team_permissions p ON p.team_id=t.id AND p.resource_type='linktree'
 WHERE m.admin_user_id=u.id AND m.team_id=p_team AND m.is_active AND CASE p_action
 WHEN 'read' THEN p.permission='crud' AND p.can_read WHEN 'create' THEN p.permission='crud' AND p.can_create
 WHEN 'update' THEN p.permission='crud' AND p.can_update WHEN 'delete' THEN p.permission='crud' AND p.can_delete
 WHEN 'publish' THEN p.permission IN('publish','linktree.publish') AND p.can_update ELSE false END))));
$$;
CREATE FUNCTION public.linktree_profile_projection(p_actor uuid,p_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('id',p.id,'username',p.username,'displayName',p.display_name,'bio',p.bio,'avatarUrl',p.avatar_url,
 'background',p.background_value::jsonb,'theme',p.theme,'active',p.is_active,'deletedAt',p.deleted_at,'teamId',p.team_id,
 'teamName',(SELECT name FROM public.admin_teams WHERE id=p.team_id),'revision',p.revision,'createdAt',p.created_at,'updatedAt',p.updated_at,
 'actions',(SELECT coalesce(jsonb_agg(a),'[]') FROM unnest(ARRAY['read','create','update','delete','publish'])a WHERE public.can_operate_linktree(p_actor,p.team_id,a)))
 FROM public.linktree_profiles p WHERE p.id=p_id AND public.can_operate_linktree(p_actor,p.team_id,'read');
$$;
CREATE FUNCTION public.linktree_link_projection(p_id uuid,p_public boolean DEFAULT false) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('id',l.id,'title',l.title,'url',l.url,'description',l.description,'icon',l.icon_value,'buttonStyle',l.button_style,
 'buttonColor',l.button_color,'textColor',l.text_color,'embedType',l.embed_type,'showClickCount',l.show_click_count,
 'clickCount',CASE WHEN NOT p_public OR l.show_click_count THEN l.click_count::text ELSE NULL END,'active',l.is_active,'order',l.sort_order)
 ||CASE WHEN p_public THEN '{}'::jsonb ELSE jsonb_build_object('deletedAt',l.deleted_at,'createdAt',l.created_at,'updatedAt',l.updated_at) END
 FROM public.linktree_links l WHERE l.id=p_id;
$$;
CREATE FUNCTION public.list_linktree_profiles(p_actor uuid,p_page integer,p_query text,p_state text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE r jsonb;BEGIN
 IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 10000 OR p_state IS NULL OR p_state NOT IN('current','active','draft','trash') THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 WITH eligible AS(SELECT * FROM public.linktree_profiles p WHERE public.can_operate_linktree(p_actor,p.team_id,'read') AND(p.deleted_at IS NOT NULL)=(p_state='trash')
  AND(p_state NOT IN('active','draft') OR p.is_active=(p_state='active')) AND(coalesce(p_query,'')='' OR strpos(lower(p.username||' '||p.display_name),lower(p_query))>0)),
 page AS(SELECT * FROM eligible ORDER BY created_at DESC,id DESC LIMIT 30 OFFSET(p_page-1)*30)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(public.linktree_profile_projection(p_actor,id) ORDER BY created_at DESC,id DESC) FROM page),'[]'),
 'total',(SELECT count(*) FROM eligible),'pageSize',30) INTO r;RETURN r;
END $$;
CREATE FUNCTION public.linktree_profile_detail(p_actor uuid,p_id uuid,p_page integer,p_trash boolean) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE p jsonb;r jsonb;BEGIN
 p:=public.linktree_profile_projection(p_actor,p_id);IF p IS NULL THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 10000 OR p_trash IS NULL THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 SELECT jsonb_build_object('profile',p,'links',coalesce((SELECT jsonb_agg(public.linktree_link_projection(id,false) ORDER BY sort_order,id) FROM
 (SELECT * FROM public.linktree_links WHERE profile_id=p_id AND(deleted_at IS NOT NULL)=p_trash ORDER BY sort_order,id LIMIT 30 OFFSET(p_page-1)*30)l),'[]'),
 'linkTotal',(SELECT count(*) FROM public.linktree_links WHERE profile_id=p_id AND(deleted_at IS NOT NULL)=p_trash),'linkPageSize',30) INTO r;RETURN r;
END $$;
CREATE FUNCTION public.mutate_linktree(p_actor uuid,p_session uuid,p_verified_hash text,p_id uuid,p_action text,p_revision integer,p_document jsonb,p_key_hash text,p_request_hash text,p_request_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE u public.admin_users;p public.linktree_profiles;l public.linktree_links;neighbor public.linktree_links;k public.idempotency_keys;doc jsonb;r jsonb;s text;team uuid;required text;confirm_needed boolean:=false;expected text;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('linktree-administration',0));
 SELECT * INTO u FROM public.admin_users WHERE id=p_actor AND is_active AND NOT must_change_password AND deleted_at IS NULL AND role IN('admin','super_admin','team_member') AND(locked_until IS NULL OR locked_until<=now());
 IF u.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.admin_sessions WHERE id=p_session AND admin_user_id=u.id AND revoked_at IS NULL AND idle_expires_at>now() AND absolute_expires_at>now()) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 IF p_action IS NULL OR p_action NOT IN('create','update','publish','unpublish','archive','restore','link_create','link_update','link_publish','link_unpublish','link_archive','link_restore','move')
 OR p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$' OR p_request_hash IS NULL OR p_request_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 IF p_action='create' THEN team:=(p_document->>'teamId')::uuid;
  IF NOT public.can_operate_linktree(u.id,team,'read') OR NOT public.can_operate_linktree(u.id,team,'create') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 ELSE SELECT * INTO p FROM public.linktree_profiles WHERE id=p_id FOR UPDATE;team:=p.team_id;
  IF p.id IS NULL OR NOT public.can_operate_linktree(u.id,team,'read') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 END IF;
 s:='linktree.'||p_action||':'||u.id||':'||coalesce(p_id::text,'new');
 SELECT * INTO k FROM public.idempotency_keys WHERE scope=s AND key_hash=p_key_hash;
 IF FOUND THEN IF k.request_hash IS DISTINCT FROM p_request_hash THEN RAISE EXCEPTION 'CONFLICT';END IF;RETURN k.result;END IF;
 IF p_action<>'create' THEN
  IF p.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'CONFLICT';END IF;
  IF p.deleted_at IS NOT NULL AND p_action<>'restore' THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  required:=CASE WHEN p_action='link_create' THEN 'create' WHEN p_action IN('publish','unpublish','link_publish','link_unpublish') THEN 'publish' WHEN p_action IN('archive','restore','link_archive','link_restore') THEN 'delete' ELSE 'update' END;
  IF NOT public.can_operate_linktree(u.id,team,required) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
  expected:=p.display_name;
  IF p_action LIKE 'link_%' AND p_action<>'link_create' OR p_action='move' THEN
   SELECT * INTO l FROM public.linktree_links WHERE id=(p_document->>'linkId')::uuid AND profile_id=p.id FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
   IF l.deleted_at IS NOT NULL AND p_action<>'link_restore' THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
   IF p_action<>'move' THEN expected:=l.title;END IF;
  END IF;
  confirm_needed:=p_action IN('publish','unpublish','archive','restore','link_publish','link_unpublish','link_archive','link_restore') OR(p_action='update' AND p.is_active) OR(p_action='link_update' AND l.is_active) OR(p_action='move' AND p.is_active);
  IF(p_action='update' AND p.is_active OR p_action='link_update' AND l.is_active OR p_action='move' AND p.is_active OR p_action='archive' AND p.is_active OR p_action='link_archive' AND l.is_active)
   AND NOT public.can_operate_linktree(u.id,team,'publish') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
  IF confirm_needed AND(p_verified_hash IS NULL OR p_verified_hash IS DISTINCT FROM u.password_hash OR p_document->>'confirmation' IS DISTINCT FROM expected) THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 END IF;
 doc:=p_document->'record';
 IF p_action IN('create','update') THEN
  IF doc->>'username' IS NULL OR length(doc->>'username') NOT BETWEEN 1 AND 50 OR doc->>'username'!~'^[a-z0-9]([a-z0-9_-]*[a-z0-9])?$'
   OR length(coalesce(doc->>'displayName','')) NOT BETWEEN 2 AND 100 OR doc->'background' IS NULL THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
  IF p_action='create' THEN
   INSERT INTO public.linktree_profiles(username,display_name,bio,avatar_url,background_type,background_value,theme,is_active,team_id,created_by)
    VALUES(doc->>'username',doc->>'displayName',doc->>'bio',doc->>'avatarUrl',doc->'background'->>'type',(doc->'background')::text,doc->>'theme',false,team,u.id) RETURNING * INTO p;
  ELSE
   IF EXISTS(SELECT 1 FROM public.linktree_username_reservations WHERE username=doc->>'username' AND profile_id<>p.id) THEN RAISE EXCEPTION 'DUPLICATE';END IF;
   UPDATE public.linktree_profiles SET username=doc->>'username',display_name=doc->>'displayName',bio=doc->>'bio',avatar_url=doc->>'avatarUrl',
    background_type=doc->'background'->>'type',background_value=(doc->'background')::text,theme=doc->>'theme' WHERE id=p.id RETURNING * INTO p;
  END IF;
  INSERT INTO public.linktree_username_reservations(username,profile_id) VALUES(p.username,p.id) ON CONFLICT DO NOTHING;
  IF NOT EXISTS(SELECT 1 FROM public.linktree_username_reservations WHERE username=p.username AND profile_id=p.id) THEN RAISE EXCEPTION 'DUPLICATE';END IF;
 ELSIF p_action IN('publish','unpublish','archive','restore') THEN
  IF(p_action='publish' AND p.is_active) OR(p_action='unpublish' AND NOT p.is_active) OR(p_action='restore' AND p.deleted_at IS NULL) THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  UPDATE public.linktree_profiles SET is_active=p_action='publish',deleted_at=CASE WHEN p_action='archive' THEN now() WHEN p_action='restore' THEN NULL ELSE deleted_at END WHERE id=p.id;
 ELSIF p_action IN('link_create','link_update') THEN
  IF length(coalesce(doc->>'title','')) NOT BETWEEN 1 AND 100 OR doc->>'url' IS NULL OR doc->>'url'!~'^(https://|/(forms|events)/[a-z0-9-]+$|/(team|resources|sponsors|gallery|contact)$)' OR doc->>'embedType' NOT IN('none','google_form','youtube') THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
  IF p_action='link_create' THEN
   IF(SELECT count(*) FROM public.linktree_links WHERE profile_id=p.id AND deleted_at IS NULL)>=100 THEN RAISE EXCEPTION 'LINKTREE_LIMIT';END IF;
   INSERT INTO public.linktree_links(profile_id,title,url,description,icon_type,icon_value,button_style,button_color,text_color,embed_type,show_click_count,is_active,sort_order)
    VALUES(p.id,doc->>'title',doc->>'url',doc->>'description','link',doc->>'icon',doc->>'buttonStyle',doc->>'buttonColor',doc->>'textColor',doc->>'embedType',(doc->>'showClickCount')::boolean,false,
    (SELECT coalesce(max(sort_order),-1)+1 FROM public.linktree_links WHERE profile_id=p.id)) RETURNING * INTO l;
  ELSE UPDATE public.linktree_links SET title=doc->>'title',url=doc->>'url',description=doc->>'description',icon_value=doc->>'icon',button_style=doc->>'buttonStyle',
   button_color=doc->>'buttonColor',text_color=doc->>'textColor',embed_type=doc->>'embedType',show_click_count=(doc->>'showClickCount')::boolean,updated_at=clock_timestamp() WHERE id=l.id RETURNING * INTO l;END IF;
 ELSIF p_action IN('link_publish','link_unpublish','link_archive','link_restore') THEN
  IF(p_action='link_publish' AND l.is_active) OR(p_action='link_unpublish' AND NOT l.is_active) OR(p_action='link_restore' AND l.deleted_at IS NULL) THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  IF p_action='link_restore' AND(SELECT count(*) FROM public.linktree_links WHERE profile_id=p.id AND deleted_at IS NULL)>=100 THEN RAISE EXCEPTION 'LINKTREE_LIMIT';END IF;
  UPDATE public.linktree_links SET is_active=p_action='link_publish',deleted_at=CASE WHEN p_action='link_archive' THEN now() WHEN p_action='link_restore' THEN NULL ELSE deleted_at END,updated_at=clock_timestamp() WHERE id=l.id;
 ELSIF p_action='move' THEN
  IF p_document->>'direction' NOT IN('up','down') THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
  SELECT * INTO neighbor FROM public.linktree_links WHERE profile_id=p.id AND deleted_at IS NULL AND
   CASE WHEN p_document->>'direction'='up' THEN(sort_order,id)<(l.sort_order,l.id) ELSE(sort_order,id)>(l.sort_order,l.id) END
   ORDER BY CASE WHEN p_document->>'direction'='up' THEN sort_order END DESC,CASE WHEN p_document->>'direction'='down' THEN sort_order END ASC,id LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  UPDATE public.linktree_links SET sort_order=CASE WHEN id=l.id THEN neighbor.sort_order ELSE l.sort_order END,updated_at=clock_timestamp() WHERE id IN(l.id,neighbor.id);
 END IF;
 IF p_action<>'create' THEN UPDATE public.linktree_profiles SET revision=revision+1,updated_at=clock_timestamp() WHERE id=p.id RETURNING * INTO p;END IF;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata) VALUES(u.id,'linktree.'||p_action,'linktree_profile',p.id,p_request_id,jsonb_build_object('revision',p.revision,'linkId',l.id,'teamId',team));
 r:=jsonb_build_object('id',p.id,'revision',p.revision,'linkId',l.id);
 INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result) VALUES(s,p_key_hash,p_request_hash,200,r);RETURN r;
END $$;
CREATE FUNCTION public.public_linktree_profile(p_username text) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('id',p.id,'username',p.username,'displayName',p.display_name,'bio',p.bio,'avatarUrl',p.avatar_url,'background',p.background_value::jsonb,'theme',p.theme,
 'links',coalesce((SELECT jsonb_agg(public.linktree_link_projection(l.id,true) ORDER BY sort_order,id) FROM public.linktree_links l WHERE l.profile_id=p.id AND l.is_active AND l.deleted_at IS NULL),'[]'))
 FROM public.linktree_profiles p WHERE p.username=p_username AND p.is_active AND p.deleted_at IS NULL AND(p.team_id IS NULL OR EXISTS(SELECT 1 FROM public.admin_teams WHERE id=p.team_id AND is_active AND deleted_at IS NULL));
$$;
CREATE FUNCTION public.record_linktree_activity(p_username text,p_link uuid) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE p public.linktree_profiles;BEGIN
 SELECT * INTO p FROM public.linktree_profiles q WHERE q.username=p_username AND q.is_active AND q.deleted_at IS NULL AND(q.team_id IS NULL OR EXISTS(SELECT 1 FROM public.admin_teams WHERE id=q.team_id AND is_active AND deleted_at IS NULL)) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_link IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.linktree_links WHERE id=p_link AND profile_id=p.id AND is_active AND deleted_at IS NULL) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 INSERT INTO public.linktree_analytics(profile_id,link_id,day,event_count) VALUES(p.id,p_link,(clock_timestamp() AT TIME ZONE 'UTC')::date,1)
 ON CONFLICT ON CONSTRAINT linktree_daily_unique DO UPDATE SET event_count=public.linktree_analytics.event_count+1,clicked_at=clock_timestamp();
 IF p_link IS NULL THEN UPDATE public.linktree_profiles SET view_count=view_count+1 WHERE id=p.id;
 ELSE UPDATE public.linktree_links SET click_count=click_count+1 WHERE id=p_link;END IF;
END $$;
CREATE FUNCTION public.linktree_analytics_report(p_actor uuid,p_profile uuid,p_days integer) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE p public.linktree_profiles;r jsonb;BEGIN
 SELECT * INTO p FROM public.linktree_profiles WHERE id=p_profile;
 IF NOT FOUND OR NOT public.can_operate_linktree(p_actor,p.team_id,'read') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_days IS NULL OR p_days NOT IN(7,30,90) THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 WITH activity AS(SELECT * FROM public.linktree_analytics WHERE profile_id=p.id AND day>=(current_timestamp AT TIME ZONE 'UTC')::date-(p_days-1)),
 days AS(SELECT day,coalesce(sum(event_count)FILTER(WHERE link_id IS NULL),0)::text views,coalesce(sum(event_count)FILTER(WHERE link_id IS NOT NULL),0)::text clicks FROM activity GROUP BY day),
 links AS(SELECT a.link_id,l.title,sum(a.event_count)::text clicks FROM activity a JOIN public.linktree_links l ON l.id=a.link_id GROUP BY a.link_id,l.title ORDER BY sum(a.event_count) DESC,a.link_id LIMIT 100)
 SELECT jsonb_build_object('days',coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY day) FROM days d),'[]'),'links',coalesce((SELECT jsonb_agg(to_jsonb(l)) FROM links l),'[]'),
 'views',coalesce((SELECT sum(event_count) FROM activity WHERE link_id IS NULL),0)::text,'clicks',coalesce((SELECT sum(event_count) FROM activity WHERE link_id IS NOT NULL),0)::text,
 'lifetimeViews',p.view_count::text,'note','Approximate, rate-limited counts, not unique people. Only daily aggregates are retained; raw IPs, user agents and referrer URLs are never stored.') INTO r;RETURN r;
END $$;
REVOKE ALL ON FUNCTION gdg_security.retain_linktree_records(),public.can_operate_linktree(uuid,uuid,text),public.linktree_profile_projection(uuid,uuid),public.linktree_link_projection(uuid,boolean),
 public.list_linktree_profiles(uuid,integer,text,text),public.linktree_profile_detail(uuid,uuid,integer,boolean),public.mutate_linktree(uuid,uuid,text,uuid,text,integer,jsonb,text,text,uuid),
 public.public_linktree_profile(text),public.record_linktree_activity(text,uuid),public.linktree_analytics_report(uuid,uuid,integer) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.can_operate_linktree(uuid,uuid,text),public.linktree_profile_projection(uuid,uuid),public.linktree_link_projection(uuid,boolean),public.list_linktree_profiles(uuid,integer,text,text),
 public.linktree_profile_detail(uuid,uuid,integer,boolean),public.mutate_linktree(uuid,uuid,text,uuid,text,integer,jsonb,text,text,uuid),public.public_linktree_profile(text),
 public.record_linktree_activity(text,uuid),public.linktree_analytics_report(uuid,uuid,integer) TO service_role;
COMMIT;
