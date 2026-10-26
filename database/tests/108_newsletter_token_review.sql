BEGIN;
INSERT INTO public.newsletter_subscribers(id,email,is_active,state,consent_at) VALUES
 ('f1080000-0000-4000-8000-000000000001','review-fixture@example.test',false,'pending',now()),
 ('f1080000-0000-4000-8000-000000000002','no-consent-fixture@example.test',false,'pending',NULL);
INSERT INTO public.newsletter_tokens(subscriber_id,purpose,token_hash,expires_at) VALUES
 ('f1080000-0000-4000-8000-000000000001','confirm',repeat('1',64),now()+interval '1 day'),
 ('f1080000-0000-4000-8000-000000000001','unsubscribe',repeat('2',64),now()+interval '1 day'),
 ('f1080000-0000-4000-8000-000000000001','confirm',repeat('3',64),now()-interval '1 second'),
 ('f1080000-0000-4000-8000-000000000002','confirm',repeat('4',64),now()+interval '1 day');
DO $$ DECLARE before_state jsonb;after_state jsonb;v jsonb;BEGIN
 IF has_function_privilege('anon','public.inspect_newsletter_token(text,text)','EXECUTE')
 OR has_function_privilege('authenticated','public.inspect_newsletter_token(text,text)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.inspect_newsletter_token(text,text)','EXECUTE') THEN RAISE EXCEPTION 'Token inspection grant mismatch';END IF;
 SELECT jsonb_build_object('subscriber',to_jsonb(s),'tokens',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.newsletter_tokens t WHERE subscriber_id=s.id)) INTO before_state FROM public.newsletter_subscribers s WHERE id='f1080000-0000-4000-8000-000000000001';
 v:=public.inspect_newsletter_token(repeat('1',64),'confirm');
 IF v<>'{"valid":true,"applied":false}'::jsonb THEN RAISE EXCEPTION 'Pending review incorrect or identity leaked';END IF;
 IF public.inspect_newsletter_token(repeat('1',64),'unsubscribe')<>'{"valid":false,"applied":false}'::jsonb
 OR public.inspect_newsletter_token(repeat('3',64),'confirm')<>'{"valid":false,"applied":false}'::jsonb
 OR public.inspect_newsletter_token(repeat('f',64),'confirm')<>'{"valid":false,"applied":false}'::jsonb THEN RAISE EXCEPTION 'Wrong-purpose/expired/unknown token accepted';END IF;
 IF (public.inspect_newsletter_token(repeat('4',64),'confirm')->>'valid')::boolean OR public.consume_newsletter_token(repeat('4',64),'confirm') THEN RAISE EXCEPTION 'Confirmation bypassed missing consent';END IF;
 SELECT jsonb_build_object('subscriber',to_jsonb(s),'tokens',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.newsletter_tokens t WHERE subscriber_id=s.id)) INTO after_state FROM public.newsletter_subscribers s WHERE id='f1080000-0000-4000-8000-000000000001';
 IF before_state IS DISTINCT FROM after_state THEN RAISE EXCEPTION 'Link inspection mutated preferences';END IF;
 IF NOT public.consume_newsletter_token(repeat('1',64),'confirm') OR NOT public.consume_newsletter_token(repeat('1',64),'confirm') THEN RAISE EXCEPTION 'Confirmation commit/retry failed';END IF;
 IF public.inspect_newsletter_token(repeat('1',64),'confirm')<>'{"valid":true,"applied":true}'::jsonb THEN RAISE EXCEPTION 'Committed confirmation review incorrect';END IF;
 IF NOT public.consume_newsletter_token(repeat('2',64),'unsubscribe') OR NOT public.consume_newsletter_token(repeat('2',64),'unsubscribe') THEN RAISE EXCEPTION 'Unsubscribe commit/retry failed';END IF;
 IF public.consume_newsletter_token(repeat('1',64),'confirm') OR (public.inspect_newsletter_token(repeat('1',64),'confirm')->>'valid')::boolean THEN RAISE EXCEPTION 'Old confirmation reactivated opted-out subscriber';END IF;
 IF public.inspect_newsletter_token(repeat('2',64),'unsubscribe')<>'{"valid":true,"applied":true}'::jsonb THEN RAISE EXCEPTION 'Committed unsubscribe review incorrect';END IF;
END $$;
UPDATE public.newsletter_subscribers SET state='active',is_active=true,suppressed_at=now() WHERE id='f1080000-0000-4000-8000-000000000001';
DO $$ BEGIN
 IF public.consume_newsletter_token(repeat('1',64),'confirm') OR (public.inspect_newsletter_token(repeat('1',64),'confirm')->>'valid')::boolean THEN RAISE EXCEPTION 'Suppressed confirmation replay accepted';END IF;
END $$;
ROLLBACK;
