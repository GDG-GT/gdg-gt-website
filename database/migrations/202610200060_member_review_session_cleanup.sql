BEGIN;
-- The five-minute approval proof is not business history. Session cleanup may
-- remove it without deleting either member or the append-only merge audit.
ALTER TABLE gdg_security.member_merge_reviews DROP CONSTRAINT member_merge_reviews_session_id_fkey,
 ADD CONSTRAINT member_merge_reviews_session_id_fkey FOREIGN KEY(session_id) REFERENCES public.admin_sessions(id) ON DELETE CASCADE;
CREATE INDEX member_merge_review_session ON gdg_security.member_merge_reviews(session_id);
COMMIT;
