BEGIN;
CREATE TABLE public.form_delivery_policies (
 form_id uuid PRIMARY KEY REFERENCES public.forms(id),revision integer NOT NULL DEFAULT 1,
 schema_hash text NOT NULL CHECK(schema_hash~'^[a-f0-9]{64}$'),reviewed_by uuid NOT NULL REFERENCES public.admin_users(id),
 receipts boolean NOT NULL DEFAULT false,receipt_answers boolean NOT NULL DEFAULT false,
 notification_users uuid[] NOT NULL DEFAULT '{}',chapter_inbox boolean NOT NULL DEFAULT false,notification_answers boolean NOT NULL DEFAULT false,
 reviewed_at timestamptz NOT NULL DEFAULT now(),CHECK(cardinality(notification_users)<=10)
);
CREATE TABLE public.form_response_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),form_id uuid NOT NULL REFERENCES public.forms(id),response_id uuid NOT NULL REFERENCES public.form_responses(id),
 policy_revision integer NOT NULL,version_id uuid NOT NULL REFERENCES public.form_versions(id),purpose text NOT NULL CHECK(purpose IN('receipt','notification')),
 recipient_key text NOT NULL,recipient_admin uuid REFERENCES public.admin_users(id),recipient_encrypted text,
 response_revision integer NOT NULL,include_answers boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(response_id,purpose,recipient_key)
);
ALTER TABLE public.form_delivery_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_response_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.form_delivery_policies,public.form_response_deliveries FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT ALL ON public.form_delivery_policies,public.form_response_deliveries TO service_role;

CREATE FUNCTION gdg_security.form_delivery_policy_current(p_form uuid,p_hash text) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.form_delivery_policies p JOIN public.forms f ON f.id=p.form_id
  JOIN public.admin_users u ON u.id=p.reviewed_by AND u.is_active AND u.deleted_at IS NULL AND NOT u.must_change_password AND(u.locked_until IS NULL OR u.locked_until<=now())
  WHERE p.form_id=p_form AND p.schema_hash=p_hash AND f.state<>'Archived'
  AND(f.team_id IS NULL OR EXISTS(SELECT 1 FROM public.admin_teams WHERE id=f.team_id AND is_active AND deleted_at IS NULL))
  AND public.can_operate_form(p.reviewed_by,p_form,'view') AND public.can_operate_form(p.reviewed_by,p_form,'manage_access')
  AND public.can_operate_form(p.reviewed_by,p_form,'view_responses')
  AND(NOT(p.receipt_answers OR p.notification_answers) OR u.role IN('admin','super_admin')));
$$;
CREATE FUNCTION public.form_receipt_ready(p_form uuid,p_hash text) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT gdg_security.form_delivery_policy_current(p_form,p_hash) AND EXISTS(SELECT 1 FROM public.form_delivery_policies WHERE form_id=p_form AND receipts);
$$;
CREATE FUNCTION public.form_delivery_candidates(p_actor uuid,p_form uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;BEGIN
 IF NOT public.can_operate_form(p_actor,p_form,'view') OR NOT public.can_operate_form(p_actor,p_form,'manage_access') OR NOT public.can_operate_form(p_actor,p_form,'view_responses') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',u.id,'display_name',u.display_name,'role',u.role) ORDER BY u.display_name,u.id),'[]'::jsonb) INTO result
 FROM(SELECT * FROM public.admin_users WHERE is_active AND deleted_at IS NULL AND NOT must_change_password AND(locked_until IS NULL OR locked_until<=now())
  AND public.can_operate_form(id,p_form,'view') AND public.can_operate_form(id,p_form,'view_responses') ORDER BY display_name,id LIMIT 200) u;
 RETURN result;
END $$;
CREATE FUNCTION public.review_form_delivery(p_actor uuid,p_session uuid,p_verified_hash text,p_form uuid,p_form_revision integer,p_policy_revision integer,p_definition jsonb,p_schema_hash text,p_document jsonb,p_key_hash text,p_request_hash text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE f public.forms;p public.form_delivery_policies;actor public.admin_users;k public.idempotency_keys;users uuid[];result jsonb;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));
 SELECT * INTO f FROM public.forms WHERE id=p_form FOR UPDATE;
 SELECT * INTO actor FROM public.admin_users WHERE id=p_actor AND is_active AND deleted_at IS NULL AND NOT must_change_password AND(locked_until IS NULL OR locked_until<=now());
 IF f.id IS NULL OR actor.id IS NULL OR actor.password_hash IS DISTINCT FROM p_verified_hash OR NOT EXISTS(SELECT 1 FROM public.admin_sessions WHERE id=p_session AND admin_user_id=p_actor AND revoked_at IS NULL AND idle_expires_at>now() AND absolute_expires_at>now())
  OR NOT public.can_operate_form(p_actor,p_form,'view') OR NOT public.can_operate_form(p_actor,p_form,'manage_access') OR NOT public.can_operate_form(p_actor,p_form,'view_responses') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$' OR p_request_hash IS NULL OR p_request_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 SELECT * INTO k FROM public.idempotency_keys WHERE scope='forms.delivery:'||p_actor||':'||p_session||':'||p_form AND key_hash=p_key_hash;
 IF FOUND THEN IF k.request_hash IS DISTINCT FROM p_request_hash THEN RAISE EXCEPTION 'CONFLICT';END IF;RETURN k.result;END IF;
 IF f.draft_revision IS DISTINCT FROM p_form_revision OR f.draft_definition IS DISTINCT FROM p_definition THEN RAISE EXCEPTION 'CONFLICT';END IF;
 SELECT * INTO p FROM public.form_delivery_policies WHERE form_id=p_form;
 IF coalesce(p.revision,0) IS DISTINCT FROM p_policy_revision THEN RAISE EXCEPTION 'CONFLICT';END IF;
 IF f.state='Archived' OR(f.team_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.admin_teams WHERE id=f.team_id AND is_active AND deleted_at IS NULL)) THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
 IF p_schema_hash IS NULL OR p_schema_hash!~'^[a-f0-9]{64}$' OR p_document->>'confirmation' IS DISTINCT FROM 'DELIVERY '||p_form THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 users:=ARRAY(SELECT DISTINCT jsonb_array_elements_text(p_document->'notificationUsers')::uuid);
 IF cardinality(users)>10 OR EXISTS(SELECT 1 FROM unnest(users) id WHERE NOT public.can_operate_form(id,p_form,'view') OR NOT public.can_operate_form(id,p_form,'view_responses') OR NOT EXISTS(SELECT 1 FROM public.admin_users WHERE admin_users.id=id AND is_active AND deleted_at IS NULL AND NOT must_change_password AND(locked_until IS NULL OR locked_until<=now()))) THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
 IF(coalesce((p_document->>'receiptAnswers')::boolean,false) OR coalesce((p_document->>'notificationAnswers')::boolean,false)) AND actor.role NOT IN('admin','super_admin') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 IF coalesce((p_document->>'receipts')::boolean,false) AND p_definition->'settings'->>'access' NOT IN('verified','invited','internal') THEN RAISE EXCEPTION 'FORM_RECEIPT_IDENTITY';END IF;
 IF coalesce((p_document->>'receiptAnswers')::boolean,false) AND NOT coalesce((p_document->>'receipts')::boolean,false) THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 INSERT INTO public.form_delivery_policies(form_id,revision,schema_hash,reviewed_by,receipts,receipt_answers,notification_users,chapter_inbox,notification_answers)
 VALUES(p_form,coalesce(p.revision,0)+1,p_schema_hash,p_actor,(p_document->>'receipts')::boolean,(p_document->>'receiptAnswers')::boolean,users,(p_document->>'chapterInbox')::boolean,(p_document->>'notificationAnswers')::boolean)
 ON CONFLICT(form_id) DO UPDATE SET revision=excluded.revision,schema_hash=excluded.schema_hash,reviewed_by=excluded.reviewed_by,receipts=excluded.receipts,receipt_answers=excluded.receipt_answers,
  notification_users=excluded.notification_users,chapter_inbox=excluded.chapter_inbox,notification_answers=excluded.notification_answers,reviewed_at=now() RETURNING * INTO p;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata) VALUES(p_actor,'forms.delivery_reviewed','form',p_form,p_request_id,
  jsonb_build_object('policyRevision',p.revision,'schemaHash',p.schema_hash,'recipientCount',cardinality(users),'chapterInbox',p.chapter_inbox,'receipts',p.receipts,'receiptAnswers',p.receipt_answers,'notificationAnswers',p.notification_answers));
 result:=jsonb_build_object('revision',p.revision);
 INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result) VALUES('forms.delivery:'||p_actor||':'||p_session||':'||p_form,p_key_hash,p_request_hash,200,result);RETURN result;
END $$;
CREATE FUNCTION gdg_security.guard_form_receipt_publication() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v public.form_versions;BEGIN
 IF NEW.published_version_id IS DISTINCT FROM OLD.published_version_id AND NEW.published_version_id IS NOT NULL THEN
  SELECT * INTO v FROM public.form_versions WHERE id=NEW.published_version_id;
  IF coalesce((v.definition->'settings'->>'receipts')::boolean,false) AND
   (NOT gdg_security.form_delivery_policy_current(NEW.id,v.schema_hash) OR NOT EXISTS(SELECT 1 FROM public.form_delivery_policies WHERE form_id=NEW.id AND receipts)
    OR v.definition->'settings'->>'access' NOT IN('verified','invited','internal')) THEN RAISE EXCEPTION 'FORM_DELIVERY_REVIEW_REQUIRED';END IF;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER guard_form_receipt_publication BEFORE UPDATE ON public.forms FOR EACH ROW EXECUTE FUNCTION gdg_security.guard_form_receipt_publication();

ALTER FUNCTION public.submit_form_response(uuid,uuid,text,jsonb,text,text,text,text,uuid,text,text,text,text) RENAME TO submit_form_response_before_delivery;
CREATE FUNCTION public.submit_form_response(p_form uuid,p_version uuid,p_schema_hash text,p_answers jsonb,p_key_hash text,p_request_hash text,p_access_hash text,p_identity_hash text,p_actor uuid,p_edit_hash text,p_edit_secret text,p_resume_hash text,p_upload_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;r public.form_responses;p public.form_delivery_policies;f public.forms;a public.form_access_tokens;d uuid;target uuid;recipient text;already_submitted boolean;BEGIN
 PERFORM 1 FROM public.forms WHERE id=p_form FOR UPDATE;
 already_submitted:=EXISTS(SELECT 1 FROM public.form_responses WHERE form_id=p_form AND idempotency_key_hash=p_key_hash);
 result:=public.submit_form_response_before_delivery(p_form,p_version,p_schema_hash,p_answers,p_key_hash,p_request_hash,p_access_hash,p_identity_hash,p_actor,p_edit_hash,p_edit_secret,p_resume_hash,p_upload_hash);
 IF already_submitted THEN RETURN result;END IF;
 SELECT * INTO r FROM public.form_responses WHERE id=(result->>'responseId')::uuid;
 SELECT * INTO f FROM public.forms WHERE id=p_form;
 SELECT * INTO p FROM public.form_delivery_policies WHERE form_id=p_form;
 IF r.deleted_at IS NOT NULL OR r.redacted_at IS NOT NULL OR p.form_id IS NULL OR NOT gdg_security.form_delivery_policy_current(p_form,p_schema_hash) THEN RETURN result;END IF;
 IF p.receipts AND coalesce((f.settings->>'receipts')::boolean,false) THEN
  recipient:=NULL;target:=NULL;
  IF f.access_mode IN('verified','invited') THEN
   SELECT * INTO a FROM public.form_access_tokens WHERE id=r.access_token_id AND form_id=f.id AND revoked_at IS NULL AND token_type=f.access_mode;
   recipient:=a.intended_email_encrypted;
  ELSIF f.access_mode='internal' THEN target:=p_actor;END IF;
  IF recipient IS NOT NULL OR target IS NOT NULL THEN
   INSERT INTO public.form_response_deliveries(form_id,response_id,policy_revision,version_id,purpose,recipient_key,recipient_admin,recipient_encrypted,response_revision,include_answers)
   VALUES(f.id,r.id,p.revision,r.version_id,'receipt','respondent',target,recipient,r.revision,p.receipt_answers) ON CONFLICT DO NOTHING RETURNING id INTO d;
   IF d IS NOT NULL THEN INSERT INTO public.delivery_jobs(kind,deduplication_key,payload) VALUES('form_reviewed_email','form-reviewed-email:'||d,jsonb_build_object('deliveryId',d));END IF;
  END IF;
 END IF;
 FOREACH target IN ARRAY p.notification_users LOOP
  IF public.can_operate_form(target,p_form,'view') AND public.can_operate_form(target,p_form,'view_responses') THEN
   INSERT INTO public.form_response_deliveries(form_id,response_id,policy_revision,version_id,purpose,recipient_key,recipient_admin,response_revision,include_answers)
   VALUES(f.id,r.id,p.revision,r.version_id,'notification',target::text,target,r.revision,p.notification_answers) ON CONFLICT DO NOTHING RETURNING id INTO d;
   IF d IS NOT NULL THEN INSERT INTO public.delivery_jobs(kind,deduplication_key,payload) VALUES('form_reviewed_email','form-reviewed-email:'||d,jsonb_build_object('deliveryId',d));END IF;
  END IF;
 END LOOP;
 IF p.chapter_inbox THEN
  INSERT INTO public.form_response_deliveries(form_id,response_id,policy_revision,version_id,purpose,recipient_key,response_revision,include_answers)
  VALUES(f.id,r.id,p.revision,r.version_id,'notification','chapter',r.revision,p.notification_answers) ON CONFLICT DO NOTHING RETURNING id INTO d;
  IF d IS NOT NULL THEN INSERT INTO public.delivery_jobs(kind,deduplication_key,payload) VALUES('form_reviewed_email','form-reviewed-email:'||d,jsonb_build_object('deliveryId',d));END IF;
 END IF;RETURN result;
END $$;
CREATE FUNCTION public.prepare_form_reviewed_email(p_job uuid,p_lease uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.delivery_jobs;d public.form_response_deliveries;p public.form_delivery_policies;r public.form_responses;f public.forms;v public.form_versions;address text;answers jsonb:='[]';omitted boolean:=false;BEGIN
 SELECT * INTO j FROM public.delivery_jobs WHERE id=p_job AND lease_token=p_lease AND kind='form_reviewed_email' AND state='running' AND locked_until>now() FOR SHARE;
 IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT * INTO d FROM public.form_response_deliveries WHERE id=(j.payload->>'deliveryId')::uuid;
 SELECT * INTO f FROM public.forms WHERE id=d.form_id FOR SHARE;
 SELECT * INTO r FROM public.form_responses WHERE id=d.response_id AND form_id=f.id FOR SHARE;
 SELECT * INTO p FROM public.form_delivery_policies WHERE form_id=f.id;
 SELECT * INTO v FROM public.form_versions WHERE id=d.version_id;
 IF r.id IS NULL OR r.deleted_at IS NOT NULL OR r.redacted_at IS NOT NULL OR d.policy_revision IS DISTINCT FROM p.revision OR NOT gdg_security.form_delivery_policy_current(f.id,v.schema_hash)
  OR d.created_at<now()-interval '24 hours' OR(d.include_answers AND r.revision<>d.response_revision) THEN RETURN NULL;END IF;
 IF d.recipient_admin IS NOT NULL THEN
  SELECT email INTO address FROM public.admin_users WHERE id=d.recipient_admin AND is_active AND deleted_at IS NULL AND NOT must_change_password AND(locked_until IS NULL OR locked_until<=now());
  IF address IS NULL THEN RETURN NULL;END IF;
  IF d.purpose='notification' AND(NOT public.can_operate_form(d.recipient_admin,f.id,'view') OR NOT public.can_operate_form(d.recipient_admin,f.id,'view_responses') OR NOT d.recipient_admin=ANY(p.notification_users)) THEN RETURN NULL;END IF;
 ELSIF d.purpose='receipt' THEN
  IF NOT EXISTS(SELECT 1 FROM public.form_access_tokens WHERE id=r.access_token_id AND form_id=f.id AND revoked_at IS NULL AND token_type IN('verified','invited') AND intended_email_encrypted=d.recipient_encrypted) THEN RETURN NULL;END IF;
 ELSIF d.recipient_key<>'chapter' OR NOT p.chapter_inbox THEN RETURN NULL;END IF;
 IF d.purpose='receipt' AND(NOT p.receipts OR NOT coalesce((v.definition->'settings'->>'receipts')::boolean,false)) THEN RETURN NULL;END IF;
 IF d.include_answers THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('label',field->>'label','value',a.value) ORDER BY ordinal),'[]'::jsonb) INTO answers
  FROM public.form_answers a,jsonb_array_elements(v.definition->'fields') WITH ORDINALITY AS fields(field,ordinal)
  WHERE a.response_id=r.id AND a.field_id::text=field->>'id' AND NOT coalesce((field->>'sensitive')::boolean,false) AND field->>'type' NOT IN('file','title','description','image','divider');
  -- Never truncate individual answers or create unbounded mail bodies. Oversize
  -- answer sets fall back to an explicit metadata-only receipt/notification.
  IF octet_length(answers::text)>32768 THEN answers:='[]';omitted:=true;END IF;
 END IF;
 INSERT INTO public.admin_actions(action,target_type,target_id,metadata) VALUES('forms.delivery_prepared','form_response',r.id,jsonb_build_object('formId',f.id,'deliveryId',d.id,'purpose',d.purpose,'includesAnswers',d.include_answers));
 RETURN jsonb_build_object('purpose',d.purpose,'email',address,'emailEncrypted',d.recipient_encrypted,'chapterInbox',d.recipient_key='chapter',
  'formId',f.id,'responseId',r.id,'title',v.definition->>'title','submittedAt',r.submitted_at,'version',v.version,'answers',answers,'answersOmitted',omitted);
END $$;
CREATE OR REPLACE FUNCTION public.claim_delivery_jobs(p_limit integer) RETURNS SETOF public.delivery_jobs LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT * FROM public.claim_worker_jobs(p_limit,ARRAY['event_confirmation','event_message','newsletter_confirmation','contact_acknowledgment','contact_notification',
 'form_access','form_response_notification','form_reviewed_email','account_access','team_invite','team_announcement','task_notification','direct_message_notice','chapter_announcement']);
$$;
REVOKE ALL ON FUNCTION gdg_security.form_delivery_policy_current(uuid,text),public.form_receipt_ready(uuid,text),public.form_delivery_candidates(uuid,uuid),public.review_form_delivery(uuid,uuid,text,uuid,integer,integer,jsonb,text,jsonb,text,text,uuid),gdg_security.guard_form_receipt_publication(),
 public.submit_form_response(uuid,uuid,text,jsonb,text,text,text,text,uuid,text,text,text,text),public.prepare_form_reviewed_email(uuid,uuid) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION gdg_security.form_delivery_policy_current(uuid,text),public.form_receipt_ready(uuid,text),public.form_delivery_candidates(uuid,uuid),public.review_form_delivery(uuid,uuid,text,uuid,integer,integer,jsonb,text,jsonb,text,text,uuid),
 public.submit_form_response(uuid,uuid,text,jsonb,text,text,text,text,uuid,text,text,text,text),public.prepare_form_reviewed_email(uuid,uuid) TO service_role;
COMMIT;
