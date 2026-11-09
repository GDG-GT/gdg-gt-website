BEGIN;
DO $$ DECLARE a uuid;s uuid;ordinary uuid;os uuid;m uuid;c uuid;j public.delivery_jobs;r jsonb;r2 jsonb;BEGIN
 INSERT INTO public.admin_users(email,password_hash,role,is_active) VALUES('reward-mail-super@example.test','fictional','super_admin',true) RETURNING id INTO a;
 INSERT INTO public.admin_users(email,password_hash,role,is_active) VALUES('reward-mail-admin@example.test','fictional','admin',true) RETURNING id INTO ordinary;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(a,repeat('a1',32)) RETURNING id INTO s;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(ordinary,repeat('a2',32)) RETURNING id INTO os;
 INSERT INTO public.members(name,email) VALUES('Fictional Mail Member','reward-mail-member@example.test') RETURNING id INTO m;
 INSERT INTO public.reward_credentials(member_id,kind,label,token_hash,encrypted_token) VALUES(m,'card','Fictional card',repeat('a3',32),'encrypted-fixture') RETURNING id INTO c;
 SELECT * INTO j FROM public.delivery_jobs WHERE payload->>'credentialId'=c::text;
 IF j.kind<>'reward_credential_email' OR j.payload::text LIKE '%example.test%' OR j.secret_payload IS NOT NULL THEN RAISE EXCEPTION 'Atomic credential email missing or raw secret leaked';END IF;
 r:=public.queue_reward_credential_email(a,s,c,repeat('a4',32));
 IF r->>'id'<>j.id::text OR(SELECT count(*) FROM public.delivery_jobs WHERE payload->>'credentialId'=c::text)<>1 THEN RAISE EXCEPTION 'Initial resend duplicated email';END IF;
 UPDATE public.delivery_jobs SET created_at=now()-interval '2 minutes' WHERE id=j.id;
 r2:=public.queue_reward_credential_email(a,s,c,repeat('a4',32));IF r2<>r THEN RAISE EXCEPTION 'Resend retry changed receipt';END IF;
 r:=public.queue_reward_credential_email(a,s,c,repeat('a5',32));IF r->>'id'=j.id::text THEN RAISE EXCEPTION 'Resend did not queue';END IF;
 BEGIN PERFORM public.queue_reward_credential_email(ordinary,os,c,repeat('a6',32));RAISE EXCEPTION 'Non-super-admin emailed credentials';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 IF public.prepare_reward_credential_email(j.id,gen_random_uuid()) IS NOT NULL THEN RAISE EXCEPTION 'Wrong lease accepted';END IF;
 UPDATE public.delivery_jobs SET state='running',lease_token=gen_random_uuid(),locked_until=now()+interval '5 minutes' WHERE id=j.id RETURNING * INTO j;
 r:=public.prepare_reward_credential_email(j.id,j.lease_token);IF r->>'email'<>'reward-mail-member@example.test' OR r->>'id'<>c::text THEN RAISE EXCEPTION 'Leased recipient preparation failed';END IF;
 IF jsonb_array_length(public.reward_email_status(a,s,m))<>1 THEN RAISE EXCEPTION 'Mail status missing';END IF;
 UPDATE public.reward_credentials SET revoked_at=now() WHERE id=c;
 IF public.reward_email_pass(j.id) IS NOT NULL OR public.prepare_reward_credential_email(j.id,j.lease_token) IS NOT NULL THEN RAISE EXCEPTION 'Revoked credential email remained active';END IF;
END $$;
DO $$ BEGIN
 IF has_function_privilege('anon','public.reward_email_pass(uuid)','execute') OR has_function_privilege('authenticated','public.queue_reward_credential_email(uuid,uuid,uuid,text)','execute') THEN RAISE EXCEPTION 'Private reward email RPC grants leaked';END IF;
END $$;
ROLLBACK;
