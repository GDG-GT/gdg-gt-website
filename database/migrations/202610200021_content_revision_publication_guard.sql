BEGIN;
CREATE FUNCTION public.guard_content_revision() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF TG_TABLE_NAME='resources' THEN NEW:=jsonb_populate_record(NEW,'{"views":0}');END IF;
  RETURN NEW;
 END IF;
 -- A normal edit cannot bypass a separate publication grant, including edits
 -- through the existing own-profile endpoint. Re-publication is explicit.
 IF OLD.is_active AND NEW.is_active AND
  (to_jsonb(NEW)-ARRAY['is_active','revision','updated_at','views','deleted_at']) IS DISTINCT FROM
  (to_jsonb(OLD)-ARRAY['is_active','revision','updated_at','views','deleted_at']) THEN NEW.is_active:=false;END IF;
 IF NEW.revision=OLD.revision AND (to_jsonb(NEW)-ARRAY['revision','updated_at','views']) IS DISTINCT FROM
  (to_jsonb(OLD)-ARRAY['revision','updated_at','views']) THEN NEW.revision:=OLD.revision+1;END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE name text;BEGIN
 FOREACH name IN ARRAY ARRAY['resources','sponsors','sponsorship_tiers','sponsor_impact_stats','team_members'] LOOP
  EXECUTE format('CREATE TRIGGER content_revision_guard BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_content_revision()',name);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.guard_content_revision() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_content_revision() TO service_role;
COMMIT;
