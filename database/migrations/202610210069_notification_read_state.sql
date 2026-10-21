BEGIN;
-- Unknown legacy read state must remain visible/unread, never silently dismissed.
UPDATE public.notifications SET is_read=false WHERE is_read IS NULL;
ALTER TABLE public.notifications ALTER COLUMN is_read SET DEFAULT false,ALTER COLUMN is_read SET NOT NULL;
COMMIT;
