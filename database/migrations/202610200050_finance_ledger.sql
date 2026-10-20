BEGIN;
-- No PSU financial records or approvals are imported or silently reinterpreted.
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.finances) OR EXISTS(SELECT 1 FROM public.budget_allocations) OR EXISTS(SELECT 1 FROM public.finance_attachments)
 THEN RAISE EXCEPTION 'Finance foundation requires reviewed empty target finance tables';END IF;END $$;
ALTER TABLE public.finances DROP CONSTRAINT finances_status_check;
ALTER TABLE public.finances ADD CONSTRAINT finances_status_check CHECK(status IN('draft','pending','team-lead-approved','admin-approved','completed','rejected','cancelled')),
 ALTER COLUMN status SET DEFAULT 'draft',ALTER COLUMN status SET NOT NULL,
 ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 ADD COLUMN requires_team_approval boolean NOT NULL DEFAULT false,
 ADD COLUMN budget_id uuid REFERENCES public.budget_allocations(id) ON DELETE RESTRICT,
 ADD COLUMN submitted_at timestamptz,ADD COLUMN team_approved_by uuid REFERENCES public.admin_users(id) ON DELETE RESTRICT,
 ADD COLUMN team_approved_at timestamptz,ADD COLUMN completed_at timestamptz,
 ADD CONSTRAINT finance_positive_usd CHECK(amount>0 AND currency='USD'),
 ADD CONSTRAINT finance_team_approval_scope CHECK(NOT requires_team_approval OR team_id IS NOT NULL);
ALTER TABLE public.finances DROP CONSTRAINT finances_created_by_fkey;
ALTER TABLE public.finances ADD CONSTRAINT finances_created_by_fkey FOREIGN KEY(created_by) REFERENCES public.admin_users(id) ON DELETE RESTRICT;
ALTER TABLE public.finances DROP CONSTRAINT finances_team_id_fkey;
ALTER TABLE public.finances ADD CONSTRAINT finances_team_id_fkey FOREIGN KEY(team_id) REFERENCES public.admin_teams(id) ON DELETE RESTRICT;
ALTER TABLE public.budget_allocations ALTER COLUMN status SET DEFAULT 'draft',ALTER COLUMN status SET NOT NULL,
 ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 ADD CONSTRAINT budget_amount_dates CHECK(total_amount>0 AND end_date>=start_date);
ALTER TABLE public.budget_allocations DROP CONSTRAINT budget_allocations_created_by_fkey;
ALTER TABLE public.budget_allocations ADD CONSTRAINT budget_allocations_created_by_fkey FOREIGN KEY(created_by) REFERENCES public.admin_users(id) ON DELETE RESTRICT;
ALTER TABLE public.budget_allocations DROP CONSTRAINT budget_allocations_team_id_fkey;
ALTER TABLE public.budget_allocations ADD CONSTRAINT budget_allocations_team_id_fkey FOREIGN KEY(team_id) REFERENCES public.admin_teams(id) ON DELETE RESTRICT;
CREATE TABLE public.finance_decisions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),finance_id uuid NOT NULL REFERENCES public.finances(id) ON DELETE RESTRICT,
 actor_id uuid NOT NULL REFERENCES public.admin_users(id) ON DELETE RESTRICT,
 from_state text NOT NULL,to_state text NOT NULL,revision integer NOT NULL,reason text,
 request_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(finance_id,revision));
CREATE TABLE public.finance_notes(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),finance_id uuid NOT NULL REFERENCES public.finances(id) ON DELETE RESTRICT,
 actor_id uuid NOT NULL REFERENCES public.admin_users(id) ON DELETE RESTRICT,note text NOT NULL CHECK(length(note) BETWEEN 1 AND 5000),
 created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.finance_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.finance_decisions,public.finance_notes FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.finance_decisions,public.finance_notes TO service_role;
CREATE TRIGGER finance_decisions_append_only BEFORE UPDATE OR DELETE ON public.finance_decisions FOR EACH ROW EXECUTE FUNCTION public.protect_audit_rows();
CREATE TRIGGER finance_notes_append_only BEFORE UPDATE OR DELETE ON public.finance_notes FOR EACH ROW EXECUTE FUNCTION public.protect_audit_rows();
CREATE INDEX finance_note_history ON public.finance_notes(finance_id,created_at DESC,id DESC);
CREATE INDEX finance_budget_utilization ON public.finances(budget_id,status);
CREATE FUNCTION public.finance_team_action(p_actor uuid,p_team uuid,p_action text) RETURNS boolean
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.team_memberships m JOIN public.admin_teams t ON t.id=m.team_id AND t.is_active AND t.deleted_at IS NULL
  JOIN public.team_page_access a ON a.team_id=t.id AND a.page_path='/admin/finances' AND a.can_access
  JOIN public.team_permissions p ON p.team_id=t.id AND p.resource_type='finances' AND p.permission='crud'
  WHERE m.admin_user_id=p_actor AND m.team_id=p_team AND m.is_active AND CASE p_action WHEN 'read' THEN p.can_read WHEN 'update' THEN p.can_update ELSE false END);
$$;
CREATE FUNCTION public.can_operate_finance(p_actor uuid,p_id uuid,p_action text,p_team uuid DEFAULT NULL) RETURNS boolean
 LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE u public.admin_users;f public.finances;global_admin boolean;team_active boolean;BEGIN
 SELECT * INTO u FROM public.admin_users WHERE id=p_actor AND is_active AND NOT must_change_password AND deleted_at IS NULL AND (locked_until IS NULL OR locked_until<=now());
 IF NOT FOUND OR coalesce(u.role,'') NOT IN('admin','super_admin','team_member') OR p_action IS NULL OR p_action NOT IN('create','read','update','submit','team_approve','admin_approve','reject','complete','cancel','note','upload','download','export') THEN RETURN false;END IF;
 global_admin:=u.role IN('super_admin','admin');
 IF p_action='create' THEN RETURN global_admin AND(p_team IS NULL OR EXISTS(SELECT 1 FROM public.admin_teams WHERE id=p_team AND is_active AND deleted_at IS NULL))
  OR(u.role='team_member' AND(p_team IS NULL OR EXISTS(SELECT 1 FROM public.team_memberships m JOIN public.admin_teams t ON t.id=m.team_id AND t.is_active AND t.deleted_at IS NULL WHERE m.admin_user_id=u.id AND m.team_id=p_team AND m.is_active)));END IF;
 SELECT * INTO f FROM public.finances WHERE id=p_id;IF NOT FOUND THEN RETURN false;END IF;
 team_active:=f.team_id IS NULL OR EXISTS(SELECT 1 FROM public.admin_teams WHERE id=f.team_id AND is_active AND deleted_at IS NULL);
 IF NOT global_admin AND f.team_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.team_memberships WHERE team_id=f.team_id AND admin_user_id=u.id AND is_active) THEN RETURN false;END IF;
 IF NOT global_admin AND NOT team_active THEN RETURN false;END IF;
 IF NOT(global_admin OR f.created_by=u.id OR(f.status<>'draft' AND public.finance_team_action(u.id,f.team_id,'read'))) THEN RETURN false;END IF;
 IF p_action IN('read','download','export') THEN RETURN true;END IF;
 IF NOT team_active THEN RETURN false;END IF;
 IF p_action='note' THEN RETURN true;END IF;
 IF p_action='update' THEN RETURN f.status='draft' AND f.created_by=u.id;END IF;
 IF p_action='submit' THEN RETURN f.status='draft' AND f.created_by=u.id;END IF;
 IF p_action='upload' THEN RETURN f.status IN('draft','pending') AND(global_admin OR f.created_by=u.id);END IF;
 IF p_action='cancel' THEN RETURN (global_admin AND f.status IN('draft','pending') OR(f.created_by=u.id AND f.status IN('draft','pending')));END IF;
 IF p_action='complete' THEN RETURN global_admin AND f.status='admin-approved';END IF;
 IF f.submitted_by IS NULL OR f.submitted_by=u.id THEN RETURN false;END IF;
 IF p_action='admin_approve' THEN RETURN global_admin AND(f.status='team-lead-approved' OR(f.status='pending' AND NOT f.requires_team_approval));END IF;
 IF p_action='team_approve' THEN RETURN f.status='pending' AND f.requires_team_approval AND f.team_id IS NOT NULL
  AND public.can_operate_team(u.id,f.team_id,'manage') AND EXISTS(SELECT 1 FROM public.team_memberships WHERE team_id=f.team_id AND admin_user_id=u.id AND role IN('lead','co_lead') AND is_active)
  AND(global_admin OR public.finance_team_action(u.id,f.team_id,'update'));END IF;
 IF p_action='reject' THEN RETURN f.status IN('pending','team-lead-approved') AND(global_admin OR(f.status='pending' AND public.can_operate_finance(u.id,f.id,'team_approve')));END IF;
 RETURN false;
END $$;
CREATE FUNCTION public.can_operate_budget(p_actor uuid,p_id uuid,p_action text) RETURNS boolean
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.admin_users u JOIN public.budget_allocations b ON b.id=p_id
 WHERE u.id=p_actor AND u.is_active AND NOT u.must_change_password AND u.deleted_at IS NULL AND (u.locked_until IS NULL OR u.locked_until<=now())
 AND u.role IN('admin','super_admin','team_member') AND p_action IN('read','manage') AND
 (u.role IN('super_admin','admin') OR(p_action='read' AND public.finance_team_action(u.id,b.team_id,'read'))));
$$;
CREATE FUNCTION public.finance_budget_usage(p_budget uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('spent',coalesce(sum(amount) FILTER(WHERE status='completed'),0)::numeric(14,2)::text,
  'reserved',coalesce(sum(amount) FILTER(WHERE status='admin-approved'),0)::numeric(14,2)::text)
 FROM public.finances WHERE budget_id=p_budget AND transaction_type IN('expense','reimbursement');
$$;
CREATE FUNCTION public.budget_projection(p_actor uuid,p_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('id',b.id,'name',b.name,'description',b.description,'totalAmount',b.total_amount::text,
 'teamId',b.team_id,'teamName',(SELECT name FROM public.admin_teams WHERE id=b.team_id),'fiscalYear',b.fiscal_year,
 'startDate',b.start_date,'endDate',b.end_date,'status',b.status,'revision',b.revision,'createdAt',b.created_at,
 'usage',public.finance_budget_usage(b.id),'canManage',public.can_operate_budget(p_actor,b.id,'manage'))
 FROM public.budget_allocations b WHERE b.id=p_id AND public.can_operate_budget(p_actor,b.id,'read');
$$;
CREATE FUNCTION public.finance_projection(p_actor uuid,p_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('id',f.id,'reference','FIN-'||upper(left(replace(f.id::text,'-',''),12)),
 'transactionType',f.transaction_type,'category',f.category,'amount',f.amount::text,'currency',f.currency,'description',f.description,
 'vendorName',f.vendor_name,'referenceNumber',f.reference_number,'transactionDate',f.transaction_date,
 'teamId',f.team_id,'teamName',(SELECT name FROM public.admin_teams WHERE id=f.team_id),'budgetId',f.budget_id,
 'budgetName',(SELECT name FROM public.budget_allocations WHERE id=f.budget_id),'eventId',f.event_id,'projectId',f.project_id,
 'recurringFrequency',f.recurring_frequency,'requiresTeamApproval',f.requires_team_approval,'status',f.status,'revision',f.revision,
 'createdBy',f.created_by,'creatorName',(SELECT display_name FROM public.admin_users WHERE id=f.created_by),
 'submittedBy',f.submitted_by,'submittedAt',f.submitted_at,'createdAt',f.created_at,'updatedAt',f.updated_at,
 'rejectionReason',f.rejection_reason,'actions',(SELECT coalesce(jsonb_agg(a),'[]') FROM unnest(ARRAY['read','update','submit','team_approve','admin_approve','reject','complete','cancel','note','upload','download','export'])a
 WHERE public.can_operate_finance(p_actor,f.id,a))) FROM public.finances f WHERE f.id=p_id AND public.can_operate_finance(p_actor,f.id,'read');
$$;
CREATE FUNCTION gdg_security.protect_finance_ledger() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'FINANCE_RETAINED';END IF;
 IF OLD.status<>'draft' AND (to_jsonb(NEW)-ARRAY['status','revision','updated_at','team_approved_by','team_approved_at','approved_by','approved_at','approval_level','completed_at','rejection_reason'])
  IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['status','revision','updated_at','team_approved_by','team_approved_at','approved_by','approved_at','approval_level','completed_at','rejection_reason']) THEN RAISE EXCEPTION 'FINANCE_IMMUTABLE';END IF;
 IF OLD.status IN('completed','rejected','cancelled') AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN RAISE EXCEPTION 'FINANCE_IMMUTABLE';END IF;
 IF NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.team_id IS DISTINCT FROM OLD.team_id OR NEW.requires_team_approval IS DISTINCT FROM OLD.requires_team_approval THEN RAISE EXCEPTION 'FINANCE_IMMUTABLE';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER finance_ledger_guard BEFORE UPDATE OR DELETE ON public.finances FOR EACH ROW EXECUTE FUNCTION gdg_security.protect_finance_ledger();
CREATE FUNCTION public.mutate_finance(p_actor uuid,p_session uuid,p_verified_hash text,p_id uuid,p_action text,p_revision integer,p_document jsonb,p_key_hash text,p_request_hash text,p_request_id uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE u public.admin_users;f public.finances;b public.budget_allocations;k public.idempotency_keys;r jsonb;doc jsonb;
 v_scope text;team uuid;target_state text;used numeric;need_team boolean;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('finance-administration',0));
 SELECT * INTO u FROM public.admin_users WHERE id=p_actor AND is_active AND NOT must_change_password AND deleted_at IS NULL AND(locked_until IS NULL OR locked_until<=now());
 PERFORM 1 FROM public.admin_sessions WHERE id=p_session AND admin_user_id=p_actor AND revoked_at IS NULL AND idle_expires_at>now() AND absolute_expires_at>now();
 IF u.id IS NULL OR NOT FOUND THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 IF p_action IS NULL OR p_action NOT IN('create','update','submit','team_approve','admin_approve','reject','complete','cancel','note') THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
 IF p_action='create' THEN
  team:=(p_document->>'teamId')::uuid;
  IF NOT public.can_operate_finance(u.id,NULL,'create',team) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 ELSE
  SELECT * INTO f FROM public.finances WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_operate_finance(u.id,f.id,'read') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 END IF;
 v_scope:='finances.'||p_action||':'||u.id||':'||coalesce(p_id::text,'new');
 IF p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$' OR p_request_hash IS NULL OR p_request_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 SELECT * INTO k FROM public.idempotency_keys WHERE idempotency_keys.scope=v_scope AND key_hash=p_key_hash;
 IF FOUND THEN IF k.request_hash IS DISTINCT FROM p_request_hash THEN RAISE EXCEPTION 'CONFLICT';END IF;RETURN k.result;END IF;
 IF p_action<>'create' AND NOT public.can_operate_finance(u.id,f.id,p_action) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 IF p_action NOT IN('create','update','note') AND(u.password_hash IS DISTINCT FROM p_verified_hash OR p_verified_hash IS NULL) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 IF p_action NOT IN('create','note') AND f.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'CONFLICT';END IF;
 IF p_action IN('create','update') THEN
  doc:=p_document->'record';
  IF p_action='update' THEN team:=f.team_id;END IF;
  IF doc->>'amount' IS NULL OR doc->>'amount'!~'^(0|[1-9][0-9]{0,9})\.[0-9]{2}$' OR(doc->>'amount')::numeric<=0 OR doc->>'currency' IS DISTINCT FROM 'USD' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
  IF doc->>'budgetId' IS NOT NULL THEN
   SELECT * INTO b FROM public.budget_allocations WHERE id=(doc->>'budgetId')::uuid;
   IF NOT FOUND OR b.team_id IS DISTINCT FROM team OR b.status<>'active' OR NOT public.can_operate_budget(u.id,b.id,'read') THEN RAISE EXCEPTION 'BUDGET_UNAVAILABLE';END IF;
  END IF;
  IF doc->>'eventId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.events e WHERE e.id=(doc->>'eventId')::uuid AND public.can_operate_event(u.id,'read',e.team_id)) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  IF doc->>'projectId' IS NOT NULL AND NOT(u.role IN('admin','super_admin') AND EXISTS(SELECT 1 FROM public.projects WHERE id=(doc->>'projectId')::uuid)) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  IF p_action='create' THEN
   need_team:=coalesce((p_document->>'requireTeamApproval')::boolean,team IS NOT NULL);
   IF(team IS NULL AND need_team) OR(u.role NOT IN('admin','super_admin') AND team IS NOT NULL AND NOT need_team) THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
   INSERT INTO public.finances(transaction_type,category,amount,currency,description,vendor_name,reference_number,transaction_date,team_id,budget_id,event_id,project_id,is_recurring,recurring_frequency,created_by,status,requires_team_approval)
   VALUES(doc->>'transactionType',doc->>'category',(doc->>'amount')::numeric,'USD',doc->>'description',doc->>'vendorName',doc->>'referenceNumber',(doc->>'transactionDate')::date,team,(doc->>'budgetId')::uuid,(doc->>'eventId')::uuid,(doc->>'projectId')::uuid,(doc->>'recurringFrequency') IS NOT NULL,doc->>'recurringFrequency',u.id,'draft',need_team) RETURNING * INTO f;
  ELSE
   UPDATE public.finances SET transaction_type=doc->>'transactionType',category=doc->>'category',amount=(doc->>'amount')::numeric,description=doc->>'description',
    vendor_name=doc->>'vendorName',reference_number=doc->>'referenceNumber',transaction_date=(doc->>'transactionDate')::date,budget_id=(doc->>'budgetId')::uuid,
    event_id=(doc->>'eventId')::uuid,project_id=(doc->>'projectId')::uuid,is_recurring=(doc->>'recurringFrequency') IS NOT NULL,recurring_frequency=doc->>'recurringFrequency',revision=revision+1,updated_at=clock_timestamp() WHERE id=f.id RETURNING * INTO f;
  END IF;
 ELSIF p_action='note' THEN
  INSERT INTO public.finance_notes(finance_id,actor_id,note) VALUES(f.id,u.id,p_document->>'note');
 ELSE
  IF p_document->>'confirmation' IS DISTINCT FROM('FIN-'||upper(left(replace(f.id::text,'-',''),12))) THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
  target_state:=CASE p_action WHEN 'submit' THEN 'pending' WHEN 'team_approve' THEN 'team-lead-approved' WHEN 'admin_approve' THEN 'admin-approved' WHEN 'reject' THEN 'rejected' WHEN 'complete' THEN 'completed' WHEN 'cancel' THEN 'cancelled' END;
  IF p_action='reject' AND(length(coalesce(p_document->>'reason',''))<3 OR length(p_document->>'reason')>2000) THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
  IF f.budget_id IS NOT NULL AND p_action IN('submit','admin_approve') THEN
   SELECT * INTO b FROM public.budget_allocations WHERE id=f.budget_id FOR UPDATE;
   IF NOT FOUND OR b.status<>'active' OR b.team_id IS DISTINCT FROM f.team_id OR f.transaction_date NOT BETWEEN b.start_date AND b.end_date THEN RAISE EXCEPTION 'BUDGET_UNAVAILABLE';END IF;
   IF p_action='admin_approve' AND f.transaction_type IN('expense','reimbursement') THEN
    SELECT coalesce(sum(amount),0) INTO used FROM public.finances WHERE budget_id=b.id AND status IN('admin-approved','completed') AND transaction_type IN('expense','reimbursement');
    IF used+f.amount>b.total_amount THEN RAISE EXCEPTION 'BUDGET_EXCEEDED';END IF;
   END IF;
  END IF;
  INSERT INTO public.finance_decisions(finance_id,actor_id,from_state,to_state,revision,reason,request_id) VALUES(f.id,u.id,f.status,target_state,f.revision+1,p_document->>'reason',p_request_id);
  UPDATE public.finances SET status=target_state,revision=revision+1,updated_at=clock_timestamp(),
   submitted_by=CASE WHEN p_action='submit' THEN u.id ELSE submitted_by END,submitted_at=CASE WHEN p_action='submit' THEN now() ELSE submitted_at END,
   team_approved_by=CASE WHEN p_action='team_approve' THEN u.id ELSE team_approved_by END,team_approved_at=CASE WHEN p_action='team_approve' THEN now() ELSE team_approved_at END,
   approved_by=CASE WHEN p_action='admin_approve' THEN u.id ELSE approved_by END,approved_at=CASE WHEN p_action='admin_approve' THEN now() ELSE approved_at END,
   approval_level=CASE p_action WHEN 'team_approve' THEN 'team_lead_approved' WHEN 'admin_approve' THEN 'admin_approved' WHEN 'reject' THEN 'rejected' ELSE approval_level END,
   rejection_reason=CASE WHEN p_action='reject' THEN p_document->>'reason' ELSE rejection_reason END,completed_at=CASE WHEN p_action='complete' THEN now() ELSE completed_at END WHERE id=f.id RETURNING * INTO f;
 END IF;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata) VALUES(u.id,'finances.'||p_action,'finance',f.id,p_request_id,
  jsonb_build_object('state',f.status,'revision',f.revision,'teamId',f.team_id));
 r:=jsonb_build_object('id',f.id,'revision',f.revision,'status',f.status);
 INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result) VALUES(v_scope,p_key_hash,p_request_hash,200,r);RETURN r;
END $$;
CREATE FUNCTION public.mutate_budget(p_actor uuid,p_session uuid,p_verified_hash text,p_id uuid,p_action text,p_revision integer,p_document jsonb,p_request_id uuid,p_key_hash text,p_request_hash text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE u public.admin_users;b public.budget_allocations;doc jsonb;used numeric;k public.idempotency_keys;v_scope text;r jsonb;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('finance-administration',0));
 SELECT * INTO u FROM public.admin_users WHERE id=p_actor AND is_active AND NOT must_change_password AND deleted_at IS NULL AND role IN('admin','super_admin') AND(locked_until IS NULL OR locked_until<=now());
 PERFORM 1 FROM public.admin_sessions WHERE id=p_session AND admin_user_id=p_actor AND revoked_at IS NULL AND idle_expires_at>now() AND absolute_expires_at>now();
 IF u.id IS NULL OR NOT FOUND OR p_verified_hash IS NULL OR p_verified_hash IS DISTINCT FROM u.password_hash THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 IF p_action IS NULL OR p_action NOT IN('create','update','activate','close') THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
 IF p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$' OR p_request_hash IS NULL OR p_request_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 v_scope:='budgets.'||p_action||':'||u.id||':'||coalesce(p_id::text,'new');
 SELECT * INTO k FROM public.idempotency_keys WHERE idempotency_keys.scope=v_scope AND key_hash=p_key_hash;
 IF FOUND THEN IF k.request_hash IS DISTINCT FROM p_request_hash THEN RAISE EXCEPTION 'CONFLICT';END IF;RETURN k.result;END IF;
 IF p_action<>'create' THEN
  SELECT * INTO b FROM public.budget_allocations WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  IF b.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'CONFLICT';END IF;
  IF p_document->>'confirmation' IS DISTINCT FROM b.name THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
  IF b.status='closed' OR(b.team_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.admin_teams WHERE id=b.team_id AND is_active AND deleted_at IS NULL)) THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
 END IF;
 IF p_action IN('create','update') THEN
  doc:=p_document->'record';
  IF doc->>'totalAmount' IS NULL OR doc->>'totalAmount'!~'^(0|[1-9][0-9]{0,9})\.[0-9]{2}$' OR(doc->>'totalAmount')::numeric<=0 OR(doc->>'endDate')::date<(doc->>'startDate')::date THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
  IF p_action='create' THEN
   IF p_document->>'teamId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.admin_teams WHERE id=(p_document->>'teamId')::uuid AND is_active AND deleted_at IS NULL) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
   INSERT INTO public.budget_allocations(name,description,total_amount,team_id,fiscal_year,start_date,end_date,status,created_by) VALUES(doc->>'name',doc->>'description',(doc->>'totalAmount')::numeric,(p_document->>'teamId')::uuid,doc->>'fiscalYear',(doc->>'startDate')::date,(doc->>'endDate')::date,'draft',u.id) RETURNING * INTO b;
  ELSE
   SELECT coalesce(sum(amount),0) INTO used FROM public.finances WHERE budget_id=b.id AND status IN('admin-approved','completed') AND transaction_type IN('expense','reimbursement');
   IF(doc->>'totalAmount')::numeric<used OR EXISTS(SELECT 1 FROM public.finances WHERE budget_id=b.id AND status IN('pending','team-lead-approved','admin-approved','completed') AND transaction_date NOT BETWEEN(doc->>'startDate')::date AND(doc->>'endDate')::date) THEN RAISE EXCEPTION 'BUDGET_EXCEEDED';END IF;
   UPDATE public.budget_allocations SET name=doc->>'name',description=doc->>'description',total_amount=(doc->>'totalAmount')::numeric,fiscal_year=doc->>'fiscalYear',start_date=(doc->>'startDate')::date,end_date=(doc->>'endDate')::date,revision=revision+1,updated_at=clock_timestamp() WHERE id=b.id RETURNING * INTO b;
  END IF;
 ELSE
  IF(p_action='activate' AND b.status<>'draft') OR(p_action='close' AND b.status NOT IN('draft','active')) THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  IF p_action='close' AND EXISTS(SELECT 1 FROM public.finances WHERE budget_id=b.id AND status IN('pending','team-lead-approved','admin-approved')) THEN RAISE EXCEPTION 'BUDGET_IN_USE';END IF;
  UPDATE public.budget_allocations SET status=CASE WHEN p_action='activate' THEN 'active' ELSE 'closed' END,revision=revision+1,updated_at=clock_timestamp() WHERE id=b.id RETURNING * INTO b;
 END IF;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata) VALUES(u.id,'budgets.'||p_action,'budget',b.id,p_request_id,jsonb_build_object('revision',b.revision,'status',b.status));
 r:=jsonb_build_object('id',b.id,'revision',b.revision,'status',b.status);
 INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result) VALUES(v_scope,p_key_hash,p_request_hash,200,r);RETURN r;
END $$;
CREATE FUNCTION public.finance_matches_filter(p_id uuid,p_filter jsonb) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.finances f WHERE f.id=p_id
 AND(coalesce(p_filter->>'q','')='' OR strpos(lower(f.description||' '||coalesce(f.vendor_name,'')||' '||coalesce(f.reference_number,'')||' '||f.id::text),lower(p_filter->>'q'))>0)
 AND(p_filter->>'state' IS NULL OR f.status=p_filter->>'state') AND(p_filter->>'type' IS NULL OR f.transaction_type=p_filter->>'type')
 AND(p_filter->>'teamId' IS NULL OR f.team_id=(p_filter->>'teamId')::uuid)
 AND(p_filter->>'from' IS NULL OR f.transaction_date>=(p_filter->>'from')::date) AND(p_filter->>'to' IS NULL OR f.transaction_date<=(p_filter->>'to')::date)
 AND(p_filter->>'minAmount' IS NULL OR f.amount>=(p_filter->>'minAmount')::numeric) AND(p_filter->>'maxAmount' IS NULL OR f.amount<=(p_filter->>'maxAmount')::numeric));
$$;
CREATE FUNCTION public.list_finances(p_actor uuid,p_page integer,p_filter jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE r jsonb;BEGIN
 IF NOT public.can_operate_finance(p_actor,NULL,'create',NULL) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 WITH eligible AS(SELECT f.* FROM public.finances f WHERE public.can_operate_finance(p_actor,f.id,'read') AND public.finance_matches_filter(f.id,p_filter)),
 page AS(SELECT * FROM eligible ORDER BY created_at DESC,id DESC LIMIT 30 OFFSET(p_page-1)*30)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(public.finance_projection(p_actor,id) ORDER BY created_at DESC,id DESC) FROM page),'[]'),
 'total',(SELECT count(*) FROM eligible),'pageSize',30,
 'summary',(SELECT jsonb_build_object('completedIncome',coalesce(sum(amount) FILTER(WHERE status='completed' AND transaction_type='income'),0.00)::text,
  'completedExpenses',coalesce(sum(amount) FILTER(WHERE status='completed' AND transaction_type IN('expense','reimbursement')),0.00)::text,
  'reservedExpenses',coalesce(sum(amount) FILTER(WHERE status='admin-approved' AND transaction_type IN('expense','reimbursement')),0.00)::text,
  'awaitingApproval',count(*) FILTER(WHERE status IN('pending','team-lead-approved')),
  'net',coalesce(sum(CASE WHEN transaction_type='income' THEN amount WHEN transaction_type IN('expense','reimbursement') THEN -amount ELSE 0 END) FILTER(WHERE status='completed'),0.00)::text) FROM eligible)) INTO r;RETURN r;
END $$;
CREATE FUNCTION public.finance_detail(p_actor uuid,p_id uuid,p_note_page integer) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE r jsonb;BEGIN
 IF NOT public.can_operate_finance(p_actor,p_id,'read') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_note_page IS NULL OR p_note_page NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 SELECT jsonb_build_object('record',public.finance_projection(p_actor,p_id),
 'decisions',coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.id,'actorName',(SELECT display_name FROM public.admin_users WHERE id=d.actor_id),
  'from',d.from_state,'to',d.to_state,'revision',d.revision,'reason',d.reason,'createdAt',d.created_at) ORDER BY d.revision) FROM public.finance_decisions d WHERE d.finance_id=p_id),'[]'),
 'notes',coalesce((SELECT jsonb_agg(jsonb_build_object('id',n.id,'actorName',(SELECT display_name FROM public.admin_users WHERE id=n.actor_id),'note',n.note,'createdAt',n.created_at) ORDER BY n.created_at,n.id)
  FROM(SELECT * FROM public.finance_notes WHERE finance_id=p_id ORDER BY created_at DESC,id DESC LIMIT 50 OFFSET(p_note_page-1)*50)n),'[]'),
 'noteTotal',(SELECT count(*) FROM public.finance_notes WHERE finance_id=p_id),'notePageSize',50,
 'retention','Financial records are retained. Deletion is disabled until chapter leadership defines the financial retention period.') INTO r;RETURN r;
END $$;
CREATE FUNCTION public.list_budgets(p_actor uuid,p_page integer,p_query text,p_state text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE r jsonb;BEGIN
 IF NOT public.can_operate_finance(p_actor,NULL,'create',NULL) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 10000 OR(p_state IS NOT NULL AND p_state NOT IN('draft','active','closed','exceeded')) THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 WITH eligible AS(SELECT b.* FROM public.budget_allocations b WHERE public.can_operate_budget(p_actor,b.id,'read')
 AND(coalesce(p_query,'')='' OR strpos(lower(b.name),lower(p_query))>0) AND(p_state IS NULL OR b.status=p_state)),
 page AS(SELECT * FROM eligible ORDER BY created_at DESC,id DESC LIMIT 30 OFFSET(p_page-1)*30)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(public.budget_projection(p_actor,id) ORDER BY created_at DESC,id DESC) FROM page),'[]'),
 'total',(SELECT count(*) FROM eligible),'pageSize',30) INTO r;RETURN r;
END $$;
CREATE FUNCTION public.finance_report(p_actor uuid,p_filter jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE r jsonb;BEGIN
 IF NOT public.can_operate_finance(p_actor,NULL,'create',NULL) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 WITH eligible AS(SELECT f.* FROM public.finances f WHERE public.can_operate_finance(p_actor,f.id,'read') AND public.finance_matches_filter(f.id,p_filter)),
 months AS(SELECT to_char(transaction_date,'YYYY-MM') AS month,
 coalesce(sum(amount) FILTER(WHERE transaction_type='income'),0.00)::text AS income,
 coalesce(sum(amount) FILTER(WHERE transaction_type IN('expense','reimbursement')),0.00)::text AS expenses
 FROM eligible WHERE status='completed' GROUP BY to_char(transaction_date,'YYYY-MM') ORDER BY month DESC LIMIT 60),
 categories AS(SELECT category,transaction_type,coalesce(sum(amount),0.00)::text AS amount,count(*) AS count FROM eligible WHERE status='completed'
 GROUP BY category,transaction_type ORDER BY category,transaction_type)
 SELECT jsonb_build_object('months',coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY month) FROM months m),'[]'),
 'categories',coalesce((SELECT jsonb_agg(to_jsonb(c)) FROM categories c),'[]'),
 'note','Completed records only; transfers are excluded from income, expense and net totals. Budget reservations count administrator-approved expenses and reimbursements. Recurrence is descriptive metadata, not an automated payment.') INTO r;RETURN r;
END $$;
CREATE FUNCTION public.export_finances(p_actor uuid,p_filter jsonb,p_request_id uuid,p_filter_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r jsonb;n bigint;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));
 IF NOT public.can_operate_finance(p_actor,NULL,'create',NULL) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 SELECT count(*) INTO n FROM public.finances f WHERE public.can_operate_finance(p_actor,f.id,'export') AND public.finance_matches_filter(f.id,p_filter);
 IF n>1000 THEN RAISE EXCEPTION 'EXPORT_TOO_LARGE';END IF;
 SELECT coalesce(jsonb_agg(public.finance_projection(p_actor,id) ORDER BY transaction_date,id),'[]') INTO r
 FROM public.finances f WHERE public.can_operate_finance(p_actor,f.id,'export') AND public.finance_matches_filter(f.id,p_filter);
 IF octet_length(r::text)>2500000 THEN RAISE EXCEPTION 'EXPORT_TOO_LARGE';END IF;
 INSERT INTO public.admin_actions(actor_id,action,target_type,request_id,metadata) VALUES(p_actor,'finances.export','finance',p_request_id,
 jsonb_build_object('count',n,'filterHash',p_filter_hash));RETURN jsonb_build_object('items',r,'total',n);
END $$;
REVOKE ALL ON FUNCTION public.finance_team_action(uuid,uuid,text),public.can_operate_finance(uuid,uuid,text,uuid),public.can_operate_budget(uuid,uuid,text),public.finance_budget_usage(uuid),
 public.budget_projection(uuid,uuid),public.finance_projection(uuid,uuid),public.mutate_finance(uuid,uuid,text,uuid,text,integer,jsonb,text,text,uuid),public.mutate_budget(uuid,uuid,text,uuid,text,integer,jsonb,uuid,text,text),
 gdg_security.protect_finance_ledger() FROM PUBLIC,anon,authenticated,gdg_realtime;
REVOKE ALL ON FUNCTION public.finance_matches_filter(uuid,jsonb),public.list_finances(uuid,integer,jsonb),public.finance_detail(uuid,uuid,integer),
 public.list_budgets(uuid,integer,text,text),public.finance_report(uuid,jsonb),public.export_finances(uuid,jsonb,uuid,text) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.finance_team_action(uuid,uuid,text),public.can_operate_finance(uuid,uuid,text,uuid),public.can_operate_budget(uuid,uuid,text),public.finance_budget_usage(uuid),
 public.budget_projection(uuid,uuid),public.finance_projection(uuid,uuid),public.mutate_finance(uuid,uuid,text,uuid,text,integer,jsonb,text,text,uuid),public.mutate_budget(uuid,uuid,text,uuid,text,integer,jsonb,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finance_matches_filter(uuid,jsonb),public.list_finances(uuid,integer,jsonb),public.finance_detail(uuid,uuid,integer),
 public.list_budgets(uuid,integer,text,text),public.finance_report(uuid,jsonb),public.export_finances(uuid,jsonb,uuid,text) TO service_role;
COMMIT;
