BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES
 ('a0000000-0000-4000-8000-000000000001','form-admin@example.test','test-only','admin',true),
 ('a0000000-0000-4000-8000-000000000002','form-owner@example.test','test-only','team_member',true),
 ('a0000000-0000-4000-8000-000000000003','form-outsider@example.test','test-only','team_member',true),
 ('a0000000-0000-4000-8000-000000000004','form-blog-editor@example.test','test-only','blog_editor',true);
INSERT INTO public.admin_teams(id,name,slug) VALUES('a0000000-0000-4000-8000-000000000005','Form fixture team','form-fixture-team');
INSERT INTO public.team_memberships(team_id,admin_user_id) VALUES('a0000000-0000-4000-8000-000000000005','a0000000-0000-4000-8000-000000000002');
INSERT INTO public.team_page_access(team_id,page_path) VALUES('a0000000-0000-4000-8000-000000000005','/admin/forms');
INSERT INTO public.team_permissions(team_id,resource_type,permission,can_read,can_create,can_update) VALUES
 ('a0000000-0000-4000-8000-000000000005','forms','forms.edit',true,true,true);
DO $$ DECLARE v jsonb;f uuid;v_id uuid;result jsonb;definition jsonb;BEGIN
 definition:='{"title":"Form SQL fixture","description":"Fictional","fields":[{"id":"a0000000-0000-4000-8000-000000000006","type":"short","label":"Name","sensitive":true}],"sections":[],"settings":{"access":"public","limit":1,"oneResponse":false,"opensAt":"","closesAt":"","resume":true,"editing":true}}';
 IF public.can_operate_form('a0000000-0000-4000-8000-000000000004',NULL,'create') THEN RAISE EXCEPTION 'Blog editor can create forms';END IF;
 v:=public.mutate_form('a0000000-0000-4000-8000-000000000002',NULL,'create',NULL,
  jsonb_build_object('slug','sql-form-fixture','team_id','a0000000-0000-4000-8000-000000000005','definition',definition),NULL,gen_random_uuid());f:=(v->>'id')::uuid;
 IF NOT public.can_operate_form('a0000000-0000-4000-8000-000000000002',f,'edit') OR public.can_operate_form('a0000000-0000-4000-8000-000000000002',f,'publish') THEN RAISE EXCEPTION 'Explicit publication grant not enforced';END IF;
 BEGIN
  PERFORM public.mutate_form_collaborator('a0000000-0000-4000-8000-000000000001',f,'a0000000-0000-4000-8000-000000000003',ARRAY['view','edit'],false,gen_random_uuid());
  RAISE EXCEPTION 'Cross-team collaborator allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVALID_STATE' THEN RAISE;END IF;END;
 BEGIN
  PERFORM public.mutate_form('a0000000-0000-4000-8000-000000000001',f,'draft',99,jsonb_build_object('definition',definition),NULL,gen_random_uuid());
  RAISE EXCEPTION 'Stale form update allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CONFLICT' THEN RAISE;END IF;END;
 v:=public.mutate_form('a0000000-0000-4000-8000-000000000001',f,'publish',1,jsonb_build_object('definition',definition),repeat('a',64),gen_random_uuid());v_id:=(v->>'published_version_id')::uuid;
 PERFORM public.save_form_draft(f,v_id,repeat('1',64),'{}',NULL,NULL);
 result:=public.submit_form_response(f,v_id,repeat('a',64),'{"a0000000-0000-4000-8000-000000000006":"Private fixture"}',repeat('2',64),repeat('3',64),NULL,NULL,NULL,repeat('4',64),'encrypted-fixture',repeat('1',64),NULL);
 IF public.submit_form_response(f,v_id,repeat('a',64),'{}',repeat('2',64),repeat('3',64),NULL,NULL,NULL,NULL,NULL,NULL,NULL)->>'responseId'<>result->>'responseId' THEN RAISE EXCEPTION 'Form idempotency failed';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.form_response_drafts WHERE form_id=f AND completed_at IS NOT NULL AND answers='{}') THEN RAISE EXCEPTION 'Resume draft not consumed';END IF;
 BEGIN
  PERFORM public.submit_form_response(f,v_id,repeat('a',64),'{}',repeat('5',64),repeat('6',64),NULL,NULL,NULL,NULL,NULL,NULL,NULL);
  RAISE EXCEPTION 'Form limit exceeded';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'FORM_FULL' THEN RAISE;END IF;END;
 IF public.read_form_responses('a0000000-0000-4000-8000-000000000001',f,1,30,'{}',false)::text LIKE '%Private fixture%' THEN RAISE EXCEPTION 'Sensitive value leaked';END IF;
 PERFORM public.edit_form_response(f,(result->>'responseId')::uuid,v_id,repeat('a',64),repeat('4',64),0,'{"a0000000-0000-4000-8000-000000000006":"Edited private fixture"}',repeat('7',64),repeat('8',64));
 IF (SELECT count(*) FROM public.form_response_revisions WHERE response_id=(result->>'responseId')::uuid)<>1 THEN RAISE EXCEPTION 'Edit revision missing';END IF;
 UPDATE public.forms SET settings=settings||'{"hold":true}' WHERE id=f;
 BEGIN
  PERFORM public.mutate_form_response('a0000000-0000-4000-8000-000000000001',f,(result->>'responseId')::uuid,'delete',gen_random_uuid());
  RAISE EXCEPTION 'Operational hold bypassed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'RETENTION_HOLD' THEN RAISE;END IF;END;
 UPDATE public.forms SET settings=settings||'{"hold":false}' WHERE id=f;
 PERFORM public.mutate_form_response('a0000000-0000-4000-8000-000000000001',f,(result->>'responseId')::uuid,'redact',gen_random_uuid());
 IF EXISTS(SELECT 1 FROM public.form_answers WHERE response_id=(result->>'responseId')::uuid AND value::text LIKE '%Private%')
  OR EXISTS(SELECT 1 FROM public.form_response_revisions WHERE response_id=(result->>'responseId')::uuid AND answers::text LIKE '%Private%') THEN RAISE EXCEPTION 'Historical identity not redacted';END IF;
 UPDATE public.team_memberships SET is_active=false WHERE admin_user_id='a0000000-0000-4000-8000-000000000002';
 IF public.can_operate_form('a0000000-0000-4000-8000-000000000002',f,'view') THEN RAISE EXCEPTION 'Revoked membership still sees form';END IF;
END $$;
ROLLBACK;

-- Committed solely inside the network-isolated test database for pgbench.
CREATE TABLE public.test_form_outcomes(result text NOT NULL);
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES('a1000000-0000-4000-8000-000000000001','form-load@example.test','test-only','admin',true);
INSERT INTO public.forms(id,slug,title,owner_id,state,access_mode,draft_definition,response_limit,settings)
VALUES('a1000000-0000-4000-8000-000000000002','form-final-response-fixture','Form final response fixture','a1000000-0000-4000-8000-000000000001','Open','public','{}',1,'{}');
INSERT INTO public.form_versions(id,form_id,version,definition,schema_hash,published_by)
VALUES('a1000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000002',1,'{"fields":[]}',repeat('a',64),'a1000000-0000-4000-8000-000000000001');
UPDATE public.forms SET published_version_id='a1000000-0000-4000-8000-000000000003' WHERE id='a1000000-0000-4000-8000-000000000002';
CREATE FUNCTION public.test_form_last_slot(p_client integer) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 PERFORM public.submit_form_response('a1000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000003',repeat('a',64),'{}',
  encode(sha256(('form-key-'||p_client)::bytea),'hex'),encode(sha256(('form-body-'||p_client)::bytea),'hex'),NULL,NULL,NULL,NULL,NULL,NULL,NULL);
 INSERT INTO public.test_form_outcomes VALUES('submitted');
EXCEPTION WHEN raise_exception THEN
 IF SQLERRM<>'FORM_FULL' THEN RAISE;END IF;
 INSERT INTO public.test_form_outcomes VALUES('full');
END $$;
