BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role) VALUES
 ('d4000000-0000-4000-8000-000000000001','revision-fixture@example.test','fixture-hash','team_member');
DO $$ DECLARE n integer;BEGIN
 UPDATE public.admin_users SET display_name='Own profile changed' WHERE id='d4000000-0000-4000-8000-000000000001';
 SELECT revision INTO n FROM public.admin_users WHERE id='d4000000-0000-4000-8000-000000000001';
 IF n<>2 THEN RAISE EXCEPTION 'Own-profile change did not invalidate stale account edit';END IF;
 UPDATE public.admin_users SET last_login_at=now() WHERE id='d4000000-0000-4000-8000-000000000001';
 IF (SELECT revision FROM public.admin_users WHERE id='d4000000-0000-4000-8000-000000000001')<>n THEN RAISE EXCEPTION 'Login metadata invalidates account edits';END IF;
 UPDATE public.admin_users SET role='blog_editor',revision=revision+1 WHERE id='d4000000-0000-4000-8000-000000000001';
 IF (SELECT revision FROM public.admin_users WHERE id='d4000000-0000-4000-8000-000000000001')<>n+1 THEN RAISE EXCEPTION 'Account revision incremented twice';END IF;
END $$;
ROLLBACK;
