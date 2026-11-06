BEGIN;
CREATE OR REPLACE FUNCTION public.inspect_person_privacy_write(p_actor uuid,p_session uuid,p_kind text,p_document jsonb,p_token_hash text,p_key_hash text,p_request_hash text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE account public.admin_users;v public.person_privacy_reviews;k public.idempotency_keys;r jsonb;retry boolean;BEGIN
 IF NOT gdg_security.member_transfer_session(p_actor,p_session) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT * INTO account FROM public.admin_users WHERE id=p_actor AND role='super_admin';IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_kind='commit' THEN
  SELECT * INTO v FROM public.person_privacy_reviews WHERE id=(p_document->>'reviewId')::uuid AND actor_id=p_actor AND session_id=p_session AND token_hash=p_token_hash;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 END IF;
 IF p_kind IS NULL OR p_kind NOT IN('review','commit') OR p_token_hash IS NULL OR p_token_hash!~'^[a-f0-9]{64}$' OR p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$' OR p_request_hash IS NULL OR p_request_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 SELECT * INTO k FROM public.idempotency_keys WHERE scope='person-privacy-write:'||p_actor||':'||p_session||':'||p_kind AND key_hash=p_key_hash;
 IF FOUND THEN
  IF k.request_hash IS DISTINCT FROM p_request_hash THEN RAISE EXCEPTION 'CONFLICT';END IF;
  IF k.expires_at<=now() THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
 END IF;
 IF p_kind='review' THEN
  retry:=true;
  IF k.key_hash IS NOT NULL THEN
   SELECT * INTO v FROM public.person_privacy_reviews WHERE id=(k.result->>'reviewId')::uuid AND actor_id=p_actor AND session_id=p_session AND token_hash=p_token_hash;
   IF v.id IS NULL OR v.used_at IS NOT NULL OR v.expires_at<=now() OR v.password_hash IS DISTINCT FROM account.password_hash THEN RAISE EXCEPTION 'PRIVACY_REVIEW_REQUIRED';END IF;
   IF v.subject_hash IS DISTINCT FROM p_document->>'subjectHash' OR v.purpose_hash IS DISTINCT FROM p_document->>'purposeHash' OR v.action IS DISTINCT FROM p_document->>'action' OR v.records IS DISTINCT FROM gdg_security.person_privacy_inventory(p_document->>'email',v.response_ids,v.form_hashes) THEN RAISE EXCEPTION 'PRIVACY_REVIEW_CHANGED';END IF;
   r:=jsonb_build_object('reviewId',v.id,'action',v.action,'expiresAt',v.expires_at,'count',v.record_count,'heldCount',(SELECT count(*) FROM jsonb_array_elements(v.records) x WHERE(x->>'held')::boolean),'records',(SELECT coalesce(jsonb_agg(x-'fingerprint'),'[]') FROM jsonb_array_elements(v.records) x));
  END IF;
 ELSE
  retry:=v.used_at IS NULL AND v.expires_at>now() AND v.records IS NOT DISTINCT FROM gdg_security.person_privacy_inventory(p_document->>'email',v.response_ids,v.form_hashes) AND v.password_hash IS NOT DISTINCT FROM account.password_hash AND p_document->>'confirmation'=upper(v.action)||' '||v.record_count||' RECORDS' AND (v.action='export' OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v.records) x WHERE(x->>'held')::boolean));
  IF k.key_hash IS NOT NULL THEN r:=k.result;END IF;
 END IF;
 RETURN jsonb_build_object('committed',k.key_hash IS NOT NULL,'canRetry',coalesce(k.key_hash IS NULL AND retry,false),'receipt',r);
END $$;
CREATE OR REPLACE FUNCTION public.mutate_person_privacy_write(p_actor uuid,p_session uuid,p_kind text,p_document jsonb,p_token_hash text,p_verified_hash text,p_key_hash text,p_request_hash text,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE inspected jsonb;r jsonb;retained jsonb;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('team-administration',0));PERFORM pg_advisory_xact_lock(hashtextextended('newsletter-workspace',0));PERFORM pg_advisory_xact_lock(hashtextextended('contact-uploads',0));
 PERFORM 1 FROM public.admin_users WHERE id=p_actor FOR UPDATE;PERFORM 1 FROM public.admin_sessions WHERE id=p_session AND admin_user_id=p_actor FOR UPDATE;
 inspected:=public.inspect_person_privacy_write(p_actor,p_session,p_kind,p_document,p_token_hash,p_key_hash,p_request_hash);
 IF(inspected->>'committed')::boolean THEN RETURN inspected->'receipt';END IF;
 IF p_kind='review' THEN
  r:=public.review_person_privacy(p_actor,p_session,p_verified_hash,p_document->>'email',p_document->>'encryptedEmail',p_document->>'subjectHash',p_document->>'action',ARRAY(SELECT jsonb_array_elements_text(p_document->'responseIds'))::uuid[],p_document->'formHashes',(p_document->>'includeSensitive')::boolean,p_token_hash,p_document->>'purposeHash',p_request_id);
  retained:=jsonb_build_object('reviewId',r->'reviewId');
 ELSE
  r:=public.commit_person_privacy(p_actor,p_session,p_verified_hash,(p_document->>'reviewId')::uuid,p_token_hash,p_document->>'email',p_document->>'confirmation',p_key_hash,p_request_hash,p_request_id);
  retained:=r-'export';IF r->>'action'='export' THEN retained:=retained||jsonb_build_object('downloadExpired',true);END IF;
 END IF;
 INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result)VALUES('person-privacy-write:'||p_actor||':'||p_session||':'||p_kind,p_key_hash,p_request_hash,200,retained);
 RETURN r;
END $$;
COMMIT;
