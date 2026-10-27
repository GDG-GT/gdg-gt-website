BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES
 ('c1100000-0000-4000-8000-000000000001','curated-admin@example.test','fictional','admin',true),
 ('c1100000-0000-4000-8000-000000000002','curated-member@example.test','fictional','team_member',true);
CREATE FUNCTION pg_temp.curated(a uuid,s uuid,ns text,kind text,rid uuid,action text,rev integer,doc jsonb,key text) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.mutate_curated_content(a,s,ns,kind,rid,action,rev,doc,md5(key)||md5(key),
 md5(jsonb_build_array(ns,kind,rid,action,rev,doc)::text)||md5(jsonb_build_array(ns,kind,rid,action,rev,doc)::text),gen_random_uuid());
$$;
DO $$ DECLARE a uuid:='c1100000-0000-4000-8000-000000000001';u uuid:='c1100000-0000-4000-8000-000000000002';s uuid;us uuid;t uuid;r jsonb;p uuid;resource uuid;doc jsonb;BEGIN
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(a,repeat('c',64)) RETURNING id INTO s;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(u,repeat('d',64)) RETURNING id INTO us;
 doc:='{"label":"Fictional retry nav","href":"/events"}';
 r:=pg_temp.curated(a,s,'site','navigation',NULL,'create',NULL,doc,'site-create');p:=(r->>'id')::uuid;
 IF pg_temp.curated(a,s,'site','navigation',NULL,'create',NULL,doc,'site-create')<>r
 OR(SELECT count(*) FROM public.navigation_items WHERE label='Fictional retry nav')<>1
 OR(SELECT count(*) FROM public.admin_actions WHERE target_id=p)<>1 THEN RAISE EXCEPTION 'CMS retry duplicated record/audit';END IF;
 BEGIN PERFORM pg_temp.curated(a,s,'site','navigation',NULL,'create',NULL,'{"label":"Changed","href":"/team"}','site-create');RAISE EXCEPTION 'Changed retry accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CONFLICT' THEN RAISE;END IF;END;
 r:=pg_temp.curated(a,s,'site','navigation',p,'update',1,'{"label":"Fictional retry revised","href":"/events"}','site-update');
 IF pg_temp.curated(a,s,'site','navigation',p,'update',1,'{"label":"Fictional retry revised","href":"/events"}','site-update')<>r
 OR(SELECT revision FROM public.navigation_items WHERE id=p)<>2 THEN RAISE EXCEPTION 'CMS retry incremented revision';END IF;
 BEGIN PERFORM pg_temp.curated(a,s,'site','navigation',p,'update',1,'{"label":"Stale","href":"/events"}','new-stale');RAISE EXCEPTION 'New stale key accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CONFLICT' THEN RAISE;END IF;END;
 INSERT INTO public.admin_teams(name,slug,created_by) VALUES('Curated fixture team','curated-fixture-team',a) RETURNING id INTO t;
 INSERT INTO public.team_memberships(team_id,admin_user_id) VALUES(t,u);
 INSERT INTO public.team_page_access(team_id,page_path,can_access) VALUES(t,'/admin/resources',true);
 INSERT INTO public.team_permissions(team_id,resource_type,permission,can_read,can_create,can_update,can_delete)
 VALUES(t,'resources','crud',true,true,true,true);
 doc:=jsonb_build_object('title','Fictional retry resource','description','Fictional content only','type','documentation','team_id',t);
 r:=pg_temp.curated(u,us,'collection','resources',NULL,'create',NULL,doc,'resource-create');resource:=(r->>'id')::uuid;
 IF pg_temp.curated(u,us,'collection','resources',NULL,'create',NULL,doc,'resource-create')<>r
 OR(SELECT count(*) FROM public.resources WHERE id=resource)<>1 THEN RAISE EXCEPTION 'Resource retry duplicated';END IF;
 UPDATE public.team_permissions SET can_create=false WHERE team_id=t AND resource_type='resources';
 BEGIN PERFORM pg_temp.curated(u,us,'collection','resources',NULL,'create',NULL,doc,'resource-create');RAISE EXCEPTION 'Revoked action replay accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 UPDATE public.team_permissions SET can_create=true WHERE team_id=t AND resource_type='resources';
 UPDATE public.resources SET team_id=NULL WHERE id=resource;
 BEGIN PERFORM pg_temp.curated(u,us,'collection','resources',NULL,'create',NULL,doc,'resource-create');RAISE EXCEPTION 'Moved result disclosed on replay';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 UPDATE public.admin_sessions SET revoked_at=now() WHERE id=s;
 BEGIN PERFORM pg_temp.curated(a,s,'site','navigation',NULL,'create',NULL,'{"label":"Fictional retry nav","href":"/events"}','site-create');RAISE EXCEPTION 'Revoked session replay accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 IF has_function_privilege('anon','public.mutate_curated_content(uuid,uuid,text,text,uuid,text,integer,jsonb,text,text,uuid)','EXECUTE')
 OR has_function_privilege('authenticated','public.mutate_curated_content(uuid,uuid,text,text,uuid,text,integer,jsonb,text,text,uuid)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.mutate_curated_content(uuid,uuid,text,text,uuid,text,integer,jsonb,text,text,uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'Curated retry function grants unsafe';END IF;
END $$;
ROLLBACK;
