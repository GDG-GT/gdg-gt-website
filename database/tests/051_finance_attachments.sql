BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES
 ('f1000000-0000-4000-8000-000000000001','finance-files-member@example.test','fixture-password','team_member',true),
 ('f1000000-0000-4000-8000-000000000002','finance-files-outsider@example.test','fixture-outsider','team_member',true);
DO $$ DECLARE a uuid:='f1000000-0000-4000-8000-000000000001';o uuid:='f1000000-0000-4000-8000-000000000002';s uuid;f uuid;u uuid;second uuid;j public.delivery_jobs;r jsonb;doc jsonb;BEGIN
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(a,repeat('1',64)) RETURNING id INTO s;
 r:=public.mutate_finance(a,s,NULL,NULL,'create',NULL,'{"record":{"transactionType":"expense","category":"Event Costs","amount":"1.01","currency":"USD","description":"Fictional attachment test","transactionDate":"2026-10-20"}}',repeat('1',64),repeat('1',64),gen_random_uuid());f:=(r->>'id')::uuid;
 doc:=jsonb_build_object('revision',1,'filename','fictional.pdf','mime','application/pdf','bytes',50,'sha256',repeat('a',64),'key','quarantine/'||gen_random_uuid()||'/'||gen_random_uuid());
 r:=public.mutate_finance_upload(a,s,f,NULL,'create',doc,repeat('2',64),repeat('2',64),gen_random_uuid());u:=(r->>'uploadId')::uuid;
 IF(public.mutate_finance_upload(a,s,f,NULL,'create',doc,repeat('2',64),repeat('2',64),gen_random_uuid())->>'uploadId')::uuid<>u THEN RAISE EXCEPTION 'Attachment intent retry duplicated';END IF;
 IF public.finance_attachment_list(a,f,1)::text LIKE '%quarantine/%' OR public.finance_attachment_list(a,f,1)::text LIKE '%sha256%' THEN RAISE EXCEPTION 'Attachment projection disclosed object keys or checksums';END IF;
 BEGIN PERFORM public.finance_attachment_list(o,f,1);RAISE EXCEPTION 'Outsider listed private attachments';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 BEGIN PERFORM public.finance_attachment_download(a,f,u,gen_random_uuid());RAISE EXCEPTION 'Unscanned file downloaded';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 PERFORM public.mutate_finance_upload(a,s,f,u,'complete','{}',repeat('3',64),repeat('3',64),gen_random_uuid());
 PERFORM public.mutate_finance_upload(a,s,f,u,'complete','{}',repeat('3',64),repeat('3',64),gen_random_uuid());
 IF(SELECT count(*) FROM public.delivery_jobs WHERE kind='upload_scan' AND payload->>'uploadId'=u::text)<>1 THEN RAISE EXCEPTION 'Upload completion duplicated scan jobs';END IF;
 SELECT * INTO j FROM public.claim_worker_jobs(1,ARRAY['upload_scan']);
 IF NOT public.finish_upload_scan(j.id,j.lease_token,'clean/'||u||'/'||gen_random_uuid(),'application/pdf',50,repeat('b',64),NULL) THEN RAISE EXCEPTION 'Current authorized scan did not promote';END IF;
 r:=public.finance_attachment_download(a,f,u,gen_random_uuid());IF r->>'filename'<>'fictional.pdf' OR r->>'key' NOT LIKE 'clean/%' THEN RAISE EXCEPTION 'Authorized clean download projection invalid';END IF;
 BEGIN UPDATE public.finance_attachments SET private_object_key='changed' WHERE id=u;RAISE EXCEPTION 'Clean financial receipt overwritten';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'FINANCE_IMMUTABLE' THEN RAISE;END IF;END;
 BEGIN DELETE FROM public.finance_attachments WHERE id=u;RAISE EXCEPTION 'Retained receipt deleted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'FINANCE_RETAINED' THEN RAISE;END IF;END;
 -- The worker must recheck parent revision and the uploader's current session.
 doc:=jsonb_set(doc,'{key}',to_jsonb('quarantine/'||gen_random_uuid()||'/'||gen_random_uuid()));
 r:=public.mutate_finance_upload(a,s,f,NULL,'create',doc,repeat('4',64),repeat('4',64),gen_random_uuid());second:=(r->>'uploadId')::uuid;
 PERFORM public.mutate_finance_upload(a,s,f,second,'complete','{}',repeat('5',64),repeat('5',64),gen_random_uuid());
 UPDATE public.finances SET revision=revision+1 WHERE id=f;
 SELECT * INTO j FROM public.claim_worker_jobs(1,ARRAY['upload_scan']);
 IF public.finish_upload_scan(j.id,j.lease_token,'clean/'||second||'/'||gen_random_uuid(),'application/pdf',50,repeat('b',64),NULL) THEN RAISE EXCEPTION 'Stale parent revision promoted a receipt';END IF;
 IF(SELECT scan_state FROM public.finance_attachments WHERE id=second)<>'rejected' THEN RAISE EXCEPTION 'Stale attachment not visibly rejected';END IF;
 doc:=jsonb_set(jsonb_set(doc,'{revision}','2'),'{key}',to_jsonb('quarantine/'||gen_random_uuid()||'/'||gen_random_uuid()));
 r:=public.mutate_finance_upload(a,s,f,NULL,'create',doc,repeat('6',64),repeat('6',64),gen_random_uuid());second:=(r->>'uploadId')::uuid;
 PERFORM public.mutate_finance_upload(a,s,f,second,'complete','{}',repeat('7',64),repeat('7',64),gen_random_uuid());
 UPDATE public.admin_sessions SET revoked_at=now() WHERE id=s;
 SELECT * INTO j FROM public.claim_worker_jobs(1,ARRAY['upload_scan']);
 IF public.finish_upload_scan(j.id,j.lease_token,'clean/'||second||'/'||gen_random_uuid(),'application/pdf',50,repeat('b',64),NULL) THEN RAISE EXCEPTION 'Revoked uploader session promoted a receipt';END IF;
 IF public.finance_state_counts(o,'{}')<>'{}'::jsonb OR(public.finance_state_counts(a,'{}')->>'draft')<>'1' THEN RAISE EXCEPTION 'Scoped financial chart counts leaked';END IF;
 IF has_function_privilege('anon','public.finance_attachment_list(uuid,uuid,integer)','EXECUTE') OR has_function_privilege('authenticated','public.finance_attachment_download(uuid,uuid,uuid,uuid)','EXECUTE') OR has_function_privilege('gdg_realtime','public.mutate_finance_upload(uuid,uuid,uuid,uuid,text,jsonb,text,text,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Browser financial file grants exist';END IF;
END $$;
ROLLBACK;
