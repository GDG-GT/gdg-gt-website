BEGIN;
CREATE FUNCTION public.read_editorial_overview(p_actor uuid,p_session uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE u public.admin_users;r jsonb;BEGIN
 SELECT * INTO u FROM public.admin_users WHERE id=p_actor AND is_active AND NOT must_change_password
  AND deleted_at IS NULL AND (locked_until IS NULL OR locked_until<=now());
 IF NOT FOUND OR u.role NOT IN('admin','super_admin','blog_editor') OR NOT EXISTS(SELECT 1 FROM public.admin_sessions
  WHERE id=p_session AND admin_user_id=u.id AND revoked_at IS NULL AND idle_expires_at>now() AND absolute_expires_at>now()) THEN
  RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 WITH eligible AS(SELECT p.* FROM public.blog_posts p WHERE p.deleted_at IS NULL AND public.can_operate_blog(u.id,'posts',p.id,NULL,'read')),
 states AS(SELECT status,count(*) n FROM eligible GROUP BY status),
 changes AS(SELECT date_trunc('month',v.created_at AT TIME ZONE 'UTC') AS bucket,count(*) n FROM gdg_security.blog_versions v
  JOIN eligible e ON e.id=v.post_id WHERE v.created_at>=(date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')-interval '5 months'
  GROUP BY 1),
 months AS(SELECT generate_series(date_trunc('month',now() AT TIME ZONE 'UTC')-interval '5 months',date_trunc('month',now() AT TIME ZONE 'UTC'),interval '1 month') AS bucket)
 SELECT jsonb_build_object('articles',(SELECT count(*) FROM eligible),
  'states',coalesce((SELECT jsonb_object_agg(status,n) FROM states),'{}'),
  'assignedSubmissions',(SELECT count(*) FROM public.blog_submissions s WHERE s.deleted_at IS NULL AND s.assigned_editor_id=u.id
    AND public.can_operate_blog(u.id,'submissions',s.id,NULL,'read')),
  'revisionMonths',(SELECT jsonb_agg(jsonb_build_object('month',to_char(m.bucket,'YYYY-MM'),'count',coalesce(c.n,0)) ORDER BY m.bucket)
    FROM months m LEFT JOIN changes c ON c.bucket=m.bucket)) INTO r;
 RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.read_editorial_overview(uuid,uuid) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.read_editorial_overview(uuid,uuid) TO service_role;
COMMIT;
