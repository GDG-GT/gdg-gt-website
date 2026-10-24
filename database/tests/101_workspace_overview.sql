BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES
 ('f1010000-0000-4000-8000-000000000001','overview-admin@example.test','fictional-admin','admin',true),
 ('f1010000-0000-4000-8000-000000000002','overview-member@example.test','fictional-member','team_member',true),
 ('f1010000-0000-4000-8000-000000000003','overview-peer@example.test','fictional-peer','team_member',true),
 ('f1010000-0000-4000-8000-000000000004','overview-editor@example.test','fictional-editor','blog_editor',true);
DO $$ DECLARE a uuid:='f1010000-0000-4000-8000-000000000001';m uuid:='f1010000-0000-4000-8000-000000000002';
 o uuid:='f1010000-0000-4000-8000-000000000003';ed uuid:='f1010000-0000-4000-8000-000000000004';
 s uuid;ms uuid;eds uuid;t uuid;e uuid;e2 uuid;msg jsonb;r jsonb;BEGIN
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(a,repeat('a',64)) RETURNING id INTO s;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(m,repeat('b',64)) RETURNING id INTO ms;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(ed,repeat('c',64)) RETURNING id INTO eds;
 INSERT INTO public.admin_teams(name,slug,team_lead_id,created_by) VALUES('Fictional overview team','fictional-overview',m,a) RETURNING id INTO t;
 INSERT INTO public.team_memberships(team_id,admin_user_id,role) VALUES(t,m,'lead');
 INSERT INTO public.team_page_access(team_id,page_path,can_access) VALUES(t,'/admin/events',true),(t,'/admin/communications',true);
 INSERT INTO public.team_permissions(team_id,resource_type,permission,can_read) VALUES(t,'events','crud',true),(t,'communications','crud',true);
 INSERT INTO public.events(title,description,start_at,location,slug,team_id,external_attendees)
  VALUES('Fictional scoped event','Fixture',now(),'Test only','fictional-overview-scoped',t,3) RETURNING id INTO e;
 INSERT INTO public.events(title,description,start_at,location,slug)
  VALUES('Fictional private event','Fixture',now(),'Test only','fictional-overview-private') RETURNING id INTO e2;
 INSERT INTO public.event_attendance(event_id,attendee_name,attendee_email,idempotency_key,request_hash) VALUES
  (e,'Fictional Person','overview-1@example.test',repeat('1',64),repeat('1',64)),
  (e,'Fictional Removed','overview-2@example.test',repeat('2',64),repeat('2',64));
 UPDATE public.event_attendance SET deleted_at=now() WHERE attendee_email='overview-2@example.test';
 r:=public.read_workspace_widget(m,ms,'registrations');
 IF r->>'totalEvents'<>'1' OR r->'items'->0->>'internal'<>'1' OR r->'items'->0->>'external'<>'3'
  OR r::text LIKE '%attendee_email%' OR r::text LIKE '%Fictional private%' THEN RAISE EXCEPTION 'Event chart scope/count failed';END IF;
 INSERT INTO public.finances(transaction_type,category,amount,description,transaction_date,created_by,status) VALUES
  ('income','Donations',40.10,'Fictional own pending',current_date,m,'pending'),
  ('income','Donations',0.11,'Fictional other pending',current_date,o,'pending'),
  ('expense','Event Costs',99.00,'Fictional expense',current_date,m,'pending');
 r:=public.read_workspace_widget(m,ms,'funding');
 IF r->'items'->0->>'amount'<>'40.10' OR r->'items'->0->>'count'<>'1'
  OR public.read_workspace_widget(a,s,'funding')->'items'->0->>'amount'<>'40.21'
  OR public.read_workspace_widget(ed,eds,'funding')->'items'->0->>'count'<>'0' THEN RAISE EXCEPTION 'Funding scope or exact cents failed';END IF;
 INSERT INTO public.communication_tasks(title,assigned_by_id,assigned_to_id,team_id,status)
  VALUES('Fictional scoped task',a,m,t,'pending'),('Fictional archived task',a,m,t,'completed'),('Fictional peer task',a,o,NULL,'pending');
 IF public.read_workspace_widget(m,ms,'tasks')->>'count'<>'1' THEN RAISE EXCEPTION 'Task count failed';END IF;
 UPDATE public.team_memberships SET is_active=false WHERE team_id=t AND admin_user_id=m;
 IF public.read_workspace_widget(m,ms,'tasks')->>'count'<>'0'
  OR public.read_workspace_widget(m,ms,'registrations')->>'totalEvents'<>'0' THEN RAISE EXCEPTION 'Revoked membership retained dashboard content';END IF;
 msg:=public.mutate_direct_message(a,s,NULL,NULL,'create',NULL,
  '{"recipientEmail":"overview-member@example.test","subject":"Fictional subject","message":"Private message body"}',repeat('d',64),repeat('d',64),gen_random_uuid());
 r:=public.read_workspace_widget(m,ms,'messages');
 IF r<>'{"unread":1}'::jsonb OR public.read_workspace_widget(a,s,'messages')<>'{"unread":0}'::jsonb THEN RAISE EXCEPTION 'Unread projection leaked or miscounted';END IF;
 PERFORM public.mutate_direct_message(m,ms,(msg->>'id')::uuid,NULL,'archive',
  (public.direct_thread_projection(m,ms,(msg->>'id')::uuid)->>'stateRevision')::integer,'{}',repeat('e',64),repeat('e',64),gen_random_uuid());
 IF public.read_workspace_widget(m,ms,'messages')<>'{"unread":0}'::jsonb THEN RAISE EXCEPTION 'Archived message counted';END IF;
 BEGIN PERFORM public.read_workspace_widget(m,s,'messages');RAISE EXCEPTION 'Foreign session accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.read_workspace_widget(m,ms,'other');RAISE EXCEPTION 'Unknown widget accepted';EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
 UPDATE public.admin_sessions SET revoked_at=now() WHERE id=ms;
 BEGIN PERFORM public.read_workspace_widget(m,ms,'tasks');RAISE EXCEPTION 'Revoked session accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 IF has_function_privilege('anon','public.read_workspace_widget(uuid,uuid,text)','EXECUTE')
  OR has_function_privilege('authenticated','public.read_workspace_widget(uuid,uuid,text)','EXECUTE')
  OR has_function_privilege('gdg_realtime','public.read_workspace_widget(uuid,uuid,text)','EXECUTE')
  OR NOT has_function_privilege('service_role','public.read_workspace_widget(uuid,uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'Widget grants incorrect';END IF;
END $$;
ROLLBACK;
