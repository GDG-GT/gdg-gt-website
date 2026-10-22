BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active,display_name) VALUES
 ('f9900000-0000-4000-8000-000000000001','fictional-library-admin@example.test','test-only','admin',true,'Fictional Library Admin'),
 ('f9900000-0000-4000-8000-000000000002','fictional-library-member@example.test','test-only','team_member',true,'Fictional Library Member'),
 ('f9900000-0000-4000-8000-000000000003','fictional-library-hidden@example.test','test-only','team_member',true,'Fictional Hidden Owner');
INSERT INTO public.admin_teams(id,name,slug) VALUES
 ('f9900000-0000-4000-8000-000000000004','Fictional visible team','fictional-library-visible'),
 ('f9900000-0000-4000-8000-000000000005','Fictional hidden team','fictional-library-hidden');
INSERT INTO public.team_memberships(team_id,admin_user_id) VALUES('f9900000-0000-4000-8000-000000000004','f9900000-0000-4000-8000-000000000002');
INSERT INTO public.team_page_access(team_id,page_path) VALUES('f9900000-0000-4000-8000-000000000004','/admin/forms');
INSERT INTO public.team_permissions(team_id,resource_type,permission,can_read,can_create,can_update) VALUES
 ('f9900000-0000-4000-8000-000000000004','forms','forms.edit',true,true,true);
DO $$ DECLARE actor uuid:='f9900000-0000-4000-8000-000000000001';member uuid:='f9900000-0000-4000-8000-000000000002';team uuid:='f9900000-0000-4000-8000-000000000004';
 v jsonb;f uuid;definition jsonb:='{"title":"Fictional library fixture","description":"","fields":[],"sections":[],"settings":{"access":"public"}}';result jsonb;BEGIN
 IF has_function_privilege('anon','public.list_form_library(uuid,integer,integer,text,uuid,uuid,text,date,date,text,boolean)','EXECUTE')
 OR has_function_privilege('authenticated','public.list_form_library_options(uuid,text,integer,integer,text)','EXECUTE')
 OR has_function_privilege('anon','public.create_form_from_template(uuid,jsonb,text,uuid)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.list_form_library_options(uuid,text,integer,integer,text)','EXECUTE') THEN RAISE EXCEPTION 'Library grants invalid';END IF;
 v:=public.create_form_from_template(member,jsonb_build_object('slug','fictional-library-visible','definition',definition,'team_id',team),'feedback',gen_random_uuid());f:=(v->>'id')::uuid;
 IF v->>'template_key'<>'feedback' THEN RAISE EXCEPTION 'Origin not returned';END IF;
 UPDATE public.forms SET updated_at='2026-10-22 23:59:59.999999+00' WHERE id=f;
 INSERT INTO public.forms(slug,title,owner_id,team_id,draft_definition,template_key,updated_at) VALUES
 ('fictional-library-next-day','Fictional next day',member,team,definition,'interest','2026-10-23 00:00:00+00'),
 ('fictional-library-chapter','Fictional chapter',actor,NULL,definition,NULL,'2026-10-22 00:00:00+00'),
 ('fictional-library-hidden','Fictional hidden','f9900000-0000-4000-8000-000000000003','f9900000-0000-4000-8000-000000000005',definition,'feedback','2026-10-22 12:00:00+00');
 result:=public.list_form_library(member,1,1,NULL,NULL,NULL,NULL,'2026-10-22','2026-10-22','feedback');
 IF (result->>'total')::int<>1 OR result->'items'->0->>'id'<>f::text OR result->'items'->0->>'owner_label'<>'Fictional Library Member'
 OR result->'items'->0->>'team_label'<>'Fictional visible team' OR result->'items'->0->'response_count'<>'null'::jsonb THEN RAISE EXCEPTION 'Scope/day/labels/response permission failed';END IF;
 result:=public.list_form_library(member,2,1,NULL,NULL,member,NULL,NULL,NULL,NULL);
 IF (result->>'total')::int<>2 OR jsonb_array_length(result->'items')<>1 THEN RAISE EXCEPTION 'Server pagination failed';END IF;
 IF (public.list_form_library(actor,1,30,'Fictional',NULL,NULL,NULL,NULL,NULL,'unspecified',true)->>'total')::int<>1 THEN RAISE EXCEPTION 'Chapter/unknown-origin filter failed';END IF;
 IF (public.list_form_library(member,1,30,NULL,'f9900000-0000-4000-8000-000000000005',NULL,NULL,NULL,NULL,NULL)->>'total')::int<>0 THEN RAISE EXCEPTION 'Foreign scope filter disclosed records';END IF;
 IF (public.list_form_library(NULL,1,30,NULL,NULL,NULL,NULL,NULL,NULL,NULL)->>'total')::int<>0 THEN RAISE EXCEPTION 'Anonymous actor sees forms';END IF;
 result:=public.list_form_library_options(member,'owner',1,1,NULL);
 IF (result->>'total')::int<>1 OR result->'items'->0->>'id'<>member::text OR result::text LIKE '%Hidden%' OR result::text LIKE '%email%' THEN RAISE EXCEPTION 'Owner options disclose inaccessible accounts';END IF;
 result:=public.list_form_library_options(member,'team',1,1,'visible');
 IF (result->>'total')::int<>1 OR result->'items'->0->>'id'<>team::text THEN RAISE EXCEPTION 'Team options scope/search failed';END IF;
 IF (public.list_form_library_options(member,'team',2,1,NULL)->>'total')::int<>1 OR jsonb_array_length(public.list_form_library_options(member,'team',2,1,NULL)->'items')<>0 THEN RAISE EXCEPTION 'Options pagination failed';END IF;
 BEGIN PERFORM public.list_form_library(actor,1,30,NULL,NULL,NULL,NULL,'2026-10-23','2026-10-22',NULL);RAISE EXCEPTION 'Reversed days accepted';EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
 BEGIN PERFORM public.list_form_library_options(actor,'email',1,30,NULL);RAISE EXCEPTION 'Broad directory accepted';EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
 BEGIN PERFORM public.create_form_from_template(member,jsonb_build_object('slug','fictional-library-denied','definition',definition,'team_id','f9900000-0000-4000-8000-000000000005'),'feedback',gen_random_uuid());RAISE EXCEPTION 'Template bypassed create authorization';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'FORBIDDEN' THEN RAISE;END IF;END;
 UPDATE public.team_memberships SET is_active=false WHERE admin_user_id=member;
 IF (public.list_form_library_options(member,'owner',1,30,NULL)->>'total')::int<>0 OR (public.list_form_library(member,1,30,NULL,NULL,NULL,NULL,NULL,NULL,NULL)->>'total')::int<>0 THEN RAISE EXCEPTION 'Revoked membership retains inventory';END IF;
END $$;
ROLLBACK;
