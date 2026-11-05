BEGIN;
-- Filter eligible accounts inside PostgreSQL, before count and pagination. No
-- application-side team-membership list or Data API row ceiling controls scope.
CREATE FUNCTION public.list_form_access_accounts(p_actor uuid,p_form uuid,p_kind text,p_page integer,p_size integer,p_query text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE v public.forms;v_items jsonb;v_total integer;
BEGIN
 IF p_kind IS NULL OR p_kind NOT IN('candidates','collaborators') OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 10000
 OR p_size IS NULL OR p_size NOT BETWEEN 1 AND 100 OR length(p_query)>100 THEN
  RAISE EXCEPTION 'Invalid access inventory filter' USING ERRCODE='22023';END IF;
 SELECT * INTO v FROM public.forms WHERE id=p_form;
 IF NOT FOUND OR NOT public.can_operate_form(p_actor,p_form,'manage_access') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 WITH eligible AS (
  SELECT u.id,coalesce(nullif(u.display_name,''),'Chapter account') AS display_name,u.role,
   coalesce(c.actions,ARRAY[]::text[]) AS actions,c.created_at,c.updated_at
  FROM public.admin_users u LEFT JOIN public.form_collaborators c ON c.form_id=p_form AND c.admin_user_id=u.id
  WHERE (p_kind='collaborators' AND c.admin_user_id IS NOT NULL OR p_kind='candidates' AND
   u.is_active AND u.deleted_at IS NULL AND u.role<>'blog_editor' AND u.id<>v.owner_id AND
   (v.team_id IS NULL OR u.role IN('admin','super_admin') OR EXISTS(
    SELECT 1 FROM public.team_memberships m JOIN public.admin_teams t ON t.id=m.team_id
    WHERE m.team_id=v.team_id AND m.admin_user_id=u.id AND m.is_active AND t.is_active AND t.deleted_at IS NULL)))
  AND (p_query IS NULL OR strpos(lower(coalesce(nullif(u.display_name,''),'Chapter account')),lower(p_query))>0)
 ), page AS (
  SELECT * FROM eligible ORDER BY display_name,id LIMIT p_size OFFSET (p_page-1)*p_size
 ) SELECT (SELECT count(*) FROM eligible),coalesce(jsonb_agg(
  CASE WHEN p_kind='candidates' THEN jsonb_build_object('id',page.id,'display_name',page.display_name,'role',page.role,'actions',page.actions)
  ELSE jsonb_build_object('admin_user_id',page.id,'display_name',page.display_name,'role',page.role,'actions',page.actions,'created_at',page.created_at,'updated_at',page.updated_at) END
  ORDER BY page.display_name,page.id),'[]'::jsonb) INTO v_total,v_items FROM page;
 RETURN jsonb_build_object('items',v_items,'total',v_total,'page',p_page,'pageSize',p_size);
END $$;
REVOKE ALL ON FUNCTION public.list_form_access_accounts(uuid,uuid,text,integer,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_form_access_accounts(uuid,uuid,text,integer,integer,text) TO service_role;

-- An authorized manager must be able to remove a stored grant even after its
-- recipient becomes inactive or leaves the form's team. New grants remain strict.
CREATE OR REPLACE FUNCTION public.mutate_form_collaborator(p_actor uuid,p_form uuid,p_user uuid,p_actions text[],p_delete boolean,p_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v public.forms;v_role text;
BEGIN
 SELECT * INTO v FROM public.forms WHERE id=p_form FOR UPDATE;
 IF NOT FOUND OR NOT public.can_operate_form(p_actor,p_form,'manage_access') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_user=v.owner_id THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
 IF p_delete THEN DELETE FROM public.form_collaborators WHERE form_id=p_form AND admin_user_id=p_user;
 ELSE
  SELECT role INTO v_role FROM public.admin_users WHERE id=p_user AND is_active AND deleted_at IS NULL;
  IF v_role IS NULL OR v_role='blog_editor' THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  IF v.team_id IS NOT NULL AND v_role NOT IN('admin','super_admin') AND NOT EXISTS(
   SELECT 1 FROM public.team_memberships m JOIN public.admin_teams t ON t.id=m.team_id
   WHERE m.team_id=v.team_id AND m.admin_user_id=p_user AND m.is_active AND t.is_active AND t.deleted_at IS NULL) THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  IF coalesce(cardinality(p_actions),0) NOT BETWEEN 1 AND 8 OR NOT 'view'=ANY(p_actions)
  OR EXISTS(SELECT 1 FROM unnest(p_actions) a WHERE NOT public.can_operate_form(p_actor,p_form,a)) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';END IF;
  INSERT INTO public.form_collaborators(form_id,admin_user_id,actions,created_by) VALUES(p_form,p_user,p_actions,p_actor)
  ON CONFLICT(form_id,admin_user_id) DO UPDATE SET actions=excluded.actions,updated_at=now();
 END IF;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata)
 VALUES(p_actor,CASE WHEN p_delete THEN 'forms.collaborator_removed' ELSE 'forms.collaborator_updated' END,'form',p_form,p_request_id,jsonb_build_object('userId',p_user,'actions',p_actions));
END $$;
REVOKE ALL ON FUNCTION public.mutate_form_collaborator(uuid,uuid,uuid,text[],boolean,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mutate_form_collaborator(uuid,uuid,uuid,text[],boolean,uuid) TO service_role;
COMMIT;
