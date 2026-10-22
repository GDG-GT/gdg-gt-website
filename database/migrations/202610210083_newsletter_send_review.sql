BEGIN;
ALTER TABLE public.newsletter_campaigns ADD COLUMN approved_at timestamptz,ADD COLUMN approved_by uuid REFERENCES public.admin_users(id),ADD COLUMN approval_password_hash text,
 ADD COLUMN delivery_started_at timestamptz,ADD COLUMN delivery_deadline timestamptz,ADD COLUMN cancelled_at timestamptz;
CREATE TABLE public.newsletter_send_reviews(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),campaign_id uuid NOT NULL REFERENCES public.newsletter_campaigns(id),actor_id uuid NOT NULL REFERENCES public.admin_users(id),session_id uuid NOT NULL REFERENCES public.admin_sessions(id),
 revision integer NOT NULL,token_hash text NOT NULL UNIQUE CHECK(token_hash~'^[a-f0-9]{64}$'),recipient_snapshot jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT now()+interval '5 minutes',used_at timestamptz);
CREATE TABLE public.newsletter_campaign_recipients(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),campaign_id uuid NOT NULL REFERENCES public.newsletter_campaigns(id),subscriber_id uuid NOT NULL REFERENCES public.newsletter_subscribers(id),
 recipient_email text NOT NULL,subscriber_revision integer NOT NULL,state text NOT NULL DEFAULT 'queued' CHECK(state IN('queued','sent','skipped','failed')),
 provider_state text,provider_message_id text UNIQUE,secret_payload text,unsubscribe_hash text,attempt_count integer NOT NULL DEFAULT 0,error_code text,sent_at timestamptz,updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(campaign_id,subscriber_id));
ALTER TABLE public.newsletter_send_reviews ENABLE ROW LEVEL SECURITY;ALTER TABLE public.newsletter_campaign_recipients ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.newsletter_send_reviews,public.newsletter_campaign_recipients FROM PUBLIC,anon,authenticated,gdg_realtime;GRANT ALL ON public.newsletter_send_reviews,public.newsletter_campaign_recipients TO service_role;
CREATE FUNCTION gdg_security.newsletter_campaign_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF NEW.team_id IS DISTINCT FROM OLD.team_id OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN RAISE EXCEPTION 'NEWSLETTER_RETAINED';END IF;
 IF OLD.approved_at IS NOT NULL AND(NEW.approved_at IS DISTINCT FROM OLD.approved_at OR NEW.approved_by IS DISTINCT FROM OLD.approved_by OR NEW.subject IS DISTINCT FROM OLD.subject OR NEW.content IS DISTINCT FROM OLD.content
  OR NEW.html_content IS DISTINCT FROM OLD.html_content OR NEW.audience_mode IS DISTINCT FROM OLD.audience_mode OR NEW.custom_recipient_ids IS DISTINCT FROM OLD.custom_recipient_ids OR NEW.status='draft') THEN RAISE EXCEPTION 'NEWSLETTER_LOCKED';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER newsletter_campaign_guard BEFORE UPDATE ON public.newsletter_campaigns FOR EACH ROW EXECUTE FUNCTION gdg_security.newsletter_campaign_guard();
CREATE FUNCTION gdg_security.newsletter_recipient_snapshot(p_campaign uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE c public.newsletter_campaigns;result jsonb;BEGIN
 SELECT * INTO c FROM public.newsletter_campaigns WHERE id=p_campaign;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'email',email,'revision',revision) ORDER BY id),'[]') INTO result FROM(
  SELECT s.id,s.email,s.revision FROM public.newsletter_subscribers s WHERE s.team_id IS NOT DISTINCT FROM c.team_id AND s.state='active' AND s.is_active AND s.confirmed_at IS NOT NULL AND s.consent_at IS NOT NULL AND s.deleted_at IS NULL AND s.suppressed_at IS NULL
  AND(c.audience_mode='all' OR c.custom_recipient_ids? s.id::text) ORDER BY s.id LIMIT 1001)s;
 IF jsonb_array_length(result) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'NEWSLETTER_AUDIENCE_LIMIT';END IF;RETURN result;
END $$;
CREATE FUNCTION public.review_newsletter_send(p_actor uuid,p_session uuid,p_campaign uuid,p_revision integer,p_token_hash text,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c public.newsletter_campaigns;r public.newsletter_send_reviews;audience jsonb;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('newsletter-workspace',0));
 IF NOT gdg_security.member_transfer_session(p_actor,p_session) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT * INTO c FROM public.newsletter_campaigns WHERE id=p_campaign AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND OR NOT public.can_operate_newsletter(p_actor,c.team_id,'read') OR NOT public.can_operate_newsletter(p_actor,c.team_id,'send_email') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF c.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'CONFLICT';END IF;
 IF c.status<>'draft' OR c.approved_at IS NOT NULL THEN RAISE EXCEPTION 'NEWSLETTER_LOCKED';END IF;
 IF p_token_hash IS NULL OR p_token_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 IF(SELECT count(*) FROM public.newsletter_send_reviews WHERE actor_id=p_actor AND created_at>now()-interval '1 hour')>=30 THEN RAISE EXCEPTION 'NEWSLETTER_REVIEW_LIMIT';END IF;
 audience:=gdg_security.newsletter_recipient_snapshot(c.id);
 INSERT INTO public.newsletter_send_reviews(campaign_id,actor_id,session_id,revision,token_hash,recipient_snapshot) VALUES(c.id,p_actor,p_session,c.revision,p_token_hash,audience) RETURNING * INTO r;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata) VALUES(p_actor,'newsletter.send_reviewed','newsletter_campaign',c.id,p_request_id,jsonb_build_object('reviewId',r.id,'count',jsonb_array_length(audience),'revision',c.revision));
 RETURN jsonb_build_object('reviewId',r.id,'expiresAt',r.expires_at,'revision',c.revision,'count',jsonb_array_length(audience),'recipients',audience,'subject',c.subject,'content',c.content);
END $$;
CREATE FUNCTION public.commit_newsletter_send(p_actor uuid,p_session uuid,p_campaign uuid,p_review uuid,p_token_hash text,p_verified_hash text,p_confirmation text,p_scheduled_at timestamptz,p_key_hash text,p_request_hash text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c public.newsletter_campaigns;r public.newsletter_send_reviews;k public.idempotency_keys;scope_key text;result jsonb;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('newsletter-workspace',0));
 IF NOT gdg_security.member_transfer_session(p_actor,p_session) OR NOT EXISTS(SELECT 1 FROM public.admin_users WHERE id=p_actor AND password_hash=p_verified_hash) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT * INTO c FROM public.newsletter_campaigns WHERE id=p_campaign AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND OR NOT public.can_operate_newsletter(p_actor,c.team_id,'read') OR NOT public.can_operate_newsletter(p_actor,c.team_id,'send_email') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$' OR p_request_hash IS NULL OR p_request_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 scope_key:='newsletter.send:'||p_actor||':'||p_session||':'||c.id;
 SELECT * INTO k FROM public.idempotency_keys WHERE scope=scope_key AND key_hash=p_key_hash;
 IF FOUND THEN IF k.request_hash IS DISTINCT FROM p_request_hash THEN RAISE EXCEPTION 'CONFLICT';END IF;RETURN k.result;END IF;
 IF c.status<>'draft' OR c.approved_at IS NOT NULL THEN RAISE EXCEPTION 'NEWSLETTER_LOCKED';END IF;
 SELECT * INTO r FROM public.newsletter_send_reviews WHERE id=p_review AND campaign_id=c.id AND actor_id=p_actor AND session_id=p_session AND token_hash=p_token_hash AND used_at IS NULL AND expires_at>now() FOR UPDATE;
 IF NOT FOUND OR r.revision<>c.revision THEN RAISE EXCEPTION 'NEWSLETTER_REVIEW_EXPIRED';END IF;
 IF p_confirmation IS DISTINCT FROM 'SEND '||jsonb_array_length(r.recipient_snapshot) THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 IF p_scheduled_at IS NOT NULL AND(p_scheduled_at<now()+interval '1 minute' OR p_scheduled_at>now()+interval '90 days') THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 IF gdg_security.newsletter_recipient_snapshot(c.id) IS DISTINCT FROM r.recipient_snapshot THEN RAISE EXCEPTION 'AUDIENCE_CHANGED';END IF;
 IF(SELECT count(*) FROM public.newsletter_campaigns WHERE approved_by=p_actor AND approved_at>now()-interval '24 hours')>=10 THEN RAISE EXCEPTION 'NEWSLETTER_SEND_LIMIT';END IF;
 INSERT INTO public.newsletter_campaign_recipients(campaign_id,subscriber_id,recipient_email,subscriber_revision) SELECT c.id,(value->>'id')::uuid,value->>'email',(value->>'revision')::integer FROM jsonb_array_elements(r.recipient_snapshot);
 UPDATE public.newsletter_campaigns SET status='scheduled',scheduled_at=coalesce(p_scheduled_at,now()),approved_at=now(),approved_by=p_actor,approval_password_hash=p_verified_hash,recipient_count=jsonb_array_length(r.recipient_snapshot),revision=revision+1,updated_at=now() WHERE id=c.id;
 UPDATE public.newsletter_send_reviews SET used_at=now() WHERE id=r.id;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata) VALUES(p_actor,'newsletter.send_approved','newsletter_campaign',c.id,p_request_id,jsonb_build_object('reviewId',r.id,'count',jsonb_array_length(r.recipient_snapshot),'scheduledAt',p_scheduled_at));
 result:=jsonb_build_object('id',c.id,'status','scheduled','recipientCount',jsonb_array_length(r.recipient_snapshot));
 INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result) VALUES(scope_key,p_key_hash,p_request_hash,200,result);RETURN result;
END $$;
CREATE FUNCTION public.cancel_newsletter_send(p_actor uuid,p_session uuid,p_campaign uuid,p_revision integer,p_verified_hash text,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c public.newsletter_campaigns;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('newsletter-workspace',0));
 IF NOT gdg_security.member_transfer_session(p_actor,p_session) OR NOT EXISTS(SELECT 1 FROM public.admin_users WHERE id=p_actor AND password_hash=p_verified_hash) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT * INTO c FROM public.newsletter_campaigns WHERE id=p_campaign AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND OR NOT public.can_operate_newsletter(p_actor,c.team_id,'read') OR NOT public.can_operate_newsletter(p_actor,c.team_id,'send_email') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF c.status='cancelled' THEN RETURN jsonb_build_object('id',c.id,'status','cancelled');END IF;
 IF c.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'CONFLICT';END IF;
 IF c.status NOT IN('scheduled','sending') THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
 UPDATE public.newsletter_campaigns SET status='cancelled',cancelled_at=now(),approval_password_hash=NULL,revision=revision+1,updated_at=now() WHERE id=c.id;
 UPDATE public.newsletter_campaign_recipients SET state='skipped',secret_payload=NULL,error_code='CAMPAIGN_CANCELLED',updated_at=now() WHERE campaign_id=c.id AND state='queued';
 UPDATE public.delivery_jobs SET state='dead',last_error_code='CAMPAIGN_CANCELLED',secret_payload=NULL,lease_token=NULL,locked_until=NULL WHERE kind='newsletter_campaign' AND payload->>'campaignId'=c.id::text AND state IN('pending','running');
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata) VALUES(p_actor,'newsletter.send_cancelled','newsletter_campaign',c.id,p_request_id,'{}');
 RETURN jsonb_build_object('id',c.id,'status','cancelled');
END $$;
CREATE FUNCTION public.advance_newsletter_campaigns() RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c public.newsletter_campaigns;started integer:=0;cancelled integer:=0;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('newsletter-workspace',0));
 FOR c IN SELECT * FROM public.newsletter_campaigns WHERE status='scheduled' AND scheduled_at<=now() AND deleted_at IS NULL ORDER BY scheduled_at,id LIMIT 20 FOR UPDATE LOOP
  IF c.approved_at IS NULL OR NOT EXISTS(SELECT 1 FROM public.admin_users WHERE id=c.approved_by AND password_hash=c.approval_password_hash) OR NOT public.can_operate_newsletter(c.approved_by,c.team_id,'send_email') THEN
   UPDATE public.newsletter_campaigns SET status='cancelled',cancelled_at=now(),approval_password_hash=NULL,revision=revision+1,updated_at=now() WHERE id=c.id;
   UPDATE public.newsletter_campaign_recipients SET state='skipped',error_code='ACCESS_CHANGED',updated_at=now() WHERE campaign_id=c.id AND state='queued';cancelled:=cancelled+1;CONTINUE;
  END IF;
  UPDATE public.newsletter_campaigns SET status='sending',delivery_started_at=now(),delivery_deadline=now()+interval '20 hours',revision=revision+1,updated_at=now() WHERE id=c.id;
  INSERT INTO public.delivery_jobs(kind,deduplication_key,payload) SELECT 'newsletter_campaign','newsletter_campaign:'||r.id,jsonb_build_object('campaignId',c.id,'recipientId',r.id) FROM public.newsletter_campaign_recipients r WHERE r.campaign_id=c.id AND r.state='queued' ON CONFLICT(deduplication_key) DO NOTHING;
  started:=started+1;
 END LOOP;
 RETURN jsonb_build_object('started',started,'cancelled',cancelled);
END $$;
REVOKE ALL ON FUNCTION gdg_security.newsletter_campaign_guard(),gdg_security.newsletter_recipient_snapshot(uuid),public.review_newsletter_send(uuid,uuid,uuid,integer,text,uuid),public.commit_newsletter_send(uuid,uuid,uuid,uuid,text,text,text,timestamptz,text,text,uuid),public.cancel_newsletter_send(uuid,uuid,uuid,integer,text,uuid),public.advance_newsletter_campaigns() FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION gdg_security.newsletter_recipient_snapshot(uuid),public.review_newsletter_send(uuid,uuid,uuid,integer,text,uuid),public.commit_newsletter_send(uuid,uuid,uuid,uuid,text,text,text,timestamptz,text,text,uuid),public.cancel_newsletter_send(uuid,uuid,uuid,integer,text,uuid),public.advance_newsletter_campaigns() TO service_role;
COMMIT;
