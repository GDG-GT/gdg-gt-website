BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active,display_name) VALUES
 ('b1240000-0000-4000-8000-000000000001','fictional-delivery-replay@example.test','fictional-proof','admin',true,'Fictional delivery operator'),
 ('b1240000-0000-4000-8000-000000000002','fictional-delivery-outsider@example.test','fictional-proof','blog_editor',true,'Fictional delivery outsider');
INSERT INTO public.admin_users(id,email,password_hash,role,is_active,display_name)
 SELECT('b1240000-0000-4000-8000-'||lpad((1000+i)::text,12,'0'))::uuid,'fictional-delivery-candidate-'||i||'@example.test','fictional-proof','admin',true,'Fictional delivery candidate '||lpad(i::text,3,'0') FROM generate_series(1,215)i;
INSERT INTO public.forms(id,slug,title,owner_id,state,draft_definition,settings) VALUES
 ('b1240000-0000-4000-8000-000000000003','fictional-delivery-replay','Fictional delivery replay','b1240000-0000-4000-8000-000000000001','Draft','{"title":"Fictional delivery replay","fields":[],"settings":{"access":"internal"}}','{}');
DO $$ DECLARE a uuid:='b1240000-0000-4000-8000-000000000001';u uuid:='b1240000-0000-4000-8000-000000000002';f uuid:='b1240000-0000-4000-8000-000000000003';target uuid:='b1240000-0000-4000-8000-000000001215';s uuid;us uuid;v jsonb;doc jsonb;definition jsonb;BEGIN
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(a,repeat('d',64)) RETURNING id INTO s;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(u,repeat('e',64)) RETURNING id INTO us;
 SELECT draft_definition INTO definition FROM public.forms WHERE id=f;
 v:=public.read_form_delivery_candidates(a,s,f,8,30,'Fictional delivery candidate');
 IF(v->>'total')::integer<>215 OR jsonb_array_length(v->'items')<>5 OR v::text NOT LIKE '%Fictional delivery candidate 215%' OR v::text LIKE '%@example.test%' OR v::text LIKE '%password_hash%' THEN RAISE EXCEPTION 'Delivery candidate paging truncated or disclosed account secrets';END IF;
 BEGIN PERFORM public.read_form_delivery_candidates(u,us,f,1,30,'');RAISE EXCEPTION 'Unrelated delivery candidate inventory disclosed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 doc:=jsonb_build_object('receipts',false,'receiptAnswers',false,'notificationUsers',jsonb_build_array(target),'chapterInbox',false,'notificationAnswers',false,'confirmation','DELIVERY '||f);
 v:=public.inspect_form_delivery_write(a,s,f,repeat('f',64),NULL,ARRAY[target]);
 IF(v->>'committed')::boolean OR NOT(v->>'canRetry')::boolean OR(v->>'formRevision')::integer<>1 OR(v->>'policyRevision')::integer<>0 THEN RAISE EXCEPTION 'Unaccepted delivery inspection invented a policy';END IF;
 PERFORM public.review_form_delivery(a,s,'fictional-proof',f,1,0,definition,repeat('a',64),doc,repeat('f',64),repeat('b',64),gen_random_uuid());
 PERFORM public.review_form_delivery(a,s,'fictional-proof',f,1,0,definition,repeat('a',64),doc,repeat('f',64),repeat('b',64),gen_random_uuid());
 IF(SELECT count(*) FROM public.admin_actions WHERE target_id=f AND action='forms.delivery_reviewed')<>1 THEN RAISE EXCEPTION 'Accepted delivery replay repeated audit';END IF;
 v:=public.inspect_form_delivery_write(a,s,f,repeat('f',64),NULL,ARRAY[target]);
 IF NOT(v->>'committed')::boolean OR(v->'receipt'->>'revision')::integer<>1 OR v::text LIKE '%@example.test%' OR v ? 'notificationUsers' OR v ? 'password' THEN RAISE EXCEPTION 'Delivery receipt inspection disclosed policy/recipient details';END IF;
 IF NOT public.read_form_delivery_current(a,s,f,repeat('a',64)) THEN RAISE EXCEPTION 'Current delivery approval not recognized';END IF;
 v:=public.read_form_delivery_selection(a,s,f);
 IF jsonb_array_length(v)<>1 OR v->0->>'id'<>target::text OR NOT(v->0->>'eligible')::boolean THEN RAISE EXCEPTION 'Selected delivery recipient beyond 200 was lost';END IF;
 BEGIN PERFORM public.review_form_delivery(a,s,'wrong-proof',f,1,0,definition,repeat('a',64),doc,repeat('f',64),repeat('b',64),gen_random_uuid());RAISE EXCEPTION 'Accepted delivery POST bypassed current proof';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 BEGIN PERFORM public.review_form_delivery(a,s,'fictional-proof',f,1,0,definition,repeat('a',64),doc,repeat('f',64),repeat('c',64),gen_random_uuid());RAISE EXCEPTION 'Changed delivery body reused original key';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CONFLICT' THEN RAISE;END IF;END;
 UPDATE public.admin_users SET is_active=false WHERE id=target;
 IF public.read_form_delivery_current(a,s,f,repeat('a',64)) THEN RAISE EXCEPTION 'Ineligible delivery audience still reported current';END IF;
 v:=public.read_form_delivery_selection(a,s,f);
 IF jsonb_array_length(v)<>1 OR(v->0->>'eligible')::boolean OR v->0->>'display_name'<>'Unavailable chapter account' THEN RAISE EXCEPTION 'Ineligible configured recipient was silently dropped or identity exposed';END IF;
 v:=public.inspect_form_delivery_write(a,s,f,repeat('1',64),NULL,ARRAY[target]);
 IF(v->>'canRetry')::boolean OR(v->>'selectedValid')::boolean THEN RAISE EXCEPTION 'Invalid current recipient authorized retry';END IF;
 v:=public.inspect_form_delivery_write(a,s,f,repeat('f',64),NULL,ARRAY[target]);
 IF NOT(v->>'committed')::boolean THEN RAISE EXCEPTION 'Later recipient ineligibility hid original accepted receipt';END IF;
 UPDATE public.idempotency_keys SET expires_at=now()-interval '1 second' WHERE scope='forms.delivery:'||a||':'||s||':'||f AND key_hash=repeat('f',64);
 BEGIN PERFORM public.inspect_form_delivery_write(a,s,f,repeat('f',64));RAISE EXCEPTION 'Expired delivery receipt accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVALID_STATE' THEN RAISE;END IF;END;
 UPDATE public.admin_sessions SET revoked_at=now() WHERE id=s;
 BEGIN PERFORM public.read_form_delivery_candidates(a,s,f,1,30,'');RAISE EXCEPTION 'Revoked delivery session read candidates';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 IF has_function_privilege('anon','public.read_form_delivery_candidates(uuid,uuid,uuid,integer,integer,text)','EXECUTE') OR has_function_privilege('authenticated','public.inspect_form_delivery_write(uuid,uuid,uuid,text,text,uuid[])','EXECUTE')
 OR has_function_privilege('gdg_realtime','public.review_form_delivery_before_replay(uuid,uuid,text,uuid,integer,integer,jsonb,text,jsonb,text,text,uuid)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.read_form_delivery_selection(uuid,uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Delivery recovery functions exposed';END IF;
END $$;
ROLLBACK;
