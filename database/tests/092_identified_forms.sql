BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES('f9200000-0000-4000-8000-000000000001','identified-admin@example.test','test-only','admin',true);
DO $$ DECLARE actor uuid:='f9200000-0000-4000-8000-000000000001';f uuid;v uuid;r uuid;definition jsonb;document jsonb;result jsonb;j public.delivery_jobs;prepared jsonb;BEGIN
 IF has_function_privilege('service_role','public.submit_form_response(uuid,uuid,text,jsonb,text,text,text,text,uuid,text,text,text,text)','EXECUTE')
  OR has_function_privilege('service_role','public.submit_form_response_before_delivery(uuid,uuid,text,jsonb,text,text,text,text,uuid,text,text,text,text)','EXECUTE')
  OR has_function_privilege('anon','public.submit_identified_form_response(jsonb)','EXECUTE')
  OR has_table_privilege('authenticated','public.form_respondent_copies','SELECT') THEN RAISE EXCEPTION 'Anonymous identity bypass or copy disclosure';END IF;
 definition:='{"title":"Identified form fixture","description":"Fictional only","fields":[{"id":"f9200000-0000-4000-8000-000000000010","type":"short","label":"Private answer","sensitive":true}],"sections":[],"settings":{"access":"public","receipts":false,"limit":0,"resume":true,"editing":true,"retentionDays":365}}';
 result:=public.mutate_form(actor,NULL,'create',NULL,jsonb_build_object('slug','identified-form-fixture','definition',definition),NULL,gen_random_uuid());f:=(result->>'id')::uuid;
 result:=public.mutate_form(actor,f,'publish',1,jsonb_build_object('definition',definition),repeat('a',64),gen_random_uuid());v:=(result->>'published_version_id')::uuid;
 document:=jsonb_build_object('form',f,'version',v,'schemaHash',repeat('a',64),'answers',jsonb_build_object('f9200000-0000-4000-8000-000000000010','Exact private answer'),'keyHash',repeat('1',64),'requestHash',repeat('2',64),'copyRequested',true);
 BEGIN PERFORM public.submit_identified_form_response(document);RAISE EXCEPTION 'Missing identity accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'VALIDATION_ERROR' THEN RAISE;END IF;END;
 document:=document||jsonb_build_object('respondent',jsonb_build_object('name','Fictional Respondent','email','identified-person@example.test'));
 result:=public.submit_identified_form_response(document);r:=(result->>'responseId')::uuid;
 IF result->>'copyQueued'<>'true' OR(SELECT respondent_source FROM public.form_responses WHERE id=r)<>'self_reported' THEN RAISE EXCEPTION 'Copy or provenance missing';END IF;
 PERFORM public.submit_identified_form_response(document);
 IF(SELECT count(*) FROM public.form_respondent_copies WHERE response_id=r)<>1 THEN RAISE EXCEPTION 'Duplicate copy queued';END IF;
 SELECT job.* INTO j FROM public.delivery_jobs job JOIN public.form_respondent_copies c ON c.id=(job.payload->>'copyId')::uuid WHERE job.kind='form_respondent_copy' AND c.response_id=r;
 UPDATE public.delivery_jobs SET state='running',lease_token=gen_random_uuid(),locked_until=now()+interval '5 minutes' WHERE id=j.id RETURNING * INTO j;
 IF public.prepare_form_respondent_copy(j.id,gen_random_uuid()) IS NOT NULL THEN RAISE EXCEPTION 'Copy prepared without worker lease';END IF;
 prepared:=public.prepare_form_respondent_copy(j.id,j.lease_token);
 IF prepared->>'email'<>'identified-person@example.test' OR prepared->'values'->>'f9200000-0000-4000-8000-000000000010'<>'Exact private answer' THEN RAISE EXCEPTION 'Wrong copy content or recipient';END IF;
 result:=public.read_form_responses(actor,f,1,30,jsonb_build_object('q','identified-person@example.test'),false);
 IF result->>'total'<>'1' OR result->'items'->0->'respondent'->>'source'<>'self_reported' OR result->'items'->0->'answers'<>'{}'::jsonb THEN RAISE EXCEPTION 'Respondent projection bypassed sensitive-answer mask';END IF;
 FOR i IN 3..5 LOOP
  result:=public.submit_identified_form_response(document||jsonb_build_object('keyHash',repeat(i::text,64),'requestHash',repeat((i+1)::text,64)));
 END LOOP;
 IF(SELECT count(*) FROM public.form_respondent_copies c JOIN public.form_responses x ON x.id=c.response_id WHERE x.form_id=f)<>3 THEN RAISE EXCEPTION 'Per-recipient copy spam cap failed';END IF;
 PERFORM public.mutate_form_response(actor,f,r,'redact',gen_random_uuid());
 IF(SELECT respondent_name IS NOT NULL OR respondent_email IS NOT NULL OR respondent_source<>'redacted' FROM public.form_responses WHERE id=r)
  OR public.prepare_form_respondent_copy(j.id,j.lease_token) IS NOT NULL THEN RAISE EXCEPTION 'Redacted identity or queued copy survived';END IF;
END $$;
ROLLBACK;
