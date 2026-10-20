import { describe, expect, it, vi } from "vitest";
import { applicationHandler } from "../../server/handler.mjs";
import { token, tokenHash } from "../../server/lib/security.mjs";
const actor = "ef000000-0000-4000-8000-000000000001",
  sessionId = "ef000000-0000-4000-8000-000000000002",
  thread = "ef000000-0000-4000-8000-000000000003";
function fixture() {
  const raw = token(),
    csrf = token(),
    config = {
      origin: "https://chapter.example.test",
      sessionCookie: "__Host-gdg_session",
      riskSecret: "fictional-risk-secret",
    };
  const store = {
    validateSession: async () => ({
      sessionId,
      user: {
        id: actor,
        email: "fictional@example.test",
        is_active: true,
        role: "team_member",
      },
    }),
    csrf: async () => ({
      token_hash: tokenHash(csrf),
      expires_at: new Date(Date.now() + 60000).toISOString(),
    }),
    rateLimit: vi.fn(async () => ({ allowed: true })),
  };
  const db = { rpc: vi.fn(async () => ({ data: { id: thread } })) },
    app = applicationHandler({ config, store, db });
  async function call(path, body, headers = {}, method = "POST") {
    const r = {
      statusCode: 200,
      setHeader() {},
      end(value) {
        this.body = JSON.parse(value);
      },
    };
    await app(
      {
        url: "/api/v1/admin/communications/messages" + path,
        method,
        body,
        headers: {
          origin: config.origin,
          cookie: config.sessionCookie + "=" + raw,
          "content-type": "application/json",
          "x-csrf-token": csrf,
          "idempotency-key": token(),
          ...headers,
        },
      },
      r,
    );
    return r;
  }
  return { call, db, store, csrf };
}
describe("protected direct-message dispatch", () => {
  it("rejects cross-origin and missing CSRF requests before business work", async () => {
    const f = fixture();
    expect(
      (await f.call("", {}, { origin: "https://other.example.test" }))
        .statusCode,
    ).toBe(403);
    expect((await f.call("", {}, { "x-csrf-token": "" })).body.error.code).toBe(
      "CSRF_INVALID",
    );
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it("derives sender and session and applies both send quotas before recipient lookup", async () => {
    const f = fixture(),
      r = await f.call("", {
        recipientEmail: "other@example.test",
        subject: "Fictional subject",
        message: "Fictional body",
      });
    expect(r.statusCode).toBe(200);
    expect(f.store.rateLimit.mock.calls.map((c) => c[0])).toEqual([
      "messages.write",
      "messages.send",
      "messages.send.daily",
    ]);
    expect(f.db.rpc).toHaveBeenCalledWith(
      "mutate_direct_message",
      expect.objectContaining({
        p_actor: actor,
        p_session: sessionId,
        p_action: "create",
        p_thread: null,
        p_document: expect.not.objectContaining({
          from_user_id: expect.anything(),
        }),
      }),
    );
  });
  it("denies review requests for ordinary accounts without a password lookup", async () => {
    const f = fixture();
    expect(
      (
        await f.call("/review", {
          action: "start",
          reason: "Fictional review reason",
          currentPassword: "fictional",
        })
      ).statusCode,
    ).toBe(403);
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it("fails closed on write limits without looking up the recipient", async () => {
    const f = fixture();
    f.store.rateLimit.mockResolvedValue({ allowed: false, retryAfter: 60 });
    expect(
      (
        await f.call("", {
          recipientEmail: "other@example.test",
          subject: "Subject",
          message: "Body",
        })
      ).statusCode,
    ).toBe(429);
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it("rejects ownership injection, duplicate queries and methods", async () => {
    const f = fixture();
    expect(
      (
        await f.call("", {
          recipientEmail: "other@example.test",
          subject: "Subject",
          message: "Body",
          from_user_id: actor,
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await f.call("?scope=own&scope=review", undefined, {}, "GET"))
        .statusCode,
    ).toBe(400);
    expect((await f.call("/" + thread, {}, {}, "DELETE")).statusCode).toBe(405);
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
});
