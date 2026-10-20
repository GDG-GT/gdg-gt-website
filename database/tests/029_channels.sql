BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES
 ('d9000000-0000-4000-8000-000000000001','channel-admin@example.test','fixture-admin','admin',true),
 ('d9000000-0000-4000-8000-000000000002','channel-member@example.test','fixture-member','team_member',true),
 ('d9000000-0000-4000-8000-000000000003','channel-outsider@example.test','fixture-outsider','team_member',true);
DO $$ DECLARE s uuid;member_s uuid;r jsonb;c uuid;other_channel uuid;message uuid;reply uuid;BEGIN
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES('d9000000-0000-4000-8000-000000000001',repeat('a',64)) RETURNING id INTO s;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES('d9000000-0000-4000-8000-000000000002',repeat('b',64)) RETURNING id INTO member_s;
 r:=public.mutate_channel('d9000000-0000-4000-8000-000000000001',s,'fixture-admin',NULL,'create',NULL,'{"name":"Fictional private room","description":"Test only","visibility":"private","teamId":null}',gen_random_uuid());c:=(r->>'id')::uuid;
 IF public.can_operate_channel('d9000000-0000-4000-8000-000000000002',c,'read') OR
  public.can_operate_channel('d9000000-0000-4000-8000-000000000002',c,'manage') IS DISTINCT FROM false THEN RAISE EXCEPTION 'Private channel scope or NULL authorization bypass';END IF;
 r:=public.mutate_channel('d9000000-0000-4000-8000-000000000001',s,'fixture-admin',c,'member_add',1,'{"email":"channel-member@example.test","role":"member"}',gen_random_uuid());
 IF NOT public.can_operate_channel('d9000000-0000-4000-8000-000000000002',c,'send') OR
  public.can_operate_channel('d9000000-0000-4000-8000-000000000002',c,'manage') OR public.can_operate_channel('d9000000-0000-4000-8000-000000000003',c,'read') THEN RAISE EXCEPTION 'Channel membership grants incorrect';END IF;
 r:=public.mutate_channel_message('d9000000-0000-4000-8000-000000000002',member_s,c,NULL,'send',NULL,'{"message":"Private fictional message"}',repeat('1',64),repeat('2',64),gen_random_uuid());message:=(r->>'id')::uuid;
 r:=public.mutate_channel_message('d9000000-0000-4000-8000-000000000002',member_s,c,NULL,'send',NULL,'{"message":"Private fictional message"}',repeat('1',64),repeat('2',64),gen_random_uuid());
 IF (r->>'id')::uuid<>message OR (SELECT count(*) FROM public.channel_messages WHERE channel_id=c)<>1 THEN RAISE EXCEPTION 'Message idempotency failed';END IF;
 BEGIN
  PERFORM public.mutate_channel_message('d9000000-0000-4000-8000-000000000001',s,c,message,'edit',1,'{"message":"Not the sender"}',NULL,NULL,gen_random_uuid());RAISE EXCEPTION 'Administrator silently edited another sender message';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN
  PERFORM public.mutate_channel_message('d9000000-0000-4000-8000-000000000002',member_s,c,message,'pin',1,'{"pinned":true}',NULL,NULL,gen_random_uuid());RAISE EXCEPTION 'Ordinary member pinned a message';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 r:=public.mutate_channel('d9000000-0000-4000-8000-000000000001',s,'fixture-admin',NULL,'create',NULL,'{"name":"Fictional other room","description":"Test only","visibility":"internal","teamId":null}',gen_random_uuid());other_channel:=(r->>'id')::uuid;
 IF public.can_operate_channel('d9000000-0000-4000-8000-000000000003',other_channel,'manage') IS DISTINCT FROM false THEN RAISE EXCEPTION 'Internal room non-owner NULL bypass';END IF;
 BEGIN
  PERFORM public.mutate_channel_message('d9000000-0000-4000-8000-000000000002',member_s,other_channel,NULL,'send',NULL,jsonb_build_object('message','Cross-room reply','replyToId',message),repeat('3',64),repeat('4',64),gen_random_uuid());RAISE EXCEPTION 'Cross-channel reply accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVALID_STATE' THEN RAISE;END IF;END;
 r:=public.mutate_channel_message('d9000000-0000-4000-8000-000000000001',s,c,NULL,'send',NULL,jsonb_build_object('message','Fictional reply','replyToId',message),repeat('5',64),repeat('6',64),gen_random_uuid());reply:=(r->>'id')::uuid;
 PERFORM public.mutate_channel_message('d9000000-0000-4000-8000-000000000002',member_s,c,message,'delete',1,'{}',NULL,NULL,gen_random_uuid());
 r:=public.list_channel_messages('d9000000-0000-4000-8000-000000000002',c,NULL,NULL,false);
 IF r::text LIKE '%Private fictional message%' THEN RAISE EXCEPTION 'Deleted message body or reply preview leaks';END IF;
 PERFORM public.mutate_channel_message('d9000000-0000-4000-8000-000000000002',member_s,c,reply,'read',NULL,'{}',NULL,NULL,gen_random_uuid());
 r:=public.list_channels('d9000000-0000-4000-8000-000000000002',1,NULL,false);
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(r->'items') i WHERE i->>'id'=c::text AND (i->>'unreadCount')::integer<>0) THEN RAISE EXCEPTION 'Read marker not reflected in unread count';END IF;
 IF has_function_privilege('authenticated','public.list_channel_messages(uuid,uuid,timestamptz,uuid,boolean)','EXECUTE') THEN RAISE EXCEPTION 'Browser RPC exposes messages';END IF;
END $$;
ROLLBACK;
