import { describe, it, expect } from "vitest";
import { contentSchemas } from "../../server/content-records.mjs";
import { safeUrl } from "../../server/lib/validation.mjs";
describe("server-owned content editing contract", () => {
  it("rejects client-owned publication, authorship, revisions and counters", () => {
    const resource = {
      title: "Test resource",
      description: "Fictional learning resource",
      type: "documentation",
    };
    expect(contentSchemas.resources.safeParse(resource).success).toBe(true);
    for (const extra of [
      { is_active: true },
      { created_by: "forged" },
      { revision: 99 },
      { views: 100 },
      { metadata: { script: "unsafe" } },
    ])
      expect(
        contentSchemas.resources.safeParse({ ...resource, ...extra }).success,
      ).toBe(false);
  });
  it("validates bounded lists, plain content and approved tier accents", () => {
    expect(
      contentSchemas["sponsor-tiers"].safeParse({
        tier_name: "Bronze",
        tier_level: "bronze",
        amount: "In-kind support",
        color_gradient: "url(javascript:test)",
      }).success,
    ).toBe(false);
    expect(
      contentSchemas["sponsor-stats"].safeParse({
        stat_label: "A statistic",
        stat_value: "1",
        stat_description: "Approved context",
        icon_name: "unknown-code",
      }).success,
    ).toBe(false);
    expect(
      contentSchemas.resources.safeParse({
        title: "Test",
        description: "A resource",
        type: "documentation",
        tags: Array.from({ length: 31 }, () => "tag"),
      }).success,
    ).toBe(false);
  });
  it("allows HTTPS links without credentials and rejects local network destinations", () => {
    expect(safeUrl.safeParse("https://developers.google.com/").success).toBe(
      true,
    );
    for (const url of [
      "javascript:alert(1)",
      "http://example.com",
      "https://user:password@example.com",
      "https://127.0.0.1",
      "https://0x7f000001",
      "https://[::1]",
      "https://10.0.0.1",
      "https://192.168.0.1",
      "https://foo.local",
      "https://metadata.internal",
      "https://localhost",
      "https://example.com/\nscript",
    ])
      expect(safeUrl.safeParse(url).success).toBe(false);
  });
});
