BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,display_name,role,is_active) VALUES
 ('f6500000-0000-4000-8000-000000000001','delivery-admin@example.test','test-only','Delivery reviewer','admin',true),
 ('f6500000-0000-4000-8000-000000000002','delivery-other@example.test','test-only','Other reviewer','admin',true),
 ('f6500000-0000-4000-8000-000000000003','delivery-blog@example.test','test-only','Unrelated editor','blog_editor',true);
INSERT INTO public.admin_sessions(id,admin_user_id,token_hash) VALUES
 ('f6500000-0000-4000-8000-000000000004','f6500000-0000-4000-8000-000000000001',repeat('6',64));
DO $$ DECLARE actor uuid:='f6500000-0000-4000-8000-000000000001';sid uuid:='f6500000-0000-4000-8000-000000000004';
 target uuid:='f6500000-0000-4000-8000-000000000002';outsider uuid:='f6500000-0000-4000-8000-000000000003';
 fid uuid;vid uuid;rid uuid;v jsonb;definition jsonb;document jsonb;j public.delivery_jobs;prepared jsonb;key text:=repeat('1',64);BEGIN
 IF has_function_privilege('anon','public.prepare_form_reviewed_email(uuid,uuid)','EXECUTE') OR has_table_privilege('authenticated','public.form_response_deliveries','SELECT') THEN RAISE EXCEPTION 'Delivery browser access granted';END IF;
 definition:='{"title":"Reviewed delivery fixture","description":"Fictional","fields":[{"id":"f6500000-0000-4000-8000-000000000010","type":"short","label":"Original label","sensitive":false},{"id":"f6500000-0000-4000-8000-000000000011","type":"short","label":"Sensitive field","sensitive":true},{"id":"f6500000-0000-4000-8000-000000000012","type":"file","label":"Private file","sensitive":false}],"sections":[],"settings":{"access":"internal","receipts":true,"limit":0,"oneResponse":false,"opensAt":"","closesAt":"","resume":false,"editing":true}}';
 v:=public.mutate_form(actor,NULL,'create',NULL,jsonb_build_object('slug','reviewed-delivery-fixture','definition',definition),NULL,gen_random_uuid());fid:=(v->>'id')::uuid;
 document:=jsonb_build_object('receipts',true,'receiptAnswers',true,'notificationUsers',jsonb_build_array(target),'chapterInbox',true,'notificationAnswers',true,'confirmation','DELIVERY '||fid);
 BEGIN
  PERFORM public.mutate_form(actor,fid,'publish',1,jsonb_build_object('definition',definition),repeat('a',64),gen_random_uuid());
  RAISE EXCEPTION 'Unreviewed receipts published';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'FORM_DELIVERY_REVIEW_REQUIRED' THEN RAISE;END IF;END;
 BEGIN
  PERFORM public.review_form_delivery(actor,sid,'wrong',fid,1,0,definition,repeat('a',64),document,key,key,gen_random_uuid());
  RAISE EXCEPTION 'Wrong password proof accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 BEGIN
  PERFORM public.review_form_delivery(actor,sid,'test-only',fid,99,0,definition,repeat('a',64),document,key,key,gen_random_uuid());
  RAISE EXCEPTION 'Stale draft review accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CONFLICT' THEN RAISE;END IF;END;
 BEGIN
  PERFORM public.review_form_delivery(actor,sid,'test-only',fid,1,0,definition,repeat('a',64),document||jsonb_build_object('notificationUsers',jsonb_build_array(outsider)),key,key,gen_random_uuid());
  RAISE EXCEPTION 'Unrelated recipient approved';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVALID_STATE' THEN RAISE;END IF;END;
 PERFORM public.review_form_delivery(actor,sid,'test-only',fid,1,0,definition,repeat('a',64),document,key,key,gen_random_uuid());
 v:=public.review_form_delivery(actor,sid,'test-only',fid,1,0,definition,repeat('a',64),document,key,key,gen_random_uuid());
 IF v->>'revision'<>'1' OR NOT public.form_receipt_ready(fid,repeat('a',64)) OR public.form_receipt_ready(fid,repeat('b',64)) THEN RAISE EXCEPTION 'Review idempotency/hash binding failed';END IF;
 IF public.form_delivery_candidates(actor,fid)::text LIKE '%example.test%' THEN RAISE EXCEPTION 'Candidate email leaked';END IF;
 v:=public.mutate_form(actor,fid,'publish',1,jsonb_build_object('definition',definition),repeat('a',64),gen_random_uuid());vid:=(v->>'published_version_id')::uuid;
 v:=public.submit_form_response(fid,vid,repeat('a',64),'{"f6500000-0000-4000-8000-000000000010":"Safe answer","f6500000-0000-4000-8000-000000000011":"Never mail this sensitive answer"}',repeat('2',64),repeat('3',64),NULL,repeat('d',64),actor,NULL,NULL,NULL,NULL);rid:=(v->>'responseId')::uuid;
 PERFORM public.submit_form_response(fid,vid,repeat('a',64),'{}',repeat('2',64),repeat('3',64),NULL,repeat('d',64),actor,NULL,NULL,NULL,NULL);
 IF(SELECT count(*) FROM public.form_response_deliveries WHERE response_id=rid)<>3 THEN RAISE EXCEPTION 'Wrong delivery fanout/idempotency';END IF;
 IF EXISTS(SELECT 1 FROM public.delivery_jobs WHERE kind='form_reviewed_email' AND(payload::text LIKE '%answer%' OR payload::text LIKE '%example.test%')) THEN RAISE EXCEPTION 'PII in delivery outbox';END IF;
 SELECT dj.* INTO j FROM public.delivery_jobs dj JOIN public.form_response_deliveries d ON d.id=(dj.payload->>'deliveryId')::uuid WHERE dj.kind='form_reviewed_email' AND d.response_id=rid AND d.recipient_admin=target;
 UPDATE public.delivery_jobs SET state='running',lease_token=gen_random_uuid(),locked_until=now()+interval '5 minutes' WHERE id=j.id RETURNING * INTO j;
 IF public.prepare_form_reviewed_email(j.id,gen_random_uuid()) IS NOT NULL THEN RAISE EXCEPTION 'Wrong worker lease accepted';END IF;
 prepared:=public.prepare_form_reviewed_email(j.id,j.lease_token);
 IF prepared IS NULL OR prepared::text NOT LIKE '%Safe answer%' OR prepared::text LIKE '%Never mail%' OR prepared->>'email'<>'delivery-other@example.test' THEN RAISE EXCEPTION 'Prepared delivery projection wrong';END IF;
 UPDATE public.admin_users SET is_active=false WHERE id=target;
 IF public.prepare_form_reviewed_email(j.id,j.lease_token) IS NOT NULL THEN RAISE EXCEPTION 'Revoked recipient still mailed';END IF;
 UPDATE public.admin_users SET is_active=true WHERE id=target;
 UPDATE public.form_answers SET value=to_jsonb(repeat('x',40000)) WHERE response_id=rid AND field_id='f6500000-0000-4000-8000-000000000010';
 prepared:=public.prepare_form_reviewed_email(j.id,j.lease_token);
 IF prepared->>'answersOmitted'<>'true' OR prepared->'answers'<>'[]'::jsonb THEN RAISE EXCEPTION 'Oversized answers not safely omitted';END IF;
 UPDATE public.form_responses SET revision=revision+1 WHERE id=rid;
 IF public.prepare_form_reviewed_email(j.id,j.lease_token) IS NOT NULL THEN RAISE EXCEPTION 'Edited answer snapshot sent';END IF;
 UPDATE public.form_responses SET revision=revision-1 WHERE id=rid;
 UPDATE public.form_responses SET redacted_at=now() WHERE id=rid;
 IF public.prepare_form_reviewed_email(j.id,j.lease_token) IS NOT NULL THEN RAISE EXCEPTION 'Redacted response mailed';END IF;
 UPDATE public.form_responses SET redacted_at=NULL WHERE id=rid;
 UPDATE public.admin_users SET is_active=false WHERE id=actor;
 IF public.prepare_form_reviewed_email(j.id,j.lease_token) IS NOT NULL THEN RAISE EXCEPTION 'Revoked reviewer approval still valid';END IF;
 UPDATE public.admin_users SET is_active=true WHERE id=actor;
 UPDATE public.form_delivery_policies SET revision=revision+1 WHERE form_id=fid;
 IF public.prepare_form_reviewed_email(j.id,j.lease_token) IS NOT NULL THEN RAISE EXCEPTION 'Obsolete policy delivery sent';END IF;
 UPDATE public.admin_sessions SET revoked_at=now() WHERE id=sid;
 BEGIN
  PERFORM public.review_form_delivery(actor,sid,'test-only',fid,1,2,definition,repeat('a',64),document,repeat('9',64),key,gen_random_uuid());
  RAISE EXCEPTION 'Revoked review session accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 IF EXISTS(SELECT 1 FROM public.admin_actions WHERE target_id=rid AND metadata::text LIKE '%Safe answer%') THEN RAISE EXCEPTION 'Answer values in delivery audit';END IF;
END $$;
ROLLBACK;
