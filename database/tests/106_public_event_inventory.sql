BEGIN;
INSERT INTO public.events(id,title,description,slug,start_at,end_at,location,publication_status,
 registration_type,registration_enabled,max_participants,external_attendees) VALUES
 ('f1060000-0000-4000-8000-000000000001','Fictional later open','Local inventory fixture','inventory-fixture-open',now()+interval '2 days',NULL,'Local fixture','published','internal',true,2,1),
 ('f1060000-0000-4000-8000-000000000002','Fictional external full','Local inventory fixture','inventory-fixture-external-full',now()+interval '2 hours',NULL,'Local fixture','published','internal',true,1,1),
 ('f1060000-0000-4000-8000-000000000003','Fictional internal full','Local inventory fixture','inventory-fixture-internal-full',now()+interval '3 hours',NULL,'Local fixture','published','internal',true,1,0),
 ('f1060000-0000-4000-8000-000000000004','Fictional earlier open','Local inventory fixture','inventory-fixture-removed-attendance',now()+interval '1 day',NULL,'Local fixture','published','internal',true,1,0),
 ('f1060000-0000-4000-8000-000000000005','Fictional disabled','Local inventory fixture','inventory-fixture-closed',now()+interval '1 hour',NULL,'Local fixture','published','internal',false,1,0),
 ('f1060000-0000-4000-8000-000000000006','Fictional ended','Local inventory fixture','inventory-fixture-ended',now()-interval '2 days',now()-interval '1 day','Local fixture','published','internal',true,1,0),
 ('f1060000-0000-4000-8000-000000000007','Fictional draft','Local inventory fixture','inventory-fixture-draft',now()+interval '1 day',NULL,'Local fixture','draft','internal',true,1,0),
 ('f1060000-0000-4000-8000-000000000008','Fictional cancelled','Local inventory fixture','inventory-fixture-cancelled',now()+interval '1 day',NULL,'Local fixture','cancelled','internal',false,1,0),
 ('f1060000-0000-4000-8000-000000000009','Fictional archived','Local inventory fixture','inventory-fixture-archived',now()+interval '1 day',NULL,'Local fixture','archived','internal',false,1,0);
INSERT INTO public.event_attendance(event_id,attendee_name,attendee_email,idempotency_key,request_hash,deleted_at) VALUES
 ('f1060000-0000-4000-8000-000000000003','Fictional participant','inventory-one@example.test',repeat('1',64),repeat('a',64),NULL),
 ('f1060000-0000-4000-8000-000000000004','Fictional removed participant','inventory-two@example.test',repeat('2',64),repeat('b',64),now());
DO $$ DECLARE first_page text[];r jsonb;BEGIN
 IF has_table_privilege('anon','public.public_event_inventory','SELECT')
 OR has_table_privilege('authenticated','public.public_event_inventory','SELECT')
 OR NOT has_table_privilege('service_role','public.public_event_inventory','SELECT')
 OR has_table_privilege('service_role','public.public_event_inventory','UPDATE') THEN RAISE EXCEPTION 'Inventory grants incorrect';END IF;
 IF NOT (SELECT reloptions @> ARRAY['security_invoker=true','security_barrier=true'] FROM pg_class WHERE oid='public.public_event_inventory'::regclass) THEN RAISE EXCEPTION 'View security options missing';END IF;
 IF (SELECT count(*) FROM public.public_event_inventory WHERE slug LIKE 'inventory-fixture-%')<>6 THEN RAISE EXCEPTION 'Private event lifecycle escaped';END IF;
 IF (SELECT registration_state FROM public.public_event_inventory WHERE slug='inventory-fixture-external-full')<>'full'
 OR (SELECT registration_state FROM public.public_event_inventory WHERE slug='inventory-fixture-internal-full')<>'full'
 OR (SELECT registration_state FROM public.public_event_inventory WHERE slug='inventory-fixture-removed-attendance')<>'open'
 OR (SELECT registration_state FROM public.public_event_inventory WHERE slug='inventory-fixture-closed')<>'closed'
 OR (SELECT registration_state FROM public.public_event_inventory WHERE slug='inventory-fixture-ended')<>'ended' THEN RAISE EXCEPTION 'Derived event state incorrect';END IF;
 SELECT array_agg(slug) INTO first_page FROM (SELECT slug FROM public.public_event_inventory WHERE slug LIKE 'inventory-fixture-%' ORDER BY registration_priority,start_at,id LIMIT 2) p;
 IF first_page<>ARRAY['inventory-fixture-removed-attendance','inventory-fixture-open'] THEN RAISE EXCEPTION 'Availability ordering was not applied before pagination';END IF;
 SELECT to_jsonb(e) INTO r FROM public.public_event_inventory e WHERE slug='inventory-fixture-internal-full';
 IF r ?| ARRAY['attendee_name','attendee_email','internal_count','external_attendees','created_by','updated_by','team_id'] THEN RAISE EXCEPTION 'Private inventory columns escaped';END IF;
END $$;
UPDATE public.event_attendance SET deleted_at=now() WHERE event_id='f1060000-0000-4000-8000-000000000003';
SET LOCAL ROLE service_role;
DO $$ BEGIN
 IF (SELECT registration_state FROM public.public_event_inventory WHERE slug='inventory-fixture-internal-full')<>'open' THEN RAISE EXCEPTION 'Removed attendance still consumes derived capacity';END IF;
END $$;
RESET ROLE;
ROLLBACK;
