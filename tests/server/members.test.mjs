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
      "mutate_community_member_write",
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
      "mutate_member_merge_write",
      expect.objectContaining({
        p_actor: actor,
        p_session: sessionId,
        p_action: "preview",
        p_document: body,
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
      "mutate_member_merge_write",
      expect.objectContaining({
        p_actor: actor,
        p_session: sessionId,
        p_action: "commit",
        p_document: {
          reviewId: source,
          sourceConfirmation: "MEM-source",
          targetConfirmation: "MEM-target",
        },
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

describe("source-bound merge reads and complete creation destinations", () => {
  const destinations = (count) =>
    Array.from({ length: count }, (_, i) => ({
      id: "f8320000-0000-4000-8000-" + String(i + 1).padStart(12, "0"),
      name: "Fictional destination " + i,
      privateExtra: "must not project",
    }));
  const reader = (f, read) => {
    f.user.role = "admin";
    f.db.rpc.mockImplementation(async (name, args) => ({
      data: name === "can_operate_member" ? true : await read(name, args),
    }));
  };
  it("returns all 107 current permitted destinations across both pages without extra fields", async () => {
    const f = fixture(),
      teams = destinations(107);
    reader(f, async (name, args) => ({
      items: teams.slice((args.p_page - 1) * 100, args.p_page * 100),
      total: 107,
    }));
    const r = await f.call("/capabilities", undefined, {}, "GET");
    expect(r.statusCode).toBe(200);
    expect(r.body.data.teams).toHaveLength(107);
    expect(r.body.data.teams[106]).toEqual({
      id: teams[106].id,
      name: teams[106].name,
    });
    expect(
      f.db.rpc.mock.calls
        .filter(([name]) => name === "member_creation_destinations")
        .map(([, args]) => args),
    ).toEqual(
      [1, 2].map((page) => ({
        p_actor: actor,
        p_session: sessionId,
        p_page: page,
      })),
    );
  });
  it("returns an empty permitted inventory without manufacturing chapter creation rights", async () => {
    const f = fixture();
    f.db.rpc.mockImplementation(async (name) => ({
      data: name === "can_operate_member" ? false : { items: [], total: 0 },
    }));
    const r = await f.call("/capabilities", undefined, {}, "GET");
    expect(r.body.data).toEqual({
      globalCreate: false,
      merge: false,
      teams: [],
    });
  });
  it.each([
    null,
    { items: [] },
    { items: [], total: -1 },
    { items: [], total: 1.1 },
  ])("refuses malformed destination metadata %j", async (value) => {
    const f = fixture();
    reader(f, async () => value);
    expect(
      (await f.call("/capabilities", undefined, {}, "GET")).statusCode,
    ).toBe(503);
  });
  it("refuses a destination inventory above the safe bound instead of silently truncating it", async () => {
    const f = fixture();
    reader(f, async () => ({ items: destinations(100), total: 10001 }));
    const r = await f.call("/capabilities", undefined, {}, "GET");
    expect(r.statusCode).toBe(409);
    expect(r.body.error.code).toBe("INVENTORY_LIMIT");
  });
  it("refuses short, changed-count and repeated-page destination snapshots", async () => {
    for (const mode of ["short", "count", "duplicate"]) {
      const f = fixture();
      reader(f, async (name, args) => ({
        items:
          mode === "short"
            ? destinations(1)
            : args.p_page === 1
              ? destinations(100)
              : destinations(1),
        total: mode === "count" && args.p_page === 2 ? 102 : 101,
      }));
      expect(
        (await f.call("/capabilities", undefined, {}, "GET")).statusCode,
      ).toBe(409);
    }
  });
  it("binds candidate paging/search to the current actor/session and source before projecting names", async () => {
    const f = fixture(),
      result = {
        items: [
          {
            id: target,
            name: "Fictional eligible target",
            email: "fictional-target@example.test",
          },
        ],
        total: 65,
        page: 3,
        pageSize: 30,
        sourceRevision: 2,
      };
    reader(f, async () => result);
    const r = await f.call(
      "/" + source + "/merge-candidates?page=3&q=Fictional",
      undefined,
      {},
      "GET",
    );
    expect(r.statusCode).toBe(200);
    expect(r.body.data).toEqual(result);
    expect(f.db.rpc).toHaveBeenCalledWith("member_merge_candidates", {
      p_actor: actor,
      p_session: sessionId,
      p_source: source,
      p_page: 3,
      p_query: "Fictional",
    });
    expect(f.store.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "members.merge_candidates_viewed",
        targetId: source,
        metadata: { count: 1, filterHash: expect.any(String) },
      }),
    );
  });
  it("loads a selected target through the source-bound RPC even when it is outside the visible candidate page", async () => {
    const f = fixture();
    reader(f, async () => ({
      member: { id: target, name: "Fictional selected target" },
      sourceRevision: 4,
    }));
    const r = await f.call(
      "/" + source + "/merge-target/" + target,
      undefined,
      {},
      "GET",
    );
    expect(r.statusCode).toBe(200);
    expect(f.db.rpc).toHaveBeenCalledWith("member_merge_target", {
      p_actor: actor,
      p_session: sessionId,
      p_source: source,
      p_target: target,
    });
  });
  it("conceals candidate and target lookup from ordinary members before database work", async () => {
    for (const suffix of ["/merge-candidates", "/merge-target/" + target]) {
      const f = fixture();
      expect(
        (await f.call("/" + source + suffix, undefined, {}, "GET")).statusCode,
      ).toBe(404);
      expect(f.db.rpc).not.toHaveBeenCalled();
    }
  });
  it("rejects forged scope, duplicate search keys and invalid pagination", async () => {
    for (const query of [
      "?ownerId=" + actor,
      "?q=a&q=b",
      "?page=0",
      "?page=10001",
    ]) {
      const f = fixture();
      f.user.role = "admin";
      expect(
        (
          await f.call(
            "/" + source + "/merge-candidates" + query,
            undefined,
            {},
            "GET",
          )
        ).statusCode,
      ).toBe(400);
      expect(f.db.rpc).not.toHaveBeenCalled();
    }
  });
  it("refuses write methods and incomplete/extra selection subpaths", async () => {
    const f = fixture();
    f.user.role = "admin";
    expect(
      (await f.call("/" + source + "/merge-candidates", {}, {})).statusCode,
    ).toBe(405);
    for (const suffix of [
      "/merge-target",
      "/activity/" + target,
      "/merge-candidates/" + target,
    ])
      expect(
        (await f.call("/" + source + suffix, undefined, {}, "GET")).statusCode,
      ).toBe(404);
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
});

describe("ordinary member original-outcome recovery route", () => {
  it("inspects the exact create document/key read-only under current session and CSRF", async () => {
    const f = fixture();
    f.db.rpc.mockResolvedValue({
      data: {
        committed: false,
        canRetry: true,
        currentRevision: 0,
        receipt: null,
      },
    });
    const r = await f.call("/recovery", { record: record(), teamId: null });
    expect(r.statusCode).toBe(200);
    expect(f.db.rpc).toHaveBeenCalledExactlyOnceWith(
      "inspect_community_member_write",
      expect.objectContaining({
        p_actor: actor,
        p_session: sessionId,
        p_id: null,
        p_action: "create",
        p_document: { record: record(), teamId: null },
      }),
    );
  });
  it("inspection requires no retained password and never verifies or mutates the actor proof", async () => {
    const f = fixture();
    const body = { action: "archive", revision: 3, confirmation: "FICTIONAL" };
    const r = await f.call("/" + source + "/recovery", body);
    expect(r.statusCode).toBe(200);
    expect(f.store.accountByEmail).not.toHaveBeenCalled();
    expect(f.db.rpc).toHaveBeenCalledWith(
      "inspect_community_member_write",
      expect.objectContaining({
        p_id: source,
        p_action: "archive",
        p_revision: 3,
        p_document: body,
      }),
    );
  });
  it("refuses a supplied password in inspection and does not allow GET recovery", async () => {
    const f = fixture();
    expect(
      (
        await f.call("/" + source + "/recovery", {
          action: "archive",
          revision: 1,
          confirmation: "FICTIONAL",
          currentPassword: "must not retain",
        })
      ).statusCode,
    ).toBe(400);
    expect((await f.call("/recovery", undefined, {}, "GET")).statusCode).toBe(
      405,
    );
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it("rejects recovery with missing CSRF or changed origin before receipt lookup", async () => {
    const f = fixture();
    for (const headers of [
      { "x-csrf-token": "" },
      { origin: "https://other.example.test" },
    ])
      expect(
        (await f.call("/recovery", { record: record(), teamId: null }, headers))
          .statusCode,
      ).toBe(403);
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
});

describe("merge original outcome inspection", () => {
  const preview = {
      sourceId: source,
      targetId: target,
      sourceRevision: 1,
      targetRevision: 1,
    },
    proof = "f".repeat(43),
    commit = {
      reviewId: source,
      reviewToken: proof,
      sourceConfirmation: "MEM-source",
      targetConfirmation: "MEM-target",
    };
  it.each([
    ["merge-preview", preview],
    ["merge", commit],
  ])(
    "inspects original %s without checking password or mutating",
    async (kind, body) => {
      const f = fixture();
      f.user.role = "admin";
      f.db.rpc.mockResolvedValue({
        data: { committed: false, canRetry: true, receipt: null },
      });
      expect((await f.call("/" + kind + "/recovery", body)).statusCode).toBe(
        200,
      );
      expect(f.store.accountByEmail).not.toHaveBeenCalled();
      expect(f.db.rpc).toHaveBeenCalledExactlyOnceWith(
        "inspect_member_merge_write",
        expect.objectContaining({
          p_actor: actor,
          p_session: sessionId,
          p_action: kind === "merge" ? "commit" : "preview",
        }),
      );
    },
  );
  it("restores deterministic preview capability only after current authorized inspection", async () => {
    const f = fixture();
    f.user.role = "admin";
    const headers = { "idempotency-key": "fictional-stable-merge-key" };
    f.db.rpc
      .mockResolvedValueOnce({ data: { reviewId: source } })
      .mockResolvedValueOnce({
        data: {
          committed: true,
          canRetry: false,
          receipt: { reviewId: source },
        },
      });
    const a = await f.call("/merge-preview", preview, headers),
      b = await f.call("/merge-preview/recovery", preview, headers);
    expect(b.body.data.receipt.reviewToken).toBe(a.body.data.reviewToken);
    expect(JSON.stringify(f.db.rpc.mock.calls)).not.toContain(
      a.body.data.reviewToken,
    );
  });
  it("rejects retained passwords, absent keys, missing CSRF, and wrong origin before inspecting", async () => {
    const f = fixture();
    f.user.role = "admin";
    expect(
      (
        await f.call("/merge/recovery", {
          ...commit,
          currentPassword: "retained",
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await f.call("/merge/recovery", commit, { "idempotency-key": "" }))
        .statusCode,
    ).toBe(400);
    for (const headers of [
      { "x-csrf-token": "" },
      { origin: "https://other.example.test" },
    ])
      expect(
        (await f.call("/merge/recovery", commit, headers)).statusCode,
      ).toBe(403);
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it("does not expose merge receipts to ordinary team accounts", async () => {
    const f = fixture();
    expect((await f.call("/merge/recovery", commit)).statusCode).toBe(403);
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it("allows neither GET recovery nor extra recovery path segments", async () => {
    const f = fixture();
    f.user.role = "admin";
    expect(
      (await f.call("/merge/recovery", undefined, {}, "GET")).statusCode,
    ).toBe(405);
    expect((await f.call("/merge/recovery/" + target, commit)).statusCode).toBe(
      404,
    );
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
});
