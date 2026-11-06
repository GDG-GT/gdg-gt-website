BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES
 ('b1200000-0000-4000-8000-000000000001','fictional-export-replay@example.test','fictional','admin',true),
 ('b1200000-0000-4000-8000-000000000002','fictional-export-outsider@example.test','fictional','blog_editor',true);
INSERT INTO public.forms(id,slug,title,owner_id,state,draft_definition,settings) VALUES
 ('b1200000-0000-4000-8000-000000000003','fictional-export-replay','Fictional export replay','b1200000-0000-4000-8000-000000000001','Closed','{}','{}');
CREATE FUNCTION pg_temp.export_write(a uuid,s uuid,f uuid,act text,j uuid,doc jsonb,key text) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.mutate_form_export_write(a,s,f,act,j,doc,md5(doc::text)||md5(doc::text),md5(key)||md5(key),
 md5(jsonb_build_array(f,act,j,doc)::text)||md5(jsonb_build_array(f,act,j,doc)::text),gen_random_uuid());
$$;
DO $$ DECLARE a uuid:='b1200000-0000-4000-8000-000000000001';u uuid:='b1200000-0000-4000-8000-000000000002';
 f uuid:='b1200000-0000-4000-8000-000000000003';s uuid;other_session uuid;us uuid;j uuid;secret_job uuid;v jsonb;BEGIN
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(a,repeat('a',64)) RETURNING id INTO s;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(a,repeat('b',64)) RETURNING id INTO other_session;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(u,repeat('c',64)) RETURNING id INTO us;
 v:=public.inspect_form_export_write(a,s,f,'create',NULL,false,repeat('0',64));
 IF(v->>'committed')::boolean OR NOT(v->>'canRetry')::boolean OR v->'job'<>'null'::jsonb THEN RAISE EXCEPTION 'Missing export receipt invented a job';END IF;
 v:=pg_temp.export_write(a,s,f,'create',NULL,'{"format":"csv","filters":{"q":"Fictional filter"}}','create');j:=(v->>'id')::uuid;
 IF pg_temp.export_write(a,s,f,'create',NULL,'{"format":"csv","filters":{"q":"Fictional filter"}}','create')->>'id'<>j::text
 OR(SELECT count(*) FROM public.form_export_jobs WHERE requester_id=a)<>1
 OR(SELECT count(*) FROM public.admin_actions WHERE target_id=j AND action='forms.export_queued')<>1 THEN RAISE EXCEPTION 'Export replay duplicated job/audit';END IF;
 UPDATE public.form_export_jobs SET state='running' WHERE id=j;
 v:=public.inspect_form_export_write(a,s,f,'create',NULL,false,md5('create')||md5('create'));
 IF NOT(v->>'committed')::boolean OR v->'job'->>'state'<>'running' THEN RAISE EXCEPTION 'Export receipt returned stale job state';END IF;
 BEGIN PERFORM pg_temp.export_write(a,s,f,'create',NULL,'{"format":"json"}','create');RAISE EXCEPTION 'Changed export intent reused key';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CONFLICT' THEN RAISE;END IF;END;
 BEGIN PERFORM public.inspect_form_export_write(a,s,f,'cancel',j,false,md5('create')||md5('create'));RAISE EXCEPTION 'Export key reused across action';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CONFLICT' THEN RAISE;END IF;END;
 v:=public.inspect_form_export_write(a,s,f,'cancel',j,false,md5('cancel')||md5('cancel'));
 IF(v->>'committed')::boolean OR NOT(v->>'canRetry')::boolean THEN RAISE EXCEPTION 'Current running cancellation not inspectable';END IF;
 PERFORM pg_temp.export_write(a,s,f,'cancel',j,'{}','cancel');
 IF pg_temp.export_write(a,s,f,'cancel',j,'{}','cancel')->>'state'<>'cancelled'
 OR(SELECT count(*) FROM public.admin_actions WHERE target_id=j AND action='forms.export_cancelled')<>1 THEN RAISE EXCEPTION 'Cancellation replay duplicated audit';END IF;
 v:=public.inspect_form_export_write(a,s,f,'cancel',j,false,md5('cancel')||md5('cancel'));
 IF NOT(v->>'committed')::boolean OR v->'job'->>'state'<>'cancelled' THEN RAISE EXCEPTION 'Accepted cancel not inspectable';END IF;
 BEGIN PERFORM pg_temp.export_write(a,s,f,'cancel',j,'{}','new-cancel');RAISE EXCEPTION 'New cancelled-job request accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVALID_STATE' THEN RAISE;END IF;END;
 BEGIN PERFORM public.inspect_form_export_write(a,other_session,f,'cancel',j,false,md5('cancel')||md5('cancel'));RAISE EXCEPTION 'Foreign session inspected export';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 BEGIN PERFORM public.inspect_form_export_write(u,us,f,'create',NULL,false,md5('create')||md5('create'));RAISE EXCEPTION 'Unrelated actor inspected private export';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 v:=pg_temp.export_write(a,s,f,'create',NULL,'{"format":"json","sensitive":true}','sensitive');secret_job:=(v->>'id')::uuid;
 UPDATE public.form_export_jobs SET expires_at=now()-interval '1 second' WHERE id=secret_job;
 IF NOT(public.inspect_form_export_write(a,s,f,'create',NULL,true,md5('sensitive')||md5('sensitive'))->>'committed')::boolean
 OR(SELECT count(*) FROM public.form_export_jobs WHERE requester_id=a)<>2 THEN RAISE EXCEPTION 'Expired artifact created a replacement job';END IF;
 v:=public.inspect_form_export_write(a,s,f,'cancel',secret_job,false,repeat('9',64));
 IF(v->>'canRetry')::boolean THEN RAISE EXCEPTION 'Expired artifact offered fresh cancellation';END IF;
 UPDATE public.admin_users SET role='team_member' WHERE id=a;
 BEGIN PERFORM public.inspect_form_export_write(a,s,f,'create',NULL,true,md5('sensitive')||md5('sensitive'));RAISE EXCEPTION 'Revoked export action leaked receipt';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 UPDATE public.admin_users SET role='admin' WHERE id=a;
 UPDATE public.idempotency_keys SET expires_at=now()-interval '1 second' WHERE scope='form-export-write:'||a||':'||s AND key_hash=md5('cancel')||md5('cancel');
 BEGIN PERFORM public.inspect_form_export_write(a,s,f,'cancel',j,false,md5('cancel')||md5('cancel'));RAISE EXCEPTION 'Expired cancellation receipt accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVALID_STATE' THEN RAISE;END IF;END;
 UPDATE public.admin_sessions SET revoked_at=now() WHERE id=s;
 BEGIN PERFORM pg_temp.export_write(a,s,f,'create',NULL,'{"format":"csv","filters":{"q":"Fictional filter"}}','create');RAISE EXCEPTION 'Revoked export session replay accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 IF EXISTS(SELECT 1 FROM public.idempotency_keys WHERE scope='form-export-write:'||a||':'||s AND(result::text LIKE '%Fictional filter%' OR result ? 'job' OR result ? 'filters' OR result ? 'private_object_key')) THEN RAISE EXCEPTION 'Private content persisted in export receipt';END IF;
 IF has_function_privilege('anon','public.inspect_form_export_write(uuid,uuid,uuid,text,uuid,boolean,text,text)','EXECUTE')
 OR has_function_privilege('authenticated','public.mutate_form_export_write(uuid,uuid,uuid,text,uuid,jsonb,text,text,text,uuid)','EXECUTE')
 OR has_function_privilege('gdg_realtime','public.inspect_form_export_write(uuid,uuid,uuid,text,uuid,boolean,text,text)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.mutate_form_export_write(uuid,uuid,uuid,text,uuid,jsonb,text,text,text,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Unsafe export receipt function grants';END IF;
END $$;
ROLLBACK;
