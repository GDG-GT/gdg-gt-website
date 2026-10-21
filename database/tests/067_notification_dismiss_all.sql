BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES
 ('f6700000-0000-4000-8000-000000000001','inbox-owner@example.test','test-only','team_member',true),
 ('f6700000-0000-4000-8000-000000000002','inbox-other@example.test','test-only','team_member',true);
INSERT INTO public.notifications(user_id,type,title,message,is_read) VALUES
 ('f6700000-0000-4000-8000-000000000001','system','Read notification','Fictional',true),
 ('f6700000-0000-4000-8000-000000000001','system','Unread notification','Fictional',false),
 ('f6700000-0000-4000-8000-000000000002','system','Other read notification','Fictional',true);
DO $$ DECLARE actor uuid:='f6700000-0000-4000-8000-000000000001';BEGIN
 PERFORM public.mutate_own_notification(actor,NULL,'dismiss_all_read',gen_random_uuid());
 IF(SELECT count(*) FROM public.notifications WHERE user_id=actor)<>1 OR NOT EXISTS(SELECT 1 FROM public.notifications WHERE title='Other read notification') THEN RAISE EXCEPTION 'Bulk dismissal crossed ownership or discarded unread rows';END IF;
 PERFORM public.mutate_own_notification(actor,NULL,'read_all',gen_random_uuid());
 INSERT INTO public.notifications(user_id,type,title,message,is_read) VALUES(actor,'system','Arrived after mark all read','Fictional',false);
 PERFORM public.mutate_own_notification(actor,NULL,'dismiss_all_read',gen_random_uuid());
 IF(SELECT count(*) FROM public.notifications WHERE user_id=actor)<>1 OR NOT EXISTS(SELECT 1 FROM public.notifications WHERE title='Arrived after mark all read' AND NOT is_read) THEN RAISE EXCEPTION 'Concurrent unread notification dismissed';END IF;
 PERFORM public.mutate_own_notification(actor,NULL,'dismiss_all_read',gen_random_uuid());
 IF NOT EXISTS(SELECT 1 FROM public.admin_actions WHERE actor_id=actor AND action='notifications.dismiss_all_read' AND metadata->>'affected'='0') THEN RAISE EXCEPTION 'Empty retry not safely audited';END IF;
 IF has_function_privilege('anon','public.mutate_own_notification(uuid,uuid,text,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Anonymous mutation granted';END IF;
END $$;
ROLLBACK;
