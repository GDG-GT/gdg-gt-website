BEGIN;
ALTER TABLE public.announcements ADD COLUMN revision integer NOT NULL DEFAULT 1,
 ADD COLUMN state text NOT NULL DEFAULT 'Draft' CHECK(state IN ('Draft','Scheduled','Published','Expired','Archived')),
 ADD COLUMN scheduled_for timestamptz,ADD COLUMN expires_at timestamptz,ADD COLUMN published_at timestamptz,
 ADD COLUMN publication_version integer NOT NULL DEFAULT 0,ADD COLUMN email_enabled boolean NOT NULL DEFAULT false,
 ADD COLUMN approved_by uuid REFERENCES public.admin_users(id);
ALTER TABLE public.announcement_reads DROP CONSTRAINT announcement_reads_announcement_id_user_id_key,
 ADD COLUMN publication_version integer NOT NULL DEFAULT 1,ADD UNIQUE(announcement_id,user_id,publication_version);
CREATE TABLE public.announcement_recipients(
 announcement_id uuid NOT NULL REFERENCES public.announcements(id),publication_version integer NOT NULL,user_id uuid NOT NULL REFERENCES public.admin_users(id),
 email_snapshot text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(announcement_id,publication_version,user_id));
CREATE TABLE gdg_security.announcement_previews(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_id uuid NOT NULL REFERENCES public.admin_users(id),session_id uuid NOT NULL REFERENCES public.admin_sessions(id),
 announcement_id uuid NOT NULL REFERENCES public.announcements(id),revision integer NOT NULL,recipients uuid[] NOT NULL,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes',consumed_at timestamptz);
ALTER TABLE public.announcement_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE gdg_security.announcement_previews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.announcement_recipients,gdg_security.announcement_previews FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT SELECT,INSERT,UPDATE ON public.announcement_recipients,gdg_security.announcement_previews TO service_role;
CREATE INDEX chapter_announcement_schedules ON public.announcements(scheduled_for,id) WHERE state='Scheduled';
CREATE FUNCTION public.can_manage_chapter_announcements(p_actor uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.admin_users WHERE id=p_actor AND is_active AND NOT must_change_password AND deleted_at IS NULL AND role IN('super_admin','admin'));
$$;
-- Canonical audiences use immutable account IDs for explicitly selected people.
-- An address later assigned to another account never inherits an old audience.
CREATE FUNCTION public.canonical_announcement_audience(p_document jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE ids uuid[];n integer;BEGIN
 IF p_document->>'type'='all' THEN RETURN '{"type":"all"}';
 ELSIF p_document->>'type'='roles' THEN
  IF jsonb_typeof(p_document->'roles')<>'array' OR jsonb_array_length(p_document->'roles') NOT BETWEEN 1 AND 4 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_document->'roles') r WHERE r.value NOT IN('super_admin','admin','team_member','blog_editor')) THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
  RETURN jsonb_build_object('type','roles','roles',p_document->'roles');
 ELSIF p_document->>'type'='teams' THEN
  SELECT count(*) INTO n FROM public.admin_teams WHERE id IN(SELECT value::uuid FROM jsonb_array_elements_text(p_document->'teamIds')) AND is_active AND deleted_at IS NULL;
  IF n NOT BETWEEN 1 AND 20 OR n<>jsonb_array_length(p_document->'teamIds') THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  RETURN jsonb_build_object('type','teams','teamIds',p_document->'teamIds');
 ELSIF p_document->>'type'='users' THEN
  SELECT array_agg(id ORDER BY id) INTO ids FROM public.admin_users WHERE email IN(SELECT value FROM jsonb_array_elements_text(p_document->'emails')) AND is_active AND NOT must_change_password AND deleted_at IS NULL;
  IF coalesce(cardinality(ids),0) NOT BETWEEN 1 AND 100 OR cardinality(ids)<>jsonb_array_length(p_document->'emails') THEN RAISE EXCEPTION 'ACCOUNT_NOT_READY';END IF;
  RETURN jsonb_build_object('type','users','userIds',to_jsonb(ids));
 ELSE RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
END $$;
CREATE FUNCTION public.announcement_audience_contains(p_audience jsonb,p_user uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.admin_users u WHERE u.id=p_user AND u.is_active AND NOT u.must_change_password AND u.deleted_at IS NULL AND CASE p_audience->>'type'
 WHEN 'all' THEN true WHEN 'roles' THEN p_audience->'roles'?u.role WHEN 'users' THEN p_audience->'userIds'?u.id::text
 WHEN 'teams' THEN EXISTS(SELECT 1 FROM public.team_memberships m JOIN public.admin_teams t ON t.id=m.team_id AND t.is_active AND t.deleted_at IS NULL
  WHERE m.admin_user_id=u.id AND m.is_active AND p_audience->'teamIds'?t.id::text) ELSE false END);
$$;
CREATE FUNCTION public.announcement_audience_ids(p_audience jsonb) RETURNS uuid[] LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(array_agg(id ORDER BY id),'{}') FROM public.admin_users WHERE public.announcement_audience_contains(p_audience,id);
$$;
CREATE FUNCTION public.can_read_chapter_announcement(p_actor uuid,p_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.announcements n WHERE n.id=p_id AND(public.can_manage_chapter_announcements(p_actor) OR
  (n.state='Published' AND NOT n.is_archived AND(n.expires_at IS NULL OR n.expires_at>now()) AND public.announcement_audience_contains(n.target_audience,p_actor))));
$$;
CREATE FUNCTION public.chapter_announcement_projection(p_actor uuid,p_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('id',n.id,'title',n.title,'message',n.message,'authorName',(SELECT display_name FROM public.admin_users WHERE id=n.author_id),
  'priority',n.priority,'pinned',n.is_pinned,'state',n.state,'revision',n.revision,'scheduledFor',n.scheduled_for,'expiresAt',n.expires_at,'publishedAt',n.published_at,
  'created_at',n.created_at,'updated_at',n.updated_at,'publicationVersion',n.publication_version,'emailEnabled',n.email_enabled,'canManage',public.can_manage_chapter_announcements(p_actor),
  'audience',CASE WHEN public.can_manage_chapter_announcements(p_actor) THEN CASE WHEN n.target_audience->>'type'='users'
   THEN jsonb_build_object('type','users','emails',(SELECT coalesce(jsonb_agg(u.email ORDER BY u.email),'[]') FROM public.admin_users u WHERE n.target_audience->'userIds'?u.id::text)) ELSE n.target_audience END ELSE NULL END,
  'canAcknowledge',n.state='Published' AND(n.expires_at IS NULL OR n.expires_at>now()) AND public.announcement_audience_contains(n.target_audience,p_actor),
  'isRead',EXISTS(SELECT 1 FROM public.announcement_reads WHERE announcement_id=n.id AND user_id=p_actor AND publication_version=n.publication_version),
  'readCount',CASE WHEN public.can_manage_chapter_announcements(p_actor) THEN(SELECT count(*) FROM public.announcement_reads WHERE announcement_id=n.id AND publication_version=n.publication_version) ELSE NULL END,
  'recipientCount',CASE WHEN public.can_manage_chapter_announcements(p_actor) THEN(SELECT count(*) FROM public.announcement_recipients WHERE announcement_id=n.id AND publication_version=n.publication_version) ELSE NULL END,
  'delivery',CASE WHEN public.can_manage_chapter_announcements(p_actor) THEN(SELECT jsonb_build_object('queued',count(*) FILTER(WHERE state IN('pending','running')),'processed',count(*) FILTER(WHERE state='completed'),
   'failed',count(*) FILTER(WHERE state='dead'),'emailSent',count(*) FILTER(WHERE state='completed' AND provider_message_id IS NOT NULL)) FROM public.delivery_jobs WHERE kind='chapter_announcement' AND payload->>'announcementId'=n.id::text AND payload->>'version'=n.publication_version::text) ELSE NULL END)
 FROM public.announcements n WHERE n.id=p_id AND public.can_read_chapter_announcement(p_actor,n.id);
$$;
CREATE FUNCTION public.list_chapter_announcements(p_actor uuid,p_page integer,p_query text,p_state text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE manager boolean;result jsonb;BEGIN
 manager:=public.can_manage_chapter_announcements(p_actor);
 IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 10000 OR length(p_query)>100 OR p_state IS NULL OR p_state NOT IN('feed','all','Draft','Scheduled','Published','Expired','Archived') THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 IF NOT manager AND p_state<>'feed' THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 WITH eligible AS(SELECT n.* FROM public.announcements n WHERE public.can_read_chapter_announcement(p_actor,n.id) AND
  CASE p_state WHEN 'feed' THEN n.state='Published' AND(n.expires_at IS NULL OR n.expires_at>now()) WHEN 'all' THEN n.state<>'Archived' ELSE n.state=p_state END
  AND(p_query IS NULL OR strpos(lower(n.title),lower(p_query))>0)),page AS(SELECT * FROM eligible ORDER BY is_pinned DESC,created_at DESC,id DESC LIMIT 20 OFFSET(p_page-1)*20)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(public.chapter_announcement_projection(p_actor,id) ORDER BY is_pinned DESC,created_at DESC,id DESC) FROM page),'[]'),
  'total',(SELECT count(*) FROM eligible),'pageSize',20,'canManage',manager) INTO result;RETURN result;
END $$;
CREATE FUNCTION public.enqueue_chapter_announcement(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE n public.announcements;BEGIN
 SELECT * INTO n FROM public.announcements WHERE id=p_id AND state='Published';IF NOT FOUND THEN RETURN;END IF;
 INSERT INTO public.delivery_jobs(kind,deduplication_key,payload)
  SELECT 'chapter_announcement','chapter-announcement:'||n.id||':'||n.publication_version||':'||r.user_id,
   jsonb_build_object('announcementId',n.id,'version',n.publication_version,'recipientId',r.user_id)
  FROM public.announcement_recipients r WHERE r.announcement_id=n.id AND r.publication_version=n.publication_version ON CONFLICT(deduplication_key) DO NOTHING;
END $$;
CREATE FUNCTION public.mutate_chapter_announcement(p_actor uuid,p_session uuid,p_id uuid,p_action text,p_revision integer,p_document jsonb,p_key_hash text,p_request_hash text,p_request_id uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE n public.announcements;k public.idempotency_keys;v_scope text;result jsonb;audience jsonb;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('chapter-announcement:'||coalesce(p_id::text,p_actor::text),0));
 PERFORM 1 FROM public.admin_sessions s JOIN public.admin_users u ON u.id=s.admin_user_id WHERE s.id=p_session AND u.id=p_actor AND u.is_active AND NOT u.must_change_password AND u.deleted_at IS NULL
  AND s.revoked_at IS NULL AND s.idle_expires_at>now() AND s.absolute_expires_at>now();IF NOT FOUND THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 IF p_action='read' THEN
  SELECT * INTO n FROM public.announcements WHERE id=p_id AND state='Published' AND(expires_at IS NULL OR expires_at>now()) AND publication_version=(p_document->>'publicationVersion')::integer AND public.announcement_audience_contains(target_audience,p_actor);
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  INSERT INTO public.announcement_reads(announcement_id,user_id,publication_version) VALUES(n.id,p_actor,n.publication_version) ON CONFLICT DO NOTHING;RETURN jsonb_build_object('id',n.id,'read',true);
 END IF;
 IF NOT public.can_manage_chapter_announcements(p_actor) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 IF p_action IS NULL OR p_action NOT IN('create','update','unpublish','cancel_schedule','pin','archive','restore') THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
 v_scope:='chapter-announcement.'||p_action||':'||p_actor||':'||coalesce(p_id::text,'new');
 SELECT * INTO k FROM public.idempotency_keys WHERE scope=v_scope AND key_hash=p_key_hash;
 IF FOUND THEN IF k.request_hash IS DISTINCT FROM p_request_hash THEN RAISE EXCEPTION 'CONFLICT';END IF;RETURN k.result;END IF;
 IF p_action<>'create' THEN SELECT * INTO n FROM public.announcements WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;IF n.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'CONFLICT';END IF;
  IF n.state='Archived' AND p_action<>'restore' THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
 END IF;
 IF p_action IN('create','update') THEN
  IF p_action='update' AND n.state<>'Draft' THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  IF length(btrim(p_document->>'title')) NOT BETWEEN 2 AND 200 OR length(btrim(p_document->>'message')) NOT BETWEEN 2 AND 10000 OR p_document->>'title' IS NULL OR p_document->>'message' IS NULL THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
  audience:=public.canonical_announcement_audience(p_document->'audience');
  IF p_action='create' THEN
   INSERT INTO public.announcements(title,message,author_id,priority,is_pinned,target_audience,scheduled_for,expires_at,email_enabled)
    VALUES(p_document->>'title',p_document->>'message',p_actor,p_document->>'priority',(p_document->>'pinned')::boolean,audience,(p_document->>'scheduledFor')::timestamptz,(p_document->>'expiresAt')::timestamptz,(p_document->>'emailEnabled')::boolean) RETURNING * INTO n;
  ELSE UPDATE public.announcements SET title=p_document->>'title',message=p_document->>'message',priority=p_document->>'priority',is_pinned=(p_document->>'pinned')::boolean,
   target_audience=audience,scheduled_for=(p_document->>'scheduledFor')::timestamptz,expires_at=(p_document->>'expiresAt')::timestamptz,email_enabled=(p_document->>'emailEnabled')::boolean WHERE id=n.id;
  END IF;
 ELSIF p_action IN('unpublish','cancel_schedule') THEN
  IF(p_action='cancel_schedule' AND n.state<>'Scheduled') OR(p_action='unpublish' AND n.state NOT IN('Published','Expired')) THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  UPDATE public.announcements SET state='Draft',scheduled_for=NULL WHERE id=n.id;
 ELSIF p_action='pin' THEN UPDATE public.announcements SET is_pinned=(p_document->>'pinned')::boolean WHERE id=n.id;
 ELSIF p_action='archive' THEN UPDATE public.announcements SET state='Archived',is_archived=true WHERE id=n.id;
 ELSIF p_action='restore' THEN
  IF n.state<>'Archived' THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  UPDATE public.announcements SET state='Draft',is_archived=false,scheduled_for=NULL WHERE id=n.id;
 END IF;
 IF p_action<>'create' THEN UPDATE public.announcements SET revision=revision+1,updated_at=clock_timestamp() WHERE id=n.id RETURNING * INTO n;END IF;
 result:=jsonb_build_object('id',n.id,'revision',n.revision);
 INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result) VALUES(v_scope,p_key_hash,p_request_hash,200,result);
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id) VALUES(p_actor,'announcements.'||p_action,'announcement',n.id,p_request_id);
 RETURN result;
END $$;
CREATE FUNCTION public.preview_chapter_announcement(p_actor uuid,p_session uuid,p_id uuid,p_revision integer,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE n public.announcements;p gdg_security.announcement_previews;recipients uuid[];BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));
 IF NOT public.can_manage_chapter_announcements(p_actor) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM public.admin_sessions WHERE id=p_session AND admin_user_id=p_actor AND revoked_at IS NULL AND idle_expires_at>now() AND absolute_expires_at>now();IF NOT FOUND THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 SELECT * INTO n FROM public.announcements WHERE id=p_id AND state='Draft' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_STATE';END IF;IF n.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'CONFLICT';END IF;
 recipients:=public.announcement_audience_ids(n.target_audience);
 IF cardinality(recipients) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'AUDIENCE_LIMIT';END IF;
 INSERT INTO gdg_security.announcement_previews(actor_id,session_id,announcement_id,revision,recipients) VALUES(p_actor,p_session,n.id,n.revision,recipients) RETURNING * INTO p;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata) VALUES(p_actor,'announcements.audience_preview','announcement',n.id,p_request_id,jsonb_build_object('count',cardinality(recipients)));
 RETURN jsonb_build_object('id',p.id,'count',cardinality(recipients),'expiresAt',p.expires_at,'sample',(SELECT coalesce(jsonb_agg(x.display_name ORDER BY x.id),'[]') FROM(SELECT id,display_name FROM public.admin_users WHERE id=ANY(recipients) ORDER BY id LIMIT 20)x));
END $$;
CREATE FUNCTION public.confirm_chapter_announcement(p_actor uuid,p_session uuid,p_verified_hash text,p_id uuid,p_revision integer,p_preview uuid,p_confirmation text,p_key_hash text,p_request_hash text,p_request_id uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE u public.admin_users;n public.announcements;p gdg_security.announcement_previews;recipients uuid[];k public.idempotency_keys;v_scope text;result jsonb;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('chapter-announcement:'||p_id,0));
 SELECT * INTO u FROM public.admin_users WHERE id=p_actor AND is_active AND NOT must_change_password AND deleted_at IS NULL;
 IF NOT FOUND OR NOT public.can_manage_chapter_announcements(p_actor) OR u.password_hash IS DISTINCT FROM p_verified_hash OR p_verified_hash IS NULL OR u.locked_until>now() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM public.admin_sessions WHERE id=p_session AND admin_user_id=p_actor AND revoked_at IS NULL AND idle_expires_at>now() AND absolute_expires_at>now();IF NOT FOUND THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 v_scope:='chapter-announcement.publish:'||p_actor||':'||p_id;
 SELECT * INTO k FROM public.idempotency_keys WHERE scope=v_scope AND key_hash=p_key_hash;
 IF FOUND THEN IF k.request_hash IS DISTINCT FROM p_request_hash THEN RAISE EXCEPTION 'CONFLICT';END IF;RETURN k.result;END IF;
 SELECT * INTO n FROM public.announcements WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;IF n.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'CONFLICT';END IF;
 IF n.state<>'Draft' OR n.expires_at<=now() OR n.expires_at<=n.scheduled_for OR n.scheduled_for<=now() OR n.title IS DISTINCT FROM p_confirmation THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
 SELECT * INTO p FROM gdg_security.announcement_previews WHERE id=p_preview AND actor_id=p_actor AND session_id=p_session AND announcement_id=n.id AND revision=n.revision AND expires_at>now() AND consumed_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'PREVIEW_REQUIRED';END IF;
 recipients:=public.announcement_audience_ids(n.target_audience);
 IF recipients IS DISTINCT FROM p.recipients THEN RAISE EXCEPTION 'AUDIENCE_CHANGED';END IF;
 IF cardinality(recipients) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'AUDIENCE_LIMIT';END IF;
 UPDATE public.announcements SET state=CASE WHEN scheduled_for IS NULL THEN 'Published' ELSE 'Scheduled' END,published_at=CASE WHEN scheduled_for IS NULL THEN now() ELSE NULL END,
  publication_version=publication_version+1,approved_by=p_actor,revision=revision+1,updated_at=clock_timestamp() WHERE id=n.id RETURNING * INTO n;
 INSERT INTO public.announcement_recipients(announcement_id,publication_version,user_id,email_snapshot) SELECT n.id,n.publication_version,id,email FROM public.admin_users WHERE id=ANY(recipients);
 UPDATE gdg_security.announcement_previews SET consumed_at=now() WHERE id=p.id;
 IF n.state='Published' THEN PERFORM public.enqueue_chapter_announcement(n.id);END IF;
 result:=jsonb_build_object('id',n.id,'revision',n.revision,'state',n.state,'recipientCount',cardinality(recipients));
 INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result) VALUES(v_scope,p_key_hash,p_request_hash,200,result);
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata) VALUES(p_actor,'announcements.confirmed','announcement',n.id,p_request_id,jsonb_build_object('state',n.state,'recipients',cardinality(recipients),'email',n.email_enabled));
 RETURN result;
END $$;
CREATE FUNCTION public.advance_chapter_announcements() RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE n public.announcements;published integer:=0;expired integer:=0;cancelled integer:=0;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));
 FOR n IN SELECT * FROM public.announcements WHERE(state='Scheduled' AND scheduled_for<=now()) OR(state IN('Published','Scheduled') AND expires_at<=now()) ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1000 LOOP
  IF n.expires_at<=now() THEN UPDATE public.announcements SET state='Expired',revision=revision+1,updated_at=clock_timestamp() WHERE id=n.id;expired:=expired+1;
  ELSIF NOT public.can_manage_chapter_announcements(n.approved_by) THEN UPDATE public.announcements SET state='Draft',scheduled_for=NULL,revision=revision+1,updated_at=clock_timestamp() WHERE id=n.id;cancelled:=cancelled+1;
  ELSE UPDATE public.announcements SET state='Published',published_at=now(),revision=revision+1,updated_at=clock_timestamp() WHERE id=n.id;PERFORM public.enqueue_chapter_announcement(n.id);published:=published+1;END IF;
  INSERT INTO public.admin_actions(action,target_type,target_id,metadata) VALUES('announcements.schedule_advanced','announcement',n.id,jsonb_build_object('from',n.state));
 END LOOP;
 RETURN jsonb_build_object('published',published,'expired',expired,'cancelled',cancelled);
END $$;
CREATE FUNCTION public.prepare_chapter_announcement_notice(p_job uuid,p_lease uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.delivery_jobs;n public.announcements;r public.announcement_recipients;BEGIN
 SELECT * INTO j FROM public.delivery_jobs WHERE id=p_job AND lease_token=p_lease AND state='running' AND kind='chapter_announcement' AND locked_until>now() FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT * INTO n FROM public.announcements WHERE id=(j.payload->>'announcementId')::uuid AND state='Published' AND NOT is_archived AND publication_version=(j.payload->>'version')::integer AND(expires_at IS NULL OR expires_at>now());
 IF NOT FOUND OR NOT public.can_manage_chapter_announcements(n.approved_by) THEN RETURN NULL;END IF;
 SELECT * INTO r FROM public.announcement_recipients WHERE announcement_id=n.id AND publication_version=n.publication_version AND user_id=(j.payload->>'recipientId')::uuid;
 IF NOT FOUND OR NOT public.announcement_audience_contains(n.target_audience,r.user_id) OR NOT EXISTS(SELECT 1 FROM public.admin_users WHERE id=r.user_id AND email=r.email_snapshot) THEN RETURN NULL;END IF;
 INSERT INTO public.notifications(user_id,type,title,message,link,delivery_key) VALUES(r.user_id,'system','New chapter announcement','An announcement is available in your chapter workspace.',
  '/admin/communications?tab=announcements&announcement='||n.id,'chapter-announcement:'||n.id||':'||n.publication_version||':'||r.user_id) ON CONFLICT(delivery_key) DO NOTHING;
 RETURN jsonb_build_object('email',CASE WHEN n.email_enabled THEN r.email_snapshot ELSE NULL END,'announcementId',n.id);
END $$;
REVOKE ALL ON FUNCTION public.can_manage_chapter_announcements(uuid),public.canonical_announcement_audience(jsonb),public.announcement_audience_contains(jsonb,uuid),public.announcement_audience_ids(jsonb),
 public.can_read_chapter_announcement(uuid,uuid),public.chapter_announcement_projection(uuid,uuid),public.list_chapter_announcements(uuid,integer,text,text),public.enqueue_chapter_announcement(uuid),
 public.mutate_chapter_announcement(uuid,uuid,uuid,text,integer,jsonb,text,text,uuid),public.preview_chapter_announcement(uuid,uuid,uuid,integer,uuid),
 public.confirm_chapter_announcement(uuid,uuid,text,uuid,integer,uuid,text,text,text,uuid),public.advance_chapter_announcements(),public.prepare_chapter_announcement_notice(uuid,uuid) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.can_manage_chapter_announcements(uuid),public.canonical_announcement_audience(jsonb),public.announcement_audience_contains(jsonb,uuid),public.announcement_audience_ids(jsonb),
 public.can_read_chapter_announcement(uuid,uuid),public.chapter_announcement_projection(uuid,uuid),public.list_chapter_announcements(uuid,integer,text,text),public.enqueue_chapter_announcement(uuid),
 public.mutate_chapter_announcement(uuid,uuid,uuid,text,integer,jsonb,text,text,uuid),public.preview_chapter_announcement(uuid,uuid,uuid,integer,uuid),
 public.confirm_chapter_announcement(uuid,uuid,text,uuid,integer,uuid,text,text,text,uuid),public.advance_chapter_announcements(),public.prepare_chapter_announcement_notice(uuid,uuid) TO service_role;
COMMIT;
