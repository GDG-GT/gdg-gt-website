BEGIN;
CREATE TABLE public.person_privacy_cleanup(
 review_id uuid PRIMARY KEY REFERENCES public.person_privacy_reviews(id) ON DELETE CASCADE,upload_ids uuid[] NOT NULL DEFAULT '{}',export_ids uuid[] NOT NULL DEFAULT '{}'
);
ALTER TABLE public.person_privacy_cleanup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.person_privacy_cleanup FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT SELECT ON public.person_privacy_cleanup TO service_role;
-- Only the password/session/capability/fingerprint-fenced commit function can
-- issue a transaction-bound erasure certificate. No browser or service role can
-- forge one with a GUC, raw INSERT or a retained review from another transaction.
CREATE OR REPLACE FUNCTION gdg_security.newsletter_subscriber_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.email IS DISTINCT FROM OLD.email AND NOT(NEW.email='erased+'||OLD.id||'@privacy.invalid' AND gdg_security.person_erasure_authorized('newsletter',OLD.id)) THEN RAISE EXCEPTION 'NEWSLETTER_RETAINED';END IF;
  IF NEW.team_id IS DISTINCT FROM OLD.team_id THEN RAISE EXCEPTION 'NEWSLETTER_RETAINED';END IF;
  IF(to_jsonb(NEW)-ARRAY['revision','updated_at']) IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['revision','updated_at']) THEN NEW.revision:=OLD.revision+1;NEW.updated_at:=now();END IF;
 END IF;
 IF NEW.deleted_at IS NOT NULL OR NEW.suppressed_at IS NOT NULL THEN NEW.state:='unsubscribed';NEW.is_active:=false;NEW.unsubscribed_at:=coalesce(NEW.unsubscribed_at,now());END IF;
 IF NEW.state='active' AND(NEW.confirmed_at IS NULL OR NEW.consent_at IS NULL) THEN NEW.state:='pending';NEW.is_active:=false;END IF;
 NEW.is_active:=(NEW.state='active');RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION gdg_security.newsletter_snapshot_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF NEW.campaign_id IS DISTINCT FROM OLD.campaign_id OR NEW.subscriber_id IS DISTINCT FROM OLD.subscriber_id OR NEW.subscriber_revision IS DISTINCT FROM OLD.subscriber_revision
  OR(NEW.recipient_email IS DISTINCT FROM OLD.recipient_email AND NOT(NEW.recipient_email='' AND((OLD.state<>'queued' AND OLD.updated_at<now()-interval '30 days') OR gdg_security.person_erasure_authorized('newsletter',OLD.subscriber_id)))) THEN RAISE EXCEPTION 'NEWSLETTER_LOCKED';END IF;RETURN NEW;
END $$;
CREATE FUNCTION gdg_security.event_recipient_privacy_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.recipient_email='' AND(to_jsonb(NEW)-'recipient_email')=(to_jsonb(OLD)-'recipient_email') AND gdg_security.person_erasure_authorized('event',OLD.registration_id) THEN RETURN NEW;END IF;
 END IF;RAISE EXCEPTION 'Protected rows cannot be changed' USING ERRCODE='42501';
END $$;
DROP TRIGGER event_recipients_immutable ON public.event_message_recipients;
CREATE TRIGGER event_recipients_immutable BEFORE UPDATE OR DELETE ON public.event_message_recipients FOR EACH ROW EXECUTE FUNCTION gdg_security.event_recipient_privacy_guard();

CREATE FUNCTION public.commit_person_privacy(p_actor uuid,p_session uuid,p_password text,p_review uuid,p_token_hash text,p_email text,p_confirmation text,p_key_hash text,p_request_hash text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE review public.person_privacy_reviews;k public.idempotency_keys;current_records jsonb;x jsonb;rid uuid;parent uuid;result jsonb;exported jsonb;scope_key text;
 event_ids uuid[];subscriber_ids uuid[];contact_ids uuid[];response_ids uuid[];draft_ids uuid[];access_ids uuid[];push_ids uuid[];attempt_ids uuid[];export_ids uuid[];file_ids uuid[];
 pending_files integer;pending_exports integer;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('team-administration',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('newsletter-workspace',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('contact-uploads',0));
 IF NOT gdg_security.person_privacy_session(p_actor,p_session,p_password) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT * INTO review FROM public.person_privacy_reviews WHERE id=p_review AND actor_id=p_actor AND session_id=p_session AND token_hash=p_token_hash FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'PRIVACY_REVIEW_REQUIRED';END IF;
 IF p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$' OR p_request_hash IS NULL OR p_request_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 scope_key:='privacy.commit:'||p_actor||':'||p_session||':'||p_review;
 SELECT * INTO k FROM public.idempotency_keys WHERE scope=scope_key AND key_hash=p_key_hash;
 IF FOUND THEN IF k.request_hash IS DISTINCT FROM p_request_hash THEN RAISE EXCEPTION 'CONFLICT';END IF;RETURN k.result;END IF;
 IF review.used_at IS NOT NULL OR review.expires_at<=now() OR review.password_hash IS DISTINCT FROM p_password THEN RAISE EXCEPTION 'PRIVACY_REVIEW_REQUIRED';END IF;
 IF p_confirmation IS DISTINCT FROM upper(review.action)||' '||jsonb_array_length(review.records)||' RECORDS' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 IF review.action<>'export' AND EXISTS(SELECT 1 FROM jsonb_array_elements(review.records) r WHERE(r->>'held')::boolean) THEN RAISE EXCEPTION 'RETENTION_HOLD';END IF;
 -- Parent locks are the same transaction boundary used by Forms, attendance,
 -- delivery and operational-hold mutators. Recheck every row after obtaining it.
 PERFORM 1 FROM public.forms WHERE id IN(SELECT(r->>'parentId')::uuid FROM jsonb_array_elements(review.records) r WHERE r->>'kind' IN('form_response','form_draft','form_access')) ORDER BY id FOR UPDATE;
 PERFORM 1 FROM public.events WHERE id IN(SELECT(r->>'parentId')::uuid FROM jsonb_array_elements(review.records) r WHERE r->>'kind' IN('event','push')) ORDER BY id FOR UPDATE;
 FOR x IN SELECT value FROM jsonb_array_elements(review.records) LOOP
  rid:=(x->>'id')::uuid;
  CASE x->>'kind'
  WHEN 'event' THEN PERFORM 1 FROM public.event_attendance WHERE id=rid FOR UPDATE;
  WHEN 'newsletter' THEN PERFORM 1 FROM public.newsletter_subscribers WHERE id=rid FOR UPDATE;
  WHEN 'contact' THEN PERFORM 1 FROM public.contact_submissions WHERE id=rid FOR UPDATE;
  WHEN 'form_response' THEN PERFORM 1 FROM public.form_responses WHERE id=rid FOR UPDATE;
  WHEN 'form_draft' THEN PERFORM 1 FROM public.form_response_drafts WHERE id=rid FOR UPDATE;
  WHEN 'form_access' THEN PERFORM 1 FROM public.form_access_tokens WHERE id=rid FOR UPDATE;
  WHEN 'push' THEN PERFORM 1 FROM public.push_subscriptions WHERE id=rid FOR UPDATE;
  WHEN 'newsletter_attempt' THEN PERFORM 1 FROM public.newsletter_subscription_attempts WHERE id=rid FOR UPDATE;
  ELSE RAISE EXCEPTION 'VALIDATION_ERROR';END CASE;
 END LOOP;
 current_records:=gdg_security.person_privacy_inventory(p_email,review.response_ids,review.form_hashes);
 IF current_records IS DISTINCT FROM review.records THEN RAISE EXCEPTION 'PRIVACY_REVIEW_CHANGED';END IF;
 IF review.action='export' THEN
  exported:=gdg_security.person_privacy_export(review.records,review.include_sensitive);
  result:=jsonb_build_object('action','export','count',jsonb_array_length(review.records),'downloadExpired',true,'heldCount',(SELECT count(*) FROM jsonb_array_elements(review.records) r WHERE(r->>'held')::boolean));
 ELSE
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(current_records) r WHERE(r->>'held')::boolean) THEN RAISE EXCEPTION 'RETENTION_HOLD';END IF;
  INSERT INTO gdg_security.person_privacy_erasure_grants(review_id,transaction_id,records) VALUES(review.id,pg_current_xact_id(),
   (SELECT coalesce(jsonb_agg(jsonb_build_object('kind',r->>'kind','id',r->>'id')),'[]') FROM jsonb_array_elements(review.records) r));
  SELECT coalesce(array_agg((r->>'id')::uuid) FILTER(WHERE r->>'kind'='event'),'{}'),
   coalesce(array_agg((r->>'id')::uuid) FILTER(WHERE r->>'kind'='newsletter'),'{}'),coalesce(array_agg((r->>'id')::uuid) FILTER(WHERE r->>'kind'='contact'),'{}'),
   coalesce(array_agg((r->>'id')::uuid) FILTER(WHERE r->>'kind'='form_response'),'{}'),coalesce(array_agg((r->>'id')::uuid) FILTER(WHERE r->>'kind'='form_draft'),'{}'),
   coalesce(array_agg((r->>'id')::uuid) FILTER(WHERE r->>'kind'='form_access'),'{}'),coalesce(array_agg((r->>'id')::uuid) FILTER(WHERE r->>'kind'='push'),'{}'),
   coalesce(array_agg((r->>'id')::uuid) FILTER(WHERE r->>'kind'='newsletter_attempt'),'{}')
  INTO event_ids,subscriber_ids,contact_ids,response_ids,draft_ids,access_ids,push_ids,attempt_ids FROM jsonb_array_elements(review.records) r;
  SELECT coalesce(array_agg(DISTINCT job_id),'{}') INTO export_ids FROM public.form_export_items WHERE response_id=ANY(response_ids);
  SELECT coalesce(array_agg(id),'{}') INTO file_ids FROM public.upload_intents WHERE contact_id=ANY(contact_ids)
   OR id IN(SELECT u.id FROM public.form_uploads u WHERE u.response_id=ANY(response_ids) OR u.draft_id=ANY(draft_ids));
  -- Revoke all matching mail capabilities before removing their source identity.
  UPDATE public.delivery_jobs j SET secret_payload=NULL,state=CASE WHEN state IN('pending','running') THEN 'dead' ELSE state END,
   last_error_code=CASE WHEN state IN('pending','running') THEN 'PRIVACY_ERASURE' ELSE last_error_code END,lease_token=NULL,locked_until=NULL,updated_at=now()
  WHERE (kind IN('event_confirmation','event_message') AND j.payload->>'registrationId' IN(SELECT unnest(event_ids)::text))
   OR(kind='event_push_verification' AND j.payload->>'verificationId' IN(SELECT id::text FROM public.event_push_verifications WHERE registration_id=ANY(event_ids)))
   OR(kind='newsletter_confirmation' AND j.payload->>'subscriberId' IN(SELECT unnest(subscriber_ids)::text))
   OR(kind='newsletter_campaign' AND j.payload->>'recipientId' IN(SELECT id::text FROM public.newsletter_campaign_recipients WHERE subscriber_id=ANY(subscriber_ids)))
   OR(kind IN('contact_acknowledgment','contact_notification') AND j.payload->>'contactId' IN(SELECT unnest(contact_ids)::text))
   OR(kind='form_access' AND j.payload->>'tokenId' IN(SELECT unnest(access_ids)::text))
   OR(kind='form_response_notification' AND j.payload->>'responseId' IN(SELECT unnest(response_ids)::text))
   OR(kind='form_respondent_copy' AND j.payload->>'copyId' IN(SELECT id::text FROM public.form_respondent_copies WHERE response_id=ANY(response_ids)))
   OR(kind='form_reviewed_email' AND j.payload->>'deliveryId' IN(SELECT id::text FROM public.form_response_deliveries WHERE response_id=ANY(response_ids)))
   OR(kind='event_push_reminder' AND j.payload->>'deliveryId' IN(SELECT id::text FROM public.push_delivery_log WHERE subscription_id=ANY(push_ids)));
  UPDATE public.event_mail_reviews SET recipient_snapshot=(SELECT coalesce(jsonb_agg(r),'[]') FROM jsonb_array_elements(recipient_snapshot) r WHERE NOT(r->>'id')::uuid=ANY(event_ids)),expires_at=least(expires_at,now())
   WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(recipient_snapshot) r WHERE(r->>'id')::uuid=ANY(event_ids));
  UPDATE public.newsletter_send_reviews SET recipient_snapshot=(SELECT coalesce(jsonb_agg(r),'[]') FROM jsonb_array_elements(recipient_snapshot) r WHERE NOT(r->>'id')::uuid=ANY(subscriber_ids)),expires_at=least(expires_at,now())
   WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(recipient_snapshot) r WHERE(r->>'id')::uuid=ANY(subscriber_ids));
  UPDATE public.event_message_recipients SET recipient_email='' WHERE registration_id=ANY(event_ids);
  UPDATE public.event_attendance SET attendee_name='Removed participant',attendee_email='erased+'||id||'@privacy.invalid',notes=NULL,deleted_at=coalesce(deleted_at,now()),updated_at=now() WHERE id=ANY(event_ids);
  UPDATE public.event_push_verifications SET expires_at=least(expires_at,now()),email_hash=repeat('0',64) WHERE registration_id=ANY(event_ids);
  UPDATE public.newsletter_campaign_recipients SET recipient_email='',secret_payload=NULL,unsubscribe_hash=NULL,state=CASE WHEN state='queued' THEN 'skipped' ELSE state END,error_code=CASE WHEN state='queued' THEN 'PRIVACY_ERASURE' ELSE error_code END,updated_at=now() WHERE subscriber_id=ANY(subscriber_ids);
  UPDATE public.newsletter_tokens SET consumed_at=coalesce(consumed_at,now()),expires_at=least(expires_at,now()) WHERE subscriber_id=ANY(subscriber_ids);
  UPDATE public.newsletter_subscribers SET email='erased+'||id||'@privacy.invalid',name=NULL,state='unsubscribed',is_active=false,suppressed_at=coalesce(suppressed_at,now()),suppression_reason=coalesce(suppression_reason,'manual'),deleted_at=coalesce(deleted_at,now()) WHERE id=ANY(subscriber_ids);
  DELETE FROM public.newsletter_subscription_attempts WHERE id=ANY(attempt_ids);
  UPDATE public.contact_submissions SET name='Removed contact',email='',message='Removed by privacy request.',interests='{}',status='redacted',redacted_at=now(),hold_reason=NULL,revision=revision+1,updated_at=now() WHERE id=ANY(contact_ids);
  FOR x IN SELECT value FROM jsonb_array_elements(review.records) WHERE value->>'kind'='form_response' LOOP
   rid:=(x->>'id')::uuid;parent:=(x->>'parentId')::uuid;
   PERFORM public.mutate_form_response(p_actor,parent,rid,review.action,p_request_id);
   -- Free text can contain identity anywhere. Privacy redaction removes the
   -- entire answer/history payload, not just a name-field heuristic.
   DELETE FROM public.form_answers WHERE response_id=rid;
   DELETE FROM public.form_response_revisions WHERE response_id=rid;
  END LOOP;
  UPDATE public.form_access_tokens SET intended_email_encrypted=NULL,email_hash=NULL,revoked_at=coalesce(revoked_at,now()) WHERE id=ANY(access_ids);
  UPDATE public.form_uploads SET draft_id=NULL,deleted_at=coalesce(deleted_at,now()) WHERE draft_id=ANY(draft_ids);
  UPDATE public.upload_intents SET deleted_at=coalesce(deleted_at,now()) WHERE id=ANY(file_ids);
  DELETE FROM public.form_response_drafts WHERE id=ANY(draft_ids);
  UPDATE public.form_export_jobs SET state='cancelled',filters='{}',columns=NULL,private_object_key=NULL,lease_token=NULL,locked_until=NULL,expires_at=now(),updated_at=now() WHERE id=ANY(export_ids);
  UPDATE public.push_subscriptions SET endpoint_encrypted=NULL,revoked_at=coalesce(revoked_at,now()),permission_state='revoked',registration_email_hash=CASE WHEN registration_id IS NOT NULL THEN repeat('0',64) ELSE NULL END,endpoint_hash=encode(sha256(convert_to('erased-endpoint:'||id,'UTF8')),'hex'),management_hash=encode(sha256(convert_to('erased-management:'||id,'UTF8')),'hex'),updated_at=now() WHERE id=ANY(push_ids);
  UPDATE public.push_delivery_log SET state=CASE WHEN state='queued' THEN 'skipped' ELSE state END,last_error_code=CASE WHEN state='queued' THEN 'PRIVACY_ERASURE' ELSE last_error_code END,updated_at=now() WHERE subscription_id=ANY(push_ids);
  SELECT count(*) INTO pending_files FROM public.upload_intents WHERE id=ANY(file_ids) AND purged_at IS NULL;
  SELECT count(*) INTO pending_exports FROM public.form_export_artifacts WHERE job_id=ANY(export_ids) AND purged_at IS NULL;
  INSERT INTO public.person_privacy_cleanup(review_id,upload_ids,export_ids) VALUES(review.id,file_ids,export_ids);
  result:=jsonb_build_object('action',review.action,'count',jsonb_array_length(review.records),'pendingFiles',pending_files,'pendingExports',pending_exports,
   'retainedClasses',jsonb_build_array('Finance records and attachments','Audit/security retention','Officer accounts and private collaboration','Previously delivered/downloaded copies'),
   'remainingMatches',jsonb_array_length(gdg_security.person_privacy_inventory(p_email,'{}',review.form_hashes)));
 END IF;
 UPDATE public.person_privacy_reviews SET used_at=now(),email_encrypted=NULL,password_hash=NULL,response_ids='{}',form_hashes='[]',records='[]' WHERE id=review.id;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata) VALUES(p_actor,'privacy.'||review.action,'person_privacy_review',review.id,p_request_id,
  jsonb_build_object('count',jsonb_array_length(review.records),'subjectHash',review.subject_hash,'purposeHash',review.purpose_hash,'sensitive',review.include_sensitive,'pendingFiles',pending_files,'pendingExports',pending_exports));
 INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result) VALUES(scope_key,p_key_hash,p_request_hash,200,result);
 IF review.action='export' THEN RETURN(result-'downloadExpired')||jsonb_build_object('export',exported);END IF;
 RETURN result;
END $$;
CREATE FUNCTION public.read_person_privacy_requests(p_actor uuid,p_session uuid,p_review uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;BEGIN
 IF NOT gdg_security.member_transfer_session(p_actor,p_session) OR NOT EXISTS(SELECT 1 FROM public.admin_users WHERE id=p_actor AND role='super_admin') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('reviewId',r.id,'action',r.action,'count',r.record_count,'createdAt',r.created_at,'expiresAt',r.expires_at,'completedAt',r.used_at,
  'pendingFiles',(SELECT count(*) FROM public.upload_intents u WHERE u.id=ANY(c.upload_ids) AND u.purged_at IS NULL),
  'pendingExports',(SELECT count(*) FROM public.form_export_artifacts a WHERE a.job_id=ANY(c.export_ids) AND a.purged_at IS NULL)) ORDER BY r.created_at DESC),'[]') INTO result
 FROM(SELECT * FROM public.person_privacy_reviews WHERE(p_review IS NULL OR id=p_review) ORDER BY created_at DESC LIMIT 20) r LEFT JOIN public.person_privacy_cleanup c ON c.review_id=r.id;
 IF p_review IS NOT NULL AND jsonb_array_length(result)=0 THEN RAISE EXCEPTION 'NOT_FOUND';END IF;RETURN result;
END $$;
CREATE FUNCTION public.cleanup_person_privacy_reviews() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ids uuid[];n integer;BEGIN
 SELECT coalesce(array_agg(id),'{}') INTO ids FROM(SELECT r.id FROM public.person_privacy_reviews r WHERE expires_at<now()-interval '24 hours'
  AND NOT EXISTS(SELECT 1 FROM public.person_privacy_cleanup c WHERE c.review_id=r.id AND(EXISTS(SELECT 1 FROM public.upload_intents u WHERE u.id=ANY(c.upload_ids) AND u.purged_at IS NULL)
   OR EXISTS(SELECT 1 FROM public.form_export_artifacts a WHERE a.job_id=ANY(c.export_ids) AND a.purged_at IS NULL))) ORDER BY expires_at LIMIT 1000 FOR UPDATE OF r SKIP LOCKED) r;
 DELETE FROM gdg_security.person_privacy_erasure_grants WHERE review_id=ANY(ids);
 DELETE FROM public.person_privacy_reviews WHERE id=ANY(ids);GET DIAGNOSTICS n=ROW_COUNT;RETURN n;
END $$;
REVOKE ALL ON FUNCTION gdg_security.event_recipient_privacy_guard(),public.commit_person_privacy(uuid,uuid,text,uuid,text,text,text,text,text,uuid),public.read_person_privacy_requests(uuid,uuid,uuid),public.cleanup_person_privacy_reviews() FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.commit_person_privacy(uuid,uuid,text,uuid,text,text,text,text,text,uuid),public.read_person_privacy_requests(uuid,uuid,uuid),public.cleanup_person_privacy_reviews() TO service_role;
COMMIT;
