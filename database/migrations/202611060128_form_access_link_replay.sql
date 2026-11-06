BEGIN;
ALTER TABLE public.form_access_tokens ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK(revision>=1);
CREATE FUNCTION gdg_security.advance_form_access_link_revision() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN NEW.revision:=OLD.revision+1;RETURN NEW;END $$;
CREATE TRIGGER advance_form_access_link_revision BEFORE UPDATE ON public.form_access_tokens FOR EACH ROW EXECUTE FUNCTION gdg_security.advance_form_access_link_revision();
CREATE FUNCTION public.read_form_access_links(p_actor uuid,p_session uuid,p_form uuid,p_page integer,p_size integer) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE items jsonb;total integer;BEGIN
 IF NOT gdg_security.form_collaborator_access(p_actor,p_session,p_form) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 10000 OR p_size IS NULL OR p_size NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 SELECT count(*) INTO total FROM public.form_access_tokens WHERE form_id=p_form;
 SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC,t.id),'[]'::jsonb) INTO items FROM(
  SELECT id,token_type,intended_email_encrypted,used_count,use_limit,delivery_state,last_sent_at,expires_at,revoked_at,created_at,revision FROM public.form_access_tokens WHERE form_id=p_form ORDER BY created_at DESC,id LIMIT p_size OFFSET(p_page-1)*p_size)t;
 RETURN jsonb_build_object('items',items,'total',total,'page',p_page,'pageSize',p_size);
END $$;
CREATE FUNCTION public.inspect_form_access_link_write(p_actor uuid,p_session uuid,p_form uuid,p_id uuid,p_action text,p_key_hash text,p_request_hash text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE f public.forms;t public.form_access_tokens;k public.idempotency_keys;can_create boolean;can_resend boolean;can_revoke boolean;BEGIN
 IF p_action IS NULL OR p_action NOT IN('create','resend','revoke') OR(p_action='create' AND p_id IS NOT NULL) OR(p_action<>'create' AND p_id IS NULL)
 OR p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$' OR(p_request_hash IS NOT NULL AND p_request_hash!~'^[a-f0-9]{64}$') THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 IF NOT gdg_security.form_collaborator_access(p_actor,p_session,p_form) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT * INTO f FROM public.forms WHERE id=p_form;
 IF p_id IS NOT NULL THEN SELECT * INTO t FROM public.form_access_tokens WHERE form_id=p_form AND id=p_id;END IF;
 can_create:=f.published_version_id IS NOT NULL AND f.state<>'Archived' AND f.access_mode IN('invited','unlisted');
 can_resend:=coalesce(can_create AND t.token_type=f.access_mode AND t.used_count=0 AND t.revoked_at IS NULL AND t.intended_email_encrypted IS NOT NULL AND t.email_hash IS NOT NULL AND(t.last_sent_at IS NULL OR t.last_sent_at<=now()-interval '1 minute'),false);
 can_revoke:=coalesce(t.id IS NOT NULL AND t.token_type IN('invited','unlisted') AND t.revoked_at IS NULL,false);
 SELECT * INTO k FROM public.idempotency_keys WHERE scope='form-access-link-write:'||p_actor||':'||p_session AND key_hash=p_key_hash;
 IF FOUND THEN
  IF k.result->>'formId' IS DISTINCT FROM p_form::text OR k.result->>'sourceId' IS DISTINCT FROM p_id::text OR k.result->>'action' IS DISTINCT FROM p_action OR(p_request_hash IS NOT NULL AND k.request_hash IS DISTINCT FROM p_request_hash) THEN RAISE EXCEPTION 'CONFLICT';END IF;
  IF k.expires_at<=now() THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
 END IF;
 RETURN jsonb_build_object('formId',p_form,'sourceId',p_id,'action',p_action,'committed',k.key_hash IS NOT NULL,
  'canRetry',k.key_hash IS NULL AND CASE p_action WHEN 'create' THEN can_create WHEN 'resend' THEN can_resend ELSE can_revoke END,
  'formRevision',f.draft_revision,'publishedVersionId',f.published_version_id,'accessType',f.access_mode,'archived',f.state='Archived',
  'target',CASE WHEN t.id IS NULL THEN NULL ELSE jsonb_build_object('id',t.id,'revision',t.revision,'type',t.token_type,'responded',t.used_count>0,'revoked',t.revoked_at IS NOT NULL,'expiresAt',t.expires_at,'cooldownUntil',t.last_sent_at+interval '1 minute') END,
  'receipt',CASE WHEN k.key_hash IS NULL THEN NULL ELSE k.result END);
END $$;
CREATE FUNCTION public.mutate_form_access_link_write(p_actor uuid,p_session uuid,p_form uuid,p_id uuid,p_action text,p_form_revision integer,p_version uuid,p_target_revision integer,p_document jsonb,p_prepared jsonb,p_key_hash text,p_request_hash text,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE f public.forms;t public.form_access_tokens;inspected jsonb;receipt jsonb;queued jsonb;expires timestamptz;legacy_hash text;BEGIN
 IF p_form_revision IS NULL OR p_form_revision<1 OR p_document IS NULL OR jsonb_typeof(p_document)<>'object'
 OR p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$' OR p_request_hash IS NULL OR p_request_hash!~'^[a-f0-9]{64}$'
 OR(p_action='create' AND p_target_revision IS NOT NULL) OR(p_action<>'create' AND(p_target_revision IS NULL OR p_target_revision<1)) THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));
 PERFORM 1 FROM public.admin_users WHERE id=p_actor FOR UPDATE;
 PERFORM 1 FROM public.admin_sessions WHERE id=p_session AND admin_user_id=p_actor FOR UPDATE;
 SELECT * INTO f FROM public.forms WHERE id=p_form FOR UPDATE;
 IF p_id IS NOT NULL THEN SELECT * INTO t FROM public.form_access_tokens WHERE form_id=p_form AND id=p_id FOR UPDATE;END IF;
 inspected:=public.inspect_form_access_link_write(p_actor,p_session,p_form,p_id,p_action,p_key_hash,p_request_hash);
 IF(inspected->>'committed')::boolean THEN RETURN inspected->'receipt';END IF;
 IF f.draft_revision IS DISTINCT FROM p_form_revision OR f.published_version_id IS DISTINCT FROM p_version OR(p_id IS NOT NULL AND t.revision IS DISTINCT FROM p_target_revision) THEN RAISE EXCEPTION 'CONFLICT';END IF;
 IF NOT(inspected->>'canRetry')::boolean THEN
  IF p_action='resend' AND t.last_sent_at>now()-interval '1 minute' THEN RAISE EXCEPTION 'RESEND_COOLDOWN';END IF;
  RAISE EXCEPTION 'INVALID_STATE';END IF;
 IF p_action IN('create','resend') THEN
  expires:=(p_document->>'expiresAt')::timestamptz;
  IF expires IS NULL OR expires<=now() OR expires>now()+interval '30 days 5 minutes' OR p_version IS NULL OR(p_action='resend' AND expires>now()+interval '7 days 5 minutes') THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
 END IF;
 IF p_action='create' THEN
  IF p_document->>'type' IS DISTINCT FROM f.access_mode OR jsonb_typeof(p_prepared) IS DISTINCT FROM 'array' OR jsonb_array_length(p_prepared) NOT BETWEEN 1 AND 100
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_prepared)x WHERE x->>'tokenHash' IS NULL OR x->>'tokenHash'!~'^[a-f0-9]{64}$' OR x->>'emailHash' IS NULL OR x->>'emailHash'!~'^[a-f0-9]{64}$' OR x->>'emailEncrypted' IS NULL OR x->>'secretEncrypted' IS NULL OR(x->>'expiresAt')::timestamptz IS DISTINCT FROM expires) THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
  legacy_hash:=encode(sha256(convert_to('form-link-queue:'||p_actor||':'||p_session||':'||p_key_hash,'UTF8')),'hex');
  queued:=public.queue_form_access(p_actor,p_form,f.access_mode,p_prepared,legacy_hash,p_request_hash,p_request_id);
  receipt:=jsonb_build_object('formId',p_form,'sourceId',NULL,'action','create','queued',(queued->>'queued')::integer,'existing',jsonb_array_length(queued->'tokenIds')-(queued->>'queued')::integer,'total',jsonb_array_length(queued->'tokenIds'));
 ELSIF p_action='resend' THEN
  IF jsonb_typeof(p_prepared) IS DISTINCT FROM 'object' OR p_prepared->>'tokenHash' IS NULL OR p_prepared->>'tokenHash'!~'^[a-f0-9]{64}$' OR p_prepared->>'secretEncrypted' IS NULL THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
  UPDATE public.form_access_tokens SET token_hash=p_prepared->>'tokenHash',expires_at=expires,delivery_state='pending',last_sent_at=now() WHERE id=t.id;
  INSERT INTO public.delivery_jobs(kind,deduplication_key,payload,secret_payload) VALUES('form_access','form-access:'||t.id||':'||(p_prepared->>'tokenHash'),jsonb_build_object('formId',p_form,'tokenId',t.id,'tokenHash',p_prepared->>'tokenHash'),p_prepared->>'secretEncrypted');
  INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata) VALUES(p_actor,'forms.access_resend','form',p_form,p_request_id,jsonb_build_object('tokenId',t.id));
  receipt:=jsonb_build_object('formId',p_form,'sourceId',t.id,'action','resend','queued',1,'existing',0,'total',1);
 ELSE
  UPDATE public.form_access_tokens SET revoked_at=now(),delivery_state='revoked' WHERE id=t.id;
  INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata) VALUES(p_actor,'forms.access_revoke','form',p_form,p_request_id,jsonb_build_object('tokenId',t.id));
  receipt:=jsonb_build_object('formId',p_form,'sourceId',t.id,'action','revoke','queued',0,'existing',0,'total',1);
 END IF;
 INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result) VALUES('form-access-link-write:'||p_actor||':'||p_session,p_key_hash,p_request_hash,200,receipt);
 RETURN receipt;
END $$;
REVOKE ALL ON FUNCTION gdg_security.advance_form_access_link_revision(),public.read_form_access_links(uuid,uuid,uuid,integer,integer),public.inspect_form_access_link_write(uuid,uuid,uuid,uuid,text,text,text),public.mutate_form_access_link_write(uuid,uuid,uuid,uuid,text,integer,uuid,integer,jsonb,jsonb,text,text,uuid) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION gdg_security.advance_form_access_link_revision(),public.read_form_access_links(uuid,uuid,uuid,integer,integer),public.inspect_form_access_link_write(uuid,uuid,uuid,uuid,text,text,text),public.mutate_form_access_link_write(uuid,uuid,uuid,uuid,text,integer,uuid,integer,jsonb,jsonb,text,text,uuid) TO service_role;
COMMIT;
