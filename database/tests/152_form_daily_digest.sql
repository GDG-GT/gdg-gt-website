BEGIN;
DO $$ DECLARE a uuid;f uuid;closed uuid;v uuid;definition jsonb;j public.delivery_jobs;result integer;n jsonb;d date;instant timestamptz;BEGIN
 UPDATE public.forms SET state='Closed';
 INSERT INTO public.admin_users(email,password_hash,role,is_active) VALUES('digest-owner@example.test','fixture','super_admin',true) RETURNING id INTO a;
 definition:=jsonb_build_object('fields','[]'::jsonb,'sections','[]'::jsonb,'settings','{}'::jsonb);
 INSERT INTO public.forms(slug,title,owner_id,draft_definition,state) VALUES('digest-live','Daily digest fixture',a,definition,'Open') RETURNING id INTO f;
 INSERT INTO public.form_versions(form_id,version,definition,schema_hash,published_by) VALUES(f,1,definition,repeat('a',64),a) RETURNING id INTO v;
 UPDATE public.forms SET published_version_id=v WHERE id=f;
 INSERT INTO public.forms(slug,title,owner_id,draft_definition,state) VALUES('digest-closed','Closed digest fixture',a,definition,'Closed') RETURNING id INTO closed;
 -- Before/after local midnight and the exact 11 pm cutoff in both DST seasons.
 FOREACH instant IN ARRAY ARRAY['2026-01-15 23:00 America/New_York'::timestamptz,'2026-07-15 23:00 America/New_York'::timestamptz,'2026-11-01 23:00 America/New_York'::timestamptz] LOOP
  d:=(instant AT TIME ZONE 'America/New_York')::date;
  INSERT INTO public.form_responses(form_id,version_id,submitted_at,idempotency_key_hash,request_hash)
   SELECT f,v,stamp,encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex'),repeat('a',64) FROM unnest(ARRAY[
    (d::timestamp AT TIME ZONE 'America/New_York')-interval '1 second',
    d::timestamp AT TIME ZONE 'America/New_York',instant,instant+interval '1 second']) stamp;
  IF public.queue_form_daily_digest(instant-interval '1 second')<>0 THEN RAISE EXCEPTION 'Digest queued before 11pm';END IF;
  IF public.queue_form_daily_digest(instant)<>1 THEN RAISE EXCEPTION 'Digest missing at 11pm';END IF;
  IF public.queue_form_daily_digest(instant+interval '30 minutes')<>0 THEN RAISE EXCEPTION 'Duplicate daily digest';END IF;
  SELECT * INTO j FROM public.delivery_jobs WHERE deduplication_key='form-digest:'||d;
  SELECT value INTO n FROM jsonb_array_elements(j.payload->'forms') WHERE value->>'id'=f::text;
  IF(n->>'today')::integer<>2 OR(n->>'total')::integer<>3 THEN RAISE EXCEPTION 'Wrong daily counts: %',n;END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(j.payload->'forms') WHERE value->>'id'=closed::text) THEN RAISE EXCEPTION 'Closed form included';END IF;
  IF public.prepare_form_daily_digest(j.id,gen_random_uuid()) IS NOT NULL THEN RAISE EXCEPTION 'Digest sent outside its lease';END IF;
  UPDATE public.delivery_jobs SET state='running',lease_token=gen_random_uuid(),locked_until=now()+interval '1 minute' WHERE id=j.id RETURNING * INTO j;
  IF public.prepare_form_daily_digest(j.id,j.lease_token) IS DISTINCT FROM j.payload THEN RAISE EXCEPTION 'Valid digest lost';END IF;
  DELETE FROM public.form_responses WHERE form_id=f;
 END LOOP;
 UPDATE public.forms SET state='Closed' WHERE id=f;
 IF public.queue_form_daily_digest('2026-12-15 23:00 America/New_York')<>0 THEN RAISE EXCEPTION 'Digest queued without live forms';END IF;
 UPDATE public.forms SET state='Open' WHERE id=f;
 IF public.queue_form_daily_digest('2026-12-16 23:00 America/New_York')<>1 THEN RAISE EXCEPTION 'Empty live form skipped';END IF;
 SELECT payload->'forms'->0 INTO n FROM public.delivery_jobs WHERE deduplication_key='form-digest:2026-12-16';
 IF(n->>'total')::integer<>0 OR(n->>'today')::integer<>0 THEN RAISE EXCEPTION 'Zero response form counts';END IF;
 IF has_function_privilege('authenticated','public.queue_form_daily_digest(timestamptz)','execute') OR has_function_privilege('anon','public.prepare_form_daily_digest(uuid,uuid)','execute') THEN RAISE EXCEPTION 'Browser digest access';END IF;
END $$;
ROLLBACK;
