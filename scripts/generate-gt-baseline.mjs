import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const input = await readFile(path.join(root, '.docs/phase0/source-replay-repaired.json'), 'utf8');
const report = JSON.parse(input);
if (report.catalog.tables.length !== 62 || report.steps.some((step) => step.result !== 'applied')) {
  throw new Error('A complete, zero-failure source reconstruction is required.');
}
const quote = (name) => '"' + name.replaceAll('"', '""') + '"';
const lines = [
  '-- Canonical GT structural baseline, derived from executed source catalog.',
  '-- Source SHA256: ' + createHash('sha256').update(input).digest('hex'),
  '-- Deliberately excludes ALL source rows, policies, grants, functions, triggers,',
  '-- views, authentication behavior, and storage bucket settings. Forward migrations',
  '-- replace security/session/event contracts. Never replay legacy migrations on GT.',
  'BEGIN;',
  'REVOKE CREATE ON SCHEMA public FROM PUBLIC;',
  'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;',
];
for (const { name } of report.catalog.tables) {
  const columns = report.catalog.columns.filter((column) => column.table_name === name);
  lines.push(`CREATE TABLE public.${quote(name)} (`, columns.map((column) => {
    const value = column.column_default?.replaceAll('uuid_generate_v4()', 'gen_random_uuid()');
    return `  ${quote(column.column_name)} ${column.sql_type}${value ? ` DEFAULT ${value}` : ''}${column.is_nullable === 'NO' ? ' NOT NULL' : ''}`;
  }).join(',\n'), ');', `ALTER TABLE public.${quote(name)} ENABLE ROW LEVEL SECURITY;`, '');
}
// Foreign keys are applied after every primary/unique key, irrespective of name.
for (const foreign of [false, true]) {
  for (const constraint of report.catalog.constraints.filter((item) => item.definition.startsWith('FOREIGN KEY') === foreign)) {
    lines.push(`ALTER TABLE public.${quote(constraint.table_name)} ADD CONSTRAINT ${quote(constraint.name)} ${constraint.definition};`);
  }
}
for (const { indexdef } of report.catalog.indexes) lines.push(indexdef + ';');
lines.push(
  'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;',
  'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;',
  'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;',
  'GRANT USAGE ON SCHEMA public TO service_role;',
  'GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;',
  'GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;',
  'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;',
  'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;',
  'COMMIT;', '',
);
const output = path.join(root, 'database/migrations');
await mkdir(output, { recursive: true });
await writeFile(path.join(output, '202610190001_canonical_structure.sql'), lines.join('\n'));
console.log('Generated 62-table structural baseline with no source records or browser grants.');
