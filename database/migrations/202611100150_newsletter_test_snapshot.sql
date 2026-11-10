BEGIN;
-- Approving an unchanged campaign advances its revision before the worker runs.
-- Keep a requested self-test valid across that metadata-only transition, while
-- still rechecking content, session, account, password generation and send access.
CREATE OR REPLACE FUNCTION public.prepare_newsletter_delivery(p_job uuid,p_lease uuid,p_unsubscribe_hash text,p_secret_payload text) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.delivery_jobs;r public.newsletter_campaign_recipients;c public.newsletter_campaigns;s public.newsletter_subscribers;t public.newsletter_test_sends;skip text;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('newsletter-workspace',0));
 SELECT * INTO j FROM public.delivery_jobs WHERE id=p_job AND lease_token=p_lease AND kind IN('newsletter_campaign','newsletter_test') AND state='running' AND locked_until>now() FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL;END IF;
 IF j.kind='newsletter_test' THEN
  SELECT * INTO t FROM public.newsletter_test_sends WHERE id=(j.payload->>'testId')::uuid FOR UPDATE;
  SELECT * INTO c FROM public.newsletter_campaigns WHERE id=t.campaign_id;
  IF t.id IS NULL OR t.expires_at<=now() OR c.deleted_at IS NOT NULL OR (c.subject IS DISTINCT FROM t.subject OR c.content IS DISTINCT FROM t.content) OR NOT gdg_security.member_transfer_session(t.actor_id,t.session_id)
   OR NOT EXISTS(SELECT 1 FROM public.admin_users WHERE id=t.actor_id AND email=t.recipient_email AND password_hash=t.verified_hash) OR NOT public.can_operate_newsletter(t.actor_id,c.team_id,'send_email') THEN
   UPDATE public.newsletter_test_sends SET verified_hash=NULL WHERE id=t.id;PERFORM public.finish_delivery_job(j.id,p_lease,true,NULL,NULL);RETURN NULL;
  END IF;
  RETURN jsonb_build_object('test',true,'email',t.recipient_email,'subject','[TEST] '||t.subject,'content',t.content);
 END IF;
 SELECT * INTO c FROM public.newsletter_campaigns WHERE id=(j.payload->>'campaignId')::uuid FOR UPDATE;
 SELECT * INTO r FROM public.newsletter_campaign_recipients WHERE id=(j.payload->>'recipientId')::uuid AND campaign_id=c.id FOR UPDATE;
 SELECT * INTO s FROM public.newsletter_subscribers WHERE id=r.subscriber_id FOR UPDATE;
 IF r.id IS NULL OR r.state<>'queued' THEN PERFORM public.finish_delivery_job(j.id,p_lease,true,NULL,NULL);RETURN NULL;END IF;
 IF c.id IS NULL OR c.status<>'sending' OR c.deleted_at IS NOT NULL OR c.delivery_deadline<=now() THEN skip:='CAMPAIGN_NOT_SENDING';
 ELSIF NOT EXISTS(SELECT 1 FROM public.admin_users WHERE id=c.approved_by AND password_hash=c.approval_password_hash) OR NOT public.can_operate_newsletter(c.approved_by,c.team_id,'send_email') THEN skip:='ACCESS_CHANGED';
 ELSIF s.id IS NULL OR s.email IS DISTINCT FROM r.recipient_email OR s.team_id IS DISTINCT FROM c.team_id OR s.state<>'active' OR NOT s.is_active OR s.deleted_at IS NOT NULL OR s.suppressed_at IS NOT NULL OR s.confirmed_at IS NULL OR s.consent_at IS NULL THEN skip:='RECIPIENT_SUPPRESSED';END IF;
 IF skip IS NOT NULL THEN
  UPDATE public.newsletter_campaign_recipients SET state='skipped',error_code=skip,secret_payload=NULL,updated_at=now() WHERE id=r.id;
  PERFORM public.finish_delivery_job(j.id,p_lease,true,NULL,NULL);RETURN NULL;
 END IF;
 IF r.secret_payload IS NULL THEN
  IF p_unsubscribe_hash IS NULL OR p_unsubscribe_hash!~'^[a-f0-9]{64}$' OR length(coalesce(p_secret_payload,'')) NOT BETWEEN 40 AND 4096 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
  INSERT INTO public.newsletter_tokens(subscriber_id,purpose,token_hash,expires_at) VALUES(s.id,'unsubscribe',p_unsubscribe_hash,now()+interval '365 days');
  UPDATE public.newsletter_campaign_recipients SET secret_payload=p_secret_payload,unsubscribe_hash=p_unsubscribe_hash WHERE id=r.id RETURNING * INTO r;
 END IF;
 UPDATE public.newsletter_campaign_recipients SET attempt_count=j.attempt_count,updated_at=now() WHERE id=r.id;
 RETURN jsonb_build_object('test',false,'email',r.recipient_email,'subject',c.subject,'content',c.content,'secretPayload',r.secret_payload,'unsubscribeHash',r.unsubscribe_hash);
END $$;
COMMIT;
