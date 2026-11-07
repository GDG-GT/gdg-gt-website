import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import type { Rollup } from "vite";
import {
  publicRouteHints,
  publicRouteModules,
} from "../scripts/public-route-hints";

const facade = fileURLToPath(
  new URL("../src/ui/PublicPages.tsx", import.meta.url),
);
function bundle() {
  return {
    "assets/PublicPages-fixture.js": {
      type: "chunk",
      fileName: "assets/PublicPages-fixture.js",
      facadeModuleId: facade,
      imports: ["assets/shared-fixture.js"],
      dynamicImports: ["assets/AdminShell-fixture.js"],
    },
    "assets/shared-fixture.js": {
      type: "chunk",
      fileName: "assets/shared-fixture.js",
      imports: ["assets/PublicPages-fixture.js"],
    },
    "assets/AdminShell-fixture.js": {
      type: "chunk",
      fileName: "assets/AdminShell-fixture.js",
      imports: [],
    },
  } as unknown as Rollup.OutputBundle;
}
function transform(
  html: string,
  filename: string,
  output?: Rollup.OutputBundle,
) {
  const hook = publicRouteHints().transformIndexHtml;
  if (!hook || typeof hook === "function" || !hook.handler)
    throw Error("Missing post-HTML hook");
  return hook.handler.call({} as never, html, {
    path: "/index.html",
    filename,
    bundle: output,
  });
}
const html =
  '<html><head><script src="/assets/public-entry.js" async fetchpriority="high"></script></head></html>';
describe("Built public route hints", () => {
  it("follows the exact emitted static graph once, including cycles, without dynamic private chunks", () => {
    expect(publicRouteModules(bundle())).toEqual([
      "/assets/PublicPages-fixture.js",
      "/assets/shared-fixture.js",
    ]);
  });
  it("attaches inert asset metadata only to the main HTML helper, preserving async execution", () => {
    expect(transform(html, "/fixture/index.html", bundle())).toBe(
      html.replace(
        'fetchpriority="high"',
        'fetchpriority="high" data-public-modules="/assets/PublicPages-fixture.js /assets/shared-fixture.js"',
      ),
    );
    expect(transform(html, "/fixture/offline.html", bundle())).toBe(html);
    expect(transform(html, "/fixture/index.html")).toBe(html);
  });
  it("refuses a missing public entry, absent dependency and unsafe emitted path", () => {
    expect(() => publicRouteModules({})).toThrow("Public route chunk missing");
    const missing = bundle();
    delete missing["assets/shared-fixture.js"];
    expect(() => publicRouteModules(missing)).toThrow(
      "static dependency missing",
    );
    const unsafe = bundle();
    const entry = unsafe["assets/PublicPages-fixture.js"] as Rollup.OutputChunk;
    entry.imports = ["../private.js"];
    expect(() => publicRouteModules(unsafe)).toThrow(
      "Unsafe public route module path",
    );
  });
  it("refuses absent or duplicate entry helper tags rather than silently omitting the boundary", () => {
    expect(() =>
      transform("<html></html>", "/fixture/index.html", bundle()),
    ).toThrow("exactly one");
    expect(() =>
      transform(html + html, "/fixture/index.html", bundle()),
    ).toThrow("exactly one");
  });
});
