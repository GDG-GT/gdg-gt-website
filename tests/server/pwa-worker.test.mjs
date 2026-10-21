import { afterEach, describe, expect, it, vi } from "vitest";
const cached = vi.hoisted(() => ({ controller: undefined, entries: undefined }));
vi.mock("workbox-precaching", () => ({ PrecacheController: class {
  constructor(config) { cached.controller = config; }
  addToCacheList(entries) { cached.entries = entries; }
  install() { return Promise.resolve(); }
  activate() { return Promise.resolve(); }
  matchPrecache() { return Promise.resolve(new Response("fixture public asset")); }
} }));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.resetModules(); });
async function worker() {
  const listeners = new Map(), skipWaiting = vi.fn(async () => {});
  vi.stubGlobal("self", { location: { origin: "https://chapter.example.test" }, __WB_MANIFEST: [
    { url: "index.html", revision: "fixture" }, { url: "offline.html", revision: "fixture" }, { url: "assets/index-fixture.js", revision: null },
    { url: "/api/v1/admin/me", revision: "never" }, { url: "/forms/private?access=secret", revision: "never" },
  ], addEventListener: (type, handler) => listeners.set(type, handler), skipWaiting });
  await import("../../src/pwa/sw.js"); return { listeners, skipWaiting };
}
describe("Actual PWA worker routing", () => {
  it("filters precache build inputs through the public-asset boundary", async () => {
    await worker(); expect(cached.entries).toHaveLength(3);
    expect(cached.entries.some((e) => e.url.includes("api") || e.url.includes("access"))).toBe(false);
    const request = await cached.controller.plugins[0].requestWillFetch({ request: new Request("https://chapter.example.test/index.html") });
    expect(request.credentials).toBe("omit"); expect(request.redirect).toBe("error");
    expect(await cached.controller.plugins[0].cacheWillUpdate({ response: new Response("private", { headers: { "Set-Cookie": "fictional" } }) })).toBe(null);
  });
  it("never intercepts private HTML, APIs, form capabilities, signed URLs or writes", async () => {
    const { listeners } = await worker();
    for (const path of ["/admin", "/admin/members", "/api/v1/events", "/api/v1/auth/session", "/forms/a", "/forms/a?access=fixture", "/assets/index-fixture.js?token=fixture", "/storage/private?signature=fixture", "https://storage.example.test/private"]) {
      const respondWith = vi.fn(); listeners.get("fetch")({ request: { method: "GET", mode: "navigate", url: new URL(path, "https://chapter.example.test").href }, respondWith }); expect(respondWith, path).not.toHaveBeenCalled();
    }
    const respondWith = vi.fn(); listeners.get("fetch")({ request: { method: "POST", url: "https://chapter.example.test/api/v1/events/a/registrations" }, respondWith }); expect(respondWith).not.toHaveBeenCalled();
  });
  it("returns only the offline fallback when an approved public navigation fails", async () => {
    const { listeners } = await worker(); vi.stubGlobal("fetch", vi.fn(async () => { throw Error("fixture network offline"); }));
    let response; listeners.get("fetch")({ request: { method: "GET", mode: "navigate", url: "https://chapter.example.test/events" }, respondWith: (promise) => { response = promise; } });
    expect(await (await response).text()).toBe("fixture public asset");
  });
  it("does not skip waiting during install; update activation must be explicit", async () => {
    const { listeners, skipWaiting } = await worker(); expect(skipWaiting).not.toHaveBeenCalled();
    listeners.get("message")({ data: { type: "unknown" }, waitUntil: vi.fn() }); expect(skipWaiting).not.toHaveBeenCalled();
    listeners.get("message")({ data: { type: "GDG_ACTIVATE_UPDATE" }, waitUntil: vi.fn() }); expect(skipWaiting).toHaveBeenCalledOnce();
  });
});
