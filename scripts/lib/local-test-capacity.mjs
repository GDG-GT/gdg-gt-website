// Test preflight only: observe the real quotas, never reset/update them. Each
// wait is bounded to 30s and happens before creating any fixture or account.
export async function waitForLocalTestCapacity(db, { logins = 2, gates = 2, subscriptions = 0 } = {}) {
  const limits = { "auth.login.ip": [20, logins], "auth.gate.requests": [60, gates], "public:/api/v1/newsletter/subscriptions": [5, subscriptions] },
    deadline = Date.now() + 16 * 60 * 1000;
  let announced = false;
  while (Date.now() < deadline) {
    const r = await db.from("rate_limit_windows").select("scope,attempts,expires_at").in("scope", Object.keys(limits)).gt("expires_at", new Date().toISOString());
    if (r.error) throw Error("Local test quota preflight could not be read.");
    // Summing all active local risk buckets is conservative if another local
    // client is present. No risk hash, account or credential is retained.
    const totals = Object.fromEntries(Object.keys(limits).map((scope) => [scope, r.data.filter((row) => row.scope === scope).reduce((n, row) => n + row.attempts, 0)]));
    if (Object.entries(limits).every(([scope, [limit, need]]) => !need || totals[scope] + need <= limit)) return;
    if (!announced) { console.info("Waiting for the existing local security window to expire naturally; no quota is modified."); announced = true; }
    await new Promise((resolve) => setTimeout(resolve, 30000));
  }
  throw Error("Local test quota capacity did not become available within its bounded preflight.");
}
