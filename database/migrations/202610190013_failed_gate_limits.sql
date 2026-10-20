BEGIN;
CREATE FUNCTION public.check_rate_limit(p_scope text,p_risk_hash text,p_limit integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE v_count bigint;v_expiry timestamptz;
BEGIN
 IF p_limit NOT BETWEEN 1 AND 100000 OR length(p_scope)>100 OR p_risk_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid rate limit' USING ERRCODE='22023';END IF;
 SELECT coalesce(sum(attempts),0),min(expires_at) INTO v_count,v_expiry FROM public.rate_limit_windows
  WHERE scope=p_scope AND risk_key_hash=p_risk_hash AND expires_at>now();
 RETURN jsonb_build_object('allowed',v_count<p_limit,'remaining',greatest(0,p_limit-v_count),
  'retryAfter',greatest(1,coalesce(ceil(extract(epoch FROM v_expiry-now()))::integer,1)));
END $$;
REVOKE ALL ON FUNCTION public.check_rate_limit(text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text,text,integer) TO service_role;
COMMIT;
