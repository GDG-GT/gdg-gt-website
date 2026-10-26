BEGIN;
-- Read-only capability inspection. Never return a subscriber identity or change
-- preference/consumption state just because an email link was opened.
CREATE FUNCTION public.inspect_newsletter_token(p_hash text,p_purpose text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE t public.newsletter_tokens;s public.newsletter_subscribers;valid boolean:=false;BEGIN
 IF p_purpose IS NULL OR p_purpose NOT IN('confirm','unsubscribe') THEN RETURN jsonb_build_object('valid',false,'applied',false);END IF;
 SELECT * INTO t FROM public.newsletter_tokens WHERE token_hash=p_hash AND purpose=p_purpose;
 IF NOT FOUND OR t.expires_at<=now() THEN RETURN jsonb_build_object('valid',false,'applied',false);END IF;
 SELECT * INTO s FROM public.newsletter_subscribers WHERE id=t.subscriber_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('valid',false,'applied',false);END IF;
 IF p_purpose='confirm' THEN
  valid:=s.deleted_at IS NULL AND s.suppressed_at IS NULL AND s.consent_at IS NOT NULL
   AND(s.team_id IS NULL OR EXISTS(SELECT 1 FROM public.admin_teams WHERE id=s.team_id AND is_active AND deleted_at IS NULL))
   AND CASE WHEN t.consumed_at IS NULL THEN s.state='pending' ELSE s.state='active' END;
 ELSE valid:=t.consumed_at IS NULL OR s.state='unsubscribed';END IF;
 RETURN jsonb_build_object('valid',valid,'applied',valid AND t.consumed_at IS NOT NULL);
END $$;

-- Retrying a committed confirmation is safe while its same-purpose token is
-- current and the subscriber remains active. A replay never reactivates an
-- unsubscribed, suppressed, deleted or team-disabled record.
CREATE OR REPLACE FUNCTION public.consume_newsletter_token(p_hash text,p_purpose text) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE t public.newsletter_tokens;s public.newsletter_subscribers;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('newsletter-workspace',0));
 IF p_purpose IS NULL OR p_purpose NOT IN('confirm','unsubscribe') THEN RETURN false;END IF;
 SELECT * INTO t FROM public.newsletter_tokens WHERE token_hash=p_hash AND purpose=p_purpose FOR UPDATE;
 IF NOT FOUND OR t.expires_at<=now() THEN RETURN false;END IF;
 SELECT * INTO s FROM public.newsletter_subscribers WHERE id=t.subscriber_id FOR UPDATE;
 IF NOT FOUND THEN RETURN false;END IF;
 IF t.consumed_at IS NOT NULL THEN
  IF p_purpose='unsubscribe' THEN RETURN s.state='unsubscribed';END IF;
  RETURN s.state='active' AND s.deleted_at IS NULL AND s.suppressed_at IS NULL AND s.consent_at IS NOT NULL
   AND(s.team_id IS NULL OR EXISTS(SELECT 1 FROM public.admin_teams WHERE id=s.team_id AND is_active AND deleted_at IS NULL));
 END IF;
 IF p_purpose='confirm' AND(s.state<>'pending' OR s.consent_at IS NULL OR s.deleted_at IS NOT NULL OR s.suppressed_at IS NOT NULL OR(s.team_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.admin_teams WHERE id=s.team_id AND is_active AND deleted_at IS NULL))) THEN RETURN false;END IF;
 UPDATE public.newsletter_tokens SET consumed_at=now() WHERE id=t.id;
 IF p_purpose='confirm' THEN UPDATE public.newsletter_subscribers SET state='active',is_active=true,confirmed_at=now(),updated_at=now() WHERE id=s.id;
 ELSE
  UPDATE public.newsletter_subscribers SET state='unsubscribed',is_active=false,unsubscribed_at=now(),updated_at=now() WHERE id=s.id;
  UPDATE public.newsletter_tokens SET consumed_at=now() WHERE subscriber_id=s.id AND consumed_at IS NULL;
 END IF;RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.inspect_newsletter_token(text,text),public.consume_newsletter_token(text,text) FROM PUBLIC,anon,authenticated,gdg_realtime,service_role;
GRANT EXECUTE ON FUNCTION public.inspect_newsletter_token(text,text),public.consume_newsletter_token(text,text) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
