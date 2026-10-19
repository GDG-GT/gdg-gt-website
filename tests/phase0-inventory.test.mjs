import { describe, expect, it } from 'vitest';
import { inventory } from '../scripts/phase0-inventory.mjs';

describe('Phase 0 evidence inventory', () => {
  it('accounts for the historical SQL and detects the three missing RPCs', async () => {
    const result = await inventory();
    expect(result.migrations).toHaveLength(82);
    expect(result.tables).toHaveLength(62);
    expect([...new Set(result.missingRpcDefinitions.map(({ name }) => name))].sort()).toEqual([
      'decrement_attendees_count', 'increment_attendees_count', 'increment_resource_views',
    ]);
    expect(result.directTableServiceFiles.length).toBeGreaterThan(0);
    expect(result.migrations.every(({ sha256 }) => /^[a-f0-9]{64}$/.test(sha256))).toBe(true);
  });
  it('never auto-approves requirements or invents test evidence', async () => {
    const result = await inventory();
    expect(result.requirements).toHaveLength(146);
    expect(new Set(result.requirements.map(({ id }) => id)).size).toBe(146);
    for (const requirement of result.requirements) {
      expect(requirement.status).toBe('unverified');
      expect(requirement.testIds).toEqual([]);
      expect(requirement.evidence).toEqual([]);
      expect(requirement.line).toBeGreaterThan(0);
    }
  });
});
