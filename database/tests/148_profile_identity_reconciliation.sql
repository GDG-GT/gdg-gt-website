BEGIN;
DO $$ DECLARE a uuid;u uuid;s uuid;us uuid;m uuid;other_m uuid;p uuid;draft uuid;other_profile uuid;review jsonb;spec jsonb;r jsonb;again jsonb;rev integer;before_bio text;BEGIN
 INSERT INTO public.admin_users(email,password_hash,role,is_active) VALUES('identity-owner@example.test','identity-proof','super_admin',true) RETURNING id INTO a;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(a,repeat('a',64)) RETURNING id INTO s;
 INSERT INTO public.admin_users(email,password_hash,role,is_active) VALUES('identity-member@example.test','identity-proof','admin',true) RETURNING id INTO u;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(u,repeat('b',64)) RETURNING id INTO us;
 -- My profile first, then community sync: one record, public content preserved.
 PERFORM public.update_own_profile(a,NULL,'{"name":"Fictional Owner","role":"President","bio":"Keep this public biography","portfolioUrl":""}',gen_random_uuid());
 SELECT id INTO p FROM public.team_members WHERE admin_user_id=a;
 UPDATE public.team_members SET is_active=true WHERE id=p;
 INSERT INTO public.members(name,email,category,team_section,is_active) VALUES('Fictional Owner','identity-owner@example.test','founder','Active Members',true) RETURNING id INTO m;
 IF(public.community_member_projection(a,m)->'publicProfile'->>'id')::uuid IS DISTINCT FROM p THEN RAISE EXCEPTION 'Existing account profile not offered for sync';END IF;
 SELECT revision INTO rev FROM public.team_members WHERE id=p;
 r:=public.mutate_community_member(a,s,'identity-proof',m,'sync_profile',1,jsonb_build_object('confirmation','MEM-'||upper(replace(m::text,'-','')),'profileRevision',rev),repeat('1',64),repeat('2',64),gen_random_uuid());
 IF(r->>'profileId')::uuid<>p OR NOT(r->>'profileActive')::boolean OR(SELECT member_id FROM public.team_members WHERE id=p)<>m OR
  (SELECT count(*) FROM public.team_members WHERE lower(email)='identity-owner@example.test' AND deleted_at IS NULL)<>1 OR
  (SELECT bio FROM public.team_members WHERE id=p)<>'Keep this public biography' THEN RAISE EXCEPTION 'Sync duplicated or demoted an unchanged published profile';END IF;
 -- Member first, then My profile: reuse the public biography record.
 INSERT INTO public.members(name,email,category,is_active) VALUES('Fictional Member','identity-member@example.test','member',true) RETURNING id INTO other_m;
 r:=public.mutate_community_member(a,s,'identity-proof',other_m,'sync_profile',1,jsonb_build_object('confirmation','MEM-'||upper(replace(other_m::text,'-',''))),repeat('3',64),repeat('4',64),gen_random_uuid());
 other_profile:=(r->>'profileId')::uuid;
 PERFORM public.update_own_profile(u,NULL,'{"name":"Fictional Member","role":"Builder","portfolioUrl":""}',gen_random_uuid());
 IF(SELECT id FROM public.team_members WHERE admin_user_id=u)<>other_profile OR(SELECT count(*) FROM public.team_members WHERE email='identity-member@example.test' AND deleted_at IS NULL)<>1 THEN RAISE EXCEPTION 'My profile duplicated a synced member';END IF;
 -- Collection saves accept an optional empty URL and retain strict URL checks.
 UPDATE public.team_members SET portfolio_url='' WHERE id=p;
 IF(SELECT portfolio_url FROM public.team_members WHERE id=p) IS NOT NULL THEN RAISE EXCEPTION 'Blank portfolio not normalized';END IF;
 BEGIN UPDATE public.team_members SET portfolio_url='javascript:alert(1)' WHERE id=p;RAISE EXCEPTION 'Unsafe URL accepted';EXCEPTION WHEN check_violation THEN NULL;END;
 BEGIN INSERT INTO public.team_members(name,role,email,is_active) VALUES('Same identity','Builder','IDENTITY-OWNER@example.test',false);RAISE EXCEPTION 'Duplicate email accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'PROFILE_DUPLICATES' THEN RAISE;END IF;END;
 INSERT INTO public.team_members(name,role,email,is_active) VALUES('Fictional Owner','Builder','different-identity@example.test',false);
 -- Simulate retained legacy duplicates, then consolidate explicitly.
 UPDATE public.team_members SET member_id=NULL,is_active=true WHERE id=p;
 ALTER TABLE public.team_members DISABLE TRIGGER a_profile_identity_guard;
 INSERT INTO public.team_members(name,role,email,member_id,is_active) VALUES('Fictional Owner','Founder','identity-owner@example.test',m,false) RETURNING id INTO draft;
 ALTER TABLE public.team_members ENABLE TRIGGER a_profile_identity_guard;
 review:=public.review_team_profile_duplicates(a,draft);
 SELECT jsonb_agg(jsonb_build_object('id',x->'id','revision',x->'revision')) INTO spec FROM jsonb_array_elements(review->'profiles') x;
 BEGIN PERFORM public.review_team_profile_duplicates(u,p);RAISE EXCEPTION 'Non-Super-Admin reviewed identities';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'FORBIDDEN' THEN RAISE;END IF;END;
 BEGIN PERFORM public.reconcile_team_profiles(a,s,p,p,jsonb_set(spec,'{0,revision}','999'),repeat('5',64),repeat('6',64),gen_random_uuid());RAISE EXCEPTION 'Stale review accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CONFLICT' THEN RAISE;END IF;END;
 r:=public.reconcile_team_profiles(a,s,draft,p,spec,repeat('7',64),repeat('8',64),gen_random_uuid());
 again:=public.reconcile_team_profiles(a,s,draft,p,spec,repeat('7',64),repeat('8',64),gen_random_uuid());
 IF r<>again OR(r->>'archived')::integer<>1 OR NOT(SELECT is_active FROM public.team_members WHERE id=p) OR
  (SELECT bio FROM public.team_members WHERE id=p)<>'Keep this public biography' OR(SELECT member_id FROM public.team_members WHERE id=p)<>m OR
  (SELECT admin_user_id FROM public.team_members WHERE id=p)<>a OR NOT EXISTS(SELECT 1 FROM public.team_members WHERE id=draft AND deleted_at IS NOT NULL AND NOT is_active)
  OR(SELECT count(*) FROM public.admin_actions WHERE action='profiles.reconciled' AND target_id=p)<>1 THEN RAISE EXCEPTION 'Consolidation lost links/content/publication/history or replayed';END IF;
 BEGIN PERFORM public.reconcile_team_profiles(a,s,draft,draft,spec,repeat('7',64),repeat('9',64),gen_random_uuid());RAISE EXCEPTION 'Changed replay accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CONFLICT' THEN RAISE;END IF;END;
 BEGIN UPDATE public.team_members SET deleted_at=NULL WHERE id=draft;RAISE EXCEPTION 'Restored duplicate identity accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'PROFILE_DUPLICATES' THEN RAISE;END IF;END;
 -- Conflicting identities remain unchanged and are never merged by name/email.
 INSERT INTO public.members(name,email,is_active) VALUES('Conflicting fictional identity','conflicting-identity@example.test',true) RETURNING id INTO other_m;
 ALTER TABLE public.team_members DISABLE TRIGGER a_profile_identity_guard;
 INSERT INTO public.team_members(name,role,email,member_id,is_active) VALUES('Fictional Owner','Conflicting link','identity-owner@example.test',other_m,false) RETURNING id INTO draft;
 ALTER TABLE public.team_members ENABLE TRIGGER a_profile_identity_guard;
 review:=public.review_team_profile_duplicates(a,p);
 SELECT jsonb_agg(jsonb_build_object('id',x->'id','revision',x->'revision')) INTO spec FROM jsonb_array_elements(review->'profiles') x;
 BEGIN PERFORM public.reconcile_team_profiles(a,s,p,p,spec,repeat('c',64),repeat('d',64),gen_random_uuid());RAISE EXCEPTION 'Different members merged';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'PROFILE_IDENTITY_CONFLICT' THEN RAISE;END IF;END;
 IF EXISTS(SELECT 1 FROM public.team_members WHERE id=draft AND deleted_at IS NOT NULL) OR NOT(SELECT is_active FROM public.team_members WHERE id=p) THEN RAISE EXCEPTION 'Conflicting reconciliation changed data';END IF;
 IF has_function_privilege('anon','public.reconcile_team_profiles(uuid,uuid,uuid,uuid,jsonb,text,text,uuid)','EXECUTE') OR has_function_privilege('authenticated','public.review_team_profile_duplicates(uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Profile operations exposed';END IF;
END $$;
ROLLBACK;
