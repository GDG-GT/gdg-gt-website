import { describe, it, expect } from "vitest";
import { approvedPrecacheAsset, publicNavigationFallback } from "../../shared/pwa-policy.mjs";
const origin = "https://chapter.example.test";
describe("Deny-by-default PWA cache policy", () => {
  it("allows only exact approved public navigation fallback routes", () => {
    for (const path of ["/", "/events", "/events/fictional-workshop", "/offline", "/maintenance"]) expect(publicNavigationFallback(path, origin)).toBe(true);
    for (const path of ["/admin", "/admin/forms", "/api/v1/events", "/forms/public-slug", "/forms/private-slug#access=secret", "/events/test?edit=secret", "/events/test#resume=secret", "/l/private", "https://other.example.test/events"]) expect(publicNavigationFallback(path, origin)).toBe(false);
  });
  it("allows built assets, not API responses or signed/private storage URLs", () => {
    for (const path of ["/index.html", "/offline.html", "/assets/index-hash.js", "/assets/inter-latin.woff2", "/icons/pwa-192.png"]) expect(approvedPrecacheAsset(path, origin)).toBe(true);
    for (const path of ["/api/auth/session", "/api/v1/admin/me", "/assets/file.js?token=secret", "/storage/v1/object/sign/private", "/assets/../admin/private.js", "/forms/a/responses", "https://other.example.test/assets/a.js"]) expect(approvedPrecacheAsset(path, origin)).toBe(false);
  });
});
