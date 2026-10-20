BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES
 ('d6000000-0000-4000-8000-000000000001','explicit-admin@example.test','fixture-admin','admin',true),
 ('d6000000-0000-4000-8000-000000000002','explicit-member@example.test','fixture-member','team_member',true);
DO $$ DECLARE s uuid;r jsonb;team uuid;BEGIN
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES('d6000000-0000-4000-8000-000000000001',repeat('c',64)) RETURNING id INTO s;
 r:=public.mutate_team('d6000000-0000-4000-8000-000000000001',s,'fixture-admin',NULL,'create',NULL,
  '{"name":"Explicit grants team","description":"Test only","slug":"explicit-grants-team","leadId":"d6000000-0000-4000-8000-000000000002","color":"#4285F4","icon":"users"}',gen_random_uuid());team:=(r->'team'->>'id')::uuid;
 r:=public.mutate_team('d6000000-0000-4000-8000-000000000001',s,'fixture-admin',team,'permissions',1,
  '{"grants":[{"path":"/admin/forms","resource":"forms","create":false,"read":false,"update":false,"delete":false,"extras":["view_responses"]}]}',gen_random_uuid());
 IF EXISTS(SELECT 1 FROM public.team_permissions WHERE team_id=team AND permission='view_responses' AND (can_read OR can_update OR can_create OR can_delete))
  OR public.can_operate_form('d6000000-0000-4000-8000-000000000002',NULL,'view',team)
  OR NOT public.can_operate_form('d6000000-0000-4000-8000-000000000002',NULL,'view_responses',team) THEN
  RAISE EXCEPTION 'Special response action silently broadens general record actions';END IF;
END $$;
ROLLBACK;
