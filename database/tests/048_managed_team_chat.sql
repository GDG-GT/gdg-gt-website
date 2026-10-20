BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES
 ('e1000000-0000-4000-8000-000000000001','chat-admin@example.test','fixture-admin','admin',true),
 ('e1000000-0000-4000-8000-000000000002','chat-lead@example.test','fixture-lead','team_member',true),
 ('e1000000-0000-4000-8000-000000000003','chat-co@example.test','fixture-co','team_member',true),
 ('e1000000-0000-4000-8000-000000000004','chat-member@example.test','fixture-member','team_member',true),
 ('e1000000-0000-4000-8000-000000000005','chat-outsider@example.test','fixture-outsider','team_member',true),
 ('e1000000-0000-4000-8000-000000000006','chat-editor@example.test','fixture-editor','blog_editor',true);
DO $$ DECLARE a uuid:='e1000000-0000-4000-8000-000000000001';l uuid:='e1000000-0000-4000-8000-000000000002';co uuid:='e1000000-0000-4000-8000-000000000003';
 m uuid:='e1000000-0000-4000-8000-000000000004';o uuid:='e1000000-0000-4000-8000-000000000005';ed uuid:='e1000000-0000-4000-8000-000000000006';
 t uuid;s uuid;ls uuid;cs uuid;ms uuid;c uuid;r jsonb;rev integer;BEGIN
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(a,repeat('1',64)) RETURNING id INTO s;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(l,repeat('2',64)) RETURNING id INTO ls;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(co,repeat('3',64)) RETURNING id INTO cs;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(m,repeat('4',64)) RETURNING id INTO ms;
 INSERT INTO public.admin_teams(name,slug,team_lead_id,created_by) VALUES('Fictional managed chat team','fictional-managed-chat',l,a) RETURNING id INTO t;
 INSERT INTO public.team_memberships(team_id,admin_user_id,role) VALUES(t,l,'lead'),(t,co,'co_lead'),(t,m,'member');
 IF public.team_chat_workspace(m,t)->'channel'<>'null'::jsonb THEN RAISE EXCEPTION 'Read-only lookup provisioned a chat';END IF;
 BEGIN PERFORM public.ensure_managed_team_chat(m,ms,'fixture-member',t,'Fictional managed chat team',gen_random_uuid());RAISE EXCEPTION 'Ordinary member provisioned chat';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 r:=public.ensure_managed_team_chat(l,ls,'fixture-lead',t,'Fictional managed chat team',gen_random_uuid());c:=(r->'channel'->>'id')::uuid;
 PERFORM public.ensure_managed_team_chat(co,cs,'fixture-co',t,'Fictional managed chat team',gen_random_uuid());
 IF(SELECT count(*) FROM public.channels WHERE team_id=t AND is_team_chat)<>1 THEN RAISE EXCEPTION 'Duplicate managed chat';END IF;
 IF NOT public.can_operate_channel(m,c,'read') OR NOT public.can_operate_channel(m,c,'send') OR public.can_operate_channel(m,c,'manage') OR public.can_operate_channel(o,c,'read') THEN RAISE EXCEPTION 'Current membership scope failed';END IF;
 IF NOT public.can_operate_channel(l,c,'moderate') OR NOT public.can_operate_channel(co,c,'manage') OR public.can_operate_channel(a,c,NULL) THEN RAISE EXCEPTION 'Lead authority or null action failed';END IF;
 INSERT INTO public.channel_memberships(channel_id,admin_user_id,role) VALUES(c,l,'owner') ON CONFLICT(channel_id,admin_user_id) DO UPDATE SET role='owner';
 UPDATE public.team_memberships SET role='member' WHERE team_id=t AND admin_user_id=l;
 IF public.can_operate_channel(l,c,'manage') OR public.can_operate_channel(l,c,'moderate') OR NOT public.can_operate_channel(l,c,'send') THEN RAISE EXCEPTION 'Former lead retained owner authority';END IF;
 UPDATE public.team_memberships SET is_active=false WHERE team_id=t AND admin_user_id=m;
 IF public.can_operate_channel(m,c,'read') THEN RAISE EXCEPTION 'Removed member retained history access';END IF;
 INSERT INTO public.team_memberships(team_id,admin_user_id,role) VALUES(t,o,'member'),(t,ed,'member');
 IF NOT public.can_operate_channel(o,c,'read') OR public.can_operate_channel(ed,c,'read') THEN RAISE EXCEPTION 'Automatic team admission widened parent-role policy';END IF;
 BEGIN PERFORM public.mutate_channel(co,cs,'fixture-co',c,'member_add',1,jsonb_build_object('email','chat-outsider@example.test','role','owner'),gen_random_uuid());RAISE EXCEPTION 'Explicit room role changed team authority';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'TEAM_MANAGED_CHAT' THEN RAISE;END IF;END;
 r:=public.mutate_channel(co,cs,'fixture-co',c,'archive',1,'{}',gen_random_uuid());
 IF public.can_operate_channel(o,c,'send') OR NOT public.can_operate_channel(o,c,'read') THEN RAISE EXCEPTION 'Archive did not become read-only';END IF;
 r:=public.mutate_channel(co,cs,'fixture-co',c,'restore',2,'{}',gen_random_uuid());
 IF NOT public.can_operate_channel(o,c,'send') OR r->>'revision'<>'3' THEN RAISE EXCEPTION 'Current co-lead cannot restore managed team chat';END IF;
 PERFORM public.mutate_channel(co,cs,'fixture-co',c,'archive',3,'{}',gen_random_uuid());
 UPDATE public.admin_teams SET is_active=false WHERE id=t;
 IF public.can_operate_channel(a,c,'send') OR public.can_operate_channel(a,c,'manage') OR NOT public.can_operate_channel(a,c,'read') OR public.can_operate_channel(o,c,'read') THEN RAISE EXCEPTION 'Inactive-team access failed';END IF;
 BEGIN PERFORM public.mutate_channel(a,s,'fixture-admin',c,'restore',4,'{}',gen_random_uuid());RAISE EXCEPTION 'Inactive-team chat restored';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVALID_STATE' THEN RAISE;END IF;END;
 IF has_function_privilege('anon','public.ensure_managed_team_chat(uuid,uuid,text,uuid,text,uuid)','EXECUTE') OR has_function_privilege('gdg_realtime','public.mutate_channel_standard(uuid,uuid,text,uuid,text,integer,jsonb,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Browser team-chat mutation grants exist';END IF;
END $$;
ROLLBACK;
