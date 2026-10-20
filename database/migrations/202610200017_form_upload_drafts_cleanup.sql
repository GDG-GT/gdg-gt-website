BEGIN;
CREATE FUNCTION public.save_form_draft(p_form uuid,p_version uuid,p_hash text,p_answers jsonb,p_access uuid,p_actor uuid,p_upload_hash text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE field jsonb;file_id uuid;draft_id uuid;
BEGIN
 -- The existing routine checks form access and holds the parent shared lock.
 PERFORM public.save_form_draft(p_form,p_version,p_hash,p_answers,p_access,p_actor);
 SELECT id INTO draft_id FROM public.form_response_drafts WHERE resume_token_hash=p_hash AND form_id=p_form;
 FOR field IN SELECT value FROM public.form_versions,jsonb_array_elements(definition->'fields') WHERE id=p_version AND value->>'type'='file' LOOP
  FOR file_id IN SELECT jsonb_array_elements_text(coalesce(p_answers->(field->>'id'),'[]'))::uuid LOOP
   UPDATE public.form_uploads SET draft_id=save_form_draft.draft_id WHERE id=file_id AND form_id=p_form AND version_id=p_version
    AND field_id=(field->>'id')::uuid AND scan_state='clean' AND upload_token_hash=p_upload_hash AND response_id IS NULL AND deleted_at IS NULL;
   IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_UPLOAD';END IF;
  END LOOP;
 END LOOP;
END $$;
ALTER TABLE public.upload_intents ADD COLUMN purged_at timestamptz;
CREATE FUNCTION public.claim_upload_cleanup(p_limit integer) RETURNS SETOF public.upload_intents
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE candidate uuid;u public.upload_intents;f public.form_uploads;
BEGIN
 IF p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid batch' USING ERRCODE='22023';END IF;
 FOR candidate IN SELECT id FROM public.upload_intents WHERE purpose='form' AND purged_at IS NULL AND created_at<now()-interval '3 minutes'
  AND (deleted_at IS NOT NULL OR expires_at<now()-interval '24 hours' OR (state='rejected' AND completed_at<now()-interval '24 hours'))
  ORDER BY created_at,id LIMIT p_limit LOOP
  SELECT * INTO u FROM public.upload_intents WHERE id=candidate;
  PERFORM 1 FROM public.forms WHERE id=u.form_id FOR UPDATE;
  SELECT * INTO u FROM public.upload_intents WHERE id=candidate FOR UPDATE;
  SELECT * INTO f FROM public.form_uploads WHERE id=candidate FOR UPDATE;
  IF NOT FOUND OR u.purged_at IS NOT NULL THEN CONTINUE;END IF;
  IF f.response_id IS NOT NULL AND f.deleted_at IS NULL THEN CONTINUE;END IF;
  IF f.deleted_at IS NULL AND f.draft_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.form_response_drafts WHERE id=f.draft_id AND expires_at>now() AND completed_at IS NULL) THEN CONTINUE;END IF;
  UPDATE public.upload_intents SET deleted_at=coalesce(deleted_at,now()) WHERE id=u.id RETURNING * INTO u;
  UPDATE public.form_uploads SET deleted_at=coalesce(deleted_at,now()) WHERE id=u.id;
  RETURN NEXT u;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.save_form_draft(uuid,uuid,text,jsonb,uuid,uuid,text),public.claim_upload_cleanup(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_form_draft(uuid,uuid,text,jsonb,uuid,uuid,text),public.claim_upload_cleanup(integer) TO service_role;
COMMIT;
