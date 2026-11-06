BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES
 ('b1230000-0000-4000-8000-000000000001','fictional-privacy-replay@example.test','fictional-proof','admin',true),
 ('b1230000-0000-4000-8000-000000000002','fictional-privacy-outsider@example.test','fictional-proof','blog_editor',true);
INSERT INTO public.forms(id,slug,title,owner_id,state,draft_definition,settings) VALUES
 ('b1230000-0000-4000-8000-000000000003','fictional-privacy-replay','Fictional privacy replay','b1230000-0000-4000-8000-000000000001','Draft','{}','{}');
INSERT INTO public.form_versions(id,form_id,version,definition,schema_hash,published_by) VALUES
 ('b1230000-0000-4000-8000-000000000004','b1230000-0000-4000-8000-000000000003',1,'{"fields":[],"settings":{"retentionDays":14}}',repeat('a',64),'b1230000-0000-4000-8000-000000000001');
INSERT INTO public.form_responses(id,form_id,version_id,idempotency_key_hash,request_hash) VALUES
 ('b1230000-0000-4000-8000-000000000005','b1230000-0000-4000-8000-000000000003','b1230000-0000-4000-8000-000000000004',repeat('b',64),repeat('c',64));
CREATE FUNCTION pg_temp.privacy_write(a uuid,s uuid,f uuid,r uuid,revision integer,doc jsonb,key text,proof text DEFAULT 'fictional-proof') RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.review_form_privacy(a,s,proof,f,r,revision,doc,md5(key)||md5(key),md5(jsonb_build_array(revision,doc)::text)||md5(jsonb_build_array(revision,doc)::text),gen_random_uuid());
$$;
DO $$ DECLARE a uuid:='b1230000-0000-4000-8000-000000000001';u uuid:='b1230000-0000-4000-8000-000000000002';
 f uuid:='b1230000-0000-4000-8000-000000000003';r uuid:='b1230000-0000-4000-8000-000000000005';s uuid;us uuid;v jsonb;doc jsonb;deadline timestamptz;BEGIN
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(a,repeat('d',64)) RETURNING id INTO s;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(u,repeat('e',64)) RETURNING id INTO us;
 SELECT retention_expires_at INTO deadline FROM public.form_responses WHERE id=r;
 v:=public.inspect_form_privacy_write(a,s,f,NULL,repeat('f',64));
 IF(v->>'committed')::boolean OR NOT(v->>'canRetry')::boolean OR(v->>'currentRevision')::integer<>0 THEN RAISE EXCEPTION 'Uncommitted privacy inspection invented an outcome';END IF;
 doc:=jsonb_build_object('held',true,'reason','Fictional private operational reason','draftDays',9,'confirmation','HOLD '||f);
 v:=pg_temp.privacy_write(a,s,f,NULL,0,doc,'form-hold');
 PERFORM pg_temp.privacy_write(a,s,f,NULL,0,doc,'form-hold');
 IF(v->>'revision')::integer<>1 OR(SELECT count(*) FROM public.admin_actions WHERE target_id=f AND action='forms.hold_reviewed')<>1 THEN RAISE EXCEPTION 'Privacy replay repeated an accepted hold';END IF;
 v:=public.inspect_form_privacy_write(a,s,f,NULL,md5('form-hold')||md5('form-hold'));
 IF NOT(v->>'committed')::boolean OR(v->'receipt'->>'revision')::integer<>1 OR v::text LIKE '%Fictional private%' OR v ? 'reason' OR v ? 'password' OR v ? 'answers' THEN RAISE EXCEPTION 'Privacy outcome inspection disclosed private policy content';END IF;
 BEGIN PERFORM pg_temp.privacy_write(a,s,f,NULL,0,doc||'{"draftDays":10}','form-hold');RAISE EXCEPTION 'Changed privacy document reused original key';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CONFLICT' THEN RAISE;END IF;END;
 BEGIN PERFORM pg_temp.privacy_write(a,s,f,NULL,0,doc,'stale');RAISE EXCEPTION 'Stale privacy policy revision accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CONFLICT' THEN RAISE;END IF;END;
 BEGIN PERFORM pg_temp.privacy_write(a,s,f,NULL,0,doc,'form-hold','wrong-proof');RAISE EXCEPTION 'Replayed privacy POST bypassed current password proof';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 BEGIN PERFORM public.inspect_form_privacy_write(u,us,f,NULL,md5('form-hold')||md5('form-hold'));RAISE EXCEPTION 'Unrelated privacy inspection disclosed receipt';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 doc:=jsonb_build_object('held',true,'reason','Fictional private individual reason','confirmation','HOLD '||r);
 PERFORM pg_temp.privacy_write(a,s,f,r,0,doc,'response-hold');
 PERFORM pg_temp.privacy_write(a,s,f,r,0,doc,'response-hold');
 IF(SELECT count(*) FROM public.admin_actions WHERE target_id=r AND action='forms.hold_reviewed')<>1 THEN RAISE EXCEPTION 'Response hold replay repeated audit';END IF;
 -- A later independently reviewed release permits ordinary erasure; the old
 -- accepted hold receipt must still acknowledge its own action, not reapply it.
 PERFORM pg_temp.privacy_write(a,s,f,NULL,1,jsonb_build_object('held',false,'reason','Fictional form hold release','draftDays',9,'confirmation','HOLD '||f),'form-release');
 PERFORM pg_temp.privacy_write(a,s,f,r,1,jsonb_build_object('held',false,'reason','Fictional individual hold release','confirmation','HOLD '||r),'response-release');
 PERFORM public.mutate_form_response(a,f,r,'delete',gen_random_uuid());
 v:=public.inspect_form_privacy_write(a,s,f,r,md5('response-hold')||md5('response-hold'));
 IF NOT(v->>'committed')::boolean OR(v->>'targetExists')::boolean THEN RAISE EXCEPTION 'Accepted response hold cannot reconcile after later erasure';END IF;
 IF(SELECT retention_expires_at FROM public.form_responses WHERE id=r) IS DISTINCT FROM deadline THEN RAISE EXCEPTION 'Privacy recovery changed the original response deadline';END IF;
 UPDATE public.idempotency_keys SET expires_at=now()-interval '1 second' WHERE scope='forms.privacy:'||a||':'||s||':'||f||':form' AND key_hash=md5('form-hold')||md5('form-hold');
 BEGIN PERFORM public.inspect_form_privacy_write(a,s,f,NULL,md5('form-hold')||md5('form-hold'));RAISE EXCEPTION 'Expired privacy outcome accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVALID_STATE' THEN RAISE;END IF;END;
 BEGIN PERFORM pg_temp.privacy_write(a,s,f,NULL,0,jsonb_build_object('held',true,'reason','Fictional private operational reason','draftDays',9,'confirmation','HOLD '||f),'form-hold');RAISE EXCEPTION 'Expired privacy POST replay accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVALID_STATE' THEN RAISE;END IF;END;
 UPDATE public.admin_sessions SET revoked_at=now() WHERE id=s;
 BEGIN PERFORM public.inspect_form_privacy_write(a,s,f,r,md5('response-hold')||md5('response-hold'));RAISE EXCEPTION 'Revoked privacy session disclosed receipt';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 IF has_function_privilege('anon','public.inspect_form_privacy_write(uuid,uuid,uuid,uuid,text,text)','EXECUTE')
 OR has_function_privilege('authenticated','public.review_form_privacy(uuid,uuid,text,uuid,uuid,integer,jsonb,text,text,uuid)','EXECUTE')
 OR has_function_privilege('gdg_realtime','public.review_form_privacy_before_replay(uuid,uuid,text,uuid,uuid,integer,jsonb,text,text,uuid)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.inspect_form_privacy_write(uuid,uuid,uuid,uuid,text,text)','EXECUTE') THEN RAISE EXCEPTION 'Privacy recovery functions exposed';END IF;
END $$;
ROLLBACK;
