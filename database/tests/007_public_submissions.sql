BEGIN;
DO $$ DECLARE v uuid;v_repeat uuid;v_subscriber uuid;v_job public.delivery_jobs;BEGIN
 PERFORM public.subscribe_newsletter('subscriber@example.test','Fixture',repeat('a',64),repeat('b',64),repeat('c',64),'encrypted-test-only');
 PERFORM public.subscribe_newsletter('subscriber@example.test','Fixture',repeat('a',64),repeat('b',64),repeat('d',64),'unused');
 SELECT id INTO v_subscriber FROM public.newsletter_subscribers WHERE email='subscriber@example.test';
 IF (SELECT count(*) FROM public.newsletter_tokens WHERE subscriber_id=v_subscriber)<>1
  OR EXISTS(SELECT 1 FROM public.newsletter_subscribers WHERE id=v_subscriber AND is_active) THEN RAISE EXCEPTION 'Double-opt-in or deduplication failed';END IF;
 IF NOT public.consume_newsletter_token(repeat('c',64),'confirm') THEN RAISE EXCEPTION 'Confirmation failed';END IF;
 IF public.consume_newsletter_token(repeat('c',64),'confirm') THEN RAISE EXCEPTION 'Confirmation token was reusable';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.newsletter_subscribers WHERE id=v_subscriber AND state='active' AND is_active) THEN RAISE EXCEPTION 'Confirmation did not activate subscriber';END IF;
 INSERT INTO public.newsletter_tokens(subscriber_id,purpose,token_hash,expires_at) VALUES(v_subscriber,'unsubscribe',repeat('e',64),now()+interval '1 day');
 IF NOT public.consume_newsletter_token(repeat('e',64),'unsubscribe') OR NOT public.consume_newsletter_token(repeat('e',64),'unsubscribe') THEN RAISE EXCEPTION 'Unsubscribe not idempotent';END IF;
 v:=public.submit_contact('{"name":"Test Person","email":"contact@example.test","type":"general","message":"A fictional test message of sufficient length."}',repeat('f',64),repeat('a',64));
 v_repeat:=public.submit_contact('{"name":"Test Person","email":"contact@example.test","type":"general","message":"A fictional test message of sufficient length."}',repeat('f',64),repeat('a',64));
 IF v<>v_repeat OR (SELECT count(*) FROM public.delivery_jobs WHERE payload->>'contactId'=v::text)<>2 THEN RAISE EXCEPTION 'Contact idempotency/outbox failed';END IF;
 SELECT * INTO v_job FROM public.claim_delivery_jobs(1);
 IF v_job.lease_token IS NULL OR public.finish_delivery_job(v_job.id,gen_random_uuid(),true,'fake-provider',NULL) THEN RAISE EXCEPTION 'Worker lease is not enforced';END IF;
 IF NOT public.finish_delivery_job(v_job.id,v_job.lease_token,true,'fake-provider',NULL) THEN RAISE EXCEPTION 'Worker completion failed';END IF;
 IF EXISTS(SELECT 1 FROM public.delivery_jobs WHERE id=v_job.id AND (state<>'completed' OR secret_payload IS NOT NULL)) THEN RAISE EXCEPTION 'Finished job state/secret cleanup failed';END IF;
END $$;
ROLLBACK;
