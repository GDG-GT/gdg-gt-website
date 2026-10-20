BEGIN;
-- Inactive-team financial history remains readable to administrators, not writable.
CREATE OR REPLACE FUNCTION public.can_operate_budget(p_actor uuid,p_id uuid,p_action text) RETURNS boolean
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.admin_users u JOIN public.budget_allocations b ON b.id=p_id
 WHERE u.id=p_actor AND u.is_active AND NOT u.must_change_password AND u.deleted_at IS NULL AND (u.locked_until IS NULL OR u.locked_until<=now())
 AND u.role IN('admin','super_admin','team_member') AND p_action IN('read','manage') AND
 ((u.role IN('super_admin','admin') AND(p_action='read' OR(b.status<>'closed' AND(b.team_id IS NULL OR EXISTS(SELECT 1 FROM public.admin_teams WHERE id=b.team_id AND is_active AND deleted_at IS NULL)))))
 OR(p_action='read' AND public.finance_team_action(u.id,b.team_id,'read'))));
$$;
COMMIT;
