import { describe, expect, it, vi } from "vitest";
import { applicationHandler } from "../../server/handler.mjs";
import { token } from "../../server/lib/security.mjs";
const actor = "f1050000-0000-4000-8000-000000000001",
  id = "f1050000-0000-4000-8000-000000000002";
function fixture(role = "admin") {
  const raw = token(),
    config = {
      origin: "https://chapter.example.test",
      sessionCookie: "__Host-gdg_session",
    },
    rows = [
      {
        id,
        action: "forms.exported",
        actor_id: actor,
        created_at: "2026-10-20T00:00:00Z",
        result: "success",
        request_id: actor,
        metadata: {
          count: 3,
          responseId: id,
          rawAnswer: "private respondent content",
          credential: "private",
        },
      },
      {
        id: actor,
        action: "forms.exported",
        actor_id: actor,
        created_at: "2026-10-19T00:00:00Z",
        result: "success",
      },
    ],
    queries = [];
  const result = { data: rows, count: 2, error: null };
  const store = {
    validateSession: vi.fn(async () => ({
      sessionId: id,
      user: { id: actor, role, is_active: true },
    })),
    audit: vi.fn(async () => {}),
  };
  const db = {
    rpc: vi.fn(async () => ({
      data: {
        total: 2,
        success: 2,
        denied: 0,
        failure: 0,
        actions: [],
        retention: { minimumYears: 2, automaticPurge: false },
      },
    })),
    from(table) {
      const steps = [],
        chain = {};
      queries.push({ table, steps });
      for (const method of [
        "select",
        "eq",
        "lte",
        "gte",
        "or",
        "order",
        "range",
      ])
        chain[method] = (...args) => {
          steps.push([method, ...args]);
          return chain;
        };
      chain.maybeSingle = async () => ({
        ...result,
        data: result.data[0] || null,
      });
      chain.then = (resolve) => Promise.resolve(result).then(resolve);
      return chain;
    },
  };
  const handler = applicationHandler({ config, store, db });
  async function call(path = "", { method = "GET", anonymous = false } = {}) {
    const r = {
      statusCode: 200,
      headers: new Map(),
      chunks: [],
      setHeader(k, v) {
        this.headers.set(k.toLowerCase(), v);
      },
      write(v) {
        this.chunks.push(v);
      },
      end(v) {
        if (v) this.body = JSON.parse(v);
      },
    };
    await handler(
      {
        method,
        url: "/api/v1/admin/audit" + path,
        headers: {
          origin: config.origin,
          ...(anonymous ? {} : { cookie: config.sessionCookie + "=" + raw }),
        },
      },
      r,
    );
    return r;
  }
  return { call, queries, db, store, result };
}
describe("AUDIT-TEST actual application route boundaries", () => {
  it("denies anonymous readers and both unprivileged roles, with no data access", async () => {
    const f = fixture();
    expect((await f.call("", { anonymous: true })).statusCode).toBe(401);
    for (const role of ["team_member", "blog_editor"]) {
      const member = fixture(role);
      expect((await member.call()).statusCode).toBe(403);
      expect((await member.call("/" + id)).statusCode).toBe(403);
      expect(member.queries).toEqual([]);
      expect(member.db.rpc).not.toHaveBeenCalled();
    }
    expect(f.queries).toEqual([]);
  });
  it("builds stable composite cursors from a bounded page and the fixed snapshot", async () => {
    const f = fixture(),
      at = "2026-10-24T00:00:00Z",
      r = await f.call("?pageSize=1&at=" + at);
    expect(r.statusCode).toBe(200);
    expect(r.body.data.items).toHaveLength(1);
    expect(r.body.data.nextCursor).toEqual({
      before: "2026-10-20T00:00:00Z",
      beforeId: id,
      at,
    });
    expect(f.queries[0].steps).toContainEqual(["range", 0, 1]);
    expect(f.queries[0].steps).toContainEqual([
      "order",
      "id",
      { ascending: false },
    ]);
    expect(f.queries[0].steps[0][1]).not.toContain("metadata");
    expect(f.db.rpc).toHaveBeenCalledWith("read_audit_statistics", {
      p_actor: actor,
      p_filter: { at },
    });
    const next = await f.call(
      "?pageSize=1&" + new URLSearchParams(r.body.data.nextCursor),
    );
    expect(next.statusCode).toBe(200);
    expect(f.queries[1].steps).toContainEqual([
      "or",
      `created_at.lt.2026-10-20T00:00:00Z,and(created_at.eq.2026-10-20T00:00:00Z,id.lt.${id})`,
    ]);
  });
  it("uses the same exact filters for statistics, safe search and history", async () => {
    const f = fixture(),
      r = await f.call(
        "?q=forms_export&action=forms.exported&actor=" +
          actor +
          "&result=success",
      );
    expect(r.statusCode).toBe(200);
    expect(f.queries[0].steps).toContainEqual([
      "or",
      "action.ilike.*forms\\_export*,target_type.ilike.*forms\\_export*",
    ]);
    expect(f.db.rpc.mock.calls[0][1].p_filter).toMatchObject({
      q: "forms_export",
      action: "forms.exported",
      actor,
      result: "success",
    });
    expect(f.store.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "audit.viewed" }),
    );
  });
  it("projects only approved metadata for an individually audited detail", async () => {
    const f = fixture(),
      r = await f.call("/" + id);
    expect(r.statusCode).toBe(200);
    expect(r.body.data.record.metadata).toEqual({ count: 3, responseId: id });
    expect(JSON.stringify(r.body)).not.toContain("private");
    expect(f.store.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "audit.detail_viewed", targetId: id }),
    );
    f.result.data = [];
    expect((await f.call("/" + id)).statusCode).toBe(404);
  });
  it("rejects mutation, malformed/half cursors, unsafe search and repeated filters before reads", async () => {
    const f = fixture();
    for (const path of [
      "?before=2026-10-20T00:00:00Z",
      "?q=x),metadata.eq.raw",
      "?result=success&result=denied",
      "?pageSize=101",
      "/" + id + "?q=forms",
    ])
      expect((await f.call(path)).statusCode).toBe(400);
    for (const method of ["POST", "PATCH", "DELETE"])
      expect((await f.call("/" + id, { method })).statusCode).toBe(405);
    expect(f.queries).toEqual([]);
  });
  it("exports the full filtered snapshot rather than only the displayed cursor page", async () => {
    const f = fixture(),
      r = await f.call(
        "/export?action=forms.exported&before=2026-10-20T00:00:00Z&beforeId=" +
          id,
      );
    expect(r.statusCode).toBe(200);
    expect(r.headers.get("content-type")).toContain("text/csv");
    expect(r.chunks.join("")).toContain("forms.exported");
    expect(r.chunks.join("")).not.toContain("private respondent content");
    expect(
      f.queries.flatMap((q) => q.steps).some((step) => step[0] === "or"),
    ).toBe(false);
    expect(f.store.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "audit.exported" }),
    );
    f.result.count = 10001;
    expect((await f.call("/export")).statusCode).toBe(400);
  });
});
