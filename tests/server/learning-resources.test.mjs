import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contentSchemas } from '../../server/content-records.mjs';
const resources = JSON.parse(readFileSync(new URL('../../content/learning-resources.json', import.meta.url), 'utf8'));
describe('Curated official learning resources', () => {
 it('provides distinct, publishable learning links without invented credits or sponsors', () => {
  expect(resources).toHaveLength(8);
  expect(new Set(resources.map(r => r.url)).size).toBe(8);
  for (const resource of resources) {
   expect(contentSchemas.resources.safeParse(resource).success).toBe(true);
   expect(resource.type).toBe('documentation');
   expect(resource.amount).toBeUndefined();
   expect(new URL(resource.url).protocol).toBe('https:');
  }
 });
 it('only inserts missing resources and preserves edited or unpublished rows', () => {
  const sql=readFileSync(new URL('../../scripts/data/learning-resources.sql',import.meta.url),'utf8');
  expect(sql.match(/WHERE NOT EXISTS/g)).toHaveLength(8);
  expect(sql).not.toMatch(/UPDATE public|DELETE FROM|TRUNCATE/i);
 });
});
