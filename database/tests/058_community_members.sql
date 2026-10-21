BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES
 ('f8000000-0000-4000-8000-000000000001','members-admin@example.test','members-admin','admin',true),
 ('f8000000-0000-4000-8000-000000000002','members-team@example.test','members-team','team_member',true),
 ('f8000000-0000-4000-8000-000000000003','members-outsider@example.test','members-other','team_member',true),
 ('f8000000-0000-4000-8000-000000000004','members-editor@example.test','members-editor','blog_editor',true);
CREATE FUNCTION pg_temp.member_change(a uuid,s uuid,pw text,p uuid,action text,rev integer,doc jsonb,key text) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.mutate_community_member(a,s,pw,p,action,rev,doc,md5(key)||md5(key),md5(doc::text)||md5(doc::text),gen_random_uuid());
$$;
DO $$ DECLARE a uuid:='f8000000-0000-4000-8000-000000000001';u uuid:='f8000000-0000-4000-8000-000000000002';o uuid:='f8000000-0000-4000-8000-000000000003';ed uuid:='f8000000-0000-4000-8000-000000000004';s uuid;us uuid;t uuid;m uuid;target uuid;profile uuid;r jsonb;d jsonb;review jsonb;source_ref text;target_ref text;BEGIN
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(a,repeat('a8',32)) RETURNING id INTO s;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(u,repeat('b8',32)) RETURNING id INTO us;
 INSERT INTO public.admin_teams(name,slug,created_by) VALUES('Fictional community team','fictional-community-team',a) RETURNING id INTO t;
 INSERT INTO public.team_memberships(team_id,admin_user_id,role) VALUES(t,u,'lead');
 INSERT INTO public.team_page_access(team_id,page_path,can_access) VALUES(t,'/admin/members',true);
 INSERT INTO public.team_permissions(team_id,resource_type,permission,can_read,can_create,can_update,can_delete) VALUES(t,'members','crud',true,true,true,true);
 d:=jsonb_build_object('teamId',t,'record','{"name":"Fictional community person","email":"community-person@example.test","phone":"fictional-private-phone","year":"Senior","major":"Computer Science","category":"member","interests":["Web"],"is_active":true,"is_core_team":true,"team_section":"Active Members"}'::jsonb);
 r:=pg_temp.member_change(u,us,NULL,NULL,'create',NULL,d,'create');m:=(r->>'id')::uuid;
 IF pg_temp.member_change(u,us,NULL,NULL,'create',NULL,d,'create')<>r THEN RAISE EXCEPTION 'Community create replay duplicated';END IF;
 IF public.community_member_projection(o,m) IS NOT NULL OR(public.list_community_members(o,1,'','current',NULL,NULL,NULL,NULL)->>'total')<>'0' OR public.can_operate_member(ed,t,'read') OR public.can_operate_member(u,t,'merge') OR public.can_operate_member(u,t,NULL) THEN RAISE EXCEPTION 'Community scope/role disclosure';END IF;
 BEGIN INSERT INTO public.members(name,email) VALUES('Duplicate fictional','COMMUNITY-PERSON@example.test');RAISE EXCEPTION 'Case-insensitive duplicate accepted';EXCEPTION WHEN unique_violation THEN NULL;END;
 IF EXISTS(SELECT 1 FROM public.team_members WHERE member_id=m) THEN RAISE EXCEPTION 'Core flag implicitly created a public profile';END IF;
 source_ref:=public.community_member_projection(u,m)->>'reference';
 BEGIN PERFORM pg_temp.member_change(u,us,'members-team',m,'sync_profile',1,jsonb_build_object('confirmation',source_ref),'sync-denied');RAISE EXCEPTION 'Missing profile grants bypassed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 INSERT INTO public.team_page_access(team_id,page_path,can_access) VALUES(t,'/admin/team',true);
 INSERT INTO public.team_permissions(team_id,resource_type,permission,can_read,can_create,can_update) VALUES(t,'team_members','crud',true,true,true);
 r:=pg_temp.member_change(u,us,'members-team',m,'sync_profile',1,jsonb_build_object('confirmation',source_ref),'sync');profile:=(r->>'profileId')::uuid;
 UPDATE public.team_permissions SET can_read=false WHERE team_id=t AND resource_type='team_members';
 BEGIN PERFORM pg_temp.member_change(u,us,'members-team',m,'sync_profile',1,jsonb_build_object('confirmation',source_ref),'sync');RAISE EXCEPTION 'Profile replay ignored revoked scope';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 UPDATE public.team_permissions SET can_read=true WHERE team_id=t AND resource_type='team_members';
 IF(SELECT is_active FROM public.team_members WHERE id=profile) OR(SELECT name FROM public.team_members WHERE id=profile)<>'Fictional community person' OR(SELECT bio FROM public.team_members WHERE id=profile) IS NOT NULL THEN RAISE EXCEPTION 'Profile sync published or copied private academic fields';END IF;
 UPDATE public.team_members SET is_active=true WHERE id=profile;
 BEGIN
  PERFORM pg_temp.member_change(u,us,NULL,m,'update',2,jsonb_set(d,'{record,phone}','"changed-private-phone"'),'private-only');
  IF NOT(SELECT is_active FROM public.team_members WHERE id=profile) THEN RAISE EXCEPTION 'Private phone edit unpublished an unchanged public identity';END IF;
  RAISE EXCEPTION 'ROLLBACK_PRIVATE_ONLY_FIXTURE';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'ROLLBACK_PRIVATE_ONLY_FIXTURE' THEN RAISE;END IF;END;
 d:=jsonb_set(d,'{record,is_active}','false');PERFORM pg_temp.member_change(u,us,NULL,m,'update',2,d,'deactivate');
 IF(SELECT is_active FROM public.team_members WHERE id=profile) THEN RAISE EXCEPTION 'Deactivation left linked profile public';END IF;
 BEGIN UPDATE public.team_members SET is_active=true WHERE id=profile;RAISE EXCEPTION 'Inactive member profile was published';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVALID_STATE' THEN RAISE;END IF;END;
 d:=jsonb_set(d,'{record,is_active}','true');PERFORM pg_temp.member_change(u,us,NULL,m,'update',3,d,'reactivate');
 IF(SELECT is_active FROM public.team_members WHERE id=profile) THEN RAISE EXCEPTION 'Reactivation silently republished';END IF;
 UPDATE public.team_members SET is_active=true WHERE id=profile;UPDATE public.admin_teams SET is_active=false WHERE id=t;
 IF(SELECT is_active FROM public.team_members WHERE id=profile) OR public.community_member_projection(u,m) IS NOT NULL OR public.can_operate_member(a,t,'update') THEN RAISE EXCEPTION 'Inactive-team profile/access fence failed';END IF;
 UPDATE public.admin_teams SET is_active=true WHERE id=t;
 IF(SELECT is_active FROM public.team_members WHERE id=profile) THEN RAISE EXCEPTION 'Team restoration republished member';END IF;
 d:=jsonb_set(d,'{record,email}','"community-canonical@example.test"');d:=jsonb_set(d,'{record,name}','"Fictional canonical person"');r:=pg_temp.member_change(a,s,NULL,NULL,'create',NULL,d,'target');target:=(r->>'id')::uuid;target_ref:=public.community_member_projection(a,target)->>'reference';
 BEGIN PERFORM public.preview_member_merge(a,s,m,target,4,1,repeat('c8',32),gen_random_uuid());RAISE EXCEPTION 'Linked profile skipped merge review';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'MEMBER_LINK_REVIEW' THEN RAISE;END IF;END;
 UPDATE public.team_members SET is_active=false,deleted_at=now() WHERE id=profile;
 review:=public.preview_member_merge(a,s,m,target,4,1,repeat('c8',32),gen_random_uuid());
 IF(public.preview_member_merge(a,s,m,target,4,1,repeat('c8',32),gen_random_uuid())->>'reviewId')<>review->>'reviewId' THEN RAISE EXCEPTION 'Review retry duplicated';END IF;
 BEGIN PERFORM public.commit_member_merge(a,s,'members-admin',(review->>'reviewId')::uuid,repeat('c8',32),'wrong',target_ref,repeat('d8',32),repeat('e8',32),gen_random_uuid());RAISE EXCEPTION 'Merge bypassed typed references';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'VALIDATION_ERROR' THEN RAISE;END IF;END;
 r:=public.commit_member_merge(a,s,'members-admin',(review->>'reviewId')::uuid,repeat('c8',32),source_ref,target_ref,repeat('d8',32),repeat('e8',32),gen_random_uuid());
 IF(SELECT merged_into_id FROM public.members WHERE id=m)<>target OR(SELECT is_active FROM public.members WHERE id=m) OR(SELECT phone FROM public.members WHERE id=m)<>'fictional-private-phone' OR(SELECT name FROM public.members WHERE id=target)<>'Fictional canonical person' THEN RAISE EXCEPTION 'Merge lost source or changed target data';END IF;
 IF public.commit_member_merge(a,s,'members-admin',(review->>'reviewId')::uuid,repeat('c8',32),source_ref,target_ref,repeat('d8',32),repeat('e8',32),gen_random_uuid())<>r THEN RAISE EXCEPTION 'Merge replay changed revision';END IF;
 BEGIN PERFORM pg_temp.member_change(a,s,'members-admin',m,'restore',5,jsonb_build_object('confirmation',source_ref),'bad-restore');RAISE EXCEPTION 'Merged record restored without unmerge';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVALID_STATE' THEN RAISE;END IF;END;
 PERFORM pg_temp.member_change(a,s,'members-admin',m,'unmerge',5,jsonb_build_object('confirmation',source_ref),'unmerge');
 IF(SELECT merged_into_id FROM public.members WHERE id=m) IS NOT NULL OR(SELECT is_active FROM public.members WHERE id=m) OR(SELECT deleted_at FROM public.members WHERE id=m) IS NOT NULL THEN RAISE EXCEPTION 'Unmerge did not retain an inactive independent record';END IF;
 UPDATE public.team_members SET deleted_at=NULL WHERE id=profile;
 BEGIN UPDATE public.team_members SET is_active=true WHERE id=profile;RAISE EXCEPTION 'Unmerge republished inactive person';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVALID_STATE' THEN RAISE;END IF;END;
 UPDATE public.team_members SET deleted_at=now() WHERE id=profile;
 UPDATE public.team_memberships SET is_active=false WHERE team_id=t AND admin_user_id=u;
 IF public.community_member_projection(u,m) IS NOT NULL THEN RAISE EXCEPTION 'Removed member retained community PII';END IF;
 BEGIN DELETE FROM public.members WHERE id=m;RAISE EXCEPTION 'Community data hard-deleted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'MEMBER_RETAINED' THEN RAISE;END IF;END;
 IF has_table_privilege('anon','public.members','SELECT') OR has_function_privilege('authenticated','public.community_member_projection(uuid,uuid)','EXECUTE') OR has_table_privilege('gdg_realtime','gdg_security.member_merge_reviews','SELECT') THEN RAISE EXCEPTION 'Browser community privilege exists';END IF;
END $$;
ROLLBACK;
