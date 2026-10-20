BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES
 ('dd000000-0000-4000-8000-000000000001','task-admin@example.test','fixture-admin','admin',true),
 ('dd000000-0000-4000-8000-000000000002','task-assignee@example.test','fixture-assignee','blog_editor',true),
 ('dd000000-0000-4000-8000-000000000003','task-outsider@example.test','fixture-outsider','team_member',true);
DO $$ DECLARE s uuid;es uuid;os uuid;r jsonb;next jsonb;t uuid;c uuid;rev integer;BEGIN
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES('dd000000-0000-4000-8000-000000000001',repeat('a',64)) RETURNING id INTO s;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES('dd000000-0000-4000-8000-000000000002',repeat('b',64)) RETURNING id INTO es;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES('dd000000-0000-4000-8000-000000000003',repeat('c',64)) RETURNING id INTO os;
 r:=public.mutate_task('dd000000-0000-4000-8000-000000000001',s,NULL,NULL,'create',NULL,'{"title":"Fictional assigned task","description":"Private plain text","priority":"medium","dueDate":null,"tags":[],"assigneeEmail":"task-assignee@example.test","teamId":null}',repeat('1',64),repeat('1',64),gen_random_uuid());t:=(r->>'id')::uuid;
 BEGIN
  PERFORM public.mutate_task('dd000000-0000-4000-8000-000000000003',os,NULL,NULL,'create',NULL,'{"title":"Forbidden private assignment","assigneeEmail":"not-a-chapter-account@example.test"}',repeat('d',64),repeat('d',64),gen_random_uuid());RAISE EXCEPTION 'Personal task target lookup exposed account existence';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 IF NOT public.can_operate_task('dd000000-0000-4000-8000-000000000002',t,'read') OR public.can_operate_task('dd000000-0000-4000-8000-000000000003',t,'read')
  OR public.can_operate_task('dd000000-0000-4000-8000-000000000002',t,'update') OR public.can_operate_task(NULL,t,'read') THEN RAISE EXCEPTION 'Task assignment scope invalid';END IF;
 IF (public.list_tasks('dd000000-0000-4000-8000-000000000003',1,NULL,'all','all','all',false)->>'total')::integer<>0 THEN RAISE EXCEPTION 'Private task counted for outsider';END IF;
 next:=public.mutate_task('dd000000-0000-4000-8000-000000000002',es,NULL,t,'status',1,'{"status":"in-progress"}',repeat('2',64),repeat('2',64),gen_random_uuid());
 BEGIN
  PERFORM public.mutate_task('dd000000-0000-4000-8000-000000000001',s,NULL,t,'status',1,'{"status":"completed"}',repeat('3',64),repeat('3',64),gen_random_uuid());RAISE EXCEPTION 'Stale task update accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CONFLICT' THEN RAISE;END IF;END;
 r:=public.mutate_task_comment('dd000000-0000-4000-8000-000000000002',es,t,NULL,'create',NULL,'Fictional comment',repeat('4',64),repeat('4',64),gen_random_uuid());c:=(r->>'id')::uuid;
 r:=public.mutate_task_comment('dd000000-0000-4000-8000-000000000002',es,t,NULL,'create',NULL,'Fictional comment',repeat('4',64),repeat('4',64),gen_random_uuid());
 IF (r->>'id')::uuid<>c THEN RAISE EXCEPTION 'Task comment repeated idempotent submission';END IF;
 BEGIN
  PERFORM public.mutate_task_comment('dd000000-0000-4000-8000-000000000001',s,t,c,'edit',1,'Admin rewriting someone else',repeat('5',64),repeat('5',64),gen_random_uuid());RAISE EXCEPTION 'Admin rewrote another author';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 r:=public.mutate_task_comment('dd000000-0000-4000-8000-000000000001',s,t,c,'delete',1,NULL,repeat('6',64),repeat('6',64),gen_random_uuid());
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.list_task_comments('dd000000-0000-4000-8000-000000000002',t,NULL,NULL)->'items') comment_item WHERE comment_item->>'comment'='Fictional comment') THEN RAISE EXCEPTION 'Deleted comment leaked through projection';END IF;
 BEGIN
  PERFORM public.mutate_task('dd000000-0000-4000-8000-000000000001',s,'wrong-hash',t,'assign',2,'{"assigneeEmail":"task-outsider@example.test"}',repeat('7',64),repeat('7',64),gen_random_uuid());RAISE EXCEPTION 'Assignment ignored current password proof';
 EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 next:=public.mutate_task('dd000000-0000-4000-8000-000000000001',s,'fixture-admin',t,'assign',2,'{"assigneeEmail":"task-outsider@example.test"}',repeat('8',64),repeat('8',64),gen_random_uuid());
 IF public.can_operate_task('dd000000-0000-4000-8000-000000000002',t,'read') OR NOT public.can_operate_task('dd000000-0000-4000-8000-000000000003',t,'read') THEN RAISE EXCEPTION 'Reassignment did not remove previous recipient scope';END IF;
 -- Legacy nullable assignees must not turn IF NOT checks into SQL NULL bypasses.
 UPDATE public.communication_tasks SET assigned_to_id=NULL WHERE id=t;
 IF public.can_operate_task('dd000000-0000-4000-8000-000000000002',t,'read') IS DISTINCT FROM false THEN RAISE EXCEPTION 'Nullable assignee did not fail closed';END IF;
 BEGIN
  PERFORM public.list_task_comments('dd000000-0000-4000-8000-000000000002',t,NULL,NULL);RAISE EXCEPTION 'Former recipient read comments through nullable-assignee bypass';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 next:=public.mutate_task('dd000000-0000-4000-8000-000000000001',s,NULL,t,'archive',3,'{}',repeat('9',64),repeat('9',64),gen_random_uuid());
 IF public.can_operate_task('dd000000-0000-4000-8000-000000000001',t,'comment') OR NOT EXISTS(SELECT 1 FROM public.communication_tasks WHERE id=t AND archived_at IS NOT NULL) THEN RAISE EXCEPTION 'Task archive not recoverable/read-only';END IF;
END $$;
ROLLBACK;
