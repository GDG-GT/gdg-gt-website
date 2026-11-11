import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  disposablePostgres,
  dockerCommand,
} from "./lib/disposable-postgres.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const legacyDefaults = process.argv.includes("--legacy-defaults");
if (process.argv.slice(2).some((arg) => arg !== "--legacy-defaults"))
  throw new Error("Unknown database test option.");
const database = await disposablePostgres("canonical-test");
const evidence = [];
let passed = false;
async function execute(name, source) {
  const result = await database.sql(source);
  evidence.push({ name, passed: result.code === 0 });
  if (result.code !== 0) throw new Error(`${name}: ${result.stderr.trim()}`);
  console.log("PASS " + name);
  return result.stdout;
}
try {
  await execute(
    "isolated test roles",
    "CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;",
  );
  if (legacyDefaults)
    await execute(
      "legacy Supabase automatic grants (before October 30, 2026)",
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
       ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon,authenticated,service_role;
       ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role;`,
    );
  const migrations = (await readdir(path.join(root, "database/migrations")))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const file of migrations)
    await execute(
      file,
      await readFile(path.join(root, "database/migrations", file), "utf8"),
    );
  const tests = (await readdir(path.join(root, "database/tests")))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const file of tests)
    await execute(
      file,
      await readFile(path.join(root, "database/tests", file), "utf8"),
    );
  // pgbench opens 100 independent database sessions. Each client submits once;
  // expected full-capacity failures are counted, not swallowed as test success.
  const concurrent = await dockerCommand(
    [
      "exec",
      "-i",
      database.name,
      "sh",
      "-c",
      'script=$(mktemp); trap \'rm -f "$script"\' EXIT; cat > "$script"; pgbench -n -U postgres -d postgres -c 100 -j 4 -t 1 -f "$script"',
    ],
    "SELECT public.test_last_seat(:client_id);\n",
  );
  if (concurrent.code !== 0)
    throw new Error(
      "100-client registration test failed: " + concurrent.stderr,
    );
  await execute(
    "EVT concurrency: 100 clients, exactly one last-seat registration",
    `DO $$ BEGIN
    IF (SELECT count(*) FROM public.test_registration_outcomes WHERE result='registered')<>1
      OR (SELECT count(*) FROM public.test_registration_outcomes WHERE result='full')<>99
      OR (SELECT count(*) FROM public.event_attendance)<>1
      OR (SELECT count(*) FROM public.delivery_jobs)<>1 THEN
      RAISE EXCEPTION 'Concurrent capacity or outbox deduplication failed';
    END IF;
  END $$;`,
  );
  const formConcurrent = await dockerCommand(
    [
      "exec",
      "-i",
      database.name,
      "sh",
      "-c",
      'script=$(mktemp); trap \'rm -f "$script"\' EXIT; cat > "$script"; pgbench -n -U postgres -d postgres -c 100 -j 4 -t 1 -f "$script"',
    ],
    "SELECT public.test_form_last_slot(:client_id);\n",
  );
  if (formConcurrent.code !== 0)
    throw new Error(
      "100-client form limit test failed: " + formConcurrent.stderr,
    );
  await execute(
    "FORM concurrency: 100 clients, exactly one remaining response",
    `DO $$ BEGIN
    IF (SELECT count(*) FROM public.test_form_outcomes WHERE result='submitted')<>1
      OR (SELECT count(*) FROM public.test_form_outcomes WHERE result='full')<>99
      OR (SELECT count(*) FROM public.form_responses WHERE form_id='a1000000-0000-4000-8000-000000000002')<>1
      OR (SELECT count(*) FROM public.delivery_jobs WHERE kind='form_response_notification')<>1 THEN
      RAISE EXCEPTION 'Concurrent form limit or outbox deduplication failed';
    END IF;
  END $$;`,
  );
  await execute("Native queue fixture", `
    CREATE TABLE public.test_native_queue_fixture(i integer PRIMARY KEY,member_id uuid,credential_hash text);
    INSERT INTO public.admin_users(id,email,password_hash,role,is_active) VALUES('a1550000-0000-4000-8000-000000000001','native-concurrency@example.test','fixture','super_admin',true);
    INSERT INTO public.admin_sessions(id,admin_user_id,token_hash) VALUES('a1550000-0000-4000-8000-000000000002','a1550000-0000-4000-8000-000000000001',repeat('d1',32));
    INSERT INTO public.reward_rules(id,title,points) VALUES('a1550000-0000-4000-8000-000000000003','Native queue rule',10);
    INSERT INTO public.reward_activities(id,rule_id,title,points,opens_at,closes_at) VALUES('a1550000-0000-4000-8000-000000000004','a1550000-0000-4000-8000-000000000003','Native queue activity',10,now()-interval '1 hour',now()+interval '1 hour');
    DO $$ DECLARE i integer;m uuid;BEGIN FOR i IN 0..100 LOOP
      INSERT INTO public.members(name,email) VALUES('Queue participant '||i,'queue-'||i||'@example.test') RETURNING id INTO m;
      INSERT INTO public.reward_credentials(member_id,kind,label,token_hash,encrypted_token) VALUES(m,'wallet','Queue Wallet',md5('native-queue-'||i)||md5('native-queue-'||i),'fixture');
      INSERT INTO public.test_native_queue_fixture VALUES(i,m,md5('native-queue-'||i)||md5('native-queue-'||i));
    END LOOP;END $$;
    CREATE FUNCTION public.test_native_queue(p_i integer) RETURNS jsonb LANGUAGE sql AS $$
      SELECT public.native_member_checkin('a1550000-0000-4000-8000-000000000001','a1550000-0000-4000-8000-000000000002','activity','a1550000-0000-4000-8000-000000000004',NULL,credential_hash,NULL,md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text),repeat('d2',32),gen_random_uuid()) FROM public.test_native_queue_fixture WHERE i=p_i
    $$;
  `);
  for (const [label,sql] of [["100 distinct participants","SELECT public.test_native_queue(:client_id);\n"],["100 simultaneous scans of one card","SELECT public.test_native_queue(100);\n"]]) {
    const result=await dockerCommand(["exec","-i",database.name,"sh","-c",'script=$(mktemp); trap \'rm -f "$script"\' EXIT; cat > "$script"; pgbench -n -U postgres -d postgres -c 100 -j 4 -t 1 -f "$script"'],sql);
    if(result.code!==0)throw new Error("Native queue "+label+": "+result.stderr);
    console.log("PASS Native queue "+label);
  }
  await execute("Native queue: 101 members credited once, no duplicate points", `DO $$ BEGIN
    IF (SELECT count(*) FROM public.reward_ledger WHERE activity_id='a1550000-0000-4000-8000-000000000004')<>101
      OR EXISTS(SELECT 1 FROM public.test_native_queue_fixture WHERE gdg_security.reward_balance(member_id)<>10) THEN RAISE EXCEPTION 'Native queue duplicated or lost points';END IF;
  END $$;`);
  await mkdir(path.join(root, ".docs/phase0"), { recursive: true });
  await writeFile(
    path.join(
      root,
      `.docs/phase0/canonical-tests${legacyDefaults ? "-legacy-grants" : ""}.json`,
    ),
    JSON.stringify(
      {
        note: "Executed against network-isolated PostgreSQL 17. Not certification of Supabase Storage/Realtime or hosted deployment.",
        tableGrantDefaults: legacyDefaults
          ? "legacy automatic API grants"
          : "no automatic API grants",
        migrations,
        tests: evidence,
      },
      null,
      2,
    ) + "\n",
  );
  passed = true;
} finally {
  await database.stop({ remove: passed });
  console.log(
    (passed
      ? "Removed successful disposable test database: "
      : "Stopped recoverable failed test database: ") + database.name,
  );
}
