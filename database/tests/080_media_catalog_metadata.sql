BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES('f8000000-0000-4000-8000-000000000001','media-catalog@example.test','test-only','admin',true);
INSERT INTO public.admin_sessions(id,admin_user_id,token_hash) VALUES('f8000000-0000-4000-8000-000000000002','f8000000-0000-4000-8000-000000000001',repeat('1',64));
DO $$ DECLARE actor uuid:='f8000000-0000-4000-8000-000000000001';sid uuid:='f8000000-0000-4000-8000-000000000002';f uuid;v jsonb;BEGIN
 INSERT INTO public.media_files(name,original_name,file_type,mime_type,file_size,file_path,uploaded_by,tags) VALUES('Fixture','fixture.txt','document','text/plain',100,'',actor,'["Local"]') RETURNING id INTO f;
 v:=public.mutate_media_files(actor,sid,'tags',jsonb_build_array(jsonb_build_object('id',f,'revision',1)),'{"mode":"add","tags":["local","approved"]}',repeat('1',64),repeat('2',64),gen_random_uuid());
 IF v->'items'->0->'tags'<>'["Local","approved"]'::jsonb THEN RAISE EXCEPTION 'Case-insensitive bulk tags lost order or duplicated';END IF;
 v:=public.mutate_media_files(actor,sid,'tags',jsonb_build_array(jsonb_build_object('id',f,'revision',2)),'{"mode":"remove","tags":["LOCAL"]}',repeat('3',64),repeat('2',64),gen_random_uuid());
 IF v->'items'->0->'tags'<>'["approved"]'::jsonb THEN RAISE EXCEPTION 'Tag removal case wrong';END IF;
 v:=public.mutate_media_files(actor,sid,'metadata',jsonb_build_array(jsonb_build_object('id',f,'revision',3)),jsonb_build_object('name','Fixture','alt','','description','Fixture','tags','["approved"]'::jsonb,'eventId',NULL,'order',0,'allowDownload',false,'seoTitle','Fictional search title','seoDescription','Fictional search description'),repeat('4',64),repeat('2',64),gen_random_uuid());
 IF v->'items'->0->>'seoTitle'<>'Fictional search title' OR v->'items'->0->>'seoDescription'<>'Fictional search description' THEN RAISE EXCEPTION 'Search metadata not preserved';END IF;
 v:=public.mutate_media_files(actor,sid,'tags',jsonb_build_array(jsonb_build_object('id',f,'revision',4)),'{"mode":"replace","tags":[]}',repeat('5',64),repeat('2',64),gen_random_uuid());
 IF v->'items'->0->'tags'<>'[]'::jsonb THEN RAISE EXCEPTION 'Explicit replacement did not clear tags';END IF;
END $$;
ROLLBACK;
