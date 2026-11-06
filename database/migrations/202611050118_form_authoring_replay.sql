BEGIN;
-- Receipts contain identifiers/revisions only. A replay always checks current
-- session and action authority and projects the current record, never old data.
CREATE FUNCTION public.inspect_form_authoring_write(p_actor uuid,p_session uuid,p_id uuid,p_action text,p_key_hash text,p_request_hash text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE f public.forms;k public.idempotency_keys;BEGIN
 IF p_action IS NULL OR p_action NOT IN('draft','publish') OR p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$'
 OR(p_request_hash IS NOT NULL AND p_request_hash!~'^[a-f0-9]{64}$') THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 IF NOT gdg_security.member_transfer_session(p_actor,p_session)
 OR NOT public.can_operate_form(p_actor,p_id,'view')
 OR NOT public.can_operate_form(p_actor,p_id,CASE WHEN p_action='publish' THEN 'publish' ELSE 'edit' END)
 THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT * INTO f FROM public.forms WHERE id=p_id AND permanently_deleted_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT * INTO k FROM public.idempotency_keys WHERE scope='form-authoring:'||p_actor AND key_hash=p_key_hash;
 IF FOUND THEN
  IF k.result->>'id' IS DISTINCT FROM p_id::text OR k.result->>'action' IS DISTINCT FROM p_action
   OR(p_request_hash IS NOT NULL AND k.request_hash IS DISTINCT FROM p_request_hash) THEN RAISE EXCEPTION 'CONFLICT';END IF;
  IF k.expires_at<=now() THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  RETURN jsonb_build_object('committed',true,'receipt',k.result,'form',to_jsonb(f));
 END IF;
 RETURN jsonb_build_object('committed',false,'form',to_jsonb(f));
END $$;
CREATE FUNCTION public.mutate_form_authoring(p_actor uuid,p_session uuid,p_id uuid,p_action text,p_revision integer,p_document jsonb,
 p_schema_hash text,p_key_hash text,p_request_hash text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE inspected jsonb;result jsonb;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('private-media',0));
 PERFORM 1 FROM public.admin_users WHERE id=p_actor FOR UPDATE;
 PERFORM 1 FROM public.admin_sessions WHERE id=p_session AND admin_user_id=p_actor FOR UPDATE;
 PERFORM 1 FROM public.forms WHERE id=p_id FOR UPDATE;
 IF p_revision IS NULL OR p_revision<1 OR p_document IS NULL OR jsonb_typeof(p_document)<>'object'
 OR p_request_hash IS NULL THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 inspected:=public.inspect_form_authoring_write(p_actor,p_session,p_id,p_action,p_key_hash,p_request_hash);
 IF(inspected->>'committed')::boolean THEN RETURN inspected->'form';END IF;
 result:=public.mutate_form(p_actor,p_id,p_action,p_revision,p_document,p_schema_hash,p_request_id);
 INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result)
 VALUES('form-authoring:'||p_actor,p_key_hash,p_request_hash,200,jsonb_build_object('id',p_id,'action',p_action,
  'revision',(result->>'draft_revision')::integer,'versionId',result->>'published_version_id'));
 -- A changed destination cannot make an accepted replay disclose inaccessible data.
 IF NOT public.can_operate_form(p_actor,p_id,'view') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.inspect_form_authoring_write(uuid,uuid,uuid,text,text,text),
 public.mutate_form_authoring(uuid,uuid,uuid,text,integer,jsonb,text,text,text,uuid) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.inspect_form_authoring_write(uuid,uuid,uuid,text,text,text),
 public.mutate_form_authoring(uuid,uuid,uuid,text,integer,jsonb,text,text,text,uuid) TO service_role;
COMMIT;
