import { describe, expect, it, vi } from "vitest";
import { projectRecord, projectCreate } from "../../shared/projects.mjs";
import { applicationHandler } from "../../server/handler.mjs";
import { token, tokenHash } from "../../server/lib/security.mjs";
const actor = "f5000000-0000-4000-8000-000000000001",
  sessionId = "f5000000-0000-4000-8000-000000000002",
  id = "f5000000-0000-4000-8000-000000000003";
const record = () =>
  projectRecord.parse({
    title: "Fictional project",
    description: "Private plain description",
  });
function fixture() {
  const csrf = token(),
    raw = token(),
    config = {
      origin: "https://chapter.example.test",
      sessionCookie: "__Host-gdg_session",
      riskSecret: "fictional-risk",
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
    accountByEmail: vi.fn(async () => null),
  };
  const db = { rpc: vi.fn(async () => ({ data: { id } })) },
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
        url: "/api/v1/admin/projects" + path,
        method,
        body,
        headers: {
          origin: config.origin,
          cookie: config.sessionCookie + "=" + raw,
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
  return { call, db, store };
}
describe("private project validation", () => {
  it("validates calendar dates and chronological ranges", () => {
    for (const change of [
      { start_date: "2026-02-30" },
      { start_date: "2026-10-21", end_date: "2026-10-20" },
    ])
      expect(projectRecord.safeParse({ ...record(), ...change }).success).toBe(
        false,
      );
    expect(
      projectRecord.safeParse({ ...record(), start_date: "2028-02-29" })
        .success,
    ).toBe(true);
  });
  it("rejects counter/ownership injection and unsafe destinations", () => {
    for (const change of [
      { stars_count: 99 },
      { created_by: actor },
      { demo_url: "javascript:alert(1)" },
      { github_url: "https://example.com/?token=secret" },
      { image_url: "http://127.0.0.1/a.png" },
    ])
      expect(projectRecord.safeParse({ ...record(), ...change }).success).toBe(
        false,
      );
    expect(
      projectCreate.safeParse({
        record: record(),
        teamId: null,
        createdBy: actor,
      }).success,
    ).toBe(false);
  });
  it("bounds arrays and rejects case-insensitive duplicate labels", () => {
    for (const change of [
      { tech_stack: ["React", "react"] },
      { tags: Array(31).fill("x") },
      { team_size: 0 },
      { status: "public" },
    ])
      expect(projectRecord.safeParse({ ...record(), ...change }).success).toBe(
        false,
      );
  });
});
describe("private project HTTP boundaries", () => {
  it("checks origin and CSRF before business work", async () => {
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
  it("derives identity and session, rejects forged ownership", async () => {
    const f = fixture();
    expect(
      (await f.call("", { record: record(), teamId: null, actor })).statusCode,
    ).toBe(400);
    expect(
      (await f.call("", { record: record(), teamId: null })).statusCode,
    ).toBe(200);
    expect(f.db.rpc).toHaveBeenCalledExactlyOnceWith(
      "mutate_private_project",
      expect.objectContaining({
        p_actor: actor,
        p_session: sessionId,
        p_action: "create",
        p_verified_hash: null,
        p_document: { record: record(), teamId: null },
      }),
    );
  });
  it("passes bounded filters without widening scope", async () => {
    const f = fixture();
    expect(
      (
        await f.call(
          "?q=private&featured=false&status=active",
          undefined,
          {},
          "GET",
        )
      ).statusCode,
    ).toBe(200);
    expect(f.db.rpc).toHaveBeenCalledWith("list_private_projects", {
      p_actor: actor,
      p_query: "private",
      p_page: 1,
      p_state: "current",
      p_featured: false,
      p_status: "active",
      p_category: null,
    });
    expect(
      (await f.call("?page=1&page=2", undefined, {}, "GET")).statusCode,
    ).toBe(400);
  });
  it("denies quota, invalid member actions, delete and missing confirmation", async () => {
    const f = fixture();
    expect(
      (
        await f.call("/" + id + "/members", {
          action: "update",
          revision: 1,
          record: record(),
        })
      ).statusCode,
    ).toBe(400);
    expect((await f.call("/" + id, {}, {}, "DELETE")).statusCode).toBe(405);
    expect(
      (
        await f.call("/" + id, {
          action: "archive",
          revision: 1,
          currentPassword: "wrong",
          confirmation: "Fictional project",
        })
      ).statusCode,
    ).toBe(403);
    f.store.rateLimit.mockResolvedValue({ allowed: false, retryAfter: 30 });
    const r = await f.call("", { record: record(), teamId: null });
    expect(r.statusCode).toBe(429);
    expect(r.headers["retry-after"]).toBe("30");
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
});
