BEGIN;
ALTER TABLE public.channels ADD COLUMN visibility text NOT NULL DEFAULT 'private' CHECK(visibility IN ('internal','private','team')),
 ADD COLUMN team_id uuid REFERENCES public.admin_teams(id),ADD COLUMN revision integer NOT NULL DEFAULT 1;
ALTER TABLE public.channel_messages ADD COLUMN revision integer NOT NULL DEFAULT 1;
CREATE TABLE public.channel_memberships (
 channel_id uuid NOT NULL REFERENCES public.channels(id),admin_user_id uuid NOT NULL REFERENCES public.admin_users(id),
 role text NOT NULL DEFAULT 'member' CHECK(role IN ('owner','moderator','member')),is_active boolean NOT NULL DEFAULT true,
 last_read_at timestamptz,last_read_message_id uuid,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(channel_id,admin_user_id)
);
ALTER TABLE public.channel_memberships ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.channel_memberships FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.channel_memberships TO service_role;
CREATE INDEX channel_messages_history ON public.channel_messages(channel_id,created_at DESC,id DESC);
CREATE FUNCTION public.can_operate_channel(p_actor uuid,p_channel uuid,p_action text) RETURNS boolean
 LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE u public.admin_users;c public.channels;m public.channel_memberships;BEGIN
 SELECT * INTO u FROM public.admin_users WHERE id=p_actor AND is_active AND NOT must_change_password AND deleted_at IS NULL;
 IF NOT FOUND OR p_action NOT IN ('read','send','moderate','manage') THEN RETURN false;END IF;
 SELECT * INTO c FROM public.channels WHERE id=p_channel;
 IF NOT FOUND THEN RETURN false;END IF;
 IF u.role IN ('super_admin','admin') THEN RETURN p_action='read' OR NOT c.is_archived;END IF;
 IF c.team_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.team_memberships x JOIN public.admin_teams t ON t.id=x.team_id AND t.is_active AND t.deleted_at IS NULL
  WHERE x.team_id=c.team_id AND x.admin_user_id=u.id AND x.is_active) THEN RETURN false;END IF;
 SELECT * INTO m FROM public.channel_memberships WHERE channel_id=c.id AND admin_user_id=u.id AND is_active;
 IF u.role='blog_editor' AND m.admin_user_id IS NULL THEN RETURN false;END IF;
 IF c.visibility='private' AND m.admin_user_id IS NULL THEN RETURN false;END IF;
 IF c.visibility='internal' AND u.role NOT IN ('team_member','blog_editor') THEN RETURN false;END IF;
 IF c.visibility='team' AND c.team_id IS NULL THEN RETURN false;END IF;
 IF p_action='read' THEN RETURN true;END IF;
 IF c.is_archived THEN RETURN false;END IF;
 IF p_action='send' THEN RETURN true;END IF;
 RETURN coalesce((m.is_active AND m.role=ANY(CASE WHEN p_action='manage' THEN ARRAY['owner'] ELSE ARRAY['owner','moderator'] END)),false) OR
  (c.team_id IS NOT NULL AND public.can_operate_team(u.id,c.team_id,'manage'));
END $$;
CREATE FUNCTION public.list_channels(p_actor uuid,p_page integer,p_query text,p_archived boolean) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;BEGIN
 IF p_page NOT BETWEEN 1 AND 10000 OR length(p_query)>100 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 WITH eligible AS(SELECT c.* FROM public.channels c WHERE c.is_archived=p_archived AND public.can_operate_channel(p_actor,c.id,'read')
  AND (p_query IS NULL OR strpos(lower(c.name),lower(p_query))>0)),page AS(SELECT * FROM eligible ORDER BY name,id LIMIT 30 OFFSET (p_page-1)*30)
 SELECT jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('canManage',public.can_operate_channel(p_actor,c.id,'manage'),
  'canModerate',public.can_operate_channel(p_actor,c.id,'moderate'),'canSend',public.can_operate_channel(p_actor,c.id,'send'),
  'unreadCount',(SELECT count(*) FROM public.channel_messages n LEFT JOIN public.channel_memberships m ON m.channel_id=n.channel_id AND m.admin_user_id=p_actor
    WHERE n.channel_id=c.id AND NOT n.is_deleted AND n.sender_id<>p_actor AND
    (n.created_at,n.id)>(coalesce(m.last_read_at,'epoch'::timestamptz),coalesce(m.last_read_message_id,'00000000-0000-0000-0000-000000000000'::uuid)))) ORDER BY c.name,c.id),'[]'),
  'total',(SELECT count(*) FROM eligible),'page',p_page,'pageSize',30) INTO result FROM page c;RETURN result;
END $$;
CREATE FUNCTION public.mutate_channel(p_actor uuid,p_session uuid,p_verified_hash text,p_id uuid,p_action text,p_revision integer,
 p_document jsonb,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE u public.admin_users;c public.channels;target public.admin_users;m public.channel_memberships;team uuid;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('channel-administration',0));
 SELECT * INTO u FROM public.admin_users WHERE id=p_actor AND is_active AND NOT must_change_password AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND OR u.password_hash IS DISTINCT FROM p_verified_hash OR u.locked_until>now() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM public.admin_sessions WHERE id=p_session AND admin_user_id=u.id AND revoked_at IS NULL AND idle_expires_at>now() AND absolute_expires_at>now();
 IF NOT FOUND THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 IF p_action='create' THEN
  team:=(p_document->>'teamId')::uuid;
  IF p_document->>'visibility' NOT IN ('private','internal','team') OR (p_document->>'visibility'='team' AND team IS NULL)
   OR (team IS NOT NULL AND NOT public.can_operate_team(u.id,team,'manage')) OR
   (u.role NOT IN ('super_admin','admin') AND (team IS NULL OR p_document->>'visibility'<>'team')) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
  INSERT INTO public.channels(name,description,visibility,team_id,created_by)
   VALUES(p_document->>'name',p_document->>'description',p_document->>'visibility',team,u.id) RETURNING * INTO c;
  INSERT INTO public.channel_memberships(channel_id,admin_user_id,role) VALUES(c.id,u.id,'owner');
 ELSE
  SELECT * INTO c FROM public.channels WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  IF c.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'CONFLICT';END IF;
  IF p_action='restore' THEN
   IF NOT c.is_archived OR u.role NOT IN ('super_admin','admin') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
  ELSIF NOT public.can_operate_channel(u.id,c.id,'manage') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  IF p_action='update' THEN
   -- Room visibility/owning team cannot be silently widened by an edit.
   UPDATE public.channels SET name=p_document->>'name',description=p_document->>'description' WHERE id=c.id;
  ELSIF p_action IN ('archive','restore') THEN UPDATE public.channels SET is_archived=(p_action='archive') WHERE id=c.id;
  ELSIF p_action IN ('member_add','member_role','member_remove') THEN
   SELECT * INTO target FROM public.admin_users WHERE email=p_document->>'email' AND is_active AND NOT must_change_password AND deleted_at IS NULL FOR UPDATE;
   IF NOT FOUND OR (u.role<>'super_admin' AND target.role='super_admin') THEN RAISE EXCEPTION 'ACCOUNT_NOT_READY';END IF;
   IF c.team_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.team_memberships WHERE team_id=c.team_id AND admin_user_id=target.id AND is_active) THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
   IF p_document->>'role' NOT IN ('owner','moderator','member') THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
   IF target.id=u.id AND p_action='member_role' THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
   SELECT * INTO m FROM public.channel_memberships WHERE channel_id=c.id AND admin_user_id=target.id FOR UPDATE;
   IF p_action='member_add' AND m.is_active THEN RAISE EXCEPTION 'DUPLICATE';END IF;
   IF p_action<>'member_add' AND (m.admin_user_id IS NULL OR NOT m.is_active) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
   IF m.role='owner' AND (p_action='member_remove' OR p_document->>'role'<>'owner') AND
    NOT EXISTS(SELECT 1 FROM public.channel_memberships x JOIN public.admin_users a ON a.id=x.admin_user_id AND a.is_active AND a.deleted_at IS NULL
     WHERE x.channel_id=c.id AND x.admin_user_id<>target.id AND x.role='owner' AND x.is_active) THEN RAISE EXCEPTION 'LAST_CHANNEL_OWNER';END IF;
   IF p_action='member_remove' THEN UPDATE public.channel_memberships SET is_active=false,updated_at=now() WHERE channel_id=c.id AND admin_user_id=target.id;
   ELSE INSERT INTO public.channel_memberships(channel_id,admin_user_id,role) VALUES(c.id,target.id,p_document->>'role') ON CONFLICT(channel_id,admin_user_id)
    DO UPDATE SET role=EXCLUDED.role,is_active=true,updated_at=now();END IF;
  ELSE RAISE EXCEPTION 'INVALID_STATE';END IF;
  UPDATE public.channels SET revision=revision+1,updated_at=now() WHERE id=c.id RETURNING * INTO c;
 END IF;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id) VALUES(u.id,'channels.'||p_action,'channel',c.id,p_request_id);
 RETURN to_jsonb(c);
END $$;
CREATE FUNCTION public.list_channel_messages(p_actor uuid,p_channel uuid,p_before timestamptz,p_before_id uuid,p_pinned boolean) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;BEGIN
 IF NOT public.can_operate_channel(p_actor,p_channel,'read') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 WITH page AS(SELECT m.* FROM public.channel_messages m WHERE m.channel_id=p_channel
  AND (NOT p_pinned OR (m.is_pinned AND NOT m.is_deleted)) AND
  (p_before IS NULL OR (m.created_at,m.id)<(p_before,p_before_id)) ORDER BY created_at DESC,id DESC LIMIT 50)
 SELECT jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object('id',m.id,'channel_id',m.channel_id,'sender_id',m.sender_id,
  'senderName',(SELECT display_name FROM public.admin_users WHERE id=m.sender_id),'message',CASE WHEN m.is_deleted THEN '' ELSE m.message END,
  'is_deleted',m.is_deleted,'is_pinned',m.is_pinned,'revision',m.revision,'reply_to_id',m.reply_to_id,'created_at',m.created_at,'updated_at',m.updated_at,
  'canEdit',NOT m.is_deleted AND m.sender_id=p_actor AND public.can_operate_channel(p_actor,p_channel,'send'),
  'canDelete',NOT m.is_deleted AND (m.sender_id=p_actor OR public.can_operate_channel(p_actor,p_channel,'moderate')) AND public.can_operate_channel(p_actor,p_channel,'send'),
  'reply',CASE WHEN m.reply_to_id IS NOT NULL THEN (SELECT jsonb_build_object('id',r.id,'message',CASE WHEN r.is_deleted THEN '' ELSE left(r.message,200) END,'is_deleted',r.is_deleted)
   FROM public.channel_messages r WHERE r.id=m.reply_to_id AND r.channel_id=m.channel_id) ELSE NULL END) ORDER BY m.created_at,m.id),'[]'))
 INTO result FROM page m;RETURN result;
END $$;
CREATE FUNCTION public.mutate_channel_message(p_actor uuid,p_session uuid,p_channel uuid,p_id uuid,p_action text,p_revision integer,p_document jsonb,
 p_key_hash text,p_request_hash text,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c public.channels;m public.channel_messages;k public.idempotency_keys;result jsonb;BEGIN
 SELECT * INTO c FROM public.channels WHERE id=p_channel FOR UPDATE;
 IF NOT FOUND OR NOT public.can_operate_channel(p_actor,c.id,CASE WHEN p_action='read' THEN 'read' ELSE 'send' END) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 PERFORM 1 FROM public.admin_sessions WHERE id=p_session AND admin_user_id=p_actor AND revoked_at IS NULL AND idle_expires_at>now() AND absolute_expires_at>now();
 IF NOT FOUND THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 IF p_action='send' THEN
  SELECT * INTO k FROM public.idempotency_keys WHERE scope='channel.send:'||c.id||':'||p_actor AND key_hash=p_key_hash;
  IF FOUND THEN IF k.request_hash<>p_request_hash THEN RAISE EXCEPTION 'CONFLICT';END IF;RETURN k.result;END IF;
  IF p_document->>'replyToId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.channel_messages WHERE id=(p_document->>'replyToId')::uuid AND channel_id=c.id AND NOT is_deleted) THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  INSERT INTO public.channel_messages(channel_id,sender_id,message,reply_to_id,message_type)
   VALUES(c.id,p_actor,p_document->>'message',(p_document->>'replyToId')::uuid,'text') RETURNING * INTO m;
  result:=jsonb_build_object('id',m.id,'revision',m.revision);
  INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result) VALUES('channel.send:'||c.id||':'||p_actor,p_key_hash,p_request_hash,200,result);
 ELSE
  SELECT * INTO m FROM public.channel_messages WHERE id=p_id AND channel_id=c.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  IF p_action='read' THEN
   INSERT INTO public.channel_memberships(channel_id,admin_user_id,last_read_at,last_read_message_id) VALUES(c.id,p_actor,m.created_at,m.id)
    ON CONFLICT(channel_id,admin_user_id) DO UPDATE SET last_read_at=EXCLUDED.last_read_at,last_read_message_id=EXCLUDED.last_read_message_id,updated_at=now()
    WHERE (public.channel_memberships.last_read_at,public.channel_memberships.last_read_message_id)<(EXCLUDED.last_read_at,EXCLUDED.last_read_message_id) OR public.channel_memberships.last_read_at IS NULL;
   RETURN jsonb_build_object('read',true);
  END IF;
  IF m.is_deleted OR m.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'CONFLICT';END IF;
  IF p_action='edit' THEN
   IF m.sender_id<>p_actor THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
   UPDATE public.channel_messages SET message=p_document->>'message' WHERE id=m.id;
  ELSIF p_action IN ('delete','pin') THEN
   IF NOT public.can_operate_channel(p_actor,c.id,'moderate') AND (p_action<>'delete' OR m.sender_id<>p_actor) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
   IF p_action='delete' THEN UPDATE public.channel_messages SET is_deleted=true,is_pinned=false WHERE id=m.id;
   ELSE UPDATE public.channel_messages SET is_pinned=(p_document->>'pinned')::boolean WHERE id=m.id;END IF;
  ELSE RAISE EXCEPTION 'INVALID_STATE';END IF;
  UPDATE public.channel_messages SET revision=revision+1,updated_at=now() WHERE id=m.id RETURNING * INTO m;
  result:=jsonb_build_object('id',m.id,'revision',m.revision);
 END IF;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id) VALUES(p_actor,'channels.message_'||p_action,'channel_message',m.id,p_request_id);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.can_operate_channel(uuid,uuid,text),public.list_channels(uuid,integer,text,boolean),
 public.mutate_channel(uuid,uuid,text,uuid,text,integer,jsonb,uuid),public.list_channel_messages(uuid,uuid,timestamptz,uuid,boolean),
 public.mutate_channel_message(uuid,uuid,uuid,uuid,text,integer,jsonb,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.can_operate_channel(uuid,uuid,text),public.list_channels(uuid,integer,text,boolean),
 public.mutate_channel(uuid,uuid,text,uuid,text,integer,jsonb,uuid),public.list_channel_messages(uuid,uuid,timestamptz,uuid,boolean),
 public.mutate_channel_message(uuid,uuid,uuid,uuid,text,integer,jsonb,text,text,uuid) TO service_role;
COMMIT;
