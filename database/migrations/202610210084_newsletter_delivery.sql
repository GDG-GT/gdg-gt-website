BEGIN;
CREATE TABLE public.newsletter_test_sends(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),campaign_id uuid NOT NULL REFERENCES public.newsletter_campaigns(id),actor_id uuid NOT NULL REFERENCES public.admin_users(id),session_id uuid NOT NULL REFERENCES public.admin_sessions(id),
 revision integer NOT NULL,verified_hash text,recipient_email text NOT NULL,subject text NOT NULL,content text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT now()+interval '15 minutes');
ALTER TABLE public.newsletter_test_sends ENABLE ROW LEVEL SECURITY;REVOKE ALL ON public.newsletter_test_sends FROM PUBLIC,anon,authenticated,gdg_realtime;GRANT ALL ON public.newsletter_test_sends TO service_role;
CREATE FUNCTION public.create_newsletter_test(p_actor uuid,p_session uuid,p_campaign uuid,p_revision integer,p_verified_hash text,p_key_hash text,p_request_hash text,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c public.newsletter_campaigns;k public.idempotency_keys;scope_key text;result jsonb;test uuid;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('newsletter-workspace',0));
 IF NOT gdg_security.member_transfer_session(p_actor,p_session) OR NOT EXISTS(SELECT 1 FROM public.admin_users WHERE id=p_actor AND password_hash=p_verified_hash) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT * INTO c FROM public.newsletter_campaigns WHERE id=p_campaign AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND OR NOT public.can_operate_newsletter(p_actor,c.team_id,'read') OR NOT public.can_operate_newsletter(p_actor,c.team_id,'send_email') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$' OR p_request_hash IS NULL OR p_request_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 scope_key:='newsletter.test:'||p_actor||':'||p_session||':'||c.id;
 SELECT * INTO k FROM public.idempotency_keys WHERE scope=scope_key AND key_hash=p_key_hash;
 IF FOUND THEN IF k.request_hash IS DISTINCT FROM p_request_hash THEN RAISE EXCEPTION 'CONFLICT';END IF;RETURN k.result;END IF;
 IF c.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'CONFLICT';END IF;
 IF(SELECT count(*) FROM public.newsletter_test_sends WHERE actor_id=p_actor AND created_at>now()-interval '24 hours')>=10 THEN RAISE EXCEPTION 'NEWSLETTER_TEST_LIMIT';END IF;
 INSERT INTO public.newsletter_test_sends(campaign_id,actor_id,session_id,revision,verified_hash,recipient_email,subject,content) SELECT c.id,p_actor,p_session,c.revision,p_verified_hash,email,c.subject,c.content FROM public.admin_users WHERE id=p_actor RETURNING id INTO test;
 INSERT INTO public.delivery_jobs(kind,deduplication_key,payload) VALUES('newsletter_test','newsletter_test:'||test,jsonb_build_object('testId',test));
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata) VALUES(p_actor,'newsletter.test_requested','newsletter_campaign',c.id,p_request_id,jsonb_build_object('testId',test,'revision',c.revision));
 result:=jsonb_build_object('testId',test,'queued',true,'selfOnly',true);
 INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result) VALUES(scope_key,p_key_hash,p_request_hash,200,result);RETURN result;
END $$;
CREATE FUNCTION public.prepare_newsletter_delivery(p_job uuid,p_lease uuid,p_unsubscribe_hash text,p_secret_payload text) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.delivery_jobs;r public.newsletter_campaign_recipients;c public.newsletter_campaigns;s public.newsletter_subscribers;t public.newsletter_test_sends;skip text;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('newsletter-workspace',0));
 SELECT * INTO j FROM public.delivery_jobs WHERE id=p_job AND lease_token=p_lease AND kind IN('newsletter_campaign','newsletter_test') AND state='running' AND locked_until>now() FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL;END IF;
 IF j.kind='newsletter_test' THEN
  SELECT * INTO t FROM public.newsletter_test_sends WHERE id=(j.payload->>'testId')::uuid FOR UPDATE;
  SELECT * INTO c FROM public.newsletter_campaigns WHERE id=t.campaign_id;
  IF t.id IS NULL OR t.expires_at<=now() OR c.deleted_at IS NOT NULL OR c.revision<>t.revision OR NOT gdg_security.member_transfer_session(t.actor_id,t.session_id)
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
CREATE FUNCTION public.finish_newsletter_delivery(p_job uuid,p_lease uuid,p_success boolean,p_provider text,p_error text,p_permanent boolean DEFAULT false) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.delivery_jobs;r public.newsletter_campaign_recipients;test uuid;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('newsletter-workspace',0));
 SELECT * INTO j FROM public.delivery_jobs WHERE id=p_job AND lease_token=p_lease AND kind IN('newsletter_campaign','newsletter_test') AND state='running' AND locked_until>now() FOR UPDATE;
 IF NOT FOUND THEN RETURN false;END IF;
 IF p_provider IS NOT NULL AND length(p_provider)>200 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 IF j.kind='newsletter_campaign' THEN
  SELECT * INTO r FROM public.newsletter_campaign_recipients WHERE id=(j.payload->>'recipientId')::uuid FOR UPDATE;
  IF r.id IS NOT NULL AND r.state='queued' THEN
   UPDATE public.newsletter_campaign_recipients SET state=CASE WHEN p_success THEN 'sent' WHEN p_permanent OR j.attempt_count>=8 THEN 'failed' ELSE 'queued' END,provider_message_id=CASE WHEN p_success THEN p_provider ELSE provider_message_id END,
    sent_at=CASE WHEN p_success THEN now() ELSE sent_at END,attempt_count=j.attempt_count,error_code=CASE WHEN p_success THEN NULL ELSE p_error END,
    secret_payload=CASE WHEN p_success OR p_permanent OR j.attempt_count>=8 THEN NULL ELSE secret_payload END,updated_at=now() WHERE id=r.id;
  END IF;
 ELSE test:=(j.payload->>'testId')::uuid;IF p_success OR p_permanent OR j.attempt_count>=8 THEN UPDATE public.newsletter_test_sends SET verified_hash=NULL WHERE id=test;END IF;END IF;
 PERFORM public.finish_delivery_job(j.id,p_lease,p_success,p_provider,p_error);
 IF NOT p_success AND p_permanent THEN UPDATE public.delivery_jobs SET state='dead',secret_payload=NULL WHERE id=j.id AND state='pending';END IF;
 RETURN true;
END $$;
CREATE FUNCTION public.reconcile_newsletter_campaigns() RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c public.newsletter_campaigns;completed integer:=0;failed integer:=0;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('newsletter-workspace',0));
 FOR c IN SELECT * FROM public.newsletter_campaigns WHERE status='sending' ORDER BY delivery_started_at,id LIMIT 100 FOR UPDATE LOOP
  UPDATE public.newsletter_campaign_recipients r SET state='failed',secret_payload=NULL,error_code='DELIVERY_EXHAUSTED',updated_at=now() WHERE r.campaign_id=c.id AND r.state='queued'
   AND(c.delivery_deadline<=now() OR EXISTS(SELECT 1 FROM public.delivery_jobs j WHERE j.kind='newsletter_campaign' AND j.payload->>'recipientId'=r.id::text AND j.state='dead'))
   AND NOT EXISTS(SELECT 1 FROM public.delivery_jobs j WHERE j.kind='newsletter_campaign' AND j.payload->>'recipientId'=r.id::text AND j.state='running' AND j.locked_until>now());
  IF NOT EXISTS(SELECT 1 FROM public.newsletter_campaign_recipients WHERE campaign_id=c.id AND state='queued') THEN
   UPDATE public.newsletter_campaigns SET status=CASE WHEN EXISTS(SELECT 1 FROM public.newsletter_campaign_recipients WHERE campaign_id=c.id AND state='failed') THEN 'failed' ELSE 'sent' END,sent_at=now(),approval_password_hash=NULL,revision=revision+1,updated_at=now() WHERE id=c.id;
   IF EXISTS(SELECT 1 FROM public.newsletter_campaign_recipients WHERE campaign_id=c.id AND state='failed') THEN failed:=failed+1;ELSE completed:=completed+1;END IF;
  END IF;
 END LOOP;
 RETURN jsonb_build_object('completed',completed,'failed',failed);
END $$;
REVOKE ALL ON FUNCTION public.create_newsletter_test(uuid,uuid,uuid,integer,text,text,text,uuid),public.prepare_newsletter_delivery(uuid,uuid,text,text),public.finish_newsletter_delivery(uuid,uuid,boolean,text,text,boolean),public.reconcile_newsletter_campaigns() FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.create_newsletter_test(uuid,uuid,uuid,integer,text,text,text,uuid),public.prepare_newsletter_delivery(uuid,uuid,text,text),public.finish_newsletter_delivery(uuid,uuid,boolean,text,text,boolean),public.reconcile_newsletter_campaigns() TO service_role;
COMMIT;
