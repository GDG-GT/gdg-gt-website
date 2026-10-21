BEGIN;
ALTER TABLE public.forms ADD COLUMN permanently_deleted_at timestamptz;
CREATE TABLE public.form_deletion_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),form_id uuid NOT NULL REFERENCES public.forms(id),
 actor_id uuid NOT NULL REFERENCES public.admin_users(id),session_id uuid NOT NULL REFERENCES public.admin_sessions(id),
 snapshot_hash text NOT NULL,token_hash text NOT NULL UNIQUE,created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '5 minutes',used_at timestamptz
);
CREATE TABLE public.form_purge_certificates (
 form_id uuid PRIMARY KEY REFERENCES public.forms(id),actor_id uuid NOT NULL REFERENCES public.admin_users(id),
 transaction_id xid8 NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),request_id uuid NOT NULL
);
ALTER TABLE public.form_deletion_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_purge_certificates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.form_deletion_reviews,public.form_purge_certificates FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT ALL ON public.form_deletion_reviews,public.form_purge_certificates TO service_role;

CREATE OR REPLACE FUNCTION public.can_operate_form(p_actor uuid,p_form uuid,p_action text,p_team uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE v_role text;v_form public.forms;v_team uuid:=p_team;v_owner uuid;BEGIN
 SELECT role INTO v_role FROM public.admin_users WHERE id=p_actor AND is_active AND deleted_at IS NULL;
 IF v_role IS NULL OR v_role='blog_editor' OR p_action NOT IN('view','create','edit','publish','manage_access','view_responses','view_sensitive_responses','export_responses','delete') THEN RETURN false;END IF;
 IF p_form IS NOT NULL THEN
  SELECT * INTO v_form FROM public.forms WHERE id=p_form AND permanently_deleted_at IS NULL;
  IF NOT FOUND THEN RETURN false;END IF;v_team:=v_form.team_id;v_owner:=v_form.owner_id;
 END IF;
 IF v_role IN('super_admin','admin') THEN RETURN true;END IF;
 IF v_team IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.team_memberships m JOIN public.admin_teams t ON t.id=m.team_id WHERE m.admin_user_id=p_actor AND m.team_id=v_team AND m.is_active AND t.is_active AND t.deleted_at IS NULL) THEN RETURN false;END IF;
 IF p_form IS NOT NULL AND EXISTS(SELECT 1 FROM public.form_collaborators WHERE form_id=p_form AND admin_user_id=p_actor AND p_action=ANY(actions)) THEN RETURN true;END IF;
 IF p_form IS NOT NULL AND v_team IS NULL AND v_owner<>p_actor THEN RETURN false;END IF;
 RETURN EXISTS(SELECT 1 FROM public.team_memberships m JOIN public.admin_teams t ON t.id=m.team_id AND t.is_active AND t.deleted_at IS NULL
  JOIN public.team_page_access a ON a.team_id=m.team_id AND a.page_path='/admin/forms' AND a.can_access
  JOIN public.team_permissions p ON p.team_id=m.team_id AND p.resource_type='forms'
  WHERE m.admin_user_id=p_actor AND m.is_active AND(v_team IS NULL OR m.team_id=v_team) AND
  CASE p_action WHEN 'view' THEN p.can_read WHEN 'create' THEN p.can_create WHEN 'edit' THEN p.can_update WHEN 'delete' THEN p.can_delete ELSE p.permission IN(p_action,'forms.'||p_action) END);
END $$;
CREATE FUNCTION gdg_security.form_purge_access(p_actor uuid,p_session uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT gdg_security.member_transfer_session(p_actor,p_session) AND EXISTS(SELECT 1 FROM public.admin_users WHERE id=p_actor AND role='super_admin');
$$;
CREATE FUNCTION gdg_security.form_deletion_state(p_form uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('formId',f.id,'revision',f.draft_revision,'archived',f.state='Archived','purged',f.permanently_deleted_at IS NOT NULL,
  'formHeld',gdg_security.form_held(f.id),
  'heldResponses',(SELECT count(*) FROM public.form_responses r WHERE r.form_id=f.id AND(r.status='held' OR gdg_security.form_held(f.id,r.id))),
  'unexpiredResponses',(SELECT count(*) FROM public.form_responses WHERE form_id=f.id AND deleted_at IS NULL AND retention_expires_at>now()),
  'retainedResponses',(SELECT count(*) FROM public.form_responses WHERE form_id=f.id AND deleted_at IS NULL),
  'activeReferences',(SELECT count(*) FROM public.form_integrations WHERE form_id=f.id AND gdg_security.form_integration_active(resource_kind,resource_id)),
  'drafts',(SELECT count(*) FROM public.form_response_drafts WHERE form_id=f.id),
  'filesAwaitingCleanup',(SELECT count(*) FROM public.upload_intents WHERE form_id=f.id AND purged_at IS NULL),
  'exportsAwaitingCleanup',(SELECT count(*) FROM public.form_export_artifacts a JOIN public.form_export_jobs j ON j.id=a.job_id WHERE j.form_id=f.id AND a.purged_at IS NULL),
  'activeExports',(SELECT count(*) FROM public.form_export_jobs WHERE form_id=f.id AND state IN('pending','running','ready') AND expires_at>now()),
  'publishedVersions',(SELECT count(*) FROM public.form_versions WHERE form_id=f.id)) FROM public.forms f WHERE f.id=p_form;
$$;
CREATE FUNCTION public.read_form_deletion(p_actor uuid,p_session uuid,p_form uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;BEGIN
 IF NOT gdg_security.form_purge_access(p_actor,p_session) OR NOT public.can_operate_form(p_actor,p_form,'view') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 result:=gdg_security.form_deletion_state(p_form);RETURN result;
END $$;
CREATE FUNCTION public.review_form_deletion(p_actor uuid,p_session uuid,p_form uuid,p_revision integer,p_token_hash text,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ DECLARE state jsonb;r public.form_deletion_reviews;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));
 PERFORM 1 FROM public.forms WHERE id=p_form FOR UPDATE;
 state:=public.read_form_deletion(p_actor,p_session,p_form);
 IF(state->>'revision')::integer IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'CONFLICT';END IF;
 IF p_token_hash IS NULL OR p_token_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 IF state->>'archived'<>'true' OR state->>'purged'='true' OR state->>'formHeld'='true' OR(state->>'heldResponses')::integer>0
  OR(state->>'unexpiredResponses')::integer>0 OR(state->>'activeReferences')::integer>0 THEN RAISE EXCEPTION 'FORM_DELETION_BLOCKED';END IF;
 DELETE FROM public.form_deletion_reviews WHERE expires_at<now()-interval '1 day';
 INSERT INTO public.form_deletion_reviews(form_id,actor_id,session_id,snapshot_hash,token_hash)
 VALUES(p_form,p_actor,p_session,encode(sha256(convert_to(state::text,'UTF8')),'hex'),p_token_hash) RETURNING * INTO r;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata) VALUES(p_actor,'forms.permanent_deletion_reviewed','form',p_form,p_request_id,jsonb_build_object('reviewId',r.id,'snapshotHash',r.snapshot_hash));
 RETURN jsonb_build_object('reviewId',r.id,'expiresAt',r.expires_at,'state',state);
END $$;
CREATE FUNCTION gdg_security.guard_purged_form() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF OLD.permanently_deleted_at IS NOT NULL THEN RAISE EXCEPTION 'NOT_FOUND';END IF;RETURN NEW;
END $$;
CREATE TRIGGER guard_purged_form BEFORE UPDATE OR DELETE ON public.forms FOR EACH ROW EXECUTE FUNCTION gdg_security.guard_purged_form();
CREATE FUNCTION gdg_security.guard_form_version_erasure() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF TG_OP='UPDATE' AND NEW.definition='{}'::jsonb AND(to_jsonb(NEW)-'definition')=(to_jsonb(OLD)-'definition')
  AND EXISTS(SELECT 1 FROM public.form_purge_certificates c JOIN public.forms f ON f.id=c.form_id
   WHERE c.form_id=OLD.form_id AND c.transaction_id=pg_current_xact_id() AND f.permanently_deleted_at IS NOT NULL) THEN RETURN NEW;END IF;
 RAISE EXCEPTION 'Audit and published records are immutable' USING ERRCODE='42501';
END $$;
DROP TRIGGER form_versions_immutable ON public.form_versions;
CREATE TRIGGER form_versions_immutable BEFORE UPDATE OR DELETE ON public.form_versions FOR EACH ROW EXECUTE FUNCTION gdg_security.guard_form_version_erasure();
CREATE FUNCTION public.permanently_delete_form(p_actor uuid,p_session uuid,p_verified_hash text,p_form uuid,p_revision integer,p_review uuid,p_token_hash text,p_confirmation text,p_export_warning boolean,p_key_hash text,p_request_hash text,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE f public.forms;state jsonb;r public.form_deletion_reviews;k public.idempotency_keys;result jsonb;rid uuid;scope_name text;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));
 -- Linking also holds this global account-management lock, so no reference can
 -- appear between the eligibility recheck and erasure.
 SELECT * INTO f FROM public.forms WHERE id=p_form FOR UPDATE;
 IF NOT FOUND OR NOT gdg_security.form_purge_access(p_actor,p_session) OR NOT EXISTS(SELECT 1 FROM public.admin_users WHERE id=p_actor AND password_hash=p_verified_hash) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$' OR p_request_hash IS NULL OR p_request_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 scope_name:='forms.permanent_delete:'||p_actor||':'||p_session||':'||p_form;
 SELECT * INTO k FROM public.idempotency_keys WHERE scope=scope_name AND key_hash=p_key_hash;
 IF FOUND THEN IF k.request_hash IS DISTINCT FROM p_request_hash THEN RAISE EXCEPTION 'CONFLICT';END IF;RETURN k.result;END IF;
 IF f.permanently_deleted_at IS NOT NULL THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_confirmation IS DISTINCT FROM 'DELETE FORM '||p_form OR p_export_warning IS DISTINCT FROM true THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 SELECT * INTO r FROM public.form_deletion_reviews WHERE id=p_review AND form_id=p_form AND actor_id=p_actor AND session_id=p_session AND token_hash=p_token_hash AND used_at IS NULL AND expires_at>now() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'FORM_DELETION_REVIEW';END IF;
 state:=gdg_security.form_deletion_state(p_form);
 IF f.draft_revision IS DISTINCT FROM p_revision OR r.snapshot_hash IS DISTINCT FROM encode(sha256(convert_to(state::text,'UTF8')),'hex') THEN RAISE EXCEPTION 'CONFLICT';END IF;
 IF f.state<>'Archived' OR gdg_security.form_held(p_form) OR EXISTS(SELECT 1 FROM public.form_responses WHERE form_id=p_form AND(status='held' OR gdg_security.form_held(p_form,id)))
  OR EXISTS(SELECT 1 FROM public.form_responses WHERE form_id=p_form AND deleted_at IS NULL AND retention_expires_at>now())
  OR EXISTS(SELECT 1 FROM public.form_integrations WHERE form_id=p_form AND gdg_security.form_integration_active(resource_kind,resource_id)) THEN RAISE EXCEPTION 'FORM_DELETION_BLOCKED';END IF;
 INSERT INTO public.form_purge_certificates(form_id,actor_id,transaction_id,request_id) VALUES(p_form,p_actor,pg_current_xact_id(),p_request_id);
 UPDATE public.forms SET permanently_deleted_at=now(),title='[Deleted form]',description='',draft_definition='{}',settings='{}',published_version_id=NULL,
  opens_at=NULL,closes_at=NULL,response_limit=0,one_response=false,access_mode='public',draft_revision=draft_revision+1,updated_at=now() WHERE id=p_form;
 FOR rid IN SELECT id FROM public.form_responses WHERE form_id=p_form FOR UPDATE LOOP
  PERFORM gdg_security.scrub_form_response_identity(rid);
 END LOOP;
 DELETE FROM public.form_answers WHERE response_id IN(SELECT id FROM public.form_responses WHERE form_id=p_form);
 DELETE FROM public.form_response_revisions WHERE response_id IN(SELECT id FROM public.form_responses WHERE form_id=p_form);
 UPDATE public.form_responses SET status='deleted',deleted_at=coalesce(deleted_at,now()),request_hash=repeat('0',64) WHERE form_id=p_form;
 UPDATE public.form_response_holds SET reason='' WHERE form_id=p_form;
 UPDATE public.form_privacy_policies SET reason='' WHERE form_id=p_form;
 UPDATE public.form_access_tokens SET intended_email_encrypted=NULL,email_hash=NULL,revoked_at=coalesce(revoked_at,now()) WHERE form_id=p_form;
 UPDATE public.form_response_deliveries SET recipient_encrypted=NULL,recipient_admin=NULL WHERE form_id=p_form;
 UPDATE public.form_uploads SET draft_id=NULL,deleted_at=coalesce(deleted_at,now()) WHERE form_id=p_form;
 UPDATE public.upload_intents SET deleted_at=coalesce(deleted_at,now()) WHERE form_id=p_form;
 DELETE FROM public.form_response_drafts WHERE form_id=p_form;
 UPDATE public.form_export_jobs SET state='cancelled',filters='{}',columns=NULL,private_object_key=NULL,lease_token=NULL,locked_until=NULL,expires_at=now(),updated_at=now() WHERE form_id=p_form;
 DELETE FROM public.form_export_items WHERE job_id IN(SELECT id FROM public.form_export_jobs WHERE form_id=p_form);
 DELETE FROM public.form_saved_views WHERE form_id=p_form;
 DELETE FROM public.form_collaborators WHERE form_id=p_form;
 DELETE FROM public.form_delivery_policies WHERE form_id=p_form;
 UPDATE public.delivery_jobs SET secret_payload=NULL,state='completed',completed_at=coalesce(completed_at,now()),lease_token=NULL,locked_until=NULL,updated_at=now()
 WHERE(kind IN('form_access','form_response_notification') AND(payload->>'formId'=p_form::text OR payload->>'tokenId' IN(SELECT id::text FROM public.form_access_tokens WHERE form_id=p_form)))
  OR(kind='form_reviewed_email' AND payload->>'deliveryId' IN(SELECT id::text FROM public.form_response_deliveries WHERE form_id=p_form))
  OR(kind='upload_scan' AND payload->>'uploadId' IN(SELECT id::text FROM public.upload_intents WHERE form_id=p_form));
 UPDATE public.form_versions SET definition='{}' WHERE form_id=p_form;
 UPDATE public.form_deletion_reviews SET used_at=now() WHERE id=r.id;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata) VALUES(p_actor,'forms.permanently_deleted','form',p_form,p_request_id,
  jsonb_build_object('reviewId',r.id,'revision',f.draft_revision,'retainedResponses',state->'retainedResponses','publishedVersions',state->'publishedVersions',
   'filesAwaitingCleanup',state->'filesAwaitingCleanup','exportsAwaitingCleanup',state->'exportsAwaitingCleanup','exportWarningAcknowledged',true));
 result:=jsonb_build_object('formId',p_form,'deleted',true,'filesAwaitingCleanup',state->'filesAwaitingCleanup','exportsAwaitingCleanup',state->'exportsAwaitingCleanup');
 INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result) VALUES(scope_name,p_key_hash,p_request_hash,200,result);RETURN result;
END $$;
REVOKE ALL ON FUNCTION gdg_security.form_purge_access(uuid,uuid),gdg_security.form_deletion_state(uuid),gdg_security.guard_purged_form(),gdg_security.guard_form_version_erasure(),
 public.read_form_deletion(uuid,uuid,uuid),public.review_form_deletion(uuid,uuid,uuid,integer,text,uuid),
 public.permanently_delete_form(uuid,uuid,text,uuid,integer,uuid,text,text,boolean,text,text,uuid) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION gdg_security.form_purge_access(uuid,uuid),gdg_security.form_deletion_state(uuid),
 public.read_form_deletion(uuid,uuid,uuid),public.review_form_deletion(uuid,uuid,uuid,integer,text,uuid),
 public.permanently_delete_form(uuid,uuid,text,uuid,integer,uuid,text,text,boolean,text,text,uuid) TO service_role;
COMMIT;
