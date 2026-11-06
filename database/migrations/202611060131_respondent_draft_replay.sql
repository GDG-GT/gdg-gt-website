BEGIN;
ALTER TABLE public.form_response_drafts ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK(revision>=1);
CREATE FUNCTION gdg_security.advance_respondent_draft_revision() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN NEW.id:=OLD.id;NEW.revision:=OLD.revision+1;RETURN NEW;END $$;
CREATE TRIGGER advance_respondent_draft_revision BEFORE UPDATE ON public.form_response_drafts FOR EACH ROW EXECUTE FUNCTION gdg_security.advance_respondent_draft_revision();
CREATE FUNCTION public.inspect_identified_form_draft(p_document jsonb,p_session uuid,p_key_hash text,p_request_hash text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE f public.forms;d public.form_response_drafts;k public.idempotency_keys;actor uuid:=(p_document->>'actor')::uuid;access uuid:=(p_document->>'access')::uuid;proof text:=p_document->>'hash';BEGIN
 IF proof IS NULL OR proof!~'^[a-f0-9]{64}$' OR p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$' OR p_request_hash IS NULL OR p_request_hash!~'^[a-f0-9]{64}$' OR(p_document->>'revision') IS NULL OR(p_document->>'revision')::integer<0 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 SELECT * INTO f FROM public.forms WHERE id=(p_document->>'form')::uuid;
 IF NOT FOUND OR f.permanently_deleted_at IS NOT NULL OR f.state IN('Draft','Archived') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF f.access_mode='internal' THEN
  IF NOT gdg_security.member_transfer_session(actor,p_session) OR(f.team_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.admin_users WHERE id=actor AND role IN('admin','super_admin')) AND NOT EXISTS(SELECT 1 FROM public.team_memberships m JOIN public.admin_teams t ON t.id=m.team_id WHERE m.admin_user_id=actor AND m.team_id=f.team_id AND m.is_active AND t.is_active AND t.deleted_at IS NULL)) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 ELSIF f.access_mode<>'public' AND NOT EXISTS(SELECT 1 FROM public.form_access_tokens a WHERE a.id=access AND a.form_id=f.id AND a.token_type=f.access_mode AND a.revoked_at IS NULL AND a.expires_at>now()) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT * INTO d FROM public.form_response_drafts WHERE form_id=f.id AND resume_token_hash=proof;
 IF FOUND AND d.access_token_id IS DISTINCT FROM access THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT * INTO k FROM public.idempotency_keys WHERE scope='respondent-draft:'||f.id||':'||proof AND key_hash=p_key_hash;
 IF FOUND THEN
  IF k.request_hash IS DISTINCT FROM p_request_hash THEN RAISE EXCEPTION 'CONFLICT';END IF;
  IF k.expires_at<=now() THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
 END IF;
 RETURN jsonb_build_object('committed',k.key_hash IS NOT NULL,'canRetry',coalesce(k.key_hash IS NULL AND f.published_version_id=(p_document->>'version')::uuid AND f.state IN('Open','Scheduled') AND(f.opens_at IS NULL OR f.opens_at<=now()) AND(f.closes_at IS NULL OR f.closes_at>now()) AND coalesce((f.settings->>'resume')::boolean,false) AND coalesce(d.revision,0)=(p_document->>'revision')::integer AND(d.id IS NULL OR d.completed_at IS NULL AND d.expires_at>now()) AND(f.access_mode IN('public','internal') OR EXISTS(SELECT 1 FROM public.form_access_tokens WHERE id=access AND used_count<use_limit)),false),
  'currentRevision',coalesce(d.revision,0),'receipt',CASE WHEN k.key_hash IS NULL THEN NULL ELSE k.result END);
END $$;
CREATE FUNCTION public.save_versioned_identified_form_draft(p_document jsonb,p_session uuid,p_key_hash text,p_request_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE inspected jsonb;d public.form_response_drafts;result jsonb;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));
 IF p_document->>'actor' IS NOT NULL THEN PERFORM 1 FROM public.admin_users WHERE id=(p_document->>'actor')::uuid FOR UPDATE;PERFORM 1 FROM public.admin_sessions WHERE id=p_session AND admin_user_id=(p_document->>'actor')::uuid FOR UPDATE;END IF;
 PERFORM 1 FROM public.forms WHERE id=(p_document->>'form')::uuid FOR UPDATE;
 IF p_document->>'access' IS NOT NULL THEN PERFORM 1 FROM public.form_access_tokens WHERE id=(p_document->>'access')::uuid FOR UPDATE;END IF;
 PERFORM 1 FROM public.form_response_drafts WHERE form_id=(p_document->>'form')::uuid AND resume_token_hash=p_document->>'hash' FOR UPDATE;
 inspected:=public.inspect_identified_form_draft(p_document,p_session,p_key_hash,p_request_hash);
 IF(inspected->>'committed')::boolean THEN RETURN inspected->'receipt';END IF;
 IF NOT(inspected->>'canRetry')::boolean THEN RAISE EXCEPTION 'CONFLICT';END IF;
 PERFORM public.save_identified_form_draft(p_document);
 SELECT * INTO d FROM public.form_response_drafts WHERE form_id=(p_document->>'form')::uuid AND resume_token_hash=p_document->>'hash';
 result:=jsonb_build_object('revision',d.revision,'expiresAt',d.expires_at,'createdAt',d.created_at);
 INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result)VALUES('respondent-draft:'||d.form_id||':'||d.resume_token_hash,p_key_hash,p_request_hash,200,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION gdg_security.advance_respondent_draft_revision(),public.inspect_identified_form_draft(jsonb,uuid,text,text),public.save_versioned_identified_form_draft(jsonb,uuid,text,text) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION gdg_security.advance_respondent_draft_revision(),public.inspect_identified_form_draft(jsonb,uuid,text,text),public.save_versioned_identified_form_draft(jsonb,uuid,text,text) TO service_role;
COMMIT;
