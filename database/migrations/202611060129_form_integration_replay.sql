BEGIN;
ALTER TABLE public.form_integrations ADD CONSTRAINT form_integration_revision_positive CHECK(revision>=1);
CREATE FUNCTION gdg_security.advance_form_integration_revision() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN NEW.id:=OLD.id;NEW.revision:=OLD.revision+1;NEW.updated_at:=clock_timestamp();RETURN NEW;END $$;
CREATE TRIGGER advance_form_integration_revision BEFORE UPDATE ON public.form_integrations FOR EACH ROW EXECUTE FUNCTION gdg_security.advance_form_integration_revision();
CREATE FUNCTION public.read_form_integration_candidates(p_actor uuid,p_session uuid,p_kind text,p_resource uuid,p_page integer,p_size integer,p_query text,p_selected uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE items jsonb;total integer;BEGIN
 IF NOT gdg_security.member_transfer_session(p_actor,p_session) OR NOT gdg_security.form_integration_source(p_actor,p_kind,p_resource,true) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 10000 OR p_size IS NULL OR p_size NOT BETWEEN 1 AND 100 OR length(p_query)>100 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 WITH eligible AS(
  SELECT f.id,f.title,f.draft_revision AS form_revision,v.id AS version_id,v.version,f.access_mode AS access FROM public.forms f JOIN public.form_versions v ON v.id=f.published_version_id
  WHERE f.permanently_deleted_at IS NULL AND f.state<>'Archived' AND(f.team_id IS NULL OR EXISTS(SELECT 1 FROM public.admin_teams WHERE id=f.team_id AND is_active AND deleted_at IS NULL))
   AND(p_selected IS NULL OR f.id=p_selected) AND public.can_operate_form(p_actor,f.id,'view') AND public.can_operate_form(p_actor,f.id,'manage_access') AND strpos(lower(f.title),lower(coalesce(p_query,'')))>0
 ),page AS(SELECT * FROM eligible ORDER BY title,id LIMIT p_size OFFSET(p_page-1)*p_size)
 SELECT(SELECT count(*) FROM eligible),coalesce(jsonb_agg(jsonb_build_object('id',page.id,'title',page.title,'formRevision',page.form_revision,'publishedVersionId',page.version_id,'version',page.version,'access',page.access) ORDER BY page.title,page.id),'[]'::jsonb) INTO total,items FROM page;
 RETURN jsonb_build_object('kind',p_kind,'resourceId',p_resource,'items',items,'total',total,'page',p_page,'pageSize',p_size);
END $$;
CREATE FUNCTION public.inspect_form_integration_write(p_actor uuid,p_session uuid,p_kind text,p_resource uuid,p_slot text,p_source uuid,p_action text,p_target uuid,p_key_hash text,p_request_hash text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE r public.form_integrations;f public.forms;k public.idempotency_keys;can_link boolean;target_meta jsonb;BEGIN
 IF NOT gdg_security.member_transfer_session(p_actor,p_session) OR NOT gdg_security.form_integration_source(p_actor,p_kind,p_resource,true) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_slot IS NULL OR p_slot!~'^[a-z][a-z0-9-]{0,39}$' OR p_action IS NULL OR p_action NOT IN('save','remove') OR(p_action='remove' AND(p_source IS NULL OR p_target IS NOT NULL)) OR(p_action='save' AND p_target IS NULL)
 OR p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$' OR(p_request_hash IS NOT NULL AND p_request_hash!~'^[a-f0-9]{64}$') THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 SELECT * INTO r FROM public.form_integrations WHERE resource_kind=p_kind AND resource_id=p_resource AND slot=p_slot;
 can_link:=gdg_security.form_integration_active(p_kind,p_resource) AND(p_kind<>'campaign' OR EXISTS(SELECT 1 FROM public.newsletter_campaigns WHERE id=p_resource AND status='draft'));
 IF p_target IS NOT NULL THEN
  SELECT source.* INTO f FROM public.forms source WHERE source.id=p_target AND source.permanently_deleted_at IS NULL AND source.state<>'Archived' AND source.published_version_id IS NOT NULL
   AND(source.team_id IS NULL OR EXISTS(SELECT 1 FROM public.admin_teams team WHERE team.id=source.team_id AND team.is_active AND team.deleted_at IS NULL))
   AND public.can_operate_form(p_actor,source.id,'view') AND public.can_operate_form(p_actor,source.id,'manage_access');
  IF FOUND THEN target_meta:=jsonb_build_object('id',f.id,'formRevision',f.draft_revision,'publishedVersionId',f.published_version_id);END IF;
 END IF;
 SELECT * INTO k FROM public.idempotency_keys WHERE scope='form-integration-write:'||p_actor||':'||p_session||':'||p_kind||':'||p_resource||':'||p_slot AND key_hash=p_key_hash;
 IF FOUND THEN
  IF k.result->>'kind' IS DISTINCT FROM p_kind OR k.result->>'resourceId' IS DISTINCT FROM p_resource::text OR k.result->>'slot' IS DISTINCT FROM p_slot OR k.result->>'sourceId' IS DISTINCT FROM p_source::text OR k.result->>'action' IS DISTINCT FROM p_action OR(p_request_hash IS NOT NULL AND k.request_hash IS DISTINCT FROM p_request_hash) THEN RAISE EXCEPTION 'CONFLICT';END IF;
  IF k.expires_at<=now() THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
 END IF;
 RETURN jsonb_build_object('kind',p_kind,'resourceId',p_resource,'slot',p_slot,'sourceId',p_source,'action',p_action,'committed',k.key_hash IS NOT NULL,
  'canRetry',coalesce(k.key_hash IS NULL AND r.id IS NOT DISTINCT FROM p_source AND CASE WHEN p_action='remove' THEN r.id IS NOT NULL ELSE can_link AND target_meta IS NOT NULL AND(r.id IS NOT NULL OR(SELECT count(*) FROM public.form_integrations WHERE resource_kind=p_kind AND resource_id=p_resource)<5) END,false),
  'reference',CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object('id',r.id,'revision',r.revision) END,'target',target_meta,'receipt',CASE WHEN k.key_hash IS NULL THEN NULL ELSE k.result END);
END $$;
CREATE FUNCTION public.mutate_form_integration_write(p_actor uuid,p_session uuid,p_kind text,p_resource uuid,p_slot text,p_source uuid,p_revision integer,p_document jsonb,p_key_hash text,p_request_hash text,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r public.form_integrations;f public.forms;inspected jsonb;result jsonb;receipt jsonb;action text:=CASE WHEN p_document IS NULL THEN 'remove' ELSE 'save' END;target uuid;BEGIN
 IF p_revision IS NULL OR p_revision<0 OR(p_source IS NULL AND p_revision<>0) OR(p_source IS NOT NULL AND p_revision<1) OR(p_document IS NULL AND p_source IS NULL)
 OR p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$' OR p_request_hash IS NULL OR p_request_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 IF p_document IS NOT NULL THEN target:=(p_document->>'formId')::uuid;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));
 PERFORM 1 FROM public.admin_users WHERE id=p_actor FOR UPDATE;
 PERFORM 1 FROM public.admin_sessions WHERE id=p_session AND admin_user_id=p_actor FOR UPDATE;
 IF p_kind='event' THEN PERFORM 1 FROM public.events WHERE id=p_resource FOR UPDATE;
 ELSIF p_kind='team' THEN PERFORM 1 FROM public.admin_teams WHERE id=p_resource FOR UPDATE;
 ELSIF p_kind='campaign' THEN PERFORM 1 FROM public.newsletter_campaigns WHERE id=p_resource FOR UPDATE;
 ELSE RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 IF target IS NOT NULL THEN SELECT * INTO f FROM public.forms WHERE id=target FOR UPDATE;END IF;
 SELECT * INTO r FROM public.form_integrations WHERE resource_kind=p_kind AND resource_id=p_resource AND slot=p_slot FOR UPDATE;
 inspected:=public.inspect_form_integration_write(p_actor,p_session,p_kind,p_resource,p_slot,p_source,action,target,p_key_hash,p_request_hash);
 IF(inspected->>'committed')::boolean THEN RETURN inspected->'receipt';END IF;
 IF p_document IS NOT NULL AND jsonb_typeof(inspected->'target') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF r.id IS DISTINCT FROM p_source OR coalesce(r.revision,0) IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'CONFLICT';END IF;
 IF p_document IS NOT NULL AND(f.draft_revision IS DISTINCT FROM(p_document->>'formRevision')::integer OR f.published_version_id IS DISTINCT FROM(p_document->>'publishedVersionId')::uuid) THEN RAISE EXCEPTION 'CONFLICT';END IF;
 IF NOT coalesce((inspected->>'canRetry')::boolean,false) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 result:=public.mutate_form_integration(p_actor,p_session,p_kind,p_resource,p_slot,p_revision,CASE WHEN p_document IS NULL THEN NULL ELSE p_document-'formRevision'-'publishedVersionId' END,
  encode(sha256(convert_to('form-integration-write:'||p_key_hash,'UTF8')),'hex'),p_request_hash,p_request_id);
 receipt:=jsonb_build_object('kind',p_kind,'resourceId',p_resource,'slot',p_slot,'sourceId',p_source,'action',action,'id',CASE WHEN action='remove' THEN p_source ELSE(result->>'id')::uuid END);
 INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result) VALUES('form-integration-write:'||p_actor||':'||p_session||':'||p_kind||':'||p_resource||':'||p_slot,p_key_hash,p_request_hash,200,receipt);
 RETURN receipt;
END $$;
REVOKE ALL ON FUNCTION gdg_security.advance_form_integration_revision(),public.read_form_integration_candidates(uuid,uuid,text,uuid,integer,integer,text,uuid),public.inspect_form_integration_write(uuid,uuid,text,uuid,text,uuid,text,uuid,text,text),public.mutate_form_integration_write(uuid,uuid,text,uuid,text,uuid,integer,jsonb,text,text,uuid) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION gdg_security.advance_form_integration_revision(),public.read_form_integration_candidates(uuid,uuid,text,uuid,integer,integer,text,uuid),public.inspect_form_integration_write(uuid,uuid,text,uuid,text,uuid,text,uuid,text,text),public.mutate_form_integration_write(uuid,uuid,text,uuid,text,uuid,integer,jsonb,text,text,uuid) TO service_role;
COMMIT;
