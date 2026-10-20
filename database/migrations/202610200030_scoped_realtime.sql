BEGIN;
CREATE SCHEMA gdg_security;
REVOKE ALL ON SCHEMA gdg_security FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA gdg_security TO service_role;
CREATE ROLE gdg_realtime NOLOGIN NOINHERIT;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticator') THEN GRANT gdg_realtime TO authenticator;END IF;END $$;
CREATE TABLE gdg_security.realtime_grants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),session_id uuid NOT NULL REFERENCES public.admin_sessions(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES public.admin_users(id),kind text NOT NULL CHECK(kind IN ('channel','notifications')),
 target_id uuid NOT NULL,permission_version bigint NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,revoked_at timestamptz,CHECK(expires_at<=created_at+interval '5 minutes')
);
ALTER TABLE gdg_security.realtime_grants ENABLE ROW LEVEL SECURITY;
GRANT ALL ON gdg_security.realtime_grants TO service_role;
REVOKE ALL ON gdg_security.realtime_grants FROM PUBLIC,anon,authenticated,gdg_realtime;
CREATE INDEX realtime_grants_expiry ON gdg_security.realtime_grants(expires_at);
CREATE FUNCTION public.issue_realtime_grant(p_actor uuid,p_session uuid,p_kind text,p_target uuid,p_request_id uuid) RETURNS jsonb
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
  'topic',CASE WHEN g.kind='channel' THEN 'gdg:channel:'||g.target_id ELSE 'gdg:user:'||g.user_id END);
END $$;
CREATE FUNCTION gdg_security.realtime_allowed(p_topic text) RETURNS boolean
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE claims jsonb;g gdg_security.realtime_grants;u public.admin_users;s public.admin_sessions;BEGIN
 claims:=nullif(current_setting('request.jwt.claims',true),'')::jsonb;
 IF claims IS NULL OR (claims->>'role') IS DISTINCT FROM 'gdg_realtime' OR claims->>'jti' IS NULL OR claims->>'sub' IS NULL
  OR claims->>'session_id' IS NULL OR claims->>'exp' IS NULL OR claims->>'iat' IS NULL
  OR (claims->>'exp')::bigint<=extract(epoch FROM now()) OR (claims->>'exp')::bigint>(claims->>'iat')::bigint+300 THEN RETURN false;END IF;
 SELECT * INTO g FROM gdg_security.realtime_grants WHERE id=(claims->>'jti')::uuid AND user_id=(claims->>'sub')::uuid
  AND session_id=(claims->>'session_id')::uuid AND expires_at>now() AND revoked_at IS NULL;
 IF NOT FOUND OR (claims->>'exp')::bigint>extract(epoch FROM g.expires_at) OR
  p_topic IS DISTINCT FROM (CASE WHEN g.kind='channel' THEN 'gdg:channel:'||g.target_id ELSE 'gdg:user:'||g.user_id END) THEN RETURN false;END IF;
 SELECT * INTO s FROM public.admin_sessions WHERE id=g.session_id AND admin_user_id=g.user_id AND revoked_at IS NULL
  AND idle_expires_at>now() AND absolute_expires_at>now();
 IF NOT FOUND THEN RETURN false;END IF;
 SELECT * INTO u FROM public.admin_users WHERE id=g.user_id AND is_active AND NOT must_change_password AND deleted_at IS NULL AND permission_version=g.permission_version;
 IF NOT FOUND THEN RETURN false;END IF;
 RETURN (g.kind='notifications' AND g.target_id=u.id) OR (g.kind='channel' AND public.can_operate_channel(u.id,g.target_id,'read'));
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN false;
END $$;
GRANT USAGE ON SCHEMA gdg_security TO gdg_realtime;
REVOKE ALL ON FUNCTION gdg_security.realtime_allowed(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION gdg_security.realtime_allowed(text) TO gdg_realtime,service_role;
REVOKE ALL ON FUNCTION public.issue_realtime_grant(uuid,uuid,text,uuid,uuid) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.issue_realtime_grant(uuid,uuid,text,uuid,uuid) TO service_role;
-- These are the only database privileges the socket role receives. It cannot
-- read or write application tables or invoke application RPCs over PostgREST.
DO $$ BEGIN
 IF to_regclass('realtime.messages') IS NOT NULL THEN
  GRANT USAGE ON SCHEMA realtime TO gdg_realtime;
  GRANT SELECT ON realtime.messages TO gdg_realtime;
  CREATE POLICY gdg_scoped_broadcast_receive ON realtime.messages FOR SELECT TO gdg_realtime
   USING(extension='broadcast' AND (SELECT gdg_security.realtime_allowed((SELECT realtime.topic()))));
 END IF;
END $$;
CREATE FUNCTION gdg_security.broadcast_invalidation() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE record_id uuid;target uuid;topic text;payload jsonb;BEGIN
 IF to_regprocedure('realtime.send(jsonb,text,text,boolean)') IS NULL THEN RETURN NULL;END IF;
 IF TG_TABLE_NAME='notifications' THEN
  target:=CASE WHEN TG_OP='DELETE' THEN OLD.user_id ELSE NEW.user_id END;
  topic:='gdg:user:'||target;payload:=jsonb_build_object('kind','notifications');
 ELSIF TG_TABLE_NAME='channel_memberships' THEN
  target:=CASE WHEN TG_OP='DELETE' THEN OLD.admin_user_id ELSE NEW.admin_user_id END;
  PERFORM realtime.send(jsonb_build_object('kind','channel-directory'),'changed','gdg:user:'||target,true);
  record_id:=CASE WHEN TG_OP='DELETE' THEN OLD.channel_id ELSE NEW.channel_id END;
  topic:='gdg:channel:'||record_id;payload:=jsonb_build_object('kind','channel','id',record_id);
 ELSE
  IF TG_TABLE_NAME='channels' THEN record_id:=CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END;
  ELSE record_id:=CASE WHEN TG_OP='DELETE' THEN OLD.channel_id ELSE NEW.channel_id END;END IF;
  topic:='gdg:channel:'||record_id;payload:=jsonb_build_object('kind','channel','id',record_id);
 END IF;
 PERFORM realtime.send(payload,'changed',topic,true);RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION gdg_security.broadcast_invalidation() FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION gdg_security.broadcast_invalidation() TO service_role;
CREATE TRIGGER channel_live_changes AFTER INSERT OR UPDATE OR DELETE ON public.channels FOR EACH ROW EXECUTE FUNCTION gdg_security.broadcast_invalidation();
CREATE TRIGGER channel_message_live_changes AFTER INSERT OR UPDATE OR DELETE ON public.channel_messages FOR EACH ROW EXECUTE FUNCTION gdg_security.broadcast_invalidation();
CREATE TRIGGER channel_membership_live_changes AFTER INSERT OR UPDATE OR DELETE ON public.channel_memberships FOR EACH ROW EXECUTE FUNCTION gdg_security.broadcast_invalidation();
CREATE TRIGGER notification_live_changes AFTER INSERT OR UPDATE OR DELETE ON public.notifications FOR EACH ROW EXECUTE FUNCTION gdg_security.broadcast_invalidation();
COMMIT;
