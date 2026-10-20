BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES
 ('f2000000-0000-4000-8000-000000000001','inactive-budget-admin@example.test','fixture','admin',true);
DO $$ DECLARE a uuid:='f2000000-0000-4000-8000-000000000001';t uuid;b uuid;f uuid;clean uuid;pending uuid;s uuid;BEGIN
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(a,repeat('2',64)) RETURNING id INTO s;
 INSERT INTO public.admin_teams(name,slug,created_by) VALUES('Fictional inactive finance','fictional-inactive-finance',a) RETURNING id INTO t;
 INSERT INTO public.budget_allocations(name,total_amount,fiscal_year,start_date,end_date,team_id,created_by,status) VALUES('Fictional read-only allocation',100,'2026','2026-01-01','2026-12-31',t,a,'active') RETURNING id INTO b;
 IF NOT public.can_operate_budget(a,b,'manage') THEN RAISE EXCEPTION 'Active budget management lost';END IF;
 UPDATE public.admin_teams SET is_active=false WHERE id=t;
 IF NOT public.can_operate_budget(a,b,'read') OR public.can_operate_budget(a,b,'manage') OR(public.budget_projection(a,b)->>'canManage')::boolean THEN RAISE EXCEPTION 'Inactive-team budget capabilities remained writable';END IF;
 INSERT INTO public.finances(transaction_type,category,amount,currency,description,transaction_date,created_by,status) VALUES('expense','Event Costs',1,'USD','Fictional cleanup retention','2026-10-20',a,'draft') RETURNING id INTO f;
 INSERT INTO public.upload_intents(purpose,finance_id,finance_revision,owner_id,owner_session,proof_hash,bucket,quarantine_key,filename,declared_mime,expected_bytes,expected_sha256,state,created_at,expires_at)
 VALUES('finance',f,1,a,s,repeat('a',64),'finance-attachments','quarantine/'||gen_random_uuid()||'/'||gen_random_uuid(),'retained.png','image/png',10,repeat('a',64),'clean',now()-interval '3 days',now()-interval '3 days') RETURNING id INTO clean;
 INSERT INTO public.finance_attachments(id,finance_id,file_name,file_url,uploaded_by,upload_id,scan_state) VALUES(clean,f,'retained.png','',a,clean,'clean');
 INSERT INTO public.upload_intents(purpose,finance_id,finance_revision,owner_id,owner_session,proof_hash,bucket,quarantine_key,filename,declared_mime,expected_bytes,expected_sha256,created_at,expires_at)
 VALUES('finance',f,1,a,s,repeat('a',64),'finance-attachments','quarantine/'||gen_random_uuid()||'/'||gen_random_uuid(),'abandoned.png','image/png',10,repeat('a',64),now()-interval '3 days',now()-interval '3 days') RETURNING id INTO pending;
 INSERT INTO public.finance_attachments(id,finance_id,file_name,file_url,uploaded_by,upload_id) VALUES(pending,f,'abandoned.png','',a,pending);
 IF NOT EXISTS(SELECT 1 FROM public.claim_finance_upload_cleanup(10) WHERE id=pending AND deleted_at IS NOT NULL AND state='expired') THEN RAISE EXCEPTION 'Abandoned quarantine bytes not selected for cleanup';END IF;
 IF(SELECT deleted_at FROM public.upload_intents WHERE id=clean) IS NOT NULL OR EXISTS(SELECT 1 FROM public.claim_finance_upload_cleanup(10) WHERE id=clean) THEN RAISE EXCEPTION 'Clean retained receipt selected for cleanup';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.finance_attachments WHERE id=pending AND scan_state='expired') THEN RAISE EXCEPTION 'Expired upload metadata was deleted instead of retained';END IF;
END $$;
ROLLBACK;
