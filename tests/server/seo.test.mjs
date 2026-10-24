import { describe, it, expect, vi } from "vitest";
import { applicationHandler } from "../../server/handler.mjs";
import {
  publicIndexPaths,
  publicDescription,
  publicMetadataPath,
} from "../../shared/public-metadata.ts";
function fixture(pages = [[]]) {
  const queries = [],
    from = vi.fn(() => {
      const steps = [],
        chain = {};
      queries.push(steps);
      for (const name of ["select", "eq", "order", "range"])
        chain[name] = (...args) => {
          steps.push([name, ...args]);
          return chain;
        };
      chain.then = (resolve) => {
        const current = pages[Math.min(queries.length - 1, pages.length - 1)];
        return Promise.resolve(
          current?.error
            ? { data: null, error: current.error }
            : { data: current, error: null },
        ).then(resolve);
      };
      return chain;
    }),
    handler = applicationHandler({
      db: { from },
      store: {},
      config: { origin: "https://chapter.example.test" },
    });
  async function call(path = "/public/sitemap.xml", method = "GET") {
    const r = {
      statusCode: 200,
      headers: new Map(),
      setHeader(name, value) {
        this.headers.set(name.toLowerCase(), value);
      },
      end(value) {
        this.body = value;
      },
    };
    await handler(
      {
        url: "/api/v1" + path,
        method,
        headers: {
          origin: "https://chapter.example.test",
          host: "attacker.example.com",
        },
        socket: { remoteAddress: "127.0.0.1" },
      },
      r,
    );
    return r;
  }
  return { call, from, queries };
}
describe("SEO public-only sitemap and configured-origin robots", () => {
  it("includes canonical static pages and only the published event projection", async () => {
    const f = fixture([
        [{ slug: "fictional-workshop", updated_at: "2026-10-24T12:00:00Z" }],
      ]),
      r = await f.call();
    expect(r.statusCode).toBe(200);
    expect(r.headers.get("content-type")).toContain("application/xml");
    for (const path of publicIndexPaths)
      expect(r.body).toContain(
        `<loc>https://chapter.example.test${path}</loc>`,
      );
    expect(r.body).toContain("/events/fictional-workshop</loc>");
    expect(r.body).toContain("<lastmod>2026-10-24T12:00:00.000Z</lastmod>");
    expect(f.queries[0]).toEqual([
      ["select", "slug,updated_at"],
      ["eq", "publication_status", "published"],
      ["order", "id"],
      ["range", 0, 999],
    ]);
    for (const path of [
      "/admin",
      "/forms/",
      "/blog",
      "/projects",
      "/account/",
      "/newsletter/",
      "attacker.example.com",
    ])
      expect(r.body).not.toContain(path);
  });
  it("walks every bounded event page rather than silently truncating at 100 or 1000", async () => {
    const first = Array.from({ length: 1000 }, (_, i) => ({
      slug: "fictional-event-" + i,
      updated_at: "invalid",
    }));
    const f = fixture([
        first,
        [{ slug: "fictional-final-event", updated_at: null }],
      ]),
      r = await f.call();
    expect(r.statusCode).toBe(200);
    expect(r.body).toContain("fictional-final-event");
    expect(f.queries[1]).toContainEqual(["range", 1000, 1999]);
    expect(r.body).not.toContain("<lastmod>");
  });
  it("drops malformed slugs and fails closed before exceeding safe sitemap bounds", async () => {
    const f = fixture([
      [
        { slug: "bad<script>", updated_at: "now" },
        { slug: "../admin", updated_at: "now" },
      ],
    ]);
    const r = await f.call();
    expect(r.body).not.toContain("bad&lt;script");
    expect(r.body).not.toContain("../admin");
    const large = fixture([
      Array.from({ length: 1000 }, (_, i) => ({
        slug: "fictional-" + i,
        updated_at: null,
      })),
    ]);
    expect((await large.call()).statusCode).toBe(503);
  });
  it("uses configured origin for robots without leaking names, private content or request-host input", async () => {
    const f = fixture(),
      r = await f.call("/public/robots.txt");
    expect(r.body).toContain(
      "Sitemap: https://chapter.example.test/sitemap.xml",
    );
    expect(r.body).toContain("Disallow: /admin");
    expect(r.body).not.toContain("attacker.example.com");
    expect(r.body).not.toContain("gdgpsu");
    expect(f.from).not.toHaveBeenCalled();
    expect((await f.call("/public/robots.txt", "HEAD")).body).toBeUndefined();
  });
  it("allows HEAD, rejects mutations and does not expose database failure messages", async () => {
    const f = fixture();
    expect((await f.call(undefined, "HEAD")).body).toBeUndefined();
    expect((await f.call(undefined, "POST")).statusCode).toBe(405);
    const failed = fixture([
        { error: { code: "XX000", message: "private database detail" } },
      ]),
      r = await failed.call();
    expect(r.statusCode).toBe(503);
    expect(r.body).not.toContain("private database detail");
    expect(r.headers.get("cache-control")).toContain("no-store");
  });
  it("supplies distinct public descriptions and strips trailing slash variants", () => {
    expect(new Set(publicIndexPaths.map(publicDescription)).size).toBe(
      publicIndexPaths.length,
    );
    expect(publicMetadataPath("/resources/")).toBe("/resources");
    expect(publicMetadataPath("/")).toBe("/");
    expect(publicDescription("/events/fictional")).toContain("registration");
    expect(publicDescription("/unknown")).not.toContain("PSU");
  });
});
