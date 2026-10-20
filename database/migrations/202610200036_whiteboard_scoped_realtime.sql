BEGIN;
ALTER TABLE gdg_security.realtime_grants DROP CONSTRAINT realtime_grants_kind_check;
ALTER TABLE gdg_security.realtime_grants ADD CONSTRAINT realtime_grants_kind_check CHECK(kind IN ('channel','notifications','whiteboard'));
CREATE FUNCTION public.can_operate_realtime_scope(p_actor uuid,p_kind text,p_target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT CASE p_kind WHEN 'notifications' THEN p_actor=p_target WHEN 'channel' THEN public.can_operate_channel(p_actor,p_target,'read')
  WHEN 'whiteboard' THEN public.can_operate_whiteboard(p_actor,p_target,'read') ELSE false END;
$$;
CREATE FUNCTION public.realtime_scope_topic(p_kind text,p_target uuid) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN p_kind IN ('channel','whiteboard') THEN 'gdg:'||p_kind||':'||p_target WHEN p_kind='notifications' THEN 'gdg:user:'||p_target ELSE NULL END;
$$;
REVOKE ALL ON FUNCTION public.can_operate_realtime_scope(uuid,text,uuid),public.realtime_scope_topic(text,uuid) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.can_operate_realtime_scope(uuid,text,uuid),public.realtime_scope_topic(text,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.issue_realtime_grant(p_actor uuid,p_session uuid,p_kind text,p_target uuid,p_request_id uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.admin_sessions;u public.admin_users;g gdg_security.realtime_grants;BEGIN
 SELECT * INTO s FROM public.admin_sessions WHERE id=p_session AND admin_user_id=p_actor AND revoked_at IS NULL
  AND idle_expires_at>now() AND absolute_expires_at>now() FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 SELECT * INTO u FROM public.admin_users WHERE id=p_actor AND is_active AND NOT must_change_password AND deleted_at IS NULL;
 IF NOT FOUND OR p_kind NOT IN ('channel','notifications','whiteboard') OR p_kind IS NULL OR p_target IS NULL THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 IF NOT public.can_operate_realtime_scope(u.id,p_kind,p_target) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 DELETE FROM gdg_security.realtime_grants WHERE expires_at<now()-interval '1 day';
 INSERT INTO gdg_security.realtime_grants(session_id,user_id,kind,target_id,permission_version,expires_at)
  VALUES(s.id,u.id,p_kind,p_target,u.permission_version,least(date_trunc('second',now())+interval '5 minutes',s.idle_expires_at,s.absolute_expires_at)) RETURNING * INTO g;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata)
  VALUES(u.id,'realtime.token_issued','realtime_scope',g.id,p_request_id,jsonb_build_object('kind',p_kind));
 RETURN jsonb_build_object('id',g.id,'expiresAt',floor(extract(epoch FROM g.expires_at))::bigint,'issuedAt',floor(extract(epoch FROM now()))::bigint,
  'permissionVersion',g.permission_version,'topic',public.realtime_scope_topic(g.kind,g.target_id));
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
 RETURN public.can_operate_realtime_scope(u.id,g.kind,g.target_id);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN false;
END $$;
CREATE FUNCTION gdg_security.broadcast_whiteboard_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b uuid;target uuid;BEGIN
 IF to_regprocedure('realtime.send(jsonb,text,text,boolean)') IS NULL THEN RETURN NULL;END IF;
 IF TG_TABLE_NAME='whiteboard_collaborators' THEN
  b:=CASE WHEN TG_OP='DELETE' THEN OLD.board_id ELSE NEW.board_id END;
  target:=CASE WHEN TG_OP='DELETE' THEN OLD.user_id ELSE NEW.user_id END;
  PERFORM realtime.send(jsonb_build_object('kind','authorization'),'changed','gdg:user:'||target,true);
 ELSE
  b:=CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END;
  target:=CASE WHEN TG_OP='DELETE' THEN OLD.created_by ELSE NEW.created_by END;
 END IF;
 IF target IS NOT NULL THEN PERFORM realtime.send(jsonb_build_object('kind','whiteboard-directory'),'changed','gdg:user:'||target,true);END IF;
 PERFORM realtime.send(jsonb_build_object('kind','whiteboard','id',b),'changed','gdg:whiteboard:'||b,true);
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION gdg_security.broadcast_whiteboard_change() FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION gdg_security.broadcast_whiteboard_change() TO service_role;
CREATE TRIGGER whiteboard_live_changes AFTER INSERT OR UPDATE OR DELETE ON public.whiteboards FOR EACH ROW EXECUTE FUNCTION gdg_security.broadcast_whiteboard_change();
CREATE TRIGGER whiteboard_collaborator_live_changes AFTER INSERT OR UPDATE OR DELETE ON public.whiteboard_collaborators FOR EACH ROW EXECUTE FUNCTION gdg_security.broadcast_whiteboard_change();
COMMIT;

