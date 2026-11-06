BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES
 ('a1130000-0000-4000-8000-000000000001','account-replay-super@example.test','fictional','super_admin',true),
 ('a1130000-0000-4000-8000-000000000002','account-replay-admin@example.test','fictional','admin',true);
CREATE FUNCTION pg_temp.account_replay(a uuid,s uuid,t uuid,act text,rev integer,doc jsonb,key text) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.mutate_account_workspace(a,s,'fictional',t,act,rev,doc,md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text),repeat('fictional-encrypted-placeholder',3),
 md5(key)||md5(key),md5(jsonb_build_array(t,act,rev,doc-'passwordHash')::text)||md5(jsonb_build_array(t,act,rev,doc-'passwordHash')::text),gen_random_uuid());
$$;
DO $$ DECLARE a uuid:='a1130000-0000-4000-8000-000000000001';admin uuid:='a1130000-0000-4000-8000-000000000002';s uuid;adms uuid;t uuid;r jsonb;doc jsonb;hash text:='scrypt$32768$8$1$'||repeat('A',22)||'$'||repeat('B',86);rev integer;BEGIN
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(a,repeat('1',64)) RETURNING id INTO s;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(admin,repeat('2',64)) RETURNING id INTO adms;
 doc:=jsonb_build_object('email','account-replay-created@example.test','display_name','Fictional retry account','role','team_member','passwordHash',hash);
 r:=pg_temp.account_replay(admin,adms,NULL,'create',NULL,doc,'create');t:=(r->>'id')::uuid;
 IF pg_temp.account_replay(admin,adms,NULL,'create',NULL,doc||jsonb_build_object('passwordHash',replace(hash,'B','C')),'create')<>r
 OR(SELECT count(*) FROM public.account_access_tokens WHERE admin_user_id=t)<>1
 OR(SELECT count(*) FROM public.delivery_jobs WHERE payload->>'userId'=t::text)<>1
 OR(SELECT count(*) FROM public.admin_actions WHERE target_id=t)<>1 THEN RAISE EXCEPTION 'Account replay duplicated account/access token/job/audit';END IF;
 IF r ? 'password_hash' OR r ? 'token_hash' OR EXISTS(SELECT 1 FROM public.idempotency_keys WHERE scope='account-workspace:'||admin AND (result::text LIKE '%scrypt%' OR result::text LIKE '%encrypted%')) THEN RAISE EXCEPTION 'Account receipt leaked secret';END IF;
 BEGIN PERFORM pg_temp.account_replay(admin,adms,NULL,'create',NULL,doc||'{"display_name":"Changed intent"}','create');RAISE EXCEPTION 'Changed intent accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CONFLICT' THEN RAISE;END IF;END;
 r:=pg_temp.account_replay(admin,adms,t,'update',1,'{"display_name":"Fictional revised name","role":"team_member"}','update');
 IF pg_temp.account_replay(admin,adms,t,'update',1,'{"display_name":"Fictional revised name","role":"team_member"}','update')<>r
 OR(SELECT revision FROM public.admin_users WHERE id=t)<>2 THEN RAISE EXCEPTION 'Account update replay incremented revision';END IF;
 BEGIN PERFORM pg_temp.account_replay(admin,adms,t,'update',1,'{"display_name":"Stale","role":"team_member"}','stale');RAISE EXCEPTION 'New stale key accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CONFLICT' THEN RAISE;END IF;END;
 r:=pg_temp.account_replay(admin,adms,t,'archive',2,'{}','archive');
 IF pg_temp.account_replay(admin,adms,t,'archive',2,'{}','archive')<>r
 OR(SELECT revision FROM public.admin_users WHERE id=t)<>3 THEN RAISE EXCEPTION 'Archive replay duplicated operation';END IF;
 r:=pg_temp.account_replay(admin,adms,t,'restore',3,'{}','restore');
 IF pg_temp.account_replay(admin,adms,t,'restore',3,'{}','restore')<>r OR(r->>'is_active')::boolean THEN RAISE EXCEPTION 'Restore replay changed access';END IF;
 r:=pg_temp.account_replay(admin,adms,t,'activate',4,'{}','activate');
 IF pg_temp.account_replay(admin,adms,t,'activate',4,'{}','activate')<>r THEN RAISE EXCEPTION 'Activate replay mismatch';END IF;
 r:=pg_temp.account_replay(admin,adms,t,'reset',5,'{}','reset');
 IF pg_temp.account_replay(admin,adms,t,'reset',5,'{}','reset')<>r OR(SELECT count(*) FROM public.account_access_tokens WHERE admin_user_id=t)<>2
 OR(SELECT count(*) FROM public.delivery_jobs WHERE payload->>'userId'=t::text)<>2 THEN RAISE EXCEPTION 'Reset replay queued another capability';END IF;
 r:=pg_temp.account_replay(admin,adms,t,'revoke_sessions',6,'{}','revoke');
 IF pg_temp.account_replay(admin,adms,t,'revoke_sessions',6,'{}','revoke')<>r THEN RAISE EXCEPTION 'Session revocation replay mismatch';END IF;
 r:=pg_temp.account_replay(admin,adms,t,'deactivate',7,'{}','deactivate');
 IF pg_temp.account_replay(admin,adms,t,'deactivate',7,'{}','deactivate')<>r THEN RAISE EXCEPTION 'Deactivation replay mismatch';END IF;
 UPDATE public.admin_users SET role='super_admin' WHERE id=t;
 BEGIN PERFORM pg_temp.account_replay(admin,adms,NULL,'create',NULL,doc,'create');RAISE EXCEPTION 'Escalated result leaked to former manager';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 BEGIN PERFORM pg_temp.account_replay(admin,adms,a,'deactivate',1,'{}','hierarchy');RAISE EXCEPTION 'Hierarchy bypass';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 UPDATE public.admin_sessions SET revoked_at=now() WHERE id=adms;
 BEGIN PERFORM pg_temp.account_replay(admin,adms,NULL,'create',NULL,doc,'create');RAISE EXCEPTION 'Revoked session replay accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.mutate_account_workspace(a,s,'wrong',NULL,'create',NULL,doc,repeat('3',64),repeat('encrypted',10),repeat('4',64),repeat('5',64),gen_random_uuid());RAISE EXCEPTION 'Old password proof accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 IF has_function_privilege('anon','public.mutate_account_workspace(uuid,uuid,text,uuid,text,integer,jsonb,text,text,text,text,uuid)','EXECUTE')
 OR has_function_privilege('authenticated','public.mutate_account_workspace(uuid,uuid,text,uuid,text,integer,jsonb,text,text,text,text,uuid)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.mutate_account_workspace(uuid,uuid,text,uuid,text,integer,jsonb,text,text,text,text,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Account replay grants unsafe';END IF;
END $$;
ROLLBACK;
