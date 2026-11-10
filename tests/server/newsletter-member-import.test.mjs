import { describe, expect, it, vi } from "vitest";
import { newsletterMemberImportRoutes } from "../../server/newsletter-member-import.mjs";
import { tokenHash } from "../../server/lib/security.mjs";
const actor = "f1510000-0000-4000-8000-000000000001",
  sessionId = "f1510000-0000-4000-8000-000000000002",
  member = "f1510000-0000-4000-8000-000000000003",
  csrf = "b".repeat(43);
function fixture(role = "super_admin") {
  const db = {
      rpc: vi.fn(async () => ({ data: { created: 1, emailsQueued: 0 } })),
    },
    store = {
      validateSession: vi.fn(async () => ({
        sessionId,
        user: { id: actor, role, is_active: true },
      })),
      csrf: vi.fn(async () => ({
        token_hash: tokenHash(csrf),
        expires_at: new Date(Date.now() + 60000).toISOString(),
      })),
      rateLimit: vi.fn(async () => ({ allowed: true })),
    };
  const response = {
    setHeader() {},
    end(body) {
      this.body = JSON.parse(body);
    },
  };
  async function call(method = "GET", body = {}, headers = {}) {
    await newsletterMemberImportRoutes(
      {
        method,
        url: "/api/v1/admin/newsletter/member-import",
        headers: {
          cookie: "fixture=" + "a".repeat(43),
          "content-type": "application/json",
          "x-csrf-token": csrf,
          "idempotency-key": "fixture-import-key",
          ...headers,
        },
        body,
      },
      response,
      {
        db,
        store,
        config: {
          origin: "https://gdggt.dev",
          sessionCookie: "fixture",
          riskSecret: "fictional-risk",
        },
        requestId: member,
      },
    );
    return response.body;
  }
  return { db, store, call };
}
describe("newsletter member import boundary", () => {
  it("requires a chapter Super Admin for both reading and writing", async () => {
    const f = fixture("admin");
    await expect(f.call()).rejects.toMatchObject({ status: 403 });
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it("previews through the current signed-in session without writing", async () => {
    const f = fixture();
    await f.call();
    expect(f.db.rpc).toHaveBeenCalledExactlyOnceWith(
      "preview_newsletter_member_import",
      { p_actor: actor, p_session: sessionId },
    );
    expect(f.store.csrf).not.toHaveBeenCalled();
  });
  it("records explicit consent and a stable retry identity, with no caller sender or destination", async () => {
    const f = fixture();
    await f.call("POST", {
      memberIds: [member],
      consentAcknowledged: true,
      consentNote: "Chapter signup consent already collected",
    });
    expect(f.db.rpc).toHaveBeenCalledExactlyOnceWith(
      "import_newsletter_members",
      expect.objectContaining({
        p_member_ids: [member],
        p_consent_note: "Chapter signup consent already collected",
        p_key_hash: tokenHash(actor + ":fixture-import-key"),
      }),
    );
  });
  it.each([
    { consentAcknowledged: false },
    { memberIds: [member, member] },
    { teamId: member },
    { email: "injected@example.test" },
    { state: "active" },
  ])("rejects unreviewed parameters: %j", async (extra) => {
    const f = fixture();
    await expect(
      f.call("POST", {
        memberIds: [member],
        consentAcknowledged: true,
        consentNote: "Chapter signup consent already collected",
        ...extra,
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it("requires CSRF before a mutation", async () => {
    const f = fixture();
    await expect(
      f.call("POST", {}, { "x-csrf-token": "invalid" }),
    ).rejects.toMatchObject({ status: 403 });
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
});
