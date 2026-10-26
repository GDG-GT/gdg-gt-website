import { describe, expect, it } from "vitest";
import {
  managedLink,
  managedLinks,
  projectContent,
  readHomeContent,
} from "../../src/lib/content-snapshot";

const empty = () => ({
  settings: [],
  pages: [],
  navigation: [],
  social: [],
  footer: [],
  metrics: [],
});
describe("public chapter snapshot boundary", () => {
  it.each([
    null,
    [],
    true,
    {},
    { ...empty(), pages: null },
    { ...empty(), social: [null] },
    { ...empty(), navigation: [{ label: "Home" }] },
    {
      ...empty(),
      pages: [
        { page_slug: "home", section_key: "hero", content: { title: 12 } },
      ],
    },
    { ...empty(), footer: [{ section_key: "about", content: null }] },
    { ...empty(), metrics: Array(10001).fill({}) },
  ])("rejects malformed or unbounded payload %j", (value) => {
    expect(() => readHomeContent(value)).toThrow("unreadable response");
  });
  it("retains an approved empty snapshot without inventing chapter records", () => {
    expect(readHomeContent(empty())).toEqual(empty());
  });
  it("projects separate sections and treats prototype-shaped legacy keys as ordinary data", () => {
    const snapshot = {
      ...empty(),
      pages: [
        {
          page_slug: "home",
          section_key: "hero",
          content: { title: "Saved hero" },
        },
        {
          page_slug: "home",
          section_key: "mission",
          content: { description: "Saved mission" },
        },
        {
          page_slug: "__proto__",
          section_key: "constructor",
          content: { title: "Ordinary data" },
        },
      ],
    };
    const { pages } = projectContent(snapshot);
    expect(pages.home.hero.title).toBe("Saved hero");
    expect(pages.home.mission.description).toBe("Saved mission");
    expect(pages.__proto__.constructor).toEqual({ title: "Ordinary data" });
    expect(Object.getPrototypeOf(pages)).toBeNull();
    expect(Object.getPrototypeOf(pages.home)).toBeNull();
    expect(({} as Record<string, unknown>).title).toBeUndefined();
  });
  it("filters malformed link values and supports managed id/name/category lookup", () => {
    const link = {
      id: "join",
      name: "Join us",
      category: "community",
      url: "/contact",
    };
    const settings = {
      all_links: [null, false, "bad", { ...link, url: 4 }, link],
      fallback_url: "/events",
    };
    expect(managedLinks(settings)).toEqual([link]);
    expect(managedLinks(settings, "community")).toEqual([link]);
    expect(managedLinks(settings, "other")).toEqual([]);
    expect(managedLinks({ all_links: "bad" })).toEqual([]);
    expect(managedLink(settings, "join")).toBe("/contact");
    expect(managedLink(settings, "join_us")).toBe("/contact");
    expect(managedLink(settings, "fallback")).toBe("/events");
    expect(managedLink({}, "missing")).toBe("#");
    expect(managedLink({ missing_url: 45 }, "missing")).toBe("#");
  });
});
