BEGIN;
ALTER TABLE public.events ADD COLUMN team_id uuid REFERENCES public.admin_teams(id) ON DELETE RESTRICT,
  ADD COLUMN revision integer NOT NULL DEFAULT 1;
CREATE FUNCTION public.can_operate_event(p_actor uuid,p_action text,p_team uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.admin_users u WHERE u.id=p_actor AND u.is_active AND
  (u.role IN ('super_admin','admin') OR (u.role='team_member' AND p_team IS NOT NULL AND EXISTS(
   SELECT 1 FROM public.team_memberships m JOIN public.team_permissions p ON p.team_id=m.team_id
    JOIN public.team_page_access a ON a.team_id=m.team_id
   WHERE m.admin_user_id=u.id AND m.is_active AND m.team_id=p_team
    AND a.page_path='/admin/events' AND a.can_access AND p.resource_type='events'
    AND CASE p_action WHEN 'read' THEN p.can_read WHEN 'create' THEN p.can_create
      WHEN 'update' THEN p.can_update WHEN 'delete' THEN p.can_delete
      WHEN 'publish' THEN p.can_update AND p.permission IN ('publish','events.publish')
      ELSE false END))))
$$;
CREATE FUNCTION public.mutate_event(p_actor uuid,p_id uuid,p_action text,p_expected_revision integer,
  p_document jsonb,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v public.events; v_next public.events; v_team uuid;
BEGIN
 IF p_action NOT IN ('create','update','publish','unpublish','cancel','archive','duplicate') THEN
  RAISE EXCEPTION 'INVALID_STATE'; END IF;
 IF p_action='create' THEN
  v_team := (p_document->>'team_id')::uuid;
  IF NOT public.can_operate_event(p_actor,'create',v_team) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  v:=jsonb_populate_record(NULL::public.events,jsonb_build_object('id',gen_random_uuid(),'created_at',now(),
   'updated_at',now(),'is_featured',false,'external_attendees',0,'registration_enabled',true,'registration_type','internal',
   'timezone','America/New_York','level','open_for_all','type','Workshop','publication_status','draft','short_description','','revision',1)||p_document);
  v.publication_status:='draft';v.created_by:=p_actor;v.updated_by:=p_actor;v.revision:=1;
  IF EXISTS(SELECT 1 FROM public.event_slug_redirects WHERE old_slug=v.slug) THEN RAISE EXCEPTION 'DUPLICATE'; END IF;
  INSERT INTO public.events SELECT (v).*;
 ELSE
  SELECT * INTO v FROM public.events WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_operate_event(p_actor,'read',v.team_id) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF p_expected_revision IS DISTINCT FROM v.revision THEN RAISE EXCEPTION 'CONFLICT'; END IF;
  IF NOT public.can_operate_event(p_actor,CASE WHEN p_action IN ('publish','unpublish') THEN 'publish'
   WHEN p_action='archive' THEN 'delete' WHEN p_action='duplicate' THEN 'create' ELSE 'update' END,v.team_id)
   THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF p_action='duplicate' THEN
   v.id:=gen_random_uuid();v.slug:=left(v.slug,120)||'-'||left(replace(v.id::text,'-',''),8);
   v.title:=left(v.title,190)||' (copy)';v.publication_status:='draft';v.published_at:=NULL;
   v.external_attendees:=0;v.revision:=1;v.created_at:=now();v.created_by:=p_actor;v.updated_by:=p_actor;v.updated_at:=now();
   INSERT INTO public.events SELECT (v).*;
  ELSE
   IF p_action='update' THEN
    IF p_document ? 'team_id' AND (p_document->>'team_id')::uuid IS DISTINCT FROM v.team_id THEN
     IF NOT public.can_operate_event(p_actor,'create',(p_document->>'team_id')::uuid) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
    END IF;
    v_next:=jsonb_populate_record(v,p_document);
    IF v_next.slug<>v.slug THEN
     PERFORM pg_advisory_xact_lock(hashtextextended('event-slug:'||v_next.slug,0));
     IF EXISTS(SELECT 1 FROM public.event_slug_redirects WHERE old_slug=v_next.slug)
      OR EXISTS(SELECT 1 FROM public.events WHERE slug=v_next.slug AND id<>v.id) THEN RAISE EXCEPTION 'DUPLICATE'; END IF;
     INSERT INTO public.event_slug_redirects(old_slug,event_id) VALUES(v.slug,v.id);
    END IF;
    v:=v_next;
   ELSIF p_action='publish' THEN v.publication_status:='published';v.published_at:=now();
   ELSIF p_action='unpublish' THEN v.publication_status:='draft';
   ELSIF p_action='cancel' THEN v.publication_status:='cancelled';v.registration_enabled:=false;
   ELSIF p_action='archive' THEN v.publication_status:='archived';v.registration_enabled:=false;
   END IF;
   IF v.max_participants IS NOT NULL AND v.max_participants<v.external_attendees+
     (SELECT count(*) FROM public.event_attendance WHERE event_id=v.id AND deleted_at IS NULL) THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
   v.updated_by:=p_actor;v.updated_at:=now();v.revision:=v.revision+1;
   UPDATE public.events SET title=v.title,description=v.description,slug=v.slug,start_at=v.start_at,end_at=v.end_at,
    short_description=v.short_description,location=v.location,room=v.room,timezone=v.timezone,image_url=v.image_url,
    image_media_id=v.image_media_id,event_link=v.event_link,registration_url=v.registration_url,google_form_url=v.google_form_url,
    google_event_url=v.google_event_url,registration_type=v.registration_type,registration_enabled=v.registration_enabled,
    max_participants=v.max_participants,external_attendees=v.external_attendees,type=v.type,level=v.level,
    prerequisites=v.prerequisites,what_youll_learn=v.what_youll_learn,what_to_bring=v.what_to_bring,schedule=v.schedule,
    additional_info=v.additional_info,contact_info=v.contact_info,publication_status=v.publication_status,is_featured=v.is_featured,
    published_at=v.published_at,team_id=v.team_id,updated_by=v.updated_by,updated_at=v.updated_at,revision=v.revision WHERE id=v.id;
  END IF;
 END IF;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata)
 VALUES(p_actor,'events.'||p_action,'event',v.id,p_request_id,jsonb_build_object('revision',v.revision));
 RETURN to_jsonb(v);
END $$;
CREATE FUNCTION public.mutate_attendee(p_actor uuid,p_event uuid,p_registration uuid,p_document jsonb,p_remove boolean,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_event public.events; v public.event_attendance;
BEGIN
 SELECT * INTO v_event FROM public.events WHERE id=p_event FOR UPDATE;
 IF NOT FOUND OR NOT public.can_operate_event(p_actor,'update',v_event.team_id) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 SELECT * INTO v FROM public.event_attendance WHERE id=p_registration AND event_id=p_event AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 IF p_remove THEN v.deleted_at:=now();
 ELSE
  v:=jsonb_populate_record(v,p_document);
  v.attendee_email:=lower(btrim(v.attendee_email));
  v.check_in_time:=CASE WHEN v.attended THEN coalesce(v.check_in_time,now()) ELSE NULL END;
 END IF;
 UPDATE public.event_attendance SET attendee_name=v.attendee_name,attendee_email=v.attendee_email,notes=v.notes,
  attended=v.attended,check_in_time=v.check_in_time,deleted_at=v.deleted_at,updated_at=now() WHERE id=v.id;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id)
 VALUES(p_actor,CASE WHEN p_remove THEN 'events.attendee_removed' ELSE 'events.attendee_updated' END,'event_attendance',v.id,p_request_id);
 RETURN jsonb_build_object('id',v.id,'updated',true);
END $$;
REVOKE ALL ON FUNCTION public.can_operate_event(uuid,text,uuid),public.mutate_event(uuid,uuid,text,integer,jsonb,uuid),
 public.mutate_attendee(uuid,uuid,uuid,jsonb,boolean,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.can_operate_event(uuid,text,uuid),public.mutate_event(uuid,uuid,text,integer,jsonb,uuid),
 public.mutate_attendee(uuid,uuid,uuid,jsonb,boolean,uuid) TO service_role;
COMMIT;
