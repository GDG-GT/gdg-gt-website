BEGIN;
CREATE FUNCTION public.team_announcement_record(p_actor uuid,p_team uuid,p_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE n public.team_announcements;manager boolean;BEGIN
 IF NOT public.can_read_team_announcement(p_actor,p_id) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT * INTO n FROM public.team_announcements WHERE id=p_id AND team_id=p_team;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 manager:=public.can_operate_team(p_actor,p_team,'manage');
 RETURN jsonb_build_object('record',jsonb_build_object('id',n.id,'team_id',n.team_id,'title',n.title,'message',n.message,
  'priority',n.priority,'is_pinned',n.is_pinned,'is_published',n.is_published,'scheduled_for',n.scheduled_for,'expires_at',n.expires_at,
  'revision',n.revision,'deleted_at',n.deleted_at,'created_at',n.created_at,'updated_at',n.updated_at,
  'authorName',(SELECT display_name FROM public.admin_users WHERE id=n.author_id),
  'isRead',EXISTS(SELECT 1 FROM public.team_announcement_reads WHERE announcement_id=n.id AND user_id=p_actor),
  'readCount',CASE WHEN manager THEN(SELECT count(*) FROM public.team_announcement_reads WHERE announcement_id=n.id) ELSE NULL END),'canManage',manager);
END $$;
CREATE FUNCTION public.list_team_announcements_filtered(p_actor uuid,p_team uuid,p_page integer,p_state text,p_title text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE manager boolean;result jsonb;BEGIN
 IF NOT public.can_operate_team(p_actor,p_team,'read') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 10000 OR p_state IS NULL OR p_state NOT IN('current','drafts','published','archived')
 OR(p_title IS NOT NULL AND length(p_title) NOT BETWEEN 2 AND 200) THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 manager:=public.can_operate_team(p_actor,p_team,'manage');
 IF NOT manager AND p_state<>'current' THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 WITH eligible AS(SELECT n.* FROM public.team_announcements n WHERE n.team_id=p_team AND public.can_read_team_announcement(p_actor,n.id)
  AND(p_title IS NULL OR n.title=p_title) AND CASE p_state WHEN 'archived' THEN n.deleted_at IS NOT NULL
   WHEN 'drafts' THEN n.deleted_at IS NULL AND NOT n.is_published WHEN 'published' THEN n.deleted_at IS NULL AND n.is_published ELSE n.deleted_at IS NULL END),
 page AS(SELECT * FROM eligible ORDER BY is_pinned DESC,created_at DESC,id LIMIT 20 OFFSET(p_page-1)*20)
 SELECT jsonb_build_object('items',coalesce(jsonb_agg((public.team_announcement_record(p_actor,p_team,n.id))->'record'
  ORDER BY n.is_pinned DESC,n.created_at DESC,n.id),'[]'),'total',(SELECT count(*) FROM eligible),'page',p_page,'pageSize',20,'canManage',manager)
 INTO result FROM page n;RETURN result;
END $$;
CREATE FUNCTION public.mutate_team_announcement_workspace(p_actor uuid,p_session uuid,p_team uuid,p_id uuid,p_action text,p_revision integer,
 p_document jsonb,p_key_hash text,p_request_hash text,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE a public.admin_users;n public.team_announcements;k public.idempotency_keys;v_result jsonb;v_id uuid;
 v_scope text:='team-announcement:'||p_actor;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('team-administration',0));
 SELECT * INTO a FROM public.admin_users WHERE id=p_actor FOR UPDATE;
 IF NOT FOUND OR NOT a.is_active OR a.deleted_at IS NOT NULL OR a.must_change_password OR a.locked_until>now()
 THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM public.admin_sessions WHERE id=p_session AND admin_user_id=p_actor AND revoked_at IS NULL
 AND idle_expires_at>now() AND absolute_expires_at>now() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 IF p_action IS NULL OR p_action NOT IN('create','update','publish','unpublish','pin','archive','restore','read')
 OR(p_action='create') IS DISTINCT FROM(p_id IS NULL) OR p_document IS NULL OR jsonb_typeof(p_document)<>'object'
 OR p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$'
 OR p_request_hash IS NULL OR p_request_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 IF p_action='read' THEN
  IF NOT public.can_read_team_announcement(p_actor,p_id) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 ELSE
  IF NOT public.can_operate_team(p_actor,p_team,'manage') OR NOT EXISTS(SELECT 1 FROM public.admin_teams WHERE id=p_team AND is_active AND deleted_at IS NULL)
   THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 END IF;
 IF p_id IS NOT NULL THEN
  SELECT * INTO n FROM public.team_announcements WHERE id=p_id AND team_id=p_team FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_scope||':'||p_key_hash,0));
 SELECT * INTO k FROM public.idempotency_keys WHERE scope=v_scope AND key_hash=p_key_hash;
 IF FOUND THEN
  IF k.request_hash IS DISTINCT FROM p_request_hash THEN RAISE EXCEPTION 'CONFLICT';END IF;
  SELECT * INTO n FROM public.team_announcements WHERE id=(k.result->>'id')::uuid AND team_id=p_team;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  IF p_action='read' THEN RETURN jsonb_build_object('read',true);END IF;
  RETURN jsonb_build_object('id',n.id,'revision',n.revision);
 END IF;
 IF p_id IS NOT NULL AND p_action<>'read' AND n.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'CONFLICT';END IF;
 IF(p_action IN('publish','unpublish','archive','restore') OR(p_action='update' AND n.is_published))
 AND p_document->>'confirmation' IS DISTINCT FROM n.title THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 v_result:=public.mutate_team_announcement(p_actor,p_session,p_team,p_id,p_action,p_revision,p_document,p_request_id);
 v_id:=coalesce((v_result->>'id')::uuid,p_id);
 INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result)
 VALUES(v_scope,p_key_hash,p_request_hash,200,jsonb_build_object('id',v_id));
 RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.team_announcement_record(uuid,uuid,uuid),
 public.list_team_announcements_filtered(uuid,uuid,integer,text,text),
 public.mutate_team_announcement_workspace(uuid,uuid,uuid,uuid,text,integer,jsonb,text,text,uuid) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.team_announcement_record(uuid,uuid,uuid),
 public.list_team_announcements_filtered(uuid,uuid,integer,text,text),
 public.mutate_team_announcement_workspace(uuid,uuid,uuid,uuid,text,integer,jsonb,text,text,uuid) TO service_role;
COMMIT;
