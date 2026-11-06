import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
const source = readFileSync(
  new URL("../public/assets/public-entry.js", import.meta.url),
  "utf8",
);
function run(pathname) {
  const hints = [];
  const context = {
    location: { pathname },
    document: {
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
});
