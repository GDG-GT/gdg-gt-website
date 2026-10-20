BEGIN;
-- Special-action rows must not silently grant general read/edit actions.
CREATE OR REPLACE FUNCTION public.mutate_team(p_actor uuid,p_session uuid,p_verified_hash text,p_team uuid,p_action text,
 p_revision integer,p_document jsonb,p_request_id uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE a public.admin_users;t public.admin_teams;u public.admin_users;m public.team_memberships;
 dest public.admin_teams;role_name text;grant_item jsonb;extra text;pair text;dest_id uuid;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('team-administration',0));
 SELECT * INTO a FROM public.admin_users WHERE id=p_actor AND is_active AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND OR a.password_hash IS DISTINCT FROM p_verified_hash OR a.must_change_password OR a.locked_until>now() THEN
  RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM public.admin_sessions WHERE id=p_session AND admin_user_id=a.id AND revoked_at IS NULL
  AND idle_expires_at>now() AND absolute_expires_at>now();
 IF NOT FOUND THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 IF p_action='create' THEN
  IF NOT public.can_operate_team(a.id,NULL,'create') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
  SELECT * INTO u FROM public.admin_users WHERE id=(p_document->>'leadId')::uuid AND is_active AND NOT must_change_password AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR u.role='blog_editor' OR (a.role='admin' AND u.role='super_admin') THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  INSERT INTO public.admin_teams(name,description,slug,color,icon,team_lead_id,created_by)
   VALUES(p_document->>'name',p_document->>'description',p_document->>'slug',p_document->>'color',p_document->>'icon',u.id,a.id) RETURNING * INTO t;
  INSERT INTO public.team_memberships(team_id,admin_user_id,role,added_by) VALUES(t.id,u.id,'lead',a.id);
 ELSE
  SELECT * INTO t FROM public.admin_teams WHERE id=p_team FOR UPDATE;
  IF NOT FOUND OR NOT public.can_operate_team(a.id,p_team,CASE WHEN p_action IN ('update','archive','restore') THEN 'settings'
    WHEN p_action='permissions' THEN 'permissions' ELSE 'manage' END) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  IF t.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'CONFLICT';END IF;
  IF (t.deleted_at IS NOT NULL OR NOT t.is_active) AND p_action<>'restore' THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  IF p_action='update' THEN
   UPDATE public.admin_teams SET name=p_document->>'name',description=p_document->>'description',color=p_document->>'color',icon=p_document->>'icon' WHERE id=t.id;
  ELSIF p_action='archive' THEN
   UPDATE public.admin_teams SET deleted_at=now(),is_active=false WHERE id=t.id;
   UPDATE public.team_page_access SET can_access=false WHERE team_id=t.id;
   UPDATE public.admin_users SET permission_version=permission_version+1 WHERE id IN (SELECT admin_user_id FROM public.team_memberships WHERE team_id=t.id AND is_active);
  ELSIF p_action='restore' THEN
   IF t.deleted_at IS NULL THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
   IF NOT EXISTS(SELECT 1 FROM public.team_memberships x JOIN public.admin_users y ON y.id=x.admin_user_id
    WHERE x.team_id=t.id AND x.role='lead' AND x.is_active AND y.is_active AND y.deleted_at IS NULL AND y.role<>'blog_editor') THEN
    RAISE EXCEPTION 'LAST_TEAM_LEAD';END IF;
   UPDATE public.admin_teams SET deleted_at=NULL,is_active=true WHERE id=t.id;
   -- Page grants stay disabled after restoration; reapproval is explicit.
  ELSIF p_action='permissions' THEN
   IF jsonb_typeof(p_document->'grants')<>'array' OR jsonb_array_length(p_document->'grants')>16 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
   DELETE FROM public.team_permissions WHERE team_id=t.id;
   DELETE FROM public.team_page_access WHERE team_id=t.id;
   FOR grant_item IN SELECT value FROM jsonb_array_elements(p_document->'grants') LOOP
    pair:=(grant_item->>'path')||':'||(grant_item->>'resource');
    IF pair IS NULL OR pair<>ALL(ARRAY['/admin/events:events','/admin/resources:resources','/admin/sponsors:sponsors','/admin/team:team_members',
     '/admin/content:site_content','/admin/forms:forms','/admin/members:members','/admin/newsletter:newsletter','/admin/media:media',
     '/admin/gallery:gallery','/admin/linktree:linktree','/admin/communications:communications','/admin/whiteboard:whiteboards',
     '/admin/finances:finances','/admin/blog:blog','/admin/projects:projects']) THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
    INSERT INTO public.team_page_access(team_id,page_path,can_access) VALUES(t.id,grant_item->>'path',true);
    INSERT INTO public.team_permissions(team_id,resource_type,permission,can_create,can_read,can_update,can_delete)
     VALUES(t.id,grant_item->>'resource','crud',(grant_item->>'create')::boolean,(grant_item->>'read')::boolean,
      (grant_item->>'update')::boolean,(grant_item->>'delete')::boolean);
    FOR extra IN SELECT jsonb_array_elements_text(grant_item->'extras') LOOP
     IF extra NOT IN ('publish','manage_access','view_responses','view_sensitive_responses','export_responses','send_email')
      OR (extra IN ('manage_access','view_responses','view_sensitive_responses','export_responses') AND grant_item->>'resource'<>'forms')
      OR (extra='send_email' AND grant_item->>'resource'<>'newsletter') THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
     INSERT INTO public.team_permissions(team_id,resource_type,permission,can_read,can_update)
      VALUES(t.id,grant_item->>'resource',extra,false,CASE WHEN extra='publish' THEN (grant_item->>'update')::boolean ELSE false END);
    END LOOP;
   END LOOP;
   UPDATE public.admin_users SET permission_version=permission_version+1 WHERE id IN (SELECT admin_user_id FROM public.team_memberships WHERE team_id=t.id AND is_active);
  ELSIF p_action IN ('member_add','member_role','member_remove','member_transfer') THEN
   role_name:=coalesce(p_document->>'role','member');
   IF role_name NOT IN ('member','lead','co_lead') THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
   IF p_action='member_add' THEN
    SELECT * INTO u FROM public.admin_users WHERE email=p_document->>'email' AND is_active AND deleted_at IS NULL AND NOT must_change_password FOR UPDATE;
    IF NOT FOUND OR u.role='blog_editor' THEN RAISE EXCEPTION 'ACCOUNT_NOT_READY';END IF;
    SELECT * INTO m FROM public.team_memberships WHERE team_id=t.id AND admin_user_id=u.id FOR UPDATE;
    IF FOUND AND m.is_active THEN RAISE EXCEPTION 'DUPLICATE';END IF;
   ELSE
    SELECT * INTO m FROM public.team_memberships WHERE team_id=t.id AND id=(p_document->>'membershipId')::uuid AND is_active FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
    IF m.revision IS DISTINCT FROM (p_document->>'membershipRevision')::integer THEN RAISE EXCEPTION 'CONFLICT';END IF;
    SELECT * INTO u FROM public.admin_users WHERE id=m.admin_user_id FOR UPDATE;
   END IF;
   IF (a.role='admin' AND u.role='super_admin') OR (a.role='team_member' AND
    (u.role<>'team_member' OR role_name<>'member' OR (m.id IS NOT NULL AND m.role<>'member') OR p_action='member_transfer')) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
   IF m.role='lead' AND p_action IN ('member_remove','member_transfer','member_role') AND (p_action<>'member_role' OR role_name<>'lead')
    AND NOT EXISTS(SELECT 1 FROM public.team_memberships x JOIN public.admin_users y ON y.id=x.admin_user_id
     WHERE x.team_id=t.id AND x.id<>m.id AND x.is_active AND x.role='lead' AND y.is_active AND y.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'LAST_TEAM_LEAD';END IF;
   IF a.id=u.id AND p_action='member_role' AND role_name<>m.role THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
   IF p_action='member_add' THEN
    INSERT INTO public.team_memberships(team_id,admin_user_id,role,added_by) VALUES(t.id,u.id,role_name,a.id)
     ON CONFLICT(team_id,admin_user_id) DO UPDATE SET is_active=true,role=EXCLUDED.role,joined_at=now(),added_by=a.id,
      revision=public.team_memberships.revision+1,updated_at=now();
   ELSIF p_action='member_role' THEN UPDATE public.team_memberships SET role=role_name,revision=revision+1,updated_at=now() WHERE id=m.id;
   ELSE
    IF p_action='member_transfer' THEN
     dest_id:=(p_document->>'destinationId')::uuid;
     SELECT * INTO dest FROM public.admin_teams WHERE id=dest_id AND is_active AND deleted_at IS NULL FOR UPDATE;
     IF NOT FOUND OR dest.id=t.id OR NOT public.can_operate_team(a.id,dest.id,'manage') THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
     IF EXISTS(SELECT 1 FROM public.team_memberships WHERE team_id=dest.id AND admin_user_id=u.id AND is_active) THEN RAISE EXCEPTION 'DUPLICATE';END IF;
     INSERT INTO public.team_memberships(team_id,admin_user_id,role,added_by) VALUES(dest.id,u.id,'member',a.id)
      ON CONFLICT(team_id,admin_user_id) DO UPDATE SET is_active=true,role='member',joined_at=now(),added_by=a.id,
       revision=public.team_memberships.revision+1,updated_at=now();
     INSERT INTO public.team_member_transfers(membership_id,from_team_id,to_team_id,transferred_by,reason)
      VALUES(m.id,t.id,dest.id,a.id,p_document->>'reason');
     INSERT INTO public.team_activity_log(team_id,actor_id,action,target_user_id,details)
      VALUES(dest.id,a.id,'member_transferred_in',u.id,jsonb_build_object('fromTeamId',t.id));
     UPDATE public.admin_teams SET revision=revision+1,updated_at=now() WHERE id=dest.id;
    END IF;
    UPDATE public.team_memberships SET is_active=false,revision=revision+1,updated_at=now() WHERE id=m.id;
   END IF;
   UPDATE public.admin_users SET permission_version=permission_version+1 WHERE id=u.id;
   UPDATE public.admin_teams SET team_lead_id=(SELECT x.admin_user_id FROM public.team_memberships x JOIN public.admin_users y ON y.id=x.admin_user_id
    WHERE x.team_id=t.id AND x.is_active AND x.role='lead' AND y.is_active AND y.deleted_at IS NULL ORDER BY x.joined_at,x.id LIMIT 1) WHERE id=t.id;
  ELSE RAISE EXCEPTION 'INVALID_STATE';END IF;
  UPDATE public.admin_teams SET revision=revision+1,updated_at=now() WHERE id=t.id;
 END IF;
 INSERT INTO public.team_activity_log(team_id,actor_id,action,target_user_id,details)
  VALUES(t.id,a.id,p_action,CASE WHEN p_action LIKE 'member_%' THEN u.id ELSE NULL END,
   jsonb_strip_nulls(jsonb_build_object('membershipRole',CASE WHEN p_action LIKE 'member_%' THEN role_name END,'destinationId',dest_id)));
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id)
  VALUES(a.id,'teams.'||p_action,'admin_team',t.id,p_request_id);
 RETURN public.team_workspace(a.id,t.id);
END $$;
COMMIT;
