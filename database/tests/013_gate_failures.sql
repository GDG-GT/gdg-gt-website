BEGIN;
DO $$ DECLARE n integer;r jsonb;BEGIN
 IF NOT (public.check_rate_limit('failure-peek-fixture',repeat('f',64),5)->>'allowed')::boolean THEN RAISE EXCEPTION 'Empty gate quota blocked';END IF;
 FOR n IN 1..5 LOOP r:=public.take_rate_limit('failure-peek-fixture',repeat('f',64),5,900);END LOOP;
 IF (public.check_rate_limit('failure-peek-fixture',repeat('f',64),5)->>'allowed')::boolean THEN RAISE EXCEPTION 'Five failures did not lock gate';END IF;
 UPDATE public.rate_limit_windows SET expires_at=now()-interval '1 second' WHERE scope='failure-peek-fixture';
 IF NOT (public.check_rate_limit('failure-peek-fixture',repeat('f',64),5)->>'allowed')::boolean THEN RAISE EXCEPTION 'Expired failures still block gate';END IF;
 IF (SELECT coalesce(sum(attempts),0) FROM public.rate_limit_windows WHERE scope='failure-peek-fixture')<>5 THEN RAISE EXCEPTION 'Quota peek modified attempt history';END IF;
END $$;
ROLLBACK;
