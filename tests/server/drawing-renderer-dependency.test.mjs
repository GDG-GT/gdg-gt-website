import { describe, expect, it } from "vitest";
import katex from "katex";

describe("drawing renderer inherited-option security boundary", () => {
  it.each([
    String.raw`\href{javascript:alert(1)}{Fictional link}`,
    String.raw`\includegraphics{https://example.test/fictional-image.png}`,
  ])("refuses inherited trust for %s", (expression) => {
    const options = Object.assign(Object.create({ trust: true }), {
      throwOnError: false,
    });
    const html = katex.renderToString(expression, options);
    expect(html).not.toMatch(/\b(?:href|src)\s*=/i);
    expect(Object.hasOwn(options, "trust")).toBe(false);
  });

  it.each(["mathml", "htmlAndMathml"])(
    "retains ordinary mathematical rendering in the %s mode used by Mermaid",
    (output) => {
      const html = katex.renderToString(String.raw`\frac{1}{2}+x^2`, {
        throwOnError: true,
        displayMode: true,
        output,
      });
      expect(html).toContain("<math");
      expect(html).toContain("<mfrac>");
      expect(html).not.toMatch(/\b(?:href|src)\s*=/i);
    },
  );

  it("keeps an explicit trust refusal authoritative over inherited trust", () => {
    const options = Object.assign(Object.create({ trust: true }), {
      trust: false,
      throwOnError: false,
    });
    expect(
      katex.renderToString(
        String.raw`\href{https://example.test/}{Fictional link}`,
        options,
      ),
    ).not.toMatch(/\bhref\s*=/i);
  });

  it("preserves explicit trusted rendering for a caller-owned safe destination", () => {
    expect(
      katex.renderToString(
        String.raw`\href{https://gatech.edu/}{Georgia Tech}`,
        {
          trust: true,
          throwOnError: true,
        },
      ),
    ).toContain('href="https://gatech.edu/"');
  });
});
