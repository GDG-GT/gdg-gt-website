BEGIN;
-- No credential or email address is copied into the general delivery payload.
CREATE FUNCTION gdg_security.reward_email_created() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE address text;
BEGIN
 SELECT lower(email) INTO address FROM public.members WHERE id=NEW.member_id AND is_active AND deleted_at IS NULL AND merged_into_id IS NULL;
 IF address IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 INSERT INTO public.delivery_jobs(kind,deduplication_key,payload) VALUES('reward_credential_email','reward-credential:'||NEW.id,
  jsonb_build_object('credentialId',NEW.id,'recipientHash',encode(sha256(convert_to(address,'UTF8')),'hex')));
 RETURN NEW;
END $$;
CREATE TRIGGER reward_credential_email_created AFTER INSERT ON public.reward_credentials FOR EACH ROW EXECUTE FUNCTION gdg_security.reward_email_created();

CREATE FUNCTION public.reward_email_status(p_actor uuid,p_session uuid,p_member uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 PERFORM gdg_security.reward_admin(p_actor,p_session);
 RETURN (SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') FROM (
  SELECT c.id AS "credentialId",right(replace(c.id::text,'-',''),4) AS reference,
   j.state,j.updated_at AS "updatedAt",j.provider_message_id IS NOT NULL AS "providerAccepted"
  FROM public.reward_credentials c LEFT JOIN LATERAL (
   SELECT state,updated_at,provider_message_id FROM public.delivery_jobs WHERE kind='reward_credential_email' AND payload->>'credentialId'=c.id::text ORDER BY created_at DESC,id DESC LIMIT 1
  ) j ON true WHERE c.member_id=p_member ORDER BY c.created_at DESC LIMIT 100
 ) x);
END $$;

CREATE FUNCTION public.queue_reward_credential_email(p_actor uuid,p_session uuid,p_credential uuid,p_key_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c public.reward_credentials;m public.members;j public.delivery_jobs;r jsonb;receipt public.reward_receipts;fingerprint text;
BEGIN
 PERFORM gdg_security.reward_admin(p_actor,p_session);
 IF p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('reward-email:'||p_credential,0));
 fingerprint:=encode(sha256(convert_to(p_credential::text,'UTF8')),'hex');
 SELECT * INTO receipt FROM public.reward_receipts WHERE actor=p_actor||':credential-email' AND key_hash=p_key_hash;
 IF FOUND THEN IF receipt.request_hash<>fingerprint THEN RAISE EXCEPTION 'CONFLICT';END IF;RETURN receipt.result;END IF;
 SELECT * INTO c FROM public.reward_credentials WHERE id=p_credential AND revoked_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT * INTO m FROM public.members WHERE id=c.member_id AND is_active AND deleted_at IS NULL AND merged_into_id IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT * INTO j FROM public.delivery_jobs WHERE kind='reward_credential_email' AND payload->>'credentialId'=c.id::text AND created_at>now()-interval '1 minute' ORDER BY created_at DESC LIMIT 1;
 IF NOT FOUND THEN
  IF(SELECT count(*) FROM public.delivery_jobs WHERE kind='reward_credential_email' AND payload->>'credentialId'=c.id::text AND created_at>now()-interval '24 hours')>=5 THEN RAISE EXCEPTION 'RATE_LIMITED';END IF;
  INSERT INTO public.delivery_jobs(kind,deduplication_key,payload) VALUES('reward_credential_email','reward-credential-resend:'||c.id||':'||p_key_hash,
   jsonb_build_object('credentialId',c.id,'recipientHash',encode(sha256(convert_to(lower(m.email),'UTF8')),'hex'))) RETURNING * INTO j;
 END IF;
 r:=jsonb_build_object('id',j.id,'credentialId',c.id,'state',j.state);
 INSERT INTO public.reward_receipts(actor,key_hash,request_hash,result) VALUES(p_actor||':credential-email',p_key_hash,fingerprint,r);
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,result) VALUES(p_actor,'reward.credential_email','reward_credentials',c.id,'success');
 RETURN r;
END $$;

-- Reused for the worker and the limited emailed pass capability. No account access.
CREATE FUNCTION public.reward_email_pass(p_job uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('id',c.id,'kind',c.kind,'label',c.label,'encryptedToken',c.encrypted_token,'name',m.name,'email',m.email,'createdAt',j.created_at)
 FROM public.delivery_jobs j JOIN public.reward_credentials c ON c.id::text=j.payload->>'credentialId'
 JOIN public.members m ON m.id=c.member_id
 WHERE j.id=p_job AND j.kind='reward_credential_email' AND j.created_at>now()-interval '7 days'
 AND j.created_at<=now() AND c.revoked_at IS NULL AND m.is_active AND m.deleted_at IS NULL AND m.merged_into_id IS NULL
 AND j.payload->>'recipientHash'=encode(sha256(convert_to(lower(m.email),'UTF8')),'hex');
$$;
CREATE FUNCTION public.prepare_reward_credential_email(p_job uuid,p_lease uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 PERFORM 1 FROM public.delivery_jobs WHERE id=p_job AND lease_token=p_lease AND kind='reward_credential_email' AND state='running' AND locked_until>now() AND created_at>now()-interval '24 hours' FOR SHARE;
 IF NOT FOUND THEN RETURN NULL;END IF;
 RETURN public.reward_email_pass(p_job);
END $$;
CREATE OR REPLACE FUNCTION public.claim_delivery_jobs(p_limit integer) RETURNS SETOF public.delivery_jobs LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT * FROM public.claim_worker_jobs(p_limit,ARRAY['event_confirmation','event_message','event_push_verification','newsletter_confirmation','contact_acknowledgment','contact_notification',
 'form_access','form_response_notification','form_reviewed_email','form_respondent_copy','account_access','team_invite','team_announcement','task_notification','direct_message_notice','chapter_announcement','reward_credential_email']);
$$;
REVOKE ALL ON FUNCTION gdg_security.reward_email_created() FROM PUBLIC,anon,authenticated,gdg_realtime;
REVOKE ALL ON FUNCTION public.reward_email_status(uuid,uuid,uuid),public.queue_reward_credential_email(uuid,uuid,uuid,text),public.reward_email_pass(uuid),public.prepare_reward_credential_email(uuid,uuid) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION gdg_security.reward_email_created(),public.reward_email_status(uuid,uuid,uuid),public.queue_reward_credential_email(uuid,uuid,uuid,text),public.reward_email_pass(uuid),public.prepare_reward_credential_email(uuid,uuid) TO service_role;
CREATE INDEX reward_credential_mail_jobs ON public.delivery_jobs((payload->>'credentialId'),created_at DESC) WHERE kind='reward_credential_email';
COMMIT;
