BEGIN;
-- Serialize owner quota as well as device quota. Reactivating a revoked row
-- must not bypass the active cap; an idempotent upsert at the cap still works.
CREATE FUNCTION gdg_security.guard_push_subscription_quota() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NEW.revoked_at IS NULL AND(TG_OP='INSERT' OR OLD.revoked_at IS NOT NULL) THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('event-push:'||NEW.endpoint_hash,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('push-owner:'||coalesce(NEW.admin_user_id,NEW.registration_id)::text,0));
  IF(SELECT count(*) FROM public.push_subscriptions s WHERE s.revoked_at IS NULL AND NOT(s.event_id=NEW.event_id AND s.endpoint_hash=NEW.endpoint_hash)
    AND(s.endpoint_hash=NEW.endpoint_hash))>=50 OR
   (SELECT count(*) FROM public.push_subscriptions s WHERE s.revoked_at IS NULL AND NOT(s.event_id=NEW.event_id AND s.endpoint_hash=NEW.endpoint_hash)
    AND((NEW.admin_user_id IS NOT NULL AND s.admin_user_id=NEW.admin_user_id) OR(NEW.registration_id IS NOT NULL AND s.registration_id=NEW.registration_id)))>=50 THEN RAISE EXCEPTION 'PUSH_QUOTA';END IF;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER push_subscription_quota BEFORE INSERT OR UPDATE ON public.push_subscriptions FOR EACH ROW EXECUTE FUNCTION gdg_security.guard_push_subscription_quota();
CREATE OR REPLACE FUNCTION public.prepare_event_push(p_job uuid,p_lease uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.delivery_jobs;l public.push_delivery_log;s public.push_subscriptions;e public.events;BEGIN
 SELECT * INTO j FROM public.delivery_jobs WHERE id=p_job AND lease_token=p_lease AND kind='event_push_reminder' AND state='running' AND locked_until>now() FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT * INTO l FROM public.push_delivery_log WHERE id=(j.payload->>'deliveryId')::uuid AND state='queued';IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT * INTO e FROM public.events WHERE id=l.event_id;
 IF e.publication_status<>'published' OR e.start_at<>l.event_start OR now()<l.event_start-interval '24 hours' OR now()>l.event_start-interval '23 hours 30 minutes' OR NOT gdg_security.push_owner_current(l.subscription_id) THEN
  UPDATE public.push_delivery_log SET state='skipped',last_error_code='SCOPE_OR_OCCURRENCE_CHANGED',updated_at=now() WHERE id=l.id;RETURN NULL;
 END IF;
 SELECT * INTO s FROM public.push_subscriptions WHERE id=l.subscription_id;
 RETURN jsonb_build_object('deliveryId',l.id,'encrypted',s.endpoint_encrypted,'slug',e.slug,'title',e.title,'eventStart',e.start_at);
END $$;
CREATE FUNCTION public.claim_event_push_jobs(p_limit integer) RETURNS SETOF public.delivery_jobs LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 10 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 WITH expired AS(UPDATE public.delivery_jobs j SET state='dead',locked_until=NULL,lease_token=NULL,last_error_code='PUSH_ATTEMPTS_OR_DEADLINE',updated_at=now()
  WHERE j.kind='event_push_reminder' AND(j.state='pending' OR(j.state='running' AND j.locked_until<=now())) AND
   (j.attempt_count>=6 OR EXISTS(SELECT 1 FROM public.push_delivery_log l WHERE l.id=(j.payload->>'deliveryId')::uuid AND now()>l.event_start-interval '23 hours 30 minutes')) RETURNING j.payload)
 UPDATE public.push_delivery_log SET state='failed',last_error_code='PUSH_ATTEMPTS_OR_DEADLINE',updated_at=now() WHERE state='queued' AND id IN(SELECT(payload->>'deliveryId')::uuid FROM expired);
 RETURN QUERY SELECT * FROM public.claim_worker_jobs(p_limit,ARRAY['event_push_reminder']);
END $$;
REVOKE ALL ON FUNCTION gdg_security.guard_push_subscription_quota(),public.claim_event_push_jobs(integer) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION gdg_security.guard_push_subscription_quota(),public.claim_event_push_jobs(integer) TO service_role;
COMMIT;
