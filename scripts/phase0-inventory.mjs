import { createHash } from 'node:crypto';
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
async function filesIn(directory) {
  const entries = await readdir(path.join(root, directory), { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => entry.isDirectory()
    ? filesIn(`${directory}/${entry.name}`) : [`${directory}/${entry.name}`]));
  return nested.flat().sort();
}
const digest = (source) => createHash('sha256').update(source).digest('hex');
const unique = (items) => [...new Set(items)].sort();

/** Mechanical inventory, never a substitute for executing and reviewing SQL. */
export async function inventory() {
  const sqlPaths = (await filesIn('supabase')).filter((file) => file.endsWith('.sql'));
  const sql = await Promise.all(sqlPaths.map(async (file) => ({ file, source: await readFile(path.join(root, file), 'utf8') })));
  const tables = unique(sql.flatMap(({ source }) => [...source.matchAll(/\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?(\w+)"?\s*\(/gi)].map((match) => match[1].toLowerCase())));
  const functions = unique(sql.flatMap(({ source }) => [...source.matchAll(/\bcreate\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?(\w+)"?\s*\(/gi)].map((match) => match[1].toLowerCase())));
  const serviceFiles = (await filesIn('src/services')).filter((file) => /\.[jt]sx?$/.test(file));
  const calls = [];
  for (const file of serviceFiles) {
    const source = await readFile(path.join(root, file), 'utf8');
    for (const match of source.matchAll(/\.rpc\(\s*['"]([^'"]+)['"]/g)) calls.push({ file, name: match[1] });
  }
  const prd = await readFile(path.join(root, '.docs/GDG_GT_WEBSITE_PRD_v1.5.md'), 'utf8');
  const requirements = [...prd.matchAll(/^\*\*([A-Z]+-\d{3}):\*\*\s*(.+)$/gm)].map((match) => ({
    id: match[1], requirement: match[2], line: prd.slice(0, match.index).split('\n').length,
    status: 'unverified', testIds: [], evidence: [],
  }));
  return {
    source: { prd: '.docs/GDG_GT_WEBSITE_PRD_v1.5.md', prdSha256: digest(prd) },
    scope: 'Read-only repository inventory. No database, credentials, seeds, or remote services accessed.',
    limitations: 'Regex-derived object names require executed SQL/catalog verification. Requirement statuses are not implementation or launch approval.',
    tables, functions,
    migrations: sql.filter(({ file }) => file.startsWith('supabase/migrations/')).map(({ file, source }) => ({ file, sha256: digest(source) })),
    missingRpcDefinitions: calls.filter(({ name }) => !functions.includes(name)),
    directTableServiceFiles: await Promise.all(serviceFiles.map(async (file) => ({ file, count: [...(await readFile(path.join(root, file), 'utf8')).matchAll(/\.from\(\s*['"]/g)].length }))).then((files) => files.filter(({ count }) => count)),
    requirements,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await inventory();
  if (process.argv.includes('--write')) {
    const destination = path.join(root, '.docs/phase0');
    await mkdir(destination, { recursive: true });
    const trackerPath = path.join(destination, 'requirements.json');
    let existing = [];
    try { existing = JSON.parse(await readFile(trackerPath, 'utf8')).requirements || []; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const preserved = new Map(existing.map((item) => [item.id, item]));
    const requirements = result.requirements.map((item) => ({ ...item, ...(preserved.get(item.id) || {}), requirement: item.requirement, line: item.line }));
    await writeFile(trackerPath, JSON.stringify({ ...result.source, note: 'IDs cover explicitly numbered requirements; normative sections and phase exit gates also apply.', requirements }, null, 2) + '\n');
    const { requirements: omitted, ...sourceInventory } = result;
    await writeFile(path.join(destination, 'source-inventory.json'), JSON.stringify(sourceInventory, null, 2) + '\n');
  }
  console.log(JSON.stringify({ migrationFiles: result.migrations.length, repositoryDefinedTables: result.tables.length, repositoryDefinedFunctions: result.functions.length, numberedRequirements: result.requirements.length, directTableServiceFiles: result.directTableServiceFiles.length, missingRpcDefinitions: unique(result.missingRpcDefinitions.map(({ name }) => name)), written: process.argv.includes('--write') }, null, 2));
}
