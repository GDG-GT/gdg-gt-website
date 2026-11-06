BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES
 ('b1150000-0000-4000-8000-000000000001','invite-replay-admin@example.test','fictional','admin',true),
 ('b1150000-0000-4000-8000-000000000002','invite-replay-lead@example.test','fictional','team_member',true),
 ('b1150000-0000-4000-8000-000000000003','invite-replay-recipient@example.test','fictional','team_member',true);
CREATE FUNCTION pg_temp.invitation_replay(a uuid,s uuid,t uuid,i uuid,act text,rev integer,mail text,r text,key text) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.mutate_team_invite_workspace(a,s,'fictional',t,i,rev,act,mail,r,md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text),repeat('fictional-',10),
 md5(key)||md5(key),md5(jsonb_build_array(t,i,act,rev,mail,r)::text)||md5(jsonb_build_array(t,i,act,rev,mail,r)::text),gen_random_uuid());
$$;
DO $$ DECLARE a uuid:='b1150000-0000-4000-8000-000000000001';lead uuid:='b1150000-0000-4000-8000-000000000002';u uuid:='b1150000-0000-4000-8000-000000000003';
 s uuid;ls uuid;t uuid;i uuid;v jsonb;hash text;rev integer;BEGIN
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(a,repeat('1',64)) RETURNING id INTO s;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(lead,repeat('2',64)) RETURNING id INTO ls;
 v:=public.mutate_team(a,s,'fictional',NULL,'create',NULL,jsonb_build_object('name','Fictional invitation replay','slug','fictional-invite-replay','description','Private fixture','color','#4285F4','icon','users','leadId',lead),gen_random_uuid());t:=(v->'team'->>'id')::uuid;
 v:=pg_temp.invitation_replay(a,s,t,NULL,'create',NULL,'invite-replay-recipient@example.test','member','create');i:=(v->>'id')::uuid;
 IF pg_temp.invitation_replay(a,s,t,NULL,'create',NULL,'invite-replay-recipient@example.test','member','create')->>'id'<>i::text
 OR(SELECT count(*) FROM public.team_invites WHERE team_id=t)<>1
 OR(SELECT count(*) FROM public.delivery_jobs WHERE payload->>'inviteId'=i::text)<>1
 OR(SELECT count(*) FROM public.admin_actions WHERE target_id=i AND action='teams.invite_create')<>1 THEN RAISE EXCEPTION 'Invitation create replay duplicated invite/mail/audit';END IF;
 IF EXISTS(SELECT 1 FROM public.idempotency_keys WHERE scope='team-invitation:'||a AND(result ? 'email' OR result ? 'token_hash' OR result ? 'secret')) THEN RAISE EXCEPTION 'Invitation receipt retained private material';END IF;
 BEGIN PERFORM pg_temp.invitation_replay(a,s,t,NULL,'create',NULL,'changed-recipient@example.test','member','create');RAISE EXCEPTION 'Changed invitation intent replay accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CONFLICT' THEN RAISE;END IF;END;
 UPDATE public.team_invites SET last_sent_at=now()-interval '2 minutes' WHERE id=i;
 SELECT token_hash INTO hash FROM public.team_invites WHERE id=i;
 v:=pg_temp.invitation_replay(a,s,t,i,'resend',1,'invite-replay-recipient@example.test',NULL,'resend');
 IF(SELECT token_hash FROM public.team_invites WHERE id=i)=hash OR(v->>'revision')::integer<>2 THEN RAISE EXCEPTION 'Resend did not rotate token exactly once';END IF;
 SELECT token_hash INTO hash FROM public.team_invites WHERE id=i;
 IF(pg_temp.invitation_replay(a,s,t,i,'resend',1,'invite-replay-recipient@example.test',NULL,'resend')->>'revision')::integer<>2
 OR(SELECT token_hash FROM public.team_invites WHERE id=i)<>hash
 OR(SELECT count(*) FROM public.delivery_jobs WHERE payload->>'inviteId'=i::text)<>2
 OR(SELECT count(*) FROM public.admin_actions WHERE target_id=i AND action='teams.invite_resend')<>1 THEN RAISE EXCEPTION 'Resend replay rotated token/queued another mail';END IF;
 BEGIN PERFORM pg_temp.invitation_replay(a,s,t,i,'resend',1,'invite-replay-recipient@example.test',NULL,'stale-resend');RAISE EXCEPTION 'New stale invitation action accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CONFLICT' THEN RAISE;END IF;END;
 v:=pg_temp.invitation_replay(a,s,t,i,'revoke',2,'invite-replay-recipient@example.test',NULL,'revoke');
 IF pg_temp.invitation_replay(a,s,t,i,'revoke',2,'invite-replay-recipient@example.test',NULL,'revoke')->>'status'<>'cancelled'
 OR(SELECT revision FROM public.team_invites WHERE id=i)<>3
 OR(SELECT count(*) FROM public.admin_actions WHERE target_id=i AND action='teams.invite_revoke')<>1 THEN RAISE EXCEPTION 'Revoke replay repeated mutation';END IF;
 IF pg_temp.invitation_replay(a,s,t,NULL,'create',NULL,'invite-replay-recipient@example.test','member','create')->>'status'<>'cancelled' THEN RAISE EXCEPTION 'Create replay returned stale pending status';END IF;
 v:=pg_temp.invitation_replay(lead,ls,t,NULL,'create',NULL,'fictional-lead-recipient@example.test','member','lead-create');
 UPDATE public.team_memberships SET role='member' WHERE team_id=t AND admin_user_id=lead;
 BEGIN PERFORM pg_temp.invitation_replay(lead,ls,t,NULL,'create',NULL,'fictional-lead-recipient@example.test','member','lead-create');RAISE EXCEPTION 'Lost invitation authority replay accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 UPDATE public.admin_users SET is_active=false WHERE id=u;
 -- Revocation remains available even if the recipient can no longer accept.
 IF pg_temp.invitation_replay(a,s,t,i,'revoke',2,'invite-replay-recipient@example.test',NULL,'revoke')->>'status'<>'cancelled' THEN RAISE EXCEPTION 'Inactive recipient prevented revocation replay';END IF;
 UPDATE public.admin_users SET is_active=true,role='super_admin' WHERE id=u;
 BEGIN PERFORM pg_temp.invitation_replay(a,s,t,NULL,'create',NULL,'invite-replay-recipient@example.test','member','create');RAISE EXCEPTION 'Higher target invitation replay accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'ACCOUNT_NOT_READY' THEN RAISE;END IF;END;
 UPDATE public.admin_sessions SET revoked_at=now() WHERE id=s;
 BEGIN PERFORM pg_temp.invitation_replay(a,s,t,i,'revoke',2,'invite-replay-recipient@example.test',NULL,'revoke');RAISE EXCEPTION 'Revoked session replay accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 IF has_function_privilege('anon','public.mutate_team_invite_workspace(uuid,uuid,text,uuid,uuid,integer,text,text,text,text,text,text,text,uuid)','EXECUTE')
 OR has_function_privilege('authenticated','public.mutate_team_invite_workspace(uuid,uuid,text,uuid,uuid,integer,text,text,text,text,text,text,text,uuid)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.mutate_team_invite_workspace(uuid,uuid,text,uuid,uuid,integer,text,text,text,text,text,text,text,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Invitation replay grants unsafe';END IF;
END $$;
ROLLBACK;
