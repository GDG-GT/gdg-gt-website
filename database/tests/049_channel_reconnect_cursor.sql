BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES
 ('e2000000-0000-4000-8000-000000000001','cursor-admin@example.test','fixture','admin',true),
 ('e2000000-0000-4000-8000-000000000002','cursor-outsider@example.test','fixture','team_member',true);
DO $$ DECLARE a uuid:='e2000000-0000-4000-8000-000000000001';o uuid:='e2000000-0000-4000-8000-000000000002';
 c uuid;m uuid;r jsonb;after_seq bigint;next_seq bigint;BEGIN
 INSERT INTO public.channels(name,visibility,created_by) VALUES('Fictional cursor test','private',a) RETURNING id INTO c;
 INSERT INTO public.channel_messages(channel_id,sender_id,message,message_type) VALUES(c,a,'Original retained message','text') RETURNING id INTO m;
 r:=public.list_channel_messages(a,c,NULL,NULL,false);after_seq:=(r->>'highWaterMark')::bigint;
 IF after_seq<>1 OR jsonb_array_length(r->'items')<>1 THEN RAISE EXCEPTION 'Initial history and high watermark inconsistent';END IF;
 INSERT INTO public.channel_messages(channel_id,sender_id,message,message_type)
 SELECT c,a,'Fictional missed message '||n,'text' FROM generate_series(1,125)n;
 UPDATE public.channel_messages SET message='Changed while disconnected',revision=revision+1 WHERE id=m;
 r:=public.list_channel_changes(a,c,after_seq);next_seq:=(r->>'cursor')::bigint;
 IF jsonb_array_length(r->'items')<>100 OR NOT(r->>'hasMore')::boolean OR next_seq<>101 THEN RAISE EXCEPTION 'First catch-up page skipped a >50-message gap';END IF;
 r:=public.list_channel_changes(a,c,next_seq);
 IF jsonb_array_length(r->'items')<>26 OR (r->>'hasMore')::boolean OR r->>'cursor'<>'127'
  OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r->'items')i WHERE i->>'id'=m::text AND i->>'message'='Changed while disconnected') THEN RAISE EXCEPTION 'Second page lost missed messages or old edit';END IF;
 BEGIN
  INSERT INTO public.channel_messages(channel_id,sender_id,message,message_type) VALUES(c,a,'Rolled back message','text');
  RAISE EXCEPTION 'fixture_rollback';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'fixture_rollback' THEN RAISE;END IF;END;
 IF(SELECT message_sequence FROM public.channels WHERE id=c)<>127 THEN RAISE EXCEPTION 'Aborted write advanced acknowledged sequence';END IF;
 UPDATE public.channel_messages SET is_deleted=true,revision=revision+1 WHERE id=m;
 r:=public.list_channel_changes(a,c,127);
 IF jsonb_array_length(r->'items')<>1 OR r->'items'->0->>'message'<>'' OR NOT(r->'items'->0->>'is_deleted')::boolean THEN RAISE EXCEPTION 'Catch-up tombstone leaked removed body';END IF;
 BEGIN PERFORM public.list_channel_changes(o,c,0);RAISE EXCEPTION 'Outsider received channel changes';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 BEGIN PERFORM public.list_channel_changes(a,c,9999);RAISE EXCEPTION 'Future cursor accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVALID_STATE' THEN RAISE;END IF;END;
 IF has_function_privilege('authenticated','public.list_channel_changes(uuid,uuid,bigint)','EXECUTE') OR
  has_function_privilege('gdg_realtime','public.channel_message_projection(uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Browser can bypass the HTTP catch-up boundary';END IF;
END $$;
ROLLBACK;
