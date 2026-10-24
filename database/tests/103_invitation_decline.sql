BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,display_name,role,is_active) VALUES
 ('f1030000-0000-4000-8000-000000000001','decline-admin@example.test','fixture-admin','Fictional inviter','admin',true),
 ('f1030000-0000-4000-8000-000000000002','decline-member@example.test','fixture-member','Fictional recipient','team_member',true);
DO $$ DECLARE a uuid:='f1030000-0000-4000-8000-000000000001';m uuid:='f1030000-0000-4000-8000-000000000002';
 t uuid;s uuid;ms uuid;i uuid;r jsonb;BEGIN
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(a,repeat('a',64)) RETURNING id INTO s;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(m,repeat('b',64)) RETURNING id INTO ms;
 INSERT INTO public.admin_teams(name,slug,team_lead_id,created_by) VALUES('Fictional decline team','fictional-decline',a,a) RETURNING id INTO t;
 INSERT INTO public.team_memberships(team_id,admin_user_id,role) VALUES(t,a,'lead');
 r:=public.mutate_team_invite(a,s,'fixture-admin',t,NULL,NULL,'create','decline-new@example.test','member',repeat('1',64),repeat('z',50),gen_random_uuid());i:=(r->>'id')::uuid;
 r:=public.describe_team_invite(repeat('1',64),'decline-new@example.test');
 IF r->>'inviterName'<>'Fictional inviter' OR r->>'state'<>'pending' OR r::text LIKE '%@%' OR r::text LIKE '%token%' THEN RAISE EXCEPTION 'Invitation display leaked or omitted inviter';END IF;
 IF public.describe_team_invite(repeat('1',64),'wrong@example.test') IS NOT NULL THEN RAISE EXCEPTION 'Wrong recipient inspected invitation';END IF;
 r:=public.decline_team_invite(repeat('1',64),'decline-new@example.test',NULL,NULL,gen_random_uuid());
 IF r<>'{"declined":true}'::jsonb OR (SELECT status FROM public.team_invites WHERE id=i)<>'declined'
  OR EXISTS(SELECT 1 FROM public.admin_users WHERE email='decline-new@example.test')
  OR NOT EXISTS(SELECT 1 FROM public.admin_actions WHERE target_id=i AND action='teams.invite_declined' AND actor_id IS NULL) THEN RAISE EXCEPTION 'New recipient decline created account or missed audit';END IF;
 BEGIN PERFORM public.accept_team_invite(repeat('1',64),'decline-new@example.test',NULL,NULL,'Name','none',gen_random_uuid());RAISE EXCEPTION 'Declined link accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVITE_INVALID' THEN RAISE;END IF;END;
 BEGIN PERFORM public.decline_team_invite(repeat('1',64),'decline-new@example.test',NULL,NULL,gen_random_uuid());RAISE EXCEPTION 'Declined link reused';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVITE_INVALID' THEN RAISE;END IF;END;
 r:=public.mutate_team_invite(a,s,'fixture-admin',t,NULL,NULL,'create','decline-member@example.test','member',repeat('2',64),repeat('z',50),gen_random_uuid());i:=(r->>'id')::uuid;
 BEGIN PERFORM public.decline_team_invite(repeat('2',64),'decline-member@example.test',NULL,NULL,gen_random_uuid());RAISE EXCEPTION 'Account decline skipped sign in';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVITE_SIGNIN_REQUIRED' THEN RAISE;END IF;END;
 BEGIN PERFORM public.decline_team_invite(repeat('2',64),'decline-member@example.test',m,s,gen_random_uuid());RAISE EXCEPTION 'Foreign session declined';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVITE_SIGNIN_REQUIRED' THEN RAISE;END IF;END;
 PERFORM public.decline_team_invite(repeat('2',64),'decline-member@example.test',m,ms,gen_random_uuid());
 IF EXISTS(SELECT 1 FROM public.team_memberships WHERE team_id=t AND admin_user_id=m)
  OR NOT EXISTS(SELECT 1 FROM public.team_activity_log WHERE team_id=t AND actor_id=m AND action='invite_declined') THEN RAISE EXCEPTION 'Existing account decline changed membership or missed activity';END IF;
 IF has_function_privilege('anon','public.describe_team_invite(text,text)','EXECUTE')
  OR has_function_privilege('authenticated','public.decline_team_invite(text,text,uuid,uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Browser decline grants exist';END IF;
END $$;
ROLLBACK;
