BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active,display_name) VALUES
 ('f1110000-0000-4000-8000-000000000001','fictional-access-owner@example.test','test-only','admin',true,'Fictional owner'),
 ('f1110000-0000-4000-8000-000000000002','fictional-access-manager@example.test','test-only','team_member',true,'Z manager'),
 ('f1110000-0000-4000-8000-000000000003','fictional-access-admin@example.test','test-only','super_admin',true,'Z administrator'),
 ('f1110000-0000-4000-8000-000000000004','fictional-access-outsider@example.test','test-only','team_member',true,'Fictional outsider'),
 ('f1110000-0000-4000-8000-000000000005','fictional-access-editor@example.test','test-only','blog_editor',true,'Fictional editor'),
 ('f1110000-0000-4000-8000-000000000006','fictional-access-inactive@example.test','test-only','team_member',false,'Fictional inactive');
INSERT INTO public.admin_teams(id,name,slug) VALUES('f1110000-0000-4000-8000-000000000010','Fictional access inventory','fictional-access-inventory');
INSERT INTO public.team_memberships(team_id,admin_user_id) VALUES('f1110000-0000-4000-8000-000000000010','f1110000-0000-4000-8000-000000000002');
INSERT INTO public.forms(id,slug,title,owner_id,team_id,draft_definition) VALUES
 ('f1110000-0000-4000-8000-000000000020','fictional-access-inventory','Fictional access inventory','f1110000-0000-4000-8000-000000000001','f1110000-0000-4000-8000-000000000010','{}');
INSERT INTO public.form_collaborators(form_id,admin_user_id,actions,created_by) VALUES
 ('f1110000-0000-4000-8000-000000000020','f1110000-0000-4000-8000-000000000002',ARRAY['view','manage_access'],'f1110000-0000-4000-8000-000000000001'),
 ('f1110000-0000-4000-8000-000000000020','f1110000-0000-4000-8000-000000000006',ARRAY['view'],'f1110000-0000-4000-8000-000000000001');
INSERT INTO public.admin_users(id,email,password_hash,role,is_active,display_name)
 SELECT ('f1110000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'fictional-access-'||i||'@example.test','test-only','team_member',true,'Fictional candidate '||lpad(i::text,4,'0')
 FROM generate_series(100,1150) i;
INSERT INTO public.team_memberships(team_id,admin_user_id)
 SELECT 'f1110000-0000-4000-8000-000000000010',('f1110000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid FROM generate_series(100,1150) i;
DO $$ DECLARE
 actor uuid:='f1110000-0000-4000-8000-000000000001';manager uuid:='f1110000-0000-4000-8000-000000000002';
 form uuid:='f1110000-0000-4000-8000-000000000020';peer uuid:='f1110000-0000-4000-8000-000000001150';
 v jsonb;first_page jsonb;
BEGIN
 IF has_function_privilege('anon','public.list_form_access_accounts(uuid,uuid,text,integer,integer,text)','EXECUTE')
 OR has_function_privilege('authenticated','public.list_form_access_accounts(uuid,uuid,text,integer,integer,text)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.list_form_access_accounts(uuid,uuid,text,integer,integer,text)','EXECUTE') THEN RAISE EXCEPTION 'Access inventory grants invalid';END IF;
 first_page:=public.list_form_access_accounts(manager,form,'candidates',1,30,'Fictional candidate');
 IF (first_page->>'total')::int<>1051 OR jsonb_array_length(first_page->'items')<>30 THEN RAISE EXCEPTION 'Team eligibility was truncated before pagination';END IF;
 v:=public.list_form_access_accounts(manager,form,'candidates',36,30,'Fictional candidate');
 IF (v->>'total')::int<>1051 OR jsonb_array_length(v->'items')<>1 OR v->'items'->0->>'id'<>peer::text
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(v->'items') a JOIN jsonb_array_elements(first_page->'items') b ON a->>'id'=b->>'id') THEN RAISE EXCEPTION 'Later pages missing or overlapping';END IF;
 v:=public.list_form_access_accounts(manager,form,'candidates',1,30,'CANDIDATE 1150');
 IF (v->>'total')::int<>1 OR v->'items'->0->>'id'<>peer::text OR v::text~'email|password|token|secret' THEN RAISE EXCEPTION 'Safe literal case-insensitive search failed';END IF;
 IF (public.list_form_access_accounts(manager,form,'candidates',1,30,'%')->>'total')::int<>0 THEN RAISE EXCEPTION 'Search wildcard was interpreted';END IF;
 IF (public.list_form_access_accounts(manager,form,'candidates',1,30,'Fictional outsider')->>'total')::int<>0
 OR (public.list_form_access_accounts(manager,form,'candidates',1,30,'Fictional owner')->>'total')::int<>0
 OR (public.list_form_access_accounts(manager,form,'candidates',1,30,'Fictional editor')->>'total')::int<>0
 OR (public.list_form_access_accounts(manager,form,'candidates',1,30,'Fictional inactive')->>'total')::int<>0
 OR (public.list_form_access_accounts(manager,form,'candidates',1,30,'Z administrator')->>'total')::int<>1 THEN RAISE EXCEPTION 'Candidate scope invalid';END IF;
 v:=public.list_form_access_accounts(manager,form,'collaborators',1,1,NULL);
 IF (v->>'total')::int<>2 OR jsonb_array_length(v->'items')<>1 OR NOT(v->'items'->0 ? 'display_name') OR NOT(v->'items'->0 ? 'updated_at') THEN RAISE EXCEPTION 'Collaborator pagination/labels missing';END IF;
 BEGIN PERFORM public.list_form_access_accounts(NULL,form,'candidates',1,30,NULL);RAISE EXCEPTION 'Anonymous actor accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 BEGIN PERFORM public.list_form_access_accounts('f1110000-0000-4000-8000-000000000004',form,'collaborators',1,30,NULL);RAISE EXCEPTION 'Unrelated actor accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 BEGIN PERFORM public.list_form_access_accounts(actor,form,'emails',1,30,NULL);RAISE EXCEPTION 'Unknown kind accepted';EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
 BEGIN PERFORM public.list_form_access_accounts(actor,form,'candidates',0,30,NULL);RAISE EXCEPTION 'Zero page accepted';EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
 BEGIN PERFORM public.list_form_access_accounts(actor,form,'candidates',1,101,NULL);RAISE EXCEPTION 'Unbounded size accepted';EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
 BEGIN PERFORM public.list_form_access_accounts(actor,form,'candidates',1,30,repeat('x',101));RAISE EXCEPTION 'Unbounded query accepted';EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
 UPDATE public.team_memberships SET is_active=false WHERE admin_user_id=peer;
 IF (public.list_form_access_accounts(manager,form,'candidates',1,30,'candidate 1150')->>'total')::int<>0 THEN RAISE EXCEPTION 'Candidate membership revocation ignored';END IF;
 PERFORM public.mutate_form_collaborator(actor,form,'f1110000-0000-4000-8000-000000000006',ARRAY[]::text[],true,gen_random_uuid());
 IF EXISTS(SELECT 1 FROM public.form_collaborators WHERE form_id=form AND admin_user_id='f1110000-0000-4000-8000-000000000006') THEN RAISE EXCEPTION 'Inactive stored grant could not be removed';END IF;
 BEGIN PERFORM public.mutate_form_collaborator(actor,form,peer,ARRAY['view'],false,gen_random_uuid());RAISE EXCEPTION 'New out-of-team grant accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVALID_STATE' THEN RAISE;END IF;END;
 UPDATE public.team_memberships SET is_active=false WHERE admin_user_id=manager;
 BEGIN PERFORM public.list_form_access_accounts(manager,form,'candidates',1,30,NULL);RAISE EXCEPTION 'Manager membership revocation ignored';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 UPDATE public.forms SET team_id=NULL WHERE id=form;
 IF (public.list_form_access_accounts(actor,form,'candidates',1,30,'Fictional outsider')->>'total')::int<>1 THEN RAISE EXCEPTION 'Chapter scope failed';END IF;
 UPDATE public.forms SET permanently_deleted_at=now() WHERE id=form;
 BEGIN PERFORM public.list_form_access_accounts(actor,form,'collaborators',1,30,NULL);RAISE EXCEPTION 'Purged form accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
END $$;
ROLLBACK;
