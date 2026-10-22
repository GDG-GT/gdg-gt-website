import { describe, it, expect, vi } from "vitest";
import {
  routeTemplate,
  withRequestTelemetry,
  recordActor,
  timeDependency,
  requestRecord,
  requestCounters,
  createTelemetryLogger,
} from "../../server/lib/telemetry.mjs";
import { apiBoundary, ApiError } from "../../server/lib/http.mjs";
import { cspReport, operationsRoutes } from "../../server/operations.mjs";
import { isAuthorized } from "../../server/lib/authorization.mjs";
const id = "f9700000-0000-4000-8000-000000000001";
const response = () => ({
  statusCode: 200,
  setHeader() {},
  end(value) {
    this.body = JSON.parse(value);
  },
});
describe("OPS-TEST-001: privacy-preserving request telemetry", () => {
  it("serializes only route vocabulary, never slugs, queries, tokens or arbitrary paths", () => {
    expect(
      routeTemplate(
        "/api/v1/forms/fictional-sensitive-slug/submissions?token=never-log",
      ),
    ).toBe("/api/v1/forms/:slug/submissions");
    expect(
      routeTemplate(`/api/v1/admin/forms/${id}/responses/${id}/history`),
    ).toBe("/api/v1/admin/forms/:id/responses/:id/history");
    expect(routeTemplate("/api/v1/auth/sessions/never-log-token")).toBe(
      "/api/v1/auth/sessions/:id",
    );
    for (const url of [
      "/api/v1/never-log-secret",
      "/private/never-log-secret",
      "/api/v1/admin/never-log-secret?email=never-log-email",
      "/api/v1/jobs/never-log-secret",
    ])
      expect(routeTemplate(url)).not.toContain("never-log");
  });
  it("isolates concurrent actors/dependencies and measures failures without retaining exception text", async () => {
    const a = withRequestTelemetry(async () => {
      recordActor(id);
      await expect(
        timeDependency("database", async () => {
          throw Error("never-log-provider-secret");
        }),
      ).rejects.toThrow();
      return requestRecord(
        { url: "/api/v1/admin/privacy", method: "GET" },
        { statusCode: 503 },
        id,
        performance.now(),
        "TEMPORARILY_UNAVAILABLE",
        { NODE_ENV: "test" },
      );
    });
    const b = withRequestTelemetry(async () => {
      recordActor("never-log-invalid-id");
      await timeDependency("storage", async () => true);
      return requestRecord(
        { url: "/api/v1/contact", method: "POST" },
        { statusCode: 200 },
        id,
        performance.now(),
        undefined,
        { NODE_ENV: "test" },
      );
    });
    const [first, second] = await Promise.all([a, b]);
    expect(first.actorId).toBe(id);
    expect(first.dependencies.database.failures).toBe(1);
    expect(first.dependencies.storage).toBeUndefined();
    expect(second.actorId).toBeUndefined();
    expect(second.dependencies.database).toBeUndefined();
    expect(second.dependencies.storage.count).toBe(1);
    expect(JSON.stringify([first, second])).not.toContain("never-log");
  });
  it("API boundary logs required safe fields and never request/response/error payloads", async () => {
    const records = [],
      req = {
        url: "/api/v1/auth/login?token=never-log-query",
        method: "POST",
        headers: { authorization: "never-log-header" },
        body: { password: "never-log-password" },
      },
      res = response();
    await apiBoundary(
      req,
      res,
      async () => {
        throw new ApiError(401, "AUTH_REQUIRED", "Safe user-facing error");
      },
      { log: async (value) => records.push(value) },
    );
    expect(records[0]).toMatchObject({
      routeTemplate: "/api/v1/auth/login",
      method: "POST",
      status: 401,
      authorization: "unauthenticated",
      errorCode: "AUTH_REQUIRED",
      dependencies: {},
    });
    expect(records[0].timestamp).toMatch(/^\d{4}-/);
    expect(records[0].requestId).toMatch(/^[a-f0-9-]{36}$/);
    expect(records[0].latencyMs).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(records)).not.toContain("never-log");
    await apiBoundary(
      req,
      response(),
      async () => {
        throw new ApiError(500, "NEVER_LOG_ARBITRARY_CODE", "never-log-error");
      },
      { log: (value) => records.push(value) },
    );
    expect(records[1].errorCode).toBe("API_ERROR");
  });
  it("counter derivation is category-only and recognizes actual response-limit errors", () => {
    expect(
      requestCounters({
        routeTemplate: "/api/v1/forms/:slug/submissions",
        status: 409,
        errorCode: "FORM_FULL",
        dependencies: { database: { failures: 2, maxMs: 800 } },
      }),
    ).toEqual({
      requests: 1,
      form_rejections: 1,
      form_limits: 1,
      database_failures: 2,
      database_slow: 1,
    });
  });
  it("telemetry outages cannot replace a completed API response", async () => {
    const sink = vi.fn(),
      db = {
        rpc: () => ({
          abortSignal: async () => {
            throw Error("never-log-db-error");
          },
        }),
      },
      res = response();
    await apiBoundary(
      { url: "/api/v1/contact", method: "POST" },
      res,
      async () => res.end('{"data":{"saved":true}}'),
      { log: createTelemetryLogger({ db, sink }) },
    );
    expect(res.body.data.saved).toBe(true);
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink.mock.calls[0][0]).not.toContain("never-log");
  });
});
describe("OPS-TEST-002: monitoring boundaries and CSP reports", () => {
  it("strips report URLs, source samples and other identifying metadata", () => {
    const legacy = cspReport.parse({
      "csp-report": {
        "effective-directive": "script-src",
        "document-uri": "https://example.test/never-log?token=secret",
        "script-sample": "never-log-private-data",
      },
    });
    expect(legacy).toEqual({
      "csp-report": { "effective-directive": "script-src" },
    });
    expect(
      cspReport.safeParse(
        Array(11).fill({
          type: "csp-violation",
          body: { effectiveDirective: "script-src" },
        }),
      ).success,
    ).toBe(false);
  });
  it("operations is Super Admin-only regardless of forged page/action grants", () => {
    for (const role of ["admin", "team_member", "blog_editor"])
      expect(
        isAuthorized({
          user: { id, role, is_active: true },
          resource: "operations",
          route: "/admin/operations",
          grants: [
            {
              resource: "operations",
              route: "/admin/operations",
              page_access: true,
              actions: ["view"],
            },
          ],
        }),
      ).toBe(false);
    expect(
      isAuthorized({
        user: { id, role: "super_admin", is_active: true },
        resource: "operations",
      }),
    ).toBe(true);
  });
  it("accepts only bounded same-origin CSP counters, not raw report persistence", async () => {
    const db = { rpc: vi.fn(async () => ({ data: true })) },
      store = { rateLimit: vi.fn(async () => ({ allowed: true })) },
      res = response(),
      config = {
        origin: "https://chapter.example.test",
        riskSecret: "fixture-secret",
      };
    const req = {
      url: "/api/v1/csp-reports",
      method: "POST",
      headers: {
        origin: config.origin,
        "content-type": "application/csp-report; charset=utf-8",
      },
      body: {
        "csp-report": {
          "effective-directive": "connect-src",
          "blocked-uri": "never-log-private",
        },
      },
      socket: { remoteAddress: "127.0.0.1" },
    };
    expect(
      await operationsRoutes(req, res, { db, store, config, requestId: id }),
    ).toBe(true);
    expect(db.rpc).toHaveBeenCalledWith("record_operational_metrics", {
      p_counts: { csp_violations: 1 },
    });
    expect(JSON.stringify(db.rpc.mock.calls)).not.toContain("never-log");
    await expect(
      operationsRoutes(
        {
          ...req,
          headers: { ...req.headers, origin: "https://attacker.example" },
        },
        response(),
        { db, store, config, requestId: id },
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
});
