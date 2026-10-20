import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  disposablePostgres,
  dockerCommand,
} from "./lib/disposable-postgres.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const database = await disposablePostgres("canonical-test");
const evidence = [];
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
  await mkdir(path.join(root, ".docs/phase0"), { recursive: true });
  await writeFile(
    path.join(root, ".docs/phase0/canonical-tests.json"),
    JSON.stringify(
      {
        note: "Executed against network-isolated PostgreSQL 17. Not certification of Supabase Storage/Realtime or hosted deployment.",
        migrations,
        tests: evidence,
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  await database.stop();
  console.log("Stopped recoverable test database: " + database.name);
}
