BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES
 ('f9000000-0000-4000-8000-000000000001','blog-admin@example.test','blog-admin','admin',true),
 ('f9000000-0000-4000-8000-000000000002','blog-editor@example.test','blog-editor','blog_editor',true),
 ('f9000000-0000-4000-8000-000000000003','blog-other@example.test','blog-other','blog_editor',true),
 ('f9000000-0000-4000-8000-000000000004','blog-team@example.test','blog-team','team_member',true);
CREATE FUNCTION pg_temp.blog_change(a uuid,s uuid,pw text,kind text,p uuid,action text,rev integer,doc jsonb,key text) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.mutate_private_blog(a,s,pw,kind,p,action,rev,doc,md5(key)||md5(key),md5(doc::text)||md5(doc::text),gen_random_uuid());
$$;
DO $$ DECLARE a uuid:='f9000000-0000-4000-8000-000000000001';ed uuid:='f9000000-0000-4000-8000-000000000002';other uuid:='f9000000-0000-4000-8000-000000000003';tm uuid:='f9000000-0000-4000-8000-000000000004';s uuid;es uuid;t uuid;p uuid;p2 uuid;sub uuid;c uuid;cat uuid;doc jsonb;r jsonb;ref text;BEGIN
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(a,repeat('a9',32)) RETURNING id INTO s;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(ed,repeat('b9',32)) RETURNING id INTO es;
 INSERT INTO public.admin_teams(name,slug,created_by) VALUES('Fictional editorial team','fictional-editorial-team',a) RETURNING id INTO t;
 INSERT INTO public.team_memberships(team_id,admin_user_id,role) VALUES(t,tm,'member');
 INSERT INTO public.team_page_access(team_id,page_path,can_access) VALUES(t,'/admin/blog',true);
 INSERT INTO public.team_permissions(team_id,resource_type,permission,can_read,can_create,can_update,can_delete) VALUES(t,'blog','crud',true,true,true,true);
 IF public.can_operate_blog(ed,'posts',NULL,NULL,NULL) OR public.can_operate_blog(tm,'posts',NULL,NULL,'read') OR public.can_operate_blog(ed,'comments',NULL,NULL,'create') THEN RAISE EXCEPTION 'Blog fail-closed grants';END IF;
 doc:='{"teamId":null,"record":{"title":"Fictional article","slug":"fictional-editorial-article","content":"Safe Markdown content","excerpt":"Fictional excerpt","author_name":"Fictional author","author_email":"fictional-author@example.test","featured_image_url":"","author_avatar_url":"","category_id":null,"tags":["Web"],"is_featured":false,"read_time_minutes":5}}';
 r:=pg_temp.blog_change(ed,es,NULL,'posts',NULL,'create',NULL,doc,'create');p:=(r->>'id')::uuid;ref:='BLOG-'||upper(replace(p::text,'-',''));
 IF pg_temp.blog_change(ed,es,NULL,'posts',NULL,'create',NULL,doc,'create')<>r THEN RAISE EXCEPTION 'Blog retry duplicated';END IF;
 IF public.blog_private_projection(other,'posts',p) IS NOT NULL OR(public.list_private_blog(other,'posts',1,'','current',NULL)->>'total')<>'0' THEN RAISE EXCEPTION 'Other editor saw private post';END IF;
 IF(public.list_private_blog(ed,'posts',1,'','current',NULL)->'items'->0)?'content' OR(public.list_private_blog(ed,'posts',1,'','current',NULL)->'items'->0)?'author_email' THEN RAISE EXCEPTION 'Blog list over-disclosed';END IF;
 BEGIN PERFORM pg_temp.blog_change(ed,es,'blog-editor','posts',p,'approve',1,jsonb_build_object('confirmation',ref),'self-approve');RAISE EXCEPTION 'Editor approved own content';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM pg_temp.blog_change(a,s,'blog-admin','posts',p,'approve',1,jsonb_build_object('confirmation',ref),'approve');
 PERFORM pg_temp.blog_change(a,s,'blog-admin','posts',p,'publish',2,jsonb_build_object('confirmation',ref),'publish');
 doc:=jsonb_set(doc,'{record,content}','"Unapproved pending replacement"');
 PERFORM pg_temp.blog_change(ed,es,NULL,'posts',p,'update',3,doc,'edit-published');
 IF(SELECT content FROM public.blog_posts WHERE id=p)<>'Safe Markdown content' OR(SELECT status FROM public.blog_posts WHERE id=p)<>'published' OR(SELECT pending_changes->>'content' FROM public.blog_posts WHERE id=p)<>'Unapproved pending replacement' THEN RAISE EXCEPTION 'Editor overwrote approved version';END IF;
 BEGIN PERFORM pg_temp.blog_change(a,s,'blog-admin','posts',p,'approve',3,jsonb_build_object('confirmation',ref),'stale');RAISE EXCEPTION 'Stale approval accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CONFLICT' THEN RAISE;END IF;END;
 PERFORM pg_temp.blog_change(a,s,'blog-admin','posts',p,'reject',4,jsonb_build_object('confirmation',ref,'reason','Fictional feedback'),'reject');
 IF(SELECT content FROM public.blog_posts WHERE id=p)<>'Safe Markdown content' OR(SELECT pending_changes FROM public.blog_posts WHERE id=p) IS NULL THEN RAISE EXCEPTION 'Rejection lost canonical/proposal';END IF;
 PERFORM pg_temp.blog_change(ed,es,NULL,'posts',p,'submit',5,'{"summary":"Revised fictional proposal"}','resubmit');
 PERFORM pg_temp.blog_change(a,s,'blog-admin','posts',p,'approve',6,jsonb_build_object('confirmation',ref),'approve-edit');
 IF(SELECT content FROM public.blog_posts WHERE id=p)<>'Unapproved pending replacement' OR(SELECT count(*) FROM gdg_security.blog_versions WHERE post_id=p)<>7 THEN RAISE EXCEPTION 'Reviewed content/history missing';END IF;
 BEGIN DELETE FROM public.blog_posts WHERE id=p;RAISE EXCEPTION 'Hard-deleted post';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'BLOG_RETAINED' THEN RAISE;END IF;END;
 doc:=jsonb_set(doc,'{teamId}',to_jsonb(t));doc:=jsonb_set(doc,'{record,slug}','"fictional-team-editorial"');r:=pg_temp.blog_change(a,s,NULL,'posts',NULL,'create',NULL,doc,'team-create');p2:=(r->>'id')::uuid;
 IF NOT public.can_operate_blog(tm,'posts',p2,NULL,'read') OR public.can_operate_blog(tm,'posts',p2,NULL,'approve') THEN RAISE EXCEPTION 'Team editorial policy';END IF;
 PERFORM pg_temp.blog_change(a,s,'blog-admin','posts',p2,'assign',1,jsonb_build_object('confirmation','BLOG-'||upper(replace(p2::text,'-','')),'editorId',ed),'assign');
 IF NOT public.can_operate_blog(ed,'posts',p2,NULL,'update') THEN RAISE EXCEPTION 'Explicit assignment ignored';END IF;
 UPDATE public.admin_teams SET is_active=false WHERE id=t;
 IF public.can_operate_blog(tm,'posts',p2,NULL,'read') OR public.can_operate_blog(ed,'posts',p2,NULL,'read') OR public.can_operate_blog(a,'posts',p2,NULL,'update') THEN RAISE EXCEPTION 'Inactive team editorial access';END IF;
 INSERT INTO public.blog_submissions(file_path,original_name,submitter_name,submitter_email,file_size,mime_type,assigned_editor_id,admin_notes) VALUES('fictional/unverified.pdf','fictional.pdf','Fictional submitter','private-submitter@example.test',100,'application/pdf',ed,'private-internal-note') RETURNING id INTO sub;
 PERFORM pg_temp.blog_change(a,s,'blog-admin','submissions',sub,'comment',1,'{"comment":"Private internal thread","type":"internal"}','internal');
 PERFORM pg_temp.blog_change(ed,es,NULL,'submissions',sub,'comment',2,'{"comment":"Fictional editor feedback","type":"feedback"}','feedback');
 IF(public.blog_private_detail(ed,'submissions',sub,1)->>'discussionTotal')<>'1' OR(public.blog_private_projection(ed,'submissions',sub))?'file_path' OR(public.blog_private_projection(ed,'submissions',sub))?'submitter_email' OR(public.blog_private_projection(ed,'submissions',sub))?'admin_notes' THEN RAISE EXCEPTION 'Submission private internals disclosed';END IF;
 IF public.can_operate_blog(other,'submissions',sub,NULL,'read') IS DISTINCT FROM false THEN RAISE EXCEPTION 'Unassigned submission access';END IF;
 INSERT INTO public.blog_comments(post_id,author_name,author_email,content) VALUES(p,'Fictional commenter','commenter@example.test','Retained fictional comment') RETURNING id INTO c;
 IF(public.blog_private_projection(ed,'comments',c))?'author_email' OR public.can_operate_blog(ed,'comments',c,NULL,'approve') THEN RAISE EXCEPTION 'Comment contact/moderation disclosure';END IF;
 PERFORM pg_temp.blog_change(a,s,'blog-admin','comments',c,'flag',1,jsonb_build_object('confirmation','BLOG-'||upper(replace(c::text,'-',''))),'flag');
 IF NOT(SELECT is_flagged FROM public.blog_comments WHERE id=c) THEN RAISE EXCEPTION 'Moderation did not persist';END IF;
 IF has_table_privilege('anon','public.blog_posts','SELECT') OR has_function_privilege('authenticated','public.blog_private_projection(uuid,text,uuid)','EXECUTE') OR has_table_privilege('gdg_realtime','public.blog_likes','SELECT') THEN RAISE EXCEPTION 'Public blog grant';END IF;
END $$;
ROLLBACK;
