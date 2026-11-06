BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES
 ('b1210000-0000-4000-8000-000000000001','fictional-response-replay@example.test','fictional','admin',true),
 ('b1210000-0000-4000-8000-000000000002','fictional-response-outsider@example.test','fictional','blog_editor',true);
INSERT INTO public.forms(id,slug,title,owner_id,state,draft_definition,settings) VALUES
 ('b1210000-0000-4000-8000-000000000003','fictional-response-replay','Fictional response replay','b1210000-0000-4000-8000-000000000001','Closed','{}','{}');
INSERT INTO public.form_versions(id,form_id,version,definition,schema_hash,published_by) VALUES
 ('b1210000-0000-4000-8000-000000000004','b1210000-0000-4000-8000-000000000003',1,
 '{"fields":[{"id":"b1210000-0000-4000-8000-000000000006","label":"Full name","type":"short","sensitive":false}]}',repeat('a',64),'b1210000-0000-4000-8000-000000000001');
INSERT INTO public.form_responses(id,form_id,version_id,idempotency_key_hash,request_hash,revision,respondent_name,respondent_email,respondent_source) VALUES
 ('b1210000-0000-4000-8000-000000000005','b1210000-0000-4000-8000-000000000003','b1210000-0000-4000-8000-000000000004',repeat('b',64),repeat('c',64),2,'Fictional private identity','fictional-private-response@example.test','self_reported');
INSERT INTO public.form_answers(response_id,field_id,value) VALUES
 ('b1210000-0000-4000-8000-000000000005','b1210000-0000-4000-8000-000000000006','"Fictional private answer"');
INSERT INTO public.form_response_revisions(response_id,revision,answers,editor_type) VALUES
 ('b1210000-0000-4000-8000-000000000005',1,'{"b1210000-0000-4000-8000-000000000006":"Fictional original answer"}','respondent');
CREATE FUNCTION pg_temp.response_write(a uuid,s uuid,f uuid,r uuid,act text,doc jsonb,key text) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.mutate_form_response_write(a,s,f,r,act,doc,md5(key)||md5(key),md5(jsonb_build_array(f,r,act,doc)::text)||md5(jsonb_build_array(f,r,act,doc)::text),gen_random_uuid());
$$;
DO $$ DECLARE a uuid:='b1210000-0000-4000-8000-000000000001';u uuid:='b1210000-0000-4000-8000-000000000002';
 f uuid:='b1210000-0000-4000-8000-000000000003';r uuid:='b1210000-0000-4000-8000-000000000005';s uuid;us uuid;v jsonb;doc jsonb;BEGIN
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(a,repeat('d',64)) RETURNING id INTO s;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(u,repeat('e',64)) RETURNING id INTO us;
 doc:='{"revision":2,"status":"complete","redacted":false,"confirmation":"REDACT"}';
 v:=public.inspect_form_response_write(a,s,f,r,'redact',repeat('f',64));
 IF(v->>'committed')::boolean OR NOT(v->>'canRetry')::boolean OR v::text LIKE '%Fictional private%' THEN RAISE EXCEPTION 'Unaccepted response inspection leaked values or invented a receipt';END IF;
 BEGIN PERFORM pg_temp.response_write(a,s,f,r,'redact',doc||'{"revision":1}','stale');RAISE EXCEPTION 'Stale respondent edit revision accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CONFLICT' THEN RAISE;END IF;END;
 UPDATE public.forms SET settings='{"hold":true}' WHERE id=f;
 BEGIN PERFORM pg_temp.response_write(a,s,f,r,'redact',doc,'held');RAISE EXCEPTION 'Operational hold bypassed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'RETENTION_HOLD' THEN RAISE;END IF;END;
 UPDATE public.forms SET settings='{}' WHERE id=f;
 UPDATE public.form_responses SET status='held' WHERE id=r;
 BEGIN PERFORM pg_temp.response_write(a,s,f,r,'redact',doc||'{"status":"held"}','legacy-held');RAISE EXCEPTION 'Held response status bypassed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'RETENTION_HOLD' THEN RAISE;END IF;END;
 UPDATE public.form_responses SET status='complete' WHERE id=r;
 v:=pg_temp.response_write(a,s,f,r,'redact',doc,'redact');
 IF NOT(v->>'committed')::boolean OR v->'response'->>'status'<>'redacted'
 OR(SELECT respondent_email IS NOT NULL OR respondent_name IS NOT NULL OR respondent_source<>'redacted' FROM public.form_responses WHERE id=r)
 OR EXISTS(SELECT 1 FROM public.form_answers WHERE response_id=r AND value::text LIKE '%Fictional private%')
 OR EXISTS(SELECT 1 FROM public.form_response_revisions WHERE response_id=r AND answers::text LIKE '%Fictional original%') THEN RAISE EXCEPTION 'Atomic response redaction did not scrub current/historical/system identity';END IF;
 PERFORM pg_temp.response_write(a,s,f,r,'redact',doc,'redact');
 IF(SELECT count(*) FROM public.admin_actions WHERE target_id=r AND action='forms.response_redact')<>1 THEN RAISE EXCEPTION 'Redaction replay repeated audit';END IF;
 BEGIN PERFORM pg_temp.response_write(a,s,f,r,'redact',doc||'{"status":"redacted","redacted":true}','redact');RAISE EXCEPTION 'Changed response request reused key';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CONFLICT' THEN RAISE;END IF;END;
 BEGIN PERFORM pg_temp.response_write(a,s,f,r,'delete','{"revision":2,"status":"complete","redacted":false,"confirmation":"DELETE"}','old-delete');RAISE EXCEPTION 'Stale privacy state allowed deletion';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CONFLICT' THEN RAISE;END IF;END;
 doc:='{"revision":2,"status":"redacted","redacted":true,"confirmation":"DELETE"}';
 PERFORM pg_temp.response_write(a,s,f,r,'delete',doc,'delete');
 PERFORM pg_temp.response_write(a,s,f,r,'delete',doc,'delete');
 IF EXISTS(SELECT 1 FROM public.form_answers WHERE response_id=r) OR EXISTS(SELECT 1 FROM public.form_response_revisions WHERE response_id=r)
 OR(SELECT count(*) FROM public.admin_actions WHERE target_id=r AND action='forms.response_delete')<>1 THEN RAISE EXCEPTION 'Delete replay failed atomic erasure/audit deduplication';END IF;
 v:=public.inspect_form_response_write(a,s,f,r,'delete',md5('delete')||md5('delete'));
 IF NOT(v->>'committed')::boolean OR NOT(v->'response'->>'deleted')::boolean THEN RAISE EXCEPTION 'Accepted deletion cannot reconcile without raw content';END IF;
 BEGIN PERFORM public.inspect_form_response_write(u,us,f,r,'delete',md5('delete')||md5('delete'));RAISE EXCEPTION 'Unauthorized response receipt disclosed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 IF EXISTS(SELECT 1 FROM public.idempotency_keys WHERE scope='form-response-write:'||a||':'||s AND(result ? 'response' OR result ? 'answers' OR result::text LIKE '%Fictional%')) THEN RAISE EXCEPTION 'Response receipt retained private content';END IF;
 UPDATE public.idempotency_keys SET expires_at=now()-interval '1 second' WHERE scope='form-response-write:'||a||':'||s AND key_hash=md5('delete')||md5('delete');
 BEGIN PERFORM pg_temp.response_write(a,s,f,r,'delete',doc,'delete');RAISE EXCEPTION 'Expired deletion receipt accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVALID_STATE' THEN RAISE;END IF;END;
 UPDATE public.admin_sessions SET revoked_at=now() WHERE id=s;
 BEGIN PERFORM pg_temp.response_write(a,s,f,r,'redact','{"revision":2,"status":"complete","redacted":false,"confirmation":"REDACT"}','redact');RAISE EXCEPTION 'Revoked session replay accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 IF has_function_privilege('anon','public.inspect_form_response_write(uuid,uuid,uuid,uuid,text,text,text)','EXECUTE')
 OR has_function_privilege('authenticated','public.mutate_form_response_write(uuid,uuid,uuid,uuid,text,jsonb,text,text,uuid)','EXECUTE')
 OR has_function_privilege('gdg_realtime','public.inspect_form_response_write(uuid,uuid,uuid,uuid,text,text,text)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.mutate_form_response_write(uuid,uuid,uuid,uuid,text,jsonb,text,text,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Unsafe response replay function grants';END IF;
END $$;
ROLLBACK;
