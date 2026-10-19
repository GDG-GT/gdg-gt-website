BEGIN;
INSERT INTO public.events(title,description,slug,start_at,location,publication_status,registration_type,max_participants)
VALUES('Test event','A transactional event fixture','transaction-fixture',now()+interval '1 day','Test venue','published','internal',1);
DO $$ DECLARE v_first jsonb; v_repeat jsonb; BEGIN
  v_first := public.register_event_atomic('transaction-fixture','Fixture Person','Person@Example.Test',NULL,true,repeat('a',64),repeat('b',64));
  v_repeat := public.register_event_atomic('transaction-fixture','Fixture Person','person@example.test',NULL,true,repeat('a',64),repeat('b',64));
  IF v_first<>v_repeat THEN RAISE EXCEPTION 'EVT-TEST-001: non-idempotent registration'; END IF;
  IF (SELECT count(*) FROM public.event_attendance)<>1 OR (SELECT count(*) FROM public.delivery_jobs)<>1 THEN
    RAISE EXCEPTION 'EVT-TEST-002: duplicate registration or confirmation job';
  END IF;
  BEGIN
    PERFORM public.register_event_atomic('transaction-fixture','Fixture Person','person@example.test',NULL,true,repeat('c',64),repeat('b',64));
    RAISE EXCEPTION 'Duplicate incorrectly accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'DUPLICATE' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.register_event_atomic('transaction-fixture','Another Person','another@example.test',NULL,true,repeat('d',64),repeat('b',64));
    RAISE EXCEPTION 'Capacity incorrectly exceeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'EVENT_FULL' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.register_event_atomic('transaction-fixture','Changed Person','different@example.test',NULL,true,repeat('a',64),repeat('f',64));
    RAISE EXCEPTION 'Idempotency key payload change incorrectly accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'INVALID_STATE' THEN RAISE; END IF;
  END;
END $$;
ROLLBACK;
