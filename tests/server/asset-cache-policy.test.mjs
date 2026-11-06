import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
const config = JSON.parse(
    await readFile(new URL("../../vercel.json", import.meta.url), "utf8"),
  ),
  rules = config.headers.filter((row) => row.source.startsWith("/assets/"));
function policies(file) {
  return rules
    .filter((row) => new RegExp("^" + row.source + "$", "u").test(file))
    .flatMap((row) =>
      row.headers
        .filter((h) => h.key.toLowerCase() === "cache-control")
        .map((h) => h.value),
    );
}
describe("public asset cache lifetime and versioned deployment boundaries", () => {
  it("long-caches only content-hashed Vite JavaScript and CSS without competing cache rules", () => {
    for (const file of [
      "main-CatVxp_1.js",
      "gt-B0Asonyu.js",
      "AdminShell-DnL7IbEZ.js",
      "gt-6l4nkvFU.css",
      "nested/editor-12_-aBCd.js",
    ])
      expect(policies("/assets/" + file)).toEqual([
        "public, max-age=31536000, immutable",
      ]);
  });
  it("revalidates stable artwork, fonts, editor assets and non-hashed filenames", () => {
    for (const file of [
      "hero-atmosphere.webp",
      "hero-campus-mobile.webp",
      "event-workshop.jpg",
      "google-wordmark.png",
      "inter-latin.woff2",
      "excalidraw/fonts/Fictional.woff2",
      "unhashed.js",
      "site.css",
      "file-1234567.js",
      "file-123456789.js",
      "main-CatVxp_1.js.map",
      "main-CatVxp_1.js.png",
    ])
      expect(policies("/assets/" + file)).toEqual([
        "public, max-age=0, must-revalidate",
      ]);
  });
  it("does not accidentally attach public asset caching to application, private or API routes", () => {
    for (const file of [
      "/",
      "/events",
      "/admin",
      "/admin/forms/example/responses",
      "/api/v1/admin/media",
      "/forms/private",
      "/offline.html",
      "/sw.js",
      "/manifest.json",
    ])
      expect(policies(file)).toEqual([]);
  });
});
