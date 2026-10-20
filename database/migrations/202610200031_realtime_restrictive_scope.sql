BEGIN;
-- A future permissive policy (including one targeting PUBLIC) must not widen
-- this socket role's scope. Do not remove policies belonging to other users.
DO $$ BEGIN IF to_regclass('realtime.messages') IS NOT NULL THEN
 CREATE POLICY gdg_scoped_broadcast_boundary ON realtime.messages AS RESTRICTIVE FOR SELECT TO gdg_realtime
  USING(extension='broadcast' AND (SELECT gdg_security.realtime_allowed((SELECT realtime.topic()))));
END IF;END $$;
COMMIT;
