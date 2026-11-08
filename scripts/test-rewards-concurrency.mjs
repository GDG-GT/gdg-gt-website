import { readFile, readdir } from "node:fs/promises";
import {
  disposablePostgres,
  dockerCommand,
} from "./lib/disposable-postgres.mjs";
const db = await disposablePostgres("rewards-concurrency");
let passed = false;
async function sql(source) {
  const r = await db.sql(source, { terse: false });
  if (r.code) throw Error(r.stderr);
  return r.stdout;
}
try {
  await sql(
    "CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE ROLE service_role NOLOGIN BYPASSRLS;",
  );
  for (const file of (await readdir("database/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await sql(await readFile("database/migrations/" + file, "utf8"));
  await sql(`
 CREATE TABLE public.reward_test_context(kind text PRIMARY KEY,record_id uuid NOT NULL);
 CREATE TABLE public.reward_test_outcomes(kind text,client integer,result text);
 INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES('b2200000-0000-4000-8000-000000000001','concurrent-rewards@example.test','fictional','super_admin',true);
 INSERT INTO public.admin_sessions(id,admin_user_id,token_hash) VALUES('b2200000-0000-4000-8000-000000000002','b2200000-0000-4000-8000-000000000001',repeat('44',32));
 INSERT INTO public.members(id,name,email) VALUES('b2200000-0000-4000-8000-000000000003','Fictional concurrency member','concurrent-member@gatech.edu');
 INSERT INTO public.reward_rules(id,title,points) VALUES('b2200000-0000-4000-8000-000000000004','Fictional concurrent rule',10);
 INSERT INTO public.reward_activities(id,rule_id,title,points,opens_at,closes_at) VALUES('b2200000-0000-4000-8000-000000000005','b2200000-0000-4000-8000-000000000004','Fictional concurrent activity',10,now()-interval '1 hour',now()+interval '1 hour');
 CREATE FUNCTION public.test_reward_award(client integer) RETURNS void LANGUAGE plpgsql AS $$ DECLARE outcome text:='awarded';BEGIN
 BEGIN PERFORM public.reward_admin_mutate('b2200000-0000-4000-8000-000000000001','b2200000-0000-4000-8000-000000000002','award','{"memberId":"b2200000-0000-4000-8000-000000000003","activityId":"b2200000-0000-4000-8000-000000000005"}',md5('award:'||client)||md5('award:'||client),repeat('45',32),gen_random_uuid());EXCEPTION WHEN unique_violation THEN outcome:='duplicate';END;
 INSERT INTO public.reward_test_outcomes VALUES('award',client,outcome);END $$;
 INSERT INTO public.reward_perks(id,title,description,threshold,inventory,is_active) VALUES('b2200000-0000-4000-8000-000000000006','Fictional last perk','Isolated concurrency fixture',50,1,true);
 DO $$ DECLARE i integer;m uuid;BEGIN FOR i IN 0..49 LOOP
 INSERT INTO public.members(name,email) VALUES('Fictional claimant '||i,'claimant-'||i||'@gatech.edu') RETURNING id INTO m;
 INSERT INTO public.reward_ledger(member_id,points,reason,actor_id) VALUES(m,100,'Fictional test credit','b2200000-0000-4000-8000-000000000001');
 PERFORM public.reward_open_session('claimant-'||i||'@gatech.edu','fictional-subject-'||i,md5('session:'||i)||md5('session:'||i),md5('csrf:'||i)||md5('csrf:'||i));END LOOP;END $$;
 CREATE FUNCTION public.test_reward_claim(client integer) RETURNS void LANGUAGE plpgsql AS $$ DECLARE outcome text:='reserved';BEGIN
 BEGIN PERFORM public.reward_member_mutate(md5('session:'||client)||md5('session:'||client),md5('csrf:'||client)||md5('csrf:'||client),'claim','{"perkId":"b2200000-0000-4000-8000-000000000006"}',md5('claim:'||client)||md5('claim:'||client),repeat('46',32));EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'INVALID_STATE' THEN RAISE;END IF;outcome:='full';END;
 INSERT INTO public.reward_test_outcomes VALUES('claim',client,outcome);END $$;
 `);
  for (const type of ["award", "claim"]) {
    const r = await dockerCommand(
      [
        "exec",
        "-i",
        db.name,
        "sh",
        "-c",
        `script=$(mktemp); trap 'rm -f "$script"' EXIT; cat > "$script"; pgbench -n -U postgres -d postgres -c 50 -j 4 -t 1 -f "$script"`,
      ],
      `SELECT public.test_reward_${type}(:client_id);\n`,
    );
    if (r.code) throw Error(r.stderr);
  }
  await sql(`DO $$ BEGIN
 IF(SELECT count(*) FROM public.reward_test_outcomes WHERE kind='award' AND result='awarded')<>1 OR(SELECT count(*) FROM public.reward_test_outcomes WHERE kind='award' AND result='duplicate')<>49 OR gdg_security.reward_balance('b2200000-0000-4000-8000-000000000003')<>10 THEN RAISE EXCEPTION 'Concurrent taps duplicated awards';END IF;
 IF(SELECT count(*) FROM public.reward_test_outcomes WHERE kind='claim' AND result='reserved')<>1 OR(SELECT count(*) FROM public.reward_test_outcomes WHERE kind='claim' AND result='full')<>49 OR(SELECT count(*) FROM public.reward_claims)<>1 THEN RAISE EXCEPTION 'Perk stock over-reserved';END IF;END $$;`);
  console.log(
    "PASS 50 concurrent check-ins: one award, 49 duplicate refusals.",
  );
  console.log(
    "PASS 50 competing perk requests: one reservation, 49 full responses.",
  );
  passed = true;
} finally {
  await db.stop({ remove: passed });
}
