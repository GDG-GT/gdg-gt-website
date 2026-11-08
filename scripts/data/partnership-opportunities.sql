BEGIN;
-- Invitation copy, not a claim of confirmed funding or a sponsor agreement.
INSERT INTO public.sponsorship_tiers(tier_name,tier_level,amount,color_gradient,benefits,order_index,is_active)
SELECT tier_name,tier_level,amount,color_gradient,benefits,order_index,true FROM(VALUES
 ('Workshop support','bronze','Speakers, mentors or event essentials','bronze',ARRAY['Help students explore a tool through a hands-on workshop','Contribute a technical speaker, mentors, food or event materials','Discuss the event format and partner recognition with the chapter'],10),
 ('Project support','silver','Tools, hardware or technical guidance','silver',ARRAY['Help a student team build and share a project','Offer technical feedback, relevant hardware or developer tools','Agree on a practical project scope and support plan together'],20),
 ('Community support','gold','Support across a series of chapter activities','gold',ARRAY['Discuss a workshop series, project showcase or ongoing mentorship','Connect students with engineers and career conversations','Build a partnership plan around student learning and shared goals'],30)
) proposed(tier_name,tier_level,amount,color_gradient,benefits,order_index)
WHERE NOT EXISTS(SELECT 1 FROM public.sponsorship_tiers t WHERE t.tier_level=proposed.tier_level);
INSERT INTO public.admin_actions(actor_id,action,target_type,metadata)
SELECT id,'content.sponsorship_opportunities.curated_import','sponsorship_tiers','{"source":"owner-requested-partnership-copy-2026-11-08","no_confirmed_sponsor_claim":true}'::jsonb
FROM public.admin_users WHERE lower(email)='tejas.singhal@gatech.edu' AND is_active AND role='super_admin' AND deleted_at IS NULL;
COMMIT;
