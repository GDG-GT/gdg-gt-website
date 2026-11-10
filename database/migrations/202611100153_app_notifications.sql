BEGIN;
-- Registered devices belong to an authenticated account; addresses remain encrypted.
CREATE TABLE public.app_notification_devices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES public.admin_users(id) ON DELETE CASCADE,
 session_id uuid REFERENCES public.admin_sessions(id) ON DELETE SET NULL,installation_id uuid NOT NULL,
 platform text NOT NULL CHECK(platform IN('ios','web')),environment text NOT NULL CHECK(environment IN('production','sandbox')),
 address_hash text NOT NULL CHECK(address_hash~'^[a-f0-9]{64}$'),address_encrypted text NOT NULL,
 label text NOT NULL CHECK(length(label) BETWEEN 1 AND 80),created_at timestamptz NOT NULL DEFAULT now(),last_seen_at timestamptz NOT NULL DEFAULT now(),revoked_at timestamptz,
 UNIQUE(platform,environment,address_hash),UNIQUE(platform,installation_id)
);
CREATE TABLE public.app_notification_preferences (
 user_id uuid PRIMARY KEY REFERENCES public.admin_users(id) ON DELETE CASCADE,
 categories jsonb NOT NULL DEFAULT '{"forms":true,"events":true,"newsletter":true,"accounts":true,"id":true,"contact":true,"workspace":true}',updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ADD COLUMN push_category text NOT NULL DEFAULT 'workspace' CHECK(push_category IN('forms','events','newsletter','accounts','id','contact','workspace'));
CREATE INDEX app_notification_devices_active ON public.app_notification_devices(user_id) WHERE revoked_at IS NULL;
ALTER TABLE public.app_notification_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_notification_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_notification_devices,public.app_notification_preferences FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT ALL ON public.app_notification_devices,public.app_notification_preferences TO service_role;

CREATE FUNCTION gdg_security.revoke_app_notification_session() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NEW.revoked_at IS NOT NULL THEN UPDATE public.app_notification_devices SET revoked_at=now(),address_encrypted='' WHERE session_id=NEW.id AND revoked_at IS NULL;END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER app_notification_session_revoked AFTER UPDATE OF revoked_at ON public.admin_sessions FOR EACH ROW EXECUTE FUNCTION gdg_security.revoke_app_notification_session();
CREATE FUNCTION gdg_security.revoke_app_notification_account() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NOT NEW.is_active OR NEW.deleted_at IS NOT NULL OR NEW.password_hash IS DISTINCT FROM OLD.password_hash THEN UPDATE public.app_notification_devices SET revoked_at=now(),address_encrypted='' WHERE user_id=NEW.id AND revoked_at IS NULL;END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER app_notification_account_revoked AFTER UPDATE OF is_active,deleted_at,password_hash ON public.admin_users FOR EACH ROW EXECUTE FUNCTION gdg_security.revoke_app_notification_account();
CREATE FUNCTION gdg_security.app_notification_session(p_actor uuid,p_session uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.admin_users u JOIN public.admin_sessions s ON s.admin_user_id=u.id WHERE u.id=p_actor AND u.is_active AND u.deleted_at IS NULL AND NOT u.must_change_password
 AND(u.locked_until IS NULL OR u.locked_until<=now()) AND s.id=p_session AND s.revoked_at IS NULL AND s.idle_expires_at>now() AND s.absolute_expires_at>now());
$$;
CREATE FUNCTION public.read_app_notification_settings(p_actor uuid,p_session uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NOT gdg_security.app_notification_session(p_actor,p_session) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 RETURN jsonb_build_object('preferences',coalesce((SELECT categories FROM public.app_notification_preferences WHERE user_id=p_actor),'{"forms":true,"events":true,"newsletter":true,"accounts":true,"id":true,"contact":true,"workspace":true}'::jsonb),
 'devices',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'platform',platform,'label',label,'lastSeen',last_seen_at,'installationId',installation_id) ORDER BY last_seen_at DESC),'[]'::jsonb) FROM public.app_notification_devices WHERE user_id=p_actor AND revoked_at IS NULL));
END $$;
CREATE FUNCTION public.save_app_notification_preferences(p_actor uuid,p_session uuid,p_categories jsonb) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NOT gdg_security.app_notification_session(p_actor,p_session) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF jsonb_typeof(p_categories) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(p_categories))<>7
 OR EXISTS(SELECT 1 FROM jsonb_each(p_categories) WHERE key NOT IN('forms','events','newsletter','accounts','id','contact','workspace') OR jsonb_typeof(value)<>'boolean') THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 INSERT INTO public.app_notification_preferences(user_id,categories) VALUES(p_actor,p_categories) ON CONFLICT(user_id) DO UPDATE SET categories=excluded.categories,updated_at=now();
END $$;
CREATE FUNCTION public.register_app_notification_device(p_actor uuid,p_session uuid,p_installation uuid,p_platform text,p_environment text,p_hash text,p_encrypted text,p_label text) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result uuid;
BEGIN
 IF NOT gdg_security.app_notification_session(p_actor,p_session) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 IF p_installation IS NULL OR p_platform NOT IN('ios','web') OR p_environment NOT IN('production','sandbox') OR p_hash!~'^[a-f0-9]{64}$' OR length(p_encrypted) NOT BETWEEN 1 AND 20000 OR length(p_label) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('app-device:'||p_platform,0));
 -- A refreshed token replaces this installation; a shared device follows its current signed-in account.
 DELETE FROM public.app_notification_devices WHERE platform=p_platform AND installation_id=p_installation AND (environment<>p_environment OR address_hash<>p_hash);
 IF (SELECT count(*) FROM public.app_notification_devices WHERE user_id=p_actor AND revoked_at IS NULL AND last_seen_at>now()-interval '90 days')>=20
 AND NOT EXISTS(SELECT 1 FROM public.app_notification_devices WHERE platform=p_platform AND environment=p_environment AND address_hash=p_hash) THEN RAISE EXCEPTION 'LIMIT_REACHED';END IF;
 INSERT INTO public.app_notification_devices(user_id,session_id,installation_id,platform,environment,address_hash,address_encrypted,label)
 VALUES(p_actor,p_session,p_installation,p_platform,p_environment,p_hash,p_encrypted,p_label)
 ON CONFLICT(platform,environment,address_hash) DO UPDATE SET user_id=excluded.user_id,session_id=excluded.session_id,installation_id=excluded.installation_id,
 address_encrypted=excluded.address_encrypted,label=excluded.label,last_seen_at=now(),revoked_at=NULL RETURNING id INTO result;
 RETURN result;
END $$;
CREATE FUNCTION public.remove_app_notification_device(p_actor uuid,p_session uuid,p_device uuid) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NOT gdg_security.app_notification_session(p_actor,p_session) THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
 UPDATE public.app_notification_devices SET revoked_at=now(),address_encrypted='' WHERE id=p_device AND user_id=p_actor;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND';END IF;
END $$;

-- One delivery per notification/device. Never replay old inbox history at enrollment.
CREATE FUNCTION gdg_security.queue_app_notification() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE category text:=NEW.push_category;
BEGIN
 IF NEW.delivery_key LIKE 'form-response:%' THEN category:='forms';END IF;
 INSERT INTO public.delivery_jobs(kind,deduplication_key,payload)
 SELECT 'app_push_'||d.platform,'app-push:'||NEW.id||':'||d.id,jsonb_build_object('notificationId',NEW.id,'deviceId',d.id,'category',category)
 FROM public.app_notification_devices d JOIN public.admin_users u ON u.id=d.user_id LEFT JOIN public.admin_sessions s ON s.id=d.session_id
 LEFT JOIN public.app_notification_preferences p ON p.user_id=u.id
 WHERE d.user_id=NEW.user_id AND d.revoked_at IS NULL AND d.last_seen_at>now()-interval '90 days' AND u.is_active AND u.deleted_at IS NULL
 AND (d.session_id IS NULL OR s.revoked_at IS NULL) AND coalesce((p.categories->>category)::boolean,true)
 ON CONFLICT(deduplication_key) DO NOTHING;
 RETURN NEW;
END $$;
CREATE TRIGGER app_notification_created AFTER INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION gdg_security.queue_app_notification();

-- Only verified delivery preparation can mirror mail. Public clients cannot supply recipients.
CREATE FUNCTION public.queue_mail_app_notification(p_job uuid,p_lease uuid,p_email text,p_category text,p_subject text,p_chapter boolean DEFAULT false) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.delivery_jobs;u public.admin_users;added integer;total integer:=0;
BEGIN
 SELECT * INTO j FROM public.delivery_jobs WHERE id=p_job AND lease_token=p_lease AND state='running' AND locked_until>now() AND created_at>now()-interval '7 days' FOR SHARE;
 IF NOT FOUND OR j.kind LIKE 'app_push_%' OR j.kind IN('workspace_notice_email','direct_message_notice','chapter_announcement','task_notification','team_announcement') THEN RETURN 0;END IF;
 IF p_category NOT IN('forms','events','newsletter','accounts','id','contact','workspace') OR length(p_subject)>255 THEN RAISE EXCEPTION 'VALIDATION_ERROR';END IF;
 FOR u IN SELECT * FROM public.admin_users WHERE (lower(btrim(email))=lower(btrim(p_email)) OR (p_chapter AND role='super_admin')) AND is_active AND deleted_at IS NULL AND NOT must_change_password LOOP
 -- The form owner already receives the canonical submission notification.
 IF j.kind IN('form_reviewed_email','form_response_notification') AND EXISTS(SELECT 1 FROM public.notifications WHERE user_id=u.id AND delivery_key='form-response:'||(j.payload->>'responseId')||':'||u.id) THEN CONTINUE;END IF;
 INSERT INTO public.notifications(user_id,type,title,message,link,delivery_key,push_category)
 VALUES(u.id,'system',p_subject,'A chapter email update is available in your inbox.','/admin/notifications','mail-update:'||j.id||':'||u.id,p_category) ON CONFLICT(delivery_key) DO NOTHING;
 GET DIAGNOSTICS added=ROW_COUNT;total:=total+added;
 END LOOP;RETURN total;
END $$;

-- Enqueue each new submission at commit, independently of email preferences.
CREATE FUNCTION gdg_security.form_submission_app_notice() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE f public.forms;v public.form_versions;p public.form_delivery_policies;recipient uuid;recipients uuid[];
BEGIN
 IF NEW.deleted_at IS NOT NULL OR NEW.redacted_at IS NOT NULL THEN RETURN NEW;END IF;
 SELECT * INTO f FROM public.forms WHERE id=NEW.form_id;
 SELECT * INTO v FROM public.form_versions WHERE id=NEW.version_id;
 SELECT * INTO p FROM public.form_delivery_policies WHERE form_id=f.id;
 recipients:=ARRAY[f.owner_id];
 IF p.form_id IS NOT NULL AND gdg_security.form_delivery_policy_current(f.id,v.schema_hash) THEN recipients:=recipients||p.notification_users;END IF;
 FOREACH recipient IN ARRAY recipients LOOP
  IF public.can_operate_form(recipient,f.id,'view_responses') THEN
   INSERT INTO public.notifications(user_id,type,title,message,link,delivery_key,push_category)
   VALUES(recipient,'system','New form response','A response is ready for review.','/admin/forms/'||f.id||'/responses','form-response:'||NEW.id||':'||recipient,'forms') ON CONFLICT(delivery_key) DO NOTHING;
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER form_submission_app_notice AFTER INSERT ON public.form_responses FOR EACH ROW EXECUTE FUNCTION gdg_security.form_submission_app_notice();
CREATE FUNCTION public.prepare_app_push(p_job uuid,p_lease uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.delivery_jobs;n public.notifications;d public.app_notification_devices;category text;u public.admin_users;
BEGIN
 SELECT * INTO j FROM public.delivery_jobs WHERE id=p_job AND lease_token=p_lease AND kind IN('app_push_ios','app_push_web') AND state='running' AND locked_until>now() AND created_at>now()-interval '24 hours' FOR SHARE;
 IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT * INTO d FROM public.app_notification_devices WHERE id=(j.payload->>'deviceId')::uuid AND revoked_at IS NULL AND last_seen_at>now()-interval '90 days' FOR SHARE;
 IF NOT FOUND OR j.kind<>'app_push_'||d.platform THEN RETURN NULL;END IF;
 SELECT * INTO n FROM public.notifications WHERE id=(j.payload->>'notificationId')::uuid AND user_id=d.user_id AND NOT is_read FOR SHARE;
 IF NOT FOUND THEN RETURN NULL;END IF;
 category:=j.payload->>'category';
 IF NOT coalesce((SELECT(categories->>category)::boolean FROM public.app_notification_preferences WHERE user_id=d.user_id),true) THEN RETURN NULL;END IF;
 SELECT * INTO u FROM public.admin_users WHERE id=d.user_id AND is_active AND deleted_at IS NULL AND NOT must_change_password AND(locked_until IS NULL OR locked_until<=now()) FOR SHARE;
 IF NOT FOUND OR(d.session_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.admin_sessions WHERE id=d.session_id AND revoked_at IS NULL AND admin_user_id=u.id)) THEN RETURN NULL;END IF;
 IF n.delivery_key LIKE 'form-response:%' AND NOT public.can_operate_form(u.id,split_part(n.link,'/',4)::uuid,'view_responses') THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('deviceId',d.id,'encrypted',d.address_encrypted,'platform',d.platform,'environment',d.environment,'category',category,'notificationId',n.id,'badge',(SELECT count(*) FROM public.notifications WHERE user_id=u.id AND NOT is_read));
END $$;
CREATE FUNCTION public.finish_app_push(p_job uuid,p_lease uuid,p_result text) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.delivery_jobs;
BEGIN
 SELECT * INTO j FROM public.delivery_jobs WHERE id=p_job AND lease_token=p_lease AND kind IN('app_push_ios','app_push_web') AND state='running' AND locked_until>now() FOR UPDATE;
 IF NOT FOUND THEN RETURN false;END IF;
 IF p_result NOT IN('accepted','skipped','expired','retry','failed') THEN RAISE EXCEPTION 'INVALID_STATE';END IF;
 IF p_result='expired' THEN UPDATE public.app_notification_devices SET revoked_at=now(),address_encrypted='' WHERE id=(j.payload->>'deviceId')::uuid;END IF;
 UPDATE public.delivery_jobs SET state=CASE WHEN p_result='retry' AND attempt_count<8 THEN 'pending' WHEN p_result='failed' OR(p_result='retry' AND attempt_count>=8) THEN 'dead' ELSE 'completed' END,
 completed_at=CASE WHEN p_result IN('accepted','skipped','expired') THEN now() ELSE NULL END,next_attempt_at=now()+make_interval(secs=>least(3600,power(2,attempt_count)::integer*30)),
 locked_until=NULL,lease_token=NULL,last_error_code=CASE WHEN p_result IN('retry','failed') THEN 'APP_PUSH_'||upper(p_result) ELSE NULL END,updated_at=now() WHERE id=j.id;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION gdg_security.revoke_app_notification_account(),gdg_security.revoke_app_notification_session(),gdg_security.form_submission_app_notice(),gdg_security.app_notification_session(uuid,uuid),public.read_app_notification_settings(uuid,uuid),public.save_app_notification_preferences(uuid,uuid,jsonb),public.register_app_notification_device(uuid,uuid,uuid,text,text,text,text,text),
 public.remove_app_notification_device(uuid,uuid,uuid),gdg_security.queue_app_notification(),public.queue_mail_app_notification(uuid,uuid,text,text,text,boolean),public.prepare_app_push(uuid,uuid),public.finish_app_push(uuid,uuid,text) FROM PUBLIC,anon,authenticated,gdg_realtime;
GRANT EXECUTE ON FUNCTION gdg_security.revoke_app_notification_account(),gdg_security.revoke_app_notification_session(),gdg_security.form_submission_app_notice(),gdg_security.app_notification_session(uuid,uuid),public.read_app_notification_settings(uuid,uuid),public.save_app_notification_preferences(uuid,uuid,jsonb),public.register_app_notification_device(uuid,uuid,uuid,text,text,text,text,text),
 public.remove_app_notification_device(uuid,uuid,uuid),gdg_security.queue_app_notification(),public.queue_mail_app_notification(uuid,uuid,text,text,text,boolean),public.prepare_app_push(uuid,uuid),public.finish_app_push(uuid,uuid,text) TO service_role;
COMMIT;
