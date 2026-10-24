BEGIN;
INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES
 ('f1050000-0000-4000-8000-000000000001','audit-scope@example.test','fictional-audit','admin',true),
 ('f1050000-0000-4000-8000-000000000002','audit-member@example.test','fictional-member','team_member',true);
INSERT INTO public.admin_actions(actor_id,action,target_type,result,created_at,metadata) VALUES
 ('f1050000-0000-4000-8000-000000000001','fixture.audit_one','form','success','2026-01-01','{"answer":"Must never appear"}'),
 ('f1050000-0000-4000-8000-000000000001','fixture.audit_one','form','denied','2026-01-02','{}'),
 ('f1050000-0000-4000-8000-000000000001','fixture.audit_two','event','failure','2026-01-03','{}'),
 ('f1050000-0000-4000-8000-000000000001','fixture.audit_two','event','success','2026-01-04','{}');
DO $$ DECLARE a uuid:='f1050000-0000-4000-8000-000000000001';r jsonb;BEGIN
 r:=public.read_audit_statistics(a,'{"q":"fixture.audit","at":"2026-01-03T12:00:00Z"}');
 IF r->>'total'<>'3' OR r->>'success'<>'1' OR r->>'denied'<>'1' OR r->>'failure'<>'1' OR r->'retention'->>'automaticPurge'<>'false'
  OR r::text LIKE '%Must never%' OR r->'actions'->0->>'action'<>'fixture.audit_one' THEN RAISE EXCEPTION 'Audit aggregates or projection failed';END IF;
 r:=public.read_audit_statistics(a,'{"action":"fixture.audit_one","result":"denied","from":"2026-01-02T00:00:00Z","to":"2026-01-02T01:00:00Z"}');
 IF r->>'total'<>'1' OR r->>'denied'<>'1' THEN RAISE EXCEPTION 'Combined audit filters failed';END IF;
 IF public.read_audit_statistics(a,'{"q":"fixture-nonexistent"}')->>'total'<>'0' THEN RAISE EXCEPTION 'Empty audit filters failed';END IF;
 BEGIN PERFORM public.read_audit_statistics('f1050000-0000-4000-8000-000000000002','{}');RAISE EXCEPTION 'Member read audit aggregate';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.read_audit_statistics(a,'{"metadata":"secret"}');RAISE EXCEPTION 'Unknown aggregate filter accepted';EXCEPTION WHEN invalid_parameter_value THEN NULL;END;
 IF has_function_privilege('authenticated','public.read_audit_statistics(uuid,jsonb)','EXECUTE') OR has_function_privilege('anon','public.read_audit_statistics(uuid,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Browser audit grants exist';END IF;
END $$;
ROLLBACK;
