BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES('f1500000-0000-4000-8000-000000000001','newsletter-snapshot@example.test','test-only','admin',true);
INSERT INTO public.admin_sessions(id,admin_user_id,token_hash) VALUES('f1500000-0000-4000-8000-000000000002','f1500000-0000-4000-8000-000000000001',repeat('1',64));
DO $$ DECLARE actor uuid:='f1500000-0000-4000-8000-000000000001';sid uuid:='f1500000-0000-4000-8000-000000000002';c uuid;review uuid;j public.delivery_jobs;v jsonb;test uuid;scenario text;BEGIN
 IF has_function_privilege('authenticated','public.prepare_newsletter_delivery(uuid,uuid,text,text)','EXECUTE') THEN RAISE EXCEPTION 'Browser can prepare newsletter'; END IF;
 INSERT INTO public.newsletter_subscribers(email,state,is_active,consent_at,confirmed_at) VALUES('snapshot-recipient@example.test','active',true,now(),now());
 FOREACH scenario IN ARRAY ARRAY['approval','content','password','session'] LOOP
  sid:=gen_random_uuid();
  INSERT INTO public.admin_sessions(id,admin_user_id,token_hash) VALUES(sid,actor,encode(sha256(convert_to(scenario,'UTF8')),'hex'));
  v:=public.mutate_newsletter_record(actor,sid,'campaigns',NULL,'create',NULL,jsonb_build_object('teamId',NULL,'record',jsonb_build_object('subject','Snapshot '||scenario,'content','Original test content','audience','all','recipientIds','[]'::jsonb)),encode(sha256(convert_to('create-'||scenario,'UTF8')),'hex'),repeat('2',64),gen_random_uuid());c:=(v->>'id')::uuid;
  v:=public.create_newsletter_test(actor,sid,c,1,'test-only',encode(sha256(convert_to('test-'||scenario,'UTF8')),'hex'),repeat('2',64),gen_random_uuid());test:=(v->>'testId')::uuid;
  IF scenario='approval' THEN
   v:=public.review_newsletter_send(actor,sid,c,1,repeat('a',64),gen_random_uuid());review:=(v->>'reviewId')::uuid;
   PERFORM public.commit_newsletter_send(actor,sid,c,review,repeat('a',64),'test-only','SEND 1',NULL,repeat('3',64),repeat('2',64),gen_random_uuid());
   IF(SELECT revision FROM public.newsletter_campaigns WHERE id=c)=1 THEN RAISE EXCEPTION 'Approval did not change revision'; END IF;
  ELSIF scenario='content' THEN UPDATE public.newsletter_campaigns SET content='Changed after the test request',revision=revision+1 WHERE id=c;
  ELSIF scenario='password' THEN UPDATE public.admin_users SET password_hash='changed' WHERE id=actor;
  ELSE UPDATE public.admin_sessions SET revoked_at=now() WHERE id=sid;
  END IF;
  SELECT * INTO j FROM public.claim_worker_jobs(100,ARRAY['newsletter_test']) WHERE payload->>'testId'=test::text;
  IF public.prepare_newsletter_delivery(j.id,gen_random_uuid(),NULL,NULL) IS NOT NULL THEN RAISE EXCEPTION 'Forged lease accepted';END IF;
  v:=public.prepare_newsletter_delivery(j.id,j.lease_token,NULL,NULL);
  IF scenario='approval' THEN
   IF v IS NULL OR v->>'email'<>'newsletter-snapshot@example.test' OR v->>'content'<>'Original test content' OR NOT(v->>'test')::boolean THEN RAISE EXCEPTION 'Approval discarded immutable self-test';END IF;
   PERFORM public.finish_newsletter_delivery(j.id,j.lease_token,true,'fictional-snapshot-provider',NULL,false);
  ELSIF v IS NOT NULL THEN RAISE EXCEPTION 'Invalidated test dispatched: %',scenario;
  END IF;
  IF scenario='password' THEN UPDATE public.admin_users SET password_hash='test-only' WHERE id=actor;END IF;
 END LOOP;
END $$;
ROLLBACK;
