BEGIN;
-- Date history is derived from a previously published event; never inferred
-- from arbitrary draft edits or accepted as client-owned input.
ALTER TABLE public.events ADD COLUMN previous_start_at timestamptz;
CREATE FUNCTION gdg_security.track_event_reschedule() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN NEW.previous_start_at:=NULL;
 ELSIF NEW.start_at IS DISTINCT FROM OLD.start_at
  AND (OLD.publication_status='published' OR OLD.published_at IS NOT NULL) THEN
  NEW.previous_start_at:=OLD.start_at;
 ELSE NEW.previous_start_at:=OLD.previous_start_at;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION gdg_security.track_event_reschedule() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER event_reschedule_history BEFORE INSERT OR UPDATE ON public.events
 FOR EACH ROW EXECUTE FUNCTION gdg_security.track_event_reschedule();

-- Return the committed row, including trigger-derived history on updates and copies.
CREATE OR REPLACE FUNCTION public.mutate_event(p_actor uuid,p_id uuid,p_action text,p_expected_revision integer,
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
 SELECT * INTO v FROM public.events WHERE id=v.id;
 RETURN to_jsonb(v);
END $$;

-- Append to the existing view signature so dependent readers and grants remain.
CREATE OR REPLACE VIEW public.public_event_inventory
WITH (security_invoker=true, security_barrier=true) AS
SELECT e.id,e.title,e.slug,e.short_description,e.description,e.start_at,e.end_at,
 e.timezone,e.location,e.room,e.type,e.level,e.image_url,e.image_media_id,
 e.event_link,e.registration_url,e.google_form_url,e.google_event_url,
 e.registration_type,e.registration_enabled,e.max_participants,e.is_featured,
 e.prerequisites,e.what_youll_learn,e.what_to_bring,e.schedule,e.additional_info,
 e.contact_info,e.publication_status,e.published_at,e.updated_at,e.created_at,e.revision,
 state.registration_state,
 CASE state.registration_state WHEN 'open' THEN 0 WHEN 'full' THEN 1
  WHEN 'closed' THEN 2 ELSE 3 END AS registration_priority,
 e.previous_start_at
FROM public.events e
LEFT JOIN LATERAL (
 SELECT count(*) AS internal_count FROM public.event_attendance r
 WHERE r.event_id=e.id AND r.deleted_at IS NULL
  AND e.max_participants IS NOT NULL AND e.registration_enabled
  AND coalesce(e.end_at,e.start_at)>now()
) a ON true
CROSS JOIN LATERAL (
 SELECT CASE WHEN NOT e.registration_enabled THEN 'closed'
  WHEN coalesce(e.end_at,e.start_at)<=now() THEN 'ended'
  WHEN e.max_participants IS NOT NULL AND a.internal_count+e.external_attendees>=e.max_participants THEN 'full'
  ELSE 'open' END AS registration_state
) state
WHERE e.publication_status='published';
REVOKE ALL ON public.public_event_inventory FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.public_event_inventory TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
