-- Committed only in the disposable, network-isolated test database.
CREATE TABLE public.test_registration_outcomes (result text NOT NULL);
INSERT INTO public.events(title,description,slug,start_at,location,publication_status,registration_type,max_participants)
VALUES('Concurrency fixture','One remaining seat','last-seat-fixture',now()+interval '1 day','Test venue','published','internal',1);
CREATE FUNCTION public.test_last_seat(p_client integer) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.register_event_atomic('last-seat-fixture','Concurrent Person',
    'client-'||p_client||'@example.test',NULL,true,
    encode(sha256(('key-'||p_client)::bytea),'hex'),encode(sha256(('payload-'||p_client)::bytea),'hex'));
  INSERT INTO public.test_registration_outcomes VALUES('registered');
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM<>'EVENT_FULL' THEN RAISE; END IF;
  INSERT INTO public.test_registration_outcomes VALUES('full');
END $$;
