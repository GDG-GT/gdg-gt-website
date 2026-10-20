BEGIN;
CREATE OR REPLACE FUNCTION public.issue_realtime_grant(p_actor uuid,p_session uuid,p_kind text,p_target uuid,p_request_id uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.admin_sessions;u public.admin_users;g gdg_security.realtime_grants;BEGIN
 SELECT * INTO s FROM public.admin_sessions WHERE id=p_session AND admin_user_id=p_actor AND revoked_at IS NULL
  AND idle_expires_at>now() AND absolute_expires_at>now() FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 SELECT * INTO u FROM public.admin_users WHERE id=p_actor AND is_active AND NOT must_change_password AND deleted_at IS NULL;
 IF NOT FOUND OR p_kind NOT IN ('channel','notifications') OR p_kind IS NULL OR p_target IS NULL THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 IF (p_kind='notifications' AND p_target<>u.id) OR (p_kind='channel' AND NOT public.can_operate_channel(u.id,p_target,'read')) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 DELETE FROM gdg_security.realtime_grants WHERE expires_at<now()-interval '1 day';
 INSERT INTO gdg_security.realtime_grants(session_id,user_id,kind,target_id,permission_version,expires_at)
  VALUES(s.id,u.id,p_kind,p_target,u.permission_version,least(date_trunc('second',now())+interval '5 minutes',s.idle_expires_at,s.absolute_expires_at)) RETURNING * INTO g;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata)
  VALUES(u.id,'realtime.token_issued','realtime_scope',g.id,p_request_id,jsonb_build_object('kind',p_kind));
 RETURN jsonb_build_object('id',g.id,'expiresAt',floor(extract(epoch FROM g.expires_at))::bigint,'issuedAt',floor(extract(epoch FROM now()))::bigint,
  'permissionVersion',g.permission_version,'topic',CASE WHEN g.kind='channel' THEN 'gdg:channel:'||g.target_id ELSE 'gdg:user:'||g.user_id END);
END $$;
CREATE OR REPLACE FUNCTION gdg_security.realtime_allowed(p_topic text) RETURNS boolean
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE claims jsonb;g gdg_security.realtime_grants;u public.admin_users;s public.admin_sessions;BEGIN
 claims:=nullif(current_setting('request.jwt.claims',true),'')::jsonb;
 IF claims IS NULL OR (claims->>'role') IS DISTINCT FROM 'gdg_realtime' OR claims->>'jti' IS NULL OR claims->>'sub' IS NULL
  OR claims->>'session_id' IS NULL OR claims->>'exp' IS NULL OR claims->>'iat' IS NULL OR claims->>'permission_version' IS NULL
  OR claims->'topics' IS DISTINCT FROM jsonb_build_array(p_topic)
  OR (claims->>'exp')::bigint<=extract(epoch FROM now()) OR (claims->>'exp')::bigint>(claims->>'iat')::bigint+300 THEN RETURN false;END IF;
 SELECT * INTO g FROM gdg_security.realtime_grants WHERE id=(claims->>'jti')::uuid AND user_id=(claims->>'sub')::uuid
  AND session_id=(claims->>'session_id')::uuid AND expires_at>now() AND revoked_at IS NULL;
 IF NOT FOUND OR (claims->>'permission_version')::bigint<>g.permission_version OR (claims->>'exp')::bigint>extract(epoch FROM g.expires_at) OR
  p_topic IS DISTINCT FROM (CASE WHEN g.kind='channel' THEN 'gdg:channel:'||g.target_id ELSE 'gdg:user:'||g.user_id END) THEN RETURN false;END IF;
 SELECT * INTO s FROM public.admin_sessions WHERE id=g.session_id AND admin_user_id=g.user_id AND revoked_at IS NULL
  AND idle_expires_at>now() AND absolute_expires_at>now();
 IF NOT FOUND THEN RETURN false;END IF;
 SELECT * INTO u FROM public.admin_users WHERE id=g.user_id AND is_active AND NOT must_change_password AND deleted_at IS NULL AND permission_version=g.permission_version;
 IF NOT FOUND THEN RETURN false;END IF;
 RETURN (g.kind='notifications' AND g.target_id=u.id) OR (g.kind='channel' AND public.can_operate_channel(u.id,g.target_id,'read'));
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN false;
END $$;
-- Best-effort disconnect instruction for already-connected clients. Realtime
-- may cache policies, so expiry remains the hard maximum even for hostile clients.
CREATE FUNCTION gdg_security.broadcast_authorization_change() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target uuid; team uuid;BEGIN
 IF to_regprocedure('realtime.send(jsonb,text,text,boolean)') IS NULL THEN RETURN NULL;END IF;
 IF TG_TABLE_NAME='admin_users' THEN target:=NEW.id;
 ELSIF TG_TABLE_NAME='admin_sessions' THEN target:=NEW.admin_user_id;
 ELSIF TG_TABLE_NAME IN ('channel_memberships','team_memberships') THEN target:=CASE WHEN TG_OP='DELETE' THEN OLD.admin_user_id ELSE NEW.admin_user_id END;
 ELSIF TG_TABLE_NAME='admin_teams' THEN
  team:=NEW.id;
  FOR target IN SELECT admin_user_id FROM public.team_memberships WHERE team_id=team AND is_active LOOP
   PERFORM realtime.send(jsonb_build_object('kind','authorization'),'changed','gdg:user:'||target,true);
  END LOOP;
  RETURN NULL;
 END IF;
 IF target IS NOT NULL THEN PERFORM realtime.send(jsonb_build_object('kind','authorization'),'changed','gdg:user:'||target,true);END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION gdg_security.broadcast_authorization_change() FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION gdg_security.broadcast_authorization_change() TO service_role;
CREATE TRIGGER realtime_account_authorization AFTER UPDATE OF role,is_active,deleted_at,permission_version,must_change_password ON public.admin_users
 FOR EACH ROW WHEN (OLD.role IS DISTINCT FROM NEW.role OR OLD.is_active IS DISTINCT FROM NEW.is_active OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at
 OR OLD.permission_version IS DISTINCT FROM NEW.permission_version OR OLD.must_change_password IS DISTINCT FROM NEW.must_change_password)
 EXECUTE FUNCTION gdg_security.broadcast_authorization_change();
CREATE TRIGGER realtime_session_revocation AFTER UPDATE OF revoked_at ON public.admin_sessions FOR EACH ROW
 WHEN (OLD.revoked_at IS DISTINCT FROM NEW.revoked_at) EXECUTE FUNCTION gdg_security.broadcast_authorization_change();
CREATE TRIGGER realtime_room_authorization AFTER INSERT OR UPDATE OR DELETE ON public.channel_memberships FOR EACH ROW EXECUTE FUNCTION gdg_security.broadcast_authorization_change();
CREATE TRIGGER realtime_team_authorization AFTER INSERT OR UPDATE OR DELETE ON public.team_memberships FOR EACH ROW EXECUTE FUNCTION gdg_security.broadcast_authorization_change();
CREATE TRIGGER realtime_team_state AFTER UPDATE OF is_active ON public.admin_teams FOR EACH ROW WHEN (OLD.is_active IS DISTINCT FROM NEW.is_active) EXECUTE FUNCTION gdg_security.broadcast_authorization_change();
COMMIT;
