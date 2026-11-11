BEGIN;
CREATE FUNCTION public.native_checkin_targets(p_actor uuid,p_session uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 PERFORM gdg_security.reward_admin(p_actor,p_session);
 RETURN jsonb_build_object(
 'activities',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'points',points,'opensAt',opens_at,'closesAt',closes_at) ORDER BY opens_at DESC),'[]') FROM public.reward_activities WHERE is_active AND closes_at>=now() AND opens_at<=now()+interval '7 days'),
 'events',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'startsAt',start_at,'location',location) ORDER BY start_at),'[]') FROM(SELECT id,title,start_at,location FROM public.events WHERE publication_status='published' AND start_at>=now()-interval '7 days' ORDER BY start_at LIMIT 200)e),
 'connections',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'title',e.title,'opensAt',e.opens_at,'closesAt',e.closes_at,'activityId',e.activity_id,'points',coalesce(a.points,0)) ORDER BY e.opens_at),'[]') FROM public.reward_event_connections e LEFT JOIN public.reward_activities a ON a.id=e.activity_id WHERE e.is_active AND e.closes_at>=now()));
END $$;
CREATE FUNCTION public.native_member_checkin(p_actor uuid,p_session uuid,p_kind text,p_target uuid,p_activity uuid,p_hash text,p_uid_hash text,p_key_hash text,p_request_hash text,p_request uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c public.reward_credentials;m public.members;e public.events;att public.event_attendance;a public.reward_activities;l public.reward_ledger;receipt public.reward_receipts;r jsonb;applied integer:=0;already boolean:=false;target_title text;
BEGIN
 PERFORM gdg_security.reward_admin(p_actor,p_session);
 IF p_kind NOT IN('activity','event') OR p_target IS NULL OR p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$' OR p_request_hash IS NULL OR p_request_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 c:=gdg_security.reward_scan_credential(p_actor,p_session,p_hash,p_uid_hash);
 SELECT * INTO m FROM public.members WHERE id=c.member_id;
 PERFORM pg_advisory_xact_lock(hashtextextended('native-checkin-retry:'||p_actor||':'||p_key_hash,0));
 SELECT * INTO receipt FROM public.reward_receipts WHERE actor='native-checkin:'||p_actor AND key_hash=p_key_hash;
 IF FOUND THEN IF receipt.request_hash<>p_request_hash THEN RAISE EXCEPTION 'CONFLICT';END IF;RETURN receipt.result;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('native-checkin-member:'||p_kind||':'||p_target||':'||m.id,0));
 IF p_kind='event' THEN
  SELECT * INTO e FROM public.events WHERE id=p_target AND publication_status='published' FOR SHARE;
  IF NOT FOUND OR NOT public.can_operate_event(p_actor,'update',e.team_id) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
  target_title:=e.title;
  SELECT * INTO att FROM public.event_attendance WHERE event_id=e.id AND attendee_email=lower(btrim(m.email)) AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','not_registered','memberName',m.name,'targetTitle',target_title,'points',0);END IF;
  already:=att.attended;
  IF NOT already THEN UPDATE public.event_attendance SET attended=true,check_in_time=now(),updated_at=now() WHERE id=att.id;END IF;
 ELSE p_activity:=p_target;END IF;
 IF p_activity IS NOT NULL THEN
  SELECT * INTO a FROM public.reward_activities WHERE id=p_activity AND is_active AND opens_at<=now() AND closes_at>=now() FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
  IF p_kind='activity' THEN target_title:=a.title;END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('reward-member:'||m.id,0));
  SELECT * INTO l FROM public.reward_ledger WHERE member_id=m.id AND activity_id=a.id;
  IF NOT FOUND THEN
   BEGIN
   PERFORM public.reward_admin_mutate(p_actor,p_session,'award',jsonb_build_object('memberId',m.id,'activityId',a.id,'credentialId',c.id),p_key_hash,p_request_hash,p_request);
   applied:=a.points;
   EXCEPTION WHEN unique_violation THEN
    IF EXISTS(SELECT 1 FROM public.reward_ledger WHERE member_id=m.id AND activity_id=a.id) THEN applied:=0;IF p_kind='activity' THEN already:=true;END IF;ELSE RAISE;END IF;
   END;
  ELSIF p_kind='activity' THEN already:=true;END IF;
 END IF;
 r:=jsonb_build_object('status',CASE WHEN already AND applied=0 THEN 'duplicate' ELSE 'checked_in' END,'memberName',m.name,'memberId',m.id,'targetTitle',target_title,'points',applied,'balance',gdg_security.reward_balance(m.id));
 INSERT INTO public.reward_receipts(actor,key_hash,request_hash,result) VALUES('native-checkin:'||p_actor,p_key_hash,p_request_hash,r);
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,result) VALUES(p_actor,'native.checkin',p_kind,p_target,p_request,'success');
 RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.native_checkin_targets(uuid,uuid),public.native_member_checkin(uuid,uuid,text,uuid,uuid,text,text,text,text,uuid) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.native_checkin_targets(uuid,uuid),public.native_member_checkin(uuid,uuid,text,uuid,uuid,text,text,text,text,uuid) TO service_role;
COMMIT;
