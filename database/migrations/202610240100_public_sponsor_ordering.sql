BEGIN;
-- Apply the approved tier order before pagination, not just within each page.
CREATE FUNCTION public.read_public_sponsor_library(p_page integer,p_size integer,p_query text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;BEGIN
 IF p_page IS NULL OR p_size IS NULL OR p_page NOT BETWEEN 1 AND 10000 OR p_size NOT BETWEEN 1 AND 100
 OR length(coalesce(p_query,''))>100 THEN RAISE EXCEPTION 'Invalid public list bounds' USING ERRCODE='22023';END IF;
 WITH visible AS (
  SELECT s.id,s.name,s.logo_url,s.website_url,s.tier,s.order_index,
   coalesce(t.tier_name,initcap(s.tier)) AS tier_label,
   coalesce(t.order_index,2147483600+CASE s.tier WHEN 'platinum' THEN 0 WHEN 'gold' THEN 1 WHEN 'silver' THEN 2 ELSE 3 END) AS tier_order
  FROM public.sponsors s LEFT JOIN public.sponsorship_tiers t
   ON t.tier_level=s.tier AND t.is_active AND t.deleted_at IS NULL
  WHERE s.is_active AND s.deleted_at IS NULL
   AND (p_query IS NULL OR strpos(lower(s.name),lower(btrim(p_query)))>0)
 ), selected AS (
  SELECT * FROM visible ORDER BY tier_order,tier,order_index,id LIMIT p_size OFFSET ((p_page-1)*p_size)
 ) SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(s)-'tier_order' ORDER BY tier_order,tier,order_index,id) FROM selected s),'[]'::jsonb),
  'total',(SELECT count(*) FROM visible),'page',p_page,'pageSize',p_size) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.read_public_sponsor_library(integer,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_public_sponsor_library(integer,integer,text) TO service_role;
CREATE INDEX sponsors_public_tier_order ON public.sponsors(tier,order_index,id) WHERE is_active AND deleted_at IS NULL;
COMMIT;
