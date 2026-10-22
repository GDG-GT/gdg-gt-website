import { describe, it, expect, vi } from 'vitest';
import { drainOperationalRetention } from '../../server/lib/retention-worker.mjs';
describe('OPS-TEST retention backlog recovery', () => {
  const run = { runId: 'run', lease: 'lease' };
  it('drains consecutive full batches and preserves the exact current lease', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: { sessionsExpired: 1000, gatesExpired: 1 } })
      .mockResolvedValueOnce({ data: { sessionsExpired: 1000, gatesExpired: 0 } })
      .mockResolvedValueOnce({ data: { sessionsExpired: 3, gatesExpired: 0 } });
    expect(await drainOperationalRetention({ rpc }, run)).toEqual({ sessionsExpired: 2003, gatesExpired: 1, batches: 3, backlogRemaining: 0 });
    for (const call of rpc.mock.calls) expect(call).toEqual(['run_operational_retention', { p_run: 'run', p_lease: 'lease', p_limit: 1000 }]);
  });
  it('stops at twenty batches and reports rather than concealing remaining work', async () => {
    const rpc = vi.fn(async () => ({ data: { notificationsExpired: 1000 } }));
    expect(await drainOperationalRetention({ rpc }, run)).toEqual({ notificationsExpired: 20_000, batches: 20, backlogRemaining: 1 });
    expect(rpc).toHaveBeenCalledTimes(20);
  });
  it('stops within its request budget, propagates a lost lease and rejects malformed counters', async () => {
    const rpc = vi.fn(async () => ({ data: { reportCachesExpired: 1000 } }));
    let time = 0;
    expect((await drainOperationalRetention({ rpc }, run, { clock: () => (time += 41_000) })).backlogRemaining).toBe(1);
    expect(rpc).toHaveBeenCalledTimes(1);
    await expect(drainOperationalRetention({ rpc: async () => ({ error: { message: 'JOB_LEASE_LOST' } }) }, run)).rejects.toThrow();
    for (const result of [null, [], { bad: -1 }, { bad: 1.5 }, { bad: 'pii' }])
      await expect(drainOperationalRetention({ rpc: async () => ({ data: result }) }, run)).rejects.toThrow();
  });
});
