import { describe, expect, it, vi } from "vitest";
import { applicationHandler } from "../../server/handler.mjs";
import { token, tokenHash, hashSecret } from "../../server/lib/security.mjs";
const actor = "f1340000-0000-4000-8000-000000000001",
  sessionId = "f1340000-0000-4000-8000-000000000002",
  source = "f1340000-0000-4000-8000-000000000003";
function fixture() {
  const csrf = token(),
    raw = token(),
    user = {
      id: actor,
      email: "fictional@example.test",
      is_active: true,
      role: "team_member",
    },
    config = {
      origin: "https://chapter.example.test",
      sessionCookie: "gdg_session",
      riskSecret: "fictional-risk",
    };
  const store = {
    validateSession: async () => ({ sessionId, user }),
    csrf: async () => ({
      token_hash: tokenHash(csrf),
      expires_at: new Date(Date.now() + 60000).toISOString(),
    }),
    rateLimit: vi.fn(async () => ({ allowed: true })),
    accountByEmail: vi.fn(async () => null),
    audit: vi.fn(async () => {}),
  };
  const db = { rpc: vi.fn(async () => ({ data: { id: source } })) },
    app = applicationHandler({ config, store, db });
  async function call(path = "", body, headers = {}, method = "POST") {
    const r = {
      statusCode: 200,
      headers: {},
      setHeader(k, v) {
        this.headers[k.toLowerCase()] = v;
      },
      end(v) {
        this.body = JSON.parse(v);
      },
    };
    await app(
      {
        url: "/api/v1/admin/contact-submissions" + path,
        method,
        body,
        headers: {
          origin: config.origin,
          cookie: "gdg_session=" + raw,
          "x-csrf-token": csrf,
          "content-type": "application/json",
          "idempotency-key": token(),
          ...headers,
        },
      },
      r,
    );
    return r;
  }
  return { call, store, db, user };
}
const status = { action: "status", revision: 1, status: "resolved" },
  hold = {
    action: "hold",
    revision: 1,
    enabled: true,
    reason: "Fictional operational hold",
    confirmation: "HOLD CONTACT",
  };
describe("contact original-outcome routes", () => {
  it("binds status writes to explicit original key, current actor/session and password-free document hash", async () => {
    const f = fixture(),
      key = token();
    expect(
      (await f.call("/" + source, status, { "idempotency-key": key }))
        .statusCode,
    ).toBe(200);
    expect(f.db.rpc).toHaveBeenCalledExactlyOnceWith(
      "mutate_contact_write",
      expect.objectContaining({
        p_actor: actor,
        p_session: sessionId,
        p_id: source,
        p_revision: 1,
        p_action: "status",
        p_document: { status: "resolved" },
        p_key_hash: tokenHash(key),
        p_request_hash: tokenHash(JSON.stringify(status)),
        p_verified_hash: null,
      }),
    );
  });
  it.each([status, hold])(
    "inspection never retains or verifies password proof: $action",
    async (body) => {
      const f = fixture();
      expect((await f.call("/" + source + "/recovery", body)).statusCode).toBe(
        200,
      );
      expect(f.store.accountByEmail).not.toHaveBeenCalled();
      expect(f.db.rpc).toHaveBeenCalledExactlyOnceWith(
        "inspect_contact_write",
        expect.objectContaining({
          p_actor: actor,
          p_session: sessionId,
          p_action: body.action,
          p_request_hash: tokenHash(JSON.stringify(body)),
        }),
      );
    },
  );
  it("requires fresh valid proof for a hold while excluding it from replay hashes", async () => {
    const f = fixture(),
      password = "Fictional current proof",
      hash = await hashSecret(password);
    f.store.accountByEmail.mockResolvedValue({ password_hash: hash });
    expect(
      (await f.call("/" + source, { ...hold, currentPassword: password }))
        .statusCode,
    ).toBe(200);
    expect(f.db.rpc).toHaveBeenCalledWith(
      "mutate_contact_write",
      expect.objectContaining({
        p_verified_hash: hash,
        p_request_hash: tokenHash(JSON.stringify(hold)),
        p_document: {
          enabled: true,
          reason: hold.reason,
          confirmation: hold.confirmation,
        },
      }),
    );
  });
  it("keeps rejected hold proof distinct from denied contact authority", async () => {
    const f = fixture();
    expect(
      (await f.call("/" + source, { ...hold, currentPassword: "incorrect" }))
        .statusCode,
    ).toBe(403);
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it("rejects passwords in inspections and consequence-free hold documents", async () => {
    const f = fixture();
    for (const body of [
      { ...hold, currentPassword: "must not retain" },
      { ...hold, confirmation: "RELEASE HOLD" },
      { ...hold, reason: "" },
      { ...status, revision: 0 },
    ])
      expect((await f.call("/" + source + "/recovery", body)).statusCode).toBe(
        400,
      );
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it("requires explicit keys and CSRF before either receipt or mutation access", async () => {
    const f = fixture();
    for (const suffix of ["", "/recovery"]) {
      expect(
        (await f.call("/" + source + suffix, status, { "idempotency-key": "" }))
          .statusCode,
      ).toBe(400);
      for (const headers of [
        { "x-csrf-token": "" },
        { origin: "https://other.example.test" },
      ])
        expect(
          (await f.call("/" + source + suffix, status, headers)).statusCode,
        ).toBe(403);
    }
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it("does not expose read-only recovery over GET or arbitrary suffixes", async () => {
    const f = fixture();
    expect(
      (await f.call("/" + source + "/recovery", undefined, {}, "GET"))
        .statusCode,
    ).toBe(405);
    expect(
      (await f.call("/" + source + "/unknown", undefined, {}, "GET"))
        .statusCode,
    ).toBe(404);
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it("uses bounded current-account inbox throttling before inspection", async () => {
    const f = fixture();
    f.store.rateLimit.mockResolvedValue({ allowed: false });
    expect((await f.call("/" + source + "/recovery", status)).statusCode).toBe(
      429,
    );
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
});
