BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES
 ('b1180000-0000-4000-8000-000000000001','fictional-authoring-replay@example.test','fictional','admin',true),
 ('b1180000-0000-4000-8000-000000000002','fictional-authoring-outsider@example.test','fictional','team_member',true);
CREATE FUNCTION pg_temp.authoring(a uuid,s uuid,i uuid,act text,rev integer,doc jsonb,key text) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.mutate_form_authoring(a,s,i,act,rev,doc,CASE WHEN act='publish' THEN repeat('a',64) ELSE NULL END,
 md5(key)||md5(key),md5(jsonb_build_array(i,act,rev,doc)::text)||md5(jsonb_build_array(i,act,rev,doc)::text),gen_random_uuid());
$$;
DO $$ DECLARE a uuid:='b1180000-0000-4000-8000-000000000001';u uuid:='b1180000-0000-4000-8000-000000000002';
 s uuid;us uuid;i uuid;v jsonb;definition jsonb;doc jsonb;BEGIN
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(a,repeat('1',64)) RETURNING id INTO s;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(u,repeat('2',64)) RETURNING id INTO us;
 definition:='{"title":"Fictional authoring replay","description":"Private fixture","fields":[],"sections":[],"settings":{"access":"public","opensAt":"","closesAt":"","limit":0}}';
 v:=public.create_form_from_template(a,jsonb_build_object('slug','fictional-authoring-replay','definition',definition),'blank',gen_random_uuid());i:=(v->>'id')::uuid;
 doc:=jsonb_build_object('definition',definition||'{"title":"Fictional revised title"}');
 v:=pg_temp.authoring(a,s,i,'draft',1,doc,'draft');
 IF(pg_temp.authoring(a,s,i,'draft',1,doc,'draft')->>'draft_revision')::integer<>2
 OR(SELECT count(*) FROM public.admin_actions WHERE target_id=i AND action='forms.draft')<>1 THEN RAISE EXCEPTION 'Draft replay repeated revision/audit';END IF;
 BEGIN PERFORM pg_temp.authoring(a,s,i,'draft',1,doc||'{"slug":"changed"}','draft');RAISE EXCEPTION 'Changed intent accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CONFLICT' THEN RAISE;END IF;END;
 doc:=jsonb_build_object('definition',v->'draft_definition');
 v:=pg_temp.authoring(a,s,i,'publish',2,doc,'publish');
 IF(pg_temp.authoring(a,s,i,'publish',2,doc,'publish')->>'draft_revision')::integer<>3
 OR(SELECT count(*) FROM public.form_versions WHERE form_id=i)<>1
 OR(SELECT count(*) FROM public.admin_actions WHERE target_id=i AND action='forms.publish')<>1 THEN RAISE EXCEPTION 'Publication replay repeated immutable version/audit';END IF;
 PERFORM public.mutate_form(a,i,'draft',3,jsonb_build_object('definition',definition||'{"title":"Newer private draft"}'),NULL,gen_random_uuid());
 IF pg_temp.authoring(a,s,i,'publish',2,doc,'publish')->>'title'<>'Newer private draft' THEN RAISE EXCEPTION 'Replay returned stale private snapshot';END IF;
 v:=public.inspect_form_authoring_write(a,s,i,'publish',md5('publish')||md5('publish'));
 IF NOT(v->>'committed')::boolean OR(v->'receipt'->>'revision')::integer<>3 OR(v->'form'->>'draft_revision')::integer<>4
 THEN RAISE EXCEPTION 'Read-only receipt did not distinguish original/current revision';END IF;
 IF(public.inspect_form_authoring_write(a,s,i,'draft',repeat('9',64))->>'committed')::boolean THEN RAISE EXCEPTION 'Missing receipt claimed accepted';END IF;
 BEGIN PERFORM public.inspect_form_authoring_write(a,s,i,'draft',md5('publish')||md5('publish'));RAISE EXCEPTION 'Cross-action receipt reused';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CONFLICT' THEN RAISE;END IF;END;
 BEGIN PERFORM public.inspect_form_authoring_write(u,us,i,'publish',md5('publish')||md5('publish'));RAISE EXCEPTION 'Outsider receipt exposed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 BEGIN PERFORM pg_temp.authoring(a,s,i,'draft',1,jsonb_build_object('definition',definition),'stale');RAISE EXCEPTION 'New stale draft accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CONFLICT' THEN RAISE;END IF;END;
 IF EXISTS(SELECT 1 FROM public.idempotency_keys WHERE scope='form-authoring:'||a AND(result ? 'title' OR result ? 'definition' OR result ? 'form')) THEN RAISE EXCEPTION 'Receipt retained private draft';END IF;
 UPDATE public.idempotency_keys SET expires_at=now()-interval '1 second' WHERE scope='form-authoring:'||a AND key_hash=md5('draft')||md5('draft');
 BEGIN PERFORM public.inspect_form_authoring_write(a,s,i,'draft',md5('draft')||md5('draft'));RAISE EXCEPTION 'Expired receipt allowed retry';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVALID_STATE' THEN RAISE;END IF;END;
 UPDATE public.admin_users SET locked_until=now()+interval '1 minute' WHERE id=a;
 BEGIN PERFORM pg_temp.authoring(a,s,i,'publish',2,doc,'publish');RAISE EXCEPTION 'Locked actor replay accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 UPDATE public.admin_users SET locked_until=NULL WHERE id=a;UPDATE public.admin_sessions SET revoked_at=now() WHERE id=s;
 BEGIN PERFORM pg_temp.authoring(a,s,i,'publish',2,doc,'publish');RAISE EXCEPTION 'Revoked session replay accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 IF has_function_privilege('anon','public.inspect_form_authoring_write(uuid,uuid,uuid,text,text,text)','EXECUTE')
 OR has_function_privilege('authenticated','public.mutate_form_authoring(uuid,uuid,uuid,text,integer,jsonb,text,text,text,uuid)','EXECUTE')
 OR has_function_privilege('gdg_realtime','public.inspect_form_authoring_write(uuid,uuid,uuid,text,text,text)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.mutate_form_authoring(uuid,uuid,uuid,text,integer,jsonb,text,text,text,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Unsafe authoring receipt grants';END IF;
END $$;
ROLLBACK;
