import { test, expect, accessibility } from "./public-fixture";
import type { Page } from "@playwright/test";
const events = [
  ["Fictional Gemini workshop", "event-workshop.jpg", "Workshop"],
  ["Fictional build weekend", "event-hackathon.jpg", "Hackathon"],
  ["Fictional community demo", "event-community.jpg", "Social"],
].map(([title, image, type], i) => ({
  id: "f9910000-0000-4000-8000-" + String(i + 1).padStart(12, "0"),
  title,
  slug: "fictional-event-" + (i + 1),
  description:
    "A fictional chapter event for populated layout and accessibility verification.",
  short_description: "Learn together, build a project and share your progress.",
  start_at: `2099-11-${String(10 + i * 5).padStart(2, "0")}T18:00:00Z`,
  end_at: `2099-11-${String(10 + i * 5).padStart(2, "0")}T20:00:00Z`,
  timezone: "America/New_York",
  location: "Fictional campus workshop room",
  type,
  level: "beginner",
  image_url: "/assets/" + image,
  registration_type: "internal",
  registration_enabled: true,
  registration_state: "open",
  publication_status: "published",
  max_participants: 50,
  external_attendees: 0,
  is_featured: i === 0,
  team_id: null,
  revision: 1,
  created_at: "2026-11-01T12:00:00Z",
  updated_at: "2026-11-01T12:00:00Z",
}));
const metrics = [
  ["Fictional interest list", "47"],
  ["Fictional events", "3"],
  ["Fictional project teams", "8"],
  ["Fictional chapter", "1"],
].map(([stat_label, stat_value], i) => ({
  id: "fictional-metric-" + i,
  stat_label,
  stat_value,
  stat_description: "Fictional screenshot fixture only",
}));
async function populated(page: Page) {
  const writes: string[] = [];
  await page.route("**/api/v1/push/config", (route) =>
    route.fulfill({
      json: { data: { enabled: false, deliveryEnabled: false } },
    }),
  );
  await page.route(
    "**/api/v1/{public/home,events,team,resources,sponsors,sponsor-tiers,sponsor-stats,gallery}**",
    (route) => {
      const r = route.request(),
        url = new URL(r.url()),
        p = url.pathname.slice("/api/v1".length),
        reply = (data: unknown) => route.fulfill({ json: { data } }),
        listing = (items: unknown[]) => ({
          items,
          total: items.length,
          page: 1,
          pageSize: 30,
        });
      if (r.method() !== "GET") {
        writes.push(r.method() + " " + p);
        return route.fulfill({
          status: 403,
          json: {
            error: {
              code: "FORBIDDEN",
              message: "Fictional public composition writes disabled",
            },
          },
        });
      }
      if (p === "/public/home")
        return reply({
          settings: [],
          pages: [],
          navigation: [],
          social: [],
          footer: [],
          sponsors: [],
          metrics,
        });
      if (p === "/events") return reply(listing(events));
      if (p.startsWith("/events/"))
        return reply({ event: events[0], related: events.slice(1) });
      if (p === "/team")
        return reply(
          listing(
            [
              "Fictional chapter organizer",
              "Fictional technical lead",
              "Fictional community lead",
              "Fictional workshop lead",
            ].map((name, i) => ({
              id: "fictional-officer-" + i,
              name,
              role: i === 0 ? "Organizer" : "Team lead",
              bio: "A fictional student helping the chapter learn, build and grow together.",
              team_section:
                i < 2 ? "Chapter leadership" : "Community and workshops",
            })),
          ),
        );
      if (p === "/resources")
        return reply(
          listing(
            [
              ["Fictional cloud study path", "study_jam"],
              ["Fictional workshop notes", "documentation"],
              ["Fictional project recording", "recording"],
            ].map(([title, type], i) => ({
              id: "fictional-resource-" + i,
              title,
              type,
              description:
                "A fictional curated learning resource with practical next steps and chapter context.",
              level: "beginner",
              status: "Available",
              tags: ["Cloud", "Community"],
              url: "https://developers.google.com/",
            })),
          ),
        );
      if (p === "/sponsors")
        return reply(
          listing([
            {
              id: "fictional-sponsor",
              name: "Fictional chapter partner",
              logo_url: "",
              tier: "community",
              tier_label: "Community",
            },
          ]),
        );
      if (p === "/sponsor-tiers")
        return reply(
          listing([
            {
              id: "fictional-tier",
              tier_name: "Community",
              tier_level: "community",
              amount: "",
              benefits: [
                "Fictional workshop support",
                "Fictional student mentorship",
              ],
            },
          ]),
        );
      if (p === "/sponsor-stats") return reply(listing(metrics));
      if (p === "/gallery")
        return reply({
          ...listing(
            events.map((e, i) => ({
              id: "fictional-photo-" + i,
              url: e.image_url,
              alt_text: "Illustrative chapter workshop scene " + (i + 1),
              description:
                "A fictional caption for community layout verification.",
              width: 1000,
              height: 667,
              event_id: e.id,
              event_title: e.title,
              downloadUrl: null,
            })),
          ),
          events: events.map((e) => ({ id: e.id, title: e.title })),
        });
      return route.fallback();
    },
  );
  return writes;
}
for (const route of [
  "/",
  "/events",
  "/events/fictional-event-1",
  "/team",
  "/resources",
  "/sponsors",
  "/gallery",
  "/contact",
])
  test(`populated public composition ${route} keeps approved layout scroll and controls`, async ({
    page,
    fixture,
  }, info) => {
    const writes = await populated(page),
      errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(route);
    await expect(page.locator("h1")).toHaveCount(1);
    if (route === "/" || route === "/events")
      await expect(
        page.getByRole("heading", { name: events[0].title, exact: true }),
      ).toBeVisible();
    if (route.startsWith("/events/"))
      await expect(page.locator("h1")).toContainText(events[0].title);
    if (route === "/team")
      await expect(
        page.getByRole("heading", {
          name: "Fictional chapter organizer",
          exact: true,
        }),
      ).toBeVisible();
    if (route === "/resources")
      await expect(
        page.getByRole("heading", {
          name: "Fictional cloud study path",
          exact: true,
        }),
      ).toBeVisible();
    if (route === "/sponsors")
      await expect(
        page.getByRole("heading", {
          name: "Fictional chapter partner",
          exact: true,
        }),
      ).toBeVisible();
    if (route === "/gallery")
      await expect(
        page.getByRole("img", {
          name: "Illustrative chapter workshop scene 1",
          exact: true,
        }),
      ).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(await accessibility(page)).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath("populated-public-full.png"),
      fullPage: true,
      animations: "disabled",
    });
    await info.attach("public " + route, {
      path: info.outputPath("populated-public-full.png"),
      contentType: "image/png",
    });
    if (route === "/")
      for (const [selector, name] of [
        [".gt-home-hero", "hero"],
        [".gt-community-stats", "statistics"],
        ["#community-events", "upcoming-events"],
        [".gt-footer", "footer"],
      ]) {
        await page
          .locator(selector)
          .first()
          .screenshot({
            path: info.outputPath("prompt-" + name + ".png"),
            animations: "disabled",
          });
        await info.attach(name, {
          path: info.outputPath("prompt-" + name + ".png"),
          contentType: "image/png",
        });
      }
    const tall = await page.evaluate(
      () => document.documentElement.scrollHeight > innerHeight,
    );
    if (tall) {
      await page.evaluate(() => window.scrollTo(0, 500));
      await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
    }
    expect(writes).toEqual([]);
    expect(errors).toEqual([]);
    expect(fixture.unexpected).toEqual([]);
  });
