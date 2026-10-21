BEGIN;
-- Holds are operational policy, not mutable/published form-definition switches.
CREATE TABLE public.form_privacy_policies (
 form_id uuid PRIMARY KEY REFERENCES public.forms(id),revision integer NOT NULL DEFAULT 1,
 held boolean NOT NULL DEFAULT false,reason text NOT NULL DEFAULT '',draft_days integer NOT NULL DEFAULT 7 CHECK(draft_days BETWEEN 1 AND 30),
 updated_by uuid NOT NULL REFERENCES public.admin_users(id),updated_at timestamptz NOT NULL DEFAULT now(),CHECK(length(reason)<=500)
);
CREATE TABLE public.form_response_holds (
 response_id uuid PRIMARY KEY REFERENCES public.form_responses(id),form_id uuid NOT NULL REFERENCES public.forms(id),
 revision integer NOT NULL DEFAULT 1,held boolean NOT NULL,reason text NOT NULL,updated_by uuid NOT NULL REFERENCES public.admin_users(id),
 updated_at timestamptz NOT NULL DEFAULT now(),CHECK(length(reason)<=500),FOREIGN KEY(response_id,form_id) REFERENCES public.form_responses(id,form_id)
);
ALTER TABLE public.form_privacy_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_response_holds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.form_privacy_policies,public.form_response_holds FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT ALL ON public.form_privacy_policies,public.form_response_holds TO service_role;
INSERT INTO public.form_privacy_policies(form_id,held,reason,updated_by)
 SELECT id,true,'Migrated existing operational hold',owner_id FROM public.forms WHERE coalesce((settings->>'hold')::boolean,false);
INSERT INTO public.form_response_holds(response_id,form_id,held,reason,updated_by)
 SELECT r.id,r.form_id,true,'Migrated existing response hold',f.owner_id FROM public.form_responses r JOIN public.forms f ON f.id=r.form_id WHERE r.status='held' AND r.deleted_at IS NULL;
ALTER TABLE public.form_responses ADD COLUMN retention_expires_at timestamptz,ADD COLUMN retention_deleted_at timestamptz;
CREATE FUNCTION gdg_security.form_retention_days(p_definition jsonb) RETURNS integer LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN p_definition->'settings'->>'retentionDays'~'^[0-9]{1,3}$' THEN least(365,greatest(1,(p_definition->'settings'->>'retentionDays')::integer)) ELSE 365 END;
$$;
UPDATE public.form_responses r SET retention_expires_at=r.submitted_at+make_interval(days=>gdg_security.form_retention_days(v.definition)) FROM public.form_versions v WHERE v.id=r.version_id;
ALTER TABLE public.form_responses ALTER COLUMN retention_expires_at SET NOT NULL;
CREATE INDEX form_retention_due ON public.form_responses(retention_expires_at,id) WHERE deleted_at IS NULL;
CREATE FUNCTION gdg_security.set_form_response_retention() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 NEW.retention_expires_at:=NEW.submitted_at+make_interval(days=>gdg_security.form_retention_days((SELECT definition FROM public.form_versions WHERE id=NEW.version_id)));
 RETURN NEW;END $$;
CREATE TRIGGER set_form_response_retention BEFORE INSERT ON public.form_responses FOR EACH ROW EXECUTE FUNCTION gdg_security.set_form_response_retention();
CREATE FUNCTION gdg_security.form_held(p_form uuid,p_response uuid DEFAULT NULL) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.forms WHERE id=p_form AND coalesce((settings->>'hold')::boolean,false))
 OR EXISTS(SELECT 1 FROM public.form_privacy_policies WHERE form_id=p_form AND held)
 OR EXISTS(SELECT 1 FROM public.form_response_holds WHERE response_id=p_response AND form_id=p_form AND held);
$$;
CREATE FUNCTION gdg_security.form_privacy_access(p_actor uuid,p_session uuid,p_form uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.admin_users a JOIN public.admin_sessions s ON s.admin_user_id=a.id
  WHERE a.id=p_actor AND a.is_active AND a.deleted_at IS NULL AND NOT a.must_change_password AND(a.locked_until IS NULL OR a.locked_until<=now())
  AND s.id=p_session AND s.revoked_at IS NULL AND s.idle_expires_at>now() AND s.absolute_expires_at>now())
 AND EXISTS(SELECT 1 FROM public.forms WHERE id=p_form)
 AND public.can_operate_form(p_actor,p_form,'view') AND public.can_operate_form(p_actor,p_form,'view_responses') AND public.can_operate_form(p_actor,p_form,'delete');
$$;
CREATE FUNCTION public.read_form_privacy(p_actor uuid,p_session uuid,p_form uuid,p_response uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE p public.form_privacy_policies;h public.form_response_holds;r public.form_responses;result jsonb;BEGIN
 IF NOT gdg_security.form_privacy_access(p_actor,p_session,p_form) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT * INTO p FROM public.form_privacy_policies WHERE form_id=p_form;
 result:=jsonb_build_object('formId',p_form,'revision',coalesce(p.revision,0),'held',gdg_security.form_held(p_form),
  'reason',coalesce(p.reason,''),'draftDays',coalesce(p.draft_days,7),'updatedAt',p.updated_at,
  'canRelease',EXISTS(SELECT 1 FROM public.admin_users WHERE id=p_actor AND role IN('admin','super_admin')),
  'totalResponses',(SELECT count(*) FROM public.form_responses WHERE form_id=p_form AND deleted_at IS NULL),
  'heldResponses',(SELECT count(*) FROM public.form_response_holds WHERE form_id=p_form AND held),
  'dueResponses',(SELECT count(*) FROM public.form_responses x WHERE form_id=p_form AND deleted_at IS NULL AND retention_expires_at<=now() AND NOT gdg_security.form_held(p_form,x.id)),
  'nextExpiry',(SELECT min(retention_expires_at) FROM public.form_responses x WHERE form_id=p_form AND deleted_at IS NULL AND NOT gdg_security.form_held(p_form,x.id)),
  'pendingFiles',(SELECT count(*) FROM public.upload_intents WHERE form_id=p_form AND deleted_at IS NOT NULL AND purged_at IS NULL));
 IF p_response IS NOT NULL THEN
  SELECT * INTO r FROM public.form_responses WHERE id=p_response AND form_id=p_form AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  SELECT * INTO h FROM public.form_response_holds WHERE response_id=p_response;
  result:=result||jsonb_build_object('responseId',r.id,'responseRevision',coalesce(h.revision,0),'responseHeld',coalesce(h.held,false),
   'responseReason',coalesce(h.reason,''),'responseExpiresAt',r.retention_expires_at,'effectiveResponseHold',gdg_security.form_held(p_form,r.id));
 END IF;RETURN result;
END $$;
CREATE FUNCTION public.review_form_privacy(p_actor uuid,p_session uuid,p_verified_hash text,p_form uuid,p_response uuid,p_revision integer,p_document jsonb,p_key_hash text,p_request_hash text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE p public.form_privacy_policies;h public.form_response_holds;k public.idempotency_keys;a public.admin_users;held boolean;reason text;days integer;result jsonb;v_scope text;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));
 PERFORM 1 FROM public.forms WHERE id=p_form FOR UPDATE;
 IF NOT gdg_security.form_privacy_access(p_actor,p_session,p_form) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT * INTO a FROM public.admin_users WHERE id=p_actor;
 IF a.password_hash IS DISTINCT FROM p_verified_hash THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$' OR p_request_hash IS NULL OR p_request_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 v_scope:='forms.privacy:'||p_actor||':'||p_session||':'||p_form||':'||coalesce(p_response::text,'form');
 SELECT * INTO k FROM public.idempotency_keys WHERE scope=v_scope AND key_hash=p_key_hash;
 IF FOUND THEN IF k.request_hash IS DISTINCT FROM p_request_hash THEN RAISE EXCEPTION 'CONFLICT';END IF;RETURN k.result;END IF;
 held:=(p_document->>'held')::boolean;reason:=btrim(p_document->>'reason');days:=(p_document->>'draftDays')::integer;
 IF held IS NULL OR reason IS NULL OR length(reason) NOT BETWEEN 5 AND 500 OR(p_response IS NULL AND(days IS NULL OR days NOT BETWEEN 1 AND 30))
  OR p_document->>'confirmation' IS DISTINCT FROM 'HOLD '||coalesce(p_response,p_form) THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 IF p_response IS NULL THEN
  SELECT * INTO p FROM public.form_privacy_policies WHERE form_id=p_form;
  IF coalesce(p.revision,0) IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'CONFLICT';END IF;
  IF gdg_security.form_held(p_form) AND NOT held AND a.role NOT IN('admin','super_admin') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
  INSERT INTO public.form_privacy_policies(form_id,revision,held,reason,draft_days,updated_by)
  VALUES(p_form,coalesce(p.revision,0)+1,held,reason,days,p_actor) ON CONFLICT(form_id) DO UPDATE SET revision=excluded.revision,held=excluded.held,reason=excluded.reason,draft_days=excluded.draft_days,updated_by=excluded.updated_by,updated_at=now();
  -- A reviewed release also clears only the legacy operational flag, not the
  -- published definition or its response retention promise.
  IF NOT held THEN UPDATE public.forms SET settings=settings-'hold' WHERE id=p_form;END IF;
 ELSE
  PERFORM 1 FROM public.form_responses WHERE id=p_response AND form_id=p_form AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  SELECT * INTO h FROM public.form_response_holds WHERE response_id=p_response;
  IF coalesce(h.revision,0) IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'CONFLICT';END IF;
  IF h.held AND NOT held AND a.role NOT IN('admin','super_admin') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
  INSERT INTO public.form_response_holds(response_id,form_id,revision,held,reason,updated_by)
  VALUES(p_response,p_form,coalesce(h.revision,0)+1,held,reason,p_actor) ON CONFLICT(response_id) DO UPDATE SET revision=excluded.revision,held=excluded.held,reason=excluded.reason,updated_by=excluded.updated_by,updated_at=now();
  UPDATE public.form_responses SET status=CASE WHEN held THEN 'held' WHEN redacted_at IS NOT NULL THEN 'redacted' ELSE 'complete' END WHERE id=p_response;
 END IF;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata) VALUES(p_actor,CASE WHEN held THEN 'forms.hold_reviewed' ELSE 'forms.hold_released' END,
  CASE WHEN p_response IS NULL THEN 'form' ELSE 'form_response' END,coalesce(p_response,p_form),p_request_id,jsonb_build_object('formId',p_form,'reasonHash',encode(sha256(convert_to(reason,'UTF8')),'hex'),'draftDays',days));
 result:=public.read_form_privacy(p_actor,p_session,p_form,p_response);
 INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result) VALUES(v_scope,p_key_hash,p_request_hash,200,
  jsonb_build_object('revision',CASE WHEN p_response IS NULL THEN result->'revision' ELSE result->'responseRevision' END));
 RETURN jsonb_build_object('revision',CASE WHEN p_response IS NULL THEN result->'revision' ELSE result->'responseRevision' END);
END $$;
CREATE FUNCTION gdg_security.scrub_form_response_identity(p_response uuid) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE access_id uuid;BEGIN
 SELECT access_token_id INTO access_id FROM public.form_responses WHERE id=p_response;
 UPDATE public.form_access_tokens SET intended_email_encrypted=NULL,email_hash=NULL,revoked_at=coalesce(revoked_at,now()) WHERE id=access_id AND token_type IN('verified','invited');
 UPDATE public.form_responses SET identity_hash=NULL,access_token_id=NULL,edit_token_hash=NULL,edit_secret_encrypted=NULL,source_metadata_hash=NULL WHERE id=p_response;
 UPDATE public.form_response_deliveries SET recipient_encrypted=NULL WHERE response_id=p_response;
 UPDATE public.form_uploads SET deleted_at=coalesce(deleted_at,now()) WHERE response_id=p_response;
 UPDATE public.upload_intents SET deleted_at=coalesce(deleted_at,now()) WHERE id IN(SELECT id FROM public.form_uploads WHERE response_id=p_response);
END $$;
ALTER FUNCTION public.mutate_form_response(uuid,uuid,uuid,text,uuid) RENAME TO mutate_form_response_before_privacy;
CREATE FUNCTION public.mutate_form_response(p_actor uuid,p_form uuid,p_response uuid,p_action text,p_request_id uuid) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN
 PERFORM 1 FROM public.forms WHERE id=p_form FOR UPDATE;
 IF NOT public.can_operate_form(p_actor,p_form,'view') OR NOT public.can_operate_form(p_actor,p_form,'delete') OR NOT public.can_operate_form(p_actor,p_form,'view_responses') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 PERFORM 1 FROM public.form_responses WHERE id=p_response AND form_id=p_form AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF gdg_security.form_held(p_form,p_response) THEN RAISE EXCEPTION 'RETENTION_HOLD';END IF;
 -- Scrub identity links before the legacy routine clears its access-token ID.
 PERFORM gdg_security.scrub_form_response_identity(p_response);
 PERFORM public.mutate_form_response_before_privacy(p_actor,p_form,p_response,p_action,p_request_id);
END $$;
CREATE FUNCTION public.expire_form_responses(p_limit integer) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE candidate record;r public.form_responses;expired integer:=0;BEGIN
 IF p_limit NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 FOR candidate IN SELECT id,form_id FROM public.form_responses WHERE deleted_at IS NULL AND retention_expires_at<=now() AND NOT gdg_security.form_held(form_id,id)
  ORDER BY retention_expires_at,id LIMIT p_limit LOOP
  PERFORM 1 FROM public.forms WHERE id=candidate.form_id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN CONTINUE;END IF;
  SELECT * INTO r FROM public.form_responses WHERE id=candidate.id AND deleted_at IS NULL AND retention_expires_at<=now() FOR UPDATE SKIP LOCKED;
  IF NOT FOUND OR gdg_security.form_held(r.form_id,r.id) THEN CONTINUE;END IF;
  PERFORM gdg_security.scrub_form_response_identity(r.id);
  DELETE FROM public.form_answers WHERE response_id=r.id;
  DELETE FROM public.form_response_revisions WHERE response_id=r.id;
  UPDATE public.form_responses SET status='deleted',deleted_at=now(),retention_deleted_at=now() WHERE id=r.id;
  INSERT INTO public.admin_actions(action,target_type,target_id,metadata) VALUES('forms.response_retention_expired','form_response',r.id,jsonb_build_object('formId',r.form_id,'versionId',r.version_id));
  expired:=expired+1;
 END LOOP;RETURN jsonb_build_object('responsesExpired',expired);
END $$;
CREATE OR REPLACE FUNCTION public.expire_form_drafts(p_limit integer) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE d record;deleted integer:=0;BEGIN
 IF p_limit NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 FOR d IN SELECT id,form_id FROM public.form_response_drafts WHERE expires_at<=now() ORDER BY expires_at,id LIMIT p_limit LOOP
  PERFORM 1 FROM public.forms WHERE id=d.form_id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN CONTINUE;END IF;
  PERFORM 1 FROM public.form_response_drafts WHERE id=d.id AND expires_at<=now() FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN CONTINUE;END IF;
  UPDATE public.form_uploads SET draft_id=NULL,deleted_at=coalesce(deleted_at,now()) WHERE draft_id=d.id;
  DELETE FROM public.form_response_drafts WHERE id=d.id;deleted:=deleted+1;
 END LOOP;RETURN deleted;
END $$;
CREATE OR REPLACE FUNCTION public.claim_upload_cleanup(p_limit integer) RETURNS SETOF public.upload_intents LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE candidate uuid;u public.upload_intents;f public.form_uploads;BEGIN
 IF p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 FOR candidate IN SELECT id FROM public.upload_intents WHERE purpose='form' AND purged_at IS NULL AND created_at<now()-interval '3 minutes'
  AND(deleted_at IS NOT NULL OR expires_at<now()-interval '24 hours' OR(state='rejected' AND completed_at<now()-interval '24 hours'))
  AND NOT EXISTS(SELECT 1 FROM public.form_uploads fu WHERE fu.id=upload_intents.id AND fu.response_id IS NOT NULL AND gdg_security.form_held(fu.form_id,fu.response_id))
  ORDER BY created_at,id LIMIT p_limit LOOP
  SELECT * INTO u FROM public.upload_intents WHERE id=candidate;
  PERFORM 1 FROM public.forms WHERE id=u.form_id FOR UPDATE;
  SELECT * INTO u FROM public.upload_intents WHERE id=candidate FOR UPDATE;
  SELECT * INTO f FROM public.form_uploads WHERE id=candidate FOR UPDATE;
  IF NOT FOUND OR u.purged_at IS NOT NULL THEN CONTINUE;END IF;
  IF f.response_id IS NOT NULL AND(f.deleted_at IS NULL OR gdg_security.form_held(f.form_id,f.response_id)) THEN CONTINUE;END IF;
  IF f.deleted_at IS NULL AND f.draft_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.form_response_drafts WHERE id=f.draft_id AND expires_at>now() AND completed_at IS NULL) THEN CONTINUE;END IF;
  UPDATE public.upload_intents SET deleted_at=coalesce(deleted_at,now()) WHERE id=u.id RETURNING * INTO u;
  UPDATE public.form_uploads SET deleted_at=coalesce(deleted_at,now()) WHERE id=u.id;RETURN NEXT u;
 END LOOP;
END $$;
CREATE FUNCTION gdg_security.limit_form_draft_lifetime() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF TG_OP='INSERT' THEN NEW.expires_at:=NEW.created_at+make_interval(days=>coalesce((SELECT draft_days FROM public.form_privacy_policies WHERE form_id=NEW.form_id),7));END IF;
 RETURN NEW;END $$;
CREATE TRIGGER limit_form_draft_lifetime BEFORE INSERT ON public.form_response_drafts FOR EACH ROW EXECUTE FUNCTION gdg_security.limit_form_draft_lifetime();
REVOKE ALL ON FUNCTION gdg_security.form_retention_days(jsonb),gdg_security.set_form_response_retention(),gdg_security.form_held(uuid,uuid),gdg_security.form_privacy_access(uuid,uuid,uuid),
 public.read_form_privacy(uuid,uuid,uuid,uuid),public.review_form_privacy(uuid,uuid,text,uuid,uuid,integer,jsonb,text,text,uuid),gdg_security.scrub_form_response_identity(uuid),
 public.mutate_form_response(uuid,uuid,uuid,text,uuid),public.expire_form_responses(integer),gdg_security.limit_form_draft_lifetime() FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION gdg_security.form_retention_days(jsonb),gdg_security.form_held(uuid,uuid),gdg_security.form_privacy_access(uuid,uuid,uuid),
 public.read_form_privacy(uuid,uuid,uuid,uuid),public.review_form_privacy(uuid,uuid,text,uuid,uuid,integer,jsonb,text,text,uuid),gdg_security.scrub_form_response_identity(uuid),
 public.mutate_form_response(uuid,uuid,uuid,text,uuid),public.expire_form_responses(integer) TO service_role;
COMMIT;
