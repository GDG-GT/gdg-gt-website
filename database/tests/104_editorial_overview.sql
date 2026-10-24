BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES
 ('f1040000-0000-4000-8000-000000000001','editorial-scope@example.test','fictional-editor','blog_editor',true),
 ('f1040000-0000-4000-8000-000000000002','editorial-other@example.test','fictional-other','blog_editor',true),
 ('f1040000-0000-4000-8000-000000000003','editorial-member@example.test','fictional-member','team_member',true);
DO $$ DECLARE ed uuid:='f1040000-0000-4000-8000-000000000001';other uuid:='f1040000-0000-4000-8000-000000000002';
 member uuid:='f1040000-0000-4000-8000-000000000003';s uuid;os uuid;ms uuid;p uuid;r jsonb;BEGIN
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(ed,repeat('1',64)) RETURNING id INTO s;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(other,repeat('2',64)) RETURNING id INTO os;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(member,repeat('3',64)) RETURNING id INTO ms;
 r:=public.mutate_private_blog(ed,s,NULL,'posts',NULL,'create',NULL,
  '{"teamId":null,"record":{"title":"Fictional overview article","slug":"fictional-overview-article","content":"Private fictional writing","author_name":"Fictional writer","tags":[],"read_time_minutes":5}}',
  repeat('a',64),repeat('a',64),gen_random_uuid());p:=(r->>'id')::uuid;
 r:=public.read_editorial_overview(ed,s);
 IF r->>'articles'<>'1' OR r->'states'->>'draft'<>'1' OR jsonb_array_length(r->'revisionMonths')<>6
  OR (SELECT sum((m->>'count')::int) FROM jsonb_array_elements(r->'revisionMonths') m)<>1
  OR r::text LIKE '%Private fictional%' OR r::text LIKE '%@%' THEN RAISE EXCEPTION 'Editorial scope or revision aggregation failed';END IF;
 IF public.read_editorial_overview(other,os)->>'articles'<>'0' THEN RAISE EXCEPTION 'Other editor inferred writing';END IF;
 UPDATE public.blog_posts SET deleted_at=now() WHERE id=p;
 IF public.read_editorial_overview(ed,s)->>'articles'<>'0' THEN RAISE EXCEPTION 'Archived article counted';END IF;
 BEGIN PERFORM public.read_editorial_overview(member,ms);RAISE EXCEPTION 'Member obtained editorial aggregate';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.read_editorial_overview(ed,os);RAISE EXCEPTION 'Foreign session accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 IF has_function_privilege('anon','public.read_editorial_overview(uuid,uuid)','EXECUTE') OR has_function_privilege('authenticated','public.read_editorial_overview(uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Browser editorial grants exist';END IF;
END $$;
ROLLBACK;
