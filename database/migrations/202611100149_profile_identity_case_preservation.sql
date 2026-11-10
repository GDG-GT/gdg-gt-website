BEGIN;
-- Normalizing a legacy private email during metadata-only linking must not
-- demote an otherwise unchanged published biography.
DO $$ DECLARE source text;updated text;BEGIN
 source:=pg_get_functiondef('gdg_security.guard_team_profile_identity()'::regprocedure);
 updated:=replace(source,'NEW.email:=nullif(lower(btrim(NEW.email)),'''');',
 'IF TG_OP=''INSERT'' OR NEW.email IS DISTINCT FROM OLD.email THEN NEW.email:=nullif(lower(btrim(NEW.email)),'''');END IF;');
 updated:=replace(updated,'IF NEW.email IS NOT NULL AND NEW.deleted_at IS NULL','IF nullif(btrim(NEW.email),'''') IS NOT NULL AND NEW.deleted_at IS NULL');
 updated:=replace(updated,'lower(btrim(p.email))=NEW.email','lower(btrim(p.email))=lower(btrim(NEW.email))');
 IF updated=source THEN RAISE EXCEPTION 'Profile identity normalization target changed';END IF;
 EXECUTE updated;
END $$;
COMMIT;
