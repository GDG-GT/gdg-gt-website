import { describe, expect, it, vi } from "vitest";
import { siteDocument } from "../../server/site-document.mjs";
import { renderSiteDocument } from "../../shared/site-document.mjs";
import { createSiteDocumentHandler } from "../../api/site.mjs";
const origin = "https://chapter.example.test",
  template =
    '<!doctype html><html lang="en"><head><title>Original</title><meta name="description" content="old"><meta property="og:title" content="old"></head><body><div id="root"></div><script type="module" src="/assets/app.js"></script></body></html>';
function fixture(rows = {}) {
  const queries = [],
    db = {
      rpc: vi.fn(async () => ({ data: null })),
      from(table) {
        const steps = [],
          q = {};
        queries.push({ table, steps });
        for (const name of ["select", "eq", "is"])
          q[name] = (...args) => {
            steps.push([name, ...args]);
            return q;
          };
        q.maybeSingle = async () => ({ data: rows[table] || null });
        return q;
      },
    };
  return { db, queries, config: { origin } };
}
describe("SEO-TEST public document projections", () => {
  it("projects published page copy with configured canonical URLs and factual organization data", async () => {
    const f = fixture({
        page_content: {
          content: {
            title: "Fictional <chapter>",
            description: "Safe <b>chapter</b> description",
          },
        },
      }),
      doc = await siteDocument({ ...f, pathname: "/" });
    expect(doc).toMatchObject({
      status: 200,
      index: true,
      heading: "Fictional",
      canonical: origin + "/",
    });
    expect(doc.description).toBe("Safe chapter description");
    expect(doc.structuredData["@type"]).toBe("Organization");
    expect(f.queries[0].steps).toContainEqual(["eq", "is_active", true]);
    expect(f.queries[0].steps).toContainEqual(["is", "deleted_at", null]);
  });
  it("keeps private and capability workflows generic and noindex without any database lookup", async () => {
    const f = fixture();
    for (const pathname of [
      "/admin",
      "/admin/forms/private/edit",
      "/forms/private-form",
      "/account/setup",
      "/team/join",
      "/newsletter/confirm",
      "/offline",
      "/maintenance",
    ]) {
      const doc = await siteDocument({ ...f, pathname });
      expect(doc).toMatchObject({ status: 200, index: false });
      expect(doc.title).not.toContain("private-form");
    }
    expect(f.queries).toEqual([]);
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it("returns real 404 documents for unknown, retired and unpublished event routes", async () => {
    const f = fixture();
    for (const pathname of [
      "/missing",
      "/blog",
      "/projects",
      "/events/not-published",
    ]) {
      expect((await siteDocument({ ...f, pathname })).status).toBe(404);
    }
    expect(f.queries.find((q) => q.table === "events").steps).toContainEqual([
      "eq",
      "publication_status",
      "published",
    ]);
  });
  it("projects only published event metadata and safe image/structured content", async () => {
    const f = fixture({
        events: {
          id: "event",
          slug: "fictional-event",
          title: 'Fictional "event"',
          short_description: "About </script><script>private</script>",
          description: "Fictional event description",
          start_at: "2026-11-01T18:00:00Z",
          end_at: null,
          location: "Test venue",
          timezone: "America/New_York",
          image_url: "javascript:alert(1)",
        },
      }),
      doc = await siteDocument({ ...f, pathname: "/events/fictional-event" });
    expect(doc).toMatchObject({
      status: 200,
      index: true,
      image: origin + "/logo.png",
      event: { location: "Test venue" },
    });
    expect(doc.structuredData.startDate).toBe("2026-11-01T18:00:00Z");
    expect(doc.structuredData).not.toHaveProperty("offers");
    expect(doc.structuredData.location).not.toHaveProperty("address");
  });
  it("redirects an old slug only to a currently published safe destination", async () => {
    const f = fixture({ event_slug_redirects: { event_id: "fixture" } });
    let n = 0;
    f.db.from = (table) => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({
          data:
            table === "event_slug_redirects"
              ? { event_id: "fixture" }
              : ++n === 1
                ? null
                : { slug: "new-event" },
        }),
      };
      return q;
    };
    expect(
      await siteDocument({ ...f, pathname: "/events/old-event" }),
    ).toMatchObject({ status: 308, redirect: "/events/new-event" });
  });
  it("emits the stored previous start date and rescheduled state in raw published metadata", async () => {
    const f = fixture({
      events: {
        id: "fictional",
        slug: "rescheduled",
        title: "Fictional rescheduled",
        description: "Local fixture",
        start_at: "2030-02-02T18:00:00Z",
        previous_start_at: "2030-02-01T18:00:00Z",
        location: "Fictional venue",
        timezone: "America/New_York",
      },
    });
    const doc = await siteDocument({ ...f, pathname: "/events/rescheduled" });
    expect(doc.structuredData).toMatchObject({
      eventStatus: "https://schema.org/EventRescheduled",
      previousStartDate: "2030-02-01T18:00:00Z",
      startDate: "2030-02-02T18:00:00Z",
    });
    expect(doc.canonical).toBe(origin + "/events/rescheduled");
  });
  it("rejects traversal/control-bearing metadata requests before reads and fails closed on database errors", async () => {
    const f = fixture();
    for (const pathname of [
      "https://outside.example/",
      "/bad?secret=1",
      "/bad#token",
      "/bad\\path",
      "/bad\npath",
    ]) {
      await expect(siteDocument({ ...f, pathname })).rejects.toThrow();
    }
    expect(f.queries).toEqual([]);
    f.db.from = () => ({
      select() {
        return this;
      },
      eq() {
        return this;
      },
      is() {
        return this;
      },
      maybeSingle: async () => ({
        error: { code: "XX000", message: "private provider trace" },
      }),
    });
    await expect(siteDocument({ ...f, pathname: "/team" })).rejects.toThrow();
  });
  it("escapes HTML/JSON-LD and replaces duplicate template metadata without removing the application entry", () => {
    const html = renderSiteDocument(template, {
      title: 'X " onload="evil',
      description: "<unsafe>",
      heading: "<script>alert(1)</script>",
      body: "<img src=x onerror=x>",
      canonical: origin + "/resources",
      image: origin + "/logo.png",
      index: true,
      links: [{ href: "/events", label: "Events <" }],
      structuredData: { name: "</script><script>evil</script>" },
    });
    expect(html.match(/<title>/g)).toHaveLength(1);
    expect(html.match(/name="description"/g)).toHaveLength(1);
    expect(html).toContain('src="/assets/app.js"');
    expect(html).toContain("\\u003c/script\\u003e");
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&quot; onload=&quot;evil");
    expect(() => renderSiteDocument("invalid", {})).toThrow(
      "Invalid document template",
    );
  });
});
describe("SEO-TEST production HTML handler", () => {
  function handler(f = fixture()) {
    const loadTemplate = vi.fn(async () => template),
      call = createSiteDocumentHandler({
        configFactory: () => f.config,
        databaseFactory: () => f.db,
        loadTemplate,
      });
    return {
      loadTemplate,
      async run(url, method = "GET") {
        const r = {
          statusCode: 200,
          headers: new Map(),
          setHeader(k, v) {
            this.headers.set(k.toLowerCase(), v);
          },
          end(v) {
            this.body = v;
          },
        };
        await call(
          { url, method, headers: { host: "poison.example.test" } },
          r,
        );
        return r;
      },
    };
  }
  it("serves per-route raw HTML, genuine 404 and noindex private shells without trusting Host", async () => {
    const f = handler(),
      r = await f.run("/api/site?__route=/resources&page=2");
    expect(r.statusCode).toBe(200);
    expect(r.body).toContain("Resources · GDG");
    expect(r.body).toContain(origin + "/resources");
    expect(r.body).not.toContain("poison.example.test");
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect((await f.run("/missing")).statusCode).toBe(404);
    expect((await f.run("/admin")).headers.get("x-robots-tag")).toContain(
      "noindex",
    );
    expect(f.loadTemplate).toHaveBeenCalledOnce();
  });
  it("returns HEAD without HTML, rejects mutation and repeated rewrite parameters", async () => {
    const f = handler();
    expect((await f.run("/resources", "HEAD")).body).toBeUndefined();
    expect((await f.run("/resources", "POST")).statusCode).toBe(405);
    expect((await f.run("/api/site?__route=/&__route=/admin")).statusCode).toBe(
      400,
    );
  });
  it("serves a redacted retryable 503 when public metadata cannot be loaded", async () => {
    const f = fixture();
    f.db.from = () => {
      throw Error("private provider trace");
    };
    const r = await handler(f).run("/team");
    expect(r.statusCode).toBe(503);
    expect(r.body).not.toContain("private provider trace");
    expect(r.headers.get("retry-after")).toBe("30");
  });
});
