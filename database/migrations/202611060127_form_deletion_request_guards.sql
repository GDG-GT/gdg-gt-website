BEGIN;
-- Mutation request hashes remain mandatory even for an accepted replay. Only
-- the separate read-only inspector deliberately accepts an absent body hash.
CREATE OR REPLACE FUNCTION public.permanently_delete_form(p_actor uuid,p_session uuid,p_verified_hash text,p_form uuid,p_revision integer,p_review uuid,p_token_hash text,p_confirmation text,p_export_warning boolean,p_key_hash text,p_request_hash text,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE inspected jsonb;result jsonb;BEGIN
 IF p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$' OR p_request_hash IS NULL OR p_request_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
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
REVOKE ALL ON FUNCTION public.permanently_delete_form(uuid,uuid,text,uuid,integer,uuid,text,text,boolean,text,text,uuid) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.permanently_delete_form(uuid,uuid,text,uuid,integer,uuid,text,text,boolean,text,text,uuid) TO service_role;
COMMIT;
