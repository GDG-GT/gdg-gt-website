BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES
 ('f6600000-0000-4000-8000-000000000001','privacy-admin@example.test','test-only','admin',true),
 ('f6600000-0000-4000-8000-000000000002','privacy-member@example.test','test-only','team_member',true);
INSERT INTO public.admin_sessions(id,admin_user_id,token_hash) VALUES
 ('f6600000-0000-4000-8000-000000000003','f6600000-0000-4000-8000-000000000001',repeat('6',64)),
 ('f6600000-0000-4000-8000-000000000004','f6600000-0000-4000-8000-000000000002',repeat('7',64));
DO $$ DECLARE actor uuid:='f6600000-0000-4000-8000-000000000001';sid uuid:='f6600000-0000-4000-8000-000000000003';
 member uuid:='f6600000-0000-4000-8000-000000000002';msid uuid:='f6600000-0000-4000-8000-000000000004';
 fid uuid;vid uuid;rid uuid;v jsonb;d jsonb;p jsonb;doc jsonb;BEGIN
 IF has_function_privilege('anon','public.expire_form_responses(integer)','EXECUTE') OR has_table_privilege('authenticated','public.form_response_holds','SELECT') THEN RAISE EXCEPTION 'Browser privacy worker access';END IF;
 d:='{"title":"Retention fixture","description":"Fictional","fields":[{"id":"f6600000-0000-4000-8000-000000000010","type":"short","label":"Name","sensitive":true}],"settings":{"access":"public","retentionDays":1,"resume":true,"editing":true,"limit":0,"opensAt":"","closesAt":""}}';
 v:=public.mutate_form(actor,NULL,'create',NULL,jsonb_build_object('slug','retention-hold-fixture','definition',d),NULL,gen_random_uuid());fid:=(v->>'id')::uuid;
 v:=public.mutate_form(actor,fid,'publish',1,jsonb_build_object('definition',d),repeat('a',64),gen_random_uuid());vid:=(v->>'published_version_id')::uuid;
 v:=public.submit_form_response(fid,vid,repeat('a',64),'{"f6600000-0000-4000-8000-000000000010":"Original retained answer"}',repeat('1',64),repeat('2',64),NULL,NULL,NULL,NULL,NULL,NULL,NULL);rid:=(v->>'responseId')::uuid;
 IF NOT EXISTS(SELECT 1 FROM public.form_responses WHERE id=rid AND retention_expires_at=submitted_at+interval '1 day') THEN RAISE EXCEPTION 'Original version retention not frozen';END IF;
 p:=public.read_form_privacy(actor,sid,fid,rid);
 IF p->>'held'<>'false' OR p->>'responseHeld'<>'false' OR p::text LIKE '%Original retained answer%' THEN RAISE EXCEPTION 'Privacy read exposed answers/incorrect default';END IF;
 doc:=jsonb_build_object('held',true,'reason','Fictional operational review','draftDays',3,'confirmation','HOLD '||fid);
 BEGIN
  PERFORM public.review_form_privacy(actor,sid,'wrong',fid,NULL,0,doc,repeat('3',64),repeat('4',64),gen_random_uuid());
  RAISE EXCEPTION 'Wrong password proof accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 PERFORM public.review_form_privacy(actor,sid,'test-only',fid,NULL,0,doc,repeat('3',64),repeat('4',64),gen_random_uuid());
 PERFORM public.review_form_privacy(actor,sid,'test-only',fid,NULL,0,doc,repeat('3',64),repeat('4',64),gen_random_uuid());
 IF public.read_form_privacy(actor,sid,fid)->>'revision'<>'1' THEN RAISE EXCEPTION 'Privacy review retry not idempotent';END IF;
 UPDATE public.forms SET settings=settings-'hold' WHERE id=fid;
 IF NOT gdg_security.form_held(fid) THEN RAISE EXCEPTION 'Definition update cleared independent operational hold';END IF;
 BEGIN
  PERFORM public.mutate_form_response(actor,fid,rid,'redact',gen_random_uuid());
  RAISE EXCEPTION 'Held response redacted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'RETENTION_HOLD' THEN RAISE;END IF;END;
 UPDATE public.form_responses SET retention_expires_at=now()-interval '1 minute' WHERE id=rid;
 IF public.expire_form_responses(500)->>'responsesExpired'<>'0' THEN RAISE EXCEPTION 'Held response expired';END IF;
 INSERT INTO public.form_collaborators(form_id,admin_user_id,actions,created_by) VALUES(fid,member,ARRAY['view','delete','view_responses'],actor);
 BEGIN
  PERFORM public.review_form_privacy(member,msid,'test-only',fid,NULL,1,doc||'{"held":false}',repeat('5',64),repeat('6',64),gen_random_uuid());
  RAISE EXCEPTION 'Ordinary collaborator released form hold';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM public.review_form_privacy(actor,sid,'test-only',fid,NULL,1,doc||'{"held":false}',repeat('5',64),repeat('6',64),gen_random_uuid());
 doc:=jsonb_build_object('held',true,'reason','Fictional response review','confirmation','HOLD '||rid);
 PERFORM public.review_form_privacy(member,msid,'test-only',fid,rid,0,doc,repeat('7',64),repeat('8',64),gen_random_uuid());
 IF public.read_form_privacy(actor,sid,fid,rid)->>'effectiveResponseHold'<>'true' OR public.expire_form_responses(500)->>'responsesExpired'<>'0' THEN RAISE EXCEPTION 'Individual response hold ignored';END IF;
 BEGIN
  PERFORM public.mutate_form_response(actor,fid,rid,'delete',gen_random_uuid());
  RAISE EXCEPTION 'Individual hold deletion bypassed';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'RETENTION_HOLD' THEN RAISE;END IF;END;
 BEGIN
  PERFORM public.review_form_privacy(member,msid,'test-only',fid,rid,1,doc||'{"held":false}',repeat('9',64),repeat('0',64),gen_random_uuid());
  RAISE EXCEPTION 'Ordinary collaborator released response hold';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM public.review_form_privacy(actor,sid,'test-only',fid,rid,1,doc||'{"held":false}',repeat('9',64),repeat('0',64),gen_random_uuid());
 PERFORM public.save_form_draft(fid,vid,repeat('b',64),'{}',NULL,NULL);
 IF NOT EXISTS(SELECT 1 FROM public.form_response_drafts WHERE form_id=fid AND expires_at=created_at+interval '3 days') THEN RAISE EXCEPTION 'Configured draft lifetime ignored';END IF;
 INSERT INTO public.form_response_revisions(response_id,revision,answers,editor_type) VALUES(rid,1,'{"old":"Old retained answer"}','respondent');
 IF public.expire_form_responses(500)->>'responsesExpired'<>'1' THEN RAISE EXCEPTION 'Released overdue response not expired';END IF;
 IF EXISTS(SELECT 1 FROM public.form_answers WHERE response_id=rid) OR EXISTS(SELECT 1 FROM public.form_response_revisions WHERE response_id=rid)
  OR NOT EXISTS(SELECT 1 FROM public.form_responses WHERE id=rid AND deleted_at IS NOT NULL AND retention_deleted_at IS NOT NULL AND edit_secret_encrypted IS NULL) THEN RAISE EXCEPTION 'Retention failed to erase protected content';END IF;
 IF public.expire_form_responses(500)->>'responsesExpired'<>'0' THEN RAISE EXCEPTION 'Retention repeated deletion';END IF;
 IF EXISTS(SELECT 1 FROM public.admin_actions WHERE target_id IN(fid,rid) AND(metadata::text LIKE '%operational review%' OR metadata::text LIKE '%retained answer%')) THEN RAISE EXCEPTION 'Privacy audit contains private content';END IF;
END $$;
ROLLBACK;
