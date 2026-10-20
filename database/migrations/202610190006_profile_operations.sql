BEGIN;
ALTER TABLE public.team_members ADD COLUMN admin_user_id uuid UNIQUE REFERENCES public.admin_users(id) ON DELETE SET NULL;
CREATE FUNCTION public.update_own_profile(p_actor uuid,p_display_name text,p_profile jsonb,p_request_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v public.team_members;v_email text;
BEGIN
 SELECT email INTO v_email FROM public.admin_users WHERE id=p_actor AND is_active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='28000';END IF;
 IF p_display_name IS NOT NULL THEN
  UPDATE public.admin_users SET display_name=p_display_name,updated_at=now() WHERE id=p_actor;
 END IF;
 IF p_profile IS NOT NULL THEN
  SELECT * INTO v FROM public.team_members WHERE admin_user_id=p_actor FOR UPDATE;
  IF NOT FOUND THEN
   INSERT INTO public.team_members(name,role,email,admin_user_id,is_active)
   VALUES(p_profile->>'name',p_profile->>'role',v_email,p_actor,false) RETURNING * INTO v;
  END IF;
  UPDATE public.team_members SET name=p_profile->>'name',role=p_profile->>'role',bio=p_profile->>'bio',
   image_url=p_profile->>'imageUrl',linkedin_url=p_profile->>'linkedinUrl',github_url=p_profile->>'githubUrl',updated_at=now() WHERE id=v.id;
 END IF;
 INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,request_id)
 VALUES(p_actor,'profile.updated','admin_user',p_actor,p_request_id);
END $$;
REVOKE ALL ON FUNCTION public.update_own_profile(uuid,text,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.update_own_profile(uuid,text,jsonb,uuid) TO service_role;
COMMIT;
