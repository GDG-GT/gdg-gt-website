import { readFile, readdir, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { entryAssets, offlinePrecacheAssets } from './lib/build-graph.mjs';

const directory = path.resolve('dist');
const manifest = JSON.parse(await readFile(path.join(directory, '.vite/manifest.json'), 'utf8'));
const failures = [];
const limit = (label, actual, maximum) => {
  if (actual > maximum) failures.push(`${label}: ${actual} exceeds ${maximum} bytes`);
};
const report = {};
let serverEnv = {};
try { serverEnv = parseEnv(await readFile('.env.server.local', 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const privateValues = [...new Set(Object.entries({ ...process.env, ...serverEnv })
  .filter(([key, value]) => /(?:SECRET|PRIVATE_KEY|SERVICE_ROLE_KEY|ENCRYPTION_KEY|PEPPER|PASSWORD)/.test(key) &&
    !key.startsWith('VITE_') && typeof value === 'string' && value.length >= 24)
  .map(([, value]) => value))];
for (const entry of ['index.html', 'offline.html']) {
  const assets = [...entryAssets(manifest, entry)];
  let js = 0, css = 0, fonts = 0;
  for (const file of assets) {
    const contents = await readFile(path.join(directory, file));
    if (file.endsWith('.js')) js += gzipSync(contents).length;
    if (file.endsWith('.css')) css += gzipSync(contents).length;
    if (/\.(woff2?|ttf|otf)$/.test(file)) fonts += contents.length;
  }
  // The self-hosted variable Inter face is referenced by an absolute CSS URL.
  const inter = 'assets/inter-latin.woff2';
  if (!assets.includes(inter)) fonts += (await stat(path.join(directory, inter))).size;
  limit(`${entry} initial gzip JS`, js, 250_000);
  limit(`${entry} initial gzip CSS`, css, 60_000);
  limit(`${entry} initial fonts`, fonts, 120_000);
  report[entry] = { jsGzipBytes: js, cssGzipBytes: css, fontBytes: fonts };
}
for (const image of ['hero-atmosphere.webp', 'hero-campus.webp', 'google-wordmark.png'])
  limit(`Above-fold ${image}`, (await stat(path.join(directory, 'assets', image))).size, 250_000);
let offline = 0;
for (const file of offlinePrecacheAssets(manifest)) offline += (await stat(path.join(directory, file))).size;
limit('Offline install (raw, application-specific ceiling)', offline, 750_000);
report.offlineInstallBytes = offline;

// Inspect emitted chunks as well as the graph: no source maps, configuration or
// private source files may ship. This gate complements, not replaces, secret scan.
async function inspect(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const filename = path.join(folder, entry.name);
    if (/^\.env(?:\.|$)/.test(entry.name) || /^(\.docs|server|database|infra|supabase)$/.test(entry.name) || /\.(map|local|pem|key)$/.test(entry.name))
      failures.push(`Forbidden build artifact: ${path.relative(directory, filename)}`);
    if (entry.isDirectory()) await inspect(filename);
    else if (/\.(js|css|json|html|txt|xml)$/.test(entry.name)) {
      const source = await readFile(filename, 'utf8');
      if (privateValues.some(value => source.includes(value)))
        failures.push(`Private configuration found in build artifact: ${path.relative(directory, filename)}`);
    }
  }
}
await inspect(directory);
console.log(JSON.stringify(report, null, 2));
if (failures.length) throw new Error(failures.join('\n'));
console.log('Public entry byte budgets and offline/artifact boundaries pass. Runtime Web Vitals remain a separate gate.');
