BEGIN;
ALTER TABLE public.newsletter_subscribers ADD COLUMN last_notified_at timestamptz;
CREATE FUNCTION public.notify_newsletter_subscriber(p_actor uuid,p_session uuid,p_subscriber uuid,p_token_hash text,p_secret_payload text,p_key_hash text,p_request_hash text,p_request uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.newsletter_subscribers;k public.idempotency_keys;t uuid;r jsonb;notification_scope text;purpose text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('newsletter-workspace',0));
 IF NOT gdg_security.member_transfer_session(p_actor,p_session) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT * INTO s FROM public.newsletter_subscribers WHERE id=p_subscriber FOR UPDATE;
 IF NOT FOUND OR NOT public.can_operate_newsletter(p_actor,s.team_id,'read') OR NOT public.can_operate_newsletter(p_actor,s.team_id,CASE WHEN s.state='pending' THEN 'create' ELSE 'send_email' END) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF s.deleted_at IS NOT NULL OR s.suppressed_at IS NOT NULL OR s.state NOT IN('pending','active') OR(s.team_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.admin_teams WHERE id=s.team_id AND is_active AND deleted_at IS NULL)) THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
 IF p_token_hash IS NULL OR p_token_hash!~'^[a-f0-9]{64}$' OR length(coalesce(p_secret_payload,'')) NOT BETWEEN 40 AND 4096 OR p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$' OR p_request_hash IS NULL OR p_request_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 notification_scope:='newsletter.notify:'||p_actor||':'||s.id;
 SELECT * INTO k FROM public.idempotency_keys WHERE scope=notification_scope AND key_hash=p_key_hash;
 IF FOUND THEN IF k.request_hash IS DISTINCT FROM p_request_hash THEN RAISE EXCEPTION 'CONFLICT';END IF;RETURN k.result;END IF;
 IF s.last_notified_at>now()-interval '1 minute' THEN RAISE EXCEPTION 'NOTIFICATION_COOLDOWN';END IF;
 purpose:=CASE WHEN s.state='pending' THEN 'invitation' ELSE 'welcome' END;
 IF purpose='invitation' THEN UPDATE public.newsletter_tokens SET consumed_at=now() WHERE subscriber_id=s.id AND newsletter_tokens.purpose='confirm' AND consumed_at IS NULL;END IF;
 INSERT INTO public.newsletter_tokens(subscriber_id,purpose,token_hash,expires_at) VALUES(s.id,CASE WHEN purpose='invitation' THEN 'confirm' ELSE 'unsubscribe' END,p_token_hash,now()+CASE WHEN purpose='invitation' THEN interval '24 hours' ELSE interval '90 days' END) RETURNING id INTO t;
 INSERT INTO public.delivery_jobs(kind,deduplication_key,payload,secret_payload) VALUES('newsletter_confirmation','newsletter-notify:'||t,jsonb_build_object('subscriberId',s.id,'tokenId',t,'mode',purpose),p_secret_payload);
 UPDATE public.newsletter_subscribers SET last_notified_at=now() WHERE id=s.id;
 r:=jsonb_build_object('queued',true,'purpose',purpose);
 INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result) VALUES(notification_scope,p_key_hash,p_request_hash,200,r);
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata) VALUES(p_actor,'newsletter.subscriber_notified','newsletter_subscriber',s.id,p_request,jsonb_build_object('purpose',purpose));
 RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.notify_newsletter_subscriber(uuid,uuid,uuid,text,text,text,text,uuid) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.notify_newsletter_subscriber(uuid,uuid,uuid,text,text,text,text,uuid) TO service_role;
COMMIT;
