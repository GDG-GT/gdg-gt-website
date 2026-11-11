BEGIN;
ALTER TABLE public.reward_credentials ADD COLUMN hardware_uid_hash text CHECK(hardware_uid_hash IS NULL OR hardware_uid_hash~'^[a-f0-9]{64}$'),ADD COLUMN programmed_at timestamptz,ADD COLUMN digital_credential_id uuid REFERENCES public.reward_credentials(id),ADD COLUMN source_card_id uuid REFERENCES public.reward_credentials(id);
ALTER TABLE public.reward_credentials ADD CONSTRAINT reward_physical_binding_shape CHECK((hardware_uid_hash IS NULL AND programmed_at IS NULL) OR(kind='card' AND hardware_uid_hash IS NOT NULL AND programmed_at IS NOT NULL));
CREATE UNIQUE INDEX reward_one_active_card_per_chip ON public.reward_credentials(hardware_uid_hash) WHERE kind='card' AND revoked_at IS NULL AND hardware_uid_hash IS NOT NULL;
-- Cards are announced only after a successful, verified write and chip enrollment.
CREATE OR REPLACE FUNCTION gdg_security.reward_email_created() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE address text;
BEGIN
 IF NEW.kind='card' OR NEW.source_card_id IS NOT NULL THEN RETURN NEW;END IF;
 SELECT lower(email) INTO address FROM public.members WHERE id=NEW.member_id AND is_active AND deleted_at IS NULL AND merged_into_id IS NULL;
 IF address IS NULL THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 INSERT INTO public.delivery_jobs(kind,deduplication_key,payload) VALUES('reward_credential_email','reward-credential:'||NEW.id,jsonb_build_object('credentialId',NEW.id,'recipientHash',encode(sha256(convert_to(address,'UTF8')),'hex')));
 RETURN NEW;
END $$;
CREATE FUNCTION public.reward_card_programming(p_actor uuid,p_session uuid,p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c public.reward_credentials;
BEGIN
 PERFORM gdg_security.reward_admin(p_actor,p_session);
 SELECT * INTO c FROM public.reward_credentials WHERE id=p_id AND kind='card' AND revoked_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 PERFORM gdg_security.reward_active_member(c.member_id);
 RETURN jsonb_build_object('id',c.id,'encryptedToken',c.encrypted_token,'uidHash',c.hardware_uid_hash,'programmedAt',c.programmed_at);
END $$;
CREATE FUNCTION public.reward_bind_card(p_actor uuid,p_session uuid,p_id uuid,p_uid_hash text,p_digital_hash text,p_digital_encrypted text) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c public.reward_credentials;w public.reward_credentials;address text;
BEGIN
 PERFORM gdg_security.reward_admin(p_actor,p_session);
 IF p_uid_hash IS NULL OR p_uid_hash!~'^[a-f0-9]{64}$' OR p_digital_hash IS NULL OR p_digital_hash!~'^[a-f0-9]{64}$' OR length(p_digital_encrypted) NOT BETWEEN 1 AND 20000 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('reward-card-chip:'||p_uid_hash,0));
 SELECT * INTO c FROM public.reward_credentials WHERE id=p_id AND kind='card' AND revoked_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 PERFORM gdg_security.reward_active_member(c.member_id);
 IF c.hardware_uid_hash IS NOT NULL AND c.hardware_uid_hash<>p_uid_hash THEN RAISE EXCEPTION 'CARD_CHIP_MISMATCH';END IF;
 IF EXISTS(SELECT 1 FROM public.reward_credentials WHERE id<>c.id AND hardware_uid_hash=p_uid_hash AND revoked_at IS NULL) THEN RAISE EXCEPTION 'CARD_ALREADY_REGISTERED';END IF;
 IF c.programmed_at IS NOT NULL THEN RETURN jsonb_build_object('id',c.id,'uidHash',c.hardware_uid_hash,'programmedAt',c.programmed_at,'emailQueued',false);END IF;
 -- Serialize digital-pass creation for simultaneous card enrollment for one member.
 PERFORM pg_advisory_xact_lock(hashtextextended('reward-card-member:'||c.member_id,0));
 SELECT * INTO w FROM public.reward_credentials WHERE member_id=c.member_id AND kind='wallet' AND revoked_at IS NULL ORDER BY created_at,id LIMIT 1 FOR SHARE;
 IF NOT FOUND THEN
  INSERT INTO public.reward_credentials(member_id,kind,label,token_hash,encrypted_token,source_card_id) VALUES(c.member_id,'wallet','Membership Wallet pass',p_digital_hash,p_digital_encrypted,c.id) RETURNING * INTO w;
 END IF;
 UPDATE public.reward_credentials SET hardware_uid_hash=p_uid_hash,programmed_at=now(),digital_credential_id=w.id WHERE id=c.id RETURNING * INTO c;
 SELECT lower(email) INTO address FROM public.members WHERE id=c.member_id;
 INSERT INTO public.delivery_jobs(kind,deduplication_key,payload) VALUES('reward_credential_email','reward-card-programmed:'||c.id,jsonb_build_object('credentialId',c.id,'recipientHash',encode(sha256(convert_to(address,'UTF8')),'hex'))) ON CONFLICT(deduplication_key) DO NOTHING;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,result) VALUES(p_actor,'rewards.card_enrolled','reward_credentials',c.id,'success');
 RETURN jsonb_build_object('id',c.id,'uidHash',c.hardware_uid_hash,'programmedAt',c.programmed_at,'emailQueued',true);
END $$;
-- Raw physical credentials cannot be presented as QR codes or pasted links.
CREATE FUNCTION gdg_security.reward_scan_credential(p_actor uuid,p_session uuid,p_hash text,p_uid_hash text) RETURNS public.reward_credentials LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c public.reward_credentials;
BEGIN
 PERFORM gdg_security.reward_admin(p_actor,p_session);
 SELECT * INTO c FROM public.reward_credentials WHERE token_hash=p_hash AND revoked_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 PERFORM gdg_security.reward_active_member(c.member_id);
 IF c.kind='card' THEN
  IF c.hardware_uid_hash IS NULL OR c.programmed_at IS NULL THEN RAISE EXCEPTION 'CARD_NOT_PROGRAMMED';END IF;
  IF p_uid_hash IS NULL THEN RAISE EXCEPTION 'CARD_SCAN_REQUIRED';END IF;
  IF p_uid_hash IS DISTINCT FROM c.hardware_uid_hash THEN RAISE EXCEPTION 'CARD_CHIP_MISMATCH';END IF;
 ELSIF p_uid_hash IS NOT NULL THEN RAISE EXCEPTION 'CARD_SCAN_REQUIRED';
 END IF;
 RETURN c;
END $$;
CREATE FUNCTION public.reward_resolve_scan(p_actor uuid,p_session uuid,p_hash text,p_uid_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c public.reward_credentials;m public.members;
BEGIN
 c:=gdg_security.reward_scan_credential(p_actor,p_session,p_hash,p_uid_hash);
 SELECT * INTO m FROM public.members WHERE id=c.member_id;
 RETURN jsonb_build_object('id',m.id,'name',m.name,'email',m.email,'points',gdg_security.reward_balance(m.id),'credentialId',c.id,'label',c.label);
END $$;
CREATE OR REPLACE FUNCTION public.reward_resolve(p_actor uuid,p_session uuid,p_hash text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT public.reward_resolve_scan(p_actor,p_session,p_hash,NULL) $$;
ALTER FUNCTION public.reward_event_admin(uuid,uuid,text,jsonb,text,text) RENAME TO reward_event_admin_unbound;
-- Preserve the existing event checks and receipts; all credential entry points now enforce chip binding.
CREATE FUNCTION public.reward_event_admin(p_actor uuid,p_session uuid,p_action text,p_document jsonb,p_key_hash text DEFAULT NULL,p_request_hash text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF p_action IN('lookup','review') THEN PERFORM gdg_security.reward_scan_credential(p_actor,p_session,p_document->>'credentialHash',p_document->>'cardUidHash');END IF;
 RETURN public.reward_event_admin_unbound(p_actor,p_session,p_action,p_document,p_key_hash,p_request_hash);
END $$;
ALTER FUNCTION public.reward_admin_read(uuid,uuid,text,integer,uuid) RENAME TO reward_admin_read_unbound;
CREATE FUNCTION public.reward_admin_read(p_actor uuid,p_session uuid,p_query text,p_page integer,p_member uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r jsonb;
BEGIN
 r:=public.reward_admin_read_unbound(p_actor,p_session,p_query,p_page,p_member);
 RETURN jsonb_set(r,'{credentials}',(SELECT coalesce(jsonb_agg(x||jsonb_build_object('programmed_at',c.programmed_at,'bound',c.hardware_uid_hash IS NOT NULL)),'[]') FROM jsonb_array_elements(r->'credentials') x JOIN public.reward_credentials c ON c.id=(x->>'id')::uuid));
END $$;
-- The physical card's email presents its independent Wallet credential, never its chip-bound token.
CREATE OR REPLACE FUNCTION public.reward_email_pass(p_job uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('id',c.id,'passId',coalesce(w.id,c.id),'kind',c.kind,'label',c.label,'encryptedToken',coalesce(w.encrypted_token,c.encrypted_token),'name',m.name,'email',m.email,'createdAt',j.created_at)
 FROM public.delivery_jobs j JOIN public.reward_credentials c ON c.id::text=j.payload->>'credentialId' JOIN public.members m ON m.id=c.member_id
 LEFT JOIN public.reward_credentials w ON w.id=c.digital_credential_id AND w.member_id=c.member_id AND w.kind='wallet' AND w.revoked_at IS NULL
 WHERE j.id=p_job AND j.kind='reward_credential_email' AND j.created_at>now()-interval '7 days' AND j.created_at<=now() AND c.revoked_at IS NULL AND m.is_active AND m.deleted_at IS NULL AND m.merged_into_id IS NULL
 AND(c.kind<>'card' OR(c.programmed_at IS NOT NULL AND w.id IS NOT NULL)) AND j.payload->>'recipientHash'=encode(sha256(convert_to(lower(m.email),'UTF8')),'hex');
$$;
REVOKE ALL ON FUNCTION public.reward_card_programming(uuid,uuid,uuid),public.reward_bind_card(uuid,uuid,uuid,text,text,text),gdg_security.reward_scan_credential(uuid,uuid,text,text),public.reward_resolve_scan(uuid,uuid,text,text),public.reward_event_admin(uuid,uuid,text,jsonb,text,text),public.reward_admin_read(uuid,uuid,text,integer,uuid) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.reward_card_programming(uuid,uuid,uuid),public.reward_bind_card(uuid,uuid,uuid,text,text,text),gdg_security.reward_scan_credential(uuid,uuid,text,text),public.reward_resolve_scan(uuid,uuid,text,text),public.reward_event_admin(uuid,uuid,text,jsonb,text,text),public.reward_admin_read(uuid,uuid,text,integer,uuid) TO service_role;
ALTER FUNCTION public.queue_reward_credential_email(uuid,uuid,uuid,text) RENAME TO queue_reward_credential_email_unbound;
CREATE FUNCTION public.queue_reward_credential_email(p_actor uuid,p_session uuid,p_credential uuid,p_key_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 PERFORM gdg_security.reward_admin(p_actor,p_session);
 IF EXISTS(SELECT 1 FROM public.reward_credentials WHERE id=p_credential AND kind='card' AND revoked_at IS NULL AND programmed_at IS NULL) THEN RAISE EXCEPTION 'CARD_NOT_PROGRAMMED';END IF;
 RETURN public.queue_reward_credential_email_unbound(p_actor,p_session,p_credential,p_key_hash);
END $$;
REVOKE ALL ON FUNCTION public.queue_reward_credential_email(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.queue_reward_credential_email(uuid,uuid,uuid,text) TO service_role;
-- A response withdrawn before delivery must not generate a stale app alert.
CREATE OR REPLACE FUNCTION public.prepare_app_push(p_job uuid,p_lease uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.delivery_jobs;n public.notifications;d public.app_notification_devices;category text;u public.admin_users;
BEGIN
 SELECT * INTO j FROM public.delivery_jobs WHERE id=p_job AND lease_token=p_lease AND kind IN('app_push_ios','app_push_web') AND state='running' AND locked_until>now() AND created_at>now()-interval '24 hours' FOR SHARE;
 IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT * INTO d FROM public.app_notification_devices WHERE id=(j.payload->>'deviceId')::uuid AND revoked_at IS NULL AND last_seen_at>now()-interval '90 days' FOR SHARE;
 IF NOT FOUND OR j.kind<>'app_push_'||d.platform THEN RETURN NULL;END IF;
 SELECT * INTO n FROM public.notifications WHERE id=(j.payload->>'notificationId')::uuid AND user_id=d.user_id AND NOT is_read FOR SHARE;
 IF NOT FOUND THEN RETURN NULL;END IF;
 category:=j.payload->>'category';
 IF NOT coalesce((SELECT(categories->>category)::boolean FROM public.app_notification_preferences WHERE user_id=d.user_id),true) THEN RETURN NULL;END IF;
 SELECT * INTO u FROM public.admin_users WHERE id=d.user_id AND is_active AND deleted_at IS NULL AND NOT must_change_password AND(locked_until IS NULL OR locked_until<=now()) FOR SHARE;
 IF NOT FOUND OR(d.session_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.admin_sessions WHERE id=d.session_id AND revoked_at IS NULL AND admin_user_id=u.id)) THEN RETURN NULL;END IF;
 IF n.delivery_key LIKE 'form-response:%' AND NOT EXISTS(SELECT 1 FROM public.form_responses WHERE id=split_part(n.delivery_key,':',2)::uuid AND deleted_at IS NULL AND redacted_at IS NULL) THEN RETURN NULL;END IF;
 IF n.delivery_key LIKE 'form-response:%' AND NOT public.can_operate_form(u.id,split_part(n.link,'/',4)::uuid,'view_responses') THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('deviceId',d.id,'encrypted',d.address_encrypted,'platform',d.platform,'environment',d.environment,'category',category,'notificationId',n.id,'badge',(SELECT count(*) FROM public.notifications WHERE user_id=u.id AND NOT is_read));
END $$;
COMMIT;
