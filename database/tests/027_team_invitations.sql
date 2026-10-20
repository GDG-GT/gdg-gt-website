BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES
 ('d7000000-0000-4000-8000-000000000001','invite-admin@example.test','fixture-admin','admin',true),
 ('d7000000-0000-4000-8000-000000000002','invite-existing@example.test','fixture-existing','team_member',true);
DO $$ DECLARE s uuid;existing_s uuid;r jsonb;team uuid;i uuid;new_user public.admin_users;hash text:='scrypt$32768$8$1$'||repeat('A',22)||'$'||repeat('B',86);BEGIN
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES('d7000000-0000-4000-8000-000000000001',repeat('7',64)) RETURNING id INTO s;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES('d7000000-0000-4000-8000-000000000002',repeat('8',64)) RETURNING id INTO existing_s;
 r:=public.mutate_team('d7000000-0000-4000-8000-000000000001',s,'fixture-admin',NULL,'create',NULL,
  '{"name":"Fictional invitation team","slug":"fictional-invitation-team","leadId":"d7000000-0000-4000-8000-000000000001","color":"#4285F4","icon":"users"}',gen_random_uuid());team:=(r->'team'->>'id')::uuid;
 r:=public.mutate_team_invite('d7000000-0000-4000-8000-000000000001',s,'fixture-admin',team,NULL,NULL,'create',
  'invite-new@example.test','member',repeat('9',64),repeat('encrypted-placeholder',4),gen_random_uuid());i:=(r->>'id')::uuid;
 IF r?'token_hash' OR r?'token' OR public.inspect_team_invite(repeat('9',64),'wrong@example.test') IS NOT NULL THEN RAISE EXCEPTION 'Invitation identity/secrets invalid';END IF;
 r:=public.accept_team_invite(repeat('9',64),'invite-new@example.test',NULL,NULL,'Fictional new member',hash,gen_random_uuid());
 SELECT * INTO new_user FROM public.admin_users WHERE email='invite-new@example.test';
 IF NOT (r->>'accepted')::boolean OR new_user.role<>'team_member' OR new_user.must_change_password OR
  NOT EXISTS(SELECT 1 FROM public.team_memberships WHERE team_id=team AND admin_user_id=new_user.id AND role='member' AND is_active) THEN RAISE EXCEPTION 'Invitation new-account role bypass';END IF;
 IF public.inspect_team_invite(repeat('9',64),'invite-new@example.test') IS NOT NULL THEN RAISE EXCEPTION 'Consumed invitation still live';END IF;
 BEGIN
  PERFORM public.accept_team_invite(repeat('9',64),'invite-new@example.test',NULL,NULL,'Fictional replay',hash,gen_random_uuid());RAISE EXCEPTION 'Invitation replay accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVITE_INVALID' THEN RAISE;END IF;END;
 r:=public.mutate_team_invite('d7000000-0000-4000-8000-000000000001',s,'fixture-admin',team,NULL,NULL,'create',
  'invite-existing@example.test','co_lead',repeat('a',64),repeat('encrypted-placeholder',4),gen_random_uuid());i:=(r->>'id')::uuid;
 BEGIN
  PERFORM public.accept_team_invite(repeat('a',64),'invite-existing@example.test',NULL,NULL,'Overwrite credentials',hash,gen_random_uuid());RAISE EXCEPTION 'Existing account taken over';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVITE_SIGNIN_REQUIRED' THEN RAISE;END IF;END;
 r:=public.accept_team_invite(repeat('a',64),'invite-existing@example.test','d7000000-0000-4000-8000-000000000002',existing_s,NULL,NULL,gen_random_uuid());
 IF NOT (r->>'accepted')::boolean OR NOT EXISTS(SELECT 1 FROM public.admin_users WHERE id='d7000000-0000-4000-8000-000000000002' AND password_hash='fixture-existing' AND role='team_member') THEN RAISE EXCEPTION 'Invitation changes existing account credentials or chapter role';END IF;
 IF has_function_privilege('anon','public.accept_team_invite(text,text,uuid,uuid,text,text,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Browser invitation RPC exposed';END IF;
END $$;
ROLLBACK;
