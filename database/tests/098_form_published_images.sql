BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES('f9800000-0000-4000-8000-000000000001','fictional-form-images@example.test','test-only','admin',true);
INSERT INTO public.admin_sessions(id,admin_user_id,token_hash) VALUES('f9800000-0000-4000-8000-000000000002','f9800000-0000-4000-8000-000000000001',repeat('1',64));
DO $$ DECLARE actor uuid:='f9800000-0000-4000-8000-000000000001';sid uuid:='f9800000-0000-4000-8000-000000000002';
 v jsonb;u uuid;file_id uuid;publication uuid;j public.delivery_jobs;variants jsonb;definition jsonb;form_id uuid;field_id uuid:=gen_random_uuid();rev integer;BEGIN
 IF has_function_privilege('anon','public.mutate_form(uuid,uuid,text,integer,jsonb,text,uuid)','EXECUTE')
 OR has_function_privilege('authenticated','public.mutate_form(uuid,uuid,text,integer,jsonb,text,uuid)','EXECUTE')
 OR has_function_privilege('service_role','gdg_security.mutate_form_without_media(uuid,uuid,text,integer,jsonb,text,uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'Image publication boundary can be bypassed';END IF;
 -- Build only fictional metadata through the actual scan/publication state
 -- machines. This SQL test does not claim to scan or store actual file bytes.
 v:=public.mutate_media_upload(actor,sid,NULL,'create',jsonb_build_object('teamId',NULL,'folderId',NULL,'filename','fixture.png','mime','image/png','bytes',100,'sha256',repeat('a',64),'key','quarantine/'||gen_random_uuid()||'/'||gen_random_uuid()),repeat('1',64),repeat('2',64),gen_random_uuid());u:=(v->>'uploadId')::uuid;file_id:=(v->>'fileId')::uuid;
 PERFORM public.mutate_media_upload(actor,sid,u,'complete','{}',repeat('3',64),repeat('2',64),gen_random_uuid());
 SELECT * INTO j FROM public.claim_worker_jobs(100,ARRAY['media_upload_scan']) WHERE payload->>'uploadId'=u::text;
 PERFORM public.reserve_media_scan_object(j.id,j.lease_token);
 PERFORM public.finish_media_upload_scan(j.id,j.lease_token,'clean/'||u||'/'||j.lease_token,'image/png',80,repeat('b',64),'{"width":10,"height":10}',NULL);
 UPDATE public.media_files SET alt_text='Fictional workshop diagram' WHERE id=file_id;
 v:=public.mutate_media_publication(actor,sid,file_id,3,'publish','test-only',repeat('4',64),repeat('2',64),gen_random_uuid());publication:=(v->>'publicationId')::uuid;
 SELECT * INTO j FROM public.claim_worker_jobs(100,ARRAY['media_publish']) WHERE payload->>'publicationId'=publication::text;
 PERFORM public.prepare_media_publication(j.id,j.lease_token);
 SELECT jsonb_agg(jsonb_build_object('widthKey',w,'width',10,'height',10,'bytes',80,'sha256',repeat('c',64))) INTO variants FROM unnest(ARRAY[360,960,1920]) w;
 IF NOT public.finish_media_publication(j.id,j.lease_token,variants,NULL) THEN RAISE EXCEPTION 'Fixture publication failed';END IF;
 definition:=jsonb_build_object('title','Fictional form images','description','',
  'fields',jsonb_build_array(jsonb_build_object('id',field_id,'type','image','imageMediaId',file_id,'label','Fictional workshop diagram')),
  'sections','[]'::jsonb,'settings',jsonb_build_object('access','public','opensAt','','closesAt','','limit',0,'headerMedia','/api/v1/media/public/'||file_id,'headerAlt','Fictional workshop header'));
 BEGIN PERFORM public.mutate_form(NULL,NULL,'create',NULL,jsonb_build_object('definition',definition,'slug','fictional-form-images'),NULL,gen_random_uuid());RAISE EXCEPTION 'Anonymous actor accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'FORBIDDEN' THEN RAISE;END IF;END;
 BEGIN PERFORM public.mutate_form(actor,NULL,'create',NULL,jsonb_build_object('definition',jsonb_set(definition,'{fields,0,imageMediaId}',to_jsonb(gen_random_uuid()::text)),'slug','fictional-form-images'),NULL,gen_random_uuid());RAISE EXCEPTION 'Unpublished image accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'FORM_IMAGE_UNAVAILABLE' THEN RAISE;END IF;END;
 v:=public.mutate_form(actor,NULL,'create',NULL,jsonb_build_object('definition',definition,'slug','fictional-form-images'),NULL,gen_random_uuid());form_id:=(v->>'id')::uuid;rev:=(v->>'draft_revision')::integer;
 IF NOT gdg_security.media_in_use(file_id) THEN RAISE EXCEPTION 'Draft image not protected';END IF;
 BEGIN PERFORM public.mutate_form(actor,form_id,'publish',rev,jsonb_build_object('definition',jsonb_set(definition,'{settings,headerAlt}','""')),repeat('d',64),gen_random_uuid());RAISE EXCEPTION 'Missing header alt accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'FORM_IMAGE_REQUIRED' THEN RAISE;END IF;END;
 v:=public.mutate_form(actor,form_id,'publish',rev,jsonb_build_object('definition',definition),repeat('d',64),gen_random_uuid());rev:=(v->>'draft_revision')::integer;
 definition:=jsonb_set(jsonb_set(definition,'{fields}','[]'),'{settings,headerMedia}','""');
 PERFORM public.mutate_form(actor,form_id,'draft',rev,jsonb_build_object('definition',definition),NULL,gen_random_uuid());
 IF NOT gdg_security.media_in_use(file_id) THEN RAISE EXCEPTION 'Historical published image not protected after draft edit';END IF;
 PERFORM public.mutate_media_publication(actor,sid,file_id,(SELECT revision FROM public.media_files WHERE id=file_id),'revoke','test-only',repeat('5',64),repeat('2',64),gen_random_uuid());
 IF public.read_public_media_asset(file_id,960,false) IS NOT NULL THEN RAISE EXCEPTION 'Privacy revocation blocked by form use';END IF;
 BEGIN PERFORM public.mutate_media_files(actor,sid,'archive',jsonb_build_array(jsonb_build_object('id',file_id,'revision',(SELECT revision FROM public.media_files WHERE id=file_id))),'{}',repeat('6',64),repeat('2',64),gen_random_uuid());RAISE EXCEPTION 'Historical image reference erased';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'MEDIA_IN_USE' THEN RAISE;END IF;END;
END $$;
ROLLBACK;
