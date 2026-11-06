BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES
 ('b1140000-0000-4000-8000-000000000001','team-replay-admin@example.test','fictional','admin',true),
 ('b1140000-0000-4000-8000-000000000002','team-replay-lead@example.test','fictional','team_member',true),
 ('b1140000-0000-4000-8000-000000000003','team-replay-member@example.test','fictional','team_member',true);
CREATE FUNCTION pg_temp.team_replay(a uuid,s uuid,t uuid,act text,rev integer,doc jsonb,key text) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.mutate_team_workspace(a,s,'fictional',t,act,rev,doc,md5(key)||md5(key),
 md5(jsonb_build_array(t,act,rev,doc)::text)||md5(jsonb_build_array(t,act,rev,doc)::text),gen_random_uuid());
$$;
DO $$ DECLARE a uuid:='b1140000-0000-4000-8000-000000000001';lead uuid:='b1140000-0000-4000-8000-000000000002';u uuid:='b1140000-0000-4000-8000-000000000003';s uuid;ls uuid;t uuid;dest uuid;m uuid;rev integer;v jsonb;doc jsonb;BEGIN
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(a,repeat('1',64)) RETURNING id INTO s;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(lead,repeat('2',64)) RETURNING id INTO ls;
 doc:=jsonb_build_object('name','Fictional replay source','slug','fictional-replay-source','description','Private fictional team','color','#4285F4','icon','users','leadId',lead);
 v:=pg_temp.team_replay(a,s,NULL,'create',NULL,doc,'create');t:=(v->'team'->>'id')::uuid;
 IF pg_temp.team_replay(a,s,NULL,'create',NULL,doc,'create')->'team'->>'id'<>t::text
 OR(SELECT count(*) FROM public.admin_teams WHERE slug='fictional-replay-source')<>1
 OR(SELECT count(*) FROM public.team_activity_log WHERE team_id=t)<>1
 OR(SELECT count(*) FROM public.admin_actions WHERE target_id=t)<>1 THEN RAISE EXCEPTION 'Team create replay duplicated team/activity/audit';END IF;
 IF EXISTS(SELECT 1 FROM public.idempotency_keys WHERE scope='team-workspace:'||a AND(result ? 'members' OR result ? 'team')) THEN RAISE EXCEPTION 'Receipt retained private workspace';END IF;
 BEGIN PERFORM pg_temp.team_replay(a,s,NULL,'create',NULL,doc||'{"name":"Changed"}','create');RAISE EXCEPTION 'Changed intent accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CONFLICT' THEN RAISE;END IF;END;
 v:=pg_temp.team_replay(a,s,NULL,'create',NULL,doc||'{"name":"Fictional replay destination","slug":"fictional-replay-destination"}','destination');dest:=(v->'team'->>'id')::uuid;
 doc:='{"name":"Fictional replay source renamed","description":"Updated fictional description","color":"#4285F4","icon":"users"}';
 v:=pg_temp.team_replay(a,s,t,'update',1,doc,'lead-update');
 IF(pg_temp.team_replay(a,s,t,'update',1,doc,'lead-update')->'team'->>'revision')::integer<>2
 OR(SELECT revision FROM public.admin_teams WHERE id=t)<>2 THEN RAISE EXCEPTION 'Team update replay incremented revision';END IF;
 BEGIN PERFORM pg_temp.team_replay(a,s,t,'update',1,doc,'new-stale');RAISE EXCEPTION 'New stale team write accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CONFLICT' THEN RAISE;END IF;END;
 v:=pg_temp.team_replay(a,s,t,'member_add',2,jsonb_build_object('email','team-replay-member@example.test','role','member'),'add');
 IF(pg_temp.team_replay(a,s,t,'member_add',2,jsonb_build_object('email','team-replay-member@example.test','role','member'),'add')->'team'->>'revision')::integer<>3
 OR(SELECT count(*) FROM public.team_memberships WHERE team_id=t AND admin_user_id=u)<>1 THEN RAISE EXCEPTION 'Member add replay duplicated';END IF;
 SELECT id,revision INTO m,rev FROM public.team_memberships WHERE team_id=t AND admin_user_id=u;
 doc:=jsonb_build_object('membershipId',m,'membershipRevision',rev,'destinationId',dest,'reason','Fictional reviewed transfer');
 v:=pg_temp.team_replay(a,s,t,'member_transfer',3,doc,'transfer');
 IF(pg_temp.team_replay(a,s,t,'member_transfer',3,doc,'transfer')->'team'->>'revision')::integer<>4
 OR(SELECT count(*) FROM public.team_member_transfers WHERE membership_id=m)<>1
 OR(SELECT count(*) FROM public.team_memberships WHERE team_id=dest AND admin_user_id=u AND is_active)<>1 THEN RAISE EXCEPTION 'Transfer replay duplicated membership/history';END IF;
 UPDATE public.admin_teams SET is_active=false,deleted_at=now() WHERE id=dest;
 BEGIN PERFORM pg_temp.team_replay(a,s,t,'member_transfer',3,doc,'transfer');RAISE EXCEPTION 'Archived destination replay accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 UPDATE public.admin_teams SET is_active=true,deleted_at=NULL WHERE id=dest;
 doc:='{"grants":[]}';v:=pg_temp.team_replay(a,s,t,'permissions',4,doc,'permissions');
 IF(pg_temp.team_replay(a,s,t,'permissions',4,doc,'permissions')->'team'->>'revision')::integer<>5 THEN RAISE EXCEPTION 'Grant replay repeated mutation';END IF;
 doc:='{}';v:=pg_temp.team_replay(a,s,t,'archive',5,doc,'archive');
 IF(pg_temp.team_replay(a,s,t,'archive',5,doc,'archive')->'team'->>'revision')::integer<>6 THEN RAISE EXCEPTION 'Archive replay repeated mutation';END IF;
 v:=pg_temp.team_replay(a,s,t,'restore',6,doc,'restore');
 IF(pg_temp.team_replay(a,s,t,'restore',6,doc,'restore')->'team'->>'revision')::integer<>7 THEN RAISE EXCEPTION 'Restore replay repeated mutation';END IF;
 v:=pg_temp.team_replay(lead,ls,t,'member_add',7,jsonb_build_object('email','team-replay-member@example.test','role','member'),'lead-add');
 UPDATE public.team_memberships SET role='member' WHERE team_id=t AND admin_user_id=lead;
 BEGIN PERFORM pg_temp.team_replay(lead,ls,t,'member_add',7,jsonb_build_object('email','team-replay-member@example.test','role','member'),'lead-add');RAISE EXCEPTION 'Lost action authority replay accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 UPDATE public.admin_sessions SET revoked_at=now() WHERE id=s;
 BEGIN PERFORM pg_temp.team_replay(a,s,t,'archive',5,'{}','archive');RAISE EXCEPTION 'Revoked session replay accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 IF has_function_privilege('anon','public.mutate_team_workspace(uuid,uuid,text,uuid,text,integer,jsonb,text,text,uuid)','EXECUTE')
 OR has_function_privilege('authenticated','public.mutate_team_workspace(uuid,uuid,text,uuid,text,integer,jsonb,text,text,uuid)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.mutate_team_workspace(uuid,uuid,text,uuid,text,integer,jsonb,text,text,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Team receipt function grants unsafe';END IF;
END $$;
ROLLBACK;
