import { randomBytes } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { inventory } from './phase0-inventory.mjs';
import { repairedOrder, repairSourceSql } from './source-sql-repairs.mjs';
import { dockerCommand } from './lib/disposable-postgres.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const name = `gdg-source-audit-${Date.now()}-${randomBytes(3).toString('hex')}`;
const label = 'dev.gdggt.purpose=source-reconstruction';
const sql = (source) => dockerCommand(['exec', '-i', name, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '--single-transaction', '--set=ON_ERROR_STOP=1', '--set=VERBOSITY=sqlstate', '-qAt'], source);
const sourceInventory = await inventory();
const repaired = process.argv.includes('--repaired');
let created = false;
let report;
try {
  const ready = await dockerCommand(['info', '--format', '{{.ServerVersion}}']);
  if (ready.code !== 0) throw new Error('Local Docker runtime is not ready. No database was touched.');
  console.log('Creating isolated source-audit container; PostgreSQL image may download on first run.');
  const started = await dockerCommand(['run', '-d', '--name', name, '--label', label,
    '--network', 'none', '--memory', '768m', '--cpus', '1',
    '-e', `POSTGRES_PASSWORD=${randomBytes(32).toString('base64url')}`, 'postgres:17']);
  if (started.code !== 0) throw new Error('Could not start isolated PostgreSQL. Check the local Docker runtime and image availability.');
  created = true;
  for (let attempt = 0; attempt < 60; attempt++) {
    const probe = await dockerCommand(['exec', name, 'pg_isready', '-U', 'postgres']);
    if (probe.code === 0) break;
    if (attempt === 59) throw new Error('Disposable PostgreSQL did not become ready.');
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const platform = await sql(await readFile(path.join(root, 'scripts/sql/source-audit-platform.sql'), 'utf8'));
  if (platform.code !== 0) throw new Error(`Audit-platform setup failed: ${platform.stderr.match(/ERROR:\s*([0-9A-Z]{5})/)?.[1] || 'UNKNOWN'}`);
  if (repaired) {
    const publication = await sql('CREATE PUBLICATION supabase_realtime;');
    if (publication.code !== 0) throw new Error('Could not create forensic Realtime publication shim.');
  }
  const ordered = ['supabase/schemas/initial-schema.sql', ...(repaired ? repairedOrder(sourceInventory.migrations) : sourceInventory.migrations.map(({ file }) => file))];
  const steps = [];
  for (const file of ordered) {
    const input = await readFile(path.join(root, file), 'utf8');
    const candidate = repaired ? repairSourceSql(file, input) : { source: input, repairs: [] };
    const result = await sql(candidate.source);
    const state = result.stderr.match(/ERROR:\s*([0-9A-Z]{5})/)?.[1] || null;
    steps.push({ file, result: result.code === 0 ? 'applied' : 'rolled_back', sqlState: state, ...(repaired ? { repairs: candidate.repairs } : {}) });
    console.log(`${result.code === 0 ? 'PASS' : `FAIL ${state || 'UNKNOWN'}`} ${file}`);
  }
  const catalogSql = `SELECT json_build_object(
    'tables', (SELECT coalesce(json_agg(x), '[]') FROM (SELECT c.relname AS name, c.relrowsecurity AS rls_enabled FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname) x),
    'columns', (SELECT coalesce(json_agg(x), '[]') FROM (SELECT c.relname AS table_name,a.attname AS column_name,format_type(a.atttypid,a.atttypmod) AS sql_type,CASE WHEN a.attnotnull THEN 'NO' ELSE 'YES' END AS is_nullable,pg_get_expr(d.adbin,d.adrelid) AS column_default FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname='public' AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum) x),
    'constraints', (SELECT coalesce(json_agg(x), '[]') FROM (SELECT c.conrelid::regclass::text AS table_name,c.conname AS name,pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' ORDER BY 1,2) x),
    'indexes', (SELECT coalesce(json_agg(x), '[]') FROM (SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND indexname NOT IN (SELECT conname FROM pg_constraint WHERE connamespace='public'::regnamespace) ORDER BY 1,2) x),
    'grants', (SELECT coalesce(json_agg(x), '[]') FROM (SELECT table_name,grantee,privilege_type FROM information_schema.role_table_grants WHERE table_schema='public' ORDER BY 1,2,3) x),
    'policies', (SELECT coalesce(json_agg(x), '[]') FROM (SELECT tablename,policyname,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' ORDER BY 1,2) x),
    'functions', (SELECT coalesce(json_agg(x), '[]') FROM (SELECT p.proname AS name,pg_get_function_identity_arguments(p.oid) AS arguments,p.prosecdef AS security_definer,p.proconfig AS settings FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f' ORDER BY 1,2) x)
  );`;
  const catalogResult = await sql(catalogSql);
  if (catalogResult.code !== 0) throw new Error('Could not read disposable schema catalog.');
  const image = await dockerCommand(['inspect', name, '--format', '{{.Image}}']);
  report = {
    source: sourceInventory.source, repairedReplay: repaired,
    container: name, imageId: image.stdout.trim(), dockerVersion: ready.stdout.trim(),
    isolation: { network: 'none', publishedPorts: [], hostMounts: [], memoryLimit: '768m' },
    limitations: 'Forensic historical-source replay only. Supabase auth/storage are minimal shims, not security validation. Each file runs transactionally in lexical manifest order; failed files roll back. Seed files are not replayed; embedded historical migration DML remains isolated in this source-only container. This is not a target GT database, canonical baseline, or completed Phase 0.',
    steps, catalog: JSON.parse(catalogResult.stdout.trim()),
  };
  const output = path.join(root, '.docs/phase0');
  await mkdir(output, { recursive: true });
  const reportFile = repaired ? 'source-replay-repaired.json' : 'source-replay.json';
  await writeFile(path.join(output, reportFile), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ applied: steps.filter((step) => step.result === 'applied').length,
    rolledBack: steps.filter((step) => step.result !== 'applied').length,
    publicTables: report.catalog.tables.length, report: `.docs/phase0/${reportFile}` }, null, 2));
} finally {
  // Leave the exact labeled audit container stopped and recoverable for inspection.
  // Never prune, drop, reset, or remove the user's other containers or databases.
  if (created) {
    const check = await dockerCommand(['inspect', name, '--format', '{{index .Config.Labels "dev.gdggt.purpose"}}']);
    if (check.code === 0 && check.stdout.trim() === 'source-reconstruction') {
      await dockerCommand(['stop', name]);
      console.log(`Stopped recoverable source-audit container: ${name}`);
    }
  }
}
