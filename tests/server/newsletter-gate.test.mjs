import { beforeAll, describe, expect, it, vi } from "vitest";
import { publicSubmissionRoutes } from "../../server/public-submissions.mjs";
import { applicationHandler } from "../../server/handler.mjs";
import { hashSecret } from "../../server/lib/security.mjs";

const code = "fictional-officer@example.test";
let gateHash;
beforeAll(async () => {
  gateHash = await hashSecret(code);
});
function fixture({ locked = false, quota = true } = {}) {
  const db = { rpc: vi.fn(async () => ({ data: {}, error: null })) };
  const store = {
    rateLimit: vi.fn(async () => ({ allowed: quota, retryAfter: 900 })),
    checkRateLimit: async () => ({ allowed: !locked, retryAfter: 900 }),
    gateConfiguration: async () => ({ gate_hash: gateHash, gate_version: 2 }),
    createGate: vi.fn(async () => {}),
    audit: vi.fn(async () => {}),
  };
  const config = {
    origin: "https://chapter.example.test",
    riskSecret: "fictional-risk",
    encryptionSecret: "a".repeat(64),
    gateCookie: "__Host-gdg_gate",
    secureCookies: true,
  };
  const response = {
    headers: {},
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    getHeader(name) {
      return this.headers[name.toLowerCase()];
    },
    end(value) {
      this.body = JSON.parse(value);
    },
  };
  const request = (email) => ({
    url: "/api/v1/newsletter/subscriptions",
    method: "POST",
    socket: { remoteAddress: "127.0.0.1" },
    headers: {
      origin: config.origin,
      "content-type": "application/json",
      "idempotency-key": "10000000-0000-4000-8000-000000000001",
    },
    body: { email },
  });
  return {
    db,
    store,
    config,
    response,
    request,
    requestId: "10000000-0000-4000-8000-000000000002",
  };
}
describe("server-recognized email gate entry", () => {
  it("opens only a private gate cookie, never subscribes or emails the code", async () => {
    const f = fixture();
    await publicSubmissionRoutes(f.request(code), f.response, f);
    expect(f.response.body.data).toEqual({ gateValid: true });
    expect(f.db.rpc).not.toHaveBeenCalled();
    expect(f.store.createGate).toHaveBeenCalledWith(
      expect.stringMatching(/^[a-f0-9]{64}$/),
      2,
    );
    expect(f.response.headers["set-cookie"]).toEqual([
      expect.stringMatching(/HttpOnly; Secure; SameSite=Strict; Max-Age=900/),
    ]);
    expect(JSON.stringify(f.response.body)).not.toContain(code);
    expect(JSON.stringify(f.response.body)).not.toContain(gateHash);
    expect(JSON.stringify(f.response.headers)).not.toContain("gdg_session");
  });
  it("keeps normal newsletter addresses in the opt-in workflow", async () => {
    const f = fixture();
    await publicSubmissionRoutes(
      f.request("fictional-student@example.test"),
      f.response,
      f,
    );
    expect(f.db.rpc).toHaveBeenCalledTimes(1);
    expect(f.db.rpc.mock.calls[0][1].p_email).toBe(
      "fictional-student@example.test",
    );
    expect(f.response.body.data.accepted).toBe(true);
    expect(f.response.body.data).not.toHaveProperty("gateValid");
    expect(f.store.createGate).not.toHaveBeenCalled();
  });
  it("cannot bypass an existing gate failure lockout through Subscribe", async () => {
    const f = fixture({ locked: true });
    await expect(
      publicSubmissionRoutes(f.request(code), f.response, f),
    ).rejects.toMatchObject({ status: 429 });
    expect(f.store.createGate).not.toHaveBeenCalled();
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it("bounds the email-shaped entry surface before hashing or issuing cookies", async () => {
    const f = fixture({ quota: false });
    await expect(
      publicSubmissionRoutes(f.request(code), f.response, f),
    ).rejects.toMatchObject({ status: 429 });
    expect(f.store.rateLimit).toHaveBeenCalledWith(
      "public:/api/v1/newsletter/subscriptions",
      expect.any(String),
      5,
      900,
    );
    expect(f.store.createGate).not.toHaveBeenCalled();
  });
  it("rejects cross-origin submissions before business work", async () => {
    const f = fixture(),
      r = f.request(code);
    r.headers.origin = "https://unrelated.example.test";
    await applicationHandler(f)(r, f.response);
    expect(f.response.statusCode).toBe(403);
    expect(f.store.rateLimit).not.toHaveBeenCalled();
    expect(f.store.createGate).not.toHaveBeenCalled();
  });
});
