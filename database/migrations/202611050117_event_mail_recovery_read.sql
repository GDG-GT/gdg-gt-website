BEGIN;
CREATE FUNCTION public.inspect_event_mail_recovery(p_actor uuid,p_session uuid,p_event uuid,p_review uuid,p_key_hash text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE k public.idempotency_keys;r public.event_mail_reviews;e public.events;audience jsonb;reason text;
 scope_key text:='event-mail:'||p_actor||':'||p_session||':'||p_event;BEGIN
 IF NOT gdg_security.member_transfer_session(p_actor,p_session) OR NOT public.can_event_audience(p_actor,p_event,'send_email')
 THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_review IS NULL OR p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 SELECT * INTO k FROM public.idempotency_keys WHERE scope=scope_key AND key_hash=p_key_hash;
 IF FOUND THEN
  -- The append-only approval audit binds this receipt to the requested saved
  -- review even after the five-minute review has expired or been purged.
  IF NOT EXISTS(SELECT 1 FROM public.admin_actions a JOIN public.event_messages m ON m.id=(k.result->>'messageId')::uuid
   WHERE a.actor_id=p_actor AND a.action='events.email_queued' AND a.target_id=p_event
   AND a.metadata->>'messageId'=m.id::text AND a.metadata->>'reviewId'=p_review::text
   AND m.event_id=p_event AND m.created_by=p_actor AND m.key_hash=p_key_hash)
  THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  RETURN jsonb_build_object('state','queued','at',now(),'receipt',k.result);
 END IF;
 SELECT * INTO r FROM public.event_mail_reviews WHERE id=p_review AND event_id=p_event AND actor_id=p_actor AND session_id=p_session;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','unavailable','reason','unavailable','at',now());END IF;
 SELECT * INTO e FROM public.events WHERE id=p_event;
 IF r.used_at IS NOT NULL THEN reason:='used';
 ELSIF r.expires_at<=now() THEN reason:='expired';
 ELSIF r.event_revision<>e.revision OR e.publication_status NOT IN('published','cancelled') THEN reason:='changed';
 ELSE
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'email',a.attendee_email) ORDER BY a.id),'[]') INTO audience FROM(
   SELECT id,attendee_email FROM public.event_attendance WHERE event_id=p_event AND deleted_at IS NULL ORDER BY id LIMIT 1001)a;
  IF audience IS DISTINCT FROM r.recipient_snapshot THEN reason:='audience_changed';END IF;
 END IF;
 IF reason IS NOT NULL THEN RETURN jsonb_build_object('state','unavailable','reason',reason,'at',now());END IF;
 RETURN jsonb_build_object('state','ready','at',now(),'review',jsonb_build_object('reviewId',r.id,'expiresAt',r.expires_at,
  'count',jsonb_array_length(r.recipient_snapshot),'recipients',r.recipient_snapshot,'subject',r.subject,'message',r.message));
END $$;
REVOKE ALL ON FUNCTION public.inspect_event_mail_recovery(uuid,uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.inspect_event_mail_recovery(uuid,uuid,uuid,uuid,text) TO service_role;
COMMIT;
