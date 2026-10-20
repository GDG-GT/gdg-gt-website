BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES
 ('db000000-0000-4000-8000-000000000001','board-admin@example.test','fixture-admin','admin',true),
 ('db000000-0000-4000-8000-000000000002','board-viewer@example.test','fixture-viewer','team_member',true),
 ('db000000-0000-4000-8000-000000000003','board-editor@example.test','fixture-editor','blog_editor',true);
DO $$ DECLARE s uuid;vs uuid;es uuid;r jsonb;original jsonb;next jsonb;b uuid;doc jsonb:='{"elements":[],"appState":{"viewBackgroundColor":"#f2f3f5"}}';BEGIN
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES('db000000-0000-4000-8000-000000000001',repeat('a',64)) RETURNING id INTO s;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES('db000000-0000-4000-8000-000000000002',repeat('b',64)) RETURNING id INTO vs;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES('db000000-0000-4000-8000-000000000003',repeat('c',64)) RETURNING id INTO es;
 r:=public.mutate_whiteboard('db000000-0000-4000-8000-000000000001',s,NULL,NULL,'create',NULL,NULL,'{"name":"Fictional database board","teamId":null}',repeat('1',64),repeat('1',64),gen_random_uuid());b:=(r->>'id')::uuid;
 IF r ? 'document' OR r->>'version'<>'1' OR r->>'created_by'<>'db000000-0000-4000-8000-000000000001' THEN RAISE EXCEPTION 'Board metadata projection invalid';END IF;
 next:=public.mutate_whiteboard('db000000-0000-4000-8000-000000000001',s,NULL,NULL,'create',NULL,NULL,'{"name":"Fictional database board","teamId":null}',repeat('1',64),repeat('1',64),gen_random_uuid());
 IF next->>'id'<>r->>'id' THEN RAISE EXCEPTION 'Create is not idempotent';END IF;
 IF public.can_operate_whiteboard(NULL,b,'read') OR public.can_operate_whiteboard('db000000-0000-4000-8000-000000000002',b,'read')
  OR public.can_operate_whiteboard('db000000-0000-4000-8000-000000000002',b,NULL) THEN RAISE EXCEPTION 'Private board disclosed';END IF;
 IF (public.list_whiteboards('db000000-0000-4000-8000-000000000002',1,NULL,false)->>'total')::integer<>0 THEN RAISE EXCEPTION 'Unauthorized board counted';END IF;
 r:=public.mutate_whiteboard('db000000-0000-4000-8000-000000000001',s,'fixture-admin',b,'share',(r->>'version')::integer,(r->>'updated_at')::timestamptz,
  '{"email":"board-viewer@example.test","role":"viewer"}',repeat('2',64),repeat('2',64),gen_random_uuid());
 IF NOT public.can_operate_whiteboard('db000000-0000-4000-8000-000000000002',b,'read') OR public.can_operate_whiteboard('db000000-0000-4000-8000-000000000002',b,'update') THEN RAISE EXCEPTION 'Viewer scope invalid';END IF;
 BEGIN
  PERFORM public.mutate_whiteboard('db000000-0000-4000-8000-000000000002',vs,NULL,b,'save',(r->>'version')::integer,(r->>'updated_at')::timestamptz,doc,repeat('3',64),repeat('3',64),gen_random_uuid());RAISE EXCEPTION 'Viewer wrote board';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 r:=public.mutate_whiteboard('db000000-0000-4000-8000-000000000001',s,'fixture-admin',b,'share',(r->>'version')::integer,(r->>'updated_at')::timestamptz,
  '{"email":"board-editor@example.test","role":"editor"}',repeat('4',64),repeat('4',64),gen_random_uuid());
 IF NOT public.can_operate_whiteboard('db000000-0000-4000-8000-000000000003',b,'update') OR public.can_operate_whiteboard('db000000-0000-4000-8000-000000000003',b,'manage') THEN RAISE EXCEPTION 'Explicit blog editor scope invalid';END IF;
 original:=r;
 next:=public.mutate_whiteboard('db000000-0000-4000-8000-000000000003',es,NULL,b,'save',(r->>'version')::integer,(r->>'updated_at')::timestamptz,doc,repeat('5',64),repeat('5',64),gen_random_uuid());
 r:=public.mutate_whiteboard('db000000-0000-4000-8000-000000000003',es,NULL,b,'save',(original->>'version')::integer,(original->>'updated_at')::timestamptz,doc,repeat('5',64),repeat('5',64),gen_random_uuid());
 IF r->>'version'<>next->>'version' THEN RAISE EXCEPTION 'Repeated save advanced version';END IF;
 BEGIN
  PERFORM public.mutate_whiteboard('db000000-0000-4000-8000-000000000001',s,NULL,b,'save',(original->>'version')::integer,(original->>'updated_at')::timestamptz,doc,repeat('6',64),repeat('6',64),gen_random_uuid());RAISE EXCEPTION 'Stale save overwrote scene';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CONFLICT' THEN RAISE;END IF;END;
 r:=public.mutate_whiteboard('db000000-0000-4000-8000-000000000001',s,NULL,b,'archive',(r->>'version')::integer,(r->>'updated_at')::timestamptz,'{}',repeat('7',64),repeat('7',64),gen_random_uuid());
 IF public.can_operate_whiteboard('db000000-0000-4000-8000-000000000003',b,'read') OR NOT EXISTS(SELECT 1 FROM public.whiteboards WHERE id=b AND document=doc AND deleted_at IS NOT NULL) THEN RAISE EXCEPTION 'Archive is not private and recoverable';END IF;
 r:=public.mutate_whiteboard('db000000-0000-4000-8000-000000000001',s,NULL,b,'restore',(r->>'version')::integer,(r->>'updated_at')::timestamptz,'{}',repeat('8',64),repeat('8',64),gen_random_uuid());
 UPDATE public.whiteboard_collaborators SET is_active=false WHERE board_id=b AND user_id='db000000-0000-4000-8000-000000000003';
 IF public.can_operate_whiteboard('db000000-0000-4000-8000-000000000003',b,'read') THEN RAISE EXCEPTION 'Revoked collaborator retained access';END IF;
 UPDATE public.admin_sessions SET revoked_at=now() WHERE id=s;
 BEGIN
  PERFORM public.mutate_whiteboard('db000000-0000-4000-8000-000000000001',s,NULL,b,'rename',(r->>'version')::integer,(r->>'updated_at')::timestamptz,'{"name":"No session"}',repeat('9',64),repeat('9',64),gen_random_uuid());RAISE EXCEPTION 'Revoked session wrote board';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
DO $$ DECLARE s uuid;t uuid;b uuid;r jsonb;BEGIN
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES('db000000-0000-4000-8000-000000000001',repeat('f',64)) RETURNING id INTO s;
 INSERT INTO public.admin_teams(name,slug,is_active,team_lead_id) VALUES('Fictional board team','fictional-board-team',true,'db000000-0000-4000-8000-000000000001') RETURNING id INTO t;
 INSERT INTO public.team_memberships(team_id,admin_user_id,role) VALUES(t,'db000000-0000-4000-8000-000000000001','lead'),(t,'db000000-0000-4000-8000-000000000002','member');
 r:=public.mutate_whiteboard('db000000-0000-4000-8000-000000000001',s,NULL,NULL,'create',NULL,NULL,jsonb_build_object('name','Fictional scoped team board','teamId',t),repeat('f',64),repeat('f',64),gen_random_uuid());b:=(r->>'id')::uuid;
 IF public.can_operate_whiteboard('db000000-0000-4000-8000-000000000002',b,'read') THEN RAISE EXCEPTION 'Membership alone granted team board access';END IF;
 INSERT INTO public.team_page_access(team_id,page_path,can_access) VALUES(t,'/admin/whiteboard',true);
 INSERT INTO public.team_permissions(team_id,resource_type,permission,can_read,can_update) VALUES(t,'whiteboards','crud',true,false);
 IF NOT public.can_operate_whiteboard('db000000-0000-4000-8000-000000000002',b,'read') OR public.can_operate_whiteboard('db000000-0000-4000-8000-000000000002',b,'update') THEN RAISE EXCEPTION 'Team CRUD boundary invalid';END IF;
 INSERT INTO public.whiteboard_collaborators(board_id,user_id,role) VALUES(b,'db000000-0000-4000-8000-000000000002','editor');
 IF NOT public.can_operate_whiteboard('db000000-0000-4000-8000-000000000002',b,'update') THEN RAISE EXCEPTION 'Explicit board edit grant not resolved';END IF;
 UPDATE public.team_memberships SET is_active=false WHERE team_id=t AND admin_user_id='db000000-0000-4000-8000-000000000002';
 IF public.can_operate_whiteboard('db000000-0000-4000-8000-000000000002',b,'read') THEN RAISE EXCEPTION 'Former team member retained team board access through explicit collaboration';END IF;
END $$;
ROLLBACK;
