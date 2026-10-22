import { describe, it, expect } from "vitest";
import {
  entryAssets,
  offlinePrecacheAssets,
} from "../../scripts/lib/build-graph.mjs";
describe("PWA-TEST-006: bounded offline build graph", () => {
  const manifest = {
    "offline.html": {
      file: "assets/offline-hash.js",
      imports: ["react"],
      css: ["assets/offline-hash.css"],
      dynamicImports: ["editor"],
    },
    react: { file: "assets/react-hash.js", assets: ["assets/font.woff2"] },
    editor: { file: "assets/private-editor-hash.js" },
    home: { file: "assets/home-hash.js" },
  };
  it("includes every static offline dependency but no dynamic editor or unrelated route", () => {
    expect([...entryAssets(manifest, "offline.html")]).toEqual([
      "assets/offline-hash.js",
      "assets/offline-hash.css",
      "assets/react-hash.js",
      "assets/font.woff2",
    ]);
    const cache = offlinePrecacheAssets(manifest);
    expect(cache.has("offline.html")).toBe(true);
    expect(cache.has("assets/private-editor-hash.js")).toBe(false);
    expect(cache.has("assets/home-hash.js")).toBe(false);
  });
  it("fails closed on missing or unsafe dependencies and terminates cyclic imports", () => {
    expect(() => entryAssets({}, "offline.html")).toThrow();
    expect(() =>
      entryAssets({ entry: { file: "../private.txt" } }, "entry"),
    ).toThrow();
    expect([
      ...entryAssets(
        {
          a: { file: "assets/a.js", imports: ["b"] },
          b: { file: "assets/b.js", imports: ["a"] },
        },
        "a",
      ),
    ]).toEqual(["assets/a.js", "assets/b.js"]);
  });
});
