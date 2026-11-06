BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES
 ('b1220000-0000-4000-8000-000000000001','fictional-view-replay@example.test','fictional','admin',true),
 ('b1220000-0000-4000-8000-000000000002','fictional-view-outsider@example.test','fictional','admin',true);
INSERT INTO public.forms(id,slug,title,owner_id,state,draft_definition,settings) VALUES
 ('b1220000-0000-4000-8000-000000000003','fictional-view-replay','Fictional view replay','b1220000-0000-4000-8000-000000000001','Draft','{}','{}');
CREATE FUNCTION pg_temp.view_write(a uuid,s uuid,f uuid,v uuid,act text,doc jsonb,key text) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.mutate_form_view_write(a,s,f,v,act,doc,md5(key)||md5(key),md5(jsonb_build_array(f,v,act,doc)::text)||md5(jsonb_build_array(f,v,act,doc)::text),gen_random_uuid());
$$;
DO $$ DECLARE a uuid:='b1220000-0000-4000-8000-000000000001';o uuid:='b1220000-0000-4000-8000-000000000002';f uuid:='b1220000-0000-4000-8000-000000000003';s uuid;os uuid;v uuid;result jsonb;doc jsonb;BEGIN
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(a,repeat('d',64)) RETURNING id INTO s;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(o,repeat('e',64)) RETURNING id INTO os;
 doc:='{"name":"Fictional private saved view","filters":{"q":"Fictional private query"},"columns":[]}';
 result:=pg_temp.view_write(a,s,f,NULL,'create',doc,'create');v:=(result->'receipt'->>'id')::uuid;
 IF NOT(result->>'committed')::boolean OR(result->'view'->>'revision')::integer<>1 THEN RAISE EXCEPTION 'Saved view creation missing reviewed result';END IF;
 PERFORM pg_temp.view_write(a,s,f,NULL,'create',doc,'create');
 IF(SELECT count(*) FROM public.form_saved_views WHERE form_id=f)<>1 OR(SELECT count(*) FROM public.admin_actions WHERE target_id=f AND action='forms.saved_view_saved')<>1 THEN RAISE EXCEPTION 'Saved view creation replay duplicated state/audit';END IF;
 BEGIN PERFORM pg_temp.view_write(a,s,f,NULL,'create',doc,'duplicate');RAISE EXCEPTION 'New key silently replaced an existing name';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'DUPLICATE' THEN RAISE;END IF;END;
 BEGIN PERFORM pg_temp.view_write(a,s,f,NULL,'create',doc||'{"name":"Changed intent"}','create');RAISE EXCEPTION 'Changed create intent reused original key';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CONFLICT' THEN RAISE;END IF;END;
 BEGIN PERFORM public.inspect_form_view_write(o,os,f,v,'replace',repeat('a',64));RAISE EXCEPTION 'Another administrator read private saved view';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 result:=public.inspect_form_view_write(a,s,f,v,'replace',repeat('b',64));
 IF(result->>'committed')::boolean OR NOT(result->>'canRetry')::boolean OR(result->'view'->>'revision')::integer<>1 THEN RAISE EXCEPTION 'Uncommitted saved view inspection invented receipt';END IF;
 doc:=doc||'{"revision":1,"filters":{"status":"complete"}}';
 result:=pg_temp.view_write(a,s,f,v,'replace',doc,'replace');
 IF(result->'view'->>'revision')::integer<>2 THEN RAISE EXCEPTION 'Saved view replacement failed revision check';END IF;
 PERFORM pg_temp.view_write(a,s,f,v,'replace',doc,'replace');
 BEGIN PERFORM pg_temp.view_write(a,s,f,v,'replace',doc,'stale');RAISE EXCEPTION 'Stale saved view replacement accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CONFLICT' THEN RAISE;END IF;END;
 BEGIN PERFORM pg_temp.view_write(a,s,f,v,'remove','{"revision":1}','stale-remove');RAISE EXCEPTION 'Stale saved view removal accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CONFLICT' THEN RAISE;END IF;END;
 PERFORM pg_temp.view_write(a,s,f,v,'remove','{"revision":2}','remove');
 PERFORM pg_temp.view_write(a,s,f,v,'remove','{"revision":2}','remove');
 result:=public.inspect_form_view_write(a,s,f,v,'remove',md5('remove')||md5('remove'));
 IF NOT(result->>'committed')::boolean OR result->'view'<>'null'::jsonb OR EXISTS(SELECT 1 FROM public.form_saved_views WHERE id=v) THEN RAISE EXCEPTION 'Accepted view removal failed read-only recovery';END IF;
 IF(SELECT count(*) FROM public.admin_actions WHERE target_id=f AND action='forms.saved_view_removed')<>1 OR(SELECT count(*) FROM public.admin_actions WHERE target_id=f AND action='forms.saved_view_saved')<>2 THEN RAISE EXCEPTION 'Saved view replay repeated audit';END IF;
 IF EXISTS(SELECT 1 FROM public.idempotency_keys k WHERE scope='form-view-write:'||a||':'||s AND(k.result ? 'view' OR k.result ? 'name' OR k.result ? 'filters' OR k.result ? 'columns' OR k.result::text LIKE '%Fictional%')) THEN RAISE EXCEPTION 'Saved view receipt retained private preferences';END IF;
 UPDATE public.idempotency_keys SET expires_at=now()-interval '1 second' WHERE scope='form-view-write:'||a||':'||s AND key_hash=md5('remove')||md5('remove');
 BEGIN PERFORM pg_temp.view_write(a,s,f,v,'remove','{"revision":2}','remove');RAISE EXCEPTION 'Expired saved view receipt accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVALID_STATE' THEN RAISE;END IF;END;
 UPDATE public.admin_sessions SET revoked_at=now() WHERE id=s;
 BEGIN PERFORM public.inspect_form_view_write(a,s,f,NULL,'create',md5('create')||md5('create'));RAISE EXCEPTION 'Revoked saved view session read receipt';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 IF has_function_privilege('anon','public.inspect_form_view_write(uuid,uuid,uuid,uuid,text,text,text)','EXECUTE')
 OR has_function_privilege('authenticated','public.mutate_form_view_write(uuid,uuid,uuid,uuid,text,jsonb,text,text,uuid)','EXECUTE')
 OR has_function_privilege('gdg_realtime','public.mutate_form_view_write(uuid,uuid,uuid,uuid,text,jsonb,text,text,uuid)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.mutate_form_view_write(uuid,uuid,uuid,uuid,text,jsonb,text,text,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Saved view replay functions exposed';END IF;
END $$;
ROLLBACK;
