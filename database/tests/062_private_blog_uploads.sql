BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES
 ('fa000000-0000-4000-8000-000000000001','blog-file-editor@example.test','blog-file-editor','blog_editor',true),
 ('fa000000-0000-4000-8000-000000000002','blog-file-other@example.test','blog-file-other','blog_editor',true);
CREATE FUNCTION pg_temp.blog_upload(a uuid,s uuid,p uuid,action text,doc jsonb,key text) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.mutate_blog_upload(a,s,p,action,doc,md5(key)||md5(key),md5(doc::text)||md5(doc::text),gen_random_uuid());
$$;
DO $$ DECLARE a uuid:='fa000000-0000-4000-8000-000000000001';other uuid:='fa000000-0000-4000-8000-000000000002';s uuid;s2 uuid;sub uuid;upload uuid;r jsonb;doc jsonb;j public.delivery_jobs;u public.upload_intents;BEGIN
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(a,repeat('aa',32)) RETURNING id INTO s;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(a,repeat('ab',32)) RETURNING id INTO s2;
 doc:=jsonb_build_object('teamId',NULL,'filename','fictional-private.txt','mime','text/plain','bytes',20,'sha256',repeat('b',64),'key','quarantine/'||gen_random_uuid()||'/'||gen_random_uuid());
 r:=pg_temp.blog_upload(a,s,NULL,'create',doc,'create');upload:=(r->>'uploadId')::uuid;sub:=(r->>'submissionId')::uuid;
 IF pg_temp.blog_upload(a,s,NULL,'create',doc,'create')<>r OR(SELECT scan_status FROM public.blog_submissions WHERE id=sub)<>'pending' THEN RAISE EXCEPTION 'Blog upload intent replay';END IF;
 IF public.blog_private_projection(other,'submissions',sub) IS NOT NULL OR(public.blog_private_projection(a,'submissions',sub))?'file_path' THEN RAISE EXCEPTION 'Private upload metadata leak';END IF;
 BEGIN PERFORM public.blog_file_download(a,upload,gen_random_uuid());RAISE EXCEPTION 'Unscanned Blog download';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 BEGIN PERFORM pg_temp.blog_upload(a,s2,upload,'complete','{}','other-session');RAISE EXCEPTION 'Cross-session completion';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 PERFORM pg_temp.blog_upload(a,s,upload,'complete','{}','complete');SELECT * INTO j FROM public.claim_worker_jobs(1,ARRAY['upload_scan']);
 IF NOT public.finish_upload_scan(j.id,j.lease_token,'clean/'||upload||'/'||gen_random_uuid(),'text/plain',20,repeat('c',64),NULL) THEN RAISE EXCEPTION 'Clean Blog promotion failed';END IF;
 IF(SELECT scan_status FROM public.blog_submissions WHERE id=sub)<>'clean' OR(SELECT revision FROM public.blog_submissions WHERE id=sub)<>2 OR(public.blog_file_download(a,upload,gen_random_uuid())->>'filename')<>'fictional-private.txt' THEN RAISE EXCEPTION 'Clean Blob metadata inconsistent';END IF;
 BEGIN PERFORM public.blog_file_download(other,upload,gen_random_uuid());RAISE EXCEPTION 'Unassigned clean Blog download';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 BEGIN UPDATE public.blog_submissions SET file_path='clean/forged' WHERE id=sub;RAISE EXCEPTION 'Clean Blog path replaced';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'BLOG_RETAINED' THEN RAISE;END IF;END;
 IF EXISTS(SELECT 1 FROM public.claim_blog_upload_cleanup(100) WHERE id=upload) THEN RAISE EXCEPTION 'Clean retained Blog file selected for cleanup';END IF;
 doc:=jsonb_set(doc,'{key}',to_jsonb('quarantine/'||gen_random_uuid()||'/'||gen_random_uuid()));r:=pg_temp.blog_upload(a,s,NULL,'create',doc,'revoked-create');upload:=(r->>'uploadId')::uuid;sub:=(r->>'submissionId')::uuid;
 PERFORM pg_temp.blog_upload(a,s,upload,'complete','{}','revoked-complete');SELECT * INTO j FROM public.claim_worker_jobs(1,ARRAY['upload_scan']);
 UPDATE public.admin_sessions SET revoked_at=now() WHERE id=s;
 IF public.finish_upload_scan(j.id,j.lease_token,'clean/'||upload||'/'||gen_random_uuid(),'text/plain',20,repeat('c',64),NULL) THEN RAISE EXCEPTION 'Revoked upload promoted';END IF;
 IF(SELECT state FROM public.upload_intents WHERE id=upload)<>'rejected' OR(SELECT error_code FROM public.upload_intents WHERE id=upload)<>'ACCESS_CHANGED' THEN RAISE EXCEPTION 'Revoked upload not rejected';END IF;
 UPDATE public.upload_intents SET expires_at=now()-interval '25 hours' WHERE id=upload;
 IF NOT EXISTS(SELECT 1 FROM public.claim_blog_upload_cleanup(100) WHERE id=upload) THEN RAISE EXCEPTION 'Failed Blog quarantine not selected for cleanup';END IF;
 IF has_function_privilege('anon','public.blog_file_download(uuid,uuid,uuid)','EXECUTE') OR has_function_privilege('authenticated','public.finish_upload_scan(uuid,uuid,text,text,bigint,text,text)','EXECUTE') THEN RAISE EXCEPTION 'Browser Blog upload grants';END IF;
END $$;
ROLLBACK;
