import { databaseResult } from './validation.mjs';
/** Drain bounded batches inside one existing lease. Never widen SQL windows or
 * let an HTTP request run until its lease/host timeout. A capped run is retryable,
 * not a successful "all retained data cleaned" certificate. */
export async function drainOperationalRetention(db, run, { clock = Date.now } = {}) {
  const started = clock(), counts = {};
  let saturated = false, batches = 0;
  do {
    const result = databaseResult(await db.rpc('run_operational_retention', {
      p_run: run.runId, p_lease: run.lease, p_limit: 1000,
    }));
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw Error('Invalid retention counters');
    saturated = false;
    for (const [key, value] of Object.entries(result)) {
      if (!/^[A-Za-z]{1,60}$/.test(key) || !Number.isSafeInteger(value) || value < 0)
        throw Error('Invalid retention counters');
      counts[key] = (counts[key] || 0) + value;
      saturated ||= value >= 1000;
    }
    batches++;
  } while (saturated && batches < 20 && clock() - started < 40_000);
  return { ...counts, batches, backlogRemaining: saturated ? 1 : 0 };
}
