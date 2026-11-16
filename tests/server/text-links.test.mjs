import { describe, it, expect } from "vitest";
import { textLinks } from "../../shared/text-links.mjs";
import { emailText, safeEmailLink } from "../../shared/email.mjs";
import { newsletterPreview } from "../../shared/newsletter.mjs";

describe("links in plain-text messages and email", () => {
  it("recognizes web and email addresses without absorbing surrounding punctuation", () => {
    const text = "Apply (https://gdggt.dev/forms/apply?from=mail&team=1). See www.gdggt.dev/events, http://example.test/info, and contact@gdggt.dev.";
    const parts = textLinks(text);
    expect(parts.map(p => p.text).join("")).toBe(text);
    expect(parts.filter(p => p.href).map(p => p.href)).toEqual([
      "https://gdggt.dev/forms/apply?from=mail&team=1", "https://www.gdggt.dev/events", "http://example.test/info", "mailto:contact@gdggt.dev",
    ]);
  });

  it("preserves balanced URL parentheses, fragments, Unicode and repeated links", () => {
    const url = "https://example.test/wiki/Topic_(detail)#section";
    const text = `Details: ${url}\n\n${url} and https://example.test/学生。`;
    expect(textLinks(text).map(p => p.text).join("")).toBe(text);
    expect(textLinks(text).filter(p => p.href).slice(0, 2).map(p => p.href)).toEqual([url, url]);
    expect(textLinks("")).toEqual([]);
    expect(textLinks("No links here")).toEqual([{ text: "No links here" }]);
  });

  it("never enables executable schemes, credentials or HTML injection", () => {
    const text = '<script>alert(1)</script> javascript:alert(1) data:text/html,test https://user:secret@example.test';
    expect(textLinks(text)).toEqual([{ text }]);
    expect(emailText(text)).not.toContain("<script>");
    expect(emailText(text)).not.toContain("href=");
    expect(safeEmailLink("javascript:alert(1)")).toBe(false);
    expect(safeEmailLink("http://external.example.test")).toBe(false);
  });

  it("renders newsletter and other email links with safe escaped attributes", () => {
    const content = 'Join https://gdggt.dev/forms/apply?team=1&source=mail.\n\nMore at www.gdggt.dev or contact@gdggt.dev. <b>Text only</b>';
    for (const html of [emailText(content), newsletterPreview("Chapter update", content)]) {
      expect(html).toContain('href="https://gdggt.dev/forms/apply?team=1&amp;source=mail"');
      expect(html).toContain('href="https://www.gdggt.dev"');
      expect(html).toContain('href="mailto:contact@gdggt.dev"');
      expect(html).toContain('&lt;b&gt;Text only&lt;/b&gt;');
      expect(html).not.toContain('source=mail."');
    }
  });
});
