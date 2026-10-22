BEGIN;
CREATE TABLE public.newsletter_provider_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),event_hash text NOT NULL UNIQUE CHECK(event_hash~'^[a-f0-9]{64}$'),payload_hash text NOT NULL CHECK(payload_hash~'^[a-f0-9]{64}$'),
 provider_message_id text NOT NULL,event_type text NOT NULL CHECK(event_type IN('email.sent','email.delivered','email.delivery_delayed','email.bounced','email.complained','email.failed','email.opened','email.clicked','email.suppressed')),
 occurred_at timestamptz NOT NULL,state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','applied','ignored')),created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.newsletter_provider_events ENABLE ROW LEVEL SECURITY;REVOKE ALL ON public.newsletter_provider_events FROM PUBLIC,anon,authenticated,gdg_realtime;GRANT ALL ON public.newsletter_provider_events TO service_role;
ALTER TABLE public.newsletter_campaign_recipients ADD COLUMN opened_at timestamptz,ADD COLUMN clicked_at timestamptz,ADD COLUMN provider_updated_at timestamptz;
CREATE FUNCTION gdg_security.newsletter_snapshot_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF NEW.campaign_id IS DISTINCT FROM OLD.campaign_id OR NEW.subscriber_id IS DISTINCT FROM OLD.subscriber_id OR NEW.subscriber_revision IS DISTINCT FROM OLD.subscriber_revision
  OR(NEW.recipient_email IS DISTINCT FROM OLD.recipient_email AND NOT(NEW.recipient_email='' AND OLD.state<>'queued' AND OLD.updated_at<now()-interval '30 days')) THEN RAISE EXCEPTION 'NEWSLETTER_LOCKED';END IF;RETURN NEW;
END $$;
CREATE TRIGGER newsletter_snapshot_guard BEFORE UPDATE ON public.newsletter_campaign_recipients FOR EACH ROW EXECUTE FUNCTION gdg_security.newsletter_snapshot_guard();
CREATE FUNCTION public.apply_newsletter_provider_events() RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE e public.newsletter_provider_events;r public.newsletter_campaign_recipients;applied integer:=0;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('newsletter-workspace',0));
 FOR e IN SELECT * FROM public.newsletter_provider_events WHERE state='pending' ORDER BY occurred_at,id LIMIT 500 FOR UPDATE LOOP
  SELECT * INTO r FROM public.newsletter_campaign_recipients WHERE provider_message_id=e.provider_message_id FOR UPDATE;
  IF NOT FOUND THEN
   IF e.created_at<now()-interval '24 hours' THEN UPDATE public.newsletter_provider_events SET state='ignored' WHERE id=e.id;END IF;CONTINUE;
  END IF;
  IF e.event_type IN('email.bounced','email.complained','email.suppressed') THEN
   UPDATE public.newsletter_subscribers SET suppressed_at=coalesce(suppressed_at,now()),suppression_reason=CASE WHEN e.event_type='email.complained' THEN 'complaint' WHEN suppression_reason='complaint' THEN 'complaint' WHEN e.event_type='email.bounced' THEN 'hard_bounce' ELSE 'manual' END,state='unsubscribed',is_active=false WHERE id=r.subscriber_id;
   UPDATE public.newsletter_tokens SET consumed_at=coalesce(consumed_at,now()) WHERE subscriber_id=r.subscriber_id;
  END IF;
  UPDATE public.newsletter_campaign_recipients SET provider_state=CASE WHEN provider_state='email.complained' THEN provider_state WHEN e.event_type IN('email.complained','email.bounced','email.suppressed') THEN e.event_type
    WHEN provider_state IN('email.complained','email.bounced','email.suppressed') THEN provider_state
    WHEN provider_updated_at IS NULL OR e.occurred_at>=provider_updated_at THEN e.event_type ELSE provider_state END,
   opened_at=CASE WHEN e.event_type='email.opened' THEN least(opened_at,e.occurred_at) ELSE opened_at END,clicked_at=CASE WHEN e.event_type='email.clicked' THEN least(clicked_at,e.occurred_at) ELSE clicked_at END,
   provider_updated_at=greatest(coalesce(provider_updated_at,e.occurred_at),e.occurred_at),updated_at=now() WHERE id=r.id;
  UPDATE public.newsletter_provider_events SET state='applied' WHERE id=e.id;applied:=applied+1;
 END LOOP;
 UPDATE public.newsletter_campaigns c SET open_count=(SELECT count(*) FROM public.newsletter_campaign_recipients WHERE campaign_id=c.id AND opened_at IS NOT NULL),click_count=(SELECT count(*) FROM public.newsletter_campaign_recipients WHERE campaign_id=c.id AND clicked_at IS NOT NULL)
 WHERE c.id IN(SELECT campaign_id FROM public.newsletter_campaign_recipients WHERE updated_at>=now()-interval '1 minute');
 RETURN applied;
END $$;
CREATE FUNCTION public.record_newsletter_provider_event(p_event_hash text,p_payload_hash text,p_provider text,p_type text,p_occurred timestamptz) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE e public.newsletter_provider_events;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('newsletter-workspace',0));
 IF p_event_hash IS NULL OR p_event_hash!~'^[a-f0-9]{64}$' OR p_payload_hash IS NULL OR p_payload_hash!~'^[a-f0-9]{64}$' OR length(coalesce(p_provider,'')) NOT BETWEEN 1 AND 200 OR p_occurred IS NULL OR p_occurred>now()+interval '5 minutes' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 SELECT * INTO e FROM public.newsletter_provider_events WHERE event_hash=p_event_hash;
 IF FOUND THEN IF e.payload_hash IS DISTINCT FROM p_payload_hash THEN RAISE EXCEPTION 'CONFLICT';END IF;RETURN true;END IF;
 INSERT INTO public.newsletter_provider_events(event_hash,payload_hash,provider_message_id,event_type,occurred_at) VALUES(p_event_hash,p_payload_hash,p_provider,p_type,p_occurred);
 PERFORM public.apply_newsletter_provider_events();RETURN true;
END $$;
CREATE FUNCTION public.newsletter_delivery_status(p_actor uuid,p_session uuid,p_campaign uuid,p_page integer) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE c public.newsletter_campaigns;result jsonb;BEGIN
 IF NOT gdg_security.member_transfer_session(p_actor,p_session) OR p_page NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT * INTO c FROM public.newsletter_campaigns WHERE id=p_campaign;
 IF NOT FOUND OR NOT public.can_operate_newsletter(p_actor,c.team_id,'read') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT jsonb_build_object('status',c.status,'revision',c.revision,'approvedAt',c.approved_at,'scheduledAt',c.scheduled_at,'startedAt',c.delivery_started_at,'finishedAt',c.sent_at,'cancelledAt',c.cancelled_at,
 'counts',(SELECT jsonb_build_object('snapshot',count(*),'queued',count(*)FILTER(WHERE state='queued'),'accepted',count(*)FILTER(WHERE state='sent'),'skipped',count(*)FILTER(WHERE state='skipped'),'failed',count(*)FILTER(WHERE state='failed'),
 'delivered',count(*)FILTER(WHERE provider_state IN('email.delivered','email.opened','email.clicked')),'bounced',count(*)FILTER(WHERE provider_state='email.bounced'),'complained',count(*)FILTER(WHERE provider_state='email.complained'),'opened',count(*)FILTER(WHERE opened_at IS NOT NULL),'clicked',count(*)FILTER(WHERE clicked_at IS NOT NULL)) FROM public.newsletter_campaign_recipients WHERE campaign_id=c.id),
 'items',coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM(SELECT id,recipient_email email,state,provider_state,attempt_count,error_code,sent_at,opened_at,clicked_at FROM public.newsletter_campaign_recipients WHERE campaign_id=c.id ORDER BY id LIMIT 50 OFFSET(p_page-1)*50)r),'[]'),'page',p_page,'pageSize',50,'total',c.recipient_count) INTO result;RETURN result;
END $$;
CREATE FUNCTION public.export_newsletter_subscribers(p_actor uuid,p_session uuid,p_filters jsonb,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE page jsonb;result jsonb:='[]';n integer:=1;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('newsletter-workspace',0));
 LOOP
  page:=public.read_newsletter_workspace(p_actor,p_session,'subscribers',p_filters,n,NULL);
  IF(page->>'total')::integer>1000 THEN RAISE EXCEPTION 'NEWSLETTER_EXPORT_LIMIT';END IF;
  result:=result||(page->'items');EXIT WHEN n*50>=(page->>'total')::integer;n:=n+1;
 END LOOP;
 INSERT INTO public.admin_actions(actor_id,action,target_type,request_id,metadata) VALUES(p_actor,'newsletter.subscribers_exported','newsletter_subscribers',p_request_id,jsonb_build_object('count',jsonb_array_length(result)));
 RETURN result;
END $$;
CREATE FUNCTION public.cleanup_newsletter_records() RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE reviews integer;tests integer;events integer;recipients integer;attempts integer;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('newsletter-workspace',0));
 DELETE FROM public.newsletter_send_reviews WHERE id IN(SELECT id FROM public.newsletter_send_reviews WHERE expires_at<now()-interval '24 hours' ORDER BY expires_at LIMIT 1000);GET DIAGNOSTICS reviews=ROW_COUNT;
 UPDATE public.newsletter_test_sends SET verified_hash=NULL,recipient_email='',content='',subject='' WHERE id IN(SELECT id FROM public.newsletter_test_sends WHERE expires_at<now()-interval '24 hours' AND recipient_email<>'' ORDER BY expires_at LIMIT 1000);GET DIAGNOSTICS tests=ROW_COUNT;
 DELETE FROM public.newsletter_provider_events WHERE id IN(SELECT id FROM public.newsletter_provider_events WHERE created_at<now()-interval '30 days' AND state<>'pending' ORDER BY created_at LIMIT 1000);GET DIAGNOSTICS events=ROW_COUNT;
 UPDATE public.newsletter_campaign_recipients SET recipient_email='',secret_payload=NULL WHERE id IN(SELECT id FROM public.newsletter_campaign_recipients WHERE updated_at<now()-interval '30 days' AND state<>'queued' AND recipient_email<>'' ORDER BY updated_at LIMIT 1000);GET DIAGNOSTICS recipients=ROW_COUNT;
 DELETE FROM public.newsletter_subscription_attempts WHERE id IN(SELECT id FROM public.newsletter_subscription_attempts WHERE created_at<now()-interval '30 days' ORDER BY created_at LIMIT 1000);GET DIAGNOSTICS attempts=ROW_COUNT;
 RETURN jsonb_build_object('reviewsErased',reviews,'testIdentitiesErased',tests,'providerEventsExpired',events,'recipientIdentitiesErased',recipients,'attemptsExpired',attempts);
END $$;
REVOKE ALL ON FUNCTION gdg_security.newsletter_snapshot_guard(),public.apply_newsletter_provider_events(),public.record_newsletter_provider_event(text,text,text,text,timestamptz),public.newsletter_delivery_status(uuid,uuid,uuid,integer),public.export_newsletter_subscribers(uuid,uuid,jsonb,uuid),public.cleanup_newsletter_records() FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.apply_newsletter_provider_events(),public.record_newsletter_provider_event(text,text,text,text,timestamptz),public.newsletter_delivery_status(uuid,uuid,uuid,integer),public.export_newsletter_subscribers(uuid,uuid,jsonb,uuid),public.cleanup_newsletter_records() TO service_role;
COMMIT;
