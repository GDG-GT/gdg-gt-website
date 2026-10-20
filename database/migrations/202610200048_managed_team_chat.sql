BEGIN;
ALTER TABLE public.channels ADD COLUMN is_team_chat boolean NOT NULL DEFAULT false,
 ADD CONSTRAINT managed_team_chat_scope CHECK(NOT is_team_chat OR(team_id IS NOT NULL AND visibility='team'));
CREATE UNIQUE INDEX one_managed_chat_per_team ON public.channels(team_id) WHERE is_team_chat;
CREATE OR REPLACE FUNCTION public.can_operate_channel(p_actor uuid,p_channel uuid,p_action text) RETURNS boolean
 LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE u public.admin_users;c public.channels;m public.channel_memberships;team_active boolean;BEGIN
 SELECT * INTO u FROM public.admin_users WHERE id=p_actor AND is_active AND NOT must_change_password AND deleted_at IS NULL;
 IF NOT FOUND OR p_action IS NULL OR p_action NOT IN('read','send','moderate','manage') THEN RETURN false;END IF;
 SELECT * INTO c FROM public.channels WHERE id=p_channel;IF NOT FOUND THEN RETURN false;END IF;
 team_active:=c.team_id IS NULL OR EXISTS(SELECT 1 FROM public.admin_teams WHERE id=c.team_id AND is_active AND deleted_at IS NULL);
 IF u.role IN('super_admin','admin') THEN RETURN p_action='read' OR(NOT c.is_archived AND team_active);END IF;
 IF c.team_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.team_memberships x JOIN public.admin_teams t ON t.id=x.team_id AND t.is_active AND t.deleted_at IS NULL
  WHERE x.team_id=c.team_id AND x.admin_user_id=u.id AND x.is_active) THEN RETURN false;END IF;
 IF c.is_team_chat THEN
  IF NOT public.can_operate_team(u.id,c.team_id,'read') THEN RETURN false;END IF;
  IF p_action='read' THEN RETURN true;END IF;
  RETURN NOT c.is_archived AND team_active AND(p_action='send' OR public.can_operate_team(u.id,c.team_id,'manage'));
 END IF;
 SELECT * INTO m FROM public.channel_memberships WHERE channel_id=c.id AND admin_user_id=u.id AND is_active;
 IF u.role='blog_editor' AND m.admin_user_id IS NULL THEN RETURN false;END IF;
 IF c.visibility='private' AND m.admin_user_id IS NULL THEN RETURN false;END IF;
 IF c.visibility='internal' AND u.role NOT IN('team_member','blog_editor') THEN RETURN false;END IF;
 IF c.visibility='team' AND c.team_id IS NULL THEN RETURN false;END IF;
 IF p_action='read' THEN RETURN true;END IF;
 IF c.is_archived OR NOT team_active THEN RETURN false;END IF;
 IF p_action='send' THEN RETURN true;END IF;
 RETURN coalesce((m.is_active AND m.role=ANY(CASE WHEN p_action='manage' THEN ARRAY['owner'] ELSE ARRAY['owner','moderator'] END)),false)
  OR(c.team_id IS NOT NULL AND public.can_operate_team(u.id,c.team_id,'manage'));
END $$;
CREATE FUNCTION public.team_chat_workspace(p_actor uuid,p_team uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE t public.admin_teams;c public.channels;BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.admin_users WHERE id=p_actor AND is_active AND NOT must_change_password AND deleted_at IS NULL) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF NOT public.can_operate_team(p_actor,p_team,'read') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT * INTO t FROM public.admin_teams WHERE id=p_team;
 SELECT * INTO c FROM public.channels WHERE team_id=t.id AND is_team_chat;
 RETURN jsonb_build_object('teamId',t.id,'teamName',t.name,'teamActive',t.is_active AND t.deleted_at IS NULL,
  'canSetUp',public.can_operate_team(p_actor,t.id,'manage') AND t.is_active AND t.deleted_at IS NULL,
  'channel',CASE WHEN c.id IS NOT NULL AND public.can_operate_channel(p_actor,c.id,'read') THEN jsonb_build_object('id',c.id,'name',c.name,'archived',c.is_archived,
   'canSend',public.can_operate_channel(p_actor,c.id,'send'),'canManage',public.can_operate_channel(p_actor,c.id,'manage')) ELSE NULL END);
END $$;
CREATE FUNCTION public.ensure_managed_team_chat(p_actor uuid,p_session uuid,p_verified_hash text,p_team uuid,p_confirmation text,p_request_id uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE a public.admin_users;t public.admin_teams;c public.channels;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('team-administration',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('channel-administration',0));
 SELECT * INTO a FROM public.admin_users WHERE id=p_actor AND is_active AND NOT must_change_password AND deleted_at IS NULL;
 IF NOT FOUND OR a.password_hash IS DISTINCT FROM p_verified_hash OR p_verified_hash IS NULL OR a.locked_until>now() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM public.admin_sessions WHERE id=p_session AND admin_user_id=p_actor AND revoked_at IS NULL AND idle_expires_at>now() AND absolute_expires_at>now();
 IF NOT FOUND THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 SELECT * INTO t FROM public.admin_teams WHERE id=p_team AND is_active AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND OR NOT public.can_operate_team(p_actor,t.id,'manage') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF t.name IS DISTINCT FROM p_confirmation THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 SELECT * INTO c FROM public.channels WHERE team_id=t.id AND is_team_chat;
 IF FOUND THEN RETURN public.team_chat_workspace(p_actor,t.id);END IF;
 INSERT INTO public.channels(name,description,created_by,visibility,team_id,is_team_chat)
  VALUES(left(t.name,80)||' · Team chat','Conversation for current team members. Team leads and co-leads moderate this room.',p_actor,'team',t.id,true) RETURNING * INTO c;
 INSERT INTO public.channel_memberships(channel_id,admin_user_id,role) VALUES(c.id,p_actor,'member');
 INSERT INTO public.team_activity_log(team_id,actor_id,action,details) VALUES(t.id,p_actor,'chat_created',jsonb_build_object('channelId',c.id));
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata) VALUES(p_actor,'teams.chat_created','channel',c.id,p_request_id,jsonb_build_object('teamId',t.id));
 RETURN public.team_chat_workspace(p_actor,t.id);
END $$;
-- Retain ordinary room behavior, but team chat's audience/moderation is derived
-- from current team membership, never editable secondary room roles.
ALTER FUNCTION public.mutate_channel(uuid,uuid,text,uuid,text,integer,jsonb,uuid) RENAME TO mutate_channel_standard;
CREATE FUNCTION public.mutate_channel(p_actor uuid,p_session uuid,p_verified_hash text,p_id uuid,p_action text,p_revision integer,p_document jsonb,p_request_id uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE a public.admin_users;c public.channels;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('channel-administration',0));
 IF p_id IS NOT NULL THEN SELECT * INTO c FROM public.channels WHERE id=p_id FOR UPDATE;END IF;
 IF c.team_id IS NOT NULL AND p_action='restore' AND NOT EXISTS(SELECT 1 FROM public.admin_teams WHERE id=c.team_id AND is_active AND deleted_at IS NULL) THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
 IF c.is_team_chat AND p_action IN('member_add','member_role','member_remove') THEN RAISE EXCEPTION 'TEAM_MANAGED_CHAT';END IF;
 IF c.is_team_chat AND p_action='restore' THEN
  SELECT * INTO a FROM public.admin_users WHERE id=p_actor AND is_active AND NOT must_change_password AND deleted_at IS NULL;
  PERFORM 1 FROM public.admin_sessions WHERE id=p_session AND admin_user_id=p_actor AND revoked_at IS NULL AND idle_expires_at>now() AND absolute_expires_at>now();
  IF a.id IS NULL OR NOT FOUND OR a.password_hash IS DISTINCT FROM p_verified_hash OR p_verified_hash IS NULL OR a.locked_until>now()
   OR NOT public.can_operate_team(a.id,c.team_id,'manage') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
  IF NOT c.is_archived OR NOT EXISTS(SELECT 1 FROM public.admin_teams WHERE id=c.team_id AND is_active AND deleted_at IS NULL) THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  IF c.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'CONFLICT';END IF;
  UPDATE public.channels SET is_archived=false,revision=revision+1,updated_at=clock_timestamp() WHERE id=c.id RETURNING * INTO c;
  INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id) VALUES(p_actor,'channels.restore','channel',c.id,p_request_id);
  RETURN to_jsonb(c);
 END IF;
 RETURN public.mutate_channel_standard(p_actor,p_session,p_verified_hash,p_id,p_action,p_revision,p_document,p_request_id);
END $$;
REVOKE ALL ON FUNCTION public.team_chat_workspace(uuid,uuid),public.ensure_managed_team_chat(uuid,uuid,text,uuid,text,uuid),
 public.mutate_channel(uuid,uuid,text,uuid,text,integer,jsonb,uuid) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.team_chat_workspace(uuid,uuid),public.ensure_managed_team_chat(uuid,uuid,text,uuid,text,uuid),
 public.mutate_channel(uuid,uuid,text,uuid,text,integer,jsonb,uuid) TO service_role;
COMMIT;
