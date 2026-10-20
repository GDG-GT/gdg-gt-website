BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES
 ('50000000-0000-4000-8000-000000000001','event-admin@example.test','test-only','admin',true),
 ('50000000-0000-4000-8000-000000000002','event-editor@example.test','test-only','blog_editor',true),
 ('50000000-0000-4000-8000-000000000003','event-member@example.test','test-only','team_member',true);
DO $$ DECLARE actor uuid:='50000000-0000-4000-8000-000000000001';v jsonb;v_id uuid;BEGIN
 v:=public.mutate_event(actor,NULL,'create',NULL,jsonb_build_object('title','Operations fixture','slug','operations-fixture',
  'description','Test event','start_at',now()+interval '2 days','location','Test venue'),gen_random_uuid());
 v_id:=(v->>'id')::uuid;
 IF v->>'publication_status'<>'draft' THEN RAISE EXCEPTION 'Creation must be draft';END IF;
 BEGIN
  PERFORM public.mutate_event('50000000-0000-4000-8000-000000000002',v_id,'update',1,'{}',gen_random_uuid());
  RAISE EXCEPTION 'Editor accessed event';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 BEGIN
  PERFORM public.mutate_event(actor,v_id,'publish',9,'{}',gen_random_uuid());
  RAISE EXCEPTION 'Stale revision accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CONFLICT' THEN RAISE;END IF;END;
 v:=public.mutate_event(actor,v_id,'publish',1,'{}',gen_random_uuid());
 IF v->>'publication_status'<>'published' THEN RAISE EXCEPTION 'Publish failed';END IF;
 v:=public.mutate_event(actor,v_id,'update',2,'{"slug":"operations-renamed"}',gen_random_uuid());
 IF NOT EXISTS(SELECT 1 FROM public.event_slug_redirects WHERE old_slug='operations-fixture' AND event_id=v_id) THEN RAISE EXCEPTION 'Slug redirect missing';END IF;
 PERFORM public.register_event_atomic('operations-renamed','Fixture Person','attendee@example.test',NULL,true,repeat('d',64),repeat('e',64));
 PERFORM public.mutate_attendee(actor,v_id,(SELECT id FROM public.event_attendance WHERE event_id=v_id),'{"attended":true}',false,gen_random_uuid());
 IF NOT EXISTS(SELECT 1 FROM public.event_attendance WHERE event_id=v_id AND attended AND check_in_time IS NOT NULL) THEN RAISE EXCEPTION 'Check-in failed';END IF;
 v:=public.mutate_event(actor,v_id,'duplicate',3,'{}',gen_random_uuid());
 IF v->>'publication_status'<>'draft' OR (v->>'id')::uuid=v_id THEN RAISE EXCEPTION 'Duplicate not a new draft';END IF;
 v:=public.mutate_event(actor,v_id,'cancel',3,'{}',gen_random_uuid());
 IF v->>'publication_status'<>'cancelled' OR (v->>'registration_enabled')::boolean THEN RAISE EXCEPTION 'Cancellation failed';END IF;
 IF (SELECT count(*) FROM public.admin_actions WHERE target_id=v_id)<4 THEN RAISE EXCEPTION 'Atomic audit missing';END IF;
END $$;
ROLLBACK;
