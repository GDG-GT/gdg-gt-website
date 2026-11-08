BEGIN;
-- No raw card token, Wallet plaintext, mobile token or decryption key is stored.
CREATE TABLE public.reward_wallet_reads (
 cryptogram_hash text PRIMARY KEY CHECK(cryptogram_hash~'^[a-f0-9]{64}$'),
 challenge_hash text UNIQUE NOT NULL CHECK(challenge_hash~'^[a-f0-9]{64}$'),
 credential_hash text NOT NULL CHECK(credential_hash~'^[a-f0-9]{64}$'),
 actor_id uuid NOT NULL REFERENCES public.admin_users(id),
 session_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reward_wallet_reads_created ON public.reward_wallet_reads(created_at);
ALTER TABLE public.reward_wallet_reads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reward_wallet_reads FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT SELECT,INSERT,DELETE ON public.reward_wallet_reads TO service_role;
CREATE FUNCTION public.reward_wallet_read(p_actor uuid,p_session uuid,p_cryptogram_hash text,p_challenge_hash text,p_credential_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE prior public.reward_wallet_reads;mid uuid;
BEGIN
 PERFORM gdg_security.reward_admin(p_actor,p_session);
 -- Bound housekeeping without coupling session-retention deletes to this table.
 DELETE FROM public.reward_wallet_reads WHERE cryptogram_hash IN(SELECT cryptogram_hash FROM public.reward_wallet_reads WHERE created_at<now()-interval '24 hours' ORDER BY created_at LIMIT 100);
 IF p_cryptogram_hash IS NULL OR p_cryptogram_hash!~'^[a-f0-9]{64}$' OR p_challenge_hash IS NULL OR p_challenge_hash!~'^[a-f0-9]{64}$' OR p_credential_hash IS NULL OR p_credential_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 -- Lock both replay dimensions in fixed order to handle racing requests atomically.
 PERFORM pg_advisory_xact_lock(hashtextextended('wallet-challenge:'||p_challenge_hash,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('wallet-cryptogram:'||p_cryptogram_hash,0));
 SELECT member_id INTO mid FROM public.reward_credentials WHERE token_hash=p_credential_hash AND kind='wallet' AND revoked_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 PERFORM gdg_security.reward_active_member(mid);
 SELECT * INTO prior FROM public.reward_wallet_reads WHERE cryptogram_hash=p_cryptogram_hash OR challenge_hash=p_challenge_hash;
 IF FOUND THEN
  IF prior.cryptogram_hash<>p_cryptogram_hash OR prior.challenge_hash<>p_challenge_hash OR prior.credential_hash<>p_credential_hash OR prior.actor_id<>p_actor OR prior.session_id<>p_session THEN RAISE EXCEPTION 'CONFLICT';END IF;
 ELSE
  INSERT INTO public.reward_wallet_reads(cryptogram_hash,challenge_hash,credential_hash,actor_id,session_id) VALUES(p_cryptogram_hash,p_challenge_hash,p_credential_hash,p_actor,p_session);
 END IF;
 RETURN jsonb_build_object('verified',true);
END $$;
REVOKE ALL ON FUNCTION public.reward_wallet_read(uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.reward_wallet_read(uuid,uuid,text,text,text) TO service_role;
COMMENT ON TABLE public.reward_wallet_reads IS 'Wallet reader replay hashes only. Old rows can be deleted after 24 hours; cryptograms expire in 75 seconds at the API.';
COMMIT;
