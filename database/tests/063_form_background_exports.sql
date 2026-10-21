BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES
 ('f6300000-0000-4000-8000-000000000001','export-admin@example.test','test-only','admin',true),
 ('f6300000-0000-4000-8000-000000000002','export-editor@example.test','test-only','blog_editor',true);
INSERT INTO public.admin_sessions(id,admin_user_id,token_hash) VALUES
 ('f6300000-0000-4000-8000-000000000003','f6300000-0000-4000-8000-000000000001',repeat('6',64)),
 ('f6300000-0000-4000-8000-000000000004','f6300000-0000-4000-8000-000000000002',repeat('7',64));
INSERT INTO public.forms(id,slug,title,owner_id,state,draft_definition,settings) VALUES
 ('f6300000-0000-4000-8000-000000000005','background-export-fixture','Export SQL fixture','f6300000-0000-4000-8000-000000000001','Closed','{}','{}');
INSERT INTO public.form_versions(id,form_id,version,definition,schema_hash,published_by) VALUES
 ('f6300000-0000-4000-8000-000000000006','f6300000-0000-4000-8000-000000000005',1,
 '{"fields":[{"id":"f6300000-0000-4000-8000-000000000008","label":"Old label","sensitive":false},{"id":"f6300000-0000-4000-8000-000000000009","label":"Secret field","sensitive":true}]}',repeat('a',64),'f6300000-0000-4000-8000-000000000001');
INSERT INTO public.form_responses(id,form_id,version_id,idempotency_key_hash,request_hash) VALUES
 ('f6300000-0000-4000-8000-000000000007','f6300000-0000-4000-8000-000000000005','f6300000-0000-4000-8000-000000000006',repeat('b',64),repeat('c',64));
INSERT INTO public.form_answers(response_id,field_id,value) VALUES
 ('f6300000-0000-4000-8000-000000000007','f6300000-0000-4000-8000-000000000008','"=formula fixture"'),
 ('f6300000-0000-4000-8000-000000000007','f6300000-0000-4000-8000-000000000009','"Private fixture"');
DO $$ DECLARE actor uuid:='f6300000-0000-4000-8000-000000000001';sid uuid:='f6300000-0000-4000-8000-000000000003';fid uuid:='f6300000-0000-4000-8000-000000000005';jid uuid;j public.form_export_jobs;b jsonb;old_lease uuid;BEGIN
 IF has_table_privilege('anon','public.form_export_items','SELECT') OR has_function_privilege('authenticated','public.claim_form_exports(integer)','EXECUTE') THEN RAISE EXCEPTION 'Export browser grant leaked';END IF;
 BEGIN
  PERFORM public.create_form_export('f6300000-0000-4000-8000-000000000002','f6300000-0000-4000-8000-000000000004',fid,'{"format":"csv"}',repeat('1',64),repeat('2',64),gen_random_uuid());
  RAISE EXCEPTION 'Blog Editor exported';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 jid:=public.create_form_export(actor,sid,fid,'{"format":"csv"}',repeat('1',64),repeat('2',64),gen_random_uuid());
 IF jid<>public.create_form_export(actor,sid,fid,'{"format":"csv"}',repeat('1',64),repeat('2',64),gen_random_uuid()) THEN RAISE EXCEPTION 'Queue idempotency failed';END IF;
 BEGIN
  PERFORM public.create_form_export(actor,sid,fid,'{"format":"json"}',repeat('1',64),repeat('3',64),gen_random_uuid());
  RAISE EXCEPTION 'Queue changed-body replay';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CONFLICT' THEN RAISE;END IF;END;
 SELECT * INTO j FROM public.claim_form_exports(1);
 IF j.id<>jid OR j.attempt_count<>1 THEN RAISE EXCEPTION 'Worker did not claim exact job';END IF;
 b:=public.read_form_export_batch(jid,j.lease_token,0);
 IF b::text LIKE '%Private fixture%' OR b::text NOT LIKE '%Old label%' OR jsonb_array_length(b)<>1 THEN RAISE EXCEPTION 'Sensitive projection/version labels failed';END IF;
 IF EXISTS(SELECT 1 FROM public.claim_form_exports(1)) THEN RAISE EXCEPTION 'Live lease stolen';END IF;
 old_lease:=j.lease_token;
 UPDATE public.form_export_jobs SET locked_until=now()-interval '1 second' WHERE id=jid;
 SELECT * INTO j FROM public.claim_form_exports(1);
 IF public.finish_form_export(jid,old_lease,100,repeat('a',64),NULL) THEN RAISE EXCEPTION 'Old lease promoted';END IF;
 IF NOT public.finish_form_export(jid,j.lease_token,100,repeat('a',64),NULL) THEN RAISE EXCEPTION 'Current lease failed promotion';END IF;
 b:=public.form_export_download(actor,sid,fid,jid,gen_random_uuid());
 IF b->>'key' IS NULL THEN RAISE EXCEPTION 'Ready download unavailable';END IF;
 BEGIN
  PERFORM public.form_export_download(actor,'f6300000-0000-4000-8000-000000000004',fid,jid,gen_random_uuid());
  RAISE EXCEPTION 'Cross-session download allowed';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 UPDATE public.form_responses SET redacted_at=now(),status='redacted' WHERE id='f6300000-0000-4000-8000-000000000007';
 BEGIN
  PERFORM public.form_export_download(actor,sid,fid,jid,gen_random_uuid());
  RAISE EXCEPTION 'Stale redacted data downloadable';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'FORM_EXPORT_CHANGED' THEN RAISE;END IF;END;
 UPDATE public.form_responses SET redacted_at=NULL,status='complete' WHERE id='f6300000-0000-4000-8000-000000000007';
 PERFORM public.cancel_form_export(actor,sid,fid,jid,gen_random_uuid());
 IF(SELECT count(*) FROM public.claim_form_export_cleanup(25))<>2 THEN RAISE EXCEPTION 'Cancelled attempts not cleaned';END IF;
 jid:=public.create_form_export(actor,sid,fid,'{"format":"json","sensitive":true}',repeat('4',64),repeat('5',64),gen_random_uuid());
 SELECT * INTO j FROM public.claim_form_exports(1);
 IF public.read_form_export_batch(jid,j.lease_token,0)::text NOT LIKE '%Private fixture%' THEN RAISE EXCEPTION 'Authorized sensitive export failed';END IF;
 UPDATE public.admin_sessions SET revoked_at=now() WHERE id=sid;
 IF public.finish_form_export(jid,j.lease_token,100,repeat('a',64),NULL) THEN RAISE EXCEPTION 'Revoked requester export promoted';END IF;
 IF(SELECT state FROM public.form_export_jobs WHERE id=jid)<>'failed' THEN RAISE EXCEPTION 'Revoked requester export not failed';END IF;
 UPDATE public.admin_sessions SET revoked_at=NULL WHERE id=sid;
 jid:=public.create_form_export(actor,sid,fid,'{"format":"csv"}',repeat('6',64),repeat('7',64),gen_random_uuid());
 UPDATE public.form_export_jobs SET expires_at=now()-interval '1 second' WHERE id=jid;
 PERFORM public.claim_form_exports(1);
 IF(SELECT state FROM public.form_export_jobs WHERE id=jid)<>'expired' THEN RAISE EXCEPTION 'Expired export still active';END IF;
 IF EXISTS(SELECT 1 FROM public.admin_actions WHERE target_type='form_export' AND metadata::text LIKE '%Private fixture%') THEN RAISE EXCEPTION 'Answer value in export audit';END IF;
END $$;
ROLLBACK;
