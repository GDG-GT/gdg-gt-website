BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES
 ('f7400000-0000-4000-8000-000000000001','media-mutations@example.test','test-only','admin',true),
 ('f7400000-0000-4000-8000-000000000002','media-scoped@example.test','test-only','team_member',true);
INSERT INTO public.admin_sessions(id,admin_user_id,token_hash) VALUES
 ('f7400000-0000-4000-8000-000000000003','f7400000-0000-4000-8000-000000000001',repeat('1',64)),
 ('f7400000-0000-4000-8000-000000000004','f7400000-0000-4000-8000-000000000002',repeat('2',64));
DO $$ DECLARE actor uuid:='f7400000-0000-4000-8000-000000000001';sid uuid:='f7400000-0000-4000-8000-000000000003';
 member uuid:='f7400000-0000-4000-8000-000000000002';msid uuid:='f7400000-0000-4000-8000-000000000004';t uuid;other uuid;f uuid;g uuid;v jsonb;files jsonb;BEGIN
 IF has_function_privilege('authenticated','public.mutate_media_files(uuid,uuid,text,jsonb,jsonb,text,text,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Browser mutation privilege';END IF;
 INSERT INTO public.admin_teams(name,slug,created_by) VALUES('Fictional mutation scope','fictional-mutation-scope',actor) RETURNING id INTO t;
 INSERT INTO public.admin_teams(name,slug,created_by) VALUES('Fictional other scope','fictional-mutation-other',actor) RETURNING id INTO other;
 INSERT INTO public.team_memberships(team_id,admin_user_id,role) VALUES(t,member,'member');
 INSERT INTO public.team_page_access(team_id,page_path,can_access) VALUES(t,'/admin/media',true);
 INSERT INTO public.team_permissions(team_id,resource_type,permission,can_read,can_create,can_update,can_delete) VALUES(t,'media','crud',true,true,true,true);
 INSERT INTO public.media_files(name,original_name,file_type,mime_type,file_size,file_path,uploaded_by,team_id,scan_state) VALUES('Fictional','fixture.txt','document','text/plain',10,'clean/fixture',member,t,'clean') RETURNING id INTO f;
 INSERT INTO public.media_files(name,original_name,file_type,mime_type,file_size,file_path,uploaded_by,team_id,scan_state) VALUES('Fictional other','fixture.txt','document','text/plain',10,'clean/fixture2',actor,other,'clean') RETURNING id INTO g;
 v:=public.mutate_media_files(member,msid,'metadata',jsonb_build_array(jsonb_build_object('id',f,'revision',1)),jsonb_build_object('name','Fictional reviewed','alt','Fictional notes','description','Fixture','tags','["local"]'::jsonb,'eventId',NULL,'order',2,'allowDownload',false),repeat('9',64),repeat('b',64),gen_random_uuid());
 IF v->'items'->0->>'name'<>'Fictional reviewed' THEN RAISE EXCEPTION 'Metadata not saved';END IF;
 UPDATE public.media_files SET revision=1 WHERE id=f; -- isolate revision fixtures
 files:=jsonb_build_array(jsonb_build_object('id',f,'revision',1));
 v:=public.mutate_media_files(member,msid,'star',files,'{"starred":true}',repeat('a',64),repeat('b',64),gen_random_uuid());
 IF v->'items'->0->>'revision'<>'2' OR v::text LIKE '%clean/fixture%' THEN RAISE EXCEPTION 'Mutation DTO';END IF;
 v:=public.mutate_media_files(member,msid,'star',files,'{"starred":true}',repeat('a',64),repeat('b',64),gen_random_uuid());
 IF(SELECT revision FROM public.media_files WHERE id=f)<>2 THEN RAISE EXCEPTION 'Retry changed twice';END IF;
 BEGIN PERFORM public.mutate_media_files(member,msid,'star',files,'{"starred":true}',repeat('c',64),repeat('b',64),gen_random_uuid());RAISE EXCEPTION 'Stale accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CONFLICT' THEN RAISE;END IF;END;
 files:=jsonb_build_array(jsonb_build_object('id',f,'revision',2));
 BEGIN PERFORM public.mutate_media_files(member,msid,'move',files,jsonb_build_object('teamId',other,'folderId',NULL),repeat('d',64),repeat('b',64),gen_random_uuid());RAISE EXCEPTION 'Foreign move';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 BEGIN PERFORM public.mutate_media_files(member,msid,'archive',files||jsonb_build_array(jsonb_build_object('id',g,'revision',1)),'{}',repeat('e',64),repeat('b',64),gen_random_uuid());RAISE EXCEPTION 'Mixed unauthorized bulk';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 IF(SELECT deleted_at FROM public.media_files WHERE id=f) IS NOT NULL THEN RAISE EXCEPTION 'Partial bulk mutation';END IF;
 UPDATE public.media_files SET is_public=true WHERE id=f;
 BEGIN PERFORM public.mutate_media_files(member,msid,'archive',files,'{}',repeat('f',64),repeat('b',64),gen_random_uuid());RAISE EXCEPTION 'Published archive';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'MEDIA_IN_USE' THEN RAISE;END IF;END;
 UPDATE public.media_files SET is_public=false WHERE id=f;
 INSERT INTO public.media_usage(file_id,usage_type,reference_id,reference_table) VALUES(f,'fixture',gen_random_uuid(),'site_content');
 BEGIN PERFORM public.mutate_media_files(member,msid,'archive',files,'{}',repeat('f',64),repeat('b',64),gen_random_uuid());RAISE EXCEPTION 'Used archive';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'MEDIA_IN_USE' THEN RAISE;END IF;END;
 DELETE FROM public.media_usage WHERE file_id=f;
 v:=public.mutate_media_files(member,msid,'archive',files,'{}',repeat('f',64),repeat('b',64),gen_random_uuid());
 v:=public.mutate_media_files(member,msid,'restore',jsonb_build_array(jsonb_build_object('id',f,'revision',3)),'{}',repeat('1',64),repeat('b',64),gen_random_uuid());
 IF(SELECT deleted_at IS NOT NULL OR is_public OR revision<>4 FROM public.media_files WHERE id=f) THEN RAISE EXCEPTION 'Restore wrong';END IF;
 UPDATE public.team_page_access SET can_access=false WHERE team_id=t;
 BEGIN PERFORM public.mutate_media_files(member,msid,'star',files,'{"starred":true}',repeat('a',64),repeat('b',64),gen_random_uuid());RAISE EXCEPTION 'Cached access after revoke';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
END $$;
ROLLBACK;
