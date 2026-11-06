BEGIN;
CREATE FUNCTION gdg_security.form_delivery_target_eligible(p_form uuid,p_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.admin_users u WHERE u.id=p_user AND u.is_active AND u.deleted_at IS NULL AND NOT u.must_change_password
 AND(u.locked_until IS NULL OR u.locked_until<=now()) AND public.can_operate_form(u.id,p_form,'view') AND public.can_operate_form(u.id,p_form,'view_responses'));
$$;
CREATE FUNCTION gdg_security.form_delivery_access(p_actor uuid,p_session uuid,p_form uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT gdg_security.member_transfer_session(p_actor,p_session)
 AND EXISTS(SELECT 1 FROM public.forms WHERE id=p_form AND permanently_deleted_at IS NULL)
 AND public.can_operate_form(p_actor,p_form,'view') AND public.can_operate_form(p_actor,p_form,'manage_access') AND public.can_operate_form(p_actor,p_form,'view_responses');
$$;
CREATE FUNCTION public.read_form_delivery_candidates(p_actor uuid,p_session uuid,p_form uuid,p_page integer,p_size integer,p_query text DEFAULT '') RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE items jsonb;total bigint;BEGIN
 IF NOT gdg_security.form_delivery_access(p_actor,p_session,p_form) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 10000 OR p_size IS NULL OR p_size NOT BETWEEN 1 AND 100 OR p_query IS NULL OR char_length(p_query)>100 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 WITH eligible AS (
  SELECT u.id,u.display_name,u.role FROM public.admin_users u WHERE gdg_security.form_delivery_target_eligible(p_form,u.id)
  AND(p_query='' OR strpos(lower(coalesce(u.display_name,'')),lower(p_query))>0)
 ), page AS (SELECT * FROM eligible ORDER BY display_name NULLS LAST,id LIMIT p_size OFFSET(p_page-1)*p_size)
 SELECT(SELECT count(*) FROM eligible),coalesce(jsonb_agg(to_jsonb(page) ORDER BY display_name NULLS LAST,id),'[]'::jsonb) INTO total,items FROM page;
 RETURN jsonb_build_object('items',items,'total',total,'page',p_page,'pageSize',p_size);
END $$;
CREATE FUNCTION public.read_form_delivery_selection(p_actor uuid,p_session uuid,p_form uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;BEGIN
 IF NOT gdg_security.form_delivery_access(p_actor,p_session,p_form) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',chosen.id,'display_name',CASE WHEN gdg_security.form_delivery_target_eligible(p_form,chosen.id) THEN coalesce(u.display_name,'Chapter account') ELSE 'Unavailable chapter account' END,
  'role',CASE WHEN gdg_security.form_delivery_target_eligible(p_form,chosen.id) THEN u.role ELSE NULL END,'eligible',gdg_security.form_delivery_target_eligible(p_form,chosen.id)) ORDER BY chosen.ordinality),'[]'::jsonb) INTO result
 FROM public.form_delivery_policies p CROSS JOIN LATERAL unnest(p.notification_users) WITH ORDINALITY chosen(id,ordinality)
 LEFT JOIN public.admin_users u ON u.id=chosen.id WHERE p.form_id=p_form;
 RETURN result;
END $$;
CREATE FUNCTION public.read_form_delivery_current(p_actor uuid,p_session uuid,p_form uuid,p_hash text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NOT gdg_security.form_delivery_access(p_actor,p_session,p_form) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_hash IS NULL OR p_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 RETURN gdg_security.form_delivery_policy_current(p_form,p_hash)
  AND NOT EXISTS(SELECT 1 FROM public.form_delivery_policies p CROSS JOIN LATERAL unnest(p.notification_users) chosen(id) WHERE p.form_id=p_form AND NOT gdg_security.form_delivery_target_eligible(p_form,chosen.id));
END $$;
CREATE FUNCTION public.inspect_form_delivery_write(p_actor uuid,p_session uuid,p_form uuid,p_key_hash text,p_request_hash text DEFAULT NULL,p_users uuid[] DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE f public.forms;k public.idempotency_keys;policy_rev integer;editable boolean;selected_valid boolean;BEGIN
 IF p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$' OR(p_request_hash IS NOT NULL AND p_request_hash!~'^[a-f0-9]{64}$') OR p_users IS NULL OR cardinality(p_users)>10 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 IF NOT gdg_security.form_delivery_access(p_actor,p_session,p_form) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT * INTO f FROM public.forms WHERE id=p_form;
 SELECT * INTO k FROM public.idempotency_keys WHERE scope='forms.delivery:'||p_actor||':'||p_session||':'||p_form AND key_hash=p_key_hash;
 IF FOUND THEN
  IF p_request_hash IS NOT NULL AND k.request_hash IS DISTINCT FROM p_request_hash THEN RAISE EXCEPTION 'CONFLICT';END IF;
  IF k.expires_at<=now() OR jsonb_typeof(k.result->'revision') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
 END IF;
 SELECT coalesce((SELECT revision FROM public.form_delivery_policies WHERE form_id=p_form),0) INTO policy_rev;
 editable:=f.state<>'Archived' AND(f.team_id IS NULL OR EXISTS(SELECT 1 FROM public.admin_teams WHERE id=f.team_id AND is_active AND deleted_at IS NULL));
 selected_valid:=NOT EXISTS(SELECT 1 FROM unnest(p_users) selected(id) WHERE NOT gdg_security.form_delivery_target_eligible(p_form,selected.id));
 RETURN jsonb_build_object('committed',k.key_hash IS NOT NULL,'canRetry',k.key_hash IS NULL AND editable AND selected_valid,'formId',p_form,
  'formRevision',f.draft_revision,'policyRevision',policy_rev,'editable',editable,'selectedValid',selected_valid,
  'canReviewAnswers',EXISTS(SELECT 1 FROM public.admin_users WHERE id=p_actor AND role IN('admin','super_admin')),
  'receipt',CASE WHEN k.key_hash IS NULL THEN NULL ELSE jsonb_build_object('formId',p_form,'revision',k.result->'revision') END);
END $$;
ALTER FUNCTION public.review_form_delivery(uuid,uuid,text,uuid,integer,integer,jsonb,text,jsonb,text,text,uuid) RENAME TO review_form_delivery_before_replay;
CREATE FUNCTION public.review_form_delivery(p_actor uuid,p_session uuid,p_verified_hash text,p_form uuid,p_form_revision integer,p_policy_revision integer,p_definition jsonb,p_schema_hash text,p_document jsonb,p_key_hash text,p_request_hash text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));
 PERFORM 1 FROM public.admin_users WHERE id=p_actor FOR UPDATE;
 PERFORM 1 FROM public.admin_sessions WHERE id=p_session AND admin_user_id=p_actor FOR UPDATE;
 PERFORM 1 FROM public.forms WHERE id=p_form FOR UPDATE;
 PERFORM public.inspect_form_delivery_write(p_actor,p_session,p_form,p_key_hash,p_request_hash,ARRAY(SELECT jsonb_array_elements_text(p_document->'notificationUsers')::uuid));
 RETURN public.review_form_delivery_before_replay(p_actor,p_session,p_verified_hash,p_form,p_form_revision,p_policy_revision,p_definition,p_schema_hash,p_document,p_key_hash,p_request_hash,p_request_id);
END $$;
REVOKE ALL ON FUNCTION gdg_security.form_delivery_target_eligible(uuid,uuid),gdg_security.form_delivery_access(uuid,uuid,uuid),
 public.read_form_delivery_candidates(uuid,uuid,uuid,integer,integer,text),public.read_form_delivery_selection(uuid,uuid,uuid),
 public.read_form_delivery_current(uuid,uuid,uuid,text),public.inspect_form_delivery_write(uuid,uuid,uuid,text,text,uuid[]),
 public.review_form_delivery(uuid,uuid,text,uuid,integer,integer,jsonb,text,jsonb,text,text,uuid),
 public.review_form_delivery_before_replay(uuid,uuid,text,uuid,integer,integer,jsonb,text,jsonb,text,text,uuid) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION gdg_security.form_delivery_target_eligible(uuid,uuid),gdg_security.form_delivery_access(uuid,uuid,uuid),
 public.read_form_delivery_candidates(uuid,uuid,uuid,integer,integer,text),public.read_form_delivery_selection(uuid,uuid,uuid),
 public.read_form_delivery_current(uuid,uuid,uuid,text),public.inspect_form_delivery_write(uuid,uuid,uuid,text,text,uuid[]),
 public.review_form_delivery(uuid,uuid,text,uuid,integer,integer,jsonb,text,jsonb,text,text,uuid),
 public.review_form_delivery_before_replay(uuid,uuid,text,uuid,integer,integer,jsonb,text,jsonb,text,text,uuid) TO service_role;
COMMIT;
