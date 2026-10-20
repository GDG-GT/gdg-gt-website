BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES
 ('d3000000-0000-4000-8000-000000000001','accounts-super@example.test','fixture-super','super_admin',true),
 ('d3000000-0000-4000-8000-000000000002','accounts-admin@example.test','fixture-admin','admin',true),
 ('d3000000-0000-4000-8000-000000000003','accounts-member@example.test','fixture-member','team_member',true);
DO $$ DECLARE s uuid;member_s uuid;r jsonb;target uuid;hash text:='scrypt$32768$8$1$'||repeat('A',22)||'$'||repeat('B',86);BEGIN
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES('d3000000-0000-4000-8000-000000000001',repeat('d',64)) RETURNING id INTO s;
 r:=public.mutate_account('d3000000-0000-4000-8000-000000000001',s,'fixture-super',NULL,'create',NULL,
  jsonb_build_object('email','accounts-new@example.test','display_name','Fictional new account','role','team_member','passwordHash',hash),repeat('e',64),repeat('encrypted-placeholder',4),gen_random_uuid());
 target:=(r->>'id')::uuid;
 IF NOT (r->>'must_change_password')::boolean OR r?'password_hash' OR r?'token_hash' OR
  NOT EXISTS(SELECT 1 FROM public.delivery_jobs WHERE kind='account_access' AND payload->>'userId'=target::text) THEN RAISE EXCEPTION 'Account setup secrets or outbox invalid';END IF;
 IF public.complete_account_access(repeat('e',64),'wrong@example.test',hash,gen_random_uuid()) THEN RAISE EXCEPTION 'Email binding bypass';END IF;
 IF NOT public.complete_account_access(repeat('e',64),'accounts-new@example.test',hash,gen_random_uuid()) THEN RAISE EXCEPTION 'Setup completion failed';END IF;
 IF public.complete_account_access(repeat('e',64),'accounts-new@example.test',hash,gen_random_uuid()) THEN RAISE EXCEPTION 'Single use bypass';END IF;
 SELECT public.account_summary(u) INTO r FROM public.admin_users u WHERE id=target;
 IF (r->>'must_change_password')::boolean OR (r->>'revision')::integer<>2 THEN RAISE EXCEPTION 'Setup flags not cleared';END IF;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(target,repeat('f',64)) RETURNING id INTO member_s;
 r:=public.mutate_account('d3000000-0000-4000-8000-000000000001',s,'fixture-super',target,'deactivate',2,'{}',NULL,NULL,gen_random_uuid());
 IF (r->>'is_active')::boolean OR public.validate_server_session(repeat('f',64)) IS NOT NULL OR
  NOT EXISTS(SELECT 1 FROM public.admin_sessions WHERE id=member_s AND revoked_at IS NOT NULL) THEN RAISE EXCEPTION 'Immediate deactivation failed';END IF;
 BEGIN
  PERFORM public.mutate_account('d3000000-0000-4000-8000-000000000001',s,'fixture-super',target,'activate',2,'{}',NULL,NULL,gen_random_uuid());
  RAISE EXCEPTION 'Stale account update accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CONFLICT' THEN RAISE;END IF;END;
 BEGIN
  PERFORM public.mutate_account('d3000000-0000-4000-8000-000000000001',s,'fixture-super','d3000000-0000-4000-8000-000000000001','deactivate',1,'{}',NULL,NULL,gen_random_uuid());
  RAISE EXCEPTION 'Self-lockout accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN
  PERFORM public.mutate_account('d3000000-0000-4000-8000-000000000001',s,'stale-password',target,'activate',3,'{}',NULL,NULL,gen_random_uuid());
  RAISE EXCEPTION 'Stale reauthentication accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES('d3000000-0000-4000-8000-000000000002',repeat('1',64)) RETURNING id INTO s;
 BEGIN
  PERFORM public.mutate_account('d3000000-0000-4000-8000-000000000002',s,'fixture-admin',NULL,'create',NULL,
   jsonb_build_object('email','accounts-privilege@example.test','display_name','Escalation','role','super_admin','passwordHash',hash),repeat('2',64),repeat('encrypted-placeholder',4),gen_random_uuid());
  RAISE EXCEPTION 'Admin escalated account';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 IF public.can_manage_account((SELECT u FROM public.admin_users u WHERE email='accounts-admin@example.test'),
  (SELECT u FROM public.admin_users u WHERE email='accounts-super@example.test'),'team_member') THEN RAISE EXCEPTION 'Admin can manage Super Admin';END IF;
 IF has_table_privilege('anon','public.account_access_tokens','SELECT') OR
  has_function_privilege('authenticated','public.complete_account_access(text,text,text,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Browser can reach account capabilities';END IF;
END $$;
ROLLBACK;
