BEGIN;
-- A per-room, transaction-serialized cursor makes Broadcast advisory rather than
-- the source of truth. Coalesce changes on each retained message; copy no bodies.
ALTER TABLE public.channels ADD COLUMN message_sequence bigint NOT NULL DEFAULT 0
 CHECK(message_sequence BETWEEN 0 AND 9007199254740991);
ALTER TABLE public.channel_messages ADD COLUMN creation_sequence bigint NOT NULL DEFAULT 0,
 ADD COLUMN change_sequence bigint NOT NULL DEFAULT 0;
WITH numbered AS(SELECT id,row_number() OVER(PARTITION BY channel_id ORDER BY created_at,id) AS n FROM public.channel_messages)
 UPDATE public.channel_messages m SET creation_sequence=n.n,change_sequence=n.n FROM numbered n WHERE n.id=m.id;
UPDATE public.channels c SET message_sequence=(SELECT coalesce(max(m.change_sequence),0) FROM public.channel_messages m WHERE m.channel_id=c.id);
CREATE INDEX channel_message_changes ON public.channel_messages(channel_id,change_sequence);
-- Counter writes must not generate a second metadata invalidation per message.
DROP TRIGGER channel_live_changes ON public.channels;
CREATE TRIGGER channel_live_changes AFTER INSERT OR DELETE ON public.channels
 FOR EACH ROW EXECUTE FUNCTION gdg_security.broadcast_invalidation();
CREATE TRIGGER channel_metadata_live_changes AFTER UPDATE OF name,description,visibility,team_id,is_team_chat,is_archived,revision ON public.channels
 FOR EACH ROW EXECUTE FUNCTION gdg_security.broadcast_invalidation();
CREATE FUNCTION gdg_security.sequence_channel_message() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE n bigint;BEGIN
 IF TG_OP='UPDATE' AND NEW.channel_id IS DISTINCT FROM OLD.channel_id THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
 UPDATE public.channels SET message_sequence=message_sequence+1 WHERE id=NEW.channel_id RETURNING message_sequence INTO n;
 IF n IS NULL THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 NEW.change_sequence:=n;
 IF TG_OP='INSERT' THEN NEW.creation_sequence:=n;ELSE NEW.creation_sequence:=OLD.creation_sequence;END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION gdg_security.sequence_channel_message() FROM PUBLIC,anon,authenticated,gdg_realtime;
CREATE TRIGGER channel_message_sequence BEFORE INSERT OR UPDATE ON public.channel_messages
 FOR EACH ROW EXECUTE FUNCTION gdg_security.sequence_channel_message();
CREATE FUNCTION public.channel_message_projection(p_actor uuid,p_id uuid) RETURNS jsonb
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('id',m.id,'channel_id',m.channel_id,'sender_id',m.sender_id,
  'senderName',(SELECT display_name FROM public.admin_users WHERE id=m.sender_id),
  'message',CASE WHEN m.is_deleted THEN '' ELSE m.message END,'is_deleted',m.is_deleted,'is_pinned',m.is_pinned,
  'revision',m.revision,'reply_to_id',m.reply_to_id,'created_at',m.created_at,'updated_at',m.updated_at,
  'creation_sequence',m.creation_sequence,'change_sequence',m.change_sequence,
  'canEdit',NOT m.is_deleted AND m.sender_id=p_actor AND public.can_operate_channel(p_actor,m.channel_id,'send'),
  'canDelete',NOT m.is_deleted AND (m.sender_id=p_actor OR public.can_operate_channel(p_actor,m.channel_id,'moderate')) AND public.can_operate_channel(p_actor,m.channel_id,'send'),
  'reply',CASE WHEN m.reply_to_id IS NOT NULL THEN (SELECT jsonb_build_object('id',r.id,'message',CASE WHEN r.is_deleted THEN '' ELSE left(r.message,200) END,'is_deleted',r.is_deleted)
   FROM public.channel_messages r WHERE r.id=m.reply_to_id AND r.channel_id=m.channel_id) ELSE NULL END)
 FROM public.channel_messages m WHERE m.id=p_id AND public.can_operate_channel(p_actor,m.channel_id,'read');
$$;
CREATE OR REPLACE FUNCTION public.list_channel_messages(p_actor uuid,p_channel uuid,p_before timestamptz,p_before_id uuid,p_pinned boolean) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;BEGIN
 IF NOT public.can_operate_channel(p_actor,p_channel,'read') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 WITH page AS(SELECT m.id,m.created_at FROM public.channel_messages m WHERE m.channel_id=p_channel
  AND (NOT p_pinned OR (m.is_pinned AND NOT m.is_deleted)) AND
  (p_before IS NULL OR (m.created_at,m.id)<(p_before,p_before_id)) ORDER BY created_at DESC,id DESC LIMIT 50)
 SELECT jsonb_build_object('items',coalesce(jsonb_agg(public.channel_message_projection(p_actor,m.id) ORDER BY m.created_at,m.id),'[]'),
  'highWaterMark',(SELECT message_sequence FROM public.channels WHERE id=p_channel)) INTO result FROM page m;
 RETURN result;
END $$;
CREATE FUNCTION public.list_channel_changes(p_actor uuid,p_channel uuid,p_after bigint) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE high bigint;result jsonb;BEGIN
 IF NOT public.can_operate_channel(p_actor,p_channel,'read') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT message_sequence INTO high FROM public.channels WHERE id=p_channel;
 IF p_after IS NULL OR p_after<0 OR p_after>high THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
 WITH page AS(SELECT m.id,m.change_sequence FROM public.channel_messages m WHERE m.channel_id=p_channel AND m.change_sequence>p_after
  ORDER BY m.change_sequence LIMIT 100)
 SELECT jsonb_build_object('items',coalesce(jsonb_agg(public.channel_message_projection(p_actor,m.id) ORDER BY m.change_sequence),'[]'),
  'cursor',coalesce(max(m.change_sequence),high),'highWaterMark',high,
  'hasMore',EXISTS(SELECT 1 FROM public.channel_messages x WHERE x.channel_id=p_channel AND x.change_sequence>coalesce(max(m.change_sequence),high)))
 INTO result FROM page m;RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.channel_message_projection(uuid,uuid),public.list_channel_changes(uuid,uuid,bigint) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.channel_message_projection(uuid,uuid),public.list_channel_changes(uuid,uuid,bigint) TO service_role;
COMMIT;
