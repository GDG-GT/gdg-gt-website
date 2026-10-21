BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES
 ('f7300000-0000-4000-8000-000000000001','media-admin@example.test','test-only','admin',true),
 ('f7300000-0000-4000-8000-000000000002','media-member@example.test','test-only','team_member',true),
 ('f7300000-0000-4000-8000-000000000003','media-outsider@example.test','test-only','team_member',true),
 ('f7300000-0000-4000-8000-000000000004','media-editor@example.test','test-only','blog_editor',true);
INSERT INTO public.admin_sessions(id,admin_user_id,token_hash) VALUES
 ('f7300000-0000-4000-8000-000000000005','f7300000-0000-4000-8000-000000000001',repeat('1',64)),
 ('f7300000-0000-4000-8000-000000000006','f7300000-0000-4000-8000-000000000002',repeat('2',64)),
 ('f7300000-0000-4000-8000-000000000007','f7300000-0000-4000-8000-000000000003',repeat('3',64));
DO $$ DECLARE actor uuid:='f7300000-0000-4000-8000-000000000001';sid uuid:='f7300000-0000-4000-8000-000000000005';
 member uuid:='f7300000-0000-4000-8000-000000000002';msid uuid:='f7300000-0000-4000-8000-000000000006';
 outsider uuid:='f7300000-0000-4000-8000-000000000003';osid uuid:='f7300000-0000-4000-8000-000000000007';t uuid;foreign_team uuid;root uuid;child uuid;file uuid;v jsonb;BEGIN
 IF has_function_privilege('anon','public.read_media_workspace(uuid,uuid,jsonb,integer,integer)','EXECUTE') OR has_table_privilege('authenticated','public.media_files','SELECT') THEN RAISE EXCEPTION 'Browser private media access';END IF;
 INSERT INTO public.admin_teams(name,slug,created_by) VALUES('Fictional media team','fictional-media-team',actor) RETURNING id INTO t;
 INSERT INTO public.admin_teams(name,slug,created_by) VALUES('Fictional foreign media team','fictional-foreign-media-team',actor) RETURNING id INTO foreign_team;
 INSERT INTO public.team_memberships(team_id,admin_user_id,role) VALUES(t,member,'member');
 INSERT INTO public.team_page_access(team_id,page_path,can_access) VALUES(t,'/admin/media',true);
 INSERT INTO public.team_permissions(team_id,resource_type,permission,can_read,can_create,can_update,can_delete) VALUES(t,'media','crud',true,true,true,true);
 IF NOT public.can_operate_media(member,t,'create') OR public.can_operate_media(member,NULL,'create') OR public.can_operate_media(member,foreign_team,'read') OR public.can_operate_media('f7300000-0000-4000-8000-000000000004',t,'read') THEN RAISE EXCEPTION 'Media team/role scope wrong';END IF;
 IF public.can_operate_media(member,t,'publish',true) THEN RAISE EXCEPTION 'Media CRUD implicitly grants gallery publication';END IF;
 v:=public.mutate_media_folder(member,msid,NULL,'create',NULL,jsonb_build_object('name','Fictional media root','description','Fixture','teamId',t,'parentId',NULL),gen_random_uuid());root:=(v->>'id')::uuid;
 v:=public.mutate_media_folder(member,msid,NULL,'create',NULL,jsonb_build_object('name','Fictional child','description','Fixture','teamId',t,'parentId',root),gen_random_uuid());child:=(v->>'id')::uuid;
 BEGIN PERFORM public.mutate_media_folder(member,msid,root,'move',1,jsonb_build_object('parentId',child),gen_random_uuid());RAISE EXCEPTION 'Folder ancestry cycle accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'MEDIA_FOLDER_CYCLE' THEN RAISE;END IF;END;
 BEGIN PERFORM public.mutate_media_folder(member,msid,root,'update',99,'{"name":"Stale","description":"Fixture"}',gen_random_uuid());RAISE EXCEPTION 'Stale folder update accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CONFLICT' THEN RAISE;END IF;END;
 BEGIN PERFORM public.mutate_media_folder(member,msid,NULL,'create',NULL,jsonb_build_object('name','Foreign write','teamId',foreign_team),gen_random_uuid());RAISE EXCEPTION 'Foreign folder created';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 BEGIN PERFORM public.read_media_workspace(outsider,osid,jsonb_build_object('folderId',root),1,30);RAISE EXCEPTION 'Foreign media inventory disclosed';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 INSERT INTO public.media_files(name,original_name,file_type,mime_type,file_size,file_path,folder_id,uploaded_by,team_id,tags)
 VALUES('Fictional image','fictional.jpg','image','image/jpeg',100,'private/quarantine/never-disclose-this-key',root,member,t,'["fixture"]') RETURNING id INTO file;
 v:=public.read_media_workspace(member,msid,jsonb_build_object('folderId',root),1,30);
 IF v->>'total'<>'1' OR jsonb_array_length(v->'items')<>1 OR v::text LIKE '%never-disclose-this-key%' OR v->'items'->0->>'scanState'<>'unverified' THEN RAISE EXCEPTION 'Media DTO exposed keys or skipped unverified state';END IF;
 INSERT INTO public.media_usage(file_id,usage_type,reference_id,reference_table) VALUES(file,'fixture',gen_random_uuid(),'site_content');
 IF NOT gdg_security.media_in_use(file) THEN RAISE EXCEPTION 'Usage not checked';END IF;
 BEGIN PERFORM public.mutate_media_folder(member,msid,root,'delete',1,'{}',gen_random_uuid());RAISE EXCEPTION 'Nonempty folder removed';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'MEDIA_FOLDER_NOT_EMPTY' THEN RAISE;END IF;END;
 UPDATE public.team_page_access SET can_access=false WHERE team_id=t;
 IF public.can_operate_media(member,t,'read') THEN RAISE EXCEPTION 'Revoked page still grants media access';END IF;
 UPDATE public.team_page_access SET can_access=true WHERE team_id=t;
 UPDATE public.admin_sessions SET revoked_at=now() WHERE id=msid;
 BEGIN PERFORM public.read_media_workspace(member,msid,'{}',1,30);RAISE EXCEPTION 'Revoked media session read';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 IF gdg_security.media_file_record(outsider,file) IS NOT NULL THEN RAISE EXCEPTION 'Foreign file metadata exposed';END IF;
END $$;
ROLLBACK;
