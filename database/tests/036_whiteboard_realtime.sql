BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES
 ('dc000000-0000-4000-8000-000000000001','board-socket-admin@example.test','fixture-admin','admin',true),
 ('dc000000-0000-4000-8000-000000000002','board-socket-member@example.test','fixture-member','team_member',true);
DO $$ DECLARE s uuid;ms uuid;b uuid;r jsonb;g jsonb;claims jsonb;BEGIN
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES('dc000000-0000-4000-8000-000000000001',repeat('d',64)) RETURNING id INTO s;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES('dc000000-0000-4000-8000-000000000002',repeat('e',64)) RETURNING id INTO ms;
 r:=public.mutate_whiteboard('dc000000-0000-4000-8000-000000000001',s,NULL,NULL,'create',NULL,NULL,'{"name":"Fictional socket board"}',repeat('d',64),repeat('d',64),gen_random_uuid());b:=(r->>'id')::uuid;
 BEGIN
  PERFORM public.issue_realtime_grant('dc000000-0000-4000-8000-000000000002',ms,'whiteboard',b,gen_random_uuid());RAISE EXCEPTION 'Non-collaborator got board grant';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 INSERT INTO public.whiteboard_collaborators(board_id,user_id,role) VALUES(b,'dc000000-0000-4000-8000-000000000002','viewer');
 g:=public.issue_realtime_grant('dc000000-0000-4000-8000-000000000002',ms,'whiteboard',b,gen_random_uuid());
 IF g->>'topic'<>'gdg:whiteboard:'||b THEN RAISE EXCEPTION 'Wrong board topic issued';END IF;
 claims:=jsonb_build_object('role','gdg_realtime','sub','dc000000-0000-4000-8000-000000000002','session_id',ms,'jti',g->>'id','iat',g->'issuedAt','exp',g->'expiresAt','permission_version',g->'permissionVersion','topics',jsonb_build_array(g->>'topic'));
 PERFORM set_config('request.jwt.claims',claims::text,true);
 IF NOT gdg_security.realtime_allowed(g->>'topic') OR gdg_security.realtime_allowed('gdg:channel:'||b) OR gdg_security.realtime_allowed('gdg:whiteboard:'||gen_random_uuid()) THEN RAISE EXCEPTION 'Board-specific policy topic isolation failed';END IF;
 UPDATE public.whiteboard_collaborators SET is_active=false WHERE board_id=b;
 IF gdg_security.realtime_allowed(g->>'topic') THEN RAISE EXCEPTION 'Removed collaborator retained board socket authority';END IF;
 IF has_table_privilege('gdg_realtime','public.whiteboards','SELECT,UPDATE') OR has_table_privilege('gdg_realtime','public.whiteboard_collaborators','SELECT,UPDATE') THEN RAISE EXCEPTION 'Socket role can access board data';END IF;
END $$;
ROLLBACK;
