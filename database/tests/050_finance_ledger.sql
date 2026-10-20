BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES
 ('f0000000-0000-4000-8000-000000000001','finance-admin@example.test','fixture-admin','admin',true),
 ('f0000000-0000-4000-8000-000000000002','finance-lead@example.test','fixture-lead','team_member',true),
 ('f0000000-0000-4000-8000-000000000003','finance-member@example.test','fixture-member','team_member',true),
 ('f0000000-0000-4000-8000-000000000004','finance-outsider@example.test','fixture-outsider','team_member',true),
 ('f0000000-0000-4000-8000-000000000005','finance-editor@example.test','fixture-editor','blog_editor',true);
CREATE FUNCTION pg_temp.finance_action(a uuid,s uuid,pw text,f uuid,action text,rev integer,doc jsonb,key text) RETURNS jsonb
 LANGUAGE sql AS $$ SELECT public.mutate_finance(a,s,pw,f,action,rev,doc,md5(key)||md5(key),md5(doc::text)||md5(doc::text),gen_random_uuid()) $$;
DO $$ DECLARE a uuid:='f0000000-0000-4000-8000-000000000001';l uuid:='f0000000-0000-4000-8000-000000000002';
 m uuid:='f0000000-0000-4000-8000-000000000003';o uuid:='f0000000-0000-4000-8000-000000000004';ed uuid:='f0000000-0000-4000-8000-000000000005';
 s uuid;ls uuid;ms uuid;t uuid;b uuid;f uuid;own uuid;r jsonb;doc jsonb;ref text;BEGIN
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(a,repeat('1',64)) RETURNING id INTO s;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(l,repeat('2',64)) RETURNING id INTO ls;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(m,repeat('3',64)) RETURNING id INTO ms;
 INSERT INTO public.admin_teams(name,slug,team_lead_id,created_by) VALUES('Fictional finance team','fictional-finance',l,a) RETURNING id INTO t;
 INSERT INTO public.team_memberships(team_id,admin_user_id,role) VALUES(t,l,'lead'),(t,m,'member');
 INSERT INTO public.team_page_access(team_id,page_path,can_access) VALUES(t,'/admin/finances',true);
 INSERT INTO public.team_permissions(team_id,resource_type,permission,can_read,can_update) VALUES(t,'finances','crud',true,true);
 r:=public.mutate_budget(a,s,'fixture-admin',NULL,'create',NULL,jsonb_build_object('teamId',t,'record',jsonb_build_object('name','Fictional exact budget','description','Local test','totalAmount','100.00','fiscalYear','2026','startDate','2026-01-01','endDate','2026-12-31')),gen_random_uuid(),repeat('1',64),repeat('1',64));b:=(r->>'id')::uuid;
 PERFORM public.mutate_budget(a,s,'fixture-admin',b,'activate',1,'{"confirmation":"Fictional exact budget"}',gen_random_uuid(),repeat('2',64),repeat('2',64));
 doc:=jsonb_build_object('teamId',t,'record',jsonb_build_object('transactionType','expense','category','Event Costs','amount','40.10','currency','USD','description','Fictional retained expense','transactionDate','2026-10-20','budgetId',b));
 r:=pg_temp.finance_action(m,ms,NULL,NULL,'create',NULL,doc,'first');f:=(r->>'id')::uuid;
 IF(pg_temp.finance_action(m,ms,NULL,NULL,'create',NULL,doc,'first')->>'id')::uuid<>f THEN RAISE EXCEPTION 'Create idempotency failed';END IF;
 IF public.can_operate_finance(l,f,'read') OR public.can_operate_finance(o,f,'read') OR public.can_operate_finance(ed,f,'read') OR public.can_operate_finance(m,f,NULL) THEN RAISE EXCEPTION 'Draft or role privacy failed';END IF;
 IF(public.list_finances(o,1,'{}')->>'total')::integer<>0 THEN RAISE EXCEPTION 'Outsider inferred private financial count';END IF;
 doc:=jsonb_set(doc,'{record,amount}','"40.11"');
 PERFORM pg_temp.finance_action(m,ms,NULL,f,'update',1,doc,'edit');
 BEGIN PERFORM pg_temp.finance_action(m,ms,NULL,f,'update',1,doc,'stale');RAISE EXCEPTION 'Stale financial edit accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CONFLICT' THEN RAISE;END IF;END;
 ref:='FIN-'||upper(left(replace(f::text,'-',''),12));
 PERFORM pg_temp.finance_action(m,ms,'fixture-member',f,'submit',2,jsonb_build_object('confirmation',ref),'submit');
 IF NOT public.can_operate_finance(l,f,'read') OR NOT public.can_operate_finance(l,f,'team_approve') OR public.can_operate_finance(a,f,'admin_approve') THEN RAISE EXCEPTION 'Required team approval was skipped';END IF;
 BEGIN UPDATE public.finances SET amount=10 WHERE id=f;RAISE EXCEPTION 'Submitted amount changed';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'FINANCE_IMMUTABLE' THEN RAISE;END IF;END;
 PERFORM pg_temp.finance_action(l,ls,'fixture-lead',f,'team_approve',3,jsonb_build_object('confirmation',ref),'team');
 PERFORM pg_temp.finance_action(a,s,'fixture-admin',f,'admin_approve',4,jsonb_build_object('confirmation',ref),'admin');
 IF public.finance_budget_usage(b)->>'reserved'<>'40.11' THEN RAISE EXCEPTION 'Exact reservation lost cents';END IF;
 BEGIN PERFORM public.mutate_budget(a,s,'fixture-admin',b,'close',2,'{"confirmation":"Fictional exact budget"}',gen_random_uuid(),repeat('3',64),repeat('3',64));RAISE EXCEPTION 'Committed budget closed';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'BUDGET_IN_USE' THEN RAISE;END IF;END;
 -- A second team request cannot overbook the reserved budget.
 doc:=jsonb_set(doc,'{record,amount}','"60.00"');
 r:=pg_temp.finance_action(m,ms,NULL,NULL,'create',NULL,doc,'second');own:=(r->>'id')::uuid;
 PERFORM pg_temp.finance_action(m,ms,'fixture-member',own,'submit',1,jsonb_build_object('confirmation','FIN-'||upper(left(replace(own::text,'-',''),12))),'submit');
 PERFORM pg_temp.finance_action(l,ls,'fixture-lead',own,'team_approve',2,jsonb_build_object('confirmation','FIN-'||upper(left(replace(own::text,'-',''),12))),'team');
 BEGIN PERFORM pg_temp.finance_action(a,s,'fixture-admin',own,'admin_approve',3,jsonb_build_object('confirmation','FIN-'||upper(left(replace(own::text,'-',''),12))),'admin');RAISE EXCEPTION 'Budget overcommitted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'BUDGET_EXCEEDED' THEN RAISE;END IF;END;
 PERFORM pg_temp.finance_action(a,s,'fixture-admin',own,'reject',3,jsonb_build_object('confirmation','FIN-'||upper(left(replace(own::text,'-',''),12)),'reason','Fictional unavailable budget'),'reject');
 PERFORM pg_temp.finance_action(a,s,'fixture-admin',f,'complete',5,jsonb_build_object('confirmation',ref),'complete');
 IF public.finance_budget_usage(b)->>'spent'<>'40.11' OR public.finance_budget_usage(b)->>'reserved'<>'0.00' THEN RAISE EXCEPTION 'Completion did not move exact reservation to spend';END IF;
 PERFORM pg_temp.finance_action(m,ms,NULL,f,'note',NULL,'{"note":"Fictional append-only completion receipt note"}','note');
 PERFORM pg_temp.finance_action(m,ms,NULL,f,'note',NULL,'{"note":"Fictional append-only completion receipt note"}','note');
 IF(public.finance_detail(m,f,1)->>'noteTotal')::integer<>1 OR jsonb_array_length(public.finance_detail(m,f,1)->'decisions')<>4 THEN RAISE EXCEPTION 'Note or decision ledger replay duplicated data';END IF;
 BEGIN EXECUTE 'SET LOCAL ROLE service_role';UPDATE public.finance_notes SET note='rewrite' WHERE finance_id=f;RAISE EXCEPTION 'Note rewritten';EXCEPTION WHEN insufficient_privilege THEN NULL;END;EXECUTE 'RESET ROLE';
 BEGIN DELETE FROM public.finances WHERE id=f;RAISE EXCEPTION 'Retained financial record deleted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'FINANCE_RETAINED' THEN RAISE;END IF;END;
 IF(public.list_finances(m,1,'{}')->'summary'->>'completedExpenses')<>'40.11' OR(public.finance_report(o,'{}')->'months')<>'[]'::jsonb THEN RAISE EXCEPTION 'Scoped reports incorrect';END IF;
 r:=public.export_finances(m,'{}',gen_random_uuid(),repeat('a',64));IF r->>'total'<>'2' THEN RAISE EXCEPTION 'Export scope incorrect';END IF;
 -- An administrator cannot approve their own submitted chapter record.
 doc:=jsonb_build_object('teamId',NULL,'record',jsonb_build_object('transactionType','income','category','Donations','amount','0.10','currency','USD','description','Fictional own admin donation','transactionDate','2026-10-20'));
 r:=pg_temp.finance_action(a,s,NULL,NULL,'create',NULL,doc,'own');own:=(r->>'id')::uuid;
 PERFORM pg_temp.finance_action(a,s,'fixture-admin',own,'submit',1,jsonb_build_object('confirmation','FIN-'||upper(left(replace(own::text,'-',''),12))),'own-submit');
 IF public.can_operate_finance(a,own,'admin_approve') OR public.can_operate_finance(a,own,'reject') THEN RAISE EXCEPTION 'Self approval or rejection allowed';END IF;
 UPDATE public.team_memberships SET is_active=false WHERE team_id=t AND admin_user_id=m;
 IF public.can_operate_finance(m,f,'read') THEN RAISE EXCEPTION 'Removed member retained team finance history';END IF;
 IF has_function_privilege('anon','public.finance_projection(uuid,uuid)','EXECUTE') OR has_function_privilege('gdg_realtime','public.mutate_finance(uuid,uuid,text,uuid,text,integer,jsonb,text,text,uuid)','EXECUTE') OR
 has_table_privilege('authenticated','public.finance_decisions','SELECT') THEN RAISE EXCEPTION 'Browser finance grants exist';END IF;
END $$;
ROLLBACK;
