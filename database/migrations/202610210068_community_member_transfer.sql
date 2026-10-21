BEGIN;
CREATE TABLE public.member_import_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_id uuid NOT NULL REFERENCES public.admin_users(id),session_id uuid NOT NULL REFERENCES public.admin_sessions(id),
 team_id uuid REFERENCES public.admin_teams(id),document_hash text NOT NULL CHECK(document_hash~'^[a-f0-9]{64}$'),snapshot_hash text NOT NULL,
 token_hash text NOT NULL UNIQUE CHECK(token_hash~'^[a-f0-9]{64}$'),created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT now()+interval '5 minutes',used_at timestamptz
);
ALTER TABLE public.member_import_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_import_reviews FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT ALL ON public.member_import_reviews TO service_role;
CREATE FUNCTION gdg_security.member_transfer_session(p_actor uuid,p_session uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.admin_users u JOIN public.admin_sessions s ON s.admin_user_id=u.id
 WHERE u.id=p_actor AND u.is_active AND u.deleted_at IS NULL AND NOT u.must_change_password AND(u.locked_until IS NULL OR u.locked_until<=now())
 AND u.role IN('admin','super_admin','team_member') AND s.id=p_session AND s.revoked_at IS NULL AND s.idle_expires_at>now() AND s.absolute_expires_at>now());
$$;
CREATE FUNCTION gdg_security.member_import_mask(p_document jsonb) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(NOT EXISTS(SELECT 1 FROM public.members m WHERE lower(btrim(m.email))=lower(btrim(item->>'email'))) ORDER BY ordinal),'[]')
 FROM jsonb_array_elements(p_document->'rows') WITH ORDINALITY AS rows(item,ordinal);
$$;
CREATE FUNCTION public.preview_member_import(p_actor uuid,p_session uuid,p_document jsonb,p_hash text,p_token_hash text,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE team uuid:=(p_document->>'teamId')::uuid;mask jsonb;review public.member_import_reviews;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('community-members',0));
 IF NOT gdg_security.member_transfer_session(p_actor,p_session) OR NOT public.can_operate_member(p_actor,team,'read') OR NOT public.can_operate_member(p_actor,team,'create') THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF jsonb_typeof(p_document->'rows') IS DISTINCT FROM 'array' OR jsonb_array_length(p_document->'rows') NOT BETWEEN 1 AND 200 OR p_hash IS NULL OR p_hash!~'^[a-f0-9]{64}$' OR p_token_hash IS NULL OR p_token_hash!~'^[a-f0-9]{64}$'
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_document->'rows') x WHERE x->>'email' IS NULL OR x->>'name' IS NULL)
  OR(SELECT count(DISTINCT lower(btrim(x->>'email'))) FROM jsonb_array_elements(p_document->'rows') x)<>jsonb_array_length(p_document->'rows') THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 DELETE FROM public.member_import_reviews WHERE expires_at<now()-interval '1 day';
 mask:=gdg_security.member_import_mask(p_document);
 INSERT INTO public.member_import_reviews(actor_id,session_id,team_id,document_hash,snapshot_hash,token_hash)
 VALUES(p_actor,p_session,team,encode(sha256(convert_to(p_document::text,'UTF8')),'hex'),encode(sha256(convert_to(mask::text,'UTF8')),'hex'),p_token_hash) RETURNING * INTO review;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata) VALUES(p_actor,'members.import_reviewed','member_import',review.id,p_request_id,jsonb_build_object('rows',jsonb_array_length(mask),'teamId',team));
 RETURN jsonb_build_object('reviewId',review.id,'expiresAt',review.expires_at,'eligible',(SELECT count(*) FROM jsonb_array_elements(mask) x WHERE x='true'::jsonb),
  'skippedRows',coalesce((SELECT jsonb_agg(ordinal) FROM jsonb_array_elements(mask) WITH ORDINALITY AS x(value,ordinal) WHERE value='false'::jsonb),'[]'));
END $$;
CREATE FUNCTION public.commit_member_import(p_actor uuid,p_session uuid,p_verified_hash text,p_document jsonb,p_hash text,p_review uuid,p_token_hash text,p_confirmation text,p_key_hash text,p_request_hash text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE review public.member_import_reviews;k public.idempotency_keys;mask jsonb;item record;created jsonb:='[]';result jsonb;v_scope text;team uuid:=(p_document->>'teamId')::uuid;n integer;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));PERFORM pg_advisory_xact_lock(hashtextextended('community-members',0));
 IF NOT gdg_security.member_transfer_session(p_actor,p_session) OR NOT public.can_operate_member(p_actor,team,'read') OR NOT public.can_operate_member(p_actor,team,'create')
  OR NOT EXISTS(SELECT 1 FROM public.admin_users WHERE id=p_actor AND password_hash=p_verified_hash) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_key_hash IS NULL OR p_key_hash!~'^[a-f0-9]{64}$' OR p_request_hash IS NULL OR p_request_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 v_scope:='member.import:'||p_actor||':'||p_session;
 SELECT * INTO k FROM public.idempotency_keys WHERE scope=v_scope AND key_hash=p_key_hash;
 IF FOUND THEN IF k.request_hash IS DISTINCT FROM p_request_hash THEN RAISE EXCEPTION 'CONFLICT';END IF;RETURN k.result;END IF;
 SELECT * INTO review FROM public.member_import_reviews WHERE id=p_review AND actor_id=p_actor AND session_id=p_session AND token_hash=p_token_hash AND used_at IS NULL AND expires_at>now() FOR UPDATE;
 IF NOT FOUND OR review.team_id IS DISTINCT FROM team OR review.document_hash IS DISTINCT FROM encode(sha256(convert_to(p_document::text,'UTF8')),'hex') THEN RAISE EXCEPTION 'MEMBER_IMPORT_REVIEW';END IF;
 mask:=gdg_security.member_import_mask(p_document);
 IF encode(sha256(convert_to(mask::text,'UTF8')),'hex') IS DISTINCT FROM review.snapshot_hash THEN RAISE EXCEPTION 'CONFLICT';END IF;
 SELECT count(*) INTO n FROM jsonb_array_elements(mask) x WHERE x='true'::jsonb;
 IF n=0 OR p_confirmation IS DISTINCT FROM 'IMPORT '||n THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 FOR item IN SELECT value,ordinality FROM jsonb_array_elements(p_document->'rows') WITH ORDINALITY LOOP
  IF mask->(item.ordinality::integer-1)='true'::jsonb THEN
   result:=public.mutate_community_member(p_actor,p_session,NULL,NULL,'create',NULL,jsonb_build_object('teamId',team,'record',item.value),
    encode(sha256(convert_to('member-import:'||review.id||':'||item.ordinality,'UTF8')),'hex'),encode(sha256(convert_to(item.value::text,'UTF8')),'hex'),p_request_id);
   created:=created||jsonb_build_array(result->'id');
  END IF;
 END LOOP;
 UPDATE public.member_import_reviews SET used_at=now() WHERE id=review.id;
 result:=jsonb_build_object('createdIds',created,'created',jsonb_array_length(created),'skipped',jsonb_array_length(mask)-n,'reviewId',review.id);
 INSERT INTO public.idempotency_keys(scope,key_hash,request_hash,result_status,result) VALUES(v_scope,p_key_hash,p_request_hash,200,result);
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id,metadata) VALUES(p_actor,'members.imported','member_import',review.id,p_request_id,jsonb_build_object('created',n,'skipped',jsonb_array_length(mask)-n,'teamId',team));
 RETURN result;
END $$;
CREATE FUNCTION public.export_community_members(p_actor uuid,p_session uuid,p_filters jsonb,p_private boolean,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE items jsonb;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('account-management',0));
 IF NOT gdg_security.member_transfer_session(p_actor,p_session) OR NOT(public.can_operate_member(p_actor,NULL,'read') OR EXISTS(SELECT 1 FROM public.admin_teams WHERE public.can_operate_member(p_actor,id,'read'))) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 SELECT coalesce(jsonb_agg(row ORDER BY updated_at DESC,id DESC),'[]') INTO items FROM(
 SELECT m.id,m.updated_at,jsonb_build_object('id',m.id,'team_id',m.team_id,'revision',m.revision,'name',m.name,'category',m.category,
  'is_active',m.is_active,'is_core_team',m.is_core_team,'team_section',m.team_section)||CASE WHEN p_private THEN jsonb_build_object('email',m.email,'phone',m.phone,'year',m.year,'major',m.major,'interests',m.interests) ELSE '{}'::jsonb END AS row
 FROM public.members m WHERE public.can_operate_member(p_actor,m.team_id,'read') AND(m.deleted_at IS NOT NULL)=(coalesce(p_filters->>'state','current')='trash')
 AND(coalesce(p_filters->>'q','')='' OR strpos(lower(m.name||' '||m.email||' '||coalesce(m.major,'')),lower(p_filters->>'q'))>0)
 AND(p_filters->>'category' IS NULL OR m.category=p_filters->>'category') AND(p_filters->>'year' IS NULL OR m.year=p_filters->>'year')
 AND(p_filters->>'active' IS NULL OR m.is_active=(p_filters->>'active')::boolean) AND(p_filters->>'core' IS NULL OR m.is_core_team=(p_filters->>'core')::boolean)
 ORDER BY updated_at DESC,id DESC LIMIT 1001) x;
 IF jsonb_array_length(items)>1000 THEN RAISE EXCEPTION 'MEMBER_EXPORT_RANGE';END IF;
 INSERT INTO public.admin_actions(actor_id,action,target_type,request_id,metadata) VALUES(p_actor,'members.exported','member',p_request_id,
  jsonb_build_object('count',jsonb_array_length(items),'privateFields',p_private,'filterHash',encode(sha256(convert_to(p_filters::text,'UTF8')),'hex')));
 RETURN items;
END $$;
REVOKE ALL ON FUNCTION gdg_security.member_transfer_session(uuid,uuid),gdg_security.member_import_mask(jsonb),public.preview_member_import(uuid,uuid,jsonb,text,text,uuid),
 public.commit_member_import(uuid,uuid,text,jsonb,text,uuid,text,text,text,text,uuid),public.export_community_members(uuid,uuid,jsonb,boolean,uuid) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION gdg_security.member_transfer_session(uuid,uuid),gdg_security.member_import_mask(jsonb),public.preview_member_import(uuid,uuid,jsonb,text,text,uuid),
 public.commit_member_import(uuid,uuid,text,jsonb,text,uuid,text,text,text,text,uuid),public.export_community_members(uuid,uuid,jsonb,boolean,uuid) TO service_role;
COMMIT;
