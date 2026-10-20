BEGIN;
-- This chapter is fresh. Never silently discard or invent threads for old mail.
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.internal_messages) THEN RAISE EXCEPTION 'Existing direct messages require a reviewed thread migration';END IF;END $$;
CREATE TABLE public.direct_message_threads(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),subject text NOT NULL CHECK(length(btrim(subject)) BETWEEN 1 AND 200),
 participant_a uuid NOT NULL REFERENCES public.admin_users(id),participant_b uuid NOT NULL REFERENCES public.admin_users(id),
 revision integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(participant_a<>participant_b));
CREATE TABLE public.direct_thread_states(
 thread_id uuid NOT NULL REFERENCES public.direct_message_threads(id),user_id uuid NOT NULL REFERENCES public.admin_users(id),
 is_archived boolean NOT NULL DEFAULT false,revision integer NOT NULL DEFAULT 1,PRIMARY KEY(thread_id,user_id));
CREATE TABLE gdg_security.direct_review_sessions(
 session_id uuid PRIMARY KEY REFERENCES public.admin_sessions(id),actor_id uuid NOT NULL REFERENCES public.admin_users(id),
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 10 AND 500),expires_at timestamptz NOT NULL,revoked_at timestamptz);
ALTER TABLE public.direct_message_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_thread_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE gdg_security.direct_review_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.direct_message_threads,public.direct_thread_states,gdg_security.direct_review_sessions FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT SELECT,INSERT,UPDATE ON public.direct_message_threads,public.direct_thread_states,gdg_security.direct_review_sessions TO service_role;
ALTER TABLE public.internal_messages ADD COLUMN thread_id uuid NOT NULL REFERENCES public.direct_message_threads(id),
 ADD COLUMN revision integer NOT NULL DEFAULT 1,ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),ADD COLUMN deleted_at timestamptz;
CREATE INDEX direct_thread_history ON public.internal_messages(thread_id,created_at DESC,id DESC);
CREATE INDEX direct_thread_a ON public.direct_message_threads(participant_a,updated_at DESC,id DESC);
CREATE INDEX direct_thread_b ON public.direct_message_threads(participant_b,updated_at DESC,id DESC);
CREATE FUNCTION public.direct_review_allowed(p_actor uuid,p_session uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM gdg_security.direct_review_sessions r JOIN public.admin_sessions s ON s.id=r.session_id AND s.admin_user_id=r.actor_id
  JOIN public.admin_users u ON u.id=r.actor_id WHERE r.actor_id=p_actor AND r.session_id=p_session AND r.revoked_at IS NULL AND r.expires_at>now()
  AND s.revoked_at IS NULL AND s.idle_expires_at>now() AND s.absolute_expires_at>now() AND u.is_active AND u.deleted_at IS NULL AND NOT u.must_change_password AND u.role='super_admin');
$$;
CREATE FUNCTION public.can_read_direct_thread(p_actor uuid,p_session uuid,p_thread uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.direct_message_threads t JOIN public.admin_users u ON u.id=p_actor AND u.is_active AND NOT u.must_change_password AND u.deleted_at IS NULL
  JOIN public.admin_sessions s ON s.id=p_session AND s.admin_user_id=u.id AND s.revoked_at IS NULL AND s.idle_expires_at>now() AND s.absolute_expires_at>now()
  WHERE t.id=p_thread AND (p_actor IN(t.participant_a,t.participant_b) OR public.direct_review_allowed(p_actor,p_session)));
$$;
CREATE FUNCTION public.direct_review_state(p_actor uuid,p_session uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('active',public.direct_review_allowed(p_actor,p_session),'expiresAt',
  (SELECT expires_at FROM gdg_security.direct_review_sessions WHERE session_id=p_session AND actor_id=p_actor AND public.direct_review_allowed(p_actor,p_session)));
$$;
CREATE FUNCTION public.mutate_direct_review(p_actor uuid,p_session uuid,p_action text,p_verified_hash text,p_reason text,p_request_id uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE u public.admin_users;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));
 SELECT * INTO u FROM public.admin_users WHERE id=p_actor AND is_active AND NOT must_change_password AND deleted_at IS NULL;
 PERFORM 1 FROM public.admin_sessions WHERE id=p_session AND admin_user_id=p_actor AND revoked_at IS NULL AND idle_expires_at>now() AND absolute_expires_at>now();
 IF u.id IS NULL OR NOT FOUND OR u.role<>'super_admin' THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 IF p_action='start' THEN
  IF u.password_hash IS DISTINCT FROM p_verified_hash OR p_verified_hash IS NULL OR u.locked_until>now() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 10 AND 500 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
  INSERT INTO gdg_security.direct_review_sessions(session_id,actor_id,reason,expires_at) VALUES(p_session,p_actor,p_reason,now()+interval '5 minutes')
   ON CONFLICT(session_id) DO UPDATE SET reason=EXCLUDED.reason,expires_at=EXCLUDED.expires_at,revoked_at=NULL;
 ELSIF p_action='stop' THEN UPDATE gdg_security.direct_review_sessions SET revoked_at=now() WHERE session_id=p_session AND actor_id=p_actor;
 ELSE RAISE EXCEPTION 'INVALID_STATE';END IF;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata)
  VALUES(p_actor,'messages.review_'||p_action,'session',p_session,p_request_id,jsonb_build_object('reason',CASE WHEN p_action='start' THEN p_reason ELSE NULL END));
 RETURN public.direct_review_state(p_actor,p_session);
END $$;
CREATE FUNCTION public.direct_thread_projection(p_actor uuid,p_session uuid,p_thread uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('id',t.id,'subject',t.subject,'revision',t.revision,'created_at',t.created_at,'updated_at',t.updated_at,
  'participant',p_actor IN(t.participant_a,t.participant_b),'participantA',t.participant_a,'participantB',t.participant_b,
  'nameA',(SELECT display_name FROM public.admin_users WHERE id=t.participant_a),'nameB',(SELECT display_name FROM public.admin_users WHERE id=t.participant_b),
  'canReply',p_actor IN(t.participant_a,t.participant_b) AND EXISTS(SELECT 1 FROM public.admin_users WHERE id=CASE WHEN p_actor=t.participant_a THEN t.participant_b ELSE t.participant_a END AND is_active AND NOT must_change_password AND deleted_at IS NULL),
  'archived',coalesce(st.is_archived,false),'stateRevision',st.revision,
  'unread',(SELECT count(*) FROM public.internal_messages WHERE thread_id=t.id AND to_user_id=p_actor AND NOT is_read AND deleted_at IS NULL))
 FROM public.direct_message_threads t LEFT JOIN public.direct_thread_states st ON st.thread_id=t.id AND st.user_id=p_actor
 WHERE t.id=p_thread AND public.can_read_direct_thread(p_actor,p_session,t.id);
$$;
CREATE FUNCTION public.list_direct_threads(p_actor uuid,p_session uuid,p_query text,p_scope text,p_archived boolean,p_before timestamptz,p_before_id uuid) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;BEGIN
 IF p_scope IS NULL OR p_scope NOT IN ('own','review') OR p_archived IS NULL OR length(p_query)>100 OR (p_before IS NULL)<>(p_before_id IS NULL) THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 IF p_scope='review' AND NOT public.direct_review_allowed(p_actor,p_session) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 WITH eligible AS(SELECT t.* FROM public.direct_message_threads t LEFT JOIN public.direct_thread_states st ON st.thread_id=t.id AND st.user_id=p_actor
  WHERE public.can_read_direct_thread(p_actor,p_session,t.id) AND(p_scope='review' OR p_actor IN(t.participant_a,t.participant_b))
  AND(p_scope='review' OR coalesce(st.is_archived,false)=p_archived) AND(p_query IS NULL OR strpos(lower(t.subject),lower(p_query))>0)),
 page AS(SELECT * FROM eligible WHERE p_before IS NULL OR(updated_at,id)<(p_before,p_before_id) ORDER BY updated_at DESC,id DESC LIMIT 30)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(public.direct_thread_projection(p_actor,p_session,id) ORDER BY updated_at DESC,id DESC) FROM page),'[]'),
  'total',(SELECT count(*) FROM eligible),'unread',(SELECT count(*) FROM public.internal_messages m JOIN eligible e ON e.id=m.thread_id WHERE m.to_user_id=p_actor AND NOT m.is_read AND m.deleted_at IS NULL)) INTO result;
 RETURN result;
END $$;
CREATE FUNCTION public.list_direct_messages(p_actor uuid,p_session uuid,p_thread uuid,p_before timestamptz,p_before_id uuid) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;BEGIN
 IF NOT public.can_read_direct_thread(p_actor,p_session,p_thread) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF(p_before IS NULL)<>(p_before_id IS NULL) THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 WITH page AS(SELECT * FROM public.internal_messages WHERE thread_id=p_thread AND(p_before IS NULL OR(created_at,id)<(p_before,p_before_id)) ORDER BY created_at DESC,id DESC LIMIT 50)
 SELECT jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object('id',m.id,'from_user_id',m.from_user_id,
  'authorName',(SELECT display_name FROM public.admin_users WHERE id=m.from_user_id),'message',CASE WHEN m.deleted_at IS NULL THEN m.message ELSE '' END,
  'revision',m.revision,'deleted_at',m.deleted_at,'created_at',m.created_at,'updated_at',m.updated_at,'read_at',m.read_at,
  'replyToId',CASE WHEN m.deleted_at IS NULL THEN m.reply_to_id ELSE NULL END,
  'replyPreview',(SELECT CASE WHEN r.deleted_at IS NULL THEN left(r.message,160) ELSE 'Message removed' END FROM public.internal_messages r WHERE r.id=m.reply_to_id AND r.thread_id=m.thread_id AND m.deleted_at IS NULL),
  'own',m.from_user_id=p_actor) ORDER BY m.created_at,m.id),'[]')) INTO result FROM page m;
 RETURN result;
END $$;
CREATE FUNCTION public.mutate_direct_message(p_actor uuid,p_session uuid,p_thread uuid,p_id uuid,p_action text,p_revision integer,p_document jsonb,
 p_key_hash text,p_request_hash text,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE u public.admin_users;v public.admin_users;t public.direct_message_threads;m public.internal_messages;k public.idempotency_keys;
 v_scope text;result jsonb;peer uuid;st public.direct_thread_states;through public.internal_messages;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('direct:'||coalesce(p_thread::text,p_actor::text),0));
 SELECT * INTO u FROM public.admin_users WHERE id=p_actor AND is_active AND NOT must_change_password AND deleted_at IS NULL;
 PERFORM 1 FROM public.admin_sessions WHERE id=p_session AND admin_user_id=p_actor AND revoked_at IS NULL AND idle_expires_at>now() AND absolute_expires_at>now();
 IF u.id IS NULL OR NOT FOUND THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 IF p_action IS NULL OR p_action NOT IN ('create','reply','edit','delete','restore_message','archive','restore','read') THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
 IF p_action<>'create' THEN
  SELECT * INTO t FROM public.direct_message_threads WHERE id=p_thread FOR UPDATE;
  -- Oversight is strictly read-only. Even a reviewer cannot mark a peer's mail read.
  IF NOT FOUND OR p_actor NOT IN(t.participant_a,t.participant_b) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  peer:=CASE WHEN p_actor=t.participant_a THEN t.participant_b ELSE t.participant_a END;
 END IF;
 v_scope:='direct.'||p_action||':'||p_actor||':'||coalesce(p_thread::text,'new')||':'||coalesce(p_id::text,'none');
 SELECT * INTO k FROM public.idempotency_keys WHERE scope=v_scope AND key_hash=p_key_hash;
 IF FOUND THEN IF k.request_hash IS DISTINCT FROM p_request_hash THEN RAISE EXCEPTION 'CONFLICT';END IF;RETURN k.result;END IF;
 IF p_action IN ('create','reply','edit') AND (p_document->>'message' IS NULL OR length(btrim(p_document->>'message')) NOT BETWEEN 1 AND 10000) THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 IF p_action='create' THEN
  IF p_document->>'subject' IS NULL OR length(btrim(p_document->>'subject')) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
  SELECT * INTO v FROM public.admin_users WHERE email=p_document->>'recipientEmail' AND is_active AND NOT must_change_password AND deleted_at IS NULL AND id<>p_actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNT_NOT_READY';END IF;
  peer:=v.id;
  INSERT INTO public.direct_message_threads(subject,participant_a,participant_b) VALUES(p_document->>'subject',p_actor,peer) RETURNING * INTO t;
  INSERT INTO public.direct_thread_states(thread_id,user_id) VALUES(t.id,p_actor),(t.id,peer);
 END IF;
 IF p_action IN ('create','reply') THEN
  IF NOT EXISTS(SELECT 1 FROM public.admin_users WHERE id=peer AND is_active AND NOT must_change_password AND deleted_at IS NULL) THEN RAISE EXCEPTION 'ACCOUNT_NOT_READY';END IF;
  IF p_document->>'replyToId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.internal_messages WHERE id=(p_document->>'replyToId')::uuid AND thread_id=t.id AND deleted_at IS NULL) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  INSERT INTO public.internal_messages(thread_id,from_user_id,to_user_id,subject,message,reply_to_id) VALUES(t.id,p_actor,peer,t.subject,p_document->>'message',(p_document->>'replyToId')::uuid) RETURNING * INTO m;
  UPDATE public.direct_message_threads SET updated_at=clock_timestamp(),revision=revision+1 WHERE id=t.id RETURNING * INTO t;
  UPDATE public.direct_thread_states SET is_archived=false,revision=revision+1 WHERE thread_id=t.id;
  INSERT INTO public.delivery_jobs(kind,deduplication_key,payload) VALUES('direct_message_notice','direct-message:'||m.id,jsonb_build_object('messageId',m.id,'threadId',t.id));
 ELSIF p_action IN ('edit','delete','restore_message') THEN
  SELECT * INTO m FROM public.internal_messages WHERE id=p_id AND thread_id=t.id FOR UPDATE;
  IF NOT FOUND OR m.from_user_id<>p_actor THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  IF m.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'CONFLICT';END IF;
  IF(p_action='restore_message')=(m.deleted_at IS NULL) THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  UPDATE public.internal_messages SET message=CASE WHEN p_action='edit' THEN p_document->>'message' ELSE message END,
   deleted_at=CASE WHEN p_action='delete' THEN now() WHEN p_action='restore_message' THEN NULL ELSE deleted_at END,
   updated_at=clock_timestamp(),revision=revision+1 WHERE id=m.id RETURNING * INTO m;
  UPDATE public.direct_message_threads SET revision=revision+1 WHERE id=t.id RETURNING * INTO t;
 ELSIF p_action IN ('archive','restore') THEN
  SELECT * INTO st FROM public.direct_thread_states WHERE thread_id=t.id AND user_id=p_actor FOR UPDATE;
  IF NOT FOUND OR st.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'CONFLICT';END IF;
  IF st.is_archived=(p_action='archive') THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  UPDATE public.direct_thread_states SET is_archived=(p_action='archive'),revision=revision+1 WHERE thread_id=t.id AND user_id=p_actor;
 ELSIF p_action='read' THEN
  SELECT * INTO through FROM public.internal_messages WHERE id=(p_document->>'throughId')::uuid AND thread_id=t.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  UPDATE public.internal_messages SET is_read=true,read_at=coalesce(read_at,now()) WHERE thread_id=t.id AND to_user_id=p_actor AND NOT is_read AND(created_at,id)<=(through.created_at,through.id);
 END IF;
 result:=jsonb_build_object('id',t.id,'messageId',m.id,'revision',m.revision);
 INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result) VALUES(v_scope,p_key_hash,p_request_hash,200,result);
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id) VALUES(p_actor,'messages.'||p_action,'direct_thread',t.id,p_request_id);
 RETURN result;
END $$;
CREATE FUNCTION public.prepare_direct_notice(p_job uuid,p_lease uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.delivery_jobs;m public.internal_messages;recipient public.admin_users;BEGIN
 SELECT * INTO j FROM public.delivery_jobs WHERE id=p_job AND lease_token=p_lease AND state='running' AND kind='direct_message_notice' AND locked_until>now() FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT * INTO m FROM public.internal_messages WHERE id=(j.payload->>'messageId')::uuid AND thread_id=(j.payload->>'threadId')::uuid AND deleted_at IS NULL;
 IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT * INTO recipient FROM public.admin_users WHERE id=m.to_user_id AND is_active AND NOT must_change_password AND deleted_at IS NULL;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.admin_users WHERE id=m.from_user_id AND is_active AND deleted_at IS NULL AND NOT must_change_password) THEN RETURN NULL;END IF;
 IF NOT EXISTS(SELECT 1 FROM public.direct_message_threads WHERE id=m.thread_id AND m.from_user_id IN(participant_a,participant_b) AND m.to_user_id IN(participant_a,participant_b)) THEN RETURN NULL;END IF;
 INSERT INTO public.notifications(user_id,title,message,type,link,delivery_key) VALUES(recipient.id,'New chapter message','A private conversation has a new message.','system',
  '/admin/communications?tab=messages&thread='||m.thread_id,'direct-message:'||m.id) ON CONFLICT(delivery_key) DO NOTHING;
 RETURN jsonb_build_object('email',recipient.email,'threadId',m.thread_id);
END $$;
CREATE OR REPLACE FUNCTION public.claim_delivery_jobs(p_limit integer) RETURNS SETOF public.delivery_jobs LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT * FROM public.claim_worker_jobs(p_limit,ARRAY['event_confirmation','event_message','newsletter_confirmation','contact_acknowledgment','contact_notification',
 'form_access','form_response_notification','account_access','team_invite','team_announcement','task_notification','direct_message_notice']);
$$;
REVOKE ALL ON FUNCTION public.direct_review_allowed(uuid,uuid),public.can_read_direct_thread(uuid,uuid,uuid),public.direct_review_state(uuid,uuid),
 public.mutate_direct_review(uuid,uuid,text,text,text,uuid),public.direct_thread_projection(uuid,uuid,uuid),public.list_direct_threads(uuid,uuid,text,text,boolean,timestamptz,uuid),
 public.list_direct_messages(uuid,uuid,uuid,timestamptz,uuid),public.mutate_direct_message(uuid,uuid,uuid,uuid,text,integer,jsonb,text,text,uuid),public.prepare_direct_notice(uuid,uuid)
 FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.direct_review_allowed(uuid,uuid),public.can_read_direct_thread(uuid,uuid,uuid),public.direct_review_state(uuid,uuid),
 public.mutate_direct_review(uuid,uuid,text,text,text,uuid),public.direct_thread_projection(uuid,uuid,uuid),public.list_direct_threads(uuid,uuid,text,text,boolean,timestamptz,uuid),
 public.list_direct_messages(uuid,uuid,uuid,timestamptz,uuid),public.mutate_direct_message(uuid,uuid,uuid,uuid,text,integer,jsonb,text,text,uuid),public.prepare_direct_notice(uuid,uuid) TO service_role;
COMMIT;
