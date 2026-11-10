BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES
 ('f6400000-0000-4000-8000-000000000001','history-admin@example.test','test-only','admin',true),
 ('f6400000-0000-4000-8000-000000000002','history-blog@example.test','test-only','blog_editor',true);
INSERT INTO public.admin_sessions(id,admin_user_id,token_hash) VALUES
 ('f6400000-0000-4000-8000-000000000003','f6400000-0000-4000-8000-000000000001',repeat('4',64)),
 ('f6400000-0000-4000-8000-000000000004','f6400000-0000-4000-8000-000000000002',repeat('5',64));
INSERT INTO public.forms(id,slug,title,owner_id,state,draft_definition,settings) VALUES
 ('f6400000-0000-4000-8000-000000000005','response-history-fixture','History SQL fixture','f6400000-0000-4000-8000-000000000001','Open','{}','{}');
INSERT INTO public.form_versions(id,form_id,version,definition,schema_hash,published_by) VALUES
 ('f6400000-0000-4000-8000-000000000006','f6400000-0000-4000-8000-000000000005',1,
 '{"fields":[{"id":"f6400000-0000-4000-8000-000000000008","label":"Original name","type":"short","sectionId":"later","sensitive":false},{"id":"f6400000-0000-4000-8000-000000000009","label":"Original private label","type":"email","sectionId":"first","sensitive":true}],"sections":[{"id":"first"},{"id":"later"}]}',repeat('a',64),'f6400000-0000-4000-8000-000000000001');
INSERT INTO public.form_responses(id,form_id,version_id,idempotency_key_hash,request_hash,revision) VALUES
 ('f6400000-0000-4000-8000-000000000007','f6400000-0000-4000-8000-000000000005','f6400000-0000-4000-8000-000000000006',repeat('a',64),repeat('b',64),2);
INSERT INTO public.form_answers(response_id,field_id,value) VALUES
 ('f6400000-0000-4000-8000-000000000007','f6400000-0000-4000-8000-000000000008','"Current name"'),
 ('f6400000-0000-4000-8000-000000000007','f6400000-0000-4000-8000-000000000009','"Current private answer"');
INSERT INTO public.form_response_revisions(response_id,revision,answers,editor_type) VALUES
 ('f6400000-0000-4000-8000-000000000007',1,'{"f6400000-0000-4000-8000-000000000008":"First name","f6400000-0000-4000-8000-000000000009":"First private answer"}','respondent'),
 ('f6400000-0000-4000-8000-000000000007',2,'{"f6400000-0000-4000-8000-000000000008":"Second name","f6400000-0000-4000-8000-000000000009":"Second private answer"}','respondent');
DO $$ DECLARE actor uuid:='f6400000-0000-4000-8000-000000000001';sid uuid:='f6400000-0000-4000-8000-000000000003';fid uuid:='f6400000-0000-4000-8000-000000000005';rid uuid:='f6400000-0000-4000-8000-000000000007';r jsonb;BEGIN
 IF has_function_privilege('anon','public.review_form_response_history(uuid,uuid,uuid,uuid,integer,integer,boolean,uuid)','EXECUTE') THEN RAISE EXCEPTION 'History browser execution granted';END IF;
 r:=public.review_form_response_history(actor,sid,fid,rid,NULL,1,false,gen_random_uuid());
 IF r->>'total'<>'3' OR r->'items'->0->>'revision'<>'2' OR r::text LIKE '%private answer%' THEN RAISE EXCEPTION 'History inventory leaked answers or misnumbered revisions';END IF;
 r:=public.review_form_response_history(actor,sid,fid,rid,0,1,false,gen_random_uuid());
 IF r::text NOT LIKE '%First name%' OR r::text LIKE '%First private answer%' OR r::text NOT LIKE '%Original private label%' THEN RAISE EXCEPTION 'Historical projection/labels/masking wrong';END IF;
 r:=public.review_form_response_history(actor,sid,fid,rid,1,1,true,gen_random_uuid());
 IF r::text NOT LIKE '%Second name%' OR r::text NOT LIKE '%Second private answer%' THEN RAISE EXCEPTION 'Historical revision off by one';END IF;
 r:=public.review_form_response_history(actor,sid,fid,rid,2,1,false,gen_random_uuid());
 IF r->'fields'->0->>'label'<>'Original private label' THEN RAISE EXCEPTION 'History follows creation order instead of section order';END IF;
 IF r::text NOT LIKE '%Current name%' OR r::text LIKE '%Current private answer%' THEN RAISE EXCEPTION 'Current snapshot projection wrong';END IF;
 BEGIN
  PERFORM public.review_form_response_history('f6400000-0000-4000-8000-000000000002','f6400000-0000-4000-8000-000000000004',fid,rid,0,1,true,gen_random_uuid());
  RAISE EXCEPTION 'Blog Editor read history';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 UPDATE public.admin_sessions SET revoked_at=now() WHERE id=sid;
 BEGIN
  PERFORM public.review_form_response_history(actor,sid,fid,rid,0,1,true,gen_random_uuid());
  RAISE EXCEPTION 'Revoked session read history';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 UPDATE public.admin_sessions SET revoked_at=NULL WHERE id=sid;
 PERFORM public.mutate_form_response(actor,fid,rid,'redact',gen_random_uuid());
 r:=public.review_form_response_history(actor,sid,fid,rid,0,1,true,gen_random_uuid());
 IF r::text LIKE '%First private answer%' OR r::text LIKE '%First name%' OR r->>'redacted'<>'true' THEN RAISE EXCEPTION 'Redacted history exposed prior identity';END IF;
 IF EXISTS(SELECT 1 FROM public.admin_actions WHERE target_id=rid AND metadata::text LIKE '%private answer%') THEN RAISE EXCEPTION 'History answers written to audit';END IF;
 PERFORM public.mutate_form_response(actor,fid,rid,'delete',gen_random_uuid());
 BEGIN
  PERFORM public.review_form_response_history(actor,sid,fid,rid,0,1,true,gen_random_uuid());
  RAISE EXCEPTION 'Deleted response history readable';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
END $$;
ROLLBACK;
