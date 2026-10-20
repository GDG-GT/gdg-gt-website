BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES
 ('de000000-0000-4000-8000-000000000001','direct-a@example.test','fixture-a','team_member',true),
 ('de000000-0000-4000-8000-000000000002','direct-b@example.test','fixture-b','blog_editor',true),
 ('de000000-0000-4000-8000-000000000003','direct-admin@example.test','fixture-c','admin',true),
 ('de000000-0000-4000-8000-000000000004','direct-super@example.test','fixture-d','super_admin',true);
DO $$ DECLARE a uuid:='de000000-0000-4000-8000-000000000001';b uuid:='de000000-0000-4000-8000-000000000002';
 c uuid:='de000000-0000-4000-8000-000000000003';d uuid:='de000000-0000-4000-8000-000000000004';s uuid;bs uuid;cs uuid;ds uuid;ds2 uuid;
 r jsonb;g jsonb;claims jsonb;t uuid;m uuid;reply uuid;rev integer;j public.delivery_jobs;BEGIN
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(a,repeat('1',64)) RETURNING id INTO s;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(b,repeat('2',64)) RETURNING id INTO bs;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(c,repeat('3',64)) RETURNING id INTO cs;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(d,repeat('4',64)) RETURNING id INTO ds;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(d,repeat('5',64)) RETURNING id INTO ds2;
 r:=public.mutate_direct_message(a,s,NULL,NULL,'create',NULL,'{"recipientEmail":"direct-b@example.test","subject":"Fictional private subject","message":"Private alpha"}',repeat('a',64),repeat('a',64),gen_random_uuid());t:=(r->>'id')::uuid;m:=(r->>'messageId')::uuid;
 IF public.can_read_direct_thread(c,cs,t) OR public.can_read_direct_thread(d,ds,t) OR NOT public.can_read_direct_thread(b,bs,t) THEN RAISE EXCEPTION 'Direct scope failed';END IF;
 IF public.list_direct_threads(d,ds,'','own',false,NULL,NULL)->>'total'<>'0' THEN RAISE EXCEPTION 'Super inbox leaked unrelated thread';END IF;
 IF public.mutate_direct_message(a,s,NULL,NULL,'create',NULL,'{}',repeat('a',64),repeat('a',64),gen_random_uuid())<>r THEN RAISE EXCEPTION 'Idempotent create failed';END IF;
 BEGIN PERFORM public.mutate_direct_message(b,bs,t,m,'edit',1,'{"message":"Forged"}',repeat('b',64),repeat('b',64),gen_random_uuid());RAISE EXCEPTION 'Recipient edited author';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 r:=public.mutate_direct_message(b,bs,t,NULL,'reply',NULL,jsonb_build_object('message','Private beta','replyToId',m),repeat('c',64),repeat('c',64),gen_random_uuid());reply:=(r->>'messageId')::uuid;
 PERFORM public.mutate_direct_message(a,s,t,NULL,'read',NULL,jsonb_build_object('throughId',reply),repeat('d',64),repeat('d',64),gen_random_uuid());
 IF NOT(SELECT is_read FROM public.internal_messages WHERE id=reply) OR(SELECT is_read FROM public.internal_messages WHERE id=m) THEN RAISE EXCEPTION 'Recipient read boundary failed';END IF;
 rev:=(public.direct_thread_projection(a,s,t)->>'stateRevision')::integer;
 PERFORM public.mutate_direct_message(a,s,t,NULL,'archive',rev,'{}',repeat('e',64),repeat('e',64),gen_random_uuid());
 IF public.direct_thread_projection(b,bs,t)->>'archived'<>'false' OR public.direct_thread_projection(a,s,t)->>'archived'<>'true' THEN RAISE EXCEPTION 'Archive affects peer';END IF;
 PERFORM public.mutate_direct_message(a,s,t,m,'delete',1,'{}',repeat('f',64),repeat('f',64),gen_random_uuid());
 r:=public.list_direct_messages(b,bs,t,NULL,NULL);
 IF(SELECT item->>'message' FROM jsonb_array_elements(r->'items') item WHERE item->>'id'=m::text)<>'' OR
  (SELECT item->>'replyPreview' FROM jsonb_array_elements(r->'items') item WHERE item->>'id'=reply::text)<>'Message removed' THEN RAISE EXCEPTION 'Tombstone leaked text';END IF;
 PERFORM public.mutate_direct_message(a,s,t,m,'restore_message',2,'{}',repeat('0',64),repeat('0',64),gen_random_uuid());
 SELECT * INTO j FROM public.delivery_jobs WHERE payload->>'messageId'=m::text;
 UPDATE public.delivery_jobs SET state='running',lease_token=gen_random_uuid(),locked_until=now()+interval '1 minute' WHERE id=j.id RETURNING * INTO j;
 IF public.prepare_direct_notice(j.id,gen_random_uuid()) IS NOT NULL THEN RAISE EXCEPTION 'Wrong lease sent a private notice';END IF;
 IF public.prepare_direct_notice(j.id,j.lease_token)->>'email'<>'direct-b@example.test' THEN RAISE EXCEPTION 'Current recipient notice preparation failed';END IF;
 PERFORM public.prepare_direct_notice(j.id,j.lease_token);
 IF(SELECT count(*) FROM public.notifications WHERE delivery_key='direct-message:'||m)<>1 THEN RAISE EXCEPTION 'Private notice deduplication failed';END IF;
 UPDATE public.admin_users SET is_active=false WHERE id=b;
 IF public.prepare_direct_notice(j.id,j.lease_token) IS NOT NULL THEN RAISE EXCEPTION 'Inactive account notice was prepared';END IF;
 UPDATE public.admin_users SET is_active=true WHERE id=b;
 BEGIN PERFORM public.mutate_direct_message(a,s,t,m,'edit',1,'{"message":"Stale"}',repeat('1',64),repeat('1',64),gen_random_uuid());RAISE EXCEPTION 'Stale write accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CONFLICT' THEN RAISE;END IF;END;
 BEGIN PERFORM public.mutate_direct_review(c,cs,'start','fixture-c','Fictional investigation',gen_random_uuid());RAISE EXCEPTION 'Admin obtained oversight';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.mutate_direct_review(d,ds,'start','wrong','Fictional investigation',gen_random_uuid());RAISE EXCEPTION 'Wrong proof obtained oversight';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM public.mutate_direct_review(d,ds,'start','fixture-d','Fictional investigation',gen_random_uuid());
 IF NOT public.can_read_direct_thread(d,ds,t) OR public.can_read_direct_thread(d,ds2,t) THEN RAISE EXCEPTION 'Review session boundary failed';END IF;
 BEGIN PERFORM public.mutate_direct_message(d,ds,t,NULL,'read',NULL,jsonb_build_object('throughId',m),repeat('2',64),repeat('2',64),gen_random_uuid());RAISE EXCEPTION 'Reviewer marked peers read';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 UPDATE gdg_security.direct_review_sessions SET expires_at=now()+interval '30 seconds' WHERE session_id=ds;
 g:=public.issue_realtime_grant(d,ds,'direct-thread',t,gen_random_uuid());
 IF(g->>'expiresAt')::bigint>extract(epoch FROM now())+30 OR g->>'topic'<>'gdg:direct-thread:'||t THEN RAISE EXCEPTION 'Review JWT outlived proof or wrong topic';END IF;
 claims:=jsonb_build_object('role','gdg_realtime','sub',d,'session_id',ds,'jti',g->>'id','iat',g->'issuedAt','exp',g->'expiresAt','permission_version',g->'permissionVersion','topics',jsonb_build_array(g->>'topic'));
 PERFORM set_config('request.jwt.claims',claims::text,true);
 IF NOT gdg_security.realtime_allowed(g->>'topic') OR gdg_security.realtime_allowed('gdg:direct-thread:'||gen_random_uuid()) THEN RAISE EXCEPTION 'Direct topic policy failed';END IF;
 PERFORM public.mutate_direct_review(d,ds,'stop',NULL,NULL,gen_random_uuid());
 IF public.can_read_direct_thread(d,ds,t) OR gdg_security.realtime_allowed(g->>'topic') THEN RAISE EXCEPTION 'Stopped review retained scope';END IF;
 UPDATE public.admin_sessions SET revoked_at=now() WHERE id=s;
 IF public.can_read_direct_thread(a,s,t) THEN RAISE EXCEPTION 'Revoked participant retained scope';END IF;
 IF has_table_privilege('gdg_realtime','public.direct_message_threads','SELECT,UPDATE') OR has_table_privilege('anon','public.direct_thread_states','SELECT') OR has_function_privilege('authenticated','public.list_direct_messages(uuid,uuid,uuid,timestamptz,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Browser direct data grants exist';END IF;
END $$;
ROLLBACK;
