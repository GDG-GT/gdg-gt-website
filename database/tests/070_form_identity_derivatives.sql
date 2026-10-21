BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES('f7000000-0000-4000-8000-000000000001','derivative-fixture@example.test','test-only','admin',true);
DO $$ DECLARE actor uuid:='f7000000-0000-4000-8000-000000000001';fid uuid;vid uuid;rid uuid;access_id uuid;file_id uuid;d jsonb;v jsonb;BEGIN
 d:='{"title":"Derivative privacy fixture","description":"Fictional","fields":[],"settings":{"access":"public","limit":0,"opensAt":"","closesAt":"","resume":false,"editing":false}}';
 v:=public.mutate_form(actor,NULL,'create',NULL,jsonb_build_object('slug','derivative-privacy-fixture','definition',d),NULL,gen_random_uuid());fid:=(v->>'id')::uuid;
 v:=public.mutate_form(actor,fid,'publish',1,jsonb_build_object('definition',d),repeat('a',64),gen_random_uuid());vid:=(v->>'published_version_id')::uuid;
 INSERT INTO public.form_access_tokens(form_id,token_type,token_hash,intended_email_encrypted,email_hash,expires_at) VALUES(fid,'verified',repeat('b',64),'encrypted-fixture-person',repeat('c',64),now()+interval '1 day') RETURNING id INTO access_id;
 INSERT INTO public.form_responses(form_id,version_id,idempotency_key_hash,request_hash,access_token_id,identity_hash) VALUES(fid,vid,repeat('d',64),repeat('e',64),access_id,repeat('c',64)) RETURNING id INTO rid;
 INSERT INTO public.form_response_deliveries(form_id,response_id,version_id,policy_revision,purpose,recipient_key,recipient_admin,recipient_encrypted,response_revision) VALUES(fid,rid,vid,1,'receipt','respondent',actor,'encrypted-fixture-person',0);
 INSERT INTO public.delivery_jobs(kind,deduplication_key,payload,secret_payload) VALUES('form_access','derivative-fixture-access',jsonb_build_object('tokenId',access_id),'encrypted-fixture-person-and-token');
 INSERT INTO public.upload_intents(purpose,form_id,version_id,field_id,proof_hash,bucket,quarantine_key,filename,declared_mime,expected_bytes,expected_sha256)
 VALUES('form',fid,vid,gen_random_uuid(),repeat('1',64),'form-uploads','quarantine/derivative-fixture','private-person-name.txt','text/plain',10,repeat('2',64)) RETURNING id INTO file_id;
 INSERT INTO public.form_uploads(id,form_id,version_id,field_id,response_id,private_object_key,original_filename,byte_size,upload_token_hash)
 VALUES(file_id,fid,vid,gen_random_uuid(),rid,'quarantine/derivative-fixture','private-person-name.txt',10,repeat('1',64));
 IF public.finish_form_upload_cleanup(file_id) THEN RAISE EXCEPTION 'A live upload accepted a deletion acknowledgement';END IF;
 PERFORM public.mutate_form_response(actor,fid,rid,'redact',gen_random_uuid());
 IF EXISTS(SELECT 1 FROM public.form_response_deliveries WHERE response_id=rid AND(recipient_admin IS NOT NULL OR recipient_encrypted IS NOT NULL))
  OR EXISTS(SELECT 1 FROM public.delivery_jobs WHERE deduplication_key='derivative-fixture-access' AND secret_payload IS NOT NULL)
  OR EXISTS(SELECT 1 FROM public.form_access_tokens WHERE id=access_id AND(intended_email_encrypted IS NOT NULL OR email_hash IS NOT NULL OR revoked_at IS NULL)) THEN RAISE EXCEPTION 'Response derivative identity survived redaction';END IF;
 -- Only the isolated SQL acknowledgement is simulated here; real object
 -- deletion is covered by the local storage/worker harness.
 IF NOT public.finish_form_upload_cleanup(file_id) THEN RAISE EXCEPTION 'Deletion acknowledgement rejected';END IF;
 IF EXISTS(SELECT 1 FROM public.form_uploads WHERE id=file_id AND original_filename='private-person-name.txt') OR EXISTS(SELECT 1 FROM public.upload_intents WHERE id=file_id AND filename='private-person-name.txt') THEN RAISE EXCEPTION 'Original filename retained after physical purge';END IF;
 IF has_function_privilege('anon','public.finish_form_upload_cleanup(uuid)','EXECUTE') THEN RAISE EXCEPTION 'Anonymous cleanup grant';END IF;
END $$;
ROLLBACK;
