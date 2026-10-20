BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active,display_name) VALUES
 ('d5000000-0000-4000-8000-000000000001','team-super@example.test','fixture-super','super_admin',true,'Fictional admin'),
 ('d5000000-0000-4000-8000-000000000002','team-lead@example.test','fixture-lead','team_member',true,'Fictional lead'),
 ('d5000000-0000-4000-8000-000000000003','team-member@example.test','fixture-member','team_member',true,'Fictional member'),
 ('d5000000-0000-4000-8000-000000000004','team-outsider@example.test','fixture-outsider','team_member',true,'Fictional outsider');
DO $$ DECLARE s uuid;lead_session uuid;r jsonb;source uuid;dest uuid;m public.team_memberships;BEGIN
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES('d5000000-0000-4000-8000-000000000001',repeat('a',64)) RETURNING id INTO s;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES('d5000000-0000-4000-8000-000000000002',repeat('b',64)) RETURNING id INTO lead_session;
 r:=public.mutate_team('d5000000-0000-4000-8000-000000000001',s,'fixture-super',NULL,'create',NULL,
  '{"name":"Fictional SQL team","description":"Test only","slug":"fictional-sql-team","leadId":"d5000000-0000-4000-8000-000000000002","color":"#4285F4","icon":"users"}',gen_random_uuid());source:=(r->'team'->>'id')::uuid;
 IF (r->'statistics'->>'activeMembers')::integer<>1 OR NOT public.can_operate_team('d5000000-0000-4000-8000-000000000002',source,'manage')
  OR public.can_operate_team('d5000000-0000-4000-8000-000000000002',source,'permissions') OR public.can_operate_team('d5000000-0000-4000-8000-000000000004',source,'read') THEN RAISE EXCEPTION 'Team scope mismatch';END IF;
 SELECT * INTO m FROM public.team_memberships WHERE team_id=source AND role='lead';
 BEGIN
  PERFORM public.mutate_team('d5000000-0000-4000-8000-000000000001',s,'fixture-super',source,'member_remove',1,
   jsonb_build_object('membershipId',m.id,'membershipRevision',m.revision,'role','member'),gen_random_uuid());RAISE EXCEPTION 'Final lead removed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'LAST_TEAM_LEAD' THEN RAISE;END IF;END;
 BEGIN
  UPDATE public.admin_users SET is_active=false WHERE id='d5000000-0000-4000-8000-000000000002';RAISE EXCEPTION 'Final lead account disabled';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'LAST_TEAM_LEAD' THEN RAISE;END IF;END;
 r:=public.mutate_team('d5000000-0000-4000-8000-000000000002',lead_session,'fixture-lead',source,'member_add',1,
  '{"email":"team-member@example.test","role":"member"}',gen_random_uuid());
 IF (r->'statistics'->>'activeMembers')::integer<>2 THEN RAISE EXCEPTION 'Scoped member add failed';END IF;
 SELECT * INTO m FROM public.team_memberships WHERE team_id=source AND role='member';
 BEGIN
  PERFORM public.mutate_team('d5000000-0000-4000-8000-000000000002',lead_session,'fixture-lead',source,'member_role',2,
   jsonb_build_object('membershipId',m.id,'membershipRevision',m.revision,'role','lead'),gen_random_uuid());RAISE EXCEPTION 'Lead elevated another officer';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 r:=public.team_workspace('d5000000-0000-4000-8000-000000000003',source);
 IF r->'members'->0->'user'->>'email' IS NOT NULL THEN RAISE EXCEPTION 'Ordinary member sees private account emails';END IF;
 r:=public.mutate_team('d5000000-0000-4000-8000-000000000001',s,'fixture-super',source,'permissions',2,
  '{"grants":[{"path":"/admin/resources","resource":"resources","create":false,"read":true,"update":false,"delete":false,"extras":[]}]}',gen_random_uuid());
 IF NOT public.can_operate_content('d5000000-0000-4000-8000-000000000003','resources','read',source)
  OR public.can_operate_content('d5000000-0000-4000-8000-000000000003','resources','update',source) THEN RAISE EXCEPTION 'Page/action grants not honored';END IF;
 BEGIN
  PERFORM public.mutate_team('d5000000-0000-4000-8000-000000000001',s,'fixture-super',source,'permissions',3,
   '{"grants":[{"path":"/admin/users","resource":"admin_users","create":true,"read":true,"update":true,"delete":true,"extras":[]}]}',gen_random_uuid());RAISE EXCEPTION 'Security page granted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'VALIDATION_ERROR' THEN RAISE;END IF;END;
 r:=public.mutate_team('d5000000-0000-4000-8000-000000000001',s,'fixture-super',NULL,'create',NULL,
  '{"name":"Fictional destination","description":"Test only","slug":"fictional-destination","leadId":"d5000000-0000-4000-8000-000000000001","color":"#4285F4","icon":"users"}',gen_random_uuid());dest:=(r->'team'->>'id')::uuid;
 r:=public.mutate_team('d5000000-0000-4000-8000-000000000001',s,'fixture-super',source,'member_transfer',3,
  jsonb_build_object('membershipId',m.id,'membershipRevision',m.revision,'destinationId',dest,'reason','Fictional transfer'),gen_random_uuid());
 IF EXISTS(SELECT 1 FROM public.team_memberships WHERE id=m.id AND is_active) OR
  NOT EXISTS(SELECT 1 FROM public.team_memberships WHERE team_id=dest AND admin_user_id=m.admin_user_id AND role='member' AND is_active) OR
  NOT EXISTS(SELECT 1 FROM public.team_member_transfers WHERE membership_id=m.id AND from_team_id=source AND to_team_id=dest) THEN RAISE EXCEPTION 'Atomic transfer failed';END IF;
 IF public.can_operate_content('d5000000-0000-4000-8000-000000000003','resources','read',source) THEN RAISE EXCEPTION 'Transferred member retains source grants';END IF;
 IF has_function_privilege('anon','public.mutate_team(uuid,uuid,text,uuid,text,integer,jsonb,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Team mutation exposed to browser';END IF;
END $$;
ROLLBACK;
