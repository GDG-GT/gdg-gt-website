BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES
 ('b1260000-0000-4000-8000-000000000001','fictional-purge-operator@example.test','fictional-proof','super_admin',true),
 ('b1260000-0000-4000-8000-000000000002','fictional-purge-outsider@example.test','fictional-proof','admin',true);
INSERT INTO public.forms(id,slug,title,owner_id,state,draft_definition,settings) VALUES
 ('b1260000-0000-4000-8000-000000000003','fictional-purge-replay','Fictional purge replay','b1260000-0000-4000-8000-000000000001','Archived','{"title":"Fictional purge replay","fields":[],"settings":{"access":"internal"}}','{}');
DO $$ DECLARE a uuid:='b1260000-0000-4000-8000-000000000001';u uuid:='b1260000-0000-4000-8000-000000000002';f uuid:='b1260000-0000-4000-8000-000000000003';s uuid;us uuid;other_session uuid;r jsonb;v jsonb;rid uuid;BEGIN
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(a,repeat('a',64)) RETURNING id INTO s;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(u,repeat('b',64)) RETURNING id INTO us;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(a,repeat('c',64)) RETURNING id INTO other_session;
 r:=public.review_form_deletion(a,s,f,1,repeat('d',64),gen_random_uuid());rid:=(r->>'reviewId')::uuid;
 v:=public.inspect_form_deletion_write(a,s,f,rid,repeat('e',64));
 IF(v->>'committed')::boolean OR NOT(v->>'canRetry')::boolean OR v ? 'state' OR v ? 'reviewToken' OR v::text LIKE '%Fictional%' THEN RAISE EXCEPTION 'Deletion inspection invented receipt or exposed private review';END IF;
 BEGIN PERFORM public.inspect_form_deletion_write(u,us,f,rid,repeat('e',64));RAISE EXCEPTION 'Ordinary admin inspected deletion';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 BEGIN PERFORM public.inspect_form_deletion_write(a,other_session,f,rid,repeat('e',64));RAISE EXCEPTION 'Other session inspected deletion';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'FORM_DELETION_REVIEW' THEN RAISE;END IF;END;
 UPDATE public.forms SET draft_revision=2 WHERE id=f;
 v:=public.inspect_form_deletion_write(a,s,f,rid,repeat('e',64));IF(v->>'canRetry')::boolean THEN RAISE EXCEPTION 'Changed snapshot allowed retry';END IF;
 r:=public.review_form_deletion(a,s,f,2,repeat('f',64),gen_random_uuid());rid:=(r->>'reviewId')::uuid;
 UPDATE public.form_deletion_reviews SET expires_at=now()-interval '1 second' WHERE id=rid;
 v:=public.inspect_form_deletion_write(a,s,f,rid,repeat('e',64));IF(v->>'canRetry')::boolean THEN RAISE EXCEPTION 'Expired review allowed retry';END IF;
 BEGIN PERFORM public.permanently_delete_form(a,s,'fictional-proof',f,2,rid,repeat('f',64),'DELETE FORM '||f,true,repeat('e',64),repeat('1',64),gen_random_uuid());RAISE EXCEPTION 'Expired review erased form';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'FORM_DELETION_REVIEW' THEN RAISE;END IF;END;
 r:=public.review_form_deletion(a,s,f,2,repeat('2',64),gen_random_uuid());rid:=(r->>'reviewId')::uuid;
 PERFORM public.permanently_delete_form(a,s,'fictional-proof',f,2,rid,repeat('2',64),'DELETE FORM '||f,true,repeat('e',64),repeat('1',64),gen_random_uuid());
 v:=public.inspect_form_deletion_write(a,s,f,rid,repeat('e',64));
 IF NOT(v->>'committed')::boolean OR(v->>'canRetry')::boolean OR v->'receipt'<>jsonb_build_object('formId',f,'reviewId',rid,'deleted',true) OR v ? 'state' OR v::text LIKE '%Fictional%' THEN RAISE EXCEPTION 'Purged form did not reconcile safe original receipt';END IF;
 PERFORM public.permanently_delete_form(a,s,'fictional-proof',f,2,rid,repeat('2',64),'DELETE FORM '||f,true,repeat('e',64),repeat('1',64),gen_random_uuid());
 IF(SELECT count(*) FROM public.admin_actions WHERE target_id=f AND action='forms.permanently_deleted')<>1 OR(SELECT draft_revision FROM public.forms WHERE id=f)<>3 THEN RAISE EXCEPTION 'Replay repeated erasure/audit';END IF;
 BEGIN PERFORM public.permanently_delete_form(a,s,'fictional-proof',f,2,rid,repeat('2',64),'DELETE FORM '||f,true,repeat('e',64),NULL,gen_random_uuid());RAISE EXCEPTION 'Mutation omitted body hash on accepted receipt';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'VALIDATION_ERROR' THEN RAISE;END IF;END;
 BEGIN PERFORM public.permanently_delete_form(a,s,'wrong-proof',f,2,rid,repeat('2',64),'DELETE FORM '||f,true,repeat('e',64),repeat('1',64),gen_random_uuid());RAISE EXCEPTION 'Accepted POST bypassed proof';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 BEGIN PERFORM public.inspect_form_deletion_write(a,s,f,gen_random_uuid(),repeat('e',64));RAISE EXCEPTION 'Receipt crossed review';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CONFLICT' THEN RAISE;END IF;END;
 UPDATE public.form_deletion_reviews SET expires_at=now()-interval '1 second' WHERE id=rid;
 IF NOT(public.inspect_form_deletion_write(a,s,f,rid,repeat('e',64))->>'committed')::boolean THEN RAISE EXCEPTION 'Accepted receipt hidden after short review expiry';END IF;
 UPDATE public.idempotency_keys SET expires_at=now()-interval '1 second' WHERE scope='forms.permanent_delete:'||a||':'||s||':'||f AND key_hash=repeat('e',64);
 BEGIN PERFORM public.inspect_form_deletion_write(a,s,f,rid,repeat('e',64));RAISE EXCEPTION 'Expired receipt accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVALID_STATE' THEN RAISE;END IF;END;
 UPDATE public.admin_sessions SET revoked_at=now() WHERE id=s;
 BEGIN PERFORM public.inspect_form_deletion_write(a,s,f,rid,repeat('e',64));RAISE EXCEPTION 'Revoked session inspected receipt';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 IF has_function_privilege('anon','public.inspect_form_deletion_write(uuid,uuid,uuid,uuid,text,text)','EXECUTE') OR has_function_privilege('authenticated','public.permanently_delete_form_before_replay(uuid,uuid,text,uuid,integer,uuid,text,text,boolean,text,text,uuid)','EXECUTE') OR NOT has_function_privilege('service_role','public.inspect_form_deletion_write(uuid,uuid,uuid,uuid,text,text)','EXECUTE') THEN RAISE EXCEPTION 'Deletion recovery functions exposed';END IF;
END $$;
ROLLBACK;
