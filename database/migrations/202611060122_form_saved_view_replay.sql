BEGIN;
ALTER TABLE public.form_saved_views ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK(revision>=1);
CREATE FUNCTION gdg_security.advance_form_view_revision() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN NEW.revision:=OLD.revision+1;NEW.updated_at:=clock_timestamp();RETURN NEW;END $$;
CREATE TRIGGER form_saved_view_revision BEFORE UPDATE ON public.form_saved_views FOR EACH ROW EXECUTE FUNCTION gdg_security.advance_form_view_revision();
REVOKE ALL ON FUNCTION gdg_security.advance_form_view_revision() FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION gdg_security.advance_form_view_revision() TO service_role;
CREATE FUNCTION public.inspect_form_view_write(p_actor uuid,p_session uuid,p_form uuid,p_view uuid,p_action text,p_key_hash text,p_request_hash text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE v public.form_saved_views;k public.idempotency_keys;BEGIN
 IF p_action IS NULL OR p_action NOT IN('create','replace','remove') OR(p_action='create') IS DISTINCT FROM(p_view IS NULL)
  OR p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$' OR(p_request_hash IS NOT NULL AND p_request_hash!~'^[a-f0-9]{64}$') THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 IF NOT gdg_security.member_transfer_session(p_actor,p_session)
  OR NOT EXISTS(SELECT 1 FROM public.forms WHERE id=p_form AND permanently_deleted_at IS NULL)
  OR NOT public.can_operate_form(p_actor,p_form,'view') OR NOT public.can_operate_form(p_actor,p_form,'view_responses') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT * INTO k FROM public.idempotency_keys WHERE scope='form-view-write:'||p_actor||':'||p_session AND key_hash=p_key_hash;
 IF FOUND THEN
  IF k.result->>'formId' IS DISTINCT FROM p_form::text OR k.result->>'action' IS DISTINCT FROM p_action
   OR k.result->>'sourceId' IS DISTINCT FROM p_view::text OR(p_request_hash IS NOT NULL AND k.request_hash IS DISTINCT FROM p_request_hash) THEN RAISE EXCEPTION 'CONFLICT';END IF;
  IF k.expires_at<=now() THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  SELECT * INTO v FROM public.form_saved_views WHERE id=(k.result->>'id')::uuid AND form_id=p_form AND owner_id=p_actor;
  RETURN jsonb_build_object('committed',true,'canRetry',false,'receipt',k.result,'view',CASE WHEN FOUND THEN to_jsonb(v) ELSE NULL END);
 END IF;
 IF p_view IS NOT NULL THEN
  SELECT * INTO v FROM public.form_saved_views WHERE id=p_view AND form_id=p_form AND owner_id=p_actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 END IF;
 RETURN jsonb_build_object('committed',false,'canRetry',true,'view',CASE WHEN p_view IS NULL THEN NULL ELSE to_jsonb(v) END);
END $$;
CREATE FUNCTION public.mutate_form_view_write(p_actor uuid,p_session uuid,p_form uuid,p_view uuid,p_action text,p_document jsonb,p_key_hash text,p_request_hash text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v public.form_saved_views;inspected jsonb;receipt jsonb;BEGIN
 IF p_document IS NULL OR jsonb_typeof(p_document)<>'object' OR p_request_hash IS NULL OR p_request_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 IF p_action IN('replace','remove') AND(jsonb_typeof(p_document->'revision') IS DISTINCT FROM 'number' OR(p_document->>'revision')::numeric<1 OR(p_document->>'revision')::numeric<>trunc((p_document->>'revision')::numeric)) THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 IF p_action<>'remove' AND(p_document->>'name' IS NULL OR btrim(p_document->>'name')='' OR char_length(btrim(p_document->>'name'))>100 OR jsonb_typeof(p_document->'filters') IS DISTINCT FROM 'object' OR jsonb_typeof(p_document->'columns') IS DISTINCT FROM 'array' OR jsonb_array_length(p_document->'columns')>200) THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));
 PERFORM 1 FROM public.admin_users WHERE id=p_actor FOR UPDATE;
 PERFORM 1 FROM public.admin_sessions WHERE id=p_session AND admin_user_id=p_actor FOR UPDATE;
 PERFORM 1 FROM public.forms WHERE id=p_form FOR UPDATE;
 IF p_view IS NOT NULL THEN SELECT * INTO v FROM public.form_saved_views WHERE id=p_view AND form_id=p_form AND owner_id=p_actor FOR UPDATE;END IF;
 inspected:=public.inspect_form_view_write(p_actor,p_session,p_form,p_view,p_action,p_key_hash,p_request_hash);
 IF(inspected->>'committed')::boolean THEN RETURN inspected;END IF;
 IF p_action<>'create' AND v.revision IS DISTINCT FROM(p_document->>'revision')::integer THEN RAISE EXCEPTION 'CONFLICT';END IF;
 IF p_action<>'remove' AND EXISTS(SELECT 1 FROM public.form_saved_views WHERE form_id=p_form AND owner_id=p_actor AND name=btrim(p_document->>'name') AND id IS DISTINCT FROM p_view) THEN RAISE EXCEPTION 'DUPLICATE';END IF;
 IF p_action='create' THEN
  INSERT INTO public.form_saved_views(form_id,owner_id,name,filters,columns) VALUES(p_form,p_actor,btrim(p_document->>'name'),p_document->'filters',ARRAY(SELECT jsonb_array_elements_text(p_document->'columns'))) RETURNING * INTO v;
 ELSIF p_action='replace' THEN
  UPDATE public.form_saved_views SET name=btrim(p_document->>'name'),filters=p_document->'filters',columns=ARRAY(SELECT jsonb_array_elements_text(p_document->'columns')) WHERE id=p_view RETURNING * INTO v;
 ELSE DELETE FROM public.form_saved_views WHERE id=p_view RETURNING * INTO v;
 END IF;
 receipt:=jsonb_build_object('id',v.id,'formId',p_form,'sourceId',p_view,'action',p_action);
 INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result) VALUES('form-view-write:'||p_actor||':'||p_session,p_key_hash,p_request_hash,200,receipt);
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata) VALUES(p_actor,CASE WHEN p_action='remove' THEN 'forms.saved_view_removed' ELSE 'forms.saved_view_saved' END,'form',p_form,p_request_id,jsonb_build_object('viewId',v.id,'revision',v.revision,'operation',p_action));
 RETURN jsonb_build_object('committed',true,'canRetry',false,'receipt',receipt,'view',CASE WHEN p_action='remove' THEN NULL ELSE to_jsonb(v) END);
END $$;
REVOKE ALL ON FUNCTION public.inspect_form_view_write(uuid,uuid,uuid,uuid,text,text,text),public.mutate_form_view_write(uuid,uuid,uuid,uuid,text,jsonb,text,text,uuid) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.inspect_form_view_write(uuid,uuid,uuid,uuid,text,text,text),public.mutate_form_view_write(uuid,uuid,uuid,uuid,text,jsonb,text,text,uuid) TO service_role;
COMMIT;
