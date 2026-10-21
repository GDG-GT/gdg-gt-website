import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  blogCreate,
  blogMutation,
  blogPostRecord,
  safeBlogMarkdown,
  blogReference,
} from "../../shared/blog.mjs";
import BlogMarkdown from "../../src/ui/blog/BlogMarkdown.tsx";
import { blogFileIntent, blogFileTypes } from "../../shared/blog-uploads.mjs";
const record = {
  title: "Fictional article",
  slug: "fictional-article",
  content: "Safe **Markdown**",
  author_name: "Fictional author",
};
describe("private editorial data contracts", () => {
  it("accepts only bounded allowlisted Blog upload metadata without caller-owned identity or paths", () => {
    const doc = {
      teamId: null,
      filename: "fictional.txt",
      mime: "text/plain",
      bytes: 20,
      sha256: "a".repeat(64),
    };
    expect(blogFileIntent.safeParse(doc).success).toBe(true);
    expect(blogFileTypes).toHaveLength(6);
    for (const extra of [
      { bytes: 20971521 },
      { bytes: 0 },
      { sha256: "bad" },
      { mime: "image/svg+xml" },
      { owner_id: "forged" },
      { key: "clean/forged" },
      { submissionId: "forged" },
    ])
      expect(blogFileIntent.safeParse({ ...doc, ...extra }).success).toBe(
        false,
      );
  });
  it("removes raw HTML, executable destinations and automatically loaded images on write", () => {
    const result = safeBlogMarkdown(
      '# Safe heading\n\n<script>alert("x")</script>\n\n[bad](javascript:alert)\n\n![tracking](https://example.com/pixel.png)',
    );
    expect(result).not.toContain("<script");
    expect(result).not.toContain("javascript:");
    expect(result).not.toContain("https://example.com/pixel.png");
    expect(result).toContain("[Image: tracking]");
  });
  it("keeps literal code snippets and permitted HTTPS links", () => {
    const source =
      'A [safe link](https://example.com/docs).\n\n~~~html\n<div onclick="example()">literal code</div>\n~~~';
    const safe = safeBlogMarkdown(source);
    expect(safe).toContain('<div onclick="example()">');
    expect(safe).toContain("https://example.com/docs");
    expect(safeBlogMarkdown(safe)).toBe(safe);
  });
  it("renders the same sanitization policy without HTML, images or unsafe links", () => {
    const rendered = renderToStaticMarkup(
      createElement(BlogMarkdown, {
        children:
          '<iframe src="https://example.com"></iframe>\n\n![pixel](https://example.com/pixel)\n\n[x](javascript:alert)\n\n~~~html\n<script>literal</script>\n~~~',
      }),
    );
    expect(rendered).not.toMatch(/<(iframe|script|img)\b/);
    expect(rendered).not.toContain('href="javascript:');
    expect(rendered).toContain("&lt;script&gt;literal");
  });
  it("normalizes full post fields without accepting state, ownership, counters or permission injection", () => {
    const parsed = blogPostRecord.parse(record);
    expect(parsed.tags).toEqual([]);
    expect(parsed.content).toBe("Safe **Markdown**");
    for (const key of [
      "status",
      "created_by",
      "team_id",
      "assigned_editor_id",
      "approval_status",
      "views_count",
    ])
      expect(
        blogPostRecord.safeParse({ ...record, [key]: "forged" }).success,
      ).toBe(false);
  });
  it("limits keys, tag uniqueness, slug format and unsafe asset metadata", () => {
    for (const extra of [
      { slug: "../private" },
      { tags: ["Web", "web"] },
      { featured_image_url: "javascript:alert(1)" },
      { author_avatar_url: "https://127.0.0.1/x" },
      { read_time_minutes: 0 },
    ])
      expect(blogPostRecord.safeParse({ ...record, ...extra }).success).toBe(
        false,
      );
  });
  it("requires current revisions and exact references for sensitive decisions", () => {
    const reference = blogReference("f9000000-0000-4000-8000-000000000001");
    expect(reference).toBe("BLOG-F9000000000040008000000000000001");
    expect(
      blogMutation("posts").safeParse({
        action: "approve",
        revision: 1,
        currentPassword: "fictional",
        confirmation: reference,
      }).success,
    ).toBe(true);
    for (const payload of [
      { action: "publish", revision: 1 },
      {
        action: "approve",
        revision: 0,
        currentPassword: "fictional",
        confirmation: reference,
      },
      {
        action: "assign",
        revision: 1,
        currentPassword: "fictional",
        confirmation: "wrong",
        editorId: null,
      },
    ])
      expect(blogMutation("posts").safeParse(payload).success).toBe(false);
  });
  it("categories cannot be silently team scoped or contain unsafe color CSS", () => {
    expect(
      blogCreate("categories").safeParse({
        teamId: "f9000000-0000-4000-8000-000000000001",
        record: { name: "Fictional", slug: "fictional" },
      }).success,
    ).toBe(false);
    expect(
      blogCreate("categories").safeParse({
        teamId: null,
        record: { name: "Fictional", slug: "fictional", color: "url(evil)" },
      }).success,
    ).toBe(false);
  });
  it("discussion/review contracts reject forged authors, file paths and unknown review states", () => {
    expect(
      blogMutation("submissions").safeParse({
        action: "comment",
        revision: 1,
        comment: "Safe discussion",
        type: "general",
        admin_id: "forged",
      }).success,
    ).toBe(false);
    expect(
      blogMutation("submissions").safeParse({
        action: "review",
        revision: 1,
        currentPassword: "fictional",
        confirmation: blogReference("f9000000-0000-4000-8000-000000000001"),
        status: "published",
        file_path: "forged",
      }).success,
    ).toBe(false);
  });
});
