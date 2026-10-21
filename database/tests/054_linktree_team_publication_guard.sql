BEGIN;
DO $$ DECLARE a uuid;t uuid;p uuid;BEGIN
 INSERT INTO public.admin_users(email,password_hash,role,is_active) VALUES('team-links-guard@example.test','fixture','admin',true) RETURNING id INTO a;
 INSERT INTO public.admin_teams(name,slug,created_by) VALUES('Fictional public scope','fictional-public-scope',a) RETURNING id INTO t;
 INSERT INTO public.linktree_profiles(username,display_name,team_id,created_by,is_active) VALUES('fictional-public-scope','Fictional public scope',t,a,true) RETURNING id INTO p;
 IF public.public_linktree_profile('fictional-public-scope') IS NULL THEN RAISE EXCEPTION 'Active scoped profile missing';END IF;
 UPDATE public.admin_teams SET is_active=false WHERE id=t;
 IF(SELECT is_active FROM public.linktree_profiles WHERE id=p) OR(SELECT revision FROM public.linktree_profiles WHERE id=p)<>2 OR public.public_linktree_profile('fictional-public-scope') IS NOT NULL THEN RAISE EXCEPTION 'Team archival did not unpublish or fence the profile revision';END IF;
 UPDATE public.admin_teams SET is_active=true WHERE id=t;
 IF public.public_linktree_profile('fictional-public-scope') IS NOT NULL THEN RAISE EXCEPTION 'Restoring a team silently republished its Linktree';END IF;
END $$;
ROLLBACK;
