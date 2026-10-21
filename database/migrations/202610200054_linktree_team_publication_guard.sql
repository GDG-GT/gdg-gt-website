BEGIN;
CREATE FUNCTION gdg_security.unpublish_inactive_team_linktrees() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF (OLD.is_active AND NOT NEW.is_active) OR (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL) THEN
  UPDATE public.linktree_profiles SET is_active=false,revision=revision+1,updated_at=clock_timestamp() WHERE team_id=NEW.id AND is_active;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER linktree_team_publication_guard AFTER UPDATE OF is_active,deleted_at ON public.admin_teams
 FOR EACH ROW EXECUTE FUNCTION gdg_security.unpublish_inactive_team_linktrees();
REVOKE ALL ON FUNCTION gdg_security.unpublish_inactive_team_linktrees() FROM PUBLIC,anon,authenticated,gdg_realtime;
COMMIT;
