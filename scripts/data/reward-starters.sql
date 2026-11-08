BEGIN;
-- Owner-approved proposals. Never award points or publish a perk automatically.
INSERT INTO public.reward_rules(title,points)
SELECT title,points FROM(VALUES('Attend a chapter event',10),('Volunteer at a chapter event',25),('Lead a workshop',40),('Share a project demo',35)) proposed(title,points)
WHERE NOT EXISTS(SELECT 1 FROM public.reward_rules r WHERE r.title=proposed.title);
INSERT INTO public.reward_perks(title,description,threshold,inventory,is_active)
SELECT title,description,threshold,0,false FROM(VALUES
 ('Chapter merch','Request available chapter merchandise. Sizes, items and collection details depend on current stock.',100),
 ('Early event registration','Request access to an early registration window when one is offered. Event capacity and eligibility still apply.',200),
 ('Travel consideration','Request consideration for an available chapter travel opportunity. Selection, funding and institutional travel approval are separate decisions.',500)) proposed(title,description,threshold)
WHERE NOT EXISTS(SELECT 1 FROM public.reward_perks p WHERE p.title=proposed.title);
COMMIT;
