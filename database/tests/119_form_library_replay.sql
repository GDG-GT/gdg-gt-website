BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES
 ('b1190000-0000-4000-8000-000000000001','fictional-library-replay@example.test','fictional','admin',true),
 ('b1190000-0000-4000-8000-000000000002','fictional-library-outsider@example.test','fictional','team_member',true);
CREATE FUNCTION pg_temp.library_write(a uuid,s uuid,i uuid,act text,rev integer,doc jsonb,key text) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.mutate_form_library(a,s,i,act,rev,doc,CASE WHEN act='create' THEN 'interest' ELSE NULL END,
 md5(key)||md5(key),md5(jsonb_build_array(i,act,rev,doc)::text)||md5(jsonb_build_array(i,act,rev,doc)::text),gen_random_uuid());
$$;
DO $$ DECLARE a uuid:='b1190000-0000-4000-8000-000000000001';u uuid:='b1190000-0000-4000-8000-000000000002';
 s uuid;us uuid;i uuid;copy_id uuid;v jsonb;definition jsonb;doc jsonb;BEGIN
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(a,repeat('1',64)) RETURNING id INTO s;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(u,repeat('2',64)) RETURNING id INTO us;
 definition:='{"title":"Fictional library replay","description":"Private fixture","fields":[],"sections":[],"settings":{"access":"internal","opensAt":"","closesAt":"","limit":0}}';
 doc:=jsonb_build_object('slug','fictional-library-replay','team_id',NULL,'definition',definition);
 v:=pg_temp.library_write(a,s,NULL,'create',NULL,doc,'create');i:=(v->>'id')::uuid;
 IF pg_temp.library_write(a,s,NULL,'create',NULL,doc,'create')->>'id'<>i::text
 OR(SELECT count(*) FROM public.forms WHERE owner_id=a)<>1
 OR(SELECT count(*) FROM public.admin_actions WHERE target_id=i AND action='forms.create')<>1
 OR(SELECT template_key FROM public.forms WHERE id=i)<>'interest' THEN RAISE EXCEPTION 'Create replay duplicated form/audit or lost provenance';END IF;
 BEGIN PERFORM pg_temp.library_write(a,s,NULL,'create',NULL,doc||'{"slug":"changed-library-slug"}','create');RAISE EXCEPTION 'Changed creation reused key';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CONFLICT' THEN RAISE;END IF;END;
 v:=pg_temp.library_write(a,s,i,'duplicate',1,'{"slug":"fictional-library-copy"}','duplicate');copy_id:=(v->>'id')::uuid;
 IF pg_temp.library_write(a,s,i,'duplicate',1,'{"slug":"fictional-library-copy"}','duplicate')->>'id'<>copy_id::text
 OR(SELECT count(*) FROM public.forms WHERE owner_id=a)<>2 OR v->>'title'<>'Fictional library replay (copy)'
 OR(SELECT template_key FROM public.forms WHERE id=copy_id)<>'interest' THEN RAISE EXCEPTION 'Copy replay duplicated form or lost source/provenance';END IF;
 PERFORM public.mutate_form(a,i,'draft',1,jsonb_build_object('definition',definition||'{"title":"Fictional newer source"}'),NULL,gen_random_uuid());
 IF pg_temp.library_write(a,s,i,'duplicate',1,'{"slug":"fictional-library-copy"}','duplicate')->>'id'<>copy_id::text
 OR(SELECT count(*) FROM public.forms WHERE owner_id=a)<>2 THEN RAISE EXCEPTION 'Accepted copy replay used a newer source';END IF;
 BEGIN PERFORM pg_temp.library_write(a,s,i,'duplicate',1,'{"slug":"fictional-stale-copy"}','new-copy');RAISE EXCEPTION 'Fresh stale copy accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CONFLICT' THEN RAISE;END IF;END;
 PERFORM public.mutate_form(a,copy_id,'draft',1,jsonb_build_object('definition',definition||'{"title":"Fictional current copy"}'),NULL,gen_random_uuid());
 v:=public.inspect_form_library_write(a,s,i,'duplicate',md5('duplicate')||md5('duplicate'));
 IF NOT(v->>'committed')::boolean OR v->'form'->>'title'<>'Fictional current copy'
 OR(v->'receipt'->>'revision')::integer<>1 THEN RAISE EXCEPTION 'Copy receipt returned stale private data';END IF;
 v:=public.inspect_form_library_write(a,s,NULL,'create',repeat('9',64));
 IF(v->>'committed')::boolean OR NOT(v->>'canCreate')::boolean OR v->'form'<>'null'::jsonb THEN RAISE EXCEPTION 'Unaccepted creation receipt was invented';END IF;
 PERFORM pg_temp.library_write(a,s,copy_id,'archive',2,'{}','archive');
 IF(pg_temp.library_write(a,s,copy_id,'archive',2,'{}','archive')->>'draft_revision')::integer<>3 THEN RAISE EXCEPTION 'Archive replay repeated revision';END IF;
 PERFORM pg_temp.library_write(a,s,copy_id,'restore',3,'{}','restore');
 IF(pg_temp.library_write(a,s,copy_id,'restore',3,'{}','restore')->>'draft_revision')::integer<>4
 OR(SELECT state FROM public.forms WHERE id=copy_id)<>'Draft' THEN RAISE EXCEPTION 'Restore replay repeated or reopened form';END IF;
 SELECT draft_definition INTO definition FROM public.forms WHERE id=copy_id;
 PERFORM public.mutate_form(a,copy_id,'publish',4,jsonb_build_object('definition',definition),repeat('a',64),gen_random_uuid());
 PERFORM pg_temp.library_write(a,s,copy_id,'state',5,'{"state":"Closed"}','close');
 IF(pg_temp.library_write(a,s,copy_id,'state',5,'{"state":"Closed"}','close')->>'draft_revision')::integer<>6 THEN RAISE EXCEPTION 'Close replay repeated revision';END IF;
 PERFORM pg_temp.library_write(a,s,copy_id,'state',6,'{"state":"Open"}','open');
 IF(pg_temp.library_write(a,s,copy_id,'state',6,'{"state":"Open"}','open')->>'draft_revision')::integer<>7
 OR(SELECT count(*) FROM public.form_versions WHERE form_id=copy_id)<>1 THEN RAISE EXCEPTION 'Reopen replay repeated version/revision';END IF;
 IF EXISTS(SELECT 1 FROM public.idempotency_keys WHERE scope='form-library:'||a AND(result ? 'title' OR result ? 'definition' OR result ? 'form')) THEN RAISE EXCEPTION 'Library receipt retained private content';END IF;
 BEGIN PERFORM public.inspect_form_library_write(a,s,copy_id,'archive',md5('duplicate')||md5('duplicate'));RAISE EXCEPTION 'Cross-source/action receipt exposed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CONFLICT' THEN RAISE;END IF;END;
 BEGIN PERFORM public.inspect_form_library_write(u,us,i,'duplicate',md5('duplicate')||md5('duplicate'));RAISE EXCEPTION 'Outsider inspected private source';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 UPDATE public.admin_users SET role='team_member' WHERE id=a;
 BEGIN PERFORM pg_temp.library_write(a,s,NULL,'create',NULL,doc,'create');RAISE EXCEPTION 'Lost creation authority replay accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 UPDATE public.admin_users SET role='admin' WHERE id=a;
 UPDATE public.idempotency_keys SET expires_at=now()-interval '1 second' WHERE scope='form-library:'||a AND key_hash=md5('create')||md5('create');
 BEGIN PERFORM pg_temp.library_write(a,s,NULL,'create',NULL,doc,'create');RAISE EXCEPTION 'Expired creation replay accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVALID_STATE' THEN RAISE;END IF;END;
 UPDATE public.admin_sessions SET revoked_at=now() WHERE id=s;
 BEGIN PERFORM pg_temp.library_write(a,s,i,'duplicate',1,'{"slug":"fictional-library-copy"}','duplicate');RAISE EXCEPTION 'Revoked library session replay accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 IF has_function_privilege('anon','public.inspect_form_library_write(uuid,uuid,uuid,text,text,text,uuid)','EXECUTE')
 OR has_function_privilege('authenticated','public.mutate_form_library(uuid,uuid,uuid,text,integer,jsonb,text,text,text,uuid)','EXECUTE')
 OR has_function_privilege('gdg_realtime','public.inspect_form_library_write(uuid,uuid,uuid,text,text,text,uuid)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.mutate_form_library(uuid,uuid,uuid,text,integer,jsonb,text,text,text,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Unsafe library function grants';END IF;
END $$;
ROLLBACK;
