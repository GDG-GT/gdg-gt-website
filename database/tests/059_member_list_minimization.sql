BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES('f9000000-0000-4000-8000-000000000001','member-minimization@example.test','fixture','admin',true);
DO $$ DECLARE m uuid;r jsonb;BEGIN
 INSERT INTO public.members(name,email,phone,year,major,interests) VALUES('Fictional minimization person','fictional-minimization@example.test','Private minimization phone','Senior','Private minimization major',ARRAY['Private minimization interest']) RETURNING id INTO m;
 r:=public.list_community_members('f9000000-0000-4000-8000-000000000001',1,'Fictional minimization','current',NULL,NULL,NULL,NULL);
 IF r->'items'->0 ?| ARRAY['phone','year','major','interests'] OR r::text LIKE '%Private minimization%' THEN RAISE EXCEPTION 'List includes private detail-only fields';END IF;
 IF public.community_member_projection('f9000000-0000-4000-8000-000000000001',m)->>'phone'<>'Private minimization phone' THEN RAISE EXCEPTION 'Authorized detail projection lost private fields';END IF;
END $$;
ROLLBACK;
