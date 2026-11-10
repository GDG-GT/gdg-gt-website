BEGIN;
DO $$ DECLARE a uuid;s uuid;p uuid;draft uuid;review jsonb;spec jsonb;r jsonb;BEGIN
 INSERT INTO public.admin_users(email,password_hash,role,is_active) VALUES('case-owner@example.test','fictional','super_admin',true) RETURNING id INTO a;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(a,repeat('e',64)) RETURNING id INTO s;
 ALTER TABLE public.team_members DISABLE TRIGGER a_profile_identity_guard;
 INSERT INTO public.team_members(name,role,email,is_active) VALUES('Fictional case owner','President','Case-Owner@Example.Test',true) RETURNING id INTO p;
 INSERT INTO public.team_members(name,role,email,is_active) VALUES('Fictional case owner','Founder','case-owner@example.test',false) RETURNING id INTO draft;
 ALTER TABLE public.team_members ENABLE TRIGGER a_profile_identity_guard;
 review:=public.review_team_profile_duplicates(a,p);
 SELECT jsonb_agg(jsonb_build_object('id',x->'id','revision',x->'revision')) INTO spec FROM jsonb_array_elements(review->'profiles') x;
 r:=public.reconcile_team_profiles(a,s,p,p,spec,repeat('e',64),repeat('f',64),gen_random_uuid());
 IF NOT(SELECT is_active FROM public.team_members WHERE id=p) OR(SELECT email FROM public.team_members WHERE id=p)<>'Case-Owner@Example.Test' THEN RAISE EXCEPTION 'Legacy email normalization demoted the kept published profile';END IF;
 BEGIN UPDATE public.team_members SET deleted_at=NULL WHERE id=draft;RAISE EXCEPTION 'Legacy duplicate restored';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'PROFILE_DUPLICATES' THEN RAISE;END IF;END;
END $$;
ROLLBACK;
