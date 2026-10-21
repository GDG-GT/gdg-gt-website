BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES
 ('f7200000-0000-4000-8000-000000000001','purge-super@example.test','test-only','super_admin',true),
 ('f7200000-0000-4000-8000-000000000002','purge-admin@example.test','test-only','admin',true);
INSERT INTO public.admin_sessions(id,admin_user_id,token_hash) VALUES
 ('f7200000-0000-4000-8000-000000000003','f7200000-0000-4000-8000-000000000001',repeat('1',64)),
 ('f7200000-0000-4000-8000-000000000004','f7200000-0000-4000-8000-000000000002',repeat('2',64)),
 ('f7200000-0000-4000-8000-000000000005','f7200000-0000-4000-8000-000000000001',repeat('3',64));
DO $$ DECLARE actor uuid:='f7200000-0000-4000-8000-000000000001';sid uuid:='f7200000-0000-4000-8000-000000000003';
 admin uuid:='f7200000-0000-4000-8000-000000000002';asid uuid:='f7200000-0000-4000-8000-000000000004';sid2 uuid:='f7200000-0000-4000-8000-000000000005';
 fid uuid;vid uuid;rid uuid;eid uuid;aid uuid;did uuid;fileid uuid;jid uuid;lease uuid:=gen_random_uuid();d jsonb;v jsonb;review jsonb;doc jsonb;revision integer;BEGIN
 IF has_table_privilege('authenticated','public.form_deletion_reviews','SELECT') OR has_function_privilege('anon','public.permanently_delete_form(uuid,uuid,text,uuid,integer,uuid,text,text,boolean,text,text,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Browser purge authority';END IF;
 d:='{"title":"Erase definition fixture","description":"Erase private description","fields":[{"id":"f7200000-0000-4000-8000-000000000010","type":"short","label":"Erase private question","sensitive":true}],"settings":{"access":"public","limit":0,"retentionDays":1,"opensAt":"","closesAt":"","resume":true,"editing":false}}';
 v:=public.mutate_form(actor,NULL,'create',NULL,jsonb_build_object('slug','permanent-delete-fixture','definition',d),NULL,gen_random_uuid());fid:=(v->>'id')::uuid;
 v:=public.mutate_form(actor,fid,'publish',1,jsonb_build_object('definition',d),repeat('a',64),gen_random_uuid());vid:=(v->>'published_version_id')::uuid;revision:=(v->>'draft_revision')::integer;
 BEGIN PERFORM public.read_form_deletion(admin,asid,fid);RAISE EXCEPTION 'Ordinary Admin can review purge';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 BEGIN PERFORM public.review_form_deletion(actor,sid,fid,revision,repeat('b',64),gen_random_uuid());RAISE EXCEPTION 'Unarchived form reviewed';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'FORM_DELETION_BLOCKED' THEN RAISE;END IF;END;
 BEGIN UPDATE public.form_versions SET definition='{}' WHERE id=vid;RAISE EXCEPTION 'Published definition mutable without purge certificate';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 v:=public.mutate_event(actor,NULL,'create',NULL,jsonb_build_object('title','Purge reference fixture','slug','purge-reference-fixture','description','Fixture','start_at',now()+interval '1 day','location','Fixture'),gen_random_uuid());eid:=(v->>'id')::uuid;
 doc:=jsonb_build_object('formId',fid,'versionPolicy','latest_published','label','Fictional source link');
 PERFORM public.mutate_form_integration(actor,sid,'event',eid,'primary',0,doc,repeat('1',64),repeat('2',64),gen_random_uuid());
 INSERT INTO public.form_access_tokens(form_id,token_type,token_hash,intended_email_encrypted,email_hash,expires_at) VALUES(fid,'verified',repeat('c',64),'erase-email-cipher',repeat('d',64),now()+interval '1 day') RETURNING id INTO aid;
 INSERT INTO public.form_responses(form_id,version_id,idempotency_key_hash,request_hash,access_token_id,identity_hash) VALUES(fid,vid,repeat('e',64),repeat('f',64),aid,repeat('d',64)) RETURNING id INTO rid;
 INSERT INTO public.form_answers(response_id,field_id,value) VALUES(rid,'f7200000-0000-4000-8000-000000000010','"Erase private answer"');
 INSERT INTO public.form_response_revisions(response_id,revision,answers,editor_type) VALUES(rid,1,'{"fixture":"Erase historical answer"}','respondent');
 v:=public.mutate_form(actor,fid,'archive',revision,'{}',NULL,gen_random_uuid());revision:=(v->>'draft_revision')::integer;
 IF public.read_form_deletion(actor,sid,fid)->>'activeReferences'<>'1' THEN RAISE EXCEPTION 'Active reference not counted';END IF;
 BEGIN PERFORM public.review_form_deletion(actor,sid,fid,revision,repeat('b',64),gen_random_uuid());RAISE EXCEPTION 'Active reference/retention bypass';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'FORM_DELETION_BLOCKED' THEN RAISE;END IF;END;
 PERFORM public.mutate_form_integration(actor,sid,'event',eid,'primary',1,NULL,repeat('3',64),repeat('4',64),gen_random_uuid());
 BEGIN PERFORM public.review_form_deletion(actor,sid,fid,revision,repeat('b',64),gen_random_uuid());RAISE EXCEPTION 'Unexpired response purged';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'FORM_DELETION_BLOCKED' THEN RAISE;END IF;END;
 UPDATE public.form_responses SET retention_expires_at=now()-interval '1 minute' WHERE id=rid;
 INSERT INTO public.form_response_holds(response_id,form_id,held,reason,updated_by) VALUES(rid,fid,true,'Fictional hold reason',actor);
 BEGIN PERFORM public.review_form_deletion(actor,sid,fid,revision,repeat('b',64),gen_random_uuid());RAISE EXCEPTION 'Held response purged';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'FORM_DELETION_BLOCKED' THEN RAISE;END IF;END;
 UPDATE public.form_response_holds SET held=false WHERE response_id=rid;
 INSERT INTO public.form_response_drafts(form_id,version_id,resume_token_hash,answers,expires_at) VALUES(fid,vid,repeat('8',64),'{"fixture":"Erase incomplete answer"}',now()+interval '1 day') RETURNING id INTO did;
 INSERT INTO public.upload_intents(purpose,form_id,version_id,field_id,proof_hash,bucket,quarantine_key,filename,declared_mime,expected_bytes,expected_sha256)
 VALUES('form',fid,vid,gen_random_uuid(),repeat('1',64),'form-uploads','quarantine/purge-fixture','erase-private-name.txt','text/plain',10,repeat('2',64)) RETURNING id INTO fileid;
 INSERT INTO public.form_uploads(id,form_id,version_id,field_id,draft_id,private_object_key,original_filename,byte_size,upload_token_hash)
 VALUES(fileid,fid,vid,gen_random_uuid(),did,'quarantine/purge-fixture','erase-private-name.txt',10,repeat('1',64));
 INSERT INTO public.form_export_jobs(form_id,requester_id,session_id,format,filters,expires_at) VALUES(fid,actor,sid,'csv','{"q":"Erase private query"}',now()+interval '1 day') RETURNING id INTO jid;
 INSERT INTO public.form_export_artifacts(job_id,lease_token,object_key) VALUES(jid,lease,'exports/purge-fixture.csv');
 INSERT INTO public.form_export_items(job_id,ordinal,response_id,fingerprint) VALUES(jid,1,rid,repeat('1',64));
 INSERT INTO public.delivery_jobs(kind,deduplication_key,payload,secret_payload) VALUES('form_access','purge-fixture-mail',jsonb_build_object('formId',fid,'tokenId',aid),'Erase private encrypted delivery');
 INSERT INTO public.form_saved_views(form_id,owner_id,name,filters) VALUES(fid,actor,'Erase private view','{"q":"Erase private query"}');
 review:=public.review_form_deletion(actor,sid,fid,revision,repeat('b',64),gen_random_uuid());
 BEGIN PERFORM public.permanently_delete_form(actor,sid,'wrong',fid,revision,(review->>'reviewId')::uuid,repeat('b',64),'DELETE FORM '||fid,true,repeat('5',64),repeat('6',64),gen_random_uuid());RAISE EXCEPTION 'Wrong current password proof accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 BEGIN PERFORM public.permanently_delete_form(actor,sid2,'test-only',fid,revision,(review->>'reviewId')::uuid,repeat('b',64),'DELETE FORM '||fid,true,repeat('5',64),repeat('6',64),gen_random_uuid());RAISE EXCEPTION 'Cross-session review accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'FORM_DELETION_REVIEW' THEN RAISE;END IF;END;
 BEGIN PERFORM public.permanently_delete_form(actor,sid,'test-only',fid,revision,(review->>'reviewId')::uuid,repeat('b',64),'DELETE FORM '||fid,false,repeat('5',64),repeat('6',64),gen_random_uuid());RAISE EXCEPTION 'Export warning skipped';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'VALIDATION_ERROR' THEN RAISE;END IF;END;
 UPDATE public.form_response_holds SET held=true WHERE response_id=rid;
 BEGIN PERFORM public.permanently_delete_form(actor,sid,'test-only',fid,revision,(review->>'reviewId')::uuid,repeat('b',64),'DELETE FORM '||fid,true,repeat('5',64),repeat('6',64),gen_random_uuid());RAISE EXCEPTION 'Stale reviewed hold state accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CONFLICT' THEN RAISE;END IF;END;
 UPDATE public.form_response_holds SET held=false WHERE response_id=rid;
 v:=public.permanently_delete_form(actor,sid,'test-only',fid,revision,(review->>'reviewId')::uuid,repeat('b',64),'DELETE FORM '||fid,true,repeat('5',64),repeat('6',64),gen_random_uuid());
 IF v->>'deleted'<>'true' OR v->>'filesAwaitingCleanup'<>'1' OR v->>'exportsAwaitingCleanup'<>'1' THEN RAISE EXCEPTION 'Purge result misrepresents pending physical cleanup';END IF;
 v:=public.permanently_delete_form(actor,sid,'test-only',fid,revision,(review->>'reviewId')::uuid,repeat('b',64),'DELETE FORM '||fid,true,repeat('5',64),repeat('6',64),gen_random_uuid());
 IF v->>'deleted'<>'true' OR(SELECT count(*) FROM public.admin_actions WHERE action='forms.permanently_deleted' AND target_id=fid)<>1 THEN RAISE EXCEPTION 'Purge retry repeated erasure/audit';END IF;
 IF public.can_operate_form(actor,fid,'view') OR public.can_operate_form(admin,fid,'edit') THEN RAISE EXCEPTION 'Purged form retains admin access';END IF;
 IF EXISTS(SELECT 1 FROM public.forms WHERE id=fid AND(title<>'[Deleted form]' OR description<>'' OR draft_definition<>'{}' OR published_version_id IS NOT NULL OR permanently_deleted_at IS NULL))
  OR EXISTS(SELECT 1 FROM public.form_versions WHERE form_id=fid AND definition<>'{}') OR EXISTS(SELECT 1 FROM public.form_answers WHERE response_id=rid)
  OR EXISTS(SELECT 1 FROM public.form_response_revisions WHERE response_id=rid) OR EXISTS(SELECT 1 FROM public.form_response_drafts WHERE form_id=fid)
  OR EXISTS(SELECT 1 FROM public.form_saved_views WHERE form_id=fid) THEN RAISE EXCEPTION 'Private form content survived purge';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.form_versions WHERE id=vid AND schema_hash=repeat('a',64)) OR NOT EXISTS(SELECT 1 FROM public.form_responses WHERE id=rid AND deleted_at IS NOT NULL AND identity_hash IS NULL AND access_token_id IS NULL)
  OR NOT EXISTS(SELECT 1 FROM public.upload_intents WHERE id=fileid AND deleted_at IS NOT NULL AND purged_at IS NULL)
  OR NOT EXISTS(SELECT 1 FROM public.form_export_jobs WHERE id=jid AND state='cancelled' AND filters='{}' AND lease_token IS NULL)
  OR EXISTS(SELECT 1 FROM public.delivery_jobs WHERE deduplication_key='purge-fixture-mail' AND(secret_payload IS NOT NULL OR state<>'completed')) THEN RAISE EXCEPTION 'Tombstone/cleanup fencing wrong';END IF;
 BEGIN UPDATE public.forms SET permanently_deleted_at=NULL,state='Draft' WHERE id=fid;RAISE EXCEPTION 'Purged form restored';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 BEGIN UPDATE public.form_versions SET definition=d WHERE id=vid;RAISE EXCEPTION 'Purged version restored';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN UPDATE public.form_versions SET schema_hash=repeat('b',64) WHERE id=vid;RAISE EXCEPTION 'Purge certificate allowed audit tampering';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 UPDATE public.admin_sessions SET revoked_at=now() WHERE id=sid;
 BEGIN PERFORM public.permanently_delete_form(actor,sid,'test-only',fid,revision,(review->>'reviewId')::uuid,repeat('b',64),'DELETE FORM '||fid,true,repeat('5',64),repeat('6',64),gen_random_uuid());RAISE EXCEPTION 'Revoked session replayed purge';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 IF EXISTS(SELECT 1 FROM public.admin_actions WHERE target_id=fid AND metadata::text LIKE '%Erase private%') THEN RAISE EXCEPTION 'Purge audit contains personal content';END IF;
END $$;
ROLLBACK;
