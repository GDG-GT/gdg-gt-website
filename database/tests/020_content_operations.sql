BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES
 ('c0000000-0000-4000-8000-000000000001','content-admin@example.test','test-only','admin',true),
 ('c0000000-0000-4000-8000-000000000002','content-team@example.test','test-only','team_member',true),
 ('c0000000-0000-4000-8000-000000000003','content-outsider@example.test','test-only','team_member',true);
INSERT INTO public.admin_teams(id,name,slug) VALUES('c0000000-0000-4000-8000-000000000004','Content team fixture','content-team-fixture');
INSERT INTO public.team_memberships(team_id,admin_user_id) VALUES('c0000000-0000-4000-8000-000000000004','c0000000-0000-4000-8000-000000000002');
INSERT INTO public.team_page_access(team_id,page_path) VALUES('c0000000-0000-4000-8000-000000000004','/admin/resources');
INSERT INTO public.team_permissions(team_id,resource_type,permission,can_read,can_create,can_update,can_delete)
 VALUES('c0000000-0000-4000-8000-000000000004','resources','resources.edit',true,true,true,true);
DO $$ DECLARE r jsonb;record_id uuid;kind text;document jsonb;BEGIN
 r:=public.mutate_content_record('c0000000-0000-4000-8000-000000000002','resources',NULL,'create',NULL,
  '{"title":"Fictional resource","description":"Fictional content only","type":"documentation","team_id":"c0000000-0000-4000-8000-000000000004"}',gen_random_uuid());record_id:=(r->>'id')::uuid;
 IF (r->>'is_active')::boolean OR r->>'created_by'<>'c0000000-0000-4000-8000-000000000002' THEN RAISE EXCEPTION 'Creation bypassed private draft or trusted authorship';END IF;
 IF public.list_content_records('c0000000-0000-4000-8000-000000000003','resources',1,30,'{}')->>'total'<>'0' THEN RAISE EXCEPTION 'Unrelated team discovered private resources';END IF;
 BEGIN
  PERFORM public.mutate_content_record('c0000000-0000-4000-8000-000000000002','resources',record_id,'publish',1,'{}',gen_random_uuid());
  RAISE EXCEPTION 'Update grant implied publish';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 r:=public.mutate_content_record('c0000000-0000-4000-8000-000000000001','resources',record_id,'publish',1,'{}',gen_random_uuid());
 IF NOT (r->>'is_active')::boolean THEN RAISE EXCEPTION 'Explicit publication failed';END IF;
 r:=public.mutate_content_record('c0000000-0000-4000-8000-000000000002','resources',record_id,'update',2,'{"title":"Edited private draft"}',gen_random_uuid());
 IF (r->>'is_active')::boolean THEN RAISE EXCEPTION 'Editing bypassed publication review';END IF;
 BEGIN
  PERFORM public.mutate_content_record('c0000000-0000-4000-8000-000000000002','resources',record_id,'update',1,'{"title":"Stale"}',gen_random_uuid());
  RAISE EXCEPTION 'Stale edit accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CONFLICT' THEN RAISE;END IF;END;
 BEGIN
  PERFORM public.mutate_content_record('c0000000-0000-4000-8000-000000000002','resources',record_id,'update',3,'{"is_active":true}',gen_random_uuid());
  RAISE EXCEPTION 'Mass-assignment bypassed publication';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'VALIDATION_ERROR' THEN RAISE;END IF;END;
 r:=public.mutate_content_record('c0000000-0000-4000-8000-000000000002','resources',record_id,'archive',3,'{}',gen_random_uuid());
 IF r->>'deleted_at' IS NULL OR public.list_content_records('c0000000-0000-4000-8000-000000000002','resources',1,30,'{}')->>'total'<>'0' THEN RAISE EXCEPTION 'Archive not hidden';END IF;
 r:=public.mutate_content_record('c0000000-0000-4000-8000-000000000002','resources',record_id,'restore',4,'{}',gen_random_uuid());
 IF r->>'deleted_at' IS NOT NULL OR (r->>'is_active')::boolean THEN RAISE EXCEPTION 'Restore did not produce private draft';END IF;
 FOREACH kind IN ARRAY ARRAY['sponsors','sponsor-tiers','sponsor-stats','team-profiles'] LOOP
  document:=CASE kind WHEN 'sponsors' THEN '{"name":"Fictional sponsor","logo_url":"/assets/fictional.png","tier":"bronze"}'::jsonb
   WHEN 'sponsor-tiers' THEN '{"tier_name":"Fictional tier","tier_level":"bronze","amount":"In-kind support","color_gradient":"coral"}'::jsonb
   WHEN 'sponsor-stats' THEN '{"stat_label":"Fictional verified value","stat_value":"Test only","stat_description":"Not real chapter data","icon_name":"users"}'::jsonb
   ELSE '{"name":"Fictional profile","role":"Test only"}'::jsonb END;
  r:=public.mutate_content_record('c0000000-0000-4000-8000-000000000001',kind,NULL,'create',NULL,document,gen_random_uuid());
  IF kind<>'sponsor-tiers' THEN r:=public.mutate_content_record('c0000000-0000-4000-8000-000000000001',kind,(r->>'id')::uuid,'duplicate',1,'{}',gen_random_uuid());END IF;
  IF (r->>'is_active')::boolean THEN RAISE EXCEPTION 'Copy is unexpectedly public';END IF;
 END LOOP;
 UPDATE public.team_memberships SET is_active=false WHERE admin_user_id='c0000000-0000-4000-8000-000000000002';
 IF public.can_operate_content('c0000000-0000-4000-8000-000000000002','resources','read','c0000000-0000-4000-8000-000000000004') THEN RAISE EXCEPTION 'Revoked membership retained access';END IF;
END $$;
ROLLBACK;
