BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES
 ('f9600000-0000-4000-8000-000000000001','retention-fixture@example.test','fixture-password','super_admin',true);
DO $$ <<retention_fixture>> DECLARE actor uuid:='f9600000-0000-4000-8000-000000000001';old_session uuid;second_session uuid;live_session uuid;
 f uuid;upload uuid;abandoned uuid;j public.delivery_jobs;run jsonb;counts jsonb;doc jsonb;audit uuid;old_event uuid;recent_event uuid;terminal uuid;pending uuid;
 read_notice uuid;unread_notice uuid;old_unread uuid;old_cache uuid;fresh_cache uuid;old_key uuid;fresh_key uuid;gate_old uuid;gate_fresh uuid;BEGIN
 IF has_function_privilege('anon','public.run_operational_retention(uuid,uuid,integer)','EXECUTE') OR has_function_privilege('authenticated','public.run_operational_retention(uuid,uuid,integer)','EXECUTE')
  OR has_table_privilege('service_role','gdg_security.auth_rate_daily','INSERT') THEN RAISE EXCEPTION 'OPS-TEST-006: retention privileges exposed';END IF;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(actor,repeat('1',64)) RETURNING id INTO old_session;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash,idle_expires_at,absolute_expires_at) VALUES(actor,repeat('2',64),now()-interval '39 days',now()-interval '38 days') RETURNING id INTO second_session;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(actor,repeat('3',64)) RETURNING id INTO live_session;
 INSERT INTO public.csrf_tokens(session_id,token_hash,expires_at) VALUES(old_session,repeat('1',64),now()-interval '40 days'),(live_session,repeat('3',64),now()-interval '29 days');
 f:=(public.mutate_finance(actor,old_session,NULL,NULL,'create',NULL,'{"record":{"transactionType":"expense","category":"Event Costs","amount":"1.01","currency":"USD","description":"Fictional retained receipt","transactionDate":"2026-10-20"}}',repeat('1',64),repeat('1',64),gen_random_uuid())->>'id')::uuid;
 doc:=jsonb_build_object('revision',1,'filename','fictional-retained.pdf','mime','application/pdf','bytes',50,'sha256',repeat('a',64),'key','quarantine/'||gen_random_uuid()||'/'||gen_random_uuid());
 upload:=(public.mutate_finance_upload(actor,old_session,f,NULL,'create',doc,repeat('2',64),repeat('2',64),gen_random_uuid())->>'uploadId')::uuid;
 PERFORM public.mutate_finance_upload(actor,old_session,f,upload,'complete','{}',repeat('3',64),repeat('3',64),gen_random_uuid());
 SELECT * INTO j FROM public.claim_worker_jobs(1,ARRAY['upload_scan']);
 PERFORM public.finish_upload_scan(j.id,j.lease_token,'clean/'||upload||'/'||gen_random_uuid(),'application/pdf',50,repeat('b',64),NULL);
 doc:=jsonb_set(doc,'{key}',to_jsonb('quarantine/'||gen_random_uuid()||'/'||gen_random_uuid()));
 abandoned:=(public.mutate_finance_upload(actor,old_session,f,NULL,'create',doc,repeat('4',64),repeat('4',64),gen_random_uuid())->>'uploadId')::uuid;
 UPDATE public.admin_sessions SET idle_expires_at=now()-interval '40 days',absolute_expires_at=now()-interval '35 days' WHERE id=old_session;
 INSERT INTO public.admin_actions(action,created_at) VALUES('retention.fixture',now()-interval '3 years') RETURNING id INTO audit;
 INSERT INTO public.security_events(event_type,admin_id,created_at) VALUES('login_failed',actor,now()-interval '1 year 1 day') RETURNING id INTO old_event;
 INSERT INTO public.security_events(event_type,admin_id,created_at) VALUES('login_failed',actor,now()-interval '364 days') RETURNING id INTO recent_event;
 INSERT INTO public.gate_sessions(token_hash,gate_version,expires_at) VALUES(repeat('4',64),1,now()-interval '31 days') RETURNING id INTO gate_old;
 INSERT INTO public.gate_sessions(token_hash,gate_version,expires_at) VALUES(repeat('5',64),1,now()-interval '29 days') RETURNING id INTO gate_fresh;
 INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,expires_at) VALUES('retention-fixture',repeat('5',64),repeat('5',64),now()-interval '1 day') RETURNING id INTO old_key;
 INSERT INTO public.idempotency_keys(scope,key_hash,request_hash) VALUES('retention-fixture',repeat('6',64),repeat('6',64)) RETURNING id INTO fresh_key;
 INSERT INTO public.delivery_jobs(kind,deduplication_key,state,payload,secret_payload,last_error_code,updated_at) VALUES('event_confirmation','retention-terminal','dead','{"registrationId":"f9600000-0000-4000-8000-000000000099"}','v1.fixture','TEST_FAILURE',now()-interval '91 days') RETURNING id INTO terminal;
 INSERT INTO public.delivery_jobs(kind,deduplication_key,state,payload,updated_at) VALUES('event_confirmation','retention-pending','pending','{"registrationId":"f9600000-0000-4000-8000-000000000099"}',now()-interval '91 days') RETURNING id INTO pending;
 PERFORM public.take_rate_limit('auth.login.ip',repeat('7',64),20,900);
 PERFORM public.take_rate_limit('auth.login.ip',repeat('7',64),20,900);
 IF(SELECT attempts FROM gdg_security.auth_rate_daily WHERE scope='auth.login.ip' AND day=(now() AT TIME ZONE 'UTC')::date)<>2 THEN RAISE EXCEPTION 'OPS-TEST-006: aggregate did not count insertion and increment exactly once';END IF;
 UPDATE public.rate_limit_windows SET expires_at=now()-interval '1 second' WHERE scope='auth.login.ip' AND risk_key_hash=repeat('7',64);
 INSERT INTO gdg_security.auth_rate_daily(day,scope,attempts) VALUES((now() AT TIME ZONE 'UTC')::date-91,'auth.gate.failures',4);
 run:=public.begin_scheduled_job('session-cleanup',gen_random_uuid());
 BEGIN PERFORM public.run_operational_retention((run->>'runId')::uuid,gen_random_uuid(),1);RAISE EXCEPTION 'OPS-TEST-006: forged lease used retention';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'JOB_LEASE_LOST' THEN RAISE;END IF;END;
 BEGIN PERFORM public.run_operational_retention((run->>'runId')::uuid,(run->>'lease')::uuid,1001);RAISE EXCEPTION 'Unbounded cleanup accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'VALIDATION_ERROR' THEN RAISE;END IF;END;
 counts:=public.run_operational_retention((run->>'runId')::uuid,(run->>'lease')::uuid,1);
 IF counts->>'sessionsExpired'<>'1' OR EXISTS(SELECT 1 FROM public.admin_sessions WHERE id=old_session) OR NOT EXISTS(SELECT 1 FROM public.admin_sessions WHERE id=second_session)
  OR NOT EXISTS(SELECT 1 FROM public.admin_sessions WHERE id=live_session) THEN RAISE EXCEPTION 'OPS-TEST-006: session retention/batch boundary failed';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.finance_attachments WHERE id=upload AND scan_state='clean') OR NOT EXISTS(SELECT 1 FROM public.upload_intents WHERE id=upload AND owner_session IS NULL AND state='clean' AND clean_key IS NOT NULL)
  OR NOT EXISTS(SELECT 1 FROM public.finances WHERE id=f) OR NOT EXISTS(SELECT 1 FROM public.admin_actions WHERE id=audit) THEN RAISE EXCEPTION 'OPS-TEST-006: retained evidence changed';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.upload_intents WHERE id=abandoned AND state='expired' AND owner_session IS NULL) THEN RAISE EXCEPTION 'Abandoned intent pinned authentication';END IF;
 IF EXISTS(SELECT 1 FROM public.csrf_tokens WHERE session_id=old_session) OR NOT EXISTS(SELECT 1 FROM public.csrf_tokens WHERE session_id=live_session)
  OR EXISTS(SELECT 1 FROM public.gate_sessions WHERE id=gate_old) OR NOT EXISTS(SELECT 1 FROM public.gate_sessions WHERE id=gate_fresh)
  OR EXISTS(SELECT 1 FROM public.security_events WHERE id=old_event) OR NOT EXISTS(SELECT 1 FROM public.security_events WHERE id=recent_event)
  OR EXISTS(SELECT 1 FROM public.idempotency_keys WHERE id=old_key) OR NOT EXISTS(SELECT 1 FROM public.idempotency_keys WHERE id=fresh_key) THEN RAISE EXCEPTION 'OPS-TEST-006: retention cutoffs failed';END IF;
 IF counts->>'riskWindowsExpired'<>'1' THEN RAISE EXCEPTION 'Risk cleanup ignored its batch limit';END IF;
 PERFORM public.run_operational_retention((run->>'runId')::uuid,(run->>'lease')::uuid,1);
 IF EXISTS(SELECT 1 FROM public.rate_limit_windows WHERE scope='auth.login.ip' AND risk_key_hash=repeat('7',64)) OR EXISTS(SELECT 1 FROM gdg_security.auth_rate_daily WHERE day=(now() AT TIME ZONE 'UTC')::date-91)
  OR NOT EXISTS(SELECT 1 FROM gdg_security.auth_rate_daily WHERE scope='auth.login.ip' AND attempts=2) THEN RAISE EXCEPTION 'Risk retention is not raw-window/aggregate separated';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.delivery_jobs WHERE id=terminal AND payload='{}' AND secret_payload IS NULL AND last_error_code IS NULL) OR NOT EXISTS(SELECT 1 FROM public.delivery_jobs WHERE id=pending AND payload<>'{}') THEN RAISE EXCEPTION 'OPS-TEST-006: active job altered or old detail retained';END IF;
 PERFORM public.finish_scheduled_job((run->>'runId')::uuid,(run->>'lease')::uuid,true,counts,NULL);
 BEGIN PERFORM public.run_operational_retention((run->>'runId')::uuid,(run->>'lease')::uuid,1);RAISE EXCEPTION 'Completed lease reused';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'JOB_LEASE_LOST' THEN RAISE;END IF;END;
 IF public.begin_scheduled_job('session-cleanup',gen_random_uuid())->>'skipped'<>'already_completed' THEN RAISE EXCEPTION 'Daily retention occurrence repeated';END IF;
 INSERT INTO public.notifications(user_id,type,title,message,is_read,created_at) VALUES(actor,'system','Fictional read','Fixture',true,now()-interval '91 days') RETURNING id INTO read_notice;
 INSERT INTO public.notifications(user_id,type,title,message,is_read,created_at) VALUES(actor,'system','Fictional unread','Fixture',false,now()-interval '91 days') RETURNING id INTO unread_notice;
 INSERT INTO public.notifications(user_id,type,title,message,is_read,created_at) VALUES(actor,'system','Fictional old unread','Fixture',false,now()-interval '181 days') RETURNING id INTO old_unread;
 run:=public.begin_scheduled_job('notification-cleanup',gen_random_uuid());
 counts:=public.run_operational_retention((run->>'runId')::uuid,(run->>'lease')::uuid,1000);
 IF counts->>'notificationsExpired'<>'2' OR EXISTS(SELECT 1 FROM public.notifications WHERE id IN(read_notice,old_unread)) OR NOT EXISTS(SELECT 1 FROM public.notifications WHERE id=unread_notice) THEN RAISE EXCEPTION 'OPS-TEST-007: notification policy failed';END IF;
 INSERT INTO public.finance_report_cache(report_type,report_data,expires_at) VALUES('fixture','{}',now()-interval '1 second') RETURNING id INTO old_cache;
 INSERT INTO public.finance_report_cache(report_type,report_data,expires_at) VALUES('fixture','{}',now()+interval '1 hour') RETURNING id INTO fresh_cache;
 run:=public.begin_scheduled_job('report-cache-cleanup',gen_random_uuid());
 counts:=public.run_operational_retention((run->>'runId')::uuid,(run->>'lease')::uuid,1000);
 IF counts->>'reportCachesExpired'<>'1' OR EXISTS(SELECT 1 FROM public.finance_report_cache WHERE id=old_cache) OR NOT EXISTS(SELECT 1 FROM public.finance_report_cache WHERE id=fresh_cache) THEN RAISE EXCEPTION 'OPS-TEST-008: cache cleanup altered live report or retained expired cache';END IF;
END $$;
ROLLBACK;
