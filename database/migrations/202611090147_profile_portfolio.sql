BEGIN;
ALTER TABLE public.team_members ADD COLUMN portfolio_url text CHECK(portfolio_url IS NULL OR(length(portfolio_url)<=2000 AND portfolio_url~'^https://[^[:space:]]+$'));
DO $$ DECLARE source text;updated text;BEGIN
 source:=pg_get_functiondef('public.mutate_content_record(uuid,text,uuid,text,integer,jsonb,uuid)'::regprocedure);
 updated:=replace(source,'''linkedin_url'',''github_url'',''email''','''linkedin_url'',''github_url'',''portfolio_url'',''email''');
 IF updated=source THEN RAISE EXCEPTION 'Portfolio collection allowlist target changed';END IF;EXECUTE updated;
 source:=pg_get_functiondef('public.update_own_profile(uuid,text,jsonb,uuid)'::regprocedure);
 updated:=replace(source,'github_url=p_profile->>''githubUrl''','github_url=p_profile->>''githubUrl'',portfolio_url=nullif(p_profile->>''portfolioUrl'','''')');
 IF updated=source THEN RAISE EXCEPTION 'Portfolio own-profile target changed';END IF;EXECUTE updated;
END $$;
COMMIT;
