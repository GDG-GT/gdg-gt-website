BEGIN;
DO $$ BEGIN
 IF gdg_security.media_mime_limit('video/mp4')<>52428800
 OR gdg_security.media_mime_limit('video/webm')<>52428800
 OR gdg_security.media_mime_limit('image/png')<>20971520
 OR gdg_security.media_mime_limit('application/zip')<>26214400
 OR gdg_security.media_mime_limit('image/svg+xml')<>0 THEN RAISE EXCEPTION 'Free media file limit mismatch';END IF;
 IF pg_get_functiondef('public.finish_form_export(uuid,uuid,bigint,text,text)'::regprocedure) NOT LIKE '%p_bytes NOT BETWEEN 1 AND 52428800%' THEN RAISE EXCEPTION 'Free export ceiling not enforced';END IF;
 IF has_function_privilege('anon','public.finish_form_export(uuid,uuid,bigint,text,text)','EXECUTE')
 OR has_function_privilege('authenticated','public.finish_form_export(uuid,uuid,bigint,text,text)','EXECUTE') THEN RAISE EXCEPTION 'Export worker privilege exposed';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.upload_intents'::regclass AND conname='free_storage_file_ceiling') THEN RAISE EXCEPTION 'File size guard missing';END IF;
END $$;
ROLLBACK;
