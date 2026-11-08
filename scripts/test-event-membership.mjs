import { readFile } from "node:fs/promises";
import {
  disposablePostgres,
  dockerCommand,
} from "./lib/disposable-postgres.mjs";
const db = await disposablePostgres("event-adapter");
let passed = false;
async function sql(source) {
  const r = await db.sql(source);
  if (r.code) throw Error(r.stderr);
  return r.stdout;
}
try {
  await sql(
    "CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);",
  );
  await sql(
    await readFile(
      new URL("../integrations/event-membership/schema.sql", import.meta.url),
      "utf8",
    ),
  );
  await sql(
    await readFile(
      new URL("../integrations/event-membership/test.sql", import.meta.url),
      "utf8",
    ),
  );
  await sql(
    `INSERT INTO auth.users(id) VALUES('b4100000-0000-4000-8000-000000000001'); INSERT INTO public.gdg_event_registrations(account_id,member_ref,status) VALUES('b4100000-0000-4000-8000-000000000001','b4100000-0000-4000-8000-000000000002','registered');`,
  );
  const r = await dockerCommand(
    [
      "exec",
      "-i",
      db.name,
      "sh",
      "-c",
      `script=$(mktemp); trap 'rm -f "$script"' EXIT; cat > "$script"; pgbench -n -U postgres -d postgres -c 50 -j 4 -t 1 -f "$script"`,
    ],
    `SELECT public.gdg_event_attendance('b4100000-0000-4000-8000-000000000002',gen_random_uuid());\n`,
  );
  if (
    r.code ||
    !/number of transactions actually processed:\s*50\/50/.test(
      r.stdout + r.stderr,
    )
  )
    throw Error("Concurrent event taps failed");
  if (
    (await sql("SELECT count(*) FROM public.gdg_event_checkins;")).trim() !==
    "1"
  )
    throw Error("Concurrent taps created duplicate attendance");
  console.log(
    "PASS standalone event schema, registration states, rebinding, explicit grants and 50 concurrent duplicate taps",
  );
  passed = true;
} finally {
  await db.stop({ remove: passed });
}
