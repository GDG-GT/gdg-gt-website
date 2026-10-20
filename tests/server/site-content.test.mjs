import { describe, it, expect } from "vitest";
import {
  siteContentSchemas,
  publicContentHref,
} from "../../server/site-content.mjs";
describe("curated site-content contract", () => {
  it("excludes public blog, projects and admin navigation", () => {
    for (const href of [
      "/blog",
      "/projects",
      "/admin",
      "//example.org",
      "/forms/private",
      "javascript:alert(1)",
    ])
      expect(publicContentHref.safeParse(href).success).toBe(false);
    for (const href of [
      "/",
      "/events",
      "/events/valid-slug",
      "/contact?type=membership",
      "https://developers.google.com/",
    ])
      expect(publicContentHref.safeParse(href).success).toBe(true);
  });
  it("allows only declared public copy and no scripts, templates or embeds", () => {
    expect(
      siteContentSchemas.pages.safeParse({
        page_slug: "home",
        section_key: "hero",
        content: { title: "Approved copy", primary_cta_link: "/events" },
      }).success,
    ).toBe(true);
    for (const content of [
      { script: "alert(1)" },
      { iframe: "https://example.org" },
      { html: "<script/>" },
      { primary_cta_link: "/admin" },
    ])
      expect(
        siteContentSchemas.pages.safeParse({
          page_slug: "home",
          section_key: "hero",
          content,
        }).success,
      ).toBe(false);
    expect(
      siteContentSchemas.pages.safeParse({
        page_slug: "blog",
        section_key: "hero",
        content: {},
      }).success,
    ).toBe(false);
  });
  it("validates settings by key and prevents arbitrary secret configuration", () => {
    expect(
      siteContentSchemas.settings.safeParse({
        key: "CRON_SECRET",
        value: "not-public",
      }).success,
    ).toBe(false);
    expect(
      siteContentSchemas.settings.safeParse({
        key: "contact_email",
        value: "not-an-email",
      }).success,
    ).toBe(false);
    expect(
      siteContentSchemas.settings.safeParse({
        key: "site_title",
        value: "GDG at Georgia Tech",
      }).success,
    ).toBe(true);
    expect(
      siteContentSchemas.settings.safeParse({
        key: "all_links",
        value: [
          { id: "x", name: "Private", url: "/admin", category: "chapter" },
        ],
      }).success,
    ).toBe(false);
  });
});
