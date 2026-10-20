BEGIN;
CREATE OR REPLACE FUNCTION public.save_form_draft(p_form uuid,p_version uuid,p_hash text,p_answers jsonb,p_access uuid,p_actor uuid,p_upload_hash text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE field jsonb;file_id uuid;v_draft_id uuid;
BEGIN
 PERFORM public.save_form_draft(p_form,p_version,p_hash,p_answers,p_access,p_actor);
 SELECT id INTO v_draft_id FROM public.form_response_drafts WHERE resume_token_hash=p_hash AND form_id=p_form;
 FOR field IN SELECT value FROM public.form_versions,jsonb_array_elements(definition->'fields') WHERE id=p_version AND value->>'type'='file' LOOP
  FOR file_id IN SELECT jsonb_array_elements_text(coalesce(p_answers->(field->>'id'),'[]'))::uuid LOOP
   UPDATE public.form_uploads SET draft_id=v_draft_id WHERE id=file_id AND form_id=p_form AND version_id=p_version
    AND field_id=(field->>'id')::uuid AND scan_state='clean' AND upload_token_hash=p_upload_hash AND response_id IS NULL AND deleted_at IS NULL;
   IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_UPLOAD';END IF;
  END LOOP;
 END LOOP;
END $$;
COMMIT;
