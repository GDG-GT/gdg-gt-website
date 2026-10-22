BEGIN;
CREATE TABLE public.person_privacy_reviews(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_id uuid NOT NULL REFERENCES public.admin_users(id),session_id uuid NOT NULL REFERENCES public.admin_sessions(id),
 token_hash text NOT NULL UNIQUE CHECK(token_hash~'^[a-f0-9]{64}$'),subject_hash text NOT NULL,email_encrypted text,
 password_hash text,action text NOT NULL CHECK(action IN('export','redact','delete')),include_sensitive boolean NOT NULL DEFAULT false,
 response_ids uuid[] NOT NULL DEFAULT '{}',form_hashes jsonb NOT NULL DEFAULT '[]',records jsonb NOT NULL,record_count integer NOT NULL CHECK(record_count BETWEEN 0 AND 500),purpose_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT now()+interval '5 minutes',used_at timestamptz,
 CHECK(cardinality(response_ids)<=20 AND jsonb_array_length(records)<=500)
);
CREATE TABLE gdg_security.person_privacy_erasure_grants(
 review_id uuid PRIMARY KEY REFERENCES public.person_privacy_reviews(id),transaction_id xid8 NOT NULL,records jsonb NOT NULL
);
ALTER TABLE public.person_privacy_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.person_privacy_reviews,gdg_security.person_privacy_erasure_grants FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.person_privacy_reviews TO service_role;
GRANT SELECT ON gdg_security.person_privacy_erasure_grants TO service_role;

CREATE FUNCTION gdg_security.person_privacy_session(p_actor uuid,p_session uuid,p_password text) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT gdg_security.member_transfer_session(p_actor,p_session) AND EXISTS(SELECT 1 FROM public.admin_users WHERE id=p_actor AND role='super_admin' AND password_hash=p_password);
$$;
CREATE FUNCTION public.person_privacy_form_keys(p_offset integer) RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT DISTINCT form_id FROM public.form_access_tokens WHERE email_hash IS NOT NULL AND intended_email_encrypted IS NOT NULL ORDER BY form_id LIMIT 500 OFFSET greatest(0,least(p_offset,10000));
$$;
CREATE FUNCTION gdg_security.person_privacy_fingerprint(p_value jsonb) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT encode(sha256(convert_to(p_value::text,'UTF8')),'hex');
$$;
CREATE FUNCTION gdg_security.person_privacy_inventory(p_email text,p_ids uuid[],p_hashes jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE records jsonb;BEGIN
 WITH access_matches AS(SELECT a.* FROM public.form_access_tokens a WHERE a.token_type IN('verified','invited') AND a.intended_email_encrypted IS NOT NULL
  AND EXISTS(SELECT 1 FROM jsonb_array_elements(p_hashes) h WHERE h->>'formId'=a.form_id::text AND h->>'emailHash'=a.email_hash)),
 matching AS(
 SELECT 'event' kind,a.id,a.event_id parent,false held,'registration' source,coalesce(e.title,'Event') label,
  jsonb_build_array(to_jsonb(a),(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.message_id),'[]') FROM public.event_message_recipients m WHERE m.registration_id=a.id)) data
 FROM public.event_attendance a JOIN public.events e ON e.id=a.event_id WHERE lower(a.attendee_email)=p_email
 UNION ALL SELECT 'newsletter',s.id,s.team_id,false,'subscription','Newsletter subscription',jsonb_build_array(to_jsonb(s),
  (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.id),'[]') FROM public.newsletter_campaign_recipients r WHERE r.subscriber_id=s.id),
  (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id),'[]') FROM public.newsletter_tokens t WHERE t.subscriber_id=s.id))
 FROM public.newsletter_subscribers s WHERE s.email=p_email
 UNION ALL SELECT 'contact',c.id,NULL,c.retention_hold,'inquiry','Contact inquiry',jsonb_build_array(to_jsonb(c),(SELECT to_jsonb(u) FROM public.upload_intents u WHERE u.id=c.attachment_upload_id))
 FROM public.contact_submissions c WHERE lower(c.email)=p_email
 UNION ALL SELECT 'form_response',r.id,r.form_id,gdg_security.form_held(r.form_id,r.id),r.respondent_source,f.title,jsonb_build_array(to_jsonb(r),
  (SELECT coalesce(jsonb_object_agg(a.field_id,a.value),'{}') FROM public.form_answers a WHERE a.response_id=r.id),
  (SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY h.revision),'[]') FROM public.form_response_revisions h WHERE h.response_id=r.id),
  (SELECT coalesce(jsonb_agg(to_jsonb(u) ORDER BY u.id),'[]') FROM public.form_uploads u WHERE u.response_id=r.id))
 FROM public.form_responses r JOIN public.forms f ON f.id=r.form_id WHERE r.deleted_at IS NULL AND r.redacted_at IS NULL
 AND(r.respondent_email=p_email OR r.access_token_id IN(SELECT id FROM access_matches) OR(r.id=ANY(p_ids) AND r.respondent_source='legacy_unknown' AND r.respondent_email IS NULL))
 UNION ALL SELECT 'form_draft',d.id,d.form_id,gdg_security.form_held(d.form_id) OR EXISTS(SELECT 1 FROM public.form_responses r WHERE r.access_token_id=d.access_token_id AND gdg_security.form_held(r.form_id,r.id)),
  'private_draft',f.title,jsonb_build_array(to_jsonb(d),(SELECT coalesce(jsonb_agg(to_jsonb(u) ORDER BY u.id),'[]') FROM public.form_uploads u WHERE u.draft_id=d.id))
 FROM public.form_response_drafts d JOIN public.forms f ON f.id=d.form_id WHERE d.respondent_email=p_email OR d.access_token_id IN(SELECT id FROM access_matches)
 UNION ALL SELECT 'form_access',a.id,a.form_id,gdg_security.form_held(a.form_id) OR EXISTS(SELECT 1 FROM public.form_responses r WHERE r.access_token_id=a.id AND gdg_security.form_held(r.form_id,r.id)),
  'email_access',f.title,to_jsonb(a) FROM access_matches a JOIN public.forms f ON f.id=a.form_id
 UNION ALL SELECT 'push',s.id,s.event_id,false,'device_reminder','Event device reminder',to_jsonb(s)
 FROM public.push_subscriptions s WHERE EXISTS(SELECT 1 FROM public.event_attendance a WHERE a.id=s.registration_id AND lower(a.attendee_email)=p_email)
  OR EXISTS(SELECT 1 FROM public.admin_users a WHERE a.id=s.admin_user_id AND lower(a.email)=p_email)
 UNION ALL SELECT 'newsletter_attempt',a.id,NULL,false,'subscription_attempt','Newsletter signup attempt',to_jsonb(a) FROM public.newsletter_subscription_attempts a WHERE lower(a.email)=p_email
 ), bounded AS(SELECT * FROM matching ORDER BY kind,id LIMIT 501)
 SELECT coalesce(jsonb_agg(jsonb_build_object('kind',kind,'id',id,'parentId',parent,'held',held,'source',source,'label',label,'fingerprint',gdg_security.person_privacy_fingerprint(data)) ORDER BY kind,id),'[]') INTO records FROM bounded;
 IF jsonb_array_length(records)>500 THEN RAISE EXCEPTION 'PRIVACY_RECORD_LIMIT';END IF;
 IF EXISTS(SELECT 1 FROM unnest(p_ids) id WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(records) r WHERE r->>'kind'='form_response' AND r->>'id'=id::text)) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 RETURN records;
END $$;

CREATE FUNCTION public.review_person_privacy(p_actor uuid,p_session uuid,p_password text,p_email text,p_encrypted_email text,p_subject_hash text,p_action text,p_ids uuid[],p_hashes jsonb,p_sensitive boolean,p_token_hash text,p_purpose_hash text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE records jsonb;r public.person_privacy_reviews;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));
 IF NOT gdg_security.person_privacy_session(p_actor,p_session,p_password) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_action IS NULL OR p_action NOT IN('export','redact','delete') OR p_email IS NULL OR p_email<>lower(btrim(p_email)) OR length(p_email)>254 OR p_email!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  OR p_token_hash IS NULL OR p_token_hash!~'^[a-f0-9]{64}$' OR p_subject_hash IS NULL OR p_subject_hash!~'^[a-f0-9]{64}$' OR p_purpose_hash IS NULL OR p_purpose_hash!~'^[a-f0-9]{64}$'
  OR p_encrypted_email IS NULL OR p_encrypted_email NOT LIKE 'v1.%' OR cardinality(p_ids)>20 OR jsonb_typeof(p_hashes)<>'array' OR(p_sensitive AND p_action<>'export') THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 IF(SELECT count(*) FROM public.person_privacy_reviews WHERE actor_id=p_actor AND created_at>now()-interval '1 hour')>=30 THEN RAISE EXCEPTION 'PRIVACY_REVIEW_LIMIT';END IF;
 records:=gdg_security.person_privacy_inventory(p_email,p_ids,p_hashes);
 INSERT INTO public.person_privacy_reviews(actor_id,session_id,token_hash,subject_hash,email_encrypted,password_hash,action,include_sensitive,response_ids,form_hashes,records,record_count,purpose_hash)
 VALUES(p_actor,p_session,p_token_hash,p_subject_hash,p_encrypted_email,p_password,p_action,p_sensitive,p_ids,p_hashes,records,jsonb_array_length(records),p_purpose_hash) RETURNING * INTO r;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata) VALUES(p_actor,'privacy.reviewed','person_privacy_review',r.id,p_request_id,
  jsonb_build_object('action',p_action,'count',jsonb_array_length(records),'subjectHash',p_subject_hash,'purposeHash',p_purpose_hash,'identityAttested',true,'sensitive',p_sensitive));
 RETURN jsonb_build_object('reviewId',r.id,'action',p_action,'expiresAt',r.expires_at,'count',jsonb_array_length(records),
  'heldCount',(SELECT count(*) FROM jsonb_array_elements(records) x WHERE(x->>'held')::boolean),
  'records',(SELECT coalesce(jsonb_agg(x-'fingerprint'),'[]') FROM jsonb_array_elements(records) x));
END $$;

CREATE FUNCTION gdg_security.person_form_answers(p_version uuid,p_values jsonb,p_sensitive boolean,p_files jsonb) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('fieldId',f->>'id','label',f->>'label','type',f->>'type','masked',coalesce((f->>'sensitive')::boolean,false) AND NOT p_sensitive,
 'value',CASE WHEN coalesce((f->>'sensitive')::boolean,false) AND NOT p_sensitive THEN NULL WHEN f->>'type'='file' THEN
  (SELECT coalesce(jsonb_agg(coalesce(p_files->>file_id,'Removed private file')),'[]') FROM jsonb_array_elements_text(p_values->(f->>'id')) entries(file_id))
 ELSE p_values->(f->>'id') END) ORDER BY ord),'[]')
 FROM public.form_versions v,jsonb_array_elements(v.definition->'fields') WITH ORDINALITY fields(f,ord) WHERE v.id=p_version AND p_values?(f->>'id') AND f->>'type' NOT IN('title','description','divider','image');
$$;
CREATE FUNCTION gdg_security.person_privacy_export(p_records jsonb,p_sensitive boolean) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE x jsonb;item jsonb;items jsonb:='[]';answer_values jsonb;files jsonb;r public.form_responses;d public.form_response_drafts;BEGIN
 FOR x IN SELECT value FROM jsonb_array_elements(p_records) LOOP
  item:=NULL;
  CASE x->>'kind'
  WHEN 'event' THEN SELECT jsonb_build_object('id',a.id,'eventId',a.event_id,'event',e.title,'name',a.attendee_name,'email',a.attendee_email,'registeredAt',a.registration_date,'attended',a.attended,'checkInTime',a.check_in_time,'removedAt',a.deleted_at) INTO item FROM public.event_attendance a JOIN public.events e ON e.id=a.event_id WHERE a.id=(x->>'id')::uuid;
  WHEN 'newsletter' THEN SELECT jsonb_build_object('id',s.id,'name',s.name,'email',s.email,'state',s.state,'consentAt',s.consent_at,'confirmedAt',s.confirmed_at,'unsubscribedAt',s.unsubscribed_at,'suppressedAt',s.suppressed_at,
   'campaigns',(SELECT coalesce(jsonb_agg(jsonb_build_object('campaignId',nr.campaign_id,'subject',c.subject,'status',nr.state,'sentAt',nr.sent_at)),'[]') FROM public.newsletter_campaign_recipients nr JOIN public.newsletter_campaigns c ON c.id=nr.campaign_id WHERE nr.subscriber_id=s.id)) INTO item FROM public.newsletter_subscribers s WHERE s.id=(x->>'id')::uuid;
  WHEN 'contact' THEN SELECT jsonb_build_object('id',c.id,'name',c.name,'email',c.email,'type',c.inquiry_type,'message',c.message,'interests',c.interests,'submittedAt',c.created_at,'resolvedAt',c.resolved_at,'attachment',(SELECT jsonb_build_object('filename',u.filename,'bytes',u.expected_bytes,'state',u.state) FROM public.upload_intents u WHERE u.id=c.attachment_upload_id)) INTO item FROM public.contact_submissions c WHERE c.id=(x->>'id')::uuid;
  WHEN 'form_response' THEN
   SELECT * INTO r FROM public.form_responses WHERE id=(x->>'id')::uuid;
   SELECT coalesce(jsonb_object_agg(a.field_id,a.value),'{}') INTO answer_values FROM public.form_answers a WHERE a.response_id=r.id;
   SELECT coalesce(jsonb_object_agg(u.id,u.original_filename),'{}') INTO files FROM public.form_uploads u WHERE u.response_id=r.id;
   item:=jsonb_build_object('id',r.id,'formId',r.form_id,'versionId',r.version_id,'name',r.respondent_name,'email',r.respondent_email,'identitySource',r.respondent_source,'submittedAt',r.submitted_at,'revision',r.revision,
    'answers',gdg_security.person_form_answers(r.version_id,answer_values,p_sensitive,files),
    'history',(SELECT coalesce(jsonb_agg(jsonb_build_object('revision',h.revision-1,'answers',gdg_security.person_form_answers(r.version_id,h.answers,p_sensitive,files)) ORDER BY h.revision),'[]') FROM public.form_response_revisions h WHERE h.response_id=r.id));
  WHEN 'form_draft' THEN
   SELECT * INTO d FROM public.form_response_drafts WHERE id=(x->>'id')::uuid;
   SELECT coalesce(jsonb_object_agg(u.id,u.original_filename),'{}') INTO files FROM public.form_uploads u WHERE u.draft_id=d.id;
   item:=jsonb_build_object('id',d.id,'formId',d.form_id,'name',d.respondent_name,'email',d.respondent_email,'savedAt',d.updated_at,'expiresAt',d.expires_at,'completedAt',d.completed_at,'answers',gdg_security.person_form_answers(d.version_id,d.answers,p_sensitive,files));
  WHEN 'form_access' THEN SELECT jsonb_build_object('id',a.id,'formId',a.form_id,'type',a.token_type,'createdAt',a.created_at,'expiresAt',a.expires_at,'usedCount',a.used_count,'revokedAt',a.revoked_at) INTO item FROM public.form_access_tokens a WHERE a.id=(x->>'id')::uuid;
  WHEN 'push' THEN SELECT jsonb_build_object('id',s.id,'eventId',s.event_id,'permission',s.permission_state,'createdAt',s.created_at,'revokedAt',s.revoked_at) INTO item FROM public.push_subscriptions s WHERE s.id=(x->>'id')::uuid;
  WHEN 'newsletter_attempt' THEN SELECT jsonb_build_object('id',a.id,'email',a.email,'attemptCount',a.attempt_count,'firstAttemptAt',a.first_attempt_at,'lastAttemptAt',a.last_attempt_at,'blockedUntil',a.blocked_until) INTO item FROM public.newsletter_subscription_attempts a WHERE a.id=(x->>'id')::uuid;
  ELSE RAISE EXCEPTION 'VALIDATION_ERROR';END CASE;
  items:=items||jsonb_build_array(jsonb_build_object('kind',x->>'kind','held',(x->>'held')::boolean,'data',item));
  IF octet_length(items::text)>3145728 THEN RAISE EXCEPTION 'PRIVACY_EXPORT_LIMIT';END IF;
 END LOOP;RETURN items;
END $$;

CREATE FUNCTION gdg_security.person_erasure_authorized(p_kind text,p_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM gdg_security.person_privacy_erasure_grants g,jsonb_array_elements(g.records) r WHERE g.transaction_id=pg_current_xact_id() AND r->>'kind'=p_kind AND r->>'id'=p_id::text);
$$;
REVOKE ALL ON FUNCTION gdg_security.person_privacy_session(uuid,uuid,text),public.person_privacy_form_keys(integer),gdg_security.person_privacy_fingerprint(jsonb),gdg_security.person_privacy_inventory(text,uuid[],jsonb),
 public.review_person_privacy(uuid,uuid,text,text,text,text,text,uuid[],jsonb,boolean,text,text,uuid),gdg_security.person_form_answers(uuid,jsonb,boolean,jsonb),gdg_security.person_privacy_export(jsonb,boolean),gdg_security.person_erasure_authorized(text,uuid) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION gdg_security.person_privacy_session(uuid,uuid,text),public.person_privacy_form_keys(integer),gdg_security.person_privacy_fingerprint(jsonb),gdg_security.person_privacy_inventory(text,uuid[],jsonb),
 public.review_person_privacy(uuid,uuid,text,text,text,text,text,uuid[],jsonb,boolean,text,text,uuid),gdg_security.person_form_answers(uuid,jsonb,boolean,jsonb),gdg_security.person_privacy_export(jsonb,boolean),gdg_security.person_erasure_authorized(text,uuid) TO service_role;
COMMIT;
