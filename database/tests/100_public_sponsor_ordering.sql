BEGIN;
INSERT INTO public.sponsorship_tiers(tier_name,tier_level,amount,color_gradient,benefits,is_active,order_index)
VALUES ('Fictional first','bronze','Test only','coral','{}',true,-100),('Fictional second','gold','Test only','coral','{}',true,-99)
ON CONFLICT(tier_level) DO UPDATE SET is_active=true,deleted_at=NULL,order_index=EXCLUDED.order_index,tier_name=EXCLUDED.tier_name;
INSERT INTO public.sponsors(id,name,logo_url,tier,is_active,order_index) VALUES
 ('f1000000-0000-4000-8000-000000000001','Fictional first partner','/assets/fixture.png','bronze',true,99),
 ('f1000000-0000-4000-8000-000000000002','Fictional second partner','/assets/fixture.png','gold',true,0),
 ('f1000000-0000-4000-8000-000000000003','Fictional hidden partner','/assets/fixture.png','bronze',false,-1),
 ('f1000000-0000-4000-8000-000000000004','Fictional removed partner','/assets/fixture.png','bronze',true,-2);
UPDATE public.sponsors SET deleted_at=now() WHERE id='f1000000-0000-4000-8000-000000000004';
DO $$ DECLARE r jsonb;BEGIN
 IF has_function_privilege('anon','public.read_public_sponsor_library(integer,integer,text)','EXECUTE')
 OR has_function_privilege('authenticated','public.read_public_sponsor_library(integer,integer,text)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.read_public_sponsor_library(integer,integer,text)','EXECUTE') THEN RAISE EXCEPTION 'Public sponsor grants incorrect';END IF;
 r:=public.read_public_sponsor_library(1,1,'Fictional');
 IF (r->>'total')::int<>2 OR r->'items'->0->>'id'<>'f1000000-0000-4000-8000-000000000001'
 OR r->'items'->0->>'tier_label'<>'Fictional first' OR r::text LIKE '%created_by%' OR r::text LIKE '%team_id%' THEN RAISE EXCEPTION 'Public sponsor scope/order/projection failed';END IF;
 r:=public.read_public_sponsor_library(2,1,'Fictional');
 IF r->'items'->0->>'id'<>'f1000000-0000-4000-8000-000000000002' THEN RAISE EXCEPTION 'Tier ordering not applied before pagination';END IF;
 IF (public.read_public_sponsor_library(1,10,'FIRST')->>'total')::int<>1
 OR jsonb_array_length(public.read_public_sponsor_library(99,10,'Fictional')->'items')<>0 THEN RAISE EXCEPTION 'Search/pagination failed';END IF;
 BEGIN PERFORM public.read_public_sponsor_library(0,100,NULL);RAISE EXCEPTION 'Invalid bounds accepted';EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
 BEGIN PERFORM public.read_public_sponsor_library(1,101,NULL);RAISE EXCEPTION 'Unbounded list accepted';EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
END $$;
ROLLBACK;
