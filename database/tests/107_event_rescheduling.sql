BEGIN;
INSERT INTO public.events(id,title,description,slug,start_at,location,publication_status,previous_start_at) VALUES
 ('f1070000-0000-4000-8000-000000000001','Fictional reschedule','Local lifecycle fixture','reschedule-fixture','2099-01-01T18:00:00Z','Local fixture','draft','2000-01-01');
DO $$ BEGIN
 IF (SELECT previous_start_at IS NOT NULL FROM public.events WHERE slug='reschedule-fixture') THEN RAISE EXCEPTION 'Create accepted forged history';END IF;
END $$;
UPDATE public.events SET start_at='2099-01-02T18:00:00Z' WHERE slug='reschedule-fixture';
DO $$ BEGIN
 IF (SELECT previous_start_at IS NOT NULL FROM public.events WHERE slug='reschedule-fixture') THEN RAISE EXCEPTION 'Draft edit became reschedule';END IF;
END $$;
UPDATE public.events SET publication_status='published',published_at=now() WHERE slug='reschedule-fixture';
UPDATE public.events SET start_at='2099-01-03T18:00:00Z' WHERE slug='reschedule-fixture';
DO $$ BEGIN
 IF (SELECT previous_start_at FROM public.public_event_inventory WHERE slug='reschedule-fixture') IS DISTINCT FROM '2099-01-02T18:00:00Z'::timestamptz THEN RAISE EXCEPTION 'Published reschedule missing';END IF;
END $$;
UPDATE public.events SET previous_start_at=NULL,title='Fictional updated title' WHERE slug='reschedule-fixture';
DO $$ BEGIN
 IF (SELECT previous_start_at FROM public.public_event_inventory WHERE slug='reschedule-fixture') IS DISTINCT FROM '2099-01-02T18:00:00Z'::timestamptz THEN RAISE EXCEPTION 'Unrelated edit erased history';END IF;
END $$;
UPDATE public.events SET publication_status='draft' WHERE slug='reschedule-fixture';
UPDATE public.events SET start_at='2099-01-04T18:00:00Z' WHERE slug='reschedule-fixture';
DO $$ BEGIN
 IF (SELECT previous_start_at FROM public.events WHERE slug='reschedule-fixture') IS DISTINCT FROM '2099-01-03T18:00:00Z'::timestamptz THEN RAISE EXCEPTION 'Previously published history lost';END IF;
 IF EXISTS(SELECT 1 FROM public.public_event_inventory WHERE slug='reschedule-fixture') THEN RAISE EXCEPTION 'Private draft history escaped';END IF;
END $$;
UPDATE public.events SET publication_status='cancelled',registration_enabled=false WHERE slug='reschedule-fixture';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.public_event_inventory WHERE slug='reschedule-fixture') THEN RAISE EXCEPTION 'Cancelled event escaped';END IF;
 IF has_function_privilege('anon','gdg_security.track_event_reschedule()','EXECUTE')
 OR has_function_privilege('authenticated','gdg_security.track_event_reschedule()','EXECUTE') THEN RAISE EXCEPTION 'History trigger exposed';END IF;
 IF has_table_privilege('anon','public.public_event_inventory','SELECT')
 OR has_table_privilege('authenticated','public.public_event_inventory','SELECT') THEN RAISE EXCEPTION 'View replacement expanded grants';END IF;
END $$;
-- A copied record has a fresh history even if a caller copies every column.
INSERT INTO public.events(id,title,description,slug,start_at,location,publication_status,previous_start_at)
 SELECT 'f1070000-0000-4000-8000-000000000002',title,description,'reschedule-copy',start_at,location,'draft',previous_start_at FROM public.events WHERE slug='reschedule-fixture';
DO $$ BEGIN
 IF (SELECT previous_start_at IS NOT NULL FROM public.events WHERE slug='reschedule-copy') THEN RAISE EXCEPTION 'Duplicate inherited schedule history';END IF;
END $$;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES
 ('f1070000-0000-4000-8000-000000000003','reschedule-admin@example.test','test-only','admin',true);
DO $$ DECLARE actor uuid:='f1070000-0000-4000-8000-000000000003';v jsonb;event_id uuid;BEGIN
 v:=public.mutate_event(actor,NULL,'create',NULL,'{"title":"Fictional mutation","description":"Local mutation fixture","slug":"reschedule-rpc","start_at":"2099-02-01T18:00:00Z","location":"Local fixture"}',gen_random_uuid());
 event_id:=(v->>'id')::uuid;
 v:=public.mutate_event(actor,event_id,'publish',1,'{}',gen_random_uuid());
 v:=public.mutate_event(actor,event_id,'update',2,'{"start_at":"2099-02-02T18:00:00Z"}',gen_random_uuid());
 IF (v->>'previous_start_at')::timestamptz IS DISTINCT FROM '2099-02-01T18:00:00Z'::timestamptz THEN RAISE EXCEPTION 'Mutation returned pre-trigger history';END IF;
 v:=public.mutate_event(actor,event_id,'duplicate',3,'{}',gen_random_uuid());
 IF v->>'previous_start_at' IS NOT NULL THEN RAISE EXCEPTION 'Duplicate returned copied schedule history';END IF;
END $$;
ROLLBACK;
