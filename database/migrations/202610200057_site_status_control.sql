BEGIN;
DO $$ BEGIN IF(SELECT count(*) FROM public.site_status)>1 THEN RAISE EXCEPTION 'Review existing status history before singleton migration';END IF;END $$;
ALTER TABLE public.site_status ADD COLUMN singleton boolean NOT NULL DEFAULT true CHECK(singleton),ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 ADD COLUMN button_text text NOT NULL DEFAULT 'Chapter updates',ADD COLUMN auto_redirect boolean NOT NULL DEFAULT false,
 ADD COLUMN updated_by uuid REFERENCES public.admin_users(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX site_status_singleton ON public.site_status(singleton);
CREATE FUNCTION public.can_operate_site_status(p_actor uuid,p_action text) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT p_action IN('read','update') AND EXISTS(SELECT 1 FROM public.admin_users u WHERE u.id=p_actor AND u.is_active AND NOT u.must_change_password AND u.deleted_at IS NULL AND(u.locked_until IS NULL OR u.locked_until<=now()) AND
 (u.role IN('super_admin','admin') OR u.role='team_member' AND EXISTS(SELECT 1 FROM public.team_memberships m JOIN public.admin_teams t ON t.id=m.team_id AND t.is_active AND t.deleted_at IS NULL
 JOIN public.team_page_access a ON a.team_id=t.id AND a.page_path='/admin/site-status' AND a.can_access
 JOIN public.team_permissions p ON p.team_id=t.id AND p.resource_type='site_status' AND p.permission='crud'
 WHERE m.admin_user_id=u.id AND m.is_active AND CASE p_action WHEN 'read' THEN p.can_read ELSE p.can_read AND p.can_update END)));
$$;
CREATE FUNCTION public.read_site_status(p_actor uuid DEFAULT NULL,p_private boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE p public.site_status;r jsonb;BEGIN
 IF p_private AND NOT public.can_operate_site_status(p_actor,'read') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 SELECT * INTO p FROM public.site_status WHERE singleton;
 IF NOT FOUND THEN RETURN jsonb_build_object('revision',1,'is_live',true,'message',CASE WHEN p_private THEN 'The chapter website is taking a short break while we make improvements.' ELSE '' END,'redirect_url','','button_text','Chapter updates','auto_redirect',false)
  ||CASE WHEN p_private THEN jsonb_build_object('updatedAt',NULL,'canUpdate',public.can_operate_site_status(p_actor,'update')) ELSE '{}'::jsonb END;END IF;
 r:=jsonb_build_object('revision',p.revision,'is_live',p.is_live,'message',CASE WHEN NOT p_private AND p.is_live THEN '' ELSE coalesce(p.message,'The chapter website is temporarily unavailable.') END,
 'redirect_url',CASE WHEN NOT p_private AND p.is_live THEN '' ELSE coalesce(p.redirect_url,'') END,'button_text',p.button_text,'auto_redirect',CASE WHEN NOT p_private AND p.is_live THEN false ELSE p.auto_redirect END);
 IF NOT p_private AND r->>'redirect_url' LIKE '/l/%' AND public.public_linktree_profile(substring(r->>'redirect_url' FROM 4)) IS NULL THEN r:=r||jsonb_build_object('redirect_url','','auto_redirect',false);END IF;
 IF p_private THEN r:=r||jsonb_build_object('updatedAt',p.updated_at,'canUpdate',public.can_operate_site_status(p_actor,'update'));END IF;RETURN r;
END $$;
CREATE FUNCTION public.mutate_site_status(p_actor uuid,p_session uuid,p_verified_hash text,p_revision integer,p_document jsonb,p_key_hash text,p_request_hash text,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE u public.admin_users;p public.site_status;k public.idempotency_keys;d jsonb;s text;r jsonb;dest text;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('site-status',0));
 SELECT * INTO u FROM public.admin_users WHERE id=p_actor AND is_active AND NOT must_change_password AND deleted_at IS NULL AND(locked_until IS NULL OR locked_until<=now());
 IF u.id IS NULL OR NOT public.can_operate_site_status(u.id,'update') OR NOT EXISTS(SELECT 1 FROM public.admin_sessions WHERE id=p_session AND admin_user_id=u.id AND revoked_at IS NULL AND idle_expires_at>now() AND absolute_expires_at>now()) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 IF p_verified_hash IS NULL OR p_verified_hash IS DISTINCT FROM u.password_hash THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 IF p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$' OR p_request_hash IS NULL OR p_request_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 s:='site_status.update:'||u.id;SELECT * INTO k FROM public.idempotency_keys WHERE scope=s AND key_hash=p_key_hash;
 IF FOUND THEN IF k.request_hash IS DISTINCT FROM p_request_hash THEN RAISE EXCEPTION 'CONFLICT';END IF;RETURN k.result;END IF;
 SELECT * INTO p FROM public.site_status WHERE singleton FOR UPDATE;
 IF NOT FOUND THEN INSERT INTO public.site_status(is_live,message,redirect_url) VALUES(true,'The chapter website is taking a short break while we make improvements.','') RETURNING * INTO p;END IF;
 IF p.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'CONFLICT';END IF;
 d:=p_document->'record';dest:=coalesce(d->>'redirect_url','');
 IF jsonb_typeof(d->'is_live') IS DISTINCT FROM 'boolean' OR jsonb_typeof(d->'auto_redirect') IS DISTINCT FROM 'boolean' OR length(coalesce(d->>'message','')) NOT BETWEEN 2 AND 2000 OR length(coalesce(d->>'button_text','')) NOT BETWEEN 2 AND 80
 OR p_document->>'confirmation' IS DISTINCT FROM (CASE WHEN(d->>'is_live')::boolean THEN 'LIVE' ELSE 'MAINTENANCE' END)
 OR(dest<>'' AND dest!~'^/l/[a-z0-9]([a-z0-9_-]{0,48}[a-z0-9])?$' AND dest!~'^https://(gatech[.]edu|www[.]gatech[.]edu|gdg[.]community[.]dev)(/[^?#[:space:]]*)?$')
 OR((d->>'auto_redirect')::boolean AND dest!~'^/l/[a-z0-9]([a-z0-9_-]{0,48}[a-z0-9])?$') THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 IF dest LIKE '/l/%' AND public.public_linktree_profile(substring(dest FROM 4)) IS NULL THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 UPDATE public.site_status SET is_live=(d->>'is_live')::boolean,message=d->>'message',redirect_url=dest,button_text=d->>'button_text',auto_redirect=(d->>'auto_redirect')::boolean,revision=revision+1,updated_at=clock_timestamp(),updated_by=u.id WHERE id=p.id RETURNING * INTO p;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata) VALUES(u.id,'site_status.updated','site_status',p.id,p_request_id,jsonb_build_object('revision',p.revision,'isLive',p.is_live,'automatic',p.auto_redirect));
 r:=public.read_site_status(u.id,true);INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result) VALUES(s,p_key_hash,p_request_hash,200,r);RETURN r;
END $$;
REVOKE ALL ON public.site_status FROM PUBLIC,anon,authenticated,gdg_realtime;
REVOKE ALL ON FUNCTION public.can_operate_site_status(uuid,text),public.read_site_status(uuid,boolean),public.mutate_site_status(uuid,uuid,text,integer,jsonb,text,text,uuid) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.can_operate_site_status(uuid,text),public.read_site_status(uuid,boolean),public.mutate_site_status(uuid,uuid,text,integer,jsonb,text,text,uuid) TO service_role;
COMMIT;
