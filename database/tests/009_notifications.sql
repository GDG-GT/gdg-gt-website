BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES
 ('90000000-0000-4000-8000-000000000001','notification-a@example.test','test-only','team_member',true),
 ('90000000-0000-4000-8000-000000000002','notification-b@example.test','test-only','team_member',true);
INSERT INTO public.notifications(id,user_id,type,title,message) VALUES
 ('90000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-000000000001','system','Own notification','Test only'),
 ('90000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-000000000002','system','Other notification','Test only');
DO $$ BEGIN
 BEGIN
  PERFORM public.mutate_own_notification('90000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000004','read',gen_random_uuid());
  RAISE EXCEPTION 'Cross-account notification exposed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 PERFORM public.mutate_own_notification('90000000-0000-4000-8000-000000000001',NULL,'read_all',gen_random_uuid());
 IF NOT (SELECT is_read FROM public.notifications WHERE id='90000000-0000-4000-8000-000000000003')
  OR (SELECT is_read FROM public.notifications WHERE id='90000000-0000-4000-8000-000000000004') THEN RAISE EXCEPTION 'Notification scoping failed';END IF;
 PERFORM public.mutate_own_notification('90000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000003','delete',gen_random_uuid());
 IF EXISTS(SELECT 1 FROM public.notifications WHERE id='90000000-0000-4000-8000-000000000003') THEN RAISE EXCEPTION 'Dismissal failed';END IF;
 UPDATE public.admin_users SET is_active=false WHERE id='90000000-0000-4000-8000-000000000001';
 BEGIN
  PERFORM public.mutate_own_notification('90000000-0000-4000-8000-000000000001',NULL,'read_all',gen_random_uuid());
  RAISE EXCEPTION 'Disabled account mutated notifications';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 INSERT INTO public.delivery_jobs(kind,deduplication_key,state,attempt_count,locked_until,lease_token)
 VALUES('system','exhausted-lease-fixture','running',8,now()-interval '1 minute',gen_random_uuid());
 PERFORM public.claim_delivery_jobs(1);
 IF NOT EXISTS(SELECT 1 FROM public.delivery_jobs WHERE deduplication_key='exhausted-lease-fixture' AND state='dead' AND lease_token IS NULL) THEN RAISE EXCEPTION 'Final crashed attempt not recovered';END IF;
END $$;
ROLLBACK;
