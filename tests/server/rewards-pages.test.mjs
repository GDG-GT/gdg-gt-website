import { describe, expect, it, vi } from "vitest";
import {
  rewardsPagePaths,
  publicRewardsOrigin,
} from "../../shared/rewards-pages.mjs";
import { createSiteDocumentHandler } from "../../api/site.mjs";

describe("Leaderboard host boundaries", () => {
  it("exposes root member pages only on the dedicated host, with loopback previews", () => {
    expect(rewardsPagePaths("leaderboards.gdggt.dev")).toEqual({
      home: "/",
      member: "/member",
    });
    expect(rewardsPagePaths("127.0.0.1")).toEqual({
      home: "/leaderboard",
      member: "/leaderboard/member",
    });
    expect(rewardsPagePaths("gdggt.dev")).toBeNull();
    expect(rewardsPagePaths("leaderboards.gdggt.dev.attacker.test")).toBeNull();
  });
  const template =
    '<!doctype html><html><head><title>Test</title></head><body><div id="root"></div><script src="/assets/app.js"></script></body></html>';
  function handler() {
    const loadRenderer = vi.fn(),
      loadBootstrap = vi.fn();
    const run = createSiteDocumentHandler({
      configFactory: () => ({
        origin: "https://gdggt.dev",
        rewardsOrigin: publicRewardsOrigin,
      }),
      databaseFactory: () => ({
        from: () => {
          throw Error("Unexpected database read");
        },
      }),
      loadTemplate: async () => template,
      loadRenderer,
      loadBootstrap,
    });
    return {
      loadRenderer,
      loadBootstrap,
      async request(host, path, method = "GET") {
        const response = {
          statusCode: 0,
          headers: new Map(),
          setHeader(k, v) {
            this.headers.set(k.toLowerCase(), v);
          },
          end(body) {
            this.body = body;
          },
        };
        await run({ url: path, headers: { host }, method }, response);
        return response;
      },
    };
  }
  it.each(["/leaderboard", "/leaderboard/member", "/member"])(
    "returns a genuine 404 for %s on the chapter host",
    async (path) => {
      const f = handler(),
        r = await f.request("gdggt.dev", path);
      expect(r.statusCode).toBe(404);
      expect(r.headers.get("location")).toBeUndefined();
      expect(r.body).toContain("Page not found");
      expect(r.headers.get("x-robots-tag")).toContain("noindex");
    },
  );
  it.each(["/", "/member"])(
    "serves %s directly on the rewards host without loading the chapter homepage",
    async (path) => {
      const f = handler(),
        r = await f.request(
          "leaderboards.gdggt.dev",
          "/api/site?__route=" + encodeURIComponent(path),
        );
      expect(r.statusCode).toBe(200);
      expect(r.headers.get("location")).toBeUndefined();
      expect(r.body).toContain(publicRewardsOrigin + path);
      expect(r.body).toContain("Member points");
      expect(f.loadRenderer).not.toHaveBeenCalled();
      expect(f.loadBootstrap).not.toHaveBeenCalled();
      if (path === "/member")
        expect(r.headers.get("x-robots-tag")).toContain("noindex");
    },
  );
  it.each([
    ["/leaderboard", "/"],
    ["/leaderboard/member", "/member"],
  ])("normalizes the old subdomain URL %s to %s", async (path, target) => {
    const r = await handler().request("leaderboards.gdggt.dev", path);
    expect(r.statusCode).toBe(308);
    expect(r.headers.get("location")).toBe(target);
  });
  it("keeps the dedicated root available to HEAD requests without a response body", async () => {
    const r = await handler().request("leaderboards.gdggt.dev", "/", "HEAD");
    expect(r.statusCode).toBe(200);
    expect(r.body).toBeUndefined();
  });
});
