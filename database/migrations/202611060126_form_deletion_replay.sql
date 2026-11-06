BEGIN;
-- A form can be purged only once. Its one consumed review safely identifies
-- historical receipts without retaining proof or re-running an erasure.
UPDATE public.idempotency_keys k SET result=k.result||jsonb_build_object('reviewId',r.id)
FROM public.form_deletion_reviews r WHERE r.used_at IS NOT NULL
 AND k.scope='forms.permanent_delete:'||r.actor_id||':'||r.session_id||':'||r.form_id
 AND k.result->>'formId'=r.form_id::text AND k.result->>'deleted'='true' AND NOT k.result ? 'reviewId';
-- Accepted deletion receipts remain readable only to the original current
-- Super Admin session, including after the form's content has been purged.
CREATE FUNCTION public.inspect_form_deletion_write(p_actor uuid,p_session uuid,p_form uuid,p_review uuid,p_key_hash text,p_request_hash text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE f public.forms;r public.form_deletion_reviews;k public.idempotency_keys;state jsonb;eligible boolean;BEGIN
 IF NOT gdg_security.form_purge_access(p_actor,p_session) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_review IS NULL OR p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$' OR(p_request_hash IS NOT NULL AND p_request_hash!~'^[a-f0-9]{64}$') THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 SELECT * INTO f FROM public.forms WHERE id=p_form;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT * INTO k FROM public.idempotency_keys WHERE scope='forms.permanent_delete:'||p_actor||':'||p_session||':'||p_form AND key_hash=p_key_hash;
 IF FOUND THEN
  IF k.result->>'formId' IS DISTINCT FROM p_form::text OR k.result->>'reviewId' IS DISTINCT FROM p_review::text OR(p_request_hash IS NOT NULL AND k.request_hash IS DISTINCT FROM p_request_hash) THEN RAISE EXCEPTION 'CONFLICT';END IF;
  IF k.expires_at<=now() THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  RETURN jsonb_build_object('formId',p_form,'reviewId',p_review,'committed',true,'canRetry',false,'revision',f.draft_revision,'reviewExpiresAt',NULL,'receipt',jsonb_build_object('formId',p_form,'reviewId',p_review,'deleted',true));
 END IF;
 IF f.permanently_deleted_at IS NOT NULL THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT * INTO r FROM public.form_deletion_reviews WHERE id=p_review AND form_id=p_form AND actor_id=p_actor AND session_id=p_session;
 IF NOT FOUND THEN RAISE EXCEPTION 'FORM_DELETION_REVIEW';END IF;
 state:=gdg_security.form_deletion_state(p_form);
 eligible:=r.used_at IS NULL AND r.expires_at>now() AND r.snapshot_hash=encode(sha256(convert_to(state::text,'UTF8')),'hex') AND f.state='Archived' AND NOT gdg_security.form_held(p_form)
  AND NOT EXISTS(SELECT 1 FROM public.form_responses WHERE form_id=p_form AND(status='held' OR gdg_security.form_held(p_form,id)))
  AND NOT EXISTS(SELECT 1 FROM public.form_responses WHERE form_id=p_form AND deleted_at IS NULL AND retention_expires_at>now())
  AND NOT EXISTS(SELECT 1 FROM public.form_integrations WHERE form_id=p_form AND gdg_security.form_integration_active(resource_kind,resource_id));
 RETURN jsonb_build_object('formId',p_form,'reviewId',p_review,'committed',false,'canRetry',eligible,'revision',f.draft_revision,'reviewExpiresAt',r.expires_at,'receipt',NULL);
END $$;
ALTER FUNCTION public.permanently_delete_form(uuid,uuid,text,uuid,integer,uuid,text,text,boolean,text,text,uuid) RENAME TO permanently_delete_form_before_replay;
CREATE FUNCTION public.permanently_delete_form(p_actor uuid,p_session uuid,p_verified_hash text,p_form uuid,p_revision integer,p_review uuid,p_token_hash text,p_confirmation text,p_export_warning boolean,p_key_hash text,p_request_hash text,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE inspected jsonb;result jsonb;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));
 PERFORM 1 FROM public.admin_users WHERE id=p_actor FOR UPDATE;
 PERFORM 1 FROM public.admin_sessions WHERE id=p_session AND admin_user_id=p_actor FOR UPDATE;
 PERFORM 1 FROM public.forms WHERE id=p_form FOR UPDATE;
 IF NOT gdg_security.form_purge_access(p_actor,p_session) OR NOT EXISTS(SELECT 1 FROM public.admin_users WHERE id=p_actor AND password_hash=p_verified_hash) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 inspected:=public.inspect_form_deletion_write(p_actor,p_session,p_form,p_review,p_key_hash,p_request_hash);
 IF(inspected->>'committed')::boolean THEN RETURN inspected->'receipt';END IF;
 -- The original five-minute review, exact snapshot, current proof and erasure
 -- transaction remain authoritative. No inspector can authorize expired review.
 result:=public.permanently_delete_form_before_replay(p_actor,p_session,p_verified_hash,p_form,p_revision,p_review,p_token_hash,p_confirmation,p_export_warning,p_key_hash,p_request_hash,p_request_id);
 UPDATE public.idempotency_keys k SET result=k.result||jsonb_build_object('reviewId',p_review) WHERE k.scope='forms.permanent_delete:'||p_actor||':'||p_session||':'||p_form AND key_hash=p_key_hash;
 RETURN result||jsonb_build_object('reviewId',p_review);
END $$;
REVOKE ALL ON FUNCTION public.inspect_form_deletion_write(uuid,uuid,uuid,uuid,text,text),public.permanently_delete_form(uuid,uuid,text,uuid,integer,uuid,text,text,boolean,text,text,uuid),public.permanently_delete_form_before_replay(uuid,uuid,text,uuid,integer,uuid,text,text,boolean,text,text,uuid) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.inspect_form_deletion_write(uuid,uuid,uuid,uuid,text,text),public.permanently_delete_form(uuid,uuid,text,uuid,integer,uuid,text,text,boolean,text,text,uuid),public.permanently_delete_form_before_replay(uuid,uuid,text,uuid,integer,uuid,text,text,boolean,text,text,uuid) TO service_role;
COMMIT;
