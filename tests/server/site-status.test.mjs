import { describe, expect, it, vi } from "vitest";
import {
  maintenanceDestination,
  siteStatusFields,
  siteStatusChange,
  maintenanceExemptPath,
} from "../../shared/site-status.mjs";
import { applicationHandler } from "../../server/handler.mjs";
import { token, tokenHash } from "../../server/lib/security.mjs";
const record = {
  is_live: false,
  message: "Fictional maintenance",
  redirect_url: "",
  button_text: "Chapter updates",
  auto_redirect: false,
};
describe("maintenance routing contracts", () => {
  it("rejects unsafe destinations and internal loops", () => {
    for (const v of [
      "/",
      "/maintenance",
      "/admin",
      "//evil.example",
      "javascript:alert(1)",
      "https://evil.example/",
      "https://gatech.edu.evil.example/",
      "https://gatech.edu/?next=https://evil.example/",
      "https://user@gatech.edu/",
    ])
      expect(maintenanceDestination.safeParse(v).success).toBe(false);
    for (const v of [
      "",
      "/l/fictional-links",
      "https://www.gatech.edu/",
      "https://gdg.community.dev/fictional-chapter/",
    ])
      expect(maintenanceDestination.safeParse(v).success).toBe(true);
  });
  it("limits automatic redirection to local profiles and exact typed states", () => {
    expect(
      siteStatusFields.safeParse({
        ...record,
        redirect_url: "https://www.gatech.edu/",
        auto_redirect: true,
      }).success,
    ).toBe(false);
    expect(
      siteStatusChange.safeParse({
        revision: 1,
        record,
        currentPassword: "fictional",
        confirmation: "LIVE",
      }).success,
    ).toBe(false);
    expect(
      siteStatusChange.safeParse({
        revision: 1,
        record,
        currentPassword: "fictional",
        confirmation: "MAINTENANCE",
      }).success,
    ).toBe(true);
  });
  it("keeps officer, privacy and token escape routes available without broad prefix bypasses", () => {
    for (const p of [
      "/admin",
      "/admin/profile",
      "/admin/invite/fictional",
      "/maintenance",
      "/offline",
      "/privacy",
      "/accessibility",
      "/newsletter/unsubscribe",
      "/l/fictional",
    ])
      expect(maintenanceExemptPath(p)).toBe(true);
    for (const p of [
      "/administer",
      "/events",
      "/forms/fictional",
      "/l/fictional/more",
      "/projects",
    ])
      expect(maintenanceExemptPath(p)).toBe(false);
  });
});
function fixture() {
  const csrf = token(),
    raw = token(),
    actor = "f7000000-0000-4000-8000-000000000001",
    config = {
      origin: "https://chapter.example.test",
      sessionCookie: "gdg_session",
      riskSecret: "fictional-risk",
    };
  const store = {
    validateSession: async () => ({
      sessionId: actor,
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
  const db = { rpc: vi.fn(async () => ({ data: { revision: 1, ...record } })) },
    app = applicationHandler({ config, store, db });
  async function call(path, body, headers = {}, method = "GET") {
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
        url: "/api/v1" + path,
        method,
        body,
        headers: {
          origin: config.origin,
          cookie: "gdg_session=" + raw,
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
  return { call, store, db };
}
describe("site availability HTTP boundaries", () => {
  it("keeps inactive maintenance copy empty while the site is live", async () => {
    const f = fixture();
    f.db.rpc.mockResolvedValue({
      data: { ...record, is_live: true, message: "", revision: 1 },
    });
    const r = await f.call("/site-status");
    expect(r.statusCode).toBe(200);
    expect(r.body.data.message).toBe("");
  });
  it("health remains independent of database configuration", async () => {
    const f = fixture();
    expect((await f.call("/health")).body.data).toEqual({ ok: true });
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it("returns only the safe public configuration without caching", async () => {
    const f = fixture(),
      r = await f.call("/site-status");
    expect(r.statusCode).toBe(200);
    expect(r.body.data).toEqual({ revision: 1, ...record });
    expect(r.headers["cache-control"]).toContain("no-store");
  });
  it("rejects unsafe stored public configuration rather than redirecting", async () => {
    const f = fixture();
    f.db.rpc.mockResolvedValue({
      data: { revision: 1, ...record, redirect_url: "https://evil.example/" },
    });
    expect((await f.call("/site-status")).statusCode).toBe(503);
  });
  it("requires origin and CSRF before state-change work", async () => {
    const f = fixture();
    expect(
      (
        await f.call(
          "/admin/site-status",
          {},
          { origin: "https://other.example.test" },
          "PATCH",
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (await f.call("/admin/site-status", {}, { "x-csrf-token": "" }, "PATCH"))
        .body.error.code,
    ).toBe("CSRF_INVALID");
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it("checks the action grant before looking up the password", async () => {
    const f = fixture();
    f.db.rpc.mockResolvedValue({ data: false });
    expect(
      (
        await f.call(
          "/admin/site-status",
          {
            record,
            revision: 1,
            currentPassword: "fictional",
            confirmation: "MAINTENANCE",
          },
          {},
          "PATCH",
        )
      ).statusCode,
    ).toBe(403);
    expect(f.store.accountByEmail).not.toHaveBeenCalled();
  });
  it("rejects quotas, duplicate queries and unsupported methods", async () => {
    const f = fixture();
    expect((await f.call("/site-status?a=1&a=2")).statusCode).toBe(400);
    expect(
      (await f.call("/admin/site-status", {}, {}, "DELETE")).statusCode,
    ).toBe(405);
    f.store.rateLimit.mockResolvedValue({ allowed: false, retryAfter: 60 });
    expect(
      (await f.call("/admin/site-status", {}, {}, "PATCH")).statusCode,
    ).toBe(429);
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
});
