import { beforeAll, describe, expect, it, vi } from "vitest";
import { accountSecurityRoutes } from "../../server/account-security.mjs";
import { hashSecret, token, tokenHash } from "../../server/lib/security.mjs";
let passwordHash;
beforeAll(async () => { passwordHash = await hashSecret("Fictional security proof password"); });
function fixture() {
  const csrf = token(), raw = token();
  const status = { version: 7, activeAccounts: 3, activeSessions: 4 };
  const chain = { select: vi.fn(() => chain), eq: vi.fn(() => chain), maybeSingle: vi.fn(async () => ({ data: null })) };
  const db = { rpc: vi.fn(async (name) => ({ data: name === "read_account_security" ? status : { rotated: true, version: 8 } })), from: vi.fn(() => chain) };
  const store = { validateSession: vi.fn(async () => ({ sessionId: "s", user: { id: "u", email: "fictional@example.test", role: "super_admin", is_active: true } })),
    csrf: vi.fn(async () => ({ token_hash: tokenHash(csrf), expires_at: new Date(Date.now() + 60000).toISOString() })),
    rateLimit: vi.fn(async () => ({ allowed: true })), accountByEmail: vi.fn(async () => ({ password_hash: passwordHash })),
    recordLoginFailure: vi.fn(), audit: vi.fn() };
  const config = { origin: "https://fictional.example.test", sessionCookie: "__Host-gdg_session", riskSecret: "fictional-risk-key" };
  const request = { url: "/api/v1/admin/security/gate", method: "POST", headers: { origin: config.origin, "content-type": "application/json", cookie: "__Host-gdg_session=" + raw, "x-csrf-token": csrf, "idempotency-key": "fictional-rotation-01" },
    body: { code: "Fictional code long enough for rotation", currentPassword: "Fictional security proof password", expectedVersion: 7, confirmation: "ROTATE GATE" } };
  const response = { setHeader: vi.fn(), end: vi.fn() };
  return { request, response, db, store, config, chain, run: () => accountSecurityRoutes(request, response, { db, store, config, requestId: "r" }) };
}
describe("reviewed account security", () => {
  it("leaves unrelated routes alone", async () => { const f = fixture(); f.request.url = "/api/v1/admin/other"; expect(await f.run()).toBe(false); });
  it("rejects non-Super Admin reads before database access", async () => {
    const f = fixture(); f.request.method = "GET"; f.store.validateSession.mockResolvedValue({ sessionId: "s", user: { role: "admin", is_active: true } });
    await expect(f.run()).rejects.toMatchObject({ status: 403 }); expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it("returns safe aggregate metrics without credential hashes", async () => {
    const f = fixture(); f.request.url = "/api/v1/admin/security"; f.request.method = "GET"; await f.run();
    expect(JSON.parse(f.response.end.mock.calls[0][0]).data).toEqual({ version: 7, activeAccounts: 3, activeSessions: 4 });
  });
  it("checks a current-session receipt without performing a rotation", async () => {
    const f = fixture(); f.request.url += "?key=fictional-rotation-01"; f.request.method = "GET";
    f.chain.maybeSingle.mockResolvedValue({ data: { result: { rotated: true, version: 8 }, expires_at: new Date(Date.now() + 60000).toISOString() } });
    await f.run(); expect(JSON.parse(f.response.end.mock.calls[0][0]).data.committed).toBe(true);
    expect(f.chain.eq).toHaveBeenCalledWith("scope", "security.gate:u:s"); expect(f.db.rpc).toHaveBeenCalledTimes(1);
  });
  it("withholds expired receipts", async () => {
    const f = fixture(); f.request.url += "?key=fictional-rotation-01"; f.request.method = "GET";
    f.chain.maybeSingle.mockResolvedValue({ data: { result: { rotated: true }, expires_at: "2000-01-01" } }); await f.run();
    expect(JSON.parse(f.response.end.mock.calls[0][0]).data).toMatchObject({ committed: false, receipt: null });
  });
  it("requires CSRF and typed consequence confirmation", async () => {
    const f = fixture(); delete f.request.headers["x-csrf-token"]; await expect(f.run()).rejects.toMatchObject({ status: 403 });
    const g = fixture(); g.request.body.confirmation = "yes"; await expect(g.run()).rejects.toMatchObject({ status: 400 }); expect(g.db.rpc).not.toHaveBeenCalled();
  });
  it("limits expensive proof checks and reports retry timing", async () => {
    const f = fixture(); f.store.rateLimit.mockResolvedValue({ allowed: false, retryAfter: 90 }); await expect(f.run()).rejects.toMatchObject({ status: 429 });
    expect(f.response.setHeader).toHaveBeenCalledWith("Retry-After", "90"); expect(f.store.accountByEmail).not.toHaveBeenCalled();
  });
  it("audits failed password confirmation without rotating", async () => {
    const f = fixture(); f.request.body.currentPassword = "wrong"; await expect(f.run()).rejects.toMatchObject({ code: "PASSWORD_CONFIRMATION_FAILED" });
    expect(f.store.recordLoginFailure).toHaveBeenCalledOnce(); expect(f.store.audit).toHaveBeenCalledOnce(); expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it("passes current proof, scope, reviewed version and secret digests to the atomic operation", async () => {
    const f = fixture(); await f.run(); const [name, args] = f.db.rpc.mock.calls[0]; expect(name).toBe("rotate_gate_reviewed");
    expect(args).toMatchObject({ p_actor: "u", p_session: "s", p_expected_version: 7, p_verified_hash: passwordHash });
    expect(args.p_hash).toMatch(/^scrypt\$/); expect(args.p_request_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(args)).not.toContain(f.request.body.code); expect(JSON.stringify(args)).not.toContain(f.request.body.currentPassword);
  });
});
