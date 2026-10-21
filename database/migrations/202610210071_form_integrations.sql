BEGIN;
-- Integration rows never contain a copied form definition or respondent token.
CREATE TABLE public.form_integrations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),resource_kind text NOT NULL CHECK(resource_kind IN('event','team','campaign')),
 resource_id uuid NOT NULL,slot text NOT NULL CHECK(slot~'^[a-z][a-z0-9-]{0,39}$'),
 form_id uuid NOT NULL REFERENCES public.forms(id),version_policy text NOT NULL DEFAULT 'latest_published' CHECK(version_policy='latest_published'),
 label text NOT NULL CHECK(length(btrim(label)) BETWEEN 1 AND 80),revision integer NOT NULL DEFAULT 1,
 linked_by uuid NOT NULL REFERENCES public.admin_users(id),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(resource_kind,resource_id,slot)
);
CREATE INDEX form_integration_form ON public.form_integrations(form_id);
ALTER TABLE public.form_integrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.form_integrations FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT ALL ON public.form_integrations TO service_role;
CREATE FUNCTION gdg_security.form_integration_source(p_actor uuid,p_kind text,p_resource uuid,p_edit boolean) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.admin_users WHERE id=p_actor AND is_active AND deleted_at IS NULL AND NOT must_change_password AND(locked_until IS NULL OR locked_until<=now())) THEN RETURN false;END IF;
 IF p_kind='event' THEN RETURN EXISTS(SELECT 1 FROM public.events e WHERE e.id=p_resource
  AND(e.team_id IS NULL OR EXISTS(SELECT 1 FROM public.admin_teams WHERE id=e.team_id AND is_active AND deleted_at IS NULL))
  AND public.can_operate_event(p_actor,'read',e.team_id) AND(NOT p_edit OR public.can_operate_event(p_actor,'update',e.team_id)));
 ELSIF p_kind='team' THEN RETURN public.can_operate_team(p_actor,p_resource,CASE WHEN p_edit THEN 'manage' ELSE 'read' END);
 ELSIF p_kind='campaign' THEN RETURN EXISTS(SELECT 1 FROM public.newsletter_campaigns WHERE id=p_resource)
  AND EXISTS(SELECT 1 FROM public.admin_users WHERE id=p_actor AND role IN('admin','super_admin'));
 END IF;RETURN false;
END $$;
CREATE FUNCTION gdg_security.form_integration_active(p_kind text,p_resource uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT CASE p_kind WHEN 'event' THEN EXISTS(SELECT 1 FROM public.events WHERE id=p_resource AND publication_status<>'archived')
 WHEN 'team' THEN EXISTS(SELECT 1 FROM public.admin_teams WHERE id=p_resource AND is_active AND deleted_at IS NULL)
 WHEN 'campaign' THEN EXISTS(SELECT 1 FROM public.newsletter_campaigns WHERE id=p_resource AND status IN('draft','scheduled','sending')) ELSE false END;
$$;
CREATE FUNCTION public.read_form_integrations(p_actor uuid,p_session uuid,p_kind text,p_resource uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$ DECLARE items jsonb;BEGIN
 IF NOT gdg_security.member_transfer_session(p_actor,p_session) OR NOT gdg_security.form_integration_source(p_actor,p_kind,p_resource,false) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'slot',r.slot,'formId',r.form_id,'versionPolicy',r.version_policy,'label',r.label,'revision',r.revision,
  'title',CASE WHEN public.can_operate_form(p_actor,f.id,'view') THEN f.title ELSE NULL END,
  'href',CASE WHEN f.published_version_id IS NOT NULL AND f.state<>'Archived' AND public.can_operate_form(p_actor,f.id,'view') THEN '/forms/'||f.slug ELSE NULL END) ORDER BY r.slot),'[]') INTO items
 FROM public.form_integrations r JOIN public.forms f ON f.id=r.form_id WHERE r.resource_kind=p_kind AND r.resource_id=p_resource;
 RETURN jsonb_build_object('items',items,'canEdit',gdg_security.form_integration_source(p_actor,p_kind,p_resource,true),
  'canLink',gdg_security.form_integration_source(p_actor,p_kind,p_resource,true) AND gdg_security.form_integration_active(p_kind,p_resource)
   AND(p_kind<>'campaign' OR EXISTS(SELECT 1 FROM public.newsletter_campaigns WHERE id=p_resource AND status='draft')));
END $$;
CREATE FUNCTION public.form_integration_candidates(p_actor uuid,p_session uuid,p_kind text,p_resource uuid,p_query text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$ DECLARE result jsonb;BEGIN
 IF NOT gdg_security.member_transfer_session(p_actor,p_session) OR NOT gdg_security.form_integration_source(p_actor,p_kind,p_resource,true) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT coalesce(jsonb_agg(item ORDER BY title,id),'[]') INTO result FROM(
  SELECT f.id,f.title,jsonb_build_object('id',f.id,'title',f.title,'version',v.version,'access',f.access_mode) item FROM public.forms f
  JOIN public.form_versions v ON v.id=f.published_version_id WHERE f.state<>'Archived'
  AND(f.team_id IS NULL OR EXISTS(SELECT 1 FROM public.admin_teams WHERE id=f.team_id AND is_active AND deleted_at IS NULL))
  AND public.can_operate_form(p_actor,f.id,'view') AND public.can_operate_form(p_actor,f.id,'manage_access')
  AND strpos(lower(f.title),lower(coalesce(p_query,'')))>0 ORDER BY f.title,f.id LIMIT 50) x;
 RETURN result;
END $$;
CREATE FUNCTION public.mutate_form_integration(p_actor uuid,p_session uuid,p_kind text,p_resource uuid,p_slot text,p_revision integer,p_document jsonb,p_key_hash text,p_request_hash text,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r public.form_integrations;f public.forms;k public.idempotency_keys;result jsonb;scope_name text;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));
 IF NOT gdg_security.member_transfer_session(p_actor,p_session) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_kind='event' THEN PERFORM 1 FROM public.events WHERE id=p_resource FOR UPDATE;
 ELSIF p_kind='team' THEN PERFORM 1 FROM public.admin_teams WHERE id=p_resource FOR UPDATE;
 ELSIF p_kind='campaign' THEN PERFORM 1 FROM public.newsletter_campaigns WHERE id=p_resource FOR UPDATE;
 ELSE RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 IF NOT FOUND OR NOT gdg_security.form_integration_source(p_actor,p_kind,p_resource,true) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_slot IS NULL OR p_slot!~'^[a-z][a-z0-9-]{0,39}$' OR p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$' OR p_request_hash IS NULL OR p_request_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 scope_name:='forms.integration:'||p_actor||':'||p_session||':'||p_kind||':'||p_resource||':'||p_slot;
 SELECT * INTO k FROM public.idempotency_keys WHERE scope=scope_name AND key_hash=p_key_hash;
 IF FOUND THEN IF k.request_hash IS DISTINCT FROM p_request_hash THEN RAISE EXCEPTION 'CONFLICT';END IF;RETURN k.result;END IF;
 -- Lock order is account -> resource -> form -> reference, also used by purge.
 IF p_document IS NOT NULL THEN
  SELECT * INTO f FROM public.forms WHERE id=(p_document->>'formId')::uuid FOR UPDATE;
  IF NOT FOUND OR f.state='Archived' OR f.published_version_id IS NULL
   OR(f.team_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.admin_teams WHERE id=f.team_id AND is_active AND deleted_at IS NULL))
   OR NOT public.can_operate_form(p_actor,f.id,'view') OR NOT public.can_operate_form(p_actor,f.id,'manage_access') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  IF NOT gdg_security.form_integration_active(p_kind,p_resource) OR(p_kind='campaign' AND NOT EXISTS(SELECT 1 FROM public.newsletter_campaigns WHERE id=p_resource AND status='draft')) THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  IF p_document->>'versionPolicy' IS DISTINCT FROM 'latest_published' OR length(btrim(coalesce(p_document->>'label',''))) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 END IF;
 SELECT * INTO r FROM public.form_integrations WHERE resource_kind=p_kind AND resource_id=p_resource AND slot=p_slot FOR UPDATE;
 IF coalesce(r.revision,0) IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'CONFLICT';END IF;
 IF p_document IS NULL THEN
  IF r.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  DELETE FROM public.form_integrations WHERE id=r.id;result:=jsonb_build_object('removed',true);
 ELSE
  IF r.id IS NULL AND(SELECT count(*) FROM public.form_integrations WHERE resource_kind=p_kind AND resource_id=p_resource)>=5 THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  INSERT INTO public.form_integrations(resource_kind,resource_id,slot,form_id,label,linked_by)
  VALUES(p_kind,p_resource,p_slot,f.id,btrim(p_document->>'label'),p_actor)
  ON CONFLICT(resource_kind,resource_id,slot) DO UPDATE SET form_id=excluded.form_id,label=excluded.label,linked_by=excluded.linked_by,
   revision=public.form_integrations.revision+1,updated_at=now() RETURNING * INTO r;
  result:=jsonb_build_object('id',r.id,'revision',r.revision);
 END IF;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata) VALUES(p_actor,CASE WHEN p_document IS NULL THEN 'forms.integration_removed' ELSE 'forms.integration_linked' END,
  'form_integration',r.id,p_request_id,jsonb_build_object('resourceKind',p_kind,'resourceId',p_resource,'formId',r.form_id,'versionPolicy',r.version_policy));
 INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result) VALUES(scope_name,p_key_hash,p_request_hash,200,result);RETURN result;
END $$;
CREATE FUNCTION public.public_event_form_integrations(p_event uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('label',r.label,'href','/forms/'||f.slug) ORDER BY r.slot),'[]') FROM public.form_integrations r
 JOIN public.events e ON e.id=r.resource_id AND e.publication_status='published'
 JOIN public.forms f ON f.id=r.form_id AND f.published_version_id IS NOT NULL AND f.state='Open' AND f.access_mode IN('public','verified')
 AND(f.opens_at IS NULL OR f.opens_at<=now()) AND(f.closes_at IS NULL OR f.closes_at>now())
 AND(f.team_id IS NULL OR EXISTS(SELECT 1 FROM public.admin_teams WHERE id=f.team_id AND is_active AND deleted_at IS NULL))
 WHERE r.resource_kind='event' AND r.resource_id=p_event;
$$;
REVOKE ALL ON FUNCTION gdg_security.form_integration_source(uuid,text,uuid,boolean),gdg_security.form_integration_active(text,uuid),
 public.read_form_integrations(uuid,uuid,text,uuid),public.form_integration_candidates(uuid,uuid,text,uuid,text),
 public.mutate_form_integration(uuid,uuid,text,uuid,text,integer,jsonb,text,text,uuid),public.public_event_form_integrations(uuid) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION gdg_security.form_integration_source(uuid,text,uuid,boolean),gdg_security.form_integration_active(text,uuid),
 public.read_form_integrations(uuid,uuid,text,uuid),public.form_integration_candidates(uuid,uuid,text,uuid,text),
 public.mutate_form_integration(uuid,uuid,text,uuid,text,integer,jsonb,text,text,uuid),public.public_event_form_integrations(uuid) TO service_role;
COMMIT;
