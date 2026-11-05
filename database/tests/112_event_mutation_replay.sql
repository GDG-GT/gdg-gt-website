BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES
 ('e1120000-0000-4000-8000-000000000001','event-replay-admin@example.test','fictional','admin',true),
 ('e1120000-0000-4000-8000-000000000002','event-replay-member@example.test','fictional','team_member',true);
CREATE FUNCTION pg_temp.event_replay(a uuid,s uuid,e uuid,act text,rev integer,doc jsonb,r uuid,stamp timestamptz,key text) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.mutate_event_workspace(a,s,e,act,rev,doc,r,stamp,md5(key)||md5(key),
 md5(jsonb_build_array(e,act,rev,doc,r,stamp)::text)||md5(jsonb_build_array(e,act,rev,doc,r,stamp)::text),gen_random_uuid());
$$;
DO $$ DECLARE a uuid:='e1120000-0000-4000-8000-000000000001';u uuid:='e1120000-0000-4000-8000-000000000002';s uuid;us uuid;t uuid;e uuid;r uuid;stamp timestamptz;v jsonb;copy jsonb;doc jsonb;caps jsonb;BEGIN
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(a,repeat('1',64)) RETURNING id INTO s;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(u,repeat('2',64)) RETURNING id INTO us;
 INSERT INTO public.admin_teams(name,slug,created_by) VALUES('Event replay team','event-replay-team',a) RETURNING id INTO t;
 INSERT INTO public.team_memberships(team_id,admin_user_id) VALUES(t,u);
 INSERT INTO public.team_page_access(team_id,page_path,can_access) VALUES(t,'/admin/events',true);
 INSERT INTO public.team_permissions(team_id,resource_type,permission,can_read,can_create,can_update,can_delete)
 VALUES(t,'events','crud',true,true,true,true);
 doc:=jsonb_build_object('title','Fictional replay event','slug','fictional-replay-event','description','Fictional private description',
  'start_at','2099-12-31T18:00:00Z','location','Fictional room','team_id',t);
 v:=pg_temp.event_replay(u,us,NULL,'create',NULL,doc,NULL,NULL,'create');e:=(v->>'id')::uuid;
 IF pg_temp.event_replay(u,us,NULL,'create',NULL,doc,NULL,NULL,'create')<>v
 OR(SELECT count(*) FROM public.events WHERE slug='fictional-replay-event')<>1
 OR(SELECT count(*) FROM public.admin_actions WHERE target_id=e)<>1 THEN RAISE EXCEPTION 'Create replay duplicated event/audit';END IF;
 BEGIN PERFORM pg_temp.event_replay(u,us,NULL,'create',NULL,doc||'{"title":"Changed"}',NULL,NULL,'create');RAISE EXCEPTION 'Changed intent accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CONFLICT' THEN RAISE;END IF;END;
 v:=pg_temp.event_replay(u,us,e,'update',1,'{"location":"Fictional revised room"}',NULL,NULL,'update');
 IF pg_temp.event_replay(u,us,e,'update',1,'{"location":"Fictional revised room"}',NULL,NULL,'update')<>v
 OR(SELECT revision FROM public.events WHERE id=e)<>2 THEN RAISE EXCEPTION 'Update replay changed revision';END IF;
 BEGIN PERFORM pg_temp.event_replay(u,us,e,'update',1,'{}',NULL,NULL,'stale');RAISE EXCEPTION 'New stale write accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CONFLICT' THEN RAISE;END IF;END;
 copy:=pg_temp.event_replay(u,us,e,'duplicate',2,'{}',NULL,NULL,'duplicate');
 IF pg_temp.event_replay(u,us,e,'duplicate',2,'{}',NULL,NULL,'duplicate')<>copy
 OR(SELECT count(*) FROM public.events WHERE title='Fictional replay event (copy)')<>1 THEN RAISE EXCEPTION 'Duplicate replay created another copy';END IF;
 caps:=public.event_workspace_permissions(u,ARRAY[e]);
 IF (caps->>'globalCreate')::boolean OR jsonb_array_length(caps->'teams')<>1
 OR NOT(caps->'records'->0->'actions' ? 'update') OR caps->'records'->0->'actions' ? 'publish'
 OR(caps->'records'->0->>'canExport')::boolean THEN RAISE EXCEPTION 'Capabilities overstate member grants';END IF;
 INSERT INTO public.event_attendance(event_id,attendee_name,attendee_email,idempotency_key,request_hash)
 VALUES(e,'Fictional attendee','event-replay-attendee@example.test',repeat('3',64),repeat('4',64)) RETURNING id,updated_at INTO r,stamp;
 v:=pg_temp.event_replay(u,us,e,'attendee.update',NULL,'{"attended":true}',r,stamp,'checkin');
 IF pg_temp.event_replay(u,us,e,'attendee.update',NULL,'{"attended":true}',r,stamp,'checkin')<>v
 OR(SELECT count(*) FROM public.admin_actions WHERE target_id=r)<>1 THEN RAISE EXCEPTION 'Check-in replay duplicated audit';END IF;
 UPDATE public.event_attendance SET updated_at=updated_at+interval '1 second' WHERE id=r;
 BEGIN PERFORM pg_temp.event_replay(u,us,e,'attendee.update',NULL,'{"notes":"Stale"}',r,stamp,'stale-attendee');RAISE EXCEPTION 'Stale attendee accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CONFLICT' THEN RAISE;END IF;END;
 SELECT updated_at INTO stamp FROM public.event_attendance WHERE id=r;
 v:=pg_temp.event_replay(u,us,e,'attendee.remove',NULL,'{}',r,stamp,'remove');
 IF pg_temp.event_replay(u,us,e,'attendee.remove',NULL,'{}',r,stamp,'remove')<>v
 OR(SELECT count(*) FROM public.admin_actions WHERE target_id=r)<>2 THEN RAISE EXCEPTION 'Removal replay duplicated audit';END IF;
 UPDATE public.team_permissions SET can_create=false WHERE team_id=t;
 BEGIN PERFORM pg_temp.event_replay(u,us,NULL,'create',NULL,doc,NULL,NULL,'create');RAISE EXCEPTION 'Revoked action replay accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 UPDATE public.team_permissions SET can_create=true WHERE team_id=t;
 UPDATE public.events SET team_id=NULL WHERE id=(copy->>'id')::uuid;
 BEGIN PERFORM pg_temp.event_replay(u,us,e,'duplicate',2,'{}',NULL,NULL,'duplicate');RAISE EXCEPTION 'Moved copy leaked';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 UPDATE public.admin_teams SET is_active=false WHERE id=t;
 IF public.can_operate_event(u,'read',t) OR public.can_operate_event(a,'update',t)
 OR NOT public.can_operate_event(a,'read',t) THEN RAISE EXCEPTION 'Archived team boundaries wrong';END IF;
 UPDATE public.admin_teams SET is_active=true WHERE id=t;
 UPDATE public.admin_sessions SET revoked_at=now() WHERE id=us;
 BEGIN PERFORM pg_temp.event_replay(u,us,NULL,'create',NULL,doc,NULL,NULL,'create');RAISE EXCEPTION 'Revoked session replay accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 IF has_function_privilege('anon','public.mutate_event_workspace(uuid,uuid,uuid,text,integer,jsonb,uuid,timestamptz,text,text,uuid)','EXECUTE')
 OR has_function_privilege('authenticated','public.event_workspace_permissions(uuid,uuid[])','EXECUTE')
 OR NOT has_function_privilege('service_role','public.event_workspace_permissions(uuid,uuid[])','EXECUTE') THEN RAISE EXCEPTION 'Event service grants unsafe';END IF;
END $$;
ROLLBACK;
