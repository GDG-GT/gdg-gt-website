import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { inventory } from './phase0-inventory.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const name = `gdg-source-audit-${Date.now()}-${randomBytes(3).toString('hex')}`;
const label = 'dev.gdggt.purpose=source-reconstruction';
function run(command, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}
const sql = (source) => run('docker', ['exec', '-i', name, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '--single-transaction', '--set=ON_ERROR_STOP=1', '--set=VERBOSITY=sqlstate', '-qAt'], source);
const sourceInventory = await inventory();
let created = false;
let report;
try {
  const ready = await run('docker', ['info', '--format', '{{.ServerVersion}}']);
  if (ready.code !== 0) throw new Error('Local Docker runtime is not ready. No database was touched.');
  console.log('Creating isolated source-audit container; PostgreSQL image may download on first run.');
  const started = await run('docker', ['run', '-d', '--name', name, '--label', label,
    '--network', 'none', '--memory', '768m', '--cpus', '1',
    '-e', `POSTGRES_PASSWORD=${randomBytes(32).toString('base64url')}`, 'postgres:17']);
  if (started.code !== 0) throw new Error('Could not start isolated PostgreSQL. Check the local Docker runtime and image availability.');
  created = true;
  for (let attempt = 0; attempt < 60; attempt++) {
    const probe = await run('docker', ['exec', name, 'pg_isready', '-U', 'postgres']);
    if (probe.code === 0) break;
    if (attempt === 59) throw new Error('Disposable PostgreSQL did not become ready.');
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const platform = await sql(await readFile(path.join(root, 'scripts/sql/source-audit-platform.sql'), 'utf8'));
  if (platform.code !== 0) throw new Error(`Audit-platform setup failed: ${platform.stderr.match(/ERROR:\s*([0-9A-Z]{5})/)?.[1] || 'UNKNOWN'}`);
  const ordered = ['supabase/schemas/initial-schema.sql', ...sourceInventory.migrations.map(({ file }) => file)];
  const steps = [];
  for (const file of ordered) {
    const result = await sql(await readFile(path.join(root, file), 'utf8'));
    const state = result.stderr.match(/ERROR:\s*([0-9A-Z]{5})/)?.[1] || null;
    steps.push({ file, result: result.code === 0 ? 'applied' : 'rolled_back', sqlState: state });
    console.log(`${result.code === 0 ? 'PASS' : `FAIL ${state || 'UNKNOWN'}`} ${file}`);
  }
  const catalogSql = `SELECT json_build_object(
    'tables', (SELECT coalesce(json_agg(x), '[]') FROM (SELECT c.relname AS name, c.relrowsecurity AS rls_enabled FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname) x),
    'columns', (SELECT coalesce(json_agg(x), '[]') FROM (SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position) x),
    'constraints', (SELECT coalesce(json_agg(x), '[]') FROM (SELECT c.conrelid::regclass::text AS table_name,c.conname AS name,pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' ORDER BY 1,2) x),
    'policies', (SELECT coalesce(json_agg(x), '[]') FROM (SELECT tablename,policyname,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' ORDER BY 1,2) x),
    'functions', (SELECT coalesce(json_agg(x), '[]') FROM (SELECT p.proname AS name,pg_get_function_identity_arguments(p.oid) AS arguments,p.prosecdef AS security_definer,p.proconfig AS settings FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f' ORDER BY 1,2) x)
  );`;
  const catalogResult = await sql(catalogSql);
  if (catalogResult.code !== 0) throw new Error('Could not read disposable schema catalog.');
  const image = await run('docker', ['inspect', name, '--format', '{{.Image}}']);
  report = {
    source: sourceInventory.source,
    container: name, imageId: image.stdout.trim(), dockerVersion: ready.stdout.trim(),
    isolation: { network: 'none', publishedPorts: [], hostMounts: [], memoryLimit: '768m' },
    limitations: 'Forensic historical-source replay only. Supabase auth/storage are minimal shims, not security validation. Each file runs transactionally in lexical manifest order; failed files roll back. Seed files are not replayed; embedded historical migration DML remains isolated in this source-only container. This is not a target GT database, canonical baseline, or completed Phase 0.',
    steps, catalog: JSON.parse(catalogResult.stdout.trim()),
  };
  const output = path.join(root, '.docs/phase0');
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, 'source-replay.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ applied: steps.filter((step) => step.result === 'applied').length,
    rolledBack: steps.filter((step) => step.result !== 'applied').length,
    publicTables: report.catalog.tables.length, report: '.docs/phase0/source-replay.json' }, null, 2));
} finally {
  // Leave the exact labeled audit container stopped and recoverable for inspection.
  // Never prune, drop, reset, or remove the user's other containers or databases.
  if (created) {
    const check = await run('docker', ['inspect', name, '--format', '{{index .Config.Labels "dev.gdggt.purpose"}}']);
    if (check.code === 0 && check.stdout.trim() === 'source-reconstruction') {
      await run('docker', ['stop', name]);
      console.log(`Stopped recoverable source-audit container: ${name}`);
    }
  }
}
