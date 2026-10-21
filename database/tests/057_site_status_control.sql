BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES
 ('f7000000-0000-4000-8000-000000000001','status-admin@example.test','status-admin','admin',true),
 ('f7000000-0000-4000-8000-000000000002','status-member@example.test','status-member','team_member',true),
 ('f7000000-0000-4000-8000-000000000003','status-editor@example.test','status-editor','blog_editor',true);
CREATE FUNCTION pg_temp.status_change(a uuid,s uuid,pw text,rev integer,doc jsonb,key text) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.mutate_site_status(a,s,pw,rev,doc,md5(key)||md5(key),md5(doc::text)||md5(doc::text),gen_random_uuid());
$$;
DO $$ DECLARE a uuid:='f7000000-0000-4000-8000-000000000001';u uuid:='f7000000-0000-4000-8000-000000000002';ed uuid:='f7000000-0000-4000-8000-000000000003';s uuid;us uuid;t uuid;p uuid;rev integer;doc jsonb;r jsonb;BEGIN
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(a,repeat('7',64)) RETURNING id INTO s;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(u,repeat('8',64)) RETURNING id INTO us;
 INSERT INTO public.admin_teams(name,slug,created_by) VALUES('Fictional availability team','fictional-availability-team',a) RETURNING id INTO t;
 INSERT INTO public.team_memberships(team_id,admin_user_id,role) VALUES(t,u,'member');
 INSERT INTO public.team_page_access(team_id,page_path,can_access) VALUES(t,'/admin/site-status',true);
 INSERT INTO public.team_permissions(team_id,resource_type,permission,can_read,can_update) VALUES(t,'site_status','crud',true,false);
 IF NOT public.can_operate_site_status(u,'read') OR public.can_operate_site_status(u,'update') OR public.can_operate_site_status(ed,'read') OR public.can_operate_site_status(u,NULL) THEN RAISE EXCEPTION 'Availability grants widened';END IF;
 rev:=(public.read_site_status(a,true)->>'revision')::integer;
 doc:='{"record":{"is_live":false,"message":"Fictional maintenance test","redirect_url":"","button_text":"Chapter updates","auto_redirect":false},"confirmation":"MAINTENANCE"}';
 BEGIN PERFORM pg_temp.status_change(u,us,'status-member',rev,doc,'denied');RAISE EXCEPTION 'Read-only grant changed global state';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM pg_temp.status_change(a,s,NULL,rev,doc,'no-password');RAISE EXCEPTION 'No-password state change';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM pg_temp.status_change(a,s,'status-admin',rev,jsonb_set(doc,'{confirmation}','"LIVE"'),'wrong-confirm');RAISE EXCEPTION 'Wrong typed state accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'VALIDATION_ERROR' THEN RAISE;END IF;END;
 r:=pg_temp.status_change(a,s,'status-admin',rev,doc,'maintenance');
 IF pg_temp.status_change(a,s,'status-admin',rev,doc,'maintenance')<>r OR(public.read_site_status()->>'is_live')<>'false' THEN RAISE EXCEPTION 'State or replay failed';END IF;
 IF public.read_site_status() ? 'updatedAt' OR public.read_site_status() ? 'updated_by' OR public.read_site_status() ? 'canUpdate' THEN RAISE EXCEPTION 'Public status leaked operator data';END IF;
 BEGIN PERFORM pg_temp.status_change(a,s,'status-admin',rev,doc,'stale');RAISE EXCEPTION 'Stale revision accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CONFLICT' THEN RAISE;END IF;END;
 rev:=(r->>'revision')::integer;
 BEGIN PERFORM pg_temp.status_change(a,s,'status-admin',rev,jsonb_set(doc,'{record,redirect_url}','"/maintenance"'),'loop');RAISE EXCEPTION 'Maintenance redirect loop accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'VALIDATION_ERROR' THEN RAISE;END IF;END;
 BEGIN PERFORM pg_temp.status_change(a,s,'status-admin',rev,jsonb_set(doc,'{record,redirect_url}','"https://evil.example/"'),'external');RAISE EXCEPTION 'Non-allowlisted redirect accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'VALIDATION_ERROR' THEN RAISE;END IF;END;
 BEGIN PERFORM pg_temp.status_change(a,s,'status-admin',rev,jsonb_set(doc,'{record,redirect_url}','"/l/fictional-unknown-status"'),'unknown');RAISE EXCEPTION 'Unknown Linktree accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 INSERT INTO public.linktree_profiles(username,display_name,is_active) VALUES('fictional-status-links','Fictional status links',true) RETURNING id INTO p;
 doc:=jsonb_set(jsonb_set(doc,'{record,redirect_url}','"/l/fictional-status-links"'),'{record,auto_redirect}','true');
 r:=pg_temp.status_change(a,s,'status-admin',rev,doc,'local');
 IF(public.read_site_status()->>'auto_redirect')<>'true' THEN RAISE EXCEPTION 'Active local redirect missing';END IF;
 UPDATE public.linktree_profiles SET is_active=false WHERE id=p;
 IF(public.read_site_status()->>'auto_redirect')<>'false' OR(public.read_site_status()->>'redirect_url')<>'' THEN RAISE EXCEPTION 'Inactive destination did not fall back to maintenance';END IF;
 UPDATE public.team_permissions SET can_update=true WHERE team_id=t AND resource_type='site_status';
 IF NOT public.can_operate_site_status(u,'update') THEN RAISE EXCEPTION 'Explicit state action not effective';END IF;
 UPDATE public.team_memberships SET is_active=false WHERE team_id=t AND admin_user_id=u;
 IF public.can_operate_site_status(u,'read') THEN RAISE EXCEPTION 'Removed operator retained global state access';END IF;
 doc:=jsonb_set(jsonb_set(jsonb_set(doc,'{record,is_live}','true'),'{record,redirect_url}','""'),'{record,auto_redirect}','false')||'{"confirmation":"LIVE"}';
 PERFORM pg_temp.status_change(a,s,'status-admin',(r->>'revision')::integer,doc,'live');
 IF(public.read_site_status()->>'message')<>'' OR(public.read_site_status()->>'redirect_url')<>'' THEN RAISE EXCEPTION 'Live status disclosed inactive maintenance copy';END IF;
 IF has_table_privilege('anon','public.site_status','SELECT') OR has_function_privilege('authenticated','public.read_site_status(uuid,boolean)','EXECUTE') THEN RAISE EXCEPTION 'Browser status grant exists';END IF;
END $$;
ROLLBACK;
