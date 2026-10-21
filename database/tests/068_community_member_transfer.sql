BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES
 ('f6800000-0000-4000-8000-000000000001','transfer-admin@example.test','test-only','admin',true),
 ('f6800000-0000-4000-8000-000000000002','transfer-member@example.test','test-only','team_member',true);
DO $$ DECLARE actor uuid:='f6800000-0000-4000-8000-000000000002';admin uuid:='f6800000-0000-4000-8000-000000000001';sid uuid;team uuid;other uuid;d jsonb;row jsonb;review jsonb;r jsonb;bad jsonb;BEGIN
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(actor,repeat('8',64)) RETURNING id INTO sid;
 INSERT INTO public.admin_teams(name,slug) VALUES('Transfer scope','transfer-scope') RETURNING id INTO team;
 INSERT INTO public.admin_teams(name,slug) VALUES('Other transfer scope','other-transfer-scope') RETURNING id INTO other;
 INSERT INTO public.team_memberships(team_id,admin_user_id) VALUES(team,actor);
 INSERT INTO public.team_page_access(team_id,page_path) VALUES(team,'/admin/members');
 INSERT INTO public.team_permissions(team_id,resource_type,permission,can_read,can_create) VALUES(team,'members','crud',true,true);
 INSERT INTO public.members(name,email,team_id,phone,major) VALUES('Existing other scope','existing-transfer@example.test',other,'private-other-phone','private-other-major');
 row:='{"name":"New transfer fixture","email":"new-transfer@example.test","phone":"private-transfer-phone","year":"Senior","major":"private-transfer-major","category":"member","interests":["Cloud"],"is_active":true,"is_core_team":false,"team_section":"Active Members"}';
 d:=jsonb_build_object('teamId',team,'rows',jsonb_build_array(row,row||'{"email":"existing-transfer@example.test"}'));
 IF has_function_privilege('anon','public.preview_member_import(uuid,uuid,jsonb,text,text,uuid)','EXECUTE') OR has_table_privilege('authenticated','public.member_import_reviews','SELECT') THEN RAISE EXCEPTION 'Browser member transfer access';END IF;
 BEGIN
  PERFORM public.preview_member_import(actor,sid,jsonb_set(d,'{teamId}',to_jsonb(other)),repeat('a',64),repeat('b',64),gen_random_uuid());
  RAISE EXCEPTION 'Cross-team import preview allowed';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 review:=public.preview_member_import(actor,sid,d,repeat('a',64),repeat('b',64),gen_random_uuid());
 IF review->>'eligible'<>'1' OR review->'skippedRows'<>'[2]'::jsonb OR review::text LIKE '%private-other%' THEN RAISE EXCEPTION 'Import preview disclosed existing details or mishandled duplicates';END IF;
 BEGIN
  PERFORM public.commit_member_import(actor,sid,'test-only',jsonb_set(d,'{rows,0,name}','"Changed after preview"'),repeat('a',64),(review->>'reviewId')::uuid,repeat('b',64),'IMPORT 1',repeat('c',64),repeat('d',64),gen_random_uuid());
  RAISE EXCEPTION 'Changed import document accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'MEMBER_IMPORT_REVIEW' THEN RAISE;END IF;END;
 UPDATE public.team_permissions SET can_create=false WHERE team_id=team;
 BEGIN
  PERFORM public.commit_member_import(actor,sid,'test-only',d,repeat('a',64),(review->>'reviewId')::uuid,repeat('b',64),'IMPORT 1',repeat('c',64),repeat('d',64),gen_random_uuid());
  RAISE EXCEPTION 'Revoked import access ignored';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 UPDATE public.team_permissions SET can_create=true WHERE team_id=team;
 r:=public.commit_member_import(actor,sid,'test-only',d,repeat('a',64),(review->>'reviewId')::uuid,repeat('b',64),'IMPORT 1',repeat('c',64),repeat('d',64),gen_random_uuid());
 IF r->>'created'<>'1' OR r->>'skipped'<>'1' OR(SELECT count(*) FROM public.members WHERE email='new-transfer@example.test' AND team_id=team)<>1 THEN RAISE EXCEPTION 'Atomic import did not create expected records';END IF;
 IF public.commit_member_import(actor,sid,'test-only',d,repeat('a',64),(review->>'reviewId')::uuid,repeat('b',64),'IMPORT 1',repeat('c',64),repeat('d',64),gen_random_uuid())<>r THEN RAISE EXCEPTION 'Import retry not idempotent';END IF;
 IF EXISTS(SELECT 1 FROM public.admin_users WHERE email='new-transfer@example.test') OR EXISTS(SELECT 1 FROM public.team_members WHERE email='new-transfer@example.test') THEN RAISE EXCEPTION 'Import silently created an account or public profile';END IF;
 r:=public.export_community_members(actor,sid,'{}',false,gen_random_uuid());
 IF jsonb_array_length(r)<>1 OR r::text LIKE '%@example.test%' OR r::text LIKE '%private-transfer%' OR r::text LIKE '%Existing other scope%' THEN RAISE EXCEPTION 'Minimal export leaked private fields or crossed team scope';END IF;
 r:=public.export_community_members(actor,sid,'{}',true,gen_random_uuid());
 IF r::text NOT LIKE '%private-transfer-phone%' OR r::text LIKE '%private-other%' THEN RAISE EXCEPTION 'Authorized private export scope wrong';END IF;
 IF public.export_community_members(actor,sid,'{"category":"alumni"}',true,gen_random_uuid())<>'[]'::jsonb THEN RAISE EXCEPTION 'Export filter ignored';END IF;
 d:=jsonb_set(d,'{rows}',jsonb_build_array(row||'{"email":"concurrent-transfer@example.test"}'));
 review:=public.preview_member_import(actor,sid,d,repeat('a',64),repeat('e',64),gen_random_uuid());
 INSERT INTO public.members(name,email,team_id) VALUES('Concurrent fixture','concurrent-transfer@example.test',team);
 BEGIN
  PERFORM public.commit_member_import(actor,sid,'test-only',d,repeat('a',64),(review->>'reviewId')::uuid,repeat('e',64),'IMPORT 1',repeat('f',64),repeat('d',64),gen_random_uuid());
  RAISE EXCEPTION 'Changed duplicate snapshot accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CONFLICT' THEN RAISE;END IF;END;
 d:=jsonb_set(d,'{rows}',jsonb_build_array(row||'{"email":"atomic-transfer@example.test"}',row||'{"name":"X","email":"bad-atomic-transfer@example.test"}'));
 review:=public.preview_member_import(actor,sid,d,repeat('a',64),repeat('1',64),gen_random_uuid());
 BEGIN
  PERFORM public.commit_member_import(actor,sid,'test-only',d,repeat('a',64),(review->>'reviewId')::uuid,repeat('1',64),'IMPORT 2',repeat('2',64),repeat('3',64),gen_random_uuid());
  RAISE EXCEPTION 'Invalid batch committed';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'VALIDATION_ERROR' THEN RAISE;END IF;END;
 IF EXISTS(SELECT 1 FROM public.members WHERE email='atomic-transfer@example.test') THEN RAISE EXCEPTION 'Failed batch partially committed';END IF;
 UPDATE public.admin_sessions SET revoked_at=now() WHERE id=sid;
 BEGIN
  PERFORM public.export_community_members(actor,sid,'{}',true,gen_random_uuid());
  RAISE EXCEPTION 'Revoked session exported private records';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 IF EXISTS(SELECT 1 FROM public.admin_actions WHERE target_type='member_import' AND(metadata::text LIKE '%private-transfer%' OR metadata::text LIKE '%@example.test%')) THEN RAISE EXCEPTION 'Transfer audit retained private source content';END IF;
END $$;
ROLLBACK;
