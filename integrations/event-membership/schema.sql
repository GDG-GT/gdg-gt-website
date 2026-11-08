-- Apply ONLY to the separate event Supabase project. One project per event.
BEGIN;
CREATE TABLE public.gdg_event_registrations(account_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,member_ref uuid UNIQUE,status text NOT NULL CHECK(status IN('registered','waitlisted','cancelled')),updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.gdg_event_checkins(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),account_id uuid UNIQUE NOT NULL REFERENCES public.gdg_event_registrations(account_id) ON DELETE CASCADE,request_id uuid UNIQUE NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.gdg_event_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gdg_event_checkins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gdg_event_registrations,public.gdg_event_checkins FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.gdg_event_registrations,public.gdg_event_checkins TO service_role;
CREATE FUNCTION public.gdg_event_bind(p_account uuid,p_member uuid) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN
 PERFORM 1 FROM public.gdg_event_registrations WHERE account_id=p_account FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'NOT_REGISTERED';END IF;
 IF EXISTS(SELECT 1 FROM public.gdg_event_registrations WHERE account_id=p_account AND member_ref IS NOT NULL AND member_ref<>p_member) THEN RAISE EXCEPTION 'LINK_CONFLICT';END IF;
 UPDATE public.gdg_event_registrations SET member_ref=p_member,updated_at=now() WHERE account_id=p_account;
END $$;
CREATE FUNCTION public.gdg_event_attendance(p_member uuid,p_request uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ DECLARE r public.gdg_event_registrations;c public.gdg_event_checkins;BEGIN
 SELECT * INTO r FROM public.gdg_event_registrations WHERE member_ref=p_member FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','not_registered','checkedIn',false,'checkinId',NULL);END IF;
 SELECT * INTO c FROM public.gdg_event_checkins WHERE account_id=r.account_id;
 IF p_request IS NOT NULL AND r.status='registered' THEN
  INSERT INTO public.gdg_event_checkins(account_id,request_id) VALUES(r.account_id,p_request) ON CONFLICT(account_id) DO NOTHING;
  SELECT * INTO c FROM public.gdg_event_checkins WHERE account_id=r.account_id;
 END IF;
 RETURN jsonb_build_object('status',r.status,'checkedIn',r.status='registered' AND c.id IS NOT NULL,'checkinId',CASE WHEN r.status='registered' THEN c.id ELSE NULL END);
END $$;
REVOKE ALL ON FUNCTION public.gdg_event_bind(uuid,uuid),public.gdg_event_attendance(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gdg_event_bind(uuid,uuid),public.gdg_event_attendance(uuid,uuid) TO service_role;
COMMIT;
