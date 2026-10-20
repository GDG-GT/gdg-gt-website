BEGIN;
ALTER TABLE public.team_announcements ADD COLUMN revision integer NOT NULL DEFAULT 1,
 ADD COLUMN publication_version integer NOT NULL DEFAULT 0,ADD COLUMN deleted_at timestamptz;
CREATE TABLE public.team_announcement_reads (
 announcement_id uuid NOT NULL REFERENCES public.team_announcements(id),
 user_id uuid NOT NULL REFERENCES public.admin_users(id),read_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(announcement_id,user_id)
);
ALTER TABLE public.team_announcement_reads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.team_announcement_reads FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.team_announcement_reads TO service_role;
CREATE FUNCTION public.can_read_team_announcement(p_actor uuid,p_id uuid) RETURNS boolean
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.team_announcements n WHERE n.id=p_id AND n.team_id IS NOT NULL AND
  public.can_operate_team(p_actor,n.team_id,'read') AND (public.can_operate_team(p_actor,n.team_id,'manage') OR
   (n.is_active AND n.deleted_at IS NULL AND n.is_published AND (n.scheduled_for IS NULL OR n.scheduled_for<=now()) AND (n.expires_at IS NULL OR n.expires_at>now()))));
$$;
CREATE FUNCTION public.list_team_announcements(p_actor uuid,p_team uuid,p_page integer,p_state text) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE manager boolean;result jsonb;BEGIN
 IF NOT public.can_operate_team(p_actor,p_team,'read') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_page NOT BETWEEN 1 AND 10000 OR p_state NOT IN ('current','drafts','published','archived') THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 manager:=public.can_operate_team(p_actor,p_team,'manage');
 IF NOT manager AND p_state<>'current' THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 WITH eligible AS(SELECT n.* FROM public.team_announcements n WHERE n.team_id=p_team AND public.can_read_team_announcement(p_actor,n.id)
  AND CASE p_state WHEN 'archived' THEN n.deleted_at IS NOT NULL WHEN 'drafts' THEN n.deleted_at IS NULL AND NOT n.is_published
   WHEN 'published' THEN n.deleted_at IS NULL AND n.is_published ELSE n.deleted_at IS NULL END),
 page AS(SELECT * FROM eligible ORDER BY is_pinned DESC,created_at DESC,id LIMIT 20 OFFSET (p_page-1)*20)
 SELECT jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object('id',n.id,'team_id',n.team_id,'title',n.title,'message',n.message,
  'priority',n.priority,'is_pinned',n.is_pinned,'is_published',n.is_published,'scheduled_for',n.scheduled_for,'expires_at',n.expires_at,
  'revision',n.revision,'deleted_at',n.deleted_at,'created_at',n.created_at,'updated_at',n.updated_at,
  'authorName',(SELECT display_name FROM public.admin_users WHERE id=n.author_id),
  'isRead',EXISTS(SELECT 1 FROM public.team_announcement_reads WHERE announcement_id=n.id AND user_id=p_actor),
  'readCount',CASE WHEN manager THEN (SELECT count(*) FROM public.team_announcement_reads WHERE announcement_id=n.id) ELSE NULL END)
  ORDER BY n.is_pinned DESC,n.created_at DESC,n.id),'[]'),'total',(SELECT count(*) FROM eligible),'page',p_page,'pageSize',20,'canManage',manager)
 INTO result FROM page n;RETURN result;
END $$;
CREATE FUNCTION public.mutate_team_announcement(p_actor uuid,p_session uuid,p_team uuid,p_id uuid,p_action text,p_revision integer,
 p_document jsonb,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE n public.team_announcements;audience jsonb;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('team-administration',0));
 PERFORM 1 FROM public.admin_sessions s JOIN public.admin_users u ON u.id=s.admin_user_id WHERE s.id=p_session AND u.id=p_actor AND u.is_active
  AND NOT u.must_change_password AND u.deleted_at IS NULL AND s.revoked_at IS NULL AND s.idle_expires_at>now() AND s.absolute_expires_at>now();
 IF NOT FOUND THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 IF p_action='read' THEN
  IF NOT public.can_read_team_announcement(p_actor,p_id) OR NOT EXISTS(SELECT 1 FROM public.team_announcements WHERE id=p_id AND team_id=p_team) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  INSERT INTO public.team_announcement_reads(announcement_id,user_id) VALUES(p_id,p_actor) ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('read',true);
 END IF;
 IF NOT public.can_operate_team(p_actor,p_team,'manage') OR NOT EXISTS(SELECT 1 FROM public.admin_teams WHERE id=p_team AND is_active AND deleted_at IS NULL) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_action='create' THEN
  INSERT INTO public.team_announcements(team_id,title,message,priority,is_pinned,scheduled_for,expires_at,author_id,is_published)
   VALUES(p_team,p_document->>'title',p_document->>'message',p_document->>'priority',(p_document->>'pinned')::boolean,
    (p_document->>'scheduledFor')::timestamptz,(p_document->>'expiresAt')::timestamptz,p_actor,false) RETURNING * INTO n;
 ELSE
  SELECT * INTO n FROM public.team_announcements WHERE id=p_id AND team_id=p_team FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  IF n.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'CONFLICT';END IF;
  IF n.deleted_at IS NOT NULL AND p_action<>'restore' THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  IF p_action='update' THEN
   UPDATE public.team_announcements SET title=p_document->>'title',message=p_document->>'message',priority=p_document->>'priority',
    is_pinned=(p_document->>'pinned')::boolean,scheduled_for=(p_document->>'scheduledFor')::timestamptz,expires_at=(p_document->>'expiresAt')::timestamptz,
    is_published=false WHERE id=n.id;
  ELSIF p_action='publish' THEN
   IF n.is_published OR n.expires_at<=now() OR (n.expires_at IS NOT NULL AND n.scheduled_for IS NOT NULL AND n.expires_at<=n.scheduled_for) THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
   UPDATE public.team_announcements SET is_published=true,publication_version=publication_version+1 WHERE id=n.id;
  ELSIF p_action='unpublish' THEN UPDATE public.team_announcements SET is_published=false WHERE id=n.id;
  ELSIF p_action='pin' THEN UPDATE public.team_announcements SET is_pinned=(p_document->>'pinned')::boolean WHERE id=n.id;
  ELSIF p_action='archive' THEN UPDATE public.team_announcements SET is_published=false,is_active=false,deleted_at=now() WHERE id=n.id;
  ELSIF p_action='restore' THEN
   IF n.deleted_at IS NULL THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
   UPDATE public.team_announcements SET is_published=false,is_active=true,deleted_at=NULL WHERE id=n.id;
  ELSE RAISE EXCEPTION 'INVALID_STATE';END IF;
  UPDATE public.team_announcements SET revision=revision+1,updated_at=now() WHERE id=n.id RETURNING * INTO n;
 END IF;
 IF p_action='publish' THEN
  SELECT coalesce(jsonb_agg(m.admin_user_id),'[]') INTO audience FROM public.team_memberships m JOIN public.admin_users u ON u.id=m.admin_user_id
   WHERE m.team_id=p_team AND m.is_active AND u.is_active AND u.role<>'blog_editor' AND u.deleted_at IS NULL AND NOT u.must_change_password;
  INSERT INTO public.delivery_jobs(kind,deduplication_key,payload,next_attempt_at) VALUES('team_announcement','team-announcement:'||n.id||':'||n.publication_version,
   jsonb_build_object('announcementId',n.id,'version',n.publication_version,'audience',audience),greatest(now(),coalesce(n.scheduled_for,now())));
 END IF;
 INSERT INTO public.team_activity_log(team_id,actor_id,action,details) VALUES(p_team,p_actor,'announcement_'||p_action,jsonb_build_object('announcementId',n.id));
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id) VALUES(p_actor,'teams.announcement_'||p_action,'team_announcement',n.id,p_request_id);
 RETURN jsonb_build_object('id',n.id,'revision',n.revision);
END $$;
CREATE FUNCTION public.deliver_team_announcement(p_job uuid,p_lease uuid) RETURNS integer
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.delivery_jobs;n public.team_announcements;sent integer;BEGIN
 SELECT * INTO j FROM public.delivery_jobs WHERE id=p_job AND lease_token=p_lease AND state='running' AND kind='team_announcement' AND locked_until>now() FOR UPDATE;
 IF NOT FOUND THEN RETURN 0;END IF;
 SELECT * INTO n FROM public.team_announcements WHERE id=(j.payload->>'announcementId')::uuid FOR SHARE;
 IF NOT FOUND OR NOT n.is_published OR NOT n.is_active OR n.deleted_at IS NOT NULL OR n.publication_version<>(j.payload->>'version')::integer
  OR n.scheduled_for>now() OR n.expires_at<=now() OR NOT EXISTS(SELECT 1 FROM public.admin_teams WHERE id=n.team_id AND is_active AND deleted_at IS NULL) THEN RETURN 0;END IF;
 INSERT INTO public.notifications(user_id,type,title,message,link,delivery_key)
  SELECT u.id,'system','Team announcement','A new announcement is available in your team workspace.',
   '/admin/team/'||n.team_id||'?section=announcements','team-announcement:'||n.id||':'||n.publication_version||':'||u.id
   FROM public.admin_users u JOIN public.team_memberships m ON m.admin_user_id=u.id AND m.team_id=n.team_id AND m.is_active
   WHERE u.is_active AND u.role<>'blog_editor' AND NOT u.must_change_password AND u.deleted_at IS NULL AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(j.payload->'audience') a WHERE a.value=u.id::text)
   ON CONFLICT(delivery_key) DO NOTHING;
 GET DIAGNOSTICS sent=ROW_COUNT;RETURN sent;
END $$;
CREATE OR REPLACE FUNCTION public.claim_delivery_jobs(p_limit integer) RETURNS SETOF public.delivery_jobs
 LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT * FROM public.claim_worker_jobs(p_limit,ARRAY['event_confirmation','event_message','newsletter_confirmation',
 'contact_acknowledgment','contact_notification','form_access','form_response_notification','account_access','team_invite','team_announcement']);
$$;
REVOKE ALL ON FUNCTION public.can_read_team_announcement(uuid,uuid),public.list_team_announcements(uuid,uuid,integer,text),
 public.mutate_team_announcement(uuid,uuid,uuid,uuid,text,integer,jsonb,uuid),public.deliver_team_announcement(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_team_announcement(uuid,uuid),public.list_team_announcements(uuid,uuid,integer,text),
 public.mutate_team_announcement(uuid,uuid,uuid,uuid,text,integer,jsonb,uuid),public.deliver_team_announcement(uuid,uuid) TO service_role;
COMMIT;
