-- Only the disposable canonical database suite runs this destructive fixture.
BEGIN;
TRUNCATE public.admin_users CASCADE;
DO $$ DECLARE owner_id uuid;BEGIN
 owner_id:=public.bootstrap_initial_owner('fictional-owner@example.test','Fictional owner','scrypt$fictional-password-hash','scrypt$fictional-gate-hash');
 IF NOT EXISTS(SELECT 1 FROM public.admin_users WHERE id=owner_id AND role='super_admin' AND is_active AND NOT must_change_password) OR NOT EXISTS(SELECT 1 FROM public.admin_actions WHERE actor_id=owner_id AND action='security.initial_owner_created') THEN RAISE EXCEPTION 'Initial owner missing or unsafe';END IF;
 BEGIN PERFORM public.bootstrap_initial_owner('fictional-second@example.test','Fictional second','scrypt$fictional-password-hash','scrypt$fictional-gate-hash');RAISE EXCEPTION 'Existing owner overwritten';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INITIAL_OWNER_EXISTS' THEN RAISE;END IF;END;
 IF(SELECT count(*) FROM public.admin_users)<>1 THEN RAISE EXCEPTION 'Duplicate bootstrap owner';END IF;
 IF has_function_privilege('anon','public.bootstrap_initial_owner(text,text,text,text)','EXECUTE') OR has_function_privilege('authenticated','public.bootstrap_initial_owner(text,text,text,text)','EXECUTE') THEN RAISE EXCEPTION 'Public owner bootstrap';END IF;
END $$;
ROLLBACK;
