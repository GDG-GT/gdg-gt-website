BEGIN;
-- Read-marker updates are not permission changes and must not cause reconnects.
DROP TRIGGER realtime_room_authorization ON public.channel_memberships;
CREATE TRIGGER realtime_room_authorization AFTER INSERT OR UPDATE OF role,is_active,admin_user_id,channel_id OR DELETE
 ON public.channel_memberships FOR EACH ROW EXECUTE FUNCTION gdg_security.broadcast_authorization_change();
DROP TRIGGER realtime_team_authorization ON public.team_memberships;
CREATE TRIGGER realtime_team_authorization AFTER INSERT OR UPDATE OF role,is_active,admin_user_id,team_id OR DELETE
 ON public.team_memberships FOR EACH ROW EXECUTE FUNCTION gdg_security.broadcast_authorization_change();
COMMIT;
