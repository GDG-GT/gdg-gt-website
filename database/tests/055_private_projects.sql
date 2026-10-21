BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES
 ('f5000000-0000-4000-8000-000000000001','project-admin@example.test','project-admin','admin',true),
 ('f5000000-0000-4000-8000-000000000002','project-member@example.test','project-member','team_member',true),
 ('f5000000-0000-4000-8000-000000000003','project-other@example.test','project-other','team_member',true),
 ('f5000000-0000-4000-8000-000000000004','project-editor@example.test','project-editor','blog_editor',true);
CREATE FUNCTION pg_temp.project_change(a uuid,s uuid,pw text,p uuid,action text,rev integer,doc jsonb,key text) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.mutate_private_project(a,s,pw,p,action,rev,doc,md5(key)||md5(key),md5(doc::text)||md5(doc::text),gen_random_uuid());
$$;
DO $$ DECLARE a uuid:='f5000000-0000-4000-8000-000000000001';u uuid:='f5000000-0000-4000-8000-000000000002';o uuid:='f5000000-0000-4000-8000-000000000003';ed uuid:='f5000000-0000-4000-8000-000000000004';
 s uuid;us uuid;t uuid;p uuid;m uuid;r jsonb;d jsonb;BEGIN
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(a,repeat('5',64)) RETURNING id INTO s;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(u,repeat('6',64)) RETURNING id INTO us;
 INSERT INTO public.admin_teams(name,slug,created_by) VALUES('Fictional project team','fictional-project-team',a) RETURNING id INTO t;
 INSERT INTO public.team_memberships(team_id,admin_user_id,role) VALUES(t,u,'member');
 INSERT INTO public.team_page_access(team_id,page_path,can_access) VALUES(t,'/admin/projects',true);
 INSERT INTO public.team_permissions(team_id,resource_type,permission,can_read,can_create,can_update,can_delete) VALUES(t,'projects','crud',true,true,true,true);
 d:=jsonb_build_object('teamId',t,'record','{"title":"Fictional private project","description":"Plain text only","short_description":"Private","image_url":"","github_url":"https://github.com/example/fictional","demo_url":"","tech_stack":["TypeScript"],"tags":["fictional"],"category":"web","status":"active","difficulty_level":"intermediate","team_size":3,"start_date":"2026-10-20","end_date":"2026-10-21","is_featured":true,"is_open_source":true}'::jsonb);
 r:=pg_temp.project_change(u,us,NULL,NULL,'create',NULL,d,'create');p:=(r->>'id')::uuid;
 IF pg_temp.project_change(u,us,NULL,NULL,'create',NULL,d,'create')<>r THEN RAISE EXCEPTION 'Create retry duplicated';END IF;
 IF(public.list_private_projects(o,1,'','current',NULL,NULL,NULL)->>'total')<>'0' OR public.project_projection(o,p) IS NOT NULL OR public.can_operate_project(ed,t,'read') OR public.can_operate_project(u,t,NULL) THEN RAISE EXCEPTION 'Scope or role disclosure';END IF;
 IF(public.list_private_projects(u,1,'','current',NULL,NULL,true)->'stats'->'technologies'->>'TypeScript')<>'1' THEN RAISE EXCEPTION 'Private filtered statistics wrong';END IF;
 INSERT INTO public.project_stars(project_id,user_identifier) VALUES(p,'fictional-private-star');
 UPDATE public.projects SET stars_count=1 WHERE id=p;
 IF public.project_projection(u,p)->>'starCount'<>'1' OR public.project_projection(u,p)::text LIKE '%fictional-private-star%' THEN RAISE EXCEPTION 'Star projection wrong or exposed voter identity';END IF;
 INSERT INTO public.members(name,email,is_active) VALUES('Fictional project participant','participant-project@example.test',true) RETURNING id INTO m;
 PERFORM pg_temp.project_change(u,us,NULL,p,'member_save',1,'{"email":"participant-project@example.test","role":"maintainer"}','member-add');
 IF(public.private_project_detail(u,p,1)->'members'->0->>'role')<>'maintainer' OR public.private_project_detail(u,p,1)::text LIKE '%participant-project@example.test%' THEN RAISE EXCEPTION 'Participant projection wrong or leaked contact';END IF;
 PERFORM pg_temp.project_change(u,us,NULL,p,'member_remove',2,jsonb_build_object('memberId',m),'member-remove');
 IF(public.project_projection(u,p)->>'memberCount')<>'0' OR(public.private_project_detail(u,p,1)->'members'->0->>'active')<>'false' THEN RAISE EXCEPTION 'Membership history not retained';END IF;
 PERFORM pg_temp.project_change(u,us,NULL,p,'member_save',3,'{"email":"participant-project@example.test","role":"reviewer"}','member-rejoin');
 IF(SELECT count(*) FROM public.project_members WHERE project_id=p)<>1 OR(SELECT count(*) FROM public.project_stars WHERE project_id=p)<>1 THEN RAISE EXCEPTION 'Rejoin duplicated history or changed stars';END IF;
 BEGIN PERFORM pg_temp.project_change(u,us,NULL,p,'update',1,d,'stale');RAISE EXCEPTION 'Stale write accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CONFLICT' THEN RAISE;END IF;END;
 BEGIN PERFORM pg_temp.project_change(u,us,NULL,p,'archive',4,'{"confirmation":"Fictional private project"}','no-password');RAISE EXCEPTION 'Missing confirmation accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'VALIDATION_ERROR' THEN RAISE;END IF;END;
 PERFORM pg_temp.project_change(u,us,'project-member',p,'archive',4,'{"confirmation":"Fictional private project"}','archive');
 IF(public.list_private_projects(u,1,'','current',NULL,NULL,NULL)->>'total')<>'0' OR(public.list_private_projects(u,1,'','trash',NULL,NULL,NULL)->>'total')<>'1' THEN RAISE EXCEPTION 'Archive listing failed';END IF;
 PERFORM pg_temp.project_change(u,us,'project-member',p,'restore',5,'{"confirmation":"Fictional private project"}','restore');
 UPDATE public.team_permissions SET can_update=false WHERE team_id=t AND resource_type='projects';
 BEGIN PERFORM pg_temp.project_change(u,us,NULL,p,'member_save',3,'{"email":"participant-project@example.test","role":"reviewer"}','member-rejoin');RAISE EXCEPTION 'Replay bypassed revoked action';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 UPDATE public.team_memberships SET is_active=false WHERE team_id=t AND admin_user_id=u;
 IF public.project_projection(u,p) IS NOT NULL OR(public.list_private_projects(u,1,'','current',NULL,NULL,NULL)->>'total')<>'0' THEN RAISE EXCEPTION 'Removed member retained history/counts';END IF;
 UPDATE public.admin_teams SET is_active=false WHERE id=t;
 IF public.project_projection(a,p) IS NULL OR public.can_operate_project(a,t,'update') THEN RAISE EXCEPTION 'Inactive team is not read-only for admin';END IF;
 BEGIN DELETE FROM public.projects WHERE id=p;RAISE EXCEPTION 'Project hard deleted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'PROJECT_RETAINED' THEN RAISE;END IF;END;
 IF has_table_privilege('anon','public.projects','SELECT') OR has_table_privilege('authenticated','public.project_members','SELECT') OR has_table_privilege('gdg_realtime','public.project_stars','SELECT') OR has_function_privilege('anon','public.project_projection(uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Browser project grant exists';END IF;
END $$;
ROLLBACK;
