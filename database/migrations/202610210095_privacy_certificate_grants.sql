BEGIN;
-- Supabase's postgres default table privileges differ from standalone Postgres.
-- Explicitly remove inherited-at-creation service grants before granting SELECT.
-- Only the fixed-search-path, fully authenticated commit/review functions write
-- these frozen reviews and transaction-bound erasure/purge certificates.
REVOKE ALL ON public.person_privacy_reviews,public.person_privacy_cleanup,gdg_security.person_privacy_erasure_grants,public.form_purge_certificates FROM service_role;
GRANT SELECT ON public.person_privacy_reviews,public.person_privacy_cleanup,gdg_security.person_privacy_erasure_grants,public.form_purge_certificates TO service_role;
ALTER FUNCTION public.review_person_privacy(uuid,uuid,text,text,text,text,text,uuid[],jsonb,boolean,text,text,uuid) SECURITY DEFINER;
ALTER FUNCTION public.permanently_delete_form(uuid,uuid,text,uuid,integer,uuid,text,text,boolean,text,text,uuid) SECURITY DEFINER;
COMMIT;
