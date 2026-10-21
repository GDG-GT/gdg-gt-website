BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES
 ('f3000000-0000-4000-8000-000000000001','linktree-admin@example.test','fixture-admin','admin',true),
 ('f3000000-0000-4000-8000-000000000002','linktree-member@example.test','fixture-member','team_member',true),
 ('f3000000-0000-4000-8000-000000000003','linktree-other@example.test','fixture-other','team_member',true),
 ('f3000000-0000-4000-8000-000000000004','linktree-editor@example.test','fixture-editor','blog_editor',true);
CREATE FUNCTION pg_temp.linktree_change(a uuid,s uuid,pw text,p uuid,action text,rev integer,doc jsonb,key text) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.mutate_linktree(a,s,pw,p,action,rev,doc,md5(key)||md5(key),md5(doc::text)||md5(doc::text),gen_random_uuid());
$$;
DO $$ DECLARE a uuid:='f3000000-0000-4000-8000-000000000001';m uuid:='f3000000-0000-4000-8000-000000000002';o uuid:='f3000000-0000-4000-8000-000000000003';ed uuid:='f3000000-0000-4000-8000-000000000004';
 s uuid;ms uuid;t uuid;p uuid;l uuid;l2 uuid;doc jsonb;ldoc jsonb;r jsonb;BEGIN
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(a,repeat('3',64)) RETURNING id INTO s;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(m,repeat('4',64)) RETURNING id INTO ms;
 INSERT INTO public.admin_teams(name,slug,created_by) VALUES('Fictional linktree team','fictional-linktree-team',a) RETURNING id INTO t;
 INSERT INTO public.team_memberships(team_id,admin_user_id,role) VALUES(t,m,'member');
 INSERT INTO public.team_page_access(team_id,page_path,can_access) VALUES(t,'/admin/linktree',true);
 INSERT INTO public.team_permissions(team_id,resource_type,permission,can_read,can_create,can_update,can_delete) VALUES(t,'linktree','crud',true,true,true,true);
 doc:=jsonb_build_object('record',jsonb_build_object('username','fictional-sql-links','displayName','Fictional links','bio','Plain text only','avatarUrl','','background',jsonb_build_object('type','color','value','#f8d8c6'),'theme','light'),'teamId',t);
 r:=pg_temp.linktree_change(m,ms,NULL,NULL,'create',NULL,doc,'new');p:=(r->>'id')::uuid;
 IF(pg_temp.linktree_change(m,ms,NULL,NULL,'create',NULL,doc,'new')->>'id')::uuid<>p THEN RAISE EXCEPTION 'Profile retry duplicated';END IF;
 IF public.public_linktree_profile('fictional-sql-links') IS NOT NULL OR(public.list_linktree_profiles(o,1,'','current')->>'total')<>'0' OR public.can_operate_linktree(ed,t,'read') OR public.can_operate_linktree(m,t,NULL) THEN RAISE EXCEPTION 'Profile draft, role or count privacy failed';END IF;
 BEGIN PERFORM pg_temp.linktree_change(m,ms,'fixture-member',p,'publish',1,'{"confirmation":"Fictional links"}','no-publish');RAISE EXCEPTION 'Missing publish grant bypassed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 INSERT INTO public.team_permissions(team_id,resource_type,permission,can_update) VALUES(t,'linktree','publish',true);
 PERFORM pg_temp.linktree_change(m,ms,'fixture-member',p,'publish',1,'{"confirmation":"Fictional links"}','publish');
 IF public.public_linktree_profile('fictional-sql-links') IS NULL THEN RAISE EXCEPTION 'Published profile unavailable';END IF;
 ldoc:='{"record":{"title":"Fictional native form","url":"/forms/fictional-form","description":"A public first-party form","icon":"form","buttonStyle":"default","buttonColor":"#f4f5f7","textColor":"#25282f","embedType":"none","showClickCount":false}}';
 r:=pg_temp.linktree_change(m,ms,NULL,p,'link_create',2,ldoc,'link');l:=(r->>'linkId')::uuid;
 IF jsonb_array_length(public.public_linktree_profile('fictional-sql-links')->'links')<>0 THEN RAISE EXCEPTION 'Draft link appeared publicly';END IF;
 PERFORM pg_temp.linktree_change(m,ms,'fixture-member',p,'link_publish',3,jsonb_build_object('linkId',l,'confirmation','Fictional native form'),'link-publish');
 r:=public.public_linktree_profile('fictional-sql-links');IF jsonb_array_length(r->'links')<>1 OR r->'links'->0->'clickCount'<>'null'::jsonb OR r ? 'teamId' OR r ? 'createdBy' THEN RAISE EXCEPTION 'Public Linktree projection disclosed private fields';END IF;
 PERFORM public.record_linktree_activity('fictional-sql-links',NULL);PERFORM public.record_linktree_activity('fictional-sql-links',l);PERFORM public.record_linktree_activity('fictional-sql-links',l);
 IF(public.linktree_profile_projection(m,p)->>'revision')<>'4' OR(SELECT click_count FROM public.linktree_links WHERE id=l)<>2 OR(SELECT count(*) FROM public.linktree_analytics WHERE profile_id=p)<>2 THEN RAISE EXCEPTION 'Activity changed editor revision or did not aggregate';END IF;
 r:=public.linktree_analytics_report(m,p,30);IF r->>'views'<>'1' OR r->>'clicks'<>'2' OR r::text LIKE '%visitor_ip%' THEN RAISE EXCEPTION 'Aggregate analytics incorrect or exposed visitor metadata';END IF;
 BEGIN PERFORM public.linktree_analytics_report(o,p,30);RAISE EXCEPTION 'Outsider saw aggregate analytics';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 BEGIN INSERT INTO public.linktree_analytics(profile_id,visitor_ip) VALUES(p,'127.0.0.1');RAISE EXCEPTION 'Raw visitor IP stored';EXCEPTION WHEN check_violation THEN NULL;END;
 BEGIN PERFORM pg_temp.linktree_change(m,ms,NULL,p,'link_update',4,jsonb_build_object('linkId',l,'record',ldoc->'record'),'silent-live');RAISE EXCEPTION 'Live link changed without confirmation';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'VALIDATION_ERROR' THEN RAISE;END IF;END;
 ldoc:=jsonb_set(ldoc,'{record,title}','"Second fictional link"');r:=pg_temp.linktree_change(m,ms,NULL,p,'link_create',4,ldoc,'second');l2:=(r->>'linkId')::uuid;
 PERFORM pg_temp.linktree_change(m,ms,'fixture-member',p,'link_publish',5,jsonb_build_object('linkId',l2,'confirmation','Second fictional link'),'second-publish');
 PERFORM pg_temp.linktree_change(m,ms,'fixture-member',p,'move',6,jsonb_build_object('linkId',l2,'direction','up','confirmation','Fictional links'),'move');
 IF(public.public_linktree_profile('fictional-sql-links')->'links'->0->>'id')::uuid<>l2 THEN RAISE EXCEPTION 'Atomic link ordering failed';END IF;
 BEGIN PERFORM pg_temp.linktree_change(m,ms,'fixture-member',p,'link_unpublish',6,jsonb_build_object('linkId',l2,'confirmation','Second fictional link'),'stale');RAISE EXCEPTION 'Stale aggregate revision accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CONFLICT' THEN RAISE;END IF;END;
 doc:=jsonb_set(doc,'{record,username}','"fictional-renamed-links"')||jsonb_build_object('confirmation','Fictional links');
 PERFORM pg_temp.linktree_change(m,ms,'fixture-member',p,'update',7,doc,'rename');
 IF public.public_linktree_profile('fictional-sql-links') IS NOT NULL OR public.public_linktree_profile('fictional-renamed-links') IS NULL THEN RAISE EXCEPTION 'Rename visibility incorrect';END IF;
 doc:=jsonb_set(doc,'{record,username}','"fictional-sql-links"');
 BEGIN PERFORM pg_temp.linktree_change(a,s,NULL,NULL,'create',NULL,doc,'takeover');RAISE EXCEPTION 'Former username taken over';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'DUPLICATE' THEN RAISE;END IF;END;
 PERFORM pg_temp.linktree_change(m,ms,'fixture-member',p,'link_archive',8,jsonb_build_object('linkId',l2,'confirmation','Second fictional link'),'archive-link');
 IF jsonb_array_length(public.public_linktree_profile('fictional-renamed-links')->'links')<>1 THEN RAISE EXCEPTION 'Archived link stayed public';END IF;
 PERFORM pg_temp.linktree_change(m,ms,'fixture-member',p,'archive',9,'{"confirmation":"Fictional links"}','archive');
 IF public.public_linktree_profile('fictional-renamed-links') IS NOT NULL THEN RAISE EXCEPTION 'Archived profile remained public';END IF;
 PERFORM pg_temp.linktree_change(m,ms,'fixture-member',p,'restore',10,'{"confirmation":"Fictional links"}','restore');
 IF public.public_linktree_profile('fictional-renamed-links') IS NOT NULL THEN RAISE EXCEPTION 'Restore silently republished profile';END IF;
 UPDATE public.team_memberships SET is_active=false WHERE team_id=t AND admin_user_id=m;
 IF public.linktree_profile_projection(m,p) IS NOT NULL THEN RAISE EXCEPTION 'Removed member retained private Linktree access';END IF;
 BEGIN DELETE FROM public.linktree_profiles WHERE id=p;RAISE EXCEPTION 'Retained profile hard-deleted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'LINKTREE_RETAINED' THEN RAISE;END IF;END;
 IF has_function_privilege('anon','public.public_linktree_profile(text)','EXECUTE') OR has_function_privilege('authenticated','public.record_linktree_activity(text,uuid)','EXECUTE') OR has_table_privilege('gdg_realtime','public.linktree_analytics','SELECT') THEN RAISE EXCEPTION 'Browser Linktree grant exists';END IF;
END $$;
ROLLBACK;
