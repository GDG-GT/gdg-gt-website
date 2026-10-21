import { describe, expect, it } from "vitest";
import {
  linktreeProfile,
  linktreeLink,
  linktreeMutation,
  linktreeUrl,
  linktreeUsername,
  embedUrl,
  colorContrast,
} from "../../shared/linktree.mjs";
describe("Linktree public-link and embed policy", () => {
  it("normalizes usernames and rejects path/query injection", () => {
    expect(linktreeUsername.parse(" Fictional-Links ")).toBe("fictional-links");
    for (const value of [
      "../admin",
      "name?token=x",
      "-name",
      "name-",
      "x".repeat(51),
      "",
    ])
      expect(linktreeUsername.safeParse(value).success).toBe(false);
  });
  it("limits destinations to HTTPS and approved first-party public paths", () => {
    expect(linktreeUrl.parse("https://developers.google.com/")).toBe(
      "https://developers.google.com/",
    );
    for (const url of [
      "javascript:alert(1)",
      "data:text/html,hello",
      "http://example.com",
      "https://user:pass@example.com",
      "https://127.0.0.1",
      "https://[::1]",
      "https://localhost.local",
      "https://example.com:8443",
      "https://example.com/?access_token=private",
      "https://example.com/?X-Amz-Signature=private",
      "https://example.com/#resume=private",
    ])
      expect(linktreeUrl.safeParse(url).success, url).toBe(false);
    expect(
      linktreeLink.safeParse({
        title: "Native form",
        url: "/forms/fictional-form",
      }).success,
    ).toBe(true);
    for (const url of [
      "//example.com",
      "/admin",
      "/forms/fictional#access=private",
      "/forms/../admin",
    ])
      expect(linktreeLink.safeParse({ title: "Unsafe", url }).success).toBe(
        false,
      );
  });
  it("constructs canonical YouTube privacy-enhanced and Google Forms embeds only", () => {
    expect(
      embedUrl("https://www.youtube.com/watch?v=abcdefghijk&t=30", "youtube"),
    ).toBe("https://www.youtube-nocookie.com/embed/abcdefghijk?rel=0");
    expect(embedUrl("https://youtu.be/abcdefghijk", "youtube")).toContain(
      "youtube-nocookie.com/embed/abcdefghijk",
    );
    expect(
      embedUrl(
        "https://docs.google.com/forms/d/e/fictional12345/viewform?usp=sf_link",
        "google_form",
      ),
    ).toBe(
      "https://docs.google.com/forms/d/e/fictional12345/viewform?embedded=true",
    );
    for (const [url, type] of [
      ["https://youtube.com.evil.com/watch?v=abcdefghijk", "youtube"],
      ["https://docs.google.com/document/d/fictional12345/edit", "google_form"],
      ["https://forms.gle/fictional12345", "google_form"],
      ["https://example.com", "iframe"],
      ["/forms/fictional", "google_form"],
    ])
      expect(embedUrl(url, type)).toBeNull();
    expect(
      linktreeLink.safeParse({
        title: "No arbitrary embeds",
        url: "https://example.com",
        embedType: "youtube",
      }).success,
    ).toBe(false);
  });
  it("rejects free-form CSS, forged ownership/counters and illegible button colors", () => {
    expect(colorContrast("#000000", "#ffffff")).toBeCloseTo(21);
    for (const change of [
      { clickCount: "999" },
      { is_active: true },
      { profile_id: "forged" },
      { buttonColor: "url(https://evil.com)" },
      { textColor: "#eeeeee", buttonColor: "#ffffff" },
    ])
      expect(
        linktreeLink.safeParse({
          title: "Fictional link",
          url: "https://example.com",
          ...change,
        }).success,
      ).toBe(false);
    expect(
      linktreeProfile.safeParse({
        username: "fictional",
        displayName: "Fictional profile",
        background: {
          type: "gradient",
          from: "#ff9966",
          to: "#f4f5f7",
          angle: 135,
        },
      }).success,
    ).toBe(true);
    expect(
      linktreeProfile.safeParse({
        username: "fictional",
        displayName: "Fictional profile",
        background: { type: "gradient", value: "url(https://evil.com)" },
      }).success,
    ).toBe(false);
  });
  it("requires revisions and explicit typed/password decisions", () => {
    expect(
      linktreeMutation.safeParse({
        action: "publish",
        revision: 1,
        confirmation: "Fictional profile",
        currentPassword: "fixture",
      }).success,
    ).toBe(true);
    for (const value of [
      { action: "publish", revision: 1 },
      {
        action: "archive",
        revision: 0,
        confirmation: "Name",
        currentPassword: "fixture",
      },
      { action: "move", revision: 1, linkId: "invalid", direction: "up" },
    ])
      expect(linktreeMutation.safeParse(value).success).toBe(false);
  });
});
