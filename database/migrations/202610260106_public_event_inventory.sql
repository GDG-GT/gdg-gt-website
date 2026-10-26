BEGIN;
-- Server-only public projection. Availability is derived in the same read as
-- filters/count/pagination; no participant identity or mutable counter escapes.
CREATE VIEW public.public_event_inventory
WITH (security_invoker=true, security_barrier=true) AS
SELECT inventory.*,
 CASE registration_state WHEN 'open' THEN 0 WHEN 'full' THEN 1
  WHEN 'closed' THEN 2 ELSE 3 END AS registration_priority
FROM (
 SELECT e.id,e.title,e.slug,e.short_description,e.description,e.start_at,e.end_at,
  e.timezone,e.location,e.room,e.type,e.level,e.image_url,e.image_media_id,
  e.event_link,e.registration_url,e.google_form_url,e.google_event_url,
  e.registration_type,e.registration_enabled,e.max_participants,e.is_featured,
  e.prerequisites,e.what_youll_learn,e.what_to_bring,e.schedule,e.additional_info,
  e.contact_info,e.publication_status,e.published_at,e.updated_at,e.created_at,e.revision,
  CASE WHEN NOT e.registration_enabled THEN 'closed'
   WHEN coalesce(e.end_at,e.start_at)<=now() THEN 'ended'
   WHEN e.max_participants IS NOT NULL AND a.internal_count+e.external_attendees>=e.max_participants THEN 'full'
   ELSE 'open' END AS registration_state
 FROM public.events e
 LEFT JOIN LATERAL (
  SELECT count(*) AS internal_count FROM public.event_attendance r
  WHERE r.event_id=e.id AND r.deleted_at IS NULL
   AND e.max_participants IS NOT NULL AND e.registration_enabled
   AND coalesce(e.end_at,e.start_at)>now()
 ) a ON true
 WHERE e.publication_status='published'
) inventory;
REVOKE ALL ON public.public_event_inventory FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.public_event_inventory TO service_role;
COMMENT ON VIEW public.public_event_inventory IS
 'Server-only published event projection with derived availability; no participant identities or private author fields.';
NOTIFY pgrst, 'reload schema';
COMMIT;
