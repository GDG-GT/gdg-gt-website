BEGIN;
DO $$ DECLARE a uuid;s uuid;other uuid;os uuid;ids jsonb;v jsonb;again jsonb;before_jobs integer;missing uuid;BEGIN
 INSERT INTO public.admin_users(email,password_hash,role,is_active) VALUES('import-owner@example.test','fixture','super_admin',true) RETURNING id INTO a;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(a,repeat('a',64)) RETURNING id INTO s;
 INSERT INTO public.admin_users(email,password_hash,role,is_active) VALUES('import-admin@example.test','fixture','admin',true) RETURNING id INTO other;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(other,repeat('b',64)) RETURNING id INTO os;
 INSERT INTO public.members(name,email,category,is_active) SELECT 'Consent fixture '||n,'import-'||n||'@example.test','member',true FROM generate_series(1,6)n;
 INSERT INTO public.members(name,email,category,is_active) VALUES('Inactive fixture','import-inactive@example.test','member',false) RETURNING id INTO missing;
 INSERT INTO public.newsletter_subscribers(email,state,is_active,consent_at,confirmed_at) VALUES
 ('import-2@example.test','pending',false,now(),NULL),('import-3@example.test','active',true,now(),now()),('import-4@example.test','unsubscribed',false,now(),now()),('import-5@example.test','unsubscribed',false,now(),now()),('import-6@example.test','unsubscribed',false,now(),now());
 UPDATE public.newsletter_subscribers SET suppressed_at=now(),suppression_reason='complaint' WHERE email='import-5@example.test';
 UPDATE public.newsletter_subscribers SET deleted_at=now() WHERE email='import-6@example.test';
 v:=public.preview_newsletter_member_import(a,s);
 IF jsonb_array_length(v->'items')<>6 THEN RAISE EXCEPTION 'Inactive members included';END IF;
 BEGIN PERFORM public.preview_newsletter_member_import(other,os);RAISE EXCEPTION 'Non Super Admin imported consent';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 SELECT jsonb_agg(id) INTO ids FROM public.members WHERE email ~ '^import-[1-6]@';
 SELECT count(*) INTO before_jobs FROM public.delivery_jobs;
 v:=public.import_newsletter_members(a,s,ids,'Chapter leader confirmed existing signup consent',repeat('1',64),repeat('2',64),gen_random_uuid());
 IF v<>jsonb_build_object('selected',6,'created',1,'activated',1,'existing',1,'excluded',3,'emailsQueued',0) THEN RAISE EXCEPTION 'Incorrect import counts: %',v;END IF;
 IF(SELECT count(*) FROM public.newsletter_subscribers WHERE state='active' AND email ~ '^import-[1-6]@')<>3 THEN RAISE EXCEPTION 'Consent import state';END IF;
 IF(SELECT count(*) FROM public.delivery_jobs)<>before_jobs THEN RAISE EXCEPTION 'Import sent mail';END IF;
 IF(SELECT count(*) FROM public.admin_actions WHERE actor_id=a AND action='newsletter.member_consent_recorded')<>2 THEN RAISE EXCEPTION 'Consent evidence missing';END IF;
 again:=public.import_newsletter_members(a,s,ids,'Chapter leader confirmed existing signup consent',repeat('1',64),repeat('2',64),gen_random_uuid());
 IF again<>v THEN RAISE EXCEPTION 'Retry changed receipt';END IF;
 BEGIN PERFORM public.import_newsletter_members(a,s,ids,'Different consent evidence',repeat('1',64),repeat('3',64),gen_random_uuid());RAISE EXCEPTION 'Conflicting retry allowed';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'CONFLICT' THEN RAISE;END IF;END;
 BEGIN PERFORM public.import_newsletter_members(a,s,jsonb_build_array(missing),'Chapter leader confirmed existing signup consent',repeat('4',64),repeat('5',64),gen_random_uuid());RAISE EXCEPTION 'Inactive member imported';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'CONFLICT' THEN RAISE;END IF;END;
 IF has_function_privilege('authenticated','public.import_newsletter_members(uuid,uuid,jsonb,text,text,text,uuid)','execute') THEN RAISE EXCEPTION 'Browser import RPC exposed';END IF;
END $$;
ROLLBACK;
