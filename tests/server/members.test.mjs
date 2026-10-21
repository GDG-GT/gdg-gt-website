import { describe, expect, it, vi } from "vitest";
import {
  communityMemberRecord,
  communityMemberCreate,
  memberMergePreview,
  memberMergeCommit,
} from "../../shared/members.mjs";
import { applicationHandler } from "../../server/handler.mjs";
import { token, tokenHash, hashSecret } from "../../server/lib/security.mjs";
const actor = "f8000000-0000-4000-8000-000000000001",
  sessionId = "f8000000-0000-4000-8000-000000000002",
  source = "f8000000-0000-4000-8000-000000000003",
  target = "f8000000-0000-4000-8000-000000000004";
const record = () =>
  communityMemberRecord.parse({
    name: "Fictional person",
    email: "fictional@example.test",
  });
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
        url: "/api/v1/admin/members" + path,
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
describe("private community member schemas", () => {
  it("normalizes emails without creating any account role", () => {
    expect(
      communityMemberRecord.parse({
        ...record(),
        email: "  FICTIONAL@EXAMPLE.TEST  ",
      }).email,
    ).toBe("fictional@example.test");
    expect(
      communityMemberRecord.safeParse({ ...record(), role: "admin" }).success,
    ).toBe(false);
    expect(
      communityMemberCreate.safeParse({
        record: record(),
        teamId: null,
        createdBy: actor,
      }).success,
    ).toBe(false);
  });
  it("bounds private fields and preserves commas within one interest", () => {
    for (const fields of [
      { interests: ["Web", "web"] },
      { interests: ["two\nlines"] },
      { phone: "x".repeat(51) },
      { category: "super_admin" },
      { is_core_team: "yes" },
    ])
      expect(
        communityMemberRecord.safeParse({ ...record(), ...fields }).success,
      ).toBe(false);
    expect(
      communityMemberRecord.safeParse({
        ...record(),
        interests: ["Web, AI", "Community"],
      }).success,
    ).toBe(true);
  });
  it("requires distinct records and purpose-shaped merge proof", () => {
    expect(
      memberMergePreview.safeParse({
        sourceId: source,
        targetId: source,
        sourceRevision: 1,
        targetRevision: 1,
      }).success,
    ).toBe(false);
    expect(
      memberMergeCommit.safeParse({
        reviewId: source,
        reviewToken: "short",
        sourceConfirmation: "x",
        targetConfirmation: "y",
        currentPassword: "fictional",
      }).success,
    ).toBe(false);
  });
});
describe("community member HTTP boundaries", () => {
  it("rejects cross-origin and missing CSRF before business work", async () => {
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
  it("derives actor/session and rejects client ownership/account injection", async () => {
    const f = fixture();
    expect(
      (
        await f.call("", {
          record: { ...record(), admin_user_id: actor },
          teamId: null,
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await f.call("", { record: record(), teamId: null })).statusCode,
    ).toBe(200);
    expect(f.db.rpc).toHaveBeenCalledExactlyOnceWith(
      "mutate_community_member",
      expect.objectContaining({
        p_actor: actor,
        p_session: sessionId,
        p_action: "create",
        p_id: null,
        p_document: { record: record(), teamId: null },
      }),
    );
  });
  it("keeps private search values out of audit metadata", async () => {
    const f = fixture();
    f.db.rpc.mockResolvedValue({ data: { items: [], total: 0 } });
    const r = await f.call(
      "?q=private-person%40example.test",
      undefined,
      {},
      "GET",
    );
    expect(r.statusCode).toBe(200);
    expect(f.store.audit).toHaveBeenCalledOnce();
    expect(JSON.stringify(f.store.audit.mock.calls)).not.toContain(
      "private-person@example.test",
    );
    expect(r.headers["cache-control"]).toContain("no-store");
  });
  it("denies ordinary-account merge review before inspecting records", async () => {
    const f = fixture();
    expect(
      (
        await f.call("/merge-preview", {
          sourceId: source,
          targetId: target,
          sourceRevision: 1,
          targetRevision: 1,
        })
      ).statusCode,
    ).toBe(403);
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it("returns a stable session-bound preview token but sends only its hash to SQL", async () => {
    const f = fixture();
    f.user.role = "admin";
    const body = {
        sourceId: source,
        targetId: target,
        sourceRevision: 1,
        targetRevision: 1,
      },
      headers = { "idempotency-key": "fictional-member-preview-key" };
    f.db.rpc.mockResolvedValue({ data: { reviewId: source } });
    const a = await f.call("/merge-preview", body, headers),
      b = await f.call("/merge-preview", body, headers);
    expect(a.body.data.reviewToken).toMatch(/^[a-zA-Z0-9_-]{43}$/);
    expect(a.body.data.reviewToken).toBe(b.body.data.reviewToken);
    expect(JSON.stringify(f.db.rpc.mock.calls)).not.toContain(
      a.body.data.reviewToken,
    );
    expect(f.db.rpc).toHaveBeenCalledWith(
      "preview_member_merge",
      expect.objectContaining({
        p_actor: actor,
        p_session: sessionId,
        p_source: source,
        p_target: target,
        p_token_hash: tokenHash(a.body.data.reviewToken),
      }),
    );
  });
  it("strips password and raw proof from commit persistence inputs", async () => {
    const f = fixture();
    f.user.role = "admin";
    const password = "Fictional-verified-member-password",
      proof = token();
    f.store.accountByEmail.mockResolvedValue({
      password_hash: await hashSecret(password),
    });
    const r = await f.call("/merge", {
      reviewId: source,
      reviewToken: proof,
      sourceConfirmation: "MEM-source",
      targetConfirmation: "MEM-target",
      currentPassword: password,
    });
    expect(r.statusCode).toBe(200);
    const calls = JSON.stringify(f.db.rpc.mock.calls);
    expect(calls).not.toContain(password);
    expect(calls).not.toContain(proof);
    expect(f.db.rpc).toHaveBeenCalledWith(
      "commit_member_merge",
      expect.objectContaining({
        p_actor: actor,
        p_session: sessionId,
        p_review: source,
        p_token_hash: tokenHash(proof),
      }),
    );
  });
  it("rejects incorrect password before member mutation RPC", async () => {
    const f = fixture();
    const r = await f.call("/" + source, {
      action: "archive",
      revision: 1,
      currentPassword: "fictional-wrong",
      confirmation: "MEM-fictional",
    });
    expect(r.statusCode).toBe(403);
    expect(r.body.error.code).toBe("PASSWORD_REQUIRED");
    expect(f.db.rpc).not.toHaveBeenCalled();
    expect(JSON.stringify(r.body)).not.toContain("fictional-wrong");
  });
  it("fails closed on quotas, duplicate filters and unconfirmed delete", async () => {
    const f = fixture();
    expect(
      (await f.call("?page=1&page=2", undefined, {}, "GET")).statusCode,
    ).toBe(400);
    expect(
      (
        await f.call(
          "/" + source,
          { action: "update", revision: 1, record: record() },
          {},
          "DELETE",
        )
      ).statusCode,
    ).toBe(400);
    f.store.rateLimit.mockResolvedValue({ allowed: false, retryAfter: 30 });
    expect(
      (await f.call("", { record: record(), teamId: null })).statusCode,
    ).toBe(429);
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
});
