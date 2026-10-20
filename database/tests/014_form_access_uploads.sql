BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES
 ('b0000000-0000-4000-8000-000000000001','access-admin@example.test','test-only','admin',true),
 ('b0000000-0000-4000-8000-000000000002','access-outsider@example.test','test-only','team_member',true);
DO $$ DECLARE f uuid;v uuid;result jsonb;recipient jsonb;t uuid;u uuid;j public.delivery_jobs;draft uuid;BEGIN
 INSERT INTO public.forms(slug,title,owner_id,state,access_mode,draft_definition,settings)
 VALUES('sql-access-uploads','SQL access uploads','b0000000-0000-4000-8000-000000000001','Open','invited','{}','{"access":"invited","resume":true}') RETURNING id INTO f;
 INSERT INTO public.form_versions(form_id,version,definition,schema_hash,published_by)
 VALUES(f,1,'{"fields":[{"id":"b0000000-0000-4000-8000-000000000003","type":"file","maxFiles":1}]}',repeat('a',64),'b0000000-0000-4000-8000-000000000001') RETURNING id INTO v;
 UPDATE public.forms SET published_version_id=v WHERE id=f;
 recipient:=jsonb_build_array(jsonb_build_object('emailHash',repeat('1',64),'tokenHash',repeat('2',64),'emailEncrypted','ciphertext-only','secretEncrypted','encrypted-token','expiresAt',now()+interval '7 days'));
 BEGIN
  PERFORM public.queue_form_access('b0000000-0000-4000-8000-000000000002',f,'invited',recipient,repeat('3',64),repeat('4',64),gen_random_uuid());
  RAISE EXCEPTION 'Outsider issued a private invitation';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 result:=public.queue_form_access('b0000000-0000-4000-8000-000000000001',f,'invited',recipient,repeat('3',64),repeat('4',64),gen_random_uuid());
 t:=(result->'tokenIds'->>0)::uuid;
 IF result->>'queued'<>'1' OR public.queue_form_access('b0000000-0000-4000-8000-000000000001',f,'invited',recipient,repeat('3',64),repeat('4',64),gen_random_uuid())<>result THEN RAISE EXCEPTION 'Access idempotency failed';END IF;
 IF public.queue_form_access('b0000000-0000-4000-8000-000000000001',f,'invited',recipient,repeat('5',64),repeat('4',64),gen_random_uuid())->>'queued'<>'0' THEN RAISE EXCEPTION 'Recipient was queued twice';END IF;
 PERFORM public.change_form_access('b0000000-0000-4000-8000-000000000001',f,t,'resend',repeat('6',64),'new-encrypted-token',gen_random_uuid());
 IF (SELECT token_hash FROM public.form_access_tokens WHERE id=t)<>repeat('6',64) THEN RAISE EXCEPTION 'Resend did not rotate';END IF;
 BEGIN
  PERFORM public.change_form_access('b0000000-0000-4000-8000-000000000001',f,t,'resend',repeat('7',64),'new-encrypted-token',gen_random_uuid());
  RAISE EXCEPTION 'Resend cooldown bypassed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'RESEND_COOLDOWN' THEN RAISE;END IF;END;
 UPDATE public.forms SET access_mode='public',settings='{"access":"public","resume":true}' WHERE id=f;
 u:=public.create_form_upload(f,v,'b0000000-0000-4000-8000-000000000003',repeat('8',64),jsonb_build_object('key','quarantine/sql-fixture','filename','fictional.txt','mime','text/plain','bytes',20,'sha256',repeat('9',64)));
 BEGIN
  PERFORM public.create_form_upload(f,v,'b0000000-0000-4000-8000-000000000003',repeat('8',64),jsonb_build_object('key','quarantine/second-fixture','filename','fictional.txt','mime','text/plain','bytes',20,'sha256',repeat('9',64)));
  RAISE EXCEPTION 'Field file quota exceeded';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'UPLOAD_QUOTA' THEN RAISE;END IF;END;
 PERFORM public.queue_upload_scan(u,repeat('8',64));PERFORM public.queue_upload_scan(u,repeat('8',64));
 IF (SELECT count(*) FROM public.delivery_jobs WHERE kind='upload_scan' AND payload->>'uploadId'=u::text)<>1 THEN RAISE EXCEPTION 'Scan queue duplicated';END IF;
 IF EXISTS(SELECT 1 FROM public.claim_delivery_jobs(100) WHERE kind='upload_scan') THEN RAISE EXCEPTION 'Mail worker claimed scan';END IF;
 SELECT * INTO j FROM public.claim_worker_jobs(100,ARRAY['upload_scan']) WHERE payload->>'uploadId'=u::text;
 IF j.id IS NULL THEN RAISE EXCEPTION 'Scan worker failed to claim';END IF;
 IF public.finish_upload_scan(j.id,gen_random_uuid(),'clean/stale','text/plain',20,repeat('a',64),NULL) THEN RAISE EXCEPTION 'Stale scan lease accepted';END IF;
 IF NOT public.finish_upload_scan(j.id,j.lease_token,'clean/sql-fixture','text/plain',20,repeat('a',64),NULL) THEN RAISE EXCEPTION 'Valid promotion failed';END IF;
 IF (SELECT scan_state FROM public.form_uploads WHERE id=u)<>'clean' THEN RAISE EXCEPTION 'Clean state missing';END IF;
 BEGIN
  PERFORM public.save_form_draft(f,v,repeat('b',64),jsonb_build_object('b0000000-0000-4000-8000-000000000003',jsonb_build_array(u)),NULL,NULL,repeat('c',64));
  RAISE EXCEPTION 'Draft saved an unowned upload';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVALID_UPLOAD' THEN RAISE;END IF;END;
 PERFORM public.save_form_draft(f,v,repeat('b',64),jsonb_build_object('b0000000-0000-4000-8000-000000000003',jsonb_build_array(u)),NULL,NULL,repeat('8',64));
 SELECT draft_id INTO draft FROM public.form_uploads WHERE id=u;
 IF draft IS NULL THEN RAISE EXCEPTION 'Saved file is not protected by its resume draft';END IF;
 UPDATE public.upload_intents SET created_at=now()-interval '2 days',expires_at=now()-interval '2 days' WHERE id=u;
 IF EXISTS(SELECT 1 FROM public.claim_upload_cleanup(100) WHERE id=u) THEN RAISE EXCEPTION 'Active resume file purged';END IF;
 UPDATE public.form_response_drafts SET expires_at=now()-interval '1 minute' WHERE id=draft;
 IF NOT EXISTS(SELECT 1 FROM public.claim_upload_cleanup(100) WHERE id=u AND deleted_at IS NOT NULL) THEN RAISE EXCEPTION 'Abandoned upload not selected';END IF;
 IF public.finish_upload_scan(j.id,j.lease_token,'clean/replay','text/plain',20,repeat('a',64),NULL) THEN RAISE EXCEPTION 'Completed scan replayed';END IF;
END $$;
DO $$ BEGIN
 IF has_table_privilege('anon','public.upload_intents','SELECT') OR has_table_privilege('authenticated','public.form_uploads','SELECT')
  OR has_function_privilege('anon','public.claim_worker_jobs(integer,text[])','EXECUTE')
  OR has_function_privilege('authenticated','public.queue_form_access(uuid,uuid,text,jsonb,text,text,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Upload or access low-privilege grant exposed';END IF;
END $$;
ROLLBACK;
