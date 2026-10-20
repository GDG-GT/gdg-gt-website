BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES
 ('d8000000-0000-4000-8000-000000000001','announcement-admin@example.test','fixture-admin','admin',true),
 ('d8000000-0000-4000-8000-000000000002','announcement-member@example.test','fixture-member','team_member',true);
DO $$ DECLARE s uuid;member_s uuid;r jsonb;team uuid;post uuid;j public.delivery_jobs;BEGIN
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES('d8000000-0000-4000-8000-000000000001',repeat('d',64)) RETURNING id INTO s;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES('d8000000-0000-4000-8000-000000000002',repeat('e',64)) RETURNING id INTO member_s;
 r:=public.mutate_team('d8000000-0000-4000-8000-000000000001',s,'fixture-admin',NULL,'create',NULL,
  '{"name":"Fictional announcement team","slug":"fictional-announcement-team","leadId":"d8000000-0000-4000-8000-000000000001","color":"#4285F4","icon":"users"}',gen_random_uuid());team:=(r->'team'->>'id')::uuid;
 INSERT INTO public.team_memberships(team_id,admin_user_id,role) VALUES(team,'d8000000-0000-4000-8000-000000000002','member');
 r:=public.mutate_team_announcement('d8000000-0000-4000-8000-000000000001',s,team,NULL,'create',NULL,
  '{"title":"Fictional announcement","message":"Private test-only message","priority":"normal","pinned":false,"scheduledFor":null,"expiresAt":null}',gen_random_uuid());post:=(r->>'id')::uuid;
 IF public.can_read_team_announcement('d8000000-0000-4000-8000-000000000002',post) THEN RAISE EXCEPTION 'Draft visible to member';END IF;
 BEGIN
  PERFORM public.mutate_team_announcement('d8000000-0000-4000-8000-000000000002',member_s,team,post,'publish',1,'{}',gen_random_uuid());RAISE EXCEPTION 'Member published without lead authority';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 r:=public.mutate_team_announcement('d8000000-0000-4000-8000-000000000001',s,team,post,'publish',1,'{}',gen_random_uuid());
 IF NOT public.can_read_team_announcement('d8000000-0000-4000-8000-000000000002',post) THEN RAISE EXCEPTION 'Published announcement not visible';END IF;
 PERFORM public.mutate_team_announcement('d8000000-0000-4000-8000-000000000002',member_s,team,post,'read',NULL,'{}',gen_random_uuid());
 PERFORM public.mutate_team_announcement('d8000000-0000-4000-8000-000000000002',member_s,team,post,'read',NULL,'{}',gen_random_uuid());
 IF (SELECT count(*) FROM public.team_announcement_reads WHERE announcement_id=post)<>1 THEN RAISE EXCEPTION 'Read acknowledgement not idempotent';END IF;
 SELECT * INTO j FROM public.claim_worker_jobs(1,ARRAY['team_announcement']);
 IF public.deliver_team_announcement(j.id,gen_random_uuid())<>0 OR public.deliver_team_announcement(j.id,j.lease_token)<>2 OR
  public.deliver_team_announcement(j.id,j.lease_token)<>0 THEN RAISE EXCEPTION 'Announcement audience, lease or delivery deduplication invalid';END IF;
 IF EXISTS(SELECT 1 FROM public.notifications WHERE delivery_key LIKE 'team-announcement:'||post||'%' AND message LIKE '%Private test%') THEN RAISE EXCEPTION 'Notification contains private body';END IF;
 r:=public.mutate_team_announcement('d8000000-0000-4000-8000-000000000001',s,team,post,'pin',2,'{"pinned":true}',gen_random_uuid());
 IF NOT EXISTS(SELECT 1 FROM public.team_announcements WHERE id=post AND is_pinned AND is_published AND publication_version=1) THEN RAISE EXCEPTION 'Pin changes publication identity';END IF;
 r:=public.mutate_team_announcement('d8000000-0000-4000-8000-000000000001',s,team,post,'update',3,
  '{"title":"Changed announcement","message":"Changed draft","priority":"high","pinned":true,"scheduledFor":null,"expiresAt":null}',gen_random_uuid());
 IF public.can_read_team_announcement('d8000000-0000-4000-8000-000000000002',post) THEN RAISE EXCEPTION 'Edit silently published';END IF;
 IF has_function_privilege('anon','public.list_team_announcements(uuid,uuid,integer,text)','EXECUTE') OR has_table_privilege('authenticated','public.team_announcement_reads','INSERT') THEN RAISE EXCEPTION 'Browser has direct announcement privileges';END IF;
END $$;
ROLLBACK;
