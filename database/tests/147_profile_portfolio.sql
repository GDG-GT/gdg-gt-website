BEGIN;
DO $$ DECLARE a uuid;p public.team_members;BEGIN
 INSERT INTO public.admin_users(email,password_hash,role,is_active) VALUES('portfolio-owner@example.test','fictional','super_admin',true) RETURNING id INTO a;
 PERFORM public.update_own_profile(a,NULL,'{"name":"Fictional Portfolio Owner","role":"Builder","portfolioUrl":"https://portfolio.example.org/work"}',gen_random_uuid());
 SELECT * INTO p FROM public.team_members WHERE admin_user_id=a;
 IF p.portfolio_url<>'https://portfolio.example.org/work' OR p.is_active THEN RAISE EXCEPTION 'Portfolio not saved privately';END IF;
 PERFORM public.update_own_profile(a,NULL,'{"name":"Fictional Portfolio Owner","role":"Builder","portfolioUrl":""}',gen_random_uuid());
 IF EXISTS(SELECT 1 FROM public.team_members WHERE admin_user_id=a AND portfolio_url IS NOT NULL) THEN RAISE EXCEPTION 'Portfolio could not be cleared';END IF;
 BEGIN UPDATE public.team_members SET portfolio_url='javascript:alert(1)' WHERE id=p.id;RAISE EXCEPTION 'Unsafe portfolio accepted';EXCEPTION WHEN check_violation THEN NULL;END;
END $$;
ROLLBACK;
