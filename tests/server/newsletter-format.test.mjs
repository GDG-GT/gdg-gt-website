import { it, expect } from "vitest";
import { newsletterBlocks } from "../../shared/newsletter-format.mjs";
import { newsletterPreview } from "../../shared/newsletter.mjs";

it("formats existing newsletter section headings without rewriting the message", () => {
  const content = "Hi Everyone,\nThis is our first update.\n\nEXECUTIVE BOARD APPLICATIONS\n\nApply here: https://gdggt.dev/forms/apply\n\nWHAT’S NEXT\n\nWorkshops and projects.";
  expect(newsletterBlocks(content)).toEqual([
    { type: "paragraph", text: "Hi Everyone,\nThis is our first update." },
    { type: "heading", text: "EXECUTIVE BOARD APPLICATIONS" },
    { type: "paragraph", text: "Apply here: https://gdggt.dev/forms/apply" },
    { type: "heading", text: "WHAT’S NEXT" },
    { type: "paragraph", text: "Workshops and projects." },
  ]);
  const html = newsletterPreview("First member update", content);
  expect(html).toMatch(/<h2[^>]*font:bold 19px[^>]*>EXECUTIVE BOARD APPLICATIONS<\/h2>/);
  expect(html).toMatch(/<h2[^>]*>WHAT’S NEXT<\/h2>/);
  expect(html).toContain('href="https://gdggt.dev/forms/apply"');
  expect(html).toContain("Hi Everyone,<br>This is our first update.");
});

it("supports explicit mixed-case headings and escapes markup while preserving links", () => {
  const html = newsletterPreview("Update", "## What’s next\r\n\r\nRead the update.\r\n\r\n## <script>bad()</script> https://gdggt.dev/events");
  expect(html).toMatch(/<h2[^>]*>What’s next<\/h2>/);
  expect(html).toContain("&lt;script&gt;bad()&lt;/script&gt;");
  expect(html).not.toContain("<script>");
  expect(html).toContain('href="https://gdggt.dev/events"');
  expect(newsletterBlocks("A normal sentence.\n\nThank you,\nGDG at Georgia Tech").every(b => b.type === "paragraph")).toBe(true);
});
