BEGIN;
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
  p_topic IS DISTINCT FROM (public.realtime_scope_topic(g.kind,g.target_id)) THEN RETURN false;END IF;
 SELECT * INTO s FROM public.admin_sessions WHERE id=g.session_id AND admin_user_id=g.user_id AND revoked_at IS NULL
  AND idle_expires_at>now() AND absolute_expires_at>now();
 IF NOT FOUND THEN RETURN false;END IF;
 SELECT * INTO u FROM public.admin_users WHERE id=g.user_id AND is_active AND NOT must_change_password AND deleted_at IS NULL AND permission_version=g.permission_version;
 IF NOT FOUND THEN RETURN false;END IF;
 RETURN public.can_operate_realtime_scope(u.id,g.kind,g.target_id);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN false;
END $$;
COMMIT;

