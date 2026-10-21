BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES
 ('f7100000-0000-4000-8000-000000000001','integration-admin@example.test','test-only','admin',true),
 ('f7100000-0000-4000-8000-000000000002','integration-member@example.test','test-only','team_member',true);
INSERT INTO public.admin_sessions(id,admin_user_id,token_hash) VALUES
 ('f7100000-0000-4000-8000-000000000003','f7100000-0000-4000-8000-000000000001',repeat('1',64)),
 ('f7100000-0000-4000-8000-000000000004','f7100000-0000-4000-8000-000000000002',repeat('2',64));
DO $$ DECLARE actor uuid:='f7100000-0000-4000-8000-000000000001';sid uuid:='f7100000-0000-4000-8000-000000000003';
 member uuid:='f7100000-0000-4000-8000-000000000002';msid uuid:='f7100000-0000-4000-8000-000000000004';fid uuid;eid uuid;tid uuid;cid uuid;d jsonb;v jsonb;doc jsonb;BEGIN
 IF has_table_privilege('anon','public.form_integrations','SELECT') OR has_function_privilege('authenticated','public.public_event_form_integrations(uuid)','EXECUTE') THEN RAISE EXCEPTION 'Browser integration access';END IF;
 d:='{"title":"Internal integration fixture","description":"Private fixture description","fields":[],"settings":{"access":"public","limit":0,"opensAt":"","closesAt":"","resume":false,"editing":false}}';
 v:=public.mutate_form(actor,NULL,'create',NULL,jsonb_build_object('slug','internal-integration-fixture','definition',d),NULL,gen_random_uuid());fid:=(v->>'id')::uuid;
 v:=public.mutate_event(actor,NULL,'create',NULL,jsonb_build_object('title','Integration source','slug','integration-source','description','Fictional','start_at',now()+interval '2 days','location','Fixture'),gen_random_uuid());eid:=(v->>'id')::uuid;
 doc:=jsonb_build_object('formId',fid,'versionPolicy','latest_published','label','Open fixture form');
 BEGIN
  PERFORM public.mutate_form_integration(actor,sid,'event',eid,'primary',0,doc,repeat('3',64),repeat('4',64),gen_random_uuid());
  RAISE EXCEPTION 'Unpublished form linked';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 PERFORM public.mutate_form(actor,fid,'publish',1,jsonb_build_object('definition',d),repeat('a',64),gen_random_uuid());
 BEGIN
  PERFORM public.read_form_integrations(member,msid,'event',eid);RAISE EXCEPTION 'Foreign source disclosed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 PERFORM public.mutate_form_integration(actor,sid,'event',eid,'primary',0,doc,repeat('3',64),repeat('4',64),gen_random_uuid());
 v:=public.mutate_form_integration(actor,sid,'event',eid,'primary',0,doc,repeat('3',64),repeat('4',64),gen_random_uuid());
 IF v->>'revision'<>'1' OR jsonb_array_length(public.read_form_integrations(actor,sid,'event',eid)->'items')<>1 THEN RAISE EXCEPTION 'Reference retry duplicated/revised';END IF;
 IF public.read_form_integrations(actor,sid,'event',eid)::text LIKE '%Private fixture description%' THEN RAISE EXCEPTION 'Definition copied into integration contract';END IF;
 IF public.public_event_form_integrations(eid)<>'[]'::jsonb THEN RAISE EXCEPTION 'Draft source exposed public form links';END IF;
 PERFORM public.mutate_event(actor,eid,'publish',1,'{}',gen_random_uuid());
 IF jsonb_array_length(public.public_event_form_integrations(eid))<>1 THEN RAISE EXCEPTION 'Published public CTA missing';END IF;
 UPDATE public.forms SET access_mode='invited' WHERE id=fid;
 IF public.public_event_form_integrations(eid)<>'[]'::jsonb THEN RAISE EXCEPTION 'Invited form disclosed through public event';END IF;
 UPDATE public.forms SET access_mode='unlisted' WHERE id=fid;
 IF public.public_event_form_integrations(eid)<>'[]'::jsonb THEN RAISE EXCEPTION 'Unlisted form disclosed through public event';END IF;
 UPDATE public.forms SET access_mode='verified' WHERE id=fid;
 IF jsonb_array_length(public.public_event_form_integrations(eid))<>1 THEN RAISE EXCEPTION 'Verified respondent entry missing';END IF;
 UPDATE public.forms SET closes_at=now()-interval '1 minute' WHERE id=fid;
 IF public.public_event_form_integrations(eid)<>'[]'::jsonb THEN RAISE EXCEPTION 'Closed form exposed public CTA';END IF;
 UPDATE public.forms SET closes_at=NULL WHERE id=fid;
 BEGIN
  PERFORM public.mutate_form_integration(actor,sid,'event',eid,'primary',99,doc,repeat('5',64),repeat('6',64),gen_random_uuid());RAISE EXCEPTION 'Stale revision linked';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CONFLICT' THEN RAISE;END IF;END;
 v:=public.mutate_team(actor,sid,'test-only',NULL,'create',NULL,jsonb_build_object('name','Integration fixture team','description','Fictional','slug','integration-fixture-team','leadId',member,'color','#4285F4','icon','users'),gen_random_uuid());tid:=(v->'team'->>'id')::uuid;
 BEGIN
  PERFORM public.mutate_form_integration(member,msid,'team',tid,'primary',0,doc,repeat('7',64),repeat('8',64),gen_random_uuid());RAISE EXCEPTION 'Team management bypassed form access';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 INSERT INTO public.form_collaborators(form_id,admin_user_id,actions,created_by) VALUES(fid,member,ARRAY['view','manage_access'],actor);
 PERFORM public.mutate_form_integration(member,msid,'team',tid,'primary',0,doc,repeat('7',64),repeat('8',64),gen_random_uuid());
 DELETE FROM public.form_collaborators WHERE form_id=fid;
 v:=public.read_form_integrations(member,msid,'team',tid);
 IF v->'items'->0->>'title' IS NOT NULL OR v->'items'->0->>'href' IS NOT NULL THEN RAISE EXCEPTION 'Revoked form details disclosed to source manager';END IF;
 PERFORM public.mutate_form_integration(member,msid,'team',tid,'primary',1,NULL,repeat('9',64),repeat('0',64),gen_random_uuid());
 INSERT INTO public.newsletter_campaigns(subject,content,status) VALUES('Fictional integration campaign','Fixture','draft') RETURNING id INTO cid;
 PERFORM public.mutate_form_integration(actor,sid,'campaign',cid,'primary',0,doc,repeat('3',64),repeat('4',64),gen_random_uuid());
 UPDATE public.newsletter_campaigns SET status='scheduled' WHERE id=cid;
 BEGIN
  PERFORM public.mutate_form_integration(actor,sid,'campaign',cid,'primary',1,doc,repeat('5',64),repeat('6',64),gen_random_uuid());RAISE EXCEPTION 'Scheduled campaign reference changed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVALID_STATE' THEN RAISE;END IF;END;
 IF NOT gdg_security.form_integration_active('campaign',cid) THEN RAISE EXCEPTION 'Scheduled campaign not counted as active';END IF;
 UPDATE public.newsletter_campaigns SET status='sent' WHERE id=cid;
 IF gdg_security.form_integration_active('campaign',cid) THEN RAISE EXCEPTION 'Sent campaign counted as mutable reference';END IF;
 UPDATE public.admin_sessions SET revoked_at=now() WHERE id=sid;
 BEGIN
  PERFORM public.read_form_integrations(actor,sid,'event',eid);RAISE EXCEPTION 'Revoked integration session accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
END $$;
ROLLBACK;
