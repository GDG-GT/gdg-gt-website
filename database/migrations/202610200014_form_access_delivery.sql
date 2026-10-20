BEGIN;
CREATE UNIQUE INDEX form_active_recipient_token ON public.form_access_tokens(form_id,token_type,email_hash)
 WHERE revoked_at IS NULL AND email_hash IS NOT NULL;
CREATE FUNCTION public.queue_form_access(p_actor uuid,p_form uuid,p_type text,p_recipients jsonb,p_key_hash text,p_request_hash text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE f public.forms;k public.idempotency_keys;recipient jsonb;old public.form_access_tokens;created uuid;ids jsonb:='[]';queued integer:=0;result jsonb;
BEGIN
 SELECT * INTO f FROM public.forms WHERE id=p_form FOR UPDATE;
 IF NOT FOUND OR NOT public.can_operate_form(p_actor,p_form,'manage_access') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF f.published_version_id IS NULL OR f.state='Archived' OR p_type NOT IN ('invited','unlisted') OR f.access_mode<>p_type THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
 IF jsonb_array_length(p_recipients) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid batch' USING ERRCODE='22023';END IF;
 SELECT * INTO k FROM public.idempotency_keys WHERE scope='forms.access:'||p_form AND key_hash=p_key_hash;
 IF FOUND THEN IF k.request_hash<>p_request_hash THEN RAISE EXCEPTION 'INVALID_STATE';END IF;RETURN k.result;END IF;
 FOR recipient IN SELECT value FROM jsonb_array_elements(p_recipients) LOOP
  SELECT * INTO old FROM public.form_access_tokens WHERE form_id=f.id AND token_type=p_type AND email_hash=recipient->>'emailHash' AND revoked_at IS NULL FOR UPDATE;
  IF FOUND THEN ids:=ids||jsonb_build_array(old.id);CONTINUE;END IF;
  INSERT INTO public.form_access_tokens(form_id,token_type,token_hash,intended_email_encrypted,email_hash,use_limit,expires_at)
  VALUES(f.id,p_type,recipient->>'tokenHash',recipient->>'emailEncrypted',recipient->>'emailHash',CASE WHEN p_type='invited' THEN 1 ELSE 1000000 END,
   least((recipient->>'expiresAt')::timestamptz,now()+interval '30 days')) RETURNING id INTO created;
  INSERT INTO public.delivery_jobs(kind,deduplication_key,payload,secret_payload) VALUES('form_access','form-access:'||created||':'||(recipient->>'tokenHash'),
   jsonb_build_object('formId',f.id,'tokenId',created,'tokenHash',recipient->>'tokenHash'),recipient->>'secretEncrypted');
  ids:=ids||jsonb_build_array(created);queued:=queued+1;
 END LOOP;
 result:=jsonb_build_object('tokenIds',ids,'queued',queued);
 INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result) VALUES('forms.access:'||p_form,p_key_hash,p_request_hash,200,result);
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata) VALUES(p_actor,'forms.access_queued','form',p_form,p_request_id,jsonb_build_object('count',queued,'type',p_type));
 RETURN result;
END $$;
CREATE FUNCTION public.change_form_access(p_actor uuid,p_form uuid,p_id uuid,p_action text,p_token_hash text,p_secret text,p_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE f public.forms;t public.form_access_tokens;
BEGIN
 SELECT * INTO f FROM public.forms WHERE id=p_form FOR UPDATE;
 IF NOT FOUND OR NOT public.can_operate_form(p_actor,p_form,'manage_access') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT * INTO t FROM public.form_access_tokens WHERE id=p_id AND form_id=p_form FOR UPDATE;
 IF NOT FOUND OR t.token_type NOT IN ('invited','unlisted') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_action='revoke' THEN
  UPDATE public.form_access_tokens SET revoked_at=coalesce(revoked_at,now()),delivery_state='revoked' WHERE id=t.id;
 ELSIF p_action='resend' THEN
  IF t.used_count>0 OR t.revoked_at IS NOT NULL OR f.state='Archived' OR f.access_mode<>t.token_type THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  IF t.last_sent_at>now()-interval '1 minute' THEN RAISE EXCEPTION 'RESEND_COOLDOWN';END IF;
  UPDATE public.form_access_tokens SET token_hash=p_token_hash,expires_at=now()+interval '7 days',delivery_state='pending',last_sent_at=now() WHERE id=t.id;
  INSERT INTO public.delivery_jobs(kind,deduplication_key,payload,secret_payload) VALUES('form_access','form-access:'||t.id||':'||p_token_hash,
   jsonb_build_object('formId',f.id,'tokenId',t.id,'tokenHash',p_token_hash),p_secret);
 ELSE RAISE EXCEPTION 'INVALID_STATE';END IF;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata) VALUES(p_actor,'forms.access_'||p_action,'form',p_form,p_request_id,jsonb_build_object('tokenId',t.id));
END $$;
CREATE FUNCTION public.request_form_verification(p_form uuid,p_email_hash text,p_email_encrypted text,p_token_hash text,p_secret text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE f public.forms;t public.form_access_tokens;new_id uuid;
BEGIN
 SELECT * INTO f FROM public.forms WHERE id=p_form FOR UPDATE;
 IF NOT FOUND OR f.access_mode<>'verified' OR f.published_version_id IS NULL OR f.state NOT IN ('Open','Scheduled') OR f.closes_at<=now() THEN RETURN;END IF;
 SELECT * INTO t FROM public.form_access_tokens WHERE form_id=f.id AND token_type='verified' AND email_hash=p_email_hash AND revoked_at IS NULL FOR UPDATE;
 IF FOUND AND t.created_at>now()-interval '15 minutes' AND t.used_count=0 THEN RETURN;END IF;
 IF FOUND THEN UPDATE public.form_access_tokens SET revoked_at=now() WHERE id=t.id;END IF;
 INSERT INTO public.form_access_tokens(form_id,token_type,token_hash,intended_email_encrypted,email_hash,expires_at)
 VALUES(f.id,'verified',p_token_hash,p_email_encrypted,p_email_hash,now()+interval '24 hours') RETURNING id INTO new_id;
 INSERT INTO public.delivery_jobs(kind,deduplication_key,payload,secret_payload) VALUES('form_access','form-access:'||new_id||':'||p_token_hash,
  jsonb_build_object('formId',f.id,'tokenId',new_id,'tokenHash',p_token_hash),p_secret);
END $$;
REVOKE ALL ON FUNCTION public.queue_form_access(uuid,uuid,text,jsonb,text,text,uuid),public.change_form_access(uuid,uuid,uuid,text,text,text,uuid),
 public.request_form_verification(uuid,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.queue_form_access(uuid,uuid,text,jsonb,text,text,uuid),public.change_form_access(uuid,uuid,uuid,text,text,text,uuid),
 public.request_form_verification(uuid,text,text,text,text) TO service_role;
COMMIT;
