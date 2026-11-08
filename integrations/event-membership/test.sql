BEGIN;
INSERT INTO auth.users(id) VALUES('b3100000-0000-4000-8000-000000000001'),('b3100000-0000-4000-8000-000000000002');
INSERT INTO public.gdg_event_registrations(account_id,status) VALUES('b3100000-0000-4000-8000-000000000001','registered'),('b3100000-0000-4000-8000-000000000002','waitlisted');
SELECT public.gdg_event_bind('b3100000-0000-4000-8000-000000000001','b3100000-0000-4000-8000-000000000011');
SELECT public.gdg_event_bind('b3100000-0000-4000-8000-000000000002','b3100000-0000-4000-8000-000000000012');
DO $$ DECLARE r jsonb;first_id text;BEGIN
 r:=public.gdg_event_attendance('b3100000-0000-4000-8000-000000000011');IF r->>'status'<>'registered' OR(r->>'checkedIn')::boolean THEN RAISE EXCEPTION 'Lookup created attendance';END IF;
 r:=public.gdg_event_attendance('b3100000-0000-4000-8000-000000000011','b3100000-0000-4000-8000-000000000021');first_id:=r->>'checkinId';IF NOT(r->>'checkedIn')::boolean THEN RAISE EXCEPTION 'Registered member could not check in';END IF;
 r:=public.gdg_event_attendance('b3100000-0000-4000-8000-000000000011','b3100000-0000-4000-8000-000000000022');IF r->>'checkinId'<>first_id THEN RAISE EXCEPTION 'Second tap duplicated attendance';END IF;
 r:=public.gdg_event_attendance('b3100000-0000-4000-8000-000000000012','b3100000-0000-4000-8000-000000000023');IF(r->>'checkedIn')::boolean OR(SELECT count(*) FROM public.gdg_event_checkins)<>1 THEN RAISE EXCEPTION 'Waitlisted user got attendance';END IF;
 UPDATE public.gdg_event_registrations SET status='cancelled' WHERE member_ref='b3100000-0000-4000-8000-000000000011';
 r:=public.gdg_event_attendance('b3100000-0000-4000-8000-000000000011');IF(r->>'checkedIn')::boolean OR r->>'checkinId' IS NOT NULL THEN RAISE EXCEPTION 'Cancelled user still eligible';END IF;
 r:=public.gdg_event_attendance('b3100000-0000-4000-8000-000000000099');IF r->>'status'<>'not_registered' THEN RAISE EXCEPTION 'Unknown registration accepted';END IF;
 BEGIN PERFORM public.gdg_event_bind('b3100000-0000-4000-8000-000000000001','b3100000-0000-4000-8000-000000000099');RAISE EXCEPTION 'Member ref rebound';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'LINK_CONFLICT' THEN RAISE;END IF;END;
 IF has_table_privilege('anon','public.gdg_event_registrations','SELECT') OR has_table_privilege('authenticated','public.gdg_event_checkins','INSERT') OR has_function_privilege('authenticated','public.gdg_event_attendance(uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Private registration data exposed';END IF;
 DELETE FROM auth.users WHERE id='b3100000-0000-4000-8000-000000000001';
 IF EXISTS(SELECT 1 FROM public.gdg_event_registrations WHERE account_id='b3100000-0000-4000-8000-000000000001') OR EXISTS(SELECT 1 FROM public.gdg_event_checkins) THEN RAISE EXCEPTION 'Deleting event user left linked private records';END IF;
END $$;
ROLLBACK;
