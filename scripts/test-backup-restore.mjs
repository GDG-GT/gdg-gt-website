import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  disposablePostgres,
  dockerCommand,
} from "./lib/disposable-postgres.mjs";
const tests = [],
  root = new URL("../", import.meta.url);
const check = (ok, name) => {
  if (!ok) throw Error("FAIL " + name);
  tests.push({ name, passed: true });
  console.info("PASS " + name);
};
const roles =
  "CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;";
let source,
  target,
  success = false;
async function sql(db, source) {
  const r = await db.sql(source);
  if (r.code !== 0)
    throw Error("Disposable restore SQL failed: " + r.stderr.trim());
  return r.stdout.trim();
}
const fingerprint = `CREATE FUNCTION pg_temp.backup_inventory() RETURNS jsonb LANGUAGE plpgsql AS $$
 DECLARE t record;n bigint;digest text;r jsonb:='{}';BEGIN
 FOR t IN SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN('public','gdg_security') ORDER BY 1,2 LOOP
  EXECUTE format('SELECT count(*),encode(sha256(convert_to(coalesce(string_agg(to_jsonb(r)::text,chr(10) ORDER BY to_jsonb(r)::text),''''),''UTF8'')),''hex'') FROM %I.%I r',t.schemaname,t.tablename) INTO n,digest;
  r:=r||jsonb_build_object(t.schemaname||'.'||t.tablename,jsonb_build_object('rows',n,'sha256',digest));
 END LOOP;
 RETURN r;END $$; SELECT pg_temp.backup_inventory();`;
const catalog = `SELECT jsonb_build_object(
 'tables',(SELECT count(*) FROM pg_tables WHERE schemaname IN('public','gdg_security')),
 'functions',(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','gdg_security')),
 'constraints',(SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname IN('public','gdg_security')),
 'indexes',(SELECT count(*) FROM pg_indexes WHERE schemaname IN('public','gdg_security')),
 'rls',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','gdg_security') AND c.relrowsecurity),
 'policies',(SELECT count(*) FROM pg_policies WHERE schemaname IN('public','gdg_security')),
 'views',(SELECT coalesce(jsonb_object_agg(n.nspname||'.'||c.relname,jsonb_build_object(
  'definition',pg_get_viewdef(c.oid,true),
  'options',(SELECT jsonb_agg(value ORDER BY value) FROM unnest(coalesce(c.reloptions,'{}'::text[])) options(value)),
  'grants',(SELECT jsonb_agg(jsonb_build_array(CASE WHEN grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(grantee)::text END,privilege_type,is_grantable)
    ORDER BY CASE WHEN grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(grantee)::text END,privilege_type,is_grantable)
    FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))))),'{}'::jsonb)
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='v' AND n.nspname IN('public','gdg_security')),
 'triggers',(SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','gdg_security') AND NOT t.tgisinternal));`;
const protections = `DO $$ DECLARE t record;BEGIN
 FOR t IN SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN('public','gdg_security')
  UNION ALL SELECT schemaname,viewname FROM pg_views WHERE schemaname IN('public','gdg_security') LOOP
  IF has_table_privilege('anon',format('%I.%I',t.schemaname,t.tablename),'SELECT,INSERT,UPDATE,DELETE')
   OR has_table_privilege('authenticated',format('%I.%I',t.schemaname,t.tablename),'SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'Browser grant restored incorrectly';END IF;
 END LOOP;
 IF NOT has_table_privilege('service_role','public.public_event_inventory','SELECT')
  OR has_table_privilege('service_role','public.public_event_inventory','INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'View ACL restore failed';END IF;
 IF has_function_privilege('anon','public.read_workspace_widget(uuid,uuid,text)','EXECUTE')
  OR has_function_privilege('authenticated','public.read_audit_statistics(uuid,jsonb)','EXECUTE')
  OR NOT has_function_privilege('service_role','public.read_workspace_widget(uuid,uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'Function ACL restore failed';END IF;
 BEGIN INSERT INTO public.event_attendance(event_id,attendee_name,attendee_email,idempotency_key,request_hash)
  VALUES('ffffffff-ffff-4fff-8fff-ffffffffffff','Fictional invalid FK','invalid-fk@example.test',repeat('f',64),repeat('f',64));
  RAISE EXCEPTION 'Restored foreign key not enforced';EXCEPTION WHEN foreign_key_violation THEN NULL;END;
 BEGIN EXECUTE 'SET LOCAL ROLE service_role';UPDATE public.admin_actions SET action='forged' WHERE action='fixture.backup';
  RAISE EXCEPTION 'Restored audit row changed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;EXECUTE 'RESET ROLE';
END $$;`;
try {
  const started = await Promise.allSettled([
    disposablePostgres("restore-source"),
    disposablePostgres("restore-target"),
  ]);
  source = started[0].status === "fulfilled" ? started[0].value : undefined;
  target = started[1].status === "fulfilled" ? started[1].value : undefined;
  if (!source || !target)
    throw Error("Isolated restore databases could not both start");
  await Promise.all([
    sql(source, roles),
    sql(target, roles + " CREATE ROLE gdg_realtime NOLOGIN;"),
  ]);
  const migrations = (await readdir(new URL("database/migrations/", root)))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const file of migrations)
    await sql(
      source,
      await readFile(new URL("database/migrations/" + file, root), "utf8"),
    );
  check(
    migrations.length >= 109,
    "source restore fixture rebuilds the complete canonical migration chain",
  );
  await sql(
    source,
    `INSERT INTO public.admin_users(id,email,password_hash,role,is_active)
   VALUES('f1060000-0000-4000-8000-000000000001','backup-fixture@example.test','disabled-fictional-fixture','admin',false);
   INSERT INTO public.admin_sessions(admin_user_id,token_hash,revoked_at) VALUES('f1060000-0000-4000-8000-000000000001',repeat('a',64),now());
   INSERT INTO public.events(id,title,description,start_at,location,slug,publication_status)
   VALUES('f1060000-0000-4000-8000-000000000002','Fictional retained event','Local restore fixture',now(),'Fictional venue','fictional-retained-restore','archived');
   INSERT INTO public.event_attendance(event_id,attendee_name,attendee_email,idempotency_key,request_hash)
   VALUES('f1060000-0000-4000-8000-000000000002','Fictional retained respondent','backup-respondent@example.test',repeat('b',64),repeat('b',64));
   INSERT INTO public.admin_actions(actor_id,action,target_type,target_id,metadata)
   VALUES('f1060000-0000-4000-8000-000000000001','fixture.backup','event','f1060000-0000-4000-8000-000000000002','{"count":1}');`,
  );
  const before = JSON.parse(await sql(source, fingerprint)),
    beforeCatalog = JSON.parse(await sql(source, catalog));
  const dump = await dockerCommand([
    "exec",
    source.name,
    "pg_dump",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "--no-owner",
    "--clean",
    "--if-exists",
  ]);
  if (dump.code !== 0)
    throw Error("Fictional database backup could not be read");
  const sha256 = createHash("sha256").update(dump.stdout).digest("hex");
  check(
    dump.stdout.includes("fixture.backup") &&
      dump.stdout.includes("ROW LEVEL SECURITY"),
    "backup contains fictional retained records and security schema definitions",
  );
  // The dump remains in process memory and goes only to this invocation's
  // network-isolated restore target. Never dump a project/production database.
  await sql(target, dump.stdout);
  const after = JSON.parse(await sql(target, fingerprint)),
    afterCatalog = JSON.parse(await sql(target, catalog));
  check(
    JSON.stringify(before) === JSON.stringify(after),
    "every application/security table restores with identical row count and SHA-256 content fingerprint",
  );
  check(
    JSON.stringify(beforeCatalog) === JSON.stringify(afterCatalog),
    "restored table/view/function/constraint/index/RLS/policy/trigger inventory matches the source, including view definitions/options/grants",
  );
  await sql(target, protections);
  check(
    true,
    "restored browser grants, service function grants, foreign keys and append-only audit protections are enforced",
  );
  const again = JSON.parse(await sql(target, fingerprint));
  check(
    JSON.stringify(after) === JSON.stringify(again),
    "negative restore checks leave retained records unchanged",
  );
  await writeFile(
    new URL(".docs/phase0/local-backup-restore.json", root),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        note: "Two invocation-owned network-isolated disposable PostgreSQL databases. No project/production data, file storage, provider backup or hosted recovery was accessed. Fictional dump remained in memory and is not persisted.",
        migrationCount: migrations.length,
        dumpSha256: sha256,
        tableCount: Object.keys(before).length,
        catalog: afterCatalog,
        tests,
      },
      null,
      2,
    ) + "\n",
  );
  success = true;
} finally {
  for (const db of [target, source])
    if (db) {
      await db.stop({ remove: success });
      console.info(
        success
          ? "Removed verified disposable restore database"
          : "Stopped recoverable disposable restore database: " + db.name,
      );
    }
}
