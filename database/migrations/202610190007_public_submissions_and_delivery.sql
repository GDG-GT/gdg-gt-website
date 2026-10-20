BEGIN;
ALTER TABLE public.newsletter_subscribers DROP COLUMN confirmation_token,DROP COLUMN unsubscribe_token,
 ADD COLUMN state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','active','unsubscribed')),
 ADD COLUMN consent_at timestamptz,ADD COLUMN unsubscribed_at timestamptz;
ALTER TABLE public.newsletter_subscribers ADD CONSTRAINT subscribers_normalized_email CHECK(email=lower(btrim(email)));
CREATE UNIQUE INDEX subscribers_normalized_email_key ON public.newsletter_subscribers(email);
CREATE TABLE public.newsletter_tokens(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),subscriber_id uuid NOT NULL REFERENCES public.newsletter_subscribers(id) ON DELETE CASCADE,
 purpose text NOT NULL CHECK(purpose IN ('confirm','unsubscribe')),token_hash text NOT NULL UNIQUE CHECK(token_hash~'^[a-f0-9]{64}$'),
 expires_at timestamptz NOT NULL,consumed_at timestamptz,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.newsletter_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_jobs ADD COLUMN secret_payload text,ADD COLUMN lease_token uuid,ADD COLUMN completed_at timestamptz,
 ADD COLUMN provider_message_id text;
CREATE FUNCTION public.subscribe_newsletter(p_email text,p_name text,p_key_hash text,p_request_hash text,
 p_token_hash text,p_secret_payload text) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v public.newsletter_subscribers;v_key public.idempotency_keys;v_token uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('newsletter:'||p_email,0));
 SELECT * INTO v_key FROM public.idempotency_keys WHERE scope='newsletter.subscribe' AND key_hash=p_key_hash FOR UPDATE;
 IF FOUND THEN IF v_key.request_hash<>p_request_hash THEN RAISE EXCEPTION 'INVALID_STATE';END IF;RETURN;END IF;
 SELECT * INTO v FROM public.newsletter_subscribers WHERE email=p_email FOR UPDATE;
 IF NOT FOUND THEN
  INSERT INTO public.newsletter_subscribers(email,name,is_active,state,consent_at) VALUES(p_email,p_name,false,'pending',now()) RETURNING * INTO v;
 END IF;
 IF v.state<>'active' AND NOT EXISTS(SELECT 1 FROM public.newsletter_tokens WHERE subscriber_id=v.id AND purpose='confirm'
  AND consumed_at IS NULL AND created_at>now()-interval '15 minutes') THEN
  UPDATE public.newsletter_subscribers SET state='pending',is_active=false,consent_at=now(),updated_at=now() WHERE id=v.id;
  UPDATE public.newsletter_tokens SET consumed_at=now() WHERE subscriber_id=v.id AND purpose='confirm' AND consumed_at IS NULL;
  INSERT INTO public.newsletter_tokens(subscriber_id,purpose,token_hash,expires_at) VALUES(v.id,'confirm',p_token_hash,now()+interval '24 hours') RETURNING id INTO v_token;
  INSERT INTO public.delivery_jobs(kind,deduplication_key,payload,secret_payload)
   VALUES('newsletter_confirmation','newsletter-confirm:'||v_token,jsonb_build_object('subscriberId',v.id,'tokenId',v_token),p_secret_payload);
 END IF;
 INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status) VALUES('newsletter.subscribe',p_key_hash,p_request_hash,200);
END $$;
CREATE FUNCTION public.consume_newsletter_token(p_hash text,p_purpose text) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v public.newsletter_tokens;
BEGIN
 SELECT * INTO v FROM public.newsletter_tokens WHERE token_hash=p_hash AND purpose=p_purpose FOR UPDATE;
 IF NOT FOUND OR v.expires_at<=now() THEN RETURN false;END IF;
 IF v.consumed_at IS NOT NULL THEN RETURN p_purpose='unsubscribe';END IF;
 UPDATE public.newsletter_tokens SET consumed_at=now() WHERE id=v.id;
 IF p_purpose='confirm' THEN
  UPDATE public.newsletter_subscribers SET state='active',is_active=true,confirmed_at=now(),updated_at=now() WHERE id=v.subscriber_id AND state='pending';
 ELSE
  UPDATE public.newsletter_subscribers SET state='unsubscribed',is_active=false,unsubscribed_at=now(),updated_at=now() WHERE id=v.subscriber_id;
  UPDATE public.newsletter_tokens SET consumed_at=now() WHERE subscriber_id=v.subscriber_id AND consumed_at IS NULL;
 END IF;
 RETURN true;
END $$;
CREATE FUNCTION public.submit_contact(p_document jsonb,p_key_hash text,p_request_hash text) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v public.contact_submissions;v_id uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('contact:'||p_key_hash,0));
 SELECT * INTO v FROM public.contact_submissions WHERE idempotency_key_hash=p_key_hash;
 IF FOUND THEN IF v.request_hash<>p_request_hash THEN RAISE EXCEPTION 'INVALID_STATE';END IF;RETURN v.id;END IF;
 INSERT INTO public.contact_submissions(name,email,inquiry_type,message,interests,idempotency_key_hash,request_hash)
 VALUES(p_document->>'name',p_document->>'email',p_document->>'type',p_document->>'message',
  ARRAY(SELECT jsonb_array_elements_text(coalesce(p_document->'interests','[]'::jsonb))),p_key_hash,p_request_hash) RETURNING id INTO v_id;
 INSERT INTO public.delivery_jobs(kind,deduplication_key,payload) VALUES
  ('contact_acknowledgment','contact-ack:'||v_id,jsonb_build_object('contactId',v_id)),
  ('contact_notification','contact-notify:'||v_id,jsonb_build_object('contactId',v_id));
 RETURN v_id;
END $$;
CREATE FUNCTION public.claim_delivery_jobs(p_limit integer) RETURNS SETOF public.delivery_jobs
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid batch' USING ERRCODE='22023';END IF;
 RETURN QUERY WITH due AS (
  SELECT id FROM public.delivery_jobs WHERE (state='pending' AND next_attempt_at<=now()) OR
   (state='running' AND locked_until<now() AND attempt_count<8) ORDER BY next_attempt_at FOR UPDATE SKIP LOCKED LIMIT p_limit
 ) UPDATE public.delivery_jobs j SET state='running',attempt_count=attempt_count+1,locked_until=now()+interval '5 minutes',
  lease_token=gen_random_uuid(),updated_at=now() FROM due WHERE j.id=due.id RETURNING j.*;
END $$;
CREATE FUNCTION public.finish_delivery_job(p_id uuid,p_lease uuid,p_success boolean,p_provider_id text,p_error_code text) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 UPDATE public.delivery_jobs SET state=CASE WHEN p_success THEN 'completed' WHEN attempt_count>=8 THEN 'dead' ELSE 'pending' END,
  next_attempt_at=now()+make_interval(secs=>least(3600,power(2,attempt_count)::integer*30)),
  locked_until=NULL,lease_token=NULL,completed_at=CASE WHEN p_success THEN now() ELSE NULL END,
  provider_message_id=p_provider_id,last_error_code=CASE WHEN p_success THEN NULL ELSE p_error_code END,
  secret_payload=CASE WHEN p_success THEN NULL ELSE secret_payload END,updated_at=now()
  WHERE id=p_id AND lease_token=p_lease AND state='running' AND locked_until>now();
 RETURN FOUND;
END $$;
REVOKE ALL ON public.newsletter_tokens FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.newsletter_tokens TO service_role;
REVOKE ALL ON FUNCTION public.subscribe_newsletter(text,text,text,text,text,text),public.consume_newsletter_token(text,text),
 public.submit_contact(jsonb,text,text),public.claim_delivery_jobs(integer),public.finish_delivery_job(uuid,uuid,boolean,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.subscribe_newsletter(text,text,text,text,text,text),public.consume_newsletter_token(text,text),
 public.submit_contact(jsonb,text,text),public.claim_delivery_jobs(integer),public.finish_delivery_job(uuid,uuid,boolean,text,text) TO service_role;
COMMIT;
