import { describe, it, expect, vi } from "vitest";
import { auditQuery, safeAuditMetadata } from "../../server/workspace.mjs";
import { applicationHandler } from "../../server/handler.mjs";
import { token } from "../../server/lib/security.mjs";
const actor = "f1010000-0000-4000-8000-000000000001",
  sessionId = "f1010000-0000-4000-8000-000000000002";
function fixture(role = "admin") {
  const raw = token(),
    config = {
      origin: "https://chapter.example.test",
      sessionCookie: "__Host-gdg_session",
      riskSecret: "fictional-risk",
    };
  const store = {
    validateSession: vi.fn(async () => ({
      sessionId,
      user: { id: actor, role, is_active: true },
    })),
    authorization: vi.fn(async () => ({ grants: [], memberships: [] })),
    rateLimit: vi.fn(async () => ({ allowed: true })),
  };
  const queries = [],
    db = {
      rpc: vi.fn(async (name, p) => ({
        data:
          name === "list_finances"
            ? { summary: { awaitingApproval: 0 } }
            : p.p_widget === "messages"
              ? { unread: 2 }
              : { items: [] },
      })),
      from(table) {
        const entry = { table, steps: [] },
          q = {};
        queries.push(entry);
        for (const method of [
          "select",
          "eq",
          "neq",
          "order",
          "limit",
          "in",
          "gte",
        ])
          q[method] = (...args) => {
            entry.steps.push([method, ...args]);
            return q;
          };
        q.then = (resolve) =>
          Promise.resolve({ data: [], count: 0 }).then(resolve);
        return q;
      },
    };
  const handler = applicationHandler({ config, store, db });
  async function call({
    anonymous = false,
    method = "GET",
    path = "/admin/dashboard",
  } = {}) {
    const r = {
      statusCode: 200,
      headers: new Map(),
      setHeader(k, v) {
        this.headers.set(k.toLowerCase(), v);
      },
      end(value) {
        this.body = JSON.parse(value);
      },
    };
    await handler(
      {
        method,
        url: "/api/v1" + path,
        headers: {
          origin: config.origin,
          ...(anonymous ? {} : { cookie: config.sessionCookie + "=" + raw }),
        },
      },
      r,
    );
    return r;
  }
  return { call, db, queries, store };
}
describe("audit query boundaries", () => {
  it("bounds pagination and rejects unknown filters", () => {
    expect(auditQuery.parse({})).toMatchObject({ page: 1, pageSize: 30 });
    for (const value of [
      { page: 0 },
      { pageSize: 101 },
      { secret: "x" },
      { actor: "not-an-id" },
      { action: "x,y" },
      { from: "2026-12-01T00:00:00Z", to: "2026-01-01T00:00:00Z" },
      { before: "2026-10-24T00:00:00Z" },
      { beforeId: actor },
      { q: "x),metadata.eq.secret" },
      { at: "invalid" },
    ])
      expect(auditQuery.safeParse(value).success).toBe(false);
  });
  it("omits unapproved text, nested payloads, malicious identifiers and unsafe numeric values from audit metadata", () => {
    expect(
      safeAuditMetadata({
        count: 3,
        revision: 2,
        sensitive: true,
        formId: actor,
        responseId: "not-an-id",
        rawAnswer: "private",
        reason: "private reason",
        email: "private@example.test",
        filters: { password: "private" },
        bytes: -1,
        version: Infinity,
        page: "2",
      }),
    ).toEqual({ count: 3, revision: 2, sensitive: true, formId: actor });
    expect(safeAuditMetadata(null)).toEqual({});
    expect(safeAuditMetadata([1])).toEqual({});
  });
});
describe("editorial overview transport", () => {
  it("passes current session to the scoped editorial aggregate", async () => {
    const f = fixture("blog_editor"),
      r = await f.call({ path: "/admin/blog/overview" });
    expect(r.statusCode).toBe(200);
    expect(f.db.rpc).toHaveBeenCalledWith("read_editorial_overview", {
      p_actor: actor,
      p_session: sessionId,
    });
  });
  it("denies ungranted members and malformed filters or methods before aggregation", async () => {
    const f = fixture("team_member");
    expect((await f.call({ path: "/admin/blog/overview" })).statusCode).toBe(
      403,
    );
    expect(f.db.rpc).not.toHaveBeenCalled();
    const admin = fixture();
    expect(
      (await admin.call({ path: "/admin/blog/overview?all=true" })).statusCode,
    ).toBe(400);
    expect(
      (await admin.call({ path: "/admin/blog/overview", method: "POST" }))
        .statusCode,
    ).toBe(405);
    expect(admin.db.rpc).not.toHaveBeenCalled();
  });
});
describe("dashboard permission and partial-failure boundaries", () => {
  it("requires a session and GET without touching data", async () => {
    const f = fixture();
    expect((await f.call({ anonymous: true })).statusCode).toBe(401);
    expect((await f.call({ method: "POST" })).statusCode).toBe(405);
    expect(f.db.rpc).not.toHaveBeenCalled();
    expect(f.queries).toEqual([]);
  });
  it("reads independently scoped panels with the current actor and session", async () => {
    const f = fixture(),
      r = await f.call();
    expect(r.statusCode).toBe(200);
    expect(r.body.data.widgets.messages).toEqual({
      state: "ready",
      data: { unread: 2 },
    });
    for (const p_widget of ["tasks", "messages", "registrations", "funding"])
      expect(f.db.rpc).toHaveBeenCalledWith("read_workspace_widget", {
        p_actor: actor,
        p_session: sessionId,
        p_widget,
      });
    expect(f.queries.some((q) => q.table === "communication_tasks")).toBe(
      false,
    );
    expect(r.headers.get("cache-control")).toContain("no-store");
  });
  it("does not count unauthorized event/finance data for an editor or ungranted member", async () => {
    for (const role of ["blog_editor", "team_member"]) {
      const f = fixture(role),
        r = await f.call(),
        widgets = r.body.data.widgets;
      expect(widgets.events).toBeUndefined();
      expect(widgets.registrations).toBeUndefined();
      if (role === "blog_editor") expect(widgets.funding).toBeUndefined();
      expect(widgets.messages.state).toBe("ready");
    }
  });
  it("contains one failed panel and redacts provider errors while retaining the other panels", async () => {
    const f = fixture();
    f.db.rpc.mockImplementation(async (name, p) => {
      if (p.p_widget === "registrations")
        return { error: { code: "XX000", message: "private provider trace" } };
      return {
        data:
          name === "list_finances"
            ? { summary: { awaitingApproval: 0 } }
            : { items: [], unread: 0 },
      };
    });
    const r = await f.call();
    expect(r.body.data.widgets.registrations.state).toBe("error");
    expect(r.body.data.widgets.messages.state).toBe("ready");
    expect(r.body.data.widgets.events.state).toBe("ready");
    expect(JSON.stringify(r.body)).not.toContain("private provider trace");
  });
});
