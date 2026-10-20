BEGIN;
-- Own-profile and password endpoints also participate in optimistic account
-- revisions. Login timestamps do not invalidate an administrator's edit.
CREATE FUNCTION public.account_revision_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF ROW(NEW.email,NEW.display_name,NEW.role,NEW.is_active,NEW.password_hash,NEW.must_change_password,NEW.deleted_at)
  IS DISTINCT FROM ROW(OLD.email,OLD.display_name,OLD.role,OLD.is_active,OLD.password_hash,OLD.must_change_password,OLD.deleted_at)
  AND NEW.revision<=OLD.revision THEN NEW.revision:=OLD.revision+1;NEW.updated_at:=now();END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER account_revision_guard BEFORE UPDATE ON public.admin_users FOR EACH ROW EXECUTE FUNCTION public.account_revision_guard();
REVOKE ALL ON FUNCTION public.account_revision_guard() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.account_revision_guard() TO service_role;
COMMIT;
