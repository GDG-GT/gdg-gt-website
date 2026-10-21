BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES('fa000000-0000-4000-8000-000000000001','member-review-session@example.test','fixture','admin',true);
DO $$ DECLARE s uuid;a uuid;b uuid;r jsonb;BEGIN
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES('fa000000-0000-4000-8000-000000000001',repeat('60',32)) RETURNING id INTO s;
 INSERT INTO public.members(name,email) VALUES('Fictional review source','fictional-review-source@example.test') RETURNING id INTO a;
 INSERT INTO public.members(name,email) VALUES('Fictional review target','fictional-review-target@example.test') RETURNING id INTO b;
 r:=public.preview_member_merge('fa000000-0000-4000-8000-000000000001',s,a,b,1,1,repeat('61',32),gen_random_uuid());
 DELETE FROM public.admin_sessions WHERE id=s;
 IF EXISTS(SELECT 1 FROM gdg_security.member_merge_reviews WHERE id=(r->>'reviewId')::uuid)
  OR(SELECT count(*) FROM public.members WHERE id IN(a,b))<>2
  OR NOT EXISTS(SELECT 1 FROM public.admin_actions WHERE target_type='member' AND target_id=a AND action='members.merge_reviewed') THEN RAISE EXCEPTION 'Session cleanup deleted business/audit data or retained a proof';END IF;
END $$;
ROLLBACK;
