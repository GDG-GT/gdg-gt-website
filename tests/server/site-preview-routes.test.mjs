import { describe, expect, it, vi } from "vitest";
import { applicationHandler } from "../../server/handler.mjs";
import { token } from "../../server/lib/security.mjs";
function fixture({ allowed = true, overflow = false } = {}) {
  const raw = token(),
    config = {
      origin: "https://chapter.example.test",
      sessionCookie: "__Host-gdg_session",
    },
    queries = [];
  const records = {
    site_settings: [
      {
        key: "site_title",
        value: "Fictional draft title",
        is_active: false,
        password_hash: "private",
      },
      { key: "not_allowed", value: "secret" },
    ],
    page_content: [
      {
        page_slug: "home",
        section_key: "hero",
        content: { title: "Fictional draft hero" },
        is_active: false,
      },
      { page_slug: "blog", section_key: "hero", content: { title: "private" } },
    ],
    navigation_items: [
      {
        id: "f1060000-0000-4000-8000-000000000001",
        label: "Resources",
        href: "/resources",
        is_active: true,
      },
      { label: "Private", href: "/admin" },
    ],
    social_links: [],
    footer_content: [
      {
        section_key: "about",
        content: { description: "Fictional chapter" },
        is_active: true,
      },
    ],
  };
  const store = {
    validateSession: async () => ({
      sessionId: "f1060000-0000-4000-8000-000000000002",
      user: {
        id: "f1060000-0000-4000-8000-000000000003",
        role: "team_member",
        is_active: true,
      },
    }),
    audit: vi.fn(async () => {}),
  };
  const db = {
    rpc: vi.fn(async () => ({ data: allowed })),
    from(table) {
      const steps = [],
        q = {};
      queries.push({ table, steps });
      for (const name of ["select", "is", "in", "limit"])
        q[name] = (...args) => {
          steps.push([name, ...args]);
          return q;
        };
      q.then = (resolve) =>
        Promise.resolve({
          data:
            overflow && table === "page_content"
              ? Array(101).fill(records.page_content[0])
              : records[table],
        }).then(resolve);
      return q;
    },
  };
  const handler = applicationHandler({ config, db, store });
  async function call(path = "", { anonymous = false, method = "GET" } = {}) {
    const r = {
      statusCode: 200,
      headers: new Map(),
      setHeader(k, v) {
        this.headers.set(k.toLowerCase(), v);
      },
      end(v) {
        this.body = JSON.parse(v);
      },
    };
    await handler(
      {
        url: "/api/v1/admin/site-content/preview" + path,
        method,
        headers: {
          origin: config.origin,
          ...(anonymous ? {} : { cookie: config.sessionCookie + "=" + raw }),
        },
      },
      r,
    );
    return r;
  }
  return { call, db, store, queries };
}
describe("CONTENT-TEST private page composition preview", () => {
  it("requires current read permission and a session before reading saved drafts", async () => {
    const f = fixture();
    expect((await f.call("", { anonymous: true })).statusCode).toBe(401);
    expect(f.queries).toEqual([]);
    const denied = fixture({ allowed: false });
    expect((await denied.call()).statusCode).toBe(403);
    expect(denied.queries).toEqual([]);
  });
  it("returns only curated draft/saved public fields, never editor metadata or arbitrary settings", async () => {
    const f = fixture(),
      r = await f.call("?page=home");
    expect(r.statusCode).toBe(200);
    expect(r.body.data.pages[0].content.title).toBe("Fictional draft hero");
    expect(r.body.data.settings).toEqual([
      { key: "site_title", value: "Fictional draft title", description: "" },
    ]);
    expect(r.body.data.navigation).toHaveLength(1);
    expect(r.body.data.draftCount).toBe(2);
    expect(r.body.data.omitted).toBe(3);
    expect(JSON.stringify(r.body)).not.toContain("password_hash");
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.headers.get("x-robots-tag")).toContain("noindex");
    for (const q of f.queries)
      expect(q.steps).toContainEqual(["is", "deleted_at", null]);
    expect(f.store.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "site_content.previewed",
        metadata: { count: 2 },
      }),
    );
  });
  it("fails closed on unbounded inventory, unknown pages/filters and mutation", async () => {
    expect((await fixture({ overflow: true }).call()).statusCode).toBe(400);
    const f = fixture();
    for (const path of ["?page=blog", "?page=home&page=team", "?token=private"])
      expect((await f.call(path)).statusCode).toBe(400);
    expect((await f.call("", { method: "POST" })).statusCode).toBe(405);
    expect(f.queries).toEqual([]);
  });
});
