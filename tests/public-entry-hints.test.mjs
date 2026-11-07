import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
const source = readFileSync(
  new URL("../public/assets/public-entry.js", import.meta.url),
  "utf8",
);
function run(pathname, publicModules = "") {
  const hints = [];
  const context = {
    location: { pathname },
    document: {
      currentScript: { dataset: { publicModules } },
      createElement: (tag) => {
        expect(tag).toBe("link");
        return {};
      },
      head: { append: (node) => hints.push(node) },
    },
  };
  runInNewContext(source, context, { timeout: 1000 });
  return { hints, globals: Object.keys(context) };
}
describe("Route-aware public image hints", () => {
  it.each([
    "/events",
    "/contact",
    "/team",
    "/admin",
    "/forms/fictional",
    "/maintenance",
    "/l/fictional",
    "/missing",
  ])("does not fetch home artwork on %s", (path) => {
    expect(run(path).hints).toEqual([]);
  });
  it("hints only the two public home variants with mutually exclusive media, without shared globals", () => {
    const { hints, globals } = run("/");
    expect(hints).toEqual([
      {
        rel: "preload",
        as: "image",
        fetchPriority: "high",
        media: "(min-width: 481px)",
        href: "/assets/hero-atmosphere.webp",
      },
      {
        rel: "preload",
        as: "image",
        fetchPriority: "high",
        media: "(max-width: 480px)",
        href: "/assets/hero-atmosphere-mobile.webp",
      },
    ]);
    expect(globals.sort()).toEqual(["document", "location"]);
  });
  it.each([
    "/events",
    "/events/fictional-event",
    "/team",
    "/resources",
    "/sponsors",
    "/gallery",
    "/contact",
    "/privacy",
    "/accessibility",
    "/offline",
  ])(
    "starts only the built public modules on %s without home artwork",
    (pathname) => {
      expect(
        run(
          pathname,
          "/assets/PublicPages-fixture.js /assets/public-shared-fixture.js",
        ).hints,
      ).toEqual([
        {
          rel: "modulepreload",
          href: "/assets/PublicPages-fixture.js",
          crossOrigin: "anonymous",
        },
        {
          rel: "modulepreload",
          href: "/assets/public-shared-fixture.js",
          crossOrigin: "anonymous",
        },
      ]);
    },
  );
  it.each([
    "/admin",
    "/admin/events",
    "/forms/fictional",
    "/maintenance",
    "/l/fictional",
    "/events-not-a-route",
    "/contact/extra",
    "/missing",
  ])(
    "does not prefetch public route modules from %s even with valid build metadata",
    (pathname) =>
      expect(run(pathname, "/assets/PublicPages-fixture.js").hints).toEqual([]),
  );
  it("refuses external, private endpoint, query and traversal module targets", () => {
    const targets = [
      "https://outside.example.test/script.js",
      "//outside.example.test/script.js",
      "/api/v1/admin/me",
      "/assets/../private.js",
      "/assets/chunk.js?key=fictional",
      "/assets/PublicPages-fixture.js",
    ];
    expect(run("/events", targets.join(" ")).hints).toEqual([
      {
        rel: "modulepreload",
        href: "/assets/PublicPages-fixture.js",
        crossOrigin: "anonymous",
      },
    ]);
  });
});
