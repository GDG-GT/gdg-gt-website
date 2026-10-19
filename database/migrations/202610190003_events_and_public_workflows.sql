BEGIN;
ALTER TABLE public.events RENAME COLUMN date TO start_at;
ALTER TABLE public.events
  ADD COLUMN slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  ADD COLUMN short_description text NOT NULL DEFAULT '',
  ADD COLUMN end_at timestamptz,
  ADD COLUMN publication_status text NOT NULL DEFAULT 'draft'
    CHECK (publication_status IN ('draft','published','cancelled','archived')),
  ADD COLUMN published_at timestamptz,
  ADD COLUMN image_media_id uuid REFERENCES public.media_files(id) ON DELETE SET NULL,
  ADD COLUMN created_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  ADD COLUMN updated_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  ADD CONSTRAINT events_end_after_start CHECK (end_at IS NULL OR end_at>start_at),
  ADD CONSTRAINT events_valid_capacity CHECK (max_participants IS NULL OR max_participants>0),
  ADD CONSTRAINT events_nonnegative_external CHECK (external_attendees>=0);
ALTER TABLE public.events ALTER COLUMN external_attendees SET DEFAULT 0;
ALTER TABLE public.events ALTER COLUMN external_attendees SET NOT NULL;
ALTER TABLE public.events ALTER COLUMN registration_type SET NOT NULL;
ALTER TABLE public.events ADD CONSTRAINT events_registration_type_check
  CHECK (registration_type IN ('internal','external','both'));
CREATE INDEX events_public_upcoming ON public.events(start_at) WHERE publication_status='published';
CREATE TABLE public.event_slug_redirects (
  old_slug text PRIMARY KEY, event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.event_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE RESTRICT,
  attendee_name text NOT NULL CHECK (char_length(attendee_name) BETWEEN 2 AND 100),
  attendee_email text NOT NULL CHECK (attendee_email=lower(btrim(attendee_email)) AND char_length(attendee_email)<=255),
  notes text CHECK (char_length(notes)<=2000),
  consent_at timestamptz NOT NULL DEFAULT now(),
  registration_date timestamptz NOT NULL DEFAULT now(),
  attended boolean NOT NULL DEFAULT false,
  check_in_time timestamptz,
  idempotency_key text NOT NULL CHECK (idempotency_key ~ '^[a-f0-9]{64}$'),
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id,attendee_email), UNIQUE(event_id,idempotency_key)
);
CREATE INDEX event_attendance_active ON public.event_attendance(event_id) WHERE deleted_at IS NULL;
CREATE TABLE public.contact_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 100),
  email text NOT NULL CHECK (email=lower(btrim(email))),
  inquiry_type text NOT NULL CHECK (inquiry_type IN ('general','membership','event','sponsorship','speaker','accessibility')),
  message text NOT NULL CHECK (char_length(message) BETWEEN 20 AND 5000),
  interests text[] NOT NULL DEFAULT '{}', attachment_upload_id uuid,
  status text NOT NULL DEFAULT 'new', delivery_state text NOT NULL DEFAULT 'pending',
  idempotency_key_hash text NOT NULL UNIQUE, request_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz, retention_hold boolean NOT NULL DEFAULT false
);

CREATE FUNCTION public.register_event_atomic(
  p_slug text, p_name text, p_email text, p_notes text, p_consent boolean,
  p_key_hash text, p_request_hash text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_event public.events; v_existing public.event_attendance; v_count bigint; v_id uuid;
BEGIN
  SELECT * INTO v_event FROM public.events WHERE slug=p_slug FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  SELECT * INTO v_existing FROM public.event_attendance WHERE event_id=v_event.id AND idempotency_key=p_key_hash;
  IF FOUND THEN
    IF v_existing.request_hash<>p_request_hash THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
    RETURN jsonb_build_object('registrationId',v_existing.id,'eventId',v_event.id,'status','registered');
  END IF;
  IF v_event.publication_status<>'published' THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT v_event.registration_enabled OR v_event.registration_type NOT IN ('internal','both')
    OR coalesce(v_event.end_at,v_event.start_at)<=now() THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
  IF p_consent IS DISTINCT FROM true OR p_name IS NULL OR p_email IS NULL
    OR char_length(btrim(p_name)) NOT BETWEEN 2 AND 100 OR char_length(p_email)>255
    OR p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR char_length(coalesce(p_notes,''))>2000 OR p_key_hash !~ '^[a-f0-9]{64}$'
    OR p_request_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'VALIDATION_ERROR'; END IF;
  IF EXISTS(SELECT 1 FROM public.event_attendance WHERE event_id=v_event.id AND attendee_email=lower(btrim(p_email))) THEN
    RAISE EXCEPTION 'DUPLICATE';
  END IF;
  SELECT count(*) INTO v_count FROM public.event_attendance WHERE event_id=v_event.id AND deleted_at IS NULL;
  IF v_event.max_participants IS NOT NULL AND v_count+v_event.external_attendees>=v_event.max_participants THEN
    RAISE EXCEPTION 'EVENT_FULL';
  END IF;
  INSERT INTO public.event_attendance(event_id,attendee_name,attendee_email,notes,idempotency_key,request_hash)
    VALUES(v_event.id,btrim(p_name),lower(btrim(p_email)),p_notes,p_key_hash,p_request_hash) RETURNING id INTO v_id;
  INSERT INTO public.delivery_jobs(kind,deduplication_key,payload)
    VALUES('event_confirmation','event-confirmation:'||v_id,jsonb_build_object('registrationId',v_id));
  RETURN jsonb_build_object('registrationId',v_id,'eventId',v_event.id,'status','registered');
END $$;

-- These replace the source's undefined mutable attendee-counter RPCs: counts are
-- always derived. There is intentionally no increment/decrement browser grant.
CREATE FUNCTION public.event_registration_count(p_event_id uuid) RETURNS bigint
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT count(*) FROM public.event_attendance WHERE event_id=p_event_id AND deleted_at IS NULL
$$;
CREATE FUNCTION public.increment_resource_views(p_resource_id uuid) RETURNS void
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
  UPDATE public.resources SET views=coalesce(views,0)+1 WHERE id=p_resource_id AND is_active
$$;
DO $$ DECLARE t record; BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t.tablename);
  END LOOP;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC,anon,authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
COMMIT;
