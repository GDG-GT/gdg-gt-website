BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES
 ('b1170000-0000-4000-8000-000000000001','mail-recovery-admin@example.test','fictional','admin',true);
DO $$ DECLARE a uuid:='b1170000-0000-4000-8000-000000000001';s uuid;other uuid;t uuid;e uuid;r uuid;old_review uuid;attendee uuid;
 v jsonb;committed jsonb;messages integer;jobs integer;audits integer;BEGIN
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(a,repeat('1',64)) RETURNING id INTO s;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(a,repeat('2',64)) RETURNING id INTO other;
 INSERT INTO public.admin_teams(name,slug,created_by) VALUES('Fictional mail recovery','fictional-mail-recovery',a) RETURNING id INTO t;
 v:=public.mutate_event(a,NULL,'create',NULL,jsonb_build_object('title','Fictional mail recovery','slug','fictional-mail-recovery','description','Fixture only','start_at',now()+interval '3 days','location','Fixture','team_id',t),gen_random_uuid());e:=(v->>'id')::uuid;
 PERFORM public.mutate_event(a,e,'publish',1,'{}',gen_random_uuid());
 PERFORM public.register_event_atomic('fictional-mail-recovery','Fictional attendee','mail-recovery-attendee@example.test',NULL,true,repeat('a',64),repeat('b',64));
 SELECT id INTO attendee FROM public.event_attendance WHERE event_id=e;
 v:=public.review_event_mail(a,s,e,'Fictional subject','Fictional recovery message',gen_random_uuid());r:=(v->>'reviewId')::uuid;old_review:=r;
 SELECT count(*) INTO jobs FROM public.delivery_jobs;SELECT count(*) INTO audits FROM public.admin_actions;
 v:=public.inspect_event_mail_recovery(a,s,e,r,repeat('1',64));
 IF v->>'state'<>'ready' OR v->'review'->>'subject'<>'Fictional subject' OR(v->'review'->>'count')::integer<>1 THEN RAISE EXCEPTION 'Current saved review did not recheck';END IF;
 IF public.inspect_event_mail_recovery(a,other,e,r,repeat('1',64))->>'state'<>'unavailable' THEN RAISE EXCEPTION 'Foreign session read leaked review';END IF;
 UPDATE public.event_mail_reviews SET expires_at=now()-interval '1 second' WHERE id=r;
 v:=public.inspect_event_mail_recovery(a,s,e,r,repeat('1',64));
 IF v->>'reason'<>'expired' OR v ? 'review' THEN RAISE EXCEPTION 'Expired uncommitted review remained usable or exposed frozen audience';END IF;
 UPDATE public.event_mail_reviews SET expires_at=now()+interval '5 minutes' WHERE id=r;
 UPDATE public.event_attendance SET attendee_email='changed-recovery@example.test' WHERE id=attendee;
 v:=public.inspect_event_mail_recovery(a,s,e,r,repeat('1',64));
 IF v->>'reason'<>'audience_changed' OR v ? 'review' THEN RAISE EXCEPTION 'Same-count audience replacement remained usable';END IF;
 UPDATE public.event_attendance SET attendee_email='mail-recovery-attendee@example.test' WHERE id=attendee;
 UPDATE public.events SET revision=revision+1 WHERE id=e;
 IF public.inspect_event_mail_recovery(a,s,e,r,repeat('1',64))->>'reason'<>'changed' THEN RAISE EXCEPTION 'Changed event review remained usable';END IF;
 IF(SELECT count(*) FROM public.delivery_jobs)<>jobs OR(SELECT count(*) FROM public.admin_actions)<>audits
 OR EXISTS(SELECT 1 FROM public.event_messages WHERE event_id=e) THEN RAISE EXCEPTION 'Read-only recheck wrote mail/audit/jobs';END IF;
 v:=public.review_event_mail(a,s,e,'Fictional accepted subject','Fictional accepted recovery message',gen_random_uuid());r:=(v->>'reviewId')::uuid;
 committed:=public.commit_event_mail(a,s,e,r,'fictional','SEND 1',repeat('1',64),repeat('2',64),gen_random_uuid());
 SELECT count(*) INTO messages FROM public.event_messages;SELECT count(*) INTO jobs FROM public.delivery_jobs;SELECT count(*) INTO audits FROM public.admin_actions;
 v:=public.inspect_event_mail_recovery(a,s,e,r,repeat('1',64));
 IF v->>'state'<>'queued' OR v->'receipt' IS DISTINCT FROM committed THEN RAISE EXCEPTION 'Accepted lost approval not reconciled from receipt';END IF;
 BEGIN PERFORM public.inspect_event_mail_recovery(a,s,e,old_review,repeat('1',64));RAISE EXCEPTION 'Receipt returned for another saved review';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 UPDATE public.event_mail_reviews SET expires_at=now()-interval '25 hours' WHERE id=r;PERFORM public.cleanup_event_mail_reviews();
 IF public.inspect_event_mail_recovery(a,s,e,r,repeat('1',64))->>'state'<>'queued' THEN RAISE EXCEPTION 'Purged accepted review lost its durable receipt';END IF;
 IF(SELECT count(*) FROM public.event_messages)<>messages OR(SELECT count(*) FROM public.delivery_jobs)<>jobs OR(SELECT count(*) FROM public.admin_actions)<>audits THEN RAISE EXCEPTION 'Receipt lookup queued another mail/audit';END IF;
 UPDATE public.admin_users SET is_active=false WHERE id=a;
 BEGIN PERFORM public.inspect_event_mail_recovery(a,s,e,r,repeat('1',64));RAISE EXCEPTION 'Inactive actor receipt exposed';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 UPDATE public.admin_users SET is_active=true WHERE id=a;UPDATE public.admin_sessions SET revoked_at=now() WHERE id=s;
 BEGIN PERFORM public.inspect_event_mail_recovery(a,s,e,r,repeat('1',64));RAISE EXCEPTION 'Revoked session receipt exposed';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 IF has_function_privilege('anon','public.inspect_event_mail_recovery(uuid,uuid,uuid,uuid,text)','EXECUTE')
 OR has_function_privilege('authenticated','public.inspect_event_mail_recovery(uuid,uuid,uuid,uuid,text)','EXECUTE')
 OR has_function_privilege('gdg_realtime','public.inspect_event_mail_recovery(uuid,uuid,uuid,uuid,text)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.inspect_event_mail_recovery(uuid,uuid,uuid,uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'Mail recovery read grants unsafe';END IF;
END $$;
ROLLBACK;
