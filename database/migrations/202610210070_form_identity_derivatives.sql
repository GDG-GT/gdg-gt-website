BEGIN;
CREATE OR REPLACE FUNCTION gdg_security.scrub_form_response_identity(p_response uuid) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE access_id uuid;BEGIN
 SELECT access_token_id INTO access_id FROM public.form_responses WHERE id=p_response;
 UPDATE public.delivery_jobs SET secret_payload=NULL,updated_at=now()
 WHERE kind='form_access' AND payload->>'tokenId'=access_id::text
 AND EXISTS(SELECT 1 FROM public.form_access_tokens WHERE id=access_id AND token_type IN('verified','invited'));
 UPDATE public.form_access_tokens SET intended_email_encrypted=NULL,email_hash=NULL,revoked_at=coalesce(revoked_at,now()) WHERE id=access_id AND token_type IN('verified','invited');
 UPDATE public.form_responses SET identity_hash=NULL,access_token_id=NULL,edit_token_hash=NULL,edit_secret_encrypted=NULL,source_metadata_hash=NULL WHERE id=p_response;
 UPDATE public.form_response_deliveries SET recipient_encrypted=NULL,recipient_admin=CASE WHEN purpose='receipt' THEN NULL ELSE recipient_admin END WHERE response_id=p_response;
 UPDATE public.form_response_holds SET reason='' WHERE response_id=p_response AND NOT held;
 UPDATE public.form_uploads SET deleted_at=coalesce(deleted_at,now()) WHERE response_id=p_response;
 UPDATE public.upload_intents SET deleted_at=coalesce(deleted_at,now()) WHERE id IN(SELECT id FROM public.form_uploads WHERE response_id=p_response);
END $$;
-- Finish already requested privacy actions, but do not destroy retained evidence
-- if a later operational hold now applies to that response.
DO $$ DECLARE r record;BEGIN
 FOR r IN SELECT id FROM public.form_responses WHERE(deleted_at IS NOT NULL OR redacted_at IS NOT NULL) AND NOT gdg_security.form_held(form_id,id) LOOP
  PERFORM gdg_security.scrub_form_response_identity(r.id);
 END LOOP;
END $$;
CREATE FUNCTION public.finish_form_upload_cleanup(p_upload uuid) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN
 PERFORM 1 FROM public.upload_intents WHERE id=p_upload AND purpose='form' AND deleted_at IS NOT NULL FOR UPDATE;
 IF NOT FOUND THEN RETURN false;END IF;
 UPDATE public.form_uploads SET original_filename='[Removed file]' WHERE id=p_upload AND deleted_at IS NOT NULL;
 UPDATE public.upload_intents SET filename='[Removed file]',purged_at=coalesce(purged_at,now()) WHERE id=p_upload;
 RETURN true;END $$;
DO $$ DECLARE f record;BEGIN
 FOR f IN SELECT id FROM public.upload_intents u WHERE purpose='form' AND purged_at IS NOT NULL AND deleted_at IS NOT NULL
  AND NOT EXISTS(SELECT 1 FROM public.form_uploads x WHERE x.id=u.id AND x.response_id IS NOT NULL AND gdg_security.form_held(x.form_id,x.response_id)) LOOP
  PERFORM public.finish_form_upload_cleanup(f.id);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.finish_form_upload_cleanup(uuid) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.finish_form_upload_cleanup(uuid) TO service_role;
COMMIT;
