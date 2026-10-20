BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES
 ('c2000000-0000-4000-8000-000000000001','cms-admin@example.test','test-only','admin',true),
 ('c2000000-0000-4000-8000-000000000002','cms-outsider@example.test','test-only','team_member',true);
DO $$ DECLARE r jsonb;child jsonb;record_id uuid;kind text;document jsonb;BEGIN
 IF public.can_manage_site_content('c2000000-0000-4000-8000-000000000002','create') THEN RAISE EXCEPTION 'Ungrant member can edit site';END IF;
 FOREACH kind IN ARRAY ARRAY['settings','pages','navigation','social','footer'] LOOP
  document:=CASE kind WHEN 'settings' THEN '{"key":"site_title","value":"SQL fictional title"}'::jsonb
   WHEN 'pages' THEN '{"page_slug":"home","section_key":"hero","content":{"title":"SQL fictional copy"}}'::jsonb
   WHEN 'navigation' THEN '{"label":"Events","href":"/events","parent_id":null}'::jsonb
   WHEN 'social' THEN '{"platform":"github","url":"https://github.com/gdg-on-campus","icon":"github"}'::jsonb
   WHEN 'footer' THEN '{"section_key":"about","content":{"description":"SQL fictional footer"}}'::jsonb END;
  r:=public.mutate_site_content('c2000000-0000-4000-8000-000000000001',kind,NULL,'create',NULL,document,gen_random_uuid());record_id:=(r->>'id')::uuid;
  IF (r->>'is_active')::boolean OR r->>'updated_by'<>'c2000000-0000-4000-8000-000000000001' THEN RAISE EXCEPTION 'CMS draft/actor bypass';END IF;
  r:=public.mutate_site_content('c2000000-0000-4000-8000-000000000001',kind,record_id,'publish',1,'{}',gen_random_uuid());
  IF NOT (r->>'is_active')::boolean THEN RAISE EXCEPTION 'CMS publish failed';END IF;
  r:=public.mutate_site_content('c2000000-0000-4000-8000-000000000001',kind,record_id,'update',2,document,gen_random_uuid());
  IF (r->>'is_active')::boolean THEN RAISE EXCEPTION 'CMS edit bypasses publish';END IF;
  BEGIN
   PERFORM public.mutate_site_content('c2000000-0000-4000-8000-000000000001',kind,record_id,'update',1,document,gen_random_uuid());
   RAISE EXCEPTION 'CMS stale edit accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CONFLICT' THEN RAISE;END IF;END;
  IF kind='navigation' THEN
   child:=public.mutate_site_content('c2000000-0000-4000-8000-000000000001',kind,NULL,'create',NULL,jsonb_build_object('label','Child','href','/team','parent_id',record_id),gen_random_uuid());
   BEGIN
    PERFORM public.mutate_site_content('c2000000-0000-4000-8000-000000000001',kind,record_id,'update',3,jsonb_build_object('parent_id',child->>'id'),gen_random_uuid());
    RAISE EXCEPTION 'Navigation cycle accepted';
   EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVALID_STATE' THEN RAISE;END IF;END;
  END IF;
  r:=public.mutate_site_content('c2000000-0000-4000-8000-000000000001',kind,record_id,'archive',3,'{}',gen_random_uuid());
  IF r->>'deleted_at' IS NULL OR (r->>'is_active')::boolean THEN RAISE EXCEPTION 'CMS archive failed';END IF;
  r:=public.mutate_site_content('c2000000-0000-4000-8000-000000000001',kind,record_id,'restore',4,'{}',gen_random_uuid());
  IF r->>'deleted_at' IS NOT NULL OR (r->>'is_active')::boolean THEN RAISE EXCEPTION 'CMS restore republishes';END IF;
 END LOOP;
 IF has_function_privilege('anon','public.mutate_site_content(uuid,text,uuid,text,integer,jsonb,uuid)','EXECUTE') THEN RAISE EXCEPTION 'CMS browser RPC exposed';END IF;
END $$;
ROLLBACK;
