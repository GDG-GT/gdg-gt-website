BEGIN;
-- Recorded external consent is a deliberate chapter Super Admin action.
-- Public subscriptions retain double opt-in. Existing opt-outs stay untouched.
CREATE FUNCTION public.preview_newsletter_member_import(p_actor uuid,p_session uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NOT gdg_security.member_transfer_session(p_actor,p_session)
 OR NOT EXISTS(SELECT 1 FROM public.admin_users WHERE id=p_actor AND role='super_admin')
 OR NOT public.can_operate_newsletter(p_actor,NULL,'create') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 RETURN (SELECT jsonb_build_object('items',coalesce(jsonb_agg(item ORDER BY item->>'name'),'[]'::jsonb)) FROM (
 SELECT jsonb_build_object('id',m.id,'name',m.name,'email',m.email,'status',CASE
 WHEN s.id IS NULL THEN 'new' WHEN s.team_id IS NOT NULL THEN 'other_scope'
 WHEN s.deleted_at IS NOT NULL OR s.suppressed_at IS NOT NULL OR s.state='unsubscribed' THEN 'excluded'
 WHEN s.state='active' THEN 'subscribed' ELSE 'pending' END) item
 FROM public.members m LEFT JOIN public.newsletter_subscribers s ON lower(btrim(s.email))=lower(btrim(m.email))
 WHERE m.deleted_at IS NULL AND m.merged_into_id IS NULL AND m.is_active
 AND public.can_operate_member(p_actor,m.team_id,'read') ORDER BY m.name,m.id LIMIT 1000) rows);
END $$;
CREATE FUNCTION public.import_newsletter_members(p_actor uuid,p_session uuid,p_member_ids jsonb,p_consent_note text,p_key_hash text,p_request_hash text,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE m public.members;s public.newsletter_subscribers;k public.idempotency_keys;result jsonb;scope_key text;created integer:=0;activated integer:=0;existing integer:=0;excluded integer:=0;selected integer;sid uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('newsletter-workspace',0));
 PERFORM public.preview_newsletter_member_import(p_actor,p_session);
 IF p_member_ids IS NULL OR jsonb_typeof(p_member_ids)<>'array' OR jsonb_array_length(p_member_ids) NOT BETWEEN 1 AND 1000
 OR length(btrim(coalesce(p_consent_note,''))) NOT BETWEEN 10 AND 500
 OR p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$' OR p_request_hash IS NULL OR p_request_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 selected:=jsonb_array_length(p_member_ids);
 IF(SELECT count(DISTINCT v::uuid) FROM jsonb_array_elements_text(p_member_ids)v)<>selected THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 scope_key:='newsletter.member_import:'||p_actor||':'||p_session;
 SELECT * INTO k FROM public.idempotency_keys WHERE scope=scope_key AND key_hash=p_key_hash;
 IF FOUND THEN IF k.request_hash IS DISTINCT FROM p_request_hash THEN RAISE EXCEPTION 'CONFLICT';END IF;RETURN k.result;END IF;
 IF(SELECT count(*) FROM public.members candidate WHERE candidate.id IN(SELECT v::uuid FROM jsonb_array_elements_text(p_member_ids)v)
 AND candidate.deleted_at IS NULL AND candidate.merged_into_id IS NULL AND candidate.is_active AND public.can_operate_member(p_actor,candidate.team_id,'read'))<>selected THEN RAISE EXCEPTION 'CONFLICT';END IF;
 FOR m IN SELECT * FROM public.members WHERE id IN(SELECT v::uuid FROM jsonb_array_elements_text(p_member_ids)v) ORDER BY id FOR UPDATE LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended('newsletter:'||lower(btrim(m.email)),0));
  SELECT * INTO s FROM public.newsletter_subscribers WHERE lower(btrim(email))=lower(btrim(m.email)) FOR UPDATE;
  IF s.id IS NULL THEN
   INSERT INTO public.newsletter_subscribers(email,name,team_id,state,is_active,consent_at,confirmed_at)
   VALUES(lower(btrim(m.email)),m.name,NULL,'active',true,now(),now()) RETURNING id INTO sid;created:=created+1;
  ELSIF s.deleted_at IS NOT NULL OR s.suppressed_at IS NOT NULL OR s.state='unsubscribed' OR s.team_id IS NOT NULL THEN
   excluded:=excluded+1;CONTINUE;
  ELSIF s.state='active' THEN existing:=existing+1;CONTINUE;
  ELSE
   UPDATE public.newsletter_subscribers SET state='active',is_active=true,consent_at=coalesce(consent_at,now()),confirmed_at=now() WHERE id=s.id;
   sid:=s.id;activated:=activated+1;
  END IF;
  INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata)
  VALUES(p_actor,'newsletter.member_consent_recorded','newsletter_subscriber',sid,p_request_id,jsonb_build_object('memberId',m.id,'source','external_consent','note',btrim(p_consent_note)));
 END LOOP;
 result:=jsonb_build_object('selected',selected,'created',created,'activated',activated,'existing',existing,'excluded',excluded,'emailsQueued',0);
 INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result) VALUES(scope_key,p_key_hash,p_request_hash,200,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.preview_newsletter_member_import(uuid,uuid),public.import_newsletter_members(uuid,uuid,jsonb,text,text,text,uuid) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.preview_newsletter_member_import(uuid,uuid),public.import_newsletter_members(uuid,uuid,jsonb,text,text,text,uuid) TO service_role;
COMMIT;
