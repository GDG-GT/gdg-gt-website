BEGIN;
CREATE TABLE public.event_messages(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),event_id uuid NOT NULL REFERENCES public.events(id),created_by uuid NOT NULL REFERENCES public.admin_users(id),
 subject text NOT NULL,message text NOT NULL,key_hash text NOT NULL,request_hash text NOT NULL,recipient_count integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(event_id,key_hash)
);
CREATE TABLE public.event_message_recipients(
 message_id uuid NOT NULL REFERENCES public.event_messages(id),registration_id uuid NOT NULL REFERENCES public.event_attendance(id),
 recipient_email text NOT NULL,PRIMARY KEY(message_id,registration_id)
);
ALTER TABLE public.event_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_message_recipients ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.can_event_audience(p_actor uuid,p_event uuid,p_action text) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.events e JOIN public.admin_users u ON u.id=p_actor WHERE e.id=p_event AND u.is_active AND
  (u.role IN ('admin','super_admin') OR (u.role='team_member' AND public.can_operate_event(u.id,'read',e.team_id) AND EXISTS(
   SELECT 1 FROM public.team_permissions p WHERE p.team_id=e.team_id AND p.resource_type='events'
   AND p.can_read AND p.permission IN (p_action,'events.'||p_action)))))
$$;
CREATE FUNCTION public.queue_event_message(p_actor uuid,p_event uuid,p_subject text,p_message text,p_expected_count integer,
 p_key_hash text,p_request_hash text,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v public.events;v_old public.event_messages;v_id uuid;v_count integer;
BEGIN
 SELECT * INTO v FROM public.events WHERE id=p_event FOR UPDATE;
 IF NOT FOUND OR NOT public.can_event_audience(p_actor,p_event,'send_email') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT * INTO v_old FROM public.event_messages WHERE event_id=p_event AND key_hash=p_key_hash;
 IF FOUND THEN IF v_old.request_hash<>p_request_hash THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  RETURN jsonb_build_object('messageId',v_old.id,'recipientCount',v_old.recipient_count,'queued',true);END IF;
 SELECT count(*) INTO v_count FROM public.event_attendance WHERE event_id=p_event AND deleted_at IS NULL;
 IF v_count<>p_expected_count OR v_count=0 OR v_count>1000 THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
 INSERT INTO public.event_messages(event_id,created_by,subject,message,key_hash,request_hash,recipient_count)
 VALUES(p_event,p_actor,p_subject,p_message,p_key_hash,p_request_hash,v_count) RETURNING id INTO v_id;
 INSERT INTO public.event_message_recipients(message_id,registration_id,recipient_email)
 SELECT v_id,id,attendee_email FROM public.event_attendance WHERE event_id=p_event AND deleted_at IS NULL;
 INSERT INTO public.delivery_jobs(kind,deduplication_key,payload)
 SELECT 'event_message','event-message:'||v_id||':'||registration_id,jsonb_build_object('messageId',v_id,'registrationId',registration_id)
 FROM public.event_message_recipients WHERE message_id=v_id;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata)
 VALUES(p_actor,'events.email_queued','event',p_event,p_request_id,jsonb_build_object('messageId',v_id,'recipientCount',v_count));
 RETURN jsonb_build_object('messageId',v_id,'recipientCount',v_count,'queued',true);
END $$;
CREATE TRIGGER event_messages_immutable BEFORE UPDATE OR DELETE ON public.event_messages FOR EACH ROW EXECUTE FUNCTION public.protect_audit_rows();
CREATE TRIGGER event_recipients_immutable BEFORE UPDATE OR DELETE ON public.event_message_recipients FOR EACH ROW EXECUTE FUNCTION public.protect_audit_rows();
REVOKE ALL ON public.event_messages,public.event_message_recipients FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.event_messages,public.event_message_recipients TO service_role;
REVOKE ALL ON FUNCTION public.can_event_audience(uuid,uuid,text),public.queue_event_message(uuid,uuid,text,text,integer,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.can_event_audience(uuid,uuid,text),public.queue_event_message(uuid,uuid,text,text,integer,text,text,uuid) TO service_role;
COMMIT;
