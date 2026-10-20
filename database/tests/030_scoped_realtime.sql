BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES
 ('da000000-0000-4000-8000-000000000001','realtime-admin@example.test','fixture-admin','admin',true),
 ('da000000-0000-4000-8000-000000000002','realtime-member@example.test','fixture-member','team_member',true);
DO $$ DECLARE s uuid;member_s uuid;r jsonb;c uuid;g jsonb;claims jsonb;t record;BEGIN
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES('da000000-0000-4000-8000-000000000001',repeat('1',64)) RETURNING id INTO s;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES('da000000-0000-4000-8000-000000000002',repeat('2',64)) RETURNING id INTO member_s;
 r:=public.mutate_channel('da000000-0000-4000-8000-000000000001',s,'fixture-admin',NULL,'create',NULL,
  '{"name":"Scoped socket fixture","description":"Test only","visibility":"private","teamId":null}',gen_random_uuid());c:=(r->>'id')::uuid;
 BEGIN
  PERFORM public.issue_realtime_grant('da000000-0000-4000-8000-000000000002',member_s,'channel',c,gen_random_uuid());RAISE EXCEPTION 'Non-member received private socket grant';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 r:=public.mutate_channel('da000000-0000-4000-8000-000000000001',s,'fixture-admin',c,'member_add',1,'{"email":"realtime-member@example.test","role":"member"}',gen_random_uuid());
 g:=public.issue_realtime_grant('da000000-0000-4000-8000-000000000002',member_s,'channel',c,gen_random_uuid());
 IF (g->>'expiresAt')::bigint>(g->>'issuedAt')::bigint+300 THEN RAISE EXCEPTION 'Socket grant exceeds five minutes';END IF;
 claims:=jsonb_build_object('role','gdg_realtime','sub','da000000-0000-4000-8000-000000000002','session_id',member_s,'jti',g->>'id','iat',g->'issuedAt','exp',g->'expiresAt','permission_version',g->'permissionVersion','topics',jsonb_build_array(g->>'topic'));
 PERFORM set_config('request.jwt.claims',claims::text,true);
 IF NOT gdg_security.realtime_allowed(g->>'topic') OR gdg_security.realtime_allowed('gdg:channel:'||gen_random_uuid()) THEN RAISE EXCEPTION 'Socket topic scope invalid';END IF;
 PERFORM set_config('request.jwt.claims',(claims-'permission_version')::text,true);
 IF gdg_security.realtime_allowed(g->>'topic') THEN RAISE EXCEPTION 'Missing permission version accepted';END IF;
 PERFORM set_config('request.jwt.claims',(claims||jsonb_build_object('permission_version',999999))::text,true);
 IF gdg_security.realtime_allowed(g->>'topic') THEN RAISE EXCEPTION 'Wrong permission version accepted';END IF;
 PERFORM set_config('request.jwt.claims',(claims||jsonb_build_object('topics',jsonb_build_array(g->>'topic','gdg:user:another')))::text,true);
 IF gdg_security.realtime_allowed(g->>'topic') THEN RAISE EXCEPTION 'Expanded topic claim accepted';END IF;
 PERFORM set_config('request.jwt.claims',(claims-'exp')::text,true);
 IF gdg_security.realtime_allowed(g->>'topic') THEN RAISE EXCEPTION 'Missing expiry accepted';END IF;
 PERFORM set_config('request.jwt.claims',(claims||'{"role":"authenticated"}')::text,true);
 IF gdg_security.realtime_allowed(g->>'topic') THEN RAISE EXCEPTION 'Wrong role accepted';END IF;
 PERFORM set_config('request.jwt.claims',claims::text,true);
 UPDATE public.channel_memberships SET is_active=false WHERE channel_id=c AND admin_user_id='da000000-0000-4000-8000-000000000002';
 IF gdg_security.realtime_allowed(g->>'topic') THEN RAISE EXCEPTION 'Revoked room membership accepted at policy refresh';END IF;
 BEGIN
  PERFORM public.issue_realtime_grant('da000000-0000-4000-8000-000000000002',member_s,'notifications','da000000-0000-4000-8000-000000000001',gen_random_uuid());RAISE EXCEPTION 'Other-account notification grant issued';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 g:=public.issue_realtime_grant('da000000-0000-4000-8000-000000000002',member_s,'notifications','da000000-0000-4000-8000-000000000002',gen_random_uuid());
 claims:=claims||jsonb_build_object('jti',g->>'id','iat',g->'issuedAt','exp',g->'expiresAt','permission_version',g->'permissionVersion','topics',jsonb_build_array(g->>'topic'));PERFORM set_config('request.jwt.claims',claims::text,true);
 IF NOT gdg_security.realtime_allowed(g->>'topic') THEN RAISE EXCEPTION 'Own notification grant denied';END IF;
 UPDATE public.admin_sessions SET revoked_at=now() WHERE id=member_s;
 IF gdg_security.realtime_allowed(g->>'topic') THEN RAISE EXCEPTION 'Revoked opaque session accepted by socket policy';END IF;
 FOR t IN SELECT schemaname,tablename FROM pg_tables WHERE schemaname='public' LOOP
  IF has_table_privilege('gdg_realtime',format('%I.%I',t.schemaname,t.tablename),'SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'Socket role has application-table privilege';END IF;
 END LOOP;
 IF has_table_privilege('gdg_realtime','gdg_security.realtime_grants','SELECT') OR
  has_function_privilege('gdg_realtime','public.issue_realtime_grant(uuid,uuid,text,uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Socket role can mint or inspect grants';END IF;
END $$;
ROLLBACK;
