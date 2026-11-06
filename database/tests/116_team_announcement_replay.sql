BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES
 ('b1160000-0000-4000-8000-000000000001','post-replay-admin@example.test','fictional','admin',true),
 ('b1160000-0000-4000-8000-000000000002','post-replay-lead@example.test','fictional','team_member',true),
 ('b1160000-0000-4000-8000-000000000003','post-replay-member@example.test','fictional','team_member',true);
CREATE FUNCTION pg_temp.announcement_replay(a uuid,s uuid,t uuid,i uuid,act text,rev integer,doc jsonb,key text) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.mutate_team_announcement_workspace(a,s,t,i,act,rev,doc,md5(key)||md5(key),
 md5(jsonb_build_array(t,i,act,rev,doc)::text)||md5(jsonb_build_array(t,i,act,rev,doc)::text),gen_random_uuid());
$$;
DO $$ DECLARE a uuid:='b1160000-0000-4000-8000-000000000001';lead uuid:='b1160000-0000-4000-8000-000000000002';u uuid:='b1160000-0000-4000-8000-000000000003';
 s uuid;ls uuid;us uuid;t uuid;i uuid;v jsonb;doc jsonb;proof jsonb;BEGIN
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(a,repeat('1',64)) RETURNING id INTO s;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(lead,repeat('2',64)) RETURNING id INTO ls;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(u,repeat('3',64)) RETURNING id INTO us;
 v:=public.mutate_team(a,s,'fictional',NULL,'create',NULL,jsonb_build_object('name','Fictional announcement replay','slug','fictional-post-replay','description','Private fixture','color','#4285F4','icon','users','leadId',lead),gen_random_uuid());t:=(v->'team'->>'id')::uuid;
 PERFORM public.mutate_team(a,s,'fictional',t,'member_add',1,jsonb_build_object('email','post-replay-member@example.test','role','member'),gen_random_uuid());
 doc:='{"title":"Fictional original post","message":"Fictional private body","priority":"normal","pinned":false,"scheduledFor":null,"expiresAt":null}';
 v:=pg_temp.announcement_replay(a,s,t,NULL,'create',NULL,doc,'create');i:=(v->>'id')::uuid;
 IF pg_temp.announcement_replay(a,s,t,NULL,'create',NULL,doc,'create')->>'id'<>i::text
 OR(SELECT count(*) FROM public.team_announcements WHERE team_id=t)<>1
 OR(SELECT count(*) FROM public.admin_actions WHERE target_id=i AND action='teams.announcement_create')<>1 THEN RAISE EXCEPTION 'Draft create replay duplicated';END IF;
 IF EXISTS(SELECT 1 FROM public.idempotency_keys WHERE scope='team-announcement:'||a AND(result ? 'message' OR result ? 'title')) THEN RAISE EXCEPTION 'Announcement receipt retained private content';END IF;
 BEGIN PERFORM pg_temp.announcement_replay(a,s,t,NULL,'create',NULL,doc||'{"title":"Changed"}','create');RAISE EXCEPTION 'Changed draft intent accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CONFLICT' THEN RAISE;END IF;END;
 BEGIN PERFORM pg_temp.announcement_replay(a,s,t,i,'publish',1,'{"confirmation":"Wrong post"}','wrong-proof');RAISE EXCEPTION 'Untyped publication accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'VALIDATION_ERROR' THEN RAISE;END IF;END;
 proof:='{"confirmation":"Fictional original post"}';
 v:=pg_temp.announcement_replay(a,s,t,i,'publish',1,proof,'publish');
 IF(pg_temp.announcement_replay(a,s,t,i,'publish',1,proof,'publish')->>'revision')::integer<>2
 OR(SELECT publication_version FROM public.team_announcements WHERE id=i)<>1
 OR(SELECT count(*) FROM public.delivery_jobs WHERE payload->>'announcementId'=i::text)<>1 THEN RAISE EXCEPTION 'Publication replay duplicated notification job/version';END IF;
 IF public.team_announcement_record(u,t,i)->'record'->'readCount'<>'null'::jsonb THEN RAISE EXCEPTION 'Ordinary reader received private receipt count';END IF;
 PERFORM pg_temp.announcement_replay(u,us,t,i,'read',NULL,'{}','read');PERFORM pg_temp.announcement_replay(u,us,t,i,'read',NULL,'{}','read');
 IF(SELECT count(*) FROM public.team_announcement_reads WHERE announcement_id=i AND user_id=u)<>1 THEN RAISE EXCEPTION 'Read replay duplicated acknowledgement';END IF;
 PERFORM pg_temp.announcement_replay(a,s,t,i,'unpublish',2,proof,'unpublish');
 BEGIN PERFORM pg_temp.announcement_replay(u,us,t,i,'read',NULL,'{}','read');RAISE EXCEPTION 'Private post acknowledgement replay accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 doc:=doc||'{"title":"Fictional revised post"}';PERFORM pg_temp.announcement_replay(a,s,t,i,'update',3,doc,'update');
 IF(pg_temp.announcement_replay(a,s,t,i,'update',3,doc,'update')->>'revision')::integer<>4 THEN RAISE EXCEPTION 'Draft update replay repeated revision';END IF;
 proof:='{"confirmation":"Fictional revised post"}';PERFORM pg_temp.announcement_replay(a,s,t,i,'publish',4,proof,'republish');
 BEGIN PERFORM pg_temp.announcement_replay(a,s,t,i,'update',5,doc,'unsafe-published-edit');RAISE EXCEPTION 'Published edit without typed title accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'VALIDATION_ERROR' THEN RAISE;END IF;END;
 PERFORM pg_temp.announcement_replay(a,s,t,i,'update',5,doc||proof,'published-edit');
 IF(SELECT is_published FROM public.team_announcements WHERE id=i) THEN RAISE EXCEPTION 'Published edit did not return to draft';END IF;
 PERFORM pg_temp.announcement_replay(a,s,t,i,'pin',6,'{"pinned":true}','pin');
 IF(pg_temp.announcement_replay(a,s,t,i,'pin',6,'{"pinned":true}','pin')->>'revision')::integer<>7 THEN RAISE EXCEPTION 'Pin replay repeated revision';END IF;
 PERFORM pg_temp.announcement_replay(a,s,t,i,'archive',7,proof,'archive');
 IF(pg_temp.announcement_replay(a,s,t,i,'archive',7,proof,'archive')->>'revision')::integer<>8 THEN RAISE EXCEPTION 'Archive replay repeated revision';END IF;
 PERFORM pg_temp.announcement_replay(a,s,t,i,'restore',8,proof,'restore');
 IF(pg_temp.announcement_replay(a,s,t,i,'restore',8,proof,'restore')->>'revision')::integer<>9 OR(SELECT is_published FROM public.team_announcements WHERE id=i) THEN RAISE EXCEPTION 'Restore replay republished or repeated revision';END IF;
 IF(SELECT count(*) FROM public.delivery_jobs WHERE payload->>'announcementId'=i::text)<>2 THEN RAISE EXCEPTION 'Only two intended publications should queue notifications';END IF;
 IF(public.list_team_announcements_filtered(a,t,1,'drafts','Fictional revised post')->>'total')::integer<>1 THEN RAISE EXCEPTION 'Exact title lookup missing';END IF;
 INSERT INTO public.team_announcements(team_id,title,message,author_id,is_published) SELECT t,'Fictional lookup','Fictional private fixture',a,false FROM generate_series(1,25);
 v:=public.list_team_announcements_filtered(a,t,2,'drafts','Fictional lookup');
 IF(v->>'total')::integer<>25 OR jsonb_array_length(v->'items')<>5 THEN RAISE EXCEPTION 'Exact lookup filtered after pagination';END IF;
 IF(public.list_team_announcements_filtered(u,t,1,'current',NULL)->>'total')::integer<>0 THEN RAISE EXCEPTION 'Ordinary reader inferred private posts';END IF;
 BEGIN PERFORM public.list_team_announcements_filtered(u,t,1,'drafts',NULL);RAISE EXCEPTION 'Ordinary reader used private filter';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.team_announcement_record(a,gen_random_uuid(),i);RAISE EXCEPTION 'Cross-team selected post exposed';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 PERFORM pg_temp.announcement_replay(lead,ls,t,NULL,'create',NULL,doc,'lead-create');
 UPDATE public.team_memberships SET role='member' WHERE team_id=t AND admin_user_id=lead;
 BEGIN PERFORM pg_temp.announcement_replay(lead,ls,t,NULL,'create',NULL,doc,'lead-create');RAISE EXCEPTION 'Lost manager authority replay accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 UPDATE public.admin_users SET locked_until=now()+interval '1 minute' WHERE id=a;
 BEGIN PERFORM pg_temp.announcement_replay(a,s,t,i,'restore',8,proof,'restore');RAISE EXCEPTION 'Locked account replay accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 UPDATE public.admin_users SET locked_until=NULL WHERE id=a;UPDATE public.admin_sessions SET revoked_at=now() WHERE id=s;
 BEGIN PERFORM pg_temp.announcement_replay(a,s,t,i,'restore',8,proof,'restore');RAISE EXCEPTION 'Revoked session replay accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 IF has_function_privilege('anon','public.mutate_team_announcement_workspace(uuid,uuid,uuid,uuid,text,integer,jsonb,text,text,uuid)','EXECUTE')
 OR has_function_privilege('authenticated','public.team_announcement_record(uuid,uuid,uuid)','EXECUTE')
 OR has_function_privilege('gdg_realtime','public.list_team_announcements_filtered(uuid,uuid,integer,text,text)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.mutate_team_announcement_workspace(uuid,uuid,uuid,uuid,text,integer,jsonb,text,text,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Announcement replay grants unsafe';END IF;
END $$;
ROLLBACK;
