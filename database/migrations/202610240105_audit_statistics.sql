BEGIN;
CREATE FUNCTION public.read_audit_statistics(p_actor uuid,p_filter jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE r jsonb;BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.admin_users WHERE id=p_actor AND is_active AND NOT must_change_password
  AND deleted_at IS NULL AND role IN('admin','super_admin') AND(locked_until IS NULL OR locked_until<=now())) THEN
  RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 IF p_filter IS NULL OR jsonb_typeof(p_filter)<>'object' OR length(coalesce(p_filter->>'q',''))>100
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_filter) k WHERE k<>ALL(ARRAY['q','action','actor','from','to','result','at'])) THEN
  RAISE EXCEPTION 'Invalid audit filters' USING ERRCODE='22023';END IF;
 WITH eligible AS(SELECT a.action,a.result,a.created_at FROM public.admin_actions a
  WHERE a.created_at<=coalesce((p_filter->>'at')::timestamptz,now())
  AND(p_filter->>'action' IS NULL OR a.action=p_filter->>'action') AND(p_filter->>'actor' IS NULL OR a.actor_id=(p_filter->>'actor')::uuid)
  AND(p_filter->>'from' IS NULL OR a.created_at>=(p_filter->>'from')::timestamptz) AND(p_filter->>'to' IS NULL OR a.created_at<=(p_filter->>'to')::timestamptz)
  AND(p_filter->>'result' IS NULL OR a.result=p_filter->>'result')
  AND(coalesce(p_filter->>'q','')='' OR strpos(lower(a.action),lower(p_filter->>'q'))>0 OR strpos(lower(coalesce(a.target_type,'')),lower(p_filter->>'q'))>0
   OR a.target_id::text=lower(p_filter->>'q') OR a.request_id::text=lower(p_filter->>'q'))),
 actions AS(SELECT action,count(*) n FROM eligible GROUP BY action ORDER BY n DESC,action LIMIT 10)
 SELECT jsonb_build_object('total',count(*),'success',count(*) FILTER(WHERE result='success'),
  'denied',count(*) FILTER(WHERE result='denied'),'failure',count(*) FILTER(WHERE result='failure'),
  'firstEntry',min(created_at),'lastEntry',max(created_at),
  'actions',coalesce((SELECT jsonb_agg(jsonb_build_object('action',action,'count',n) ORDER BY n DESC,action) FROM actions),'[]'),
  'retention',jsonb_build_object('minimumYears',2,'automaticPurge',false,
   'earliestAvailable',(SELECT min(created_at) FROM public.admin_actions))) INTO r FROM eligible;
 RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.read_audit_statistics(uuid,jsonb) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.read_audit_statistics(uuid,jsonb) TO service_role;
COMMIT;
