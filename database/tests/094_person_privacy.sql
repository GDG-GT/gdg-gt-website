BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES
 ('f9400000-0000-4000-8000-000000000001','privacy-root@example.test','test-only','super_admin',true),
 ('f9400000-0000-4000-8000-000000000002','privacy-admin@example.test','test-only','admin',true),
 ('f9400000-0000-4000-8000-000000000003','privacy-person@example.test','test-only','team_member',true);
INSERT INTO public.admin_sessions(id,admin_user_id,token_hash) VALUES
 ('f9400000-0000-4000-8000-000000000004','f9400000-0000-4000-8000-000000000001',repeat('1',64)),
 ('f9400000-0000-4000-8000-000000000005','f9400000-0000-4000-8000-000000000001',repeat('2',64)),
 ('f9400000-0000-4000-8000-000000000006','f9400000-0000-4000-8000-000000000002',repeat('3',64));
DO $$ <<privacy_fixture>> DECLARE actor uuid:='f9400000-0000-4000-8000-000000000001';sid uuid:='f9400000-0000-4000-8000-000000000004';sid2 uuid:='f9400000-0000-4000-8000-000000000005';
 admin uuid:='f9400000-0000-4000-8000-000000000002';email text:='privacy-person@example.test';event_id uuid;registration uuid;peer uuid;contact uuid;subscriber uuid;fid uuid;vid uuid;response uuid;legacy uuid;
 r jsonb;v jsonb;review uuid;definition jsonb;document jsonb;counted integer;prepared jsonb;message_id uuid;campaign uuid;peer_subscriber uuid;
BEGIN
 IF has_function_privilege('anon','public.commit_person_privacy(uuid,uuid,text,uuid,text,text,text,text,text,uuid)','EXECUTE') OR has_table_privilege('authenticated','public.person_privacy_reviews','SELECT')
  OR has_table_privilege('service_role','gdg_security.person_privacy_erasure_grants','INSERT')
  OR has_table_privilege('service_role','public.person_privacy_reviews','UPDATE') OR has_table_privilege('service_role','public.person_privacy_cleanup','INSERT')
  OR has_table_privilege('service_role','public.form_purge_certificates','INSERT') THEN RAISE EXCEPTION 'Privacy boundary exposed';END IF;
 IF gdg_security.person_privacy_session(admin,'f9400000-0000-4000-8000-000000000006','test-only') OR gdg_security.person_privacy_session(actor,sid,'wrong') THEN RAISE EXCEPTION 'Non-SA or wrong password accepted';END IF;
 r:=public.mutate_event(actor,NULL,'create',NULL,jsonb_build_object('title','Fictional privacy event','slug','fictional-privacy-event','description','Fixture only','start_at',now()+interval '2 days','location','Fixture'),gen_random_uuid());event_id:=(r->>'id')::uuid;
 PERFORM public.mutate_event(actor,event_id,'publish',1,'{}',gen_random_uuid());
 r:=public.register_event_atomic('fictional-privacy-event','Fictional Respondent',email,'Private registration notes',true,repeat('1',64),repeat('2',64));registration:=(r->>'registrationId')::uuid;
 r:=public.register_event_atomic('fictional-privacy-event','Unrelated Respondent','privacy-peer@example.test',NULL,true,repeat('3',64),repeat('4',64));peer:=(r->>'registrationId')::uuid;
 INSERT INTO public.contact_submissions(name,email,inquiry_type,message,idempotency_key_hash,request_hash) VALUES('Fictional Respondent',email,'general','Private person message for a fictional privacy test.',repeat('c',64),repeat('d',64)) RETURNING id INTO contact;
 INSERT INTO public.newsletter_subscribers(email,name,state,is_active,confirmed_at,consent_at) VALUES(email,'Fictional Respondent','active',true,now(),now()) RETURNING id INTO subscriber;
 INSERT INTO public.newsletter_subscription_attempts(email) VALUES(email);
 INSERT INTO public.newsletter_subscribers(email,name,state,is_active,confirmed_at,consent_at) VALUES('privacy-peer@example.test','Unrelated subscriber','active',true,now(),now()) RETURNING id INTO peer_subscriber;
 INSERT INTO public.newsletter_campaigns(subject,content,created_by) VALUES('Fictional newsletter','Chapter-authored content.',actor) RETURNING id INTO campaign;
 INSERT INTO public.newsletter_campaign_recipients(campaign_id,subscriber_id,recipient_email,subscriber_revision,secret_payload) VALUES(campaign,subscriber,email,1,'v1.fixture'),(campaign,peer_subscriber,'privacy-peer@example.test',1,'v1.peer');
 INSERT INTO public.newsletter_send_reviews(campaign_id,actor_id,session_id,revision,token_hash,recipient_snapshot) VALUES(campaign,actor,sid,1,repeat('4',64),jsonb_build_array(jsonb_build_object('id',subscriber,'email',email),jsonb_build_object('id',peer_subscriber,'email','privacy-peer@example.test')));
 INSERT INTO public.event_messages(event_id,created_by,subject,message,key_hash,request_hash,recipient_count) VALUES(event_id,actor,'Fictional event note','Chapter-authored note.',repeat('a',64),repeat('b',64),2) RETURNING id INTO message_id;
 INSERT INTO public.event_message_recipients(message_id,registration_id,recipient_email) VALUES(message_id,registration,email),(message_id,peer,'privacy-peer@example.test');
 INSERT INTO public.event_mail_reviews(event_id,actor_id,session_id,event_revision,subject,message,recipient_snapshot) VALUES(event_id,actor,sid,2,'Fictional review','Chapter-authored note.',jsonb_build_array(jsonb_build_object('id',registration,'email',email),jsonb_build_object('id',peer,'email','privacy-peer@example.test')));
 BEGIN UPDATE public.event_message_recipients SET recipient_email='' WHERE registration_id=registration;RAISE EXCEPTION 'Recipient rewritten without certificate';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN UPDATE public.newsletter_subscribers SET email='erased+'||id||'@privacy.invalid' WHERE id=subscriber;RAISE EXCEPTION 'Subscriber rewritten without certificate';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NEWSLETTER_RETAINED' THEN RAISE;END IF;END;
 definition:='{"title":"Privacy form fixture","description":"Fictional only","fields":[{"id":"f9400000-0000-4000-8000-000000000010","type":"short","label":"Private answer","sensitive":true}],"sections":[],"settings":{"access":"public","receipts":false,"limit":0,"resume":true,"editing":true,"retentionDays":365}}';
 r:=public.mutate_form(actor,NULL,'create',NULL,jsonb_build_object('slug','privacy-form-fixture','definition',definition),NULL,gen_random_uuid());fid:=(r->>'id')::uuid;
 r:=public.mutate_form(actor,fid,'publish',1,jsonb_build_object('definition',definition),repeat('a',64),gen_random_uuid());vid:=(r->>'published_version_id')::uuid;
 document:=jsonb_build_object('form',fid,'version',vid,'schemaHash',repeat('a',64),'answers',jsonb_build_object('f9400000-0000-4000-8000-000000000010','Own sensitive answer'),'keyHash',repeat('5',64),'requestHash',repeat('6',64),'respondent',jsonb_build_object('name','Fictional Respondent','email',email),'copyRequested',true);
 r:=public.submit_identified_form_response(document);response:=(r->>'responseId')::uuid;
 r:=public.submit_form_response(fid,vid,repeat('a',64),jsonb_build_object('f9400000-0000-4000-8000-000000000010',email),repeat('7',64),repeat('8',64),NULL,NULL,NULL,NULL,NULL,NULL,NULL);legacy:=(r->>'responseId')::uuid;
 INSERT INTO public.push_subscriptions(event_id,registration_id,registration_email_hash,endpoint_hash,management_hash,endpoint_encrypted) VALUES(event_id,registration,repeat('1',64),repeat('2',64),repeat('3',64),'v1.fixture');
 r:=gdg_security.person_privacy_inventory(email,'{}','[]');counted:=jsonb_array_length(r);
 IF counted<>6 OR EXISTS(SELECT 1 FROM jsonb_array_elements(r) x WHERE x->>'id'=legacy::text) THEN RAISE EXCEPTION 'Exact-email scope or anonymous attribution wrong: %',counted;END IF;
 IF jsonb_array_length(gdg_security.person_privacy_inventory(email,ARRAY[legacy],'[]'))<>7 THEN RAISE EXCEPTION 'Attested legacy response missing';END IF;
 BEGIN PERFORM gdg_security.person_privacy_inventory('privacy-peer@example.test',ARRAY[response],'[]');RAISE EXCEPTION 'Different identified response substituted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 r:=public.review_person_privacy(actor,sid,'test-only',email,'v1.fixture',repeat('1',64),'export','{}','[]',false,repeat('a',64),repeat('b',64),gen_random_uuid());review:=(r->>'reviewId')::uuid;
 BEGIN PERFORM public.commit_person_privacy(actor,sid2,'test-only',review,repeat('a',64),email,'EXPORT 6 RECORDS',repeat('a',64),repeat('b',64),gen_random_uuid());RAISE EXCEPTION 'Foreign session used privacy review';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'PRIVACY_REVIEW_REQUIRED' THEN RAISE;END IF;END;
 BEGIN PERFORM public.commit_person_privacy(actor,sid,'test-only',review,repeat('a',64),email,'DELETE 6 RECORDS',repeat('a',64),repeat('b',64),gen_random_uuid());RAISE EXCEPTION 'Changed action accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'VALIDATION_ERROR' THEN RAISE;END IF;END;
 prepared:=public.commit_person_privacy(actor,sid,'test-only',review,repeat('a',64),email,'EXPORT 6 RECORDS',repeat('a',64),repeat('b',64),gen_random_uuid());
 IF prepared::text LIKE '%Own sensitive answer%' OR prepared::text LIKE '%endpoint_encrypted%' OR prepared::text LIKE '%privacy-peer@example.test%' THEN RAISE EXCEPTION 'Private secret, sensitive or unrelated data exported';END IF;
 IF(SELECT email_encrypted IS NOT NULL OR password_hash IS NOT NULL OR records<>'[]'::jsonb FROM public.person_privacy_reviews WHERE id=review) THEN RAISE EXCEPTION 'Used review retained sensitive capabilities';END IF;
 IF public.commit_person_privacy(actor,sid,'test-only',review,repeat('a',64),NULL,'EXPORT 6 RECORDS',repeat('a',64),repeat('b',64),gen_random_uuid())->>'downloadExpired'<>'true' THEN RAISE EXCEPTION 'Export replay retained raw data';END IF;
 r:=public.review_person_privacy(actor,sid,'test-only',email,'v1.fixture',repeat('1',64),'export','{}','[]',true,repeat('c',64),repeat('b',64),gen_random_uuid());review:=(r->>'reviewId')::uuid;
 prepared:=public.commit_person_privacy(actor,sid,'test-only',review,repeat('c',64),email,'EXPORT 6 RECORDS',repeat('c',64),repeat('d',64),gen_random_uuid());
 IF prepared::text NOT LIKE '%Own sensitive answer%' THEN RAISE EXCEPTION 'Explicit sensitive export missing own answer';END IF;
 r:=public.review_person_privacy(actor,sid,'test-only',email,'v1.fixture',repeat('1',64),'redact','{}','[]',false,repeat('d',64),repeat('b',64),gen_random_uuid());review:=(r->>'reviewId')::uuid;
 UPDATE public.contact_submissions SET retention_hold=true,revision=revision+1 WHERE id=contact;
 BEGIN PERFORM public.commit_person_privacy(actor,sid,'test-only',review,repeat('d',64),email,'REDACT 6 RECORDS',repeat('e',64),repeat('f',64),gen_random_uuid());RAISE EXCEPTION 'Changed hold bypassed';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'PRIVACY_REVIEW_CHANGED' THEN RAISE;END IF;END;
 r:=public.review_person_privacy(actor,sid,'test-only',email,'v1.fixture',repeat('1',64),'delete','{}','[]',false,repeat('e',64),repeat('b',64),gen_random_uuid());review:=(r->>'reviewId')::uuid;
 BEGIN PERFORM public.commit_person_privacy(actor,sid,'test-only',review,repeat('e',64),email,'DELETE 6 RECORDS',repeat('e',64),repeat('f',64),gen_random_uuid());RAISE EXCEPTION 'Held erasure accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'RETENTION_HOLD' THEN RAISE;END IF;END;
 UPDATE public.contact_submissions SET retention_hold=false,revision=revision+1 WHERE id=contact;
 r:=public.review_person_privacy(actor,sid,'test-only',email,'v1.fixture',repeat('1',64),'redact','{}','[]',false,repeat('f',64),repeat('b',64),gen_random_uuid());review:=(r->>'reviewId')::uuid;
 prepared:=public.commit_person_privacy(actor,sid,'test-only',review,repeat('f',64),email,'REDACT 6 RECORDS',repeat('7',64),repeat('8',64),gen_random_uuid());
 IF prepared->>'remainingMatches'<>'0' OR prepared->>'count'<>'6' THEN RAISE EXCEPTION 'Residual public identity remains';END IF;
 IF(SELECT respondent_email IS NOT NULL FROM public.form_responses WHERE id=response) OR EXISTS(SELECT 1 FROM public.form_answers WHERE response_id=response) OR(SELECT c.email FROM public.contact_submissions c WHERE c.id=contact)<>'' THEN RAISE EXCEPTION 'Content or identity survived redaction';END IF;
 IF(SELECT attendee_email FROM public.event_attendance WHERE id=peer)<>'privacy-peer@example.test' OR(SELECT a.email FROM public.admin_users a WHERE a.id='f9400000-0000-4000-8000-000000000003')<>email THEN RAISE EXCEPTION 'Other participant or officer account changed';END IF;
 IF EXISTS(SELECT 1 FROM public.push_subscriptions WHERE registration_id=registration AND(endpoint_encrypted IS NOT NULL OR revoked_at IS NULL)) THEN RAISE EXCEPTION 'Device capability survived';END IF;
 IF EXISTS(SELECT 1 FROM public.event_message_recipients WHERE registration_id=registration AND recipient_email<>'') OR EXISTS(SELECT 1 FROM public.newsletter_campaign_recipients WHERE subscriber_id=subscriber AND(recipient_email<>'' OR secret_payload IS NOT NULL OR state<>'skipped')) THEN RAISE EXCEPTION 'Frozen recipient derivative survived';END IF;
 IF EXISTS(SELECT 1 FROM public.newsletter_send_reviews WHERE campaign_id=campaign AND recipient_snapshot::text LIKE '%'||email||'%') OR EXISTS(SELECT 1 FROM public.event_mail_reviews em WHERE em.event_id=privacy_fixture.event_id AND recipient_snapshot::text LIKE '%'||email||'%') THEN RAISE EXCEPTION 'Review snapshot retained original email';END IF;
 IF(SELECT recipient_email FROM public.event_message_recipients WHERE registration_id=peer)<>'privacy-peer@example.test' OR(SELECT recipient_email FROM public.newsletter_campaign_recipients WHERE subscriber_id=peer_subscriber)<>'privacy-peer@example.test' THEN RAISE EXCEPTION 'Other frozen recipient erased';END IF;
 IF EXISTS(SELECT 1 FROM public.delivery_jobs WHERE kind='form_respondent_copy' AND state IN('pending','running') AND payload->>'copyId' IN(SELECT id::text FROM public.form_respondent_copies WHERE response_id=response)) THEN RAISE EXCEPTION 'Queued response copy survived erasure';END IF;
 IF public.commit_person_privacy(actor,sid,'test-only',review,repeat('f',64),NULL,'REDACT 6 RECORDS',repeat('7',64),repeat('8',64),gen_random_uuid()) IS DISTINCT FROM prepared THEN RAISE EXCEPTION 'Privacy idempotent result changed';END IF;
 IF public.read_person_privacy_requests(actor,sid,NULL)::text LIKE '%'||email||'%' OR EXISTS(SELECT 1 FROM public.admin_actions WHERE action LIKE 'privacy.%' AND metadata::text LIKE '%'||email||'%') THEN RAISE EXCEPTION 'Privacy counter/audit leaks original email';END IF;
END $$;
ROLLBACK;
