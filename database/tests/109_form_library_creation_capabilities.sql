BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active,display_name) VALUES
 ('f1090000-0000-4000-8000-000000000001','fictional-capability-admin@example.test','test-only','admin',true,'Fictional Capability Admin'),
 ('f1090000-0000-4000-8000-000000000002','fictional-capability-viewer@example.test','test-only','team_member',true,'Fictional Capability Viewer');
INSERT INTO public.admin_teams(id,name,slug) VALUES
 ('f1090000-0000-4000-8000-000000000003','Fictional capability destination','fictional-capability-destination'),
 ('f1090000-0000-4000-8000-000000000004','Fictional capability source','fictional-capability-source');
INSERT INTO public.team_memberships(team_id,admin_user_id) VALUES
 ('f1090000-0000-4000-8000-000000000003','f1090000-0000-4000-8000-000000000002'),
 ('f1090000-0000-4000-8000-000000000004','f1090000-0000-4000-8000-000000000002');
INSERT INTO public.team_page_access(team_id,page_path) VALUES
 ('f1090000-0000-4000-8000-000000000003','/admin/forms'),
 ('f1090000-0000-4000-8000-000000000004','/admin/forms');
INSERT INTO public.team_permissions(team_id,resource_type,permission,can_read,can_create,can_update) VALUES
 ('f1090000-0000-4000-8000-000000000003','forms','forms.edit',true,false,false),
 ('f1090000-0000-4000-8000-000000000004','forms','forms.edit',true,false,false);
INSERT INTO public.forms(id,slug,title,owner_id,team_id,draft_definition) VALUES
 ('f1090000-0000-4000-8000-000000000005','fictional-capability-chapter','Fictional capability chapter','f1090000-0000-4000-8000-000000000001',NULL,'{"title":"Fictional chapter","fields":[],"sections":[],"settings":{}}'),
 ('f1090000-0000-4000-8000-000000000006','fictional-capability-source','Fictional capability source','f1090000-0000-4000-8000-000000000001','f1090000-0000-4000-8000-000000000004','{"title":"Fictional source","fields":[],"sections":[],"settings":{}}');
INSERT INTO public.form_collaborators(form_id,admin_user_id,actions,created_by) VALUES
 ('f1090000-0000-4000-8000-000000000005','f1090000-0000-4000-8000-000000000002',ARRAY['view'],'f1090000-0000-4000-8000-000000000001');
DO $$ DECLARE
 actor uuid:='f1090000-0000-4000-8000-000000000001'; viewer uuid:='f1090000-0000-4000-8000-000000000002'; result jsonb; source jsonb; chapter jsonb;
BEGIN
 IF has_function_privilege('anon','public.list_form_library(uuid,integer,integer,text,uuid,uuid,text,date,date,text,boolean)','EXECUTE')
 OR has_function_privilege('authenticated','public.list_form_library(uuid,integer,integer,text,uuid,uuid,text,date,date,text,boolean)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.list_form_library(uuid,integer,integer,text,uuid,uuid,text,date,date,text,boolean)','EXECUTE') THEN RAISE EXCEPTION 'Capability inventory grants invalid'; END IF;
 result:=public.list_form_library(viewer,1,30,'Fictional capability',NULL,NULL,NULL,NULL,NULL,NULL);
 IF result->'canCreate'<>'false'::jsonb OR (result->>'total')::int<>2 OR EXISTS(SELECT 1 FROM jsonb_array_elements(result->'items') i WHERE i->'can_duplicate'<>'false'::jsonb OR i->'response_count'<>'null'::jsonb OR i->'actions'<>'["view"]'::jsonb) THEN RAISE EXCEPTION 'View-only capabilities are misleading'; END IF;
 UPDATE public.team_permissions SET can_create=true WHERE team_id='f1090000-0000-4000-8000-000000000003';
 result:=public.list_form_library(viewer,1,30,'Fictional capability',NULL,NULL,NULL,NULL,NULL,NULL);
 SELECT i INTO source FROM jsonb_array_elements(result->'items') i WHERE i->>'id'='f1090000-0000-4000-8000-000000000006';
 SELECT i INTO chapter FROM jsonb_array_elements(result->'items') i WHERE i->>'id'='f1090000-0000-4000-8000-000000000005';
 IF result->'canCreate'<>'true'::jsonb OR source->'can_duplicate'<>'false'::jsonb OR chapter->'can_duplicate'<>'true'::jsonb THEN RAISE EXCEPTION 'Create grant escaped destination scope'; END IF;
 result:=public.list_form_library(actor,1,30,'Fictional capability',NULL,NULL,NULL,NULL,NULL,NULL);
 IF result->'canCreate'<>'true'::jsonb OR EXISTS(SELECT 1 FROM jsonb_array_elements(result->'items') i WHERE i->'can_duplicate'<>'true'::jsonb) THEN RAISE EXCEPTION 'Admin creation lost'; END IF;
 UPDATE public.team_memberships SET is_active=false WHERE admin_user_id=viewer;
 result:=public.list_form_library(viewer,1,30,'Fictional capability',NULL,NULL,NULL,NULL,NULL,NULL);
 IF result->'canCreate'<>'false'::jsonb OR (result->>'total')::int<>1 OR result->'items'->0->'can_duplicate'<>'false'::jsonb THEN RAISE EXCEPTION 'Revoked team creation retained'; END IF;
 result:=public.list_form_library(NULL,1,30,NULL,NULL,NULL,NULL,NULL,NULL,NULL);
 IF result->'canCreate'<>'false'::jsonb OR result->'items'<>'[]'::jsonb THEN RAISE EXCEPTION 'Anonymous creation capability disclosed'; END IF;
END $$;
ROLLBACK;
