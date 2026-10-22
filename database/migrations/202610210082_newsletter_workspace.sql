BEGIN;
ALTER TABLE public.newsletter_subscribers ADD COLUMN team_id uuid REFERENCES public.admin_teams(id),ADD COLUMN revision integer NOT NULL DEFAULT 1,
 ADD COLUMN deleted_at timestamptz,ADD COLUMN suppressed_at timestamptz,ADD COLUMN suppression_reason text CHECK(suppression_reason IN('hard_bounce','complaint','manual'));
ALTER TABLE public.newsletter_templates ADD COLUMN team_id uuid REFERENCES public.admin_teams(id),ADD COLUMN revision integer NOT NULL DEFAULT 1,ADD COLUMN deleted_at timestamptz,ADD COLUMN created_by uuid REFERENCES public.admin_users(id);
ALTER TABLE public.newsletter_campaigns ADD COLUMN team_id uuid REFERENCES public.admin_teams(id),ADD COLUMN revision integer NOT NULL DEFAULT 1,ADD COLUMN deleted_at timestamptz,
 ADD COLUMN audience_mode text NOT NULL DEFAULT 'all' CHECK(audience_mode IN('all','custom')),ADD COLUMN custom_recipient_ids jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(custom_recipient_ids)='array' AND jsonb_array_length(custom_recipient_ids)<=1000);
ALTER TABLE public.newsletter_campaigns DROP CONSTRAINT newsletter_campaigns_status_check,ADD CONSTRAINT newsletter_campaigns_status_check CHECK(status IN('draft','scheduled','sending','sent','failed','cancelled'));
CREATE INDEX newsletter_subscriber_scope ON public.newsletter_subscribers(team_id,state,id);
CREATE FUNCTION public.can_operate_newsletter(p_actor uuid,p_team uuid,p_action text) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT p_action IN('read','create','update','delete','send_email') AND EXISTS(SELECT 1 FROM public.admin_users u WHERE u.id=p_actor AND u.is_active AND NOT u.must_change_password AND u.deleted_at IS NULL AND(u.locked_until IS NULL OR u.locked_until<=now()) AND
 (p_action='read' OR p_team IS NULL OR EXISTS(SELECT 1 FROM public.admin_teams WHERE id=p_team AND is_active AND deleted_at IS NULL)) AND
 (u.role IN('admin','super_admin') OR(u.role='team_member' AND p_team IS NOT NULL AND EXISTS(SELECT 1 FROM public.team_memberships m JOIN public.admin_teams t ON t.id=m.team_id AND t.is_active AND t.deleted_at IS NULL
 JOIN public.team_page_access a ON a.team_id=t.id AND a.page_path='/admin/newsletter' AND a.can_access JOIN public.team_permissions p ON p.team_id=t.id AND p.resource_type='newsletter' AND p.permission='crud'
 WHERE m.admin_user_id=u.id AND m.is_active AND m.team_id=p_team AND CASE p_action WHEN 'read' THEN p.can_read WHEN 'create' THEN p.can_create WHEN 'update' THEN p.can_update WHEN 'delete' THEN p.can_delete
 WHEN 'send_email' THEN p.can_read AND p.can_update AND EXISTS(SELECT 1 FROM public.team_permissions extra WHERE extra.team_id=t.id AND extra.resource_type='newsletter' AND extra.permission='send_email') ELSE false END))));
$$;
CREATE FUNCTION gdg_security.newsletter_subscriber_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.email IS DISTINCT FROM OLD.email OR NEW.team_id IS DISTINCT FROM OLD.team_id THEN RAISE EXCEPTION 'NEWSLETTER_RETAINED';END IF;
  IF(to_jsonb(NEW)-ARRAY['revision','updated_at']) IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['revision','updated_at']) THEN NEW.revision:=OLD.revision+1;NEW.updated_at:=now();END IF;
 END IF;
 IF NEW.deleted_at IS NOT NULL OR NEW.suppressed_at IS NOT NULL THEN NEW.state:='unsubscribed';NEW.is_active:=false;NEW.unsubscribed_at:=coalesce(NEW.unsubscribed_at,now());END IF;
 IF NEW.state='active' AND(NEW.confirmed_at IS NULL OR NEW.consent_at IS NULL) THEN NEW.state:='pending';NEW.is_active:=false;END IF;
 NEW.is_active:=(NEW.state='active');
 RETURN NEW;
END $$;
CREATE TRIGGER newsletter_subscriber_guard BEFORE INSERT OR UPDATE ON public.newsletter_subscribers FOR EACH ROW EXECUTE FUNCTION gdg_security.newsletter_subscriber_guard();
CREATE FUNCTION public.newsletter_record(p_actor uuid,p_kind text,p_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE r jsonb;team uuid;BEGIN
 IF p_kind='subscribers' THEN
  SELECT jsonb_build_object('id',id,'email',email,'name',coalesce(name,''),'state',state,'active',is_active,'confirmedAt',confirmed_at,'consentAt',consent_at,'unsubscribedAt',unsubscribed_at,'suppressedAt',suppressed_at,'suppressionReason',suppression_reason,'deletedAt',deleted_at,'teamId',team_id,'revision',revision,'createdAt',created_at,'updatedAt',updated_at),team_id INTO r,team FROM public.newsletter_subscribers WHERE id=p_id;
 ELSIF p_kind='templates' THEN
  SELECT jsonb_build_object('id',id,'name',name,'description',coalesce(description,''),'content',content,'deletedAt',deleted_at,'teamId',team_id,'revision',revision,'createdAt',created_at,'updatedAt',updated_at),team_id INTO r,team FROM public.newsletter_templates WHERE id=p_id;
 ELSIF p_kind='campaigns' THEN
  SELECT jsonb_build_object('id',id,'subject',subject,'content',content,'status',status,'scheduledAt',scheduled_at,'sentAt',sent_at,'recipientCount',recipient_count,'audience',audience_mode,'recipientIds',custom_recipient_ids,'deletedAt',deleted_at,'teamId',team_id,'revision',revision,'createdAt',created_at,'updatedAt',updated_at),team_id INTO r,team FROM public.newsletter_campaigns WHERE id=p_id;
 ELSE RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 IF r IS NULL OR NOT public.can_operate_newsletter(p_actor,team,'read') THEN RETURN NULL;END IF;
 RETURN r||jsonb_build_object('actions',(SELECT coalesce(jsonb_agg(action),'[]') FROM unnest(ARRAY['read','create','update','delete','send_email'])action WHERE public.can_operate_newsletter(p_actor,team,action)));
END $$;
CREATE FUNCTION public.read_newsletter_workspace(p_actor uuid,p_session uuid,p_kind text,p_filters jsonb,p_page integer,p_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;r jsonb;BEGIN
 IF NOT gdg_security.member_transfer_session(p_actor,p_session) OR p_page NOT BETWEEN 1 AND 10000 OR p_kind IS NULL OR p_kind NOT IN('subscribers','templates','campaigns') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF NOT(public.can_operate_newsletter(p_actor,NULL,'read') OR EXISTS(SELECT 1 FROM public.admin_teams WHERE public.can_operate_newsletter(p_actor,id,'read'))) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_id IS NOT NULL THEN r:=public.newsletter_record(p_actor,p_kind,p_id);IF r IS NULL THEN RAISE EXCEPTION 'NOT_FOUND';END IF;RETURN jsonb_build_object('record',r);END IF;
 WITH records AS(
 SELECT id,team_id,deleted_at,coalesce(name,'')||' '||email query,state status,created_at FROM public.newsletter_subscribers WHERE p_kind='subscribers'
 UNION ALL SELECT id,team_id,deleted_at,name||' '||coalesce(description,''),NULL,created_at FROM public.newsletter_templates WHERE p_kind='templates'
 UNION ALL SELECT id,team_id,deleted_at,subject,status,created_at FROM public.newsletter_campaigns WHERE p_kind='campaigns'),
 eligible AS(SELECT * FROM records r WHERE public.can_operate_newsletter(p_actor,r.team_id,'read') AND(r.deleted_at IS NOT NULL)=(coalesce(p_filters->>'state','current')='trash')
 AND(NOT(p_filters?'teamId') OR r.team_id IS NOT DISTINCT FROM(p_filters->>'teamId')::uuid) AND(coalesce(p_filters->>'q','')='' OR strpos(lower(r.query),lower(p_filters->>'q'))>0)
 AND(p_filters->>'status' IS NULL OR r.status=p_filters->>'status')),page AS(SELECT id FROM eligible ORDER BY created_at DESC,id LIMIT 50 OFFSET(p_page-1)*50)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(public.newsletter_record(p_actor,p_kind,id)) FROM page),'[]'),'total',(SELECT count(*) FROM eligible),'page',p_page,'pageSize',50) INTO result;RETURN result;
END $$;
CREATE FUNCTION public.mutate_newsletter_record(p_actor uuid,p_session uuid,p_kind text,p_id uuid,p_action text,p_revision integer,p_document jsonb,p_key_hash text,p_request_hash text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE team uuid;row_revision integer;deleted timestamptz;status text;record jsonb:=p_document->'record';result jsonb;k public.idempotency_keys;scope_key text;sid uuid;new_id uuid;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('newsletter-workspace',0));
 IF NOT gdg_security.member_transfer_session(p_actor,p_session) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_kind IS NULL OR p_kind NOT IN('subscribers','templates','campaigns') OR p_action IS NULL OR p_action NOT IN('create','update','deactivate','archive','restore','duplicate') OR p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$' OR p_request_hash IS NULL OR p_request_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 IF p_action='create' THEN team:=(p_document->>'teamId')::uuid;
 ELSE
  IF p_kind='subscribers' THEN SELECT team_id,revision,deleted_at,state INTO team,row_revision,deleted,status FROM public.newsletter_subscribers WHERE id=p_id FOR UPDATE;
  ELSIF p_kind='templates' THEN SELECT team_id,revision,deleted_at,NULL INTO team,row_revision,deleted,status FROM public.newsletter_templates WHERE id=p_id FOR UPDATE;
  ELSE SELECT team_id,revision,deleted_at,newsletter_campaigns.status INTO team,row_revision,deleted,status FROM public.newsletter_campaigns WHERE id=p_id FOR UPDATE;END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 END IF;
 IF NOT public.can_operate_newsletter(p_actor,team,'read') OR NOT public.can_operate_newsletter(p_actor,team,CASE WHEN p_action IN('create','duplicate') THEN 'create' WHEN p_action IN('deactivate','archive','restore') THEN 'delete' ELSE 'update' END) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 scope_key:='newsletter.'||p_kind||':'||p_actor||':'||p_session||':'||coalesce(p_id::text,'new');
 SELECT * INTO k FROM public.idempotency_keys WHERE scope=scope_key AND key_hash=p_key_hash;
 IF FOUND THEN IF k.request_hash IS DISTINCT FROM p_request_hash THEN RAISE EXCEPTION 'CONFLICT';END IF;RETURN k.result;END IF;
 IF p_action<>'create' THEN
  IF row_revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'CONFLICT';END IF;
  IF(deleted IS NOT NULL AND p_action<>'restore') OR(deleted IS NULL AND p_action='restore') THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
 END IF;
 IF p_kind='subscribers' THEN
  IF p_action='create' THEN
   IF p_document->>'consentAcknowledged' IS DISTINCT FROM 'true' OR length(coalesce(p_document->>'email','')) NOT BETWEEN 3 AND 254 OR p_document->>'email'<>lower(btrim(p_document->>'email')) OR p_document->>'email' NOT LIKE '%@%' OR length(coalesce(p_document->>'name',''))>100
    OR p_document->>'tokenHash' IS NULL OR p_document->>'tokenHash'!~'^[a-f0-9]{64}$' OR length(coalesce(p_document->>'secretPayload','')) NOT BETWEEN 40 AND 4096 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
   PERFORM pg_advisory_xact_lock(hashtextextended('newsletter:'||(p_document->>'email'),0));
   SELECT id INTO sid FROM public.newsletter_subscribers WHERE email=p_document->>'email';
   IF sid IS NULL THEN
    INSERT INTO public.newsletter_subscribers(email,name,team_id,is_active,state,consent_at) VALUES(p_document->>'email',p_document->>'name',team,false,'pending',now()) RETURNING id INTO sid;
    PERFORM public.subscribe_newsletter(p_document->>'email',p_document->>'name',p_key_hash,p_request_hash,p_document->>'tokenHash',p_document->>'secretPayload');
   END IF;
   result:=jsonb_build_object('accepted',true);new_id:=NULL;
  ELSE
   IF p_action NOT IN('update','deactivate','archive','restore') THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
   IF p_action='update' THEN
    IF length(coalesce(p_document->>'name',''))>100 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
    UPDATE public.newsletter_subscribers SET name=p_document->>'name' WHERE id=p_id;
   ELSE
    UPDATE public.newsletter_subscribers SET deleted_at=CASE WHEN p_action='archive' THEN now() WHEN p_action='restore' THEN NULL ELSE deleted_at END,state='unsubscribed',is_active=false,unsubscribed_at=now() WHERE id=p_id;
    UPDATE public.newsletter_tokens SET consumed_at=coalesce(consumed_at,now()) WHERE subscriber_id=p_id;
   END IF;new_id:=p_id;result:=jsonb_build_object('id',p_id);
  END IF;
 ELSE
  IF p_action='deactivate' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
  IF p_kind='campaigns' AND((p_action='update' AND status<>'draft') OR(p_action='archive' AND status IN('scheduled','sending'))) THEN RAISE EXCEPTION 'NEWSLETTER_LOCKED';END IF;
  IF p_action IN('create','update') THEN
   IF p_kind='templates' THEN
    IF length(btrim(coalesce(record->>'name',''))) NOT BETWEEN 1 AND 150 OR length(coalesce(record->>'description',''))>1000 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
   ELSE
    IF length(btrim(coalesce(record->>'subject',''))) NOT BETWEEN 1 AND 200 OR record->>'subject'~'[[:cntrl:]]' OR record->>'audience' IS NULL OR record->>'audience' NOT IN('all','custom')
     OR jsonb_typeof(record->'recipientIds') IS DISTINCT FROM 'array' OR jsonb_array_length(record->'recipientIds')>1000 OR(record->>'audience'='custom' AND jsonb_array_length(record->'recipientIds')=0)
     OR(record->>'audience'='all' AND jsonb_array_length(record->'recipientIds')<>0) THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(record->'recipientIds') i WHERE NOT EXISTS(SELECT 1 FROM public.newsletter_subscribers s WHERE s.id=i::uuid AND s.team_id IS NOT DISTINCT FROM team AND s.state='active' AND s.is_active AND s.confirmed_at IS NOT NULL AND s.suppressed_at IS NULL AND s.deleted_at IS NULL)) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
   END IF;
   IF length(btrim(coalesce(record->>'content',''))) NOT BETWEEN 1 AND 30000 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
   IF p_kind='templates' THEN
    IF p_action='create' THEN INSERT INTO public.newsletter_templates(name,description,content,team_id,created_by) VALUES(record->>'name',record->>'description',record->>'content',team,p_actor) RETURNING id INTO new_id;
    ELSE UPDATE public.newsletter_templates SET name=record->>'name',description=record->>'description',content=record->>'content',html_content=NULL,revision=revision+1,updated_at=now() WHERE id=p_id;new_id:=p_id;END IF;
   ELSE
    IF p_action='create' THEN INSERT INTO public.newsletter_campaigns(subject,content,team_id,created_by,audience_mode,custom_recipient_ids) VALUES(record->>'subject',record->>'content',team,p_actor,record->>'audience',record->'recipientIds') RETURNING id INTO new_id;
    ELSE UPDATE public.newsletter_campaigns SET subject=record->>'subject',content=record->>'content',html_content=NULL,audience_mode=record->>'audience',custom_recipient_ids=record->'recipientIds',revision=revision+1,updated_at=now() WHERE id=p_id;new_id:=p_id;END IF;
   END IF;
  ELSIF p_action='duplicate' AND p_kind='campaigns' THEN
   INSERT INTO public.newsletter_campaigns(subject,content,team_id,created_by,audience_mode,custom_recipient_ids) SELECT left(subject,190)||' (copy)',content,team_id,p_actor,audience_mode,custom_recipient_ids FROM public.newsletter_campaigns WHERE id=p_id RETURNING id INTO new_id;
  ELSIF p_action IN('archive','restore') THEN
   IF p_kind='templates' THEN UPDATE public.newsletter_templates SET deleted_at=CASE WHEN p_action='archive' THEN now() ELSE NULL END,is_active=false,revision=revision+1,updated_at=now() WHERE id=p_id;
   ELSE UPDATE public.newsletter_campaigns SET deleted_at=CASE WHEN p_action='archive' THEN now() ELSE NULL END,revision=revision+1,updated_at=now() WHERE id=p_id;END IF;new_id:=p_id;
  ELSE RAISE EXCEPTION 'INVALID_STATE';END IF;
  result:=jsonb_build_object('id',new_id);
 END IF;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata) VALUES(p_actor,'newsletter.'||p_kind||'_'||p_action,'newsletter_'||p_kind,new_id,p_request_id,jsonb_build_object('teamId',team));
 INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result) VALUES(scope_key,p_key_hash,p_request_hash,200,result);RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.can_operate_newsletter(uuid,uuid,text),gdg_security.newsletter_subscriber_guard(),public.newsletter_record(uuid,text,uuid),public.read_newsletter_workspace(uuid,uuid,text,jsonb,integer,uuid),public.mutate_newsletter_record(uuid,uuid,text,uuid,text,integer,jsonb,text,text,uuid) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION public.can_operate_newsletter(uuid,uuid,text),public.newsletter_record(uuid,text,uuid),public.read_newsletter_workspace(uuid,uuid,text,jsonb,integer,uuid),public.mutate_newsletter_record(uuid,uuid,text,uuid,text,integer,jsonb,text,text,uuid) TO service_role;
COMMIT;
