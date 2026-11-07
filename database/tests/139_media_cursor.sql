BEGIN;
DO $$ DECLARE actor uuid;sid uuid;f1 uuid;f2 uuid;f3 uuid;r jsonb;at timestamptz;last_id uuid;BEGIN
 INSERT INTO public.admin_users(email,password_hash,role,is_active) VALUES('fictional-media-cursor@example.test','fictional-proof','admin',true) RETURNING id INTO actor;
 INSERT INTO public.admin_sessions(admin_user_id,token_hash) VALUES(actor,repeat('b',64)) RETURNING id INTO sid;
 INSERT INTO public.media_files(name,original_name,file_type,mime_type,file_size,file_path,uploaded_by,created_at) VALUES('Fictional cursor A','a.png','image','image/png',10,'private/fictional-cursor-a',actor,'2026-01-01') RETURNING id INTO f1;
 INSERT INTO public.media_files(name,original_name,file_type,mime_type,file_size,file_path,uploaded_by,created_at) VALUES('Fictional cursor B','b.png','image','image/png',10,'private/fictional-cursor-b',actor,'2026-01-01') RETURNING id INTO f2;
 INSERT INTO public.media_files(name,original_name,file_type,mime_type,file_size,file_path,uploaded_by,created_at) VALUES('Fictional cursor C','c.png','image','image/png',10,'private/fictional-cursor-c',actor,'2025-01-01') RETURNING id INTO f3;
 r:=public.read_media_cursor(actor,sid,'{"q":"Fictional cursor"}',NULL,NULL,1);
 IF NOT(r->>'hasMore')::boolean OR jsonb_array_length(r->'items')<>1 THEN RAISE EXCEPTION 'First media cursor page wrong';END IF;
 last_id:=(r->'items'->0->>'id')::uuid;at:=(r->'items'->0->>'createdAt')::timestamptz;
 -- An insertion ahead of the cursor and metadata edits cannot shift its window.
 INSERT INTO public.media_files(name,original_name,file_type,mime_type,file_size,file_path,uploaded_by,created_at) VALUES('Fictional cursor new','new.png','image','image/png',10,'private/fictional-cursor-new',actor,now());
 UPDATE public.media_files SET updated_at=now() WHERE id IN(f1,f2,f3);
 r:=public.read_media_cursor(actor,sid,'{"q":"Fictional cursor"}',at,last_id,1);
 IF(r->'items'->0->>'id')::uuid=last_id OR(r->'items'->0->>'id')::uuid=f3 THEN RAISE EXCEPTION 'Tie cursor duplicated or skipped item';END IF;
 last_id:=(r->'items'->0->>'id')::uuid;at:=(r->'items'->0->>'createdAt')::timestamptz;
 r:=public.read_media_cursor(actor,sid,'{"q":"Fictional cursor"}',at,last_id,1);
 IF(r->>'hasMore')::boolean OR(r->'items'->0->>'id')::uuid<>f3 THEN RAISE EXCEPTION 'Cursor tail wrong';END IF;
 UPDATE public.admin_sessions SET revoked_at=now() WHERE id=sid;
 BEGIN PERFORM public.read_media_cursor(actor,sid,'{}',NULL,NULL,1);RAISE EXCEPTION 'Revoked media session accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'NOT_FOUND' THEN RAISE;END IF;END;
 IF has_function_privilege('anon','public.read_media_cursor(uuid,uuid,jsonb,timestamptz,uuid,integer)','EXECUTE') OR has_function_privilege('authenticated','public.read_media_cursor(uuid,uuid,jsonb,timestamptz,uuid,integer)','EXECUTE') THEN RAISE EXCEPTION 'Unsafe media cursor grants';END IF;
END $$;
ROLLBACK;
