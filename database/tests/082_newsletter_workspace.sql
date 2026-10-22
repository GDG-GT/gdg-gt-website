BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES
 ('f8200000-0000-4000-8000-000000000001','newsletter-admin@example.test','test-only','admin',true),
 ('f8200000-0000-4000-8000-000000000002','newsletter-member@example.test','test-only','team_member',true),
 ('f8200000-0000-4000-8000-000000000003','newsletter-editor@example.test','test-only','blog_editor',true);
INSERT INTO public.admin_sessions(id,admin_user_id,token_hash) VALUES
 ('f8200000-0000-4000-8000-000000000004','f8200000-0000-4000-8000-000000000001',repeat('1',64)),
 ('f8200000-0000-4000-8000-000000000005','f8200000-0000-4000-8000-000000000002',repeat('2',64));
DO $$ DECLARE actor uuid:='f8200000-0000-4000-8000-000000000001';sid uuid:='f8200000-0000-4000-8000-000000000004';member uuid:='f8200000-0000-4000-8000-000000000002';msid uuid:='f8200000-0000-4000-8000-000000000005';t uuid;other uuid;s uuid;c uuid;v jsonb;doc jsonb;BEGIN
 IF has_function_privilege('anon','public.newsletter_record(uuid,text,uuid)','EXECUTE') OR has_table_privilege('authenticated','public.newsletter_subscribers','SELECT') THEN RAISE EXCEPTION 'Browser subscriber access';END IF;
 INSERT INTO public.admin_teams(name,slug,created_by) VALUES('Fictional newsletter team','fictional-newsletter',actor) RETURNING id INTO t;
 INSERT INTO public.admin_teams(name,slug,created_by) VALUES('Fictional foreign newsletter team','fictional-newsletter-foreign',actor) RETURNING id INTO other;
 INSERT INTO public.team_memberships(team_id,admin_user_id,role) VALUES(t,member,'member');
 INSERT INTO public.team_page_access(team_id,page_path,can_access) VALUES(t,'/admin/newsletter',true);
 INSERT INTO public.team_permissions(team_id,resource_type,permission,can_read,can_create,can_update,can_delete) VALUES(t,'newsletter','crud',true,true,true,true);
 IF NOT public.can_operate_newsletter(member,t,'create') OR public.can_operate_newsletter(member,NULL,'read') OR public.can_operate_newsletter(member,other,'read') OR public.can_operate_newsletter(member,t,'send_email') OR public.can_operate_newsletter('f8200000-0000-4000-8000-000000000003',t,'read') THEN RAISE EXCEPTION 'Newsletter roles / send scope';END IF;
 doc:=jsonb_build_object('teamId',t,'email','fictional-newsletter-confirmation@example.test','name','Fixture','consentAcknowledged',true,'tokenHash',repeat('a',64),'secretPayload',repeat('x',100));
 v:=public.mutate_newsletter_record(member,msid,'subscribers',NULL,'create',NULL,doc,repeat('1',64),repeat('2',64),gen_random_uuid());
 IF v<>'{"accepted":true}'::jsonb THEN RAISE EXCEPTION 'Addition disclosed subscription state';END IF;
 SELECT id INTO s FROM public.newsletter_subscribers WHERE email=doc->>'email';
 IF(SELECT state<>'pending' OR is_active OR confirmed_at IS NOT NULL FROM public.newsletter_subscribers WHERE id=s) THEN RAISE EXCEPTION 'Admin add silently activated';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.delivery_jobs WHERE kind='newsletter_confirmation' AND payload->>'subscriberId'=s::text) THEN RAISE EXCEPTION 'No confirmation outbox';END IF;
 IF public.newsletter_record(member,'subscribers',s) IS NULL OR public.newsletter_record('f8200000-0000-4000-8000-000000000003','subscribers',s) IS NOT NULL THEN RAISE EXCEPTION 'Private subscriber projection';END IF;
 PERFORM public.consume_newsletter_token(repeat('a',64),'confirm');
 IF(SELECT state<>'active' OR NOT is_active OR confirmed_at IS NULL FROM public.newsletter_subscribers WHERE id=s) THEN RAISE EXCEPTION 'Confirmation not activating';END IF;
 UPDATE public.newsletter_subscribers SET suppressed_at=now(),suppression_reason='complaint' WHERE id=s;
 UPDATE public.newsletter_subscribers SET state='active',is_active=true WHERE id=s;
 IF(SELECT state<>'unsubscribed' OR is_active FROM public.newsletter_subscribers WHERE id=s) THEN RAISE EXCEPTION 'Suppression bypass';END IF;
 BEGIN UPDATE public.newsletter_subscribers SET email='different@example.test' WHERE id=s;RAISE EXCEPTION 'Identity rewritten';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NEWSLETTER_RETAINED' THEN RAISE;END IF;END;
 doc:=jsonb_build_object('teamId',t,'record',jsonb_build_object('subject','Fictional draft','content','<script>stored text only</script>','audience','all','recipientIds','[]'::jsonb));
 v:=public.mutate_newsletter_record(member,msid,'campaigns',NULL,'create',NULL,doc,repeat('3',64),repeat('2',64),gen_random_uuid());c:=(v->>'id')::uuid;
 v:=public.mutate_newsletter_record(member,msid,'campaigns',NULL,'create',NULL,doc,repeat('3',64),repeat('2',64),gen_random_uuid());
 IF(v->>'id')::uuid<>c THEN RAISE EXCEPTION 'Campaign create retry duplicated';END IF;
 BEGIN PERFORM public.mutate_newsletter_record(member,msid,'campaigns',c,'update',99,doc,repeat('4',64),repeat('2',64),gen_random_uuid());RAISE EXCEPTION 'Stale campaign accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CONFLICT' THEN RAISE;END IF;END;
 BEGIN PERFORM public.mutate_newsletter_record(member,msid,'campaigns',NULL,'create',NULL,jsonb_set(doc,'{teamId}',to_jsonb(other)),repeat('5',64),repeat('2',64),gen_random_uuid());RAISE EXCEPTION 'Foreign newsletter write';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 UPDATE public.newsletter_campaigns SET status='sent' WHERE id=c;
 BEGIN PERFORM public.mutate_newsletter_record(member,msid,'campaigns',c,'update',1,doc,repeat('4',64),repeat('2',64),gen_random_uuid());RAISE EXCEPTION 'Sent campaign rewritten';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NEWSLETTER_LOCKED' THEN RAISE;END IF;END;
 v:=public.mutate_newsletter_record(member,msid,'campaigns',c,'archive',1,'{}',repeat('6',64),repeat('2',64),gen_random_uuid());
 v:=public.mutate_newsletter_record(member,msid,'campaigns',c,'restore',2,'{}',repeat('7',64),repeat('2',64),gen_random_uuid());
 IF(SELECT status FROM public.newsletter_campaigns WHERE id=c)<>'sent' THEN RAISE EXCEPTION 'Restore reset a sent campaign';END IF;
 UPDATE public.admin_sessions SET revoked_at=now() WHERE id=msid;
 BEGIN PERFORM public.read_newsletter_workspace(member,msid,'subscribers','{}',1,NULL);RAISE EXCEPTION 'Revoked session read';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
END $$;
ROLLBACK;
