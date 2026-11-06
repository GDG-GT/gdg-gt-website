BEGIN;
CREATE FUNCTION public.inspect_form_library_write(p_actor uuid,p_session uuid,p_source uuid,p_action text,p_key_hash text,
 p_request_hash text DEFAULT NULL,p_team uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE f public.forms;target public.forms;k public.idempotency_keys;required text;destination uuid;BEGIN
 IF p_action IS NULL OR p_action NOT IN('create','duplicate','archive','restore','state')
 OR(p_action='create') IS DISTINCT FROM(p_source IS NULL)
 OR p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$'
 OR(p_request_hash IS NOT NULL AND p_request_hash!~'^[a-f0-9]{64}$') THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 IF NOT gdg_security.member_transfer_session(p_actor,p_session) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_source IS NOT NULL THEN
  SELECT * INTO f FROM public.forms WHERE id=p_source AND permanently_deleted_at IS NULL;
  IF NOT FOUND OR NOT public.can_operate_form(p_actor,p_source,'view') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  required:=CASE WHEN p_action IN('archive','restore') THEN 'delete' WHEN p_action='state' THEN 'publish' ELSE 'view' END;
  IF NOT public.can_operate_form(p_actor,p_source,required) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 END IF;
 destination:=CASE WHEN p_action='duplicate' THEN f.team_id ELSE p_team END;
 IF p_action IN('create','duplicate') AND NOT public.can_operate_form(p_actor,NULL,'create',destination) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT * INTO k FROM public.idempotency_keys WHERE scope='form-library:'||p_actor AND key_hash=p_key_hash;
 IF FOUND THEN
  IF k.result->>'action' IS DISTINCT FROM p_action OR k.result->>'sourceId' IS DISTINCT FROM p_source::text
   OR(p_action='create' AND k.result->>'teamId' IS DISTINCT FROM p_team::text)
   OR(p_request_hash IS NOT NULL AND k.request_hash IS DISTINCT FROM p_request_hash) THEN RAISE EXCEPTION 'CONFLICT';END IF;
  IF k.expires_at<=now() THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  SELECT * INTO target FROM public.forms WHERE id=(k.result->>'id')::uuid AND permanently_deleted_at IS NULL;
  IF NOT FOUND OR NOT public.can_operate_form(p_actor,target.id,'view')
   OR(p_action IN('create','duplicate') AND NOT public.can_operate_form(p_actor,NULL,'create',target.team_id))
   THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  RETURN jsonb_build_object('committed',true,'receipt',k.result,'form',to_jsonb(target),'canCreate',p_action IN('create','duplicate'));
 END IF;
 RETURN jsonb_build_object('committed',false,'form',CASE WHEN p_source IS NULL THEN NULL ELSE to_jsonb(f) END,'canCreate',p_action IN('create','duplicate'));
END $$;
CREATE FUNCTION public.mutate_form_library(p_actor uuid,p_session uuid,p_source uuid,p_action text,p_revision integer,p_document jsonb,
 p_template text,p_key_hash text,p_request_hash text,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE inspected jsonb;f public.forms;result jsonb;destination uuid;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('private-media',0));
 PERFORM 1 FROM public.admin_users WHERE id=p_actor FOR UPDATE;
 PERFORM 1 FROM public.admin_sessions WHERE id=p_session AND admin_user_id=p_actor FOR UPDATE;
 IF p_source IS NOT NULL THEN SELECT * INTO f FROM public.forms WHERE id=p_source FOR UPDATE;END IF;
 IF p_document IS NULL OR jsonb_typeof(p_document)<>'object' OR p_request_hash IS NULL
 OR(p_action<>'create' AND(p_revision IS NULL OR p_revision<1)) THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 destination:=CASE WHEN p_action='create' THEN(p_document->>'team_id')::uuid ELSE NULL END;
 inspected:=public.inspect_form_library_write(p_actor,p_session,p_source,p_action,p_key_hash,p_request_hash,destination);
 IF(inspected->>'committed')::boolean THEN RETURN inspected->'form';END IF;
 IF p_action='create' THEN
  result:=public.create_form_from_template(p_actor,p_document,p_template,p_request_id);
 ELSIF p_action='duplicate' THEN
  IF f.draft_revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'CONFLICT';END IF;
  result:=public.create_form_from_template(p_actor,jsonb_build_object('slug',p_document->>'slug','team_id',f.team_id,
   'definition',f.draft_definition||jsonb_build_object('title',f.title||' (copy)')),f.template_key,p_request_id);
 ELSE
  result:=public.mutate_form(p_actor,p_source,p_action,p_revision,p_document,NULL,p_request_id);
 END IF;
 IF NOT public.can_operate_form(p_actor,(result->>'id')::uuid,'view') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result)
 VALUES('form-library:'||p_actor,p_key_hash,p_request_hash,200,jsonb_build_object('id',result->>'id','sourceId',p_source,
  'action',p_action,'teamId',destination,'revision',(result->>'draft_revision')::integer));
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.inspect_form_library_write(uuid,uuid,uuid,text,text,text,uuid),
 public.mutate_form_library(uuid,uuid,uuid,text,integer,jsonb,text,text,text,uuid) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.inspect_form_library_write(uuid,uuid,uuid,text,text,text,uuid),
 public.mutate_form_library(uuid,uuid,uuid,text,integer,jsonb,text,text,text,uuid) TO service_role;
COMMIT;
