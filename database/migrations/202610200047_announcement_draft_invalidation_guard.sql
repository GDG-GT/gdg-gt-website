BEGIN;
CREATE OR REPLACE FUNCTION gdg_security.broadcast_chapter_announcement() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ids uuid[]:='{}';target uuid;BEGIN
 IF to_regprocedure('realtime.send(jsonb,text,text,boolean)') IS NULL THEN RETURN NULL;END IF;
 -- Draft/schedule activity stays with managers. Readers receive invalidations
 -- only for a currently or previously published announcement, without its ID.
 IF NEW.state='Published' THEN ids:=public.announcement_audience_ids(NEW.target_audience);END IF;
 IF TG_OP='UPDATE' AND OLD.state='Published' THEN ids:=ids||public.announcement_audience_ids(OLD.target_audience);END IF;
 FOR target IN SELECT id FROM public.admin_users WHERE is_active AND deleted_at IS NULL AND NOT must_change_password AND(id=ANY(ids) OR role IN('super_admin','admin')) LIMIT 1100 LOOP
  PERFORM realtime.send(jsonb_build_object('kind','announcement-directory'),'changed','gdg:user:'||target,true);
 END LOOP;
 RETURN NULL;
END $$;
COMMIT;
