BEGIN;
CREATE FUNCTION public.invite_newsletter_subscriber(p_actor uuid,p_session uuid,p_team uuid,p_email text,p_name text,p_acknowledged boolean,p_token_hash text,p_secret_payload text,p_key_hash text,p_request_hash text,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.newsletter_subscribers;k public.idempotency_keys;r jsonb;receipt_scope text;existed boolean;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('newsletter-workspace',0));
 IF NOT gdg_security.member_transfer_session(p_actor,p_session) OR NOT public.can_operate_newsletter(p_actor,p_team,'read') OR NOT public.can_operate_newsletter(p_actor,p_team,'create') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_acknowledged IS DISTINCT FROM true OR p_email IS NULL OR length(p_email) NOT BETWEEN 3 AND 254 OR p_email<>lower(btrim(p_email)) OR p_email NOT LIKE '%@%' OR length(coalesce(p_name,''))>100
  OR p_token_hash IS NULL OR p_token_hash!~'^[a-f0-9]{64}$' OR length(coalesce(p_secret_payload,'')) NOT BETWEEN 40 AND 4096
  OR p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$' OR p_request_hash IS NULL OR p_request_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('newsletter:'||p_email,0));
 SELECT * INTO s FROM public.newsletter_subscribers WHERE email=p_email FOR UPDATE;
 existed:=FOUND;
 IF existed AND(s.team_id IS DISTINCT FROM p_team OR NOT public.can_operate_newsletter(p_actor,s.team_id,'read') OR NOT public.can_operate_newsletter(p_actor,s.team_id,'create')) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 receipt_scope:='newsletter.invite:'||p_actor||':'||p_session;
 SELECT * INTO k FROM public.idempotency_keys WHERE scope=receipt_scope AND key_hash=p_key_hash;
 IF FOUND THEN IF k.request_hash IS DISTINCT FROM p_request_hash THEN RAISE EXCEPTION 'CONFLICT';END IF;RETURN k.result;END IF;
 IF existed AND s.suppressed_at IS NOT NULL THEN RAISE EXCEPTION 'NEWSLETTER_SUPPRESSED';END IF;
 IF existed AND s.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'NEWSLETTER_ARCHIVED';END IF;
 IF NOT existed THEN
  INSERT INTO public.newsletter_subscribers(email,name,team_id,is_active,state,consent_at) VALUES(p_email,coalesce(p_name,''),p_team,false,'pending',now()) RETURNING * INTO s;
 END IF;
 IF s.state='active' THEN
  r:=jsonb_build_object('id',s.id,'accepted',true,'queued',false,'state','active','existing',true);
 ELSE
  IF s.state='unsubscribed' THEN
   UPDATE public.newsletter_subscribers SET state='pending',is_active=false,confirmed_at=NULL,consent_at=now() WHERE id=s.id;
  END IF;
  r:=public.notify_newsletter_subscriber(p_actor,p_session,s.id,p_token_hash,p_secret_payload,p_key_hash,p_request_hash,p_request)
    ||jsonb_build_object('id',s.id,'accepted',true,'state','pending','existing',existed);
 END IF;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata) VALUES(p_actor,CASE WHEN existed THEN 'newsletter.subscribers_reinvite' ELSE 'newsletter.subscribers_create' END,'newsletter_subscribers',s.id,p_request,jsonb_build_object('teamId',p_team,'queued',r->'queued'));
 INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result) VALUES(receipt_scope,p_key_hash,p_request_hash,200,r);
 RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.invite_newsletter_subscriber(uuid,uuid,uuid,text,text,boolean,text,text,text,text,uuid) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.invite_newsletter_subscriber(uuid,uuid,uuid,text,text,boolean,text,text,text,text,uuid) TO service_role;
COMMIT;
