import type { Page, TestInfo } from "@playwright/test";
import {
  test,
  expect,
  accessibility,
  fictionalBuilderForm,
  fictionalTeam,
  fictionalTeamPost,
} from "./public-fixture";
import { mediaFixture, newsletterFixture } from "./operations-records";

const responseId = "fbbd0000-0000-4000-8000-000000000001";
const roomId = "fbbd0000-0000-4000-8000-000000000002";
const actorId = "fbbb0000-0000-4000-8000-000000000001";
const formRoot = "/admin/forms/" + fictionalBuilderForm.id;
const form = {
  ...fictionalBuilderForm,
  status: "Open",
  actions: ["view", "edit", "view_responses", "publish"],
  versions: [
    {
      ...fictionalBuilderForm,
      version: 1,
      publishedAt: "2026-11-05T12:00:00Z",
    },
  ],
};
const channel = {
  id: roomId,
  name: "fictional-build-night",
  description: "Fictional team planning conversation",
  visibility: "team",
  team_id: fictionalTeam.id,
  is_archived: false,
  is_team_chat: true,
  revision: 1,
  unreadCount: 2,
};
const messages = [
  {
    id: "fbbd0000-0000-4000-8000-000000000003",
    sender_id: actorId,
    senderName: "Fictional chapter reviewer",
    message:
      "Fictional build-night plan: review the demo together before the workshop.",
    is_pinned: true,
    is_deleted: false,
    revision: 1,
    creation_sequence: 1,
    change_sequence: 1,
    created_at: "2026-11-05T12:00:00Z",
    updated_at: "2026-11-05T12:00:00Z",
    canEdit: true,
    canDelete: true,
    reply: null,
  },
  {
    id: "fbbd0000-0000-4000-8000-000000000004",
    sender_id: "fbbd0000-0000-4000-8000-000000000005",
    senderName: "Fictional team contributor",
    message: "Fictional reply: I will prepare the accessible demo checklist.",
    is_pinned: false,
    is_deleted: false,
    revision: 1,
    creation_sequence: 2,
    change_sequence: 2,
    created_at: "2026-11-05T12:01:00Z",
    updated_at: "2026-11-05T12:01:00Z",
    canEdit: false,
    canDelete: true,
    reply: {
      id: "fbbd0000-0000-4000-8000-000000000003",
      message: "Fictional build-night plan",
      is_deleted: false,
    },
  },
];

async function installRecords(page: Page) {
  const media = mediaFixture(),
    newsletter = newsletterFixture();
  const writes: string[] = [],
    errors: string[] = [],
    unexpected: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    const p = url.pathname.replace("/api/v1", "");
    if (request.method() !== "GET") {
      if (["/auth/realtime-token", "/realtime/token"].includes(p))
        return route.fallback();
      writes.push(request.method() + " " + p);
      return route.fulfill({
        status: 403,
        json: {
          error: {
            code: "FORBIDDEN",
            message: "Read-only fictional visual review",
          },
        },
      });
    }
    const reply = (data: unknown) => route.fulfill({ json: { data } });
    if (p === formRoot) return reply({ form });
    if (p === formRoot + "/responses")
      return reply({
        items: [
          {
            id: responseId,
            formId: form.id,
            version: 1,
            revision: 1,
            submittedAt: "2026-11-05T12:00:00Z",
            status: "complete",
            respondent: {
              name: "Fictional Private Respondent",
              email: "fictional-response@example.test",
              source: "self_reported",
            },
            answers: { [form.fields[0].id]: "Fictional stored answer" },
          },
        ],
        total: 1,
        page: 1,
        pageSize: 30,
      });
    if (p === formRoot + "/analytics")
      return reply({
        responseCount: 8,
        fields: [
          {
            fieldId: "fictional-choice",
            label: "Fictional experience level",
            type: "radio",
            version: 1,
            answered: 8,
            counts: { Beginner: 4, Intermediate: 3, Advanced: 1 },
            grid: {},
            ranking: {},
          },
          {
            fieldId: "fictional-rating",
            label: "Fictional session rating",
            type: "rating",
            version: 1,
            answered: 8,
            counts: { "3": 1, "4": 3, "5": 4 },
            grid: {},
            ranking: {},
            numeric: { count: 8, mean: 4.375, min: 3, max: 5 },
          },
          {
            fieldId: "fictional-grid",
            label: "Fictional workshop interests",
            type: "grid",
            version: 1,
            answered: 8,
            counts: {},
            grid: {
              "Accessible web": { Interested: 6, "Very interested": 2 },
              "Cloud basics": { Interested: 3, "Very interested": 5 },
            },
            ranking: {},
          },
          {
            fieldId: "fictional-ranking",
            label: "Fictional topic priorities",
            type: "ranking",
            version: 1,
            answered: 8,
            counts: {},
            grid: {},
            ranking: { Accessibility: 1.5, Cloud: 2.125, Mobile: 2.375 },
          },
        ],
      });
    if (p === formRoot + "/views") return reply({ items: [] });
    if (p.startsWith("/admin/media"))
      return reply(media.response(p + url.search));
    if (p.startsWith("/admin/newsletter")) {
      if (p.endsWith("/preview"))
        return reply({
          html: "<!doctype html><html lang='en'><title>Fictional email</title><body style='font:16px/1.6 system-ui;background:#f2f3f4;color:#2d2d2d;padding:24px'><h1>Fictional chapter update</h1><p>A fictional workshop invitation for local visual review.</p><p>No messages are sent by this preview.</p></body></html>",
        });
      if (p.includes("/forms"))
        return reply({ items: [], total: 0, pageSize: 30 });
      return reply(newsletter.response(p + url.search));
    }
    if (p === "/admin/channels/capabilities")
      return reply({
        globalCreate: true,
        teams: [{ id: fictionalTeam.id, name: fictionalTeam.name }],
      });
    if (p === "/admin/channels")
      return reply({ items: [channel], total: 1, pageSize: 30 });
    if (p === "/admin/channels/" + roomId)
      return reply({
        record: channel,
        actions: {
          manage: true,
          moderate: true,
          send: true,
          manageMembers: false,
        },
        actorId,
        canRestore: false,
      });
    if (p === "/admin/channels/" + roomId + "/messages")
      return reply({
        items:
          url.searchParams.get("pinned") === "1"
            ? messages.filter((m) => m.is_pinned)
            : messages,
        nextCursor: null,
        highWaterMark: 2,
      });
    if (p === "/admin/channels/" + roomId + "/updates")
      return reply({ items: [], cursor: 2, hasMore: false });
    if (p === "/admin/teams/" + fictionalTeam.id + "/chat")
      return reply({
        teamId: fictionalTeam.id,
        teamName: fictionalTeam.name,
        teamActive: true,
        canSetUp: true,
        channel: {
          id: roomId,
          name: channel.name,
          archived: false,
          canSend: true,
          canManage: true,
        },
      });
    if (p.startsWith(formRoot + "/") || p.startsWith("/admin/channels/")) {
      unexpected.push(p);
      return route.fulfill({
        status: 404,
        json: {
          error: {
            code: "NOT_FOUND",
            message: "Unmapped fictional review read",
          },
        },
      });
    }
    return route.fallback();
  });
  return { media, newsletter, writes, errors, unexpected };
}

async function capture(page: Page, info: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator("#workspace-content h1")).toHaveCount(1);
  expect(await accessibility(page)).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  // Verify that an overflowing modal can reach its bottom without trapping the user.
  const dialog = page.getByRole("dialog");
  const modal = (await dialog.count()) === 1;
  const save = async (label: string) => {
    const path = info.outputPath(label.replaceAll(" ", "-") + ".png");
    await page.screenshot({ path, fullPage: !modal, animations: "disabled" });
    await info.attach(label, { path, contentType: "image/png" });
  };
  if (modal) {
    const dimensions = await dialog.evaluate((node) => ({
      height: node.clientHeight,
      scroll: node.scrollHeight,
    }));
    if (dimensions.scroll > dimensions.height) {
      await dialog.evaluate((node) => {
        node.scrollTop = node.scrollHeight;
      });
      await expect
        .poll(() => dialog.evaluate((node) => node.scrollTop))
        .toBeGreaterThan(0);
    }
    await save(name + " lower controls");
    await dialog.evaluate((node) => {
      node.scrollTop = 0;
    });
  } else if (
    await page.evaluate(
      () => document.documentElement.scrollHeight > innerHeight,
    )
  ) {
    await page.evaluate(() => scrollTo(0, 500));
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
    await page.evaluate(() => scrollTo(0, 0));
  }
  await save(name);
}

for (const state of [
  "response analytics",
  "individual response",
  "media inspector",
  "builder logic",
  "builder settings",
  "team announcements",
  "team conversation",
  "channel conversation",
  "campaign preview",
] as const)
  test(`secondary ${state} composition remains readable and accessible`, async ({
    page,
    fixture,
  }, info) => {
    fixture.authenticated = true;
    fixture.teamReview = true;
    fixture.formBuilder = true;
    const records = await installRecords(page);
    if (state === "response analytics" || state === "individual response") {
      await page.goto(formRoot + "/responses");
      await expect(
        page.getByRole("button", {
          name: "Open response " + responseId,
          exact: true,
        }),
      ).toBeEnabled();
      if (state === "response analytics") {
        await page.getByRole("tab", { name: "Summary", exact: true }).click();
        await expect(
          page.getByRole("heading", {
            name: "8 matching responses",
            exact: true,
          }),
        ).toBeVisible();
        await expect(page.locator("meter")).toHaveCount(10);
        await expect(
          page.getByRole("meter", {
            name: "Fictional experience level: Beginner",
            exact: true,
          }),
        ).toHaveAttribute("aria-valuetext", "4 of 8 answers");
        await expect(
          page.getByRole("meter", {
            name: "Fictional workshop interests: Accessible web, Interested",
            exact: true,
          }),
        ).toHaveAttribute("value", "6");
        const groups = page.locator(".gt-response-summary");
        for (const group of await groups.all()) {
          const heading = await group.locator("h3").boundingBox();
          const bars = group.locator(".gt-summary-bar");
          for (const bar of await bars.all()) {
            const rect = await bar.boundingBox();
            expect(rect!.y).toBeGreaterThanOrEqual(
              heading!.y + heading!.height,
            );
            const label = await bar.locator("span").first().boundingBox();
            const meter = await bar.locator("meter").boundingBox();
            expect(meter!.width).toBeGreaterThan(0);
            expect(meter!.x).toBeGreaterThanOrEqual(label!.x + label!.width);
          }
        }
        await expect(
          page.getByText("Accessibility: mean rank 1.50", { exact: true }),
        ).toBeVisible();
      } else {
        await page
          .getByRole("button", {
            name: "Open response " + responseId,
            exact: true,
          })
          .click();
        await expect(
          page
            .getByRole("dialog")
            .getByText("Fictional stored answer", { exact: true }),
        ).toBeVisible();
      }
    } else if (state === "media inspector") {
      await page.goto("/admin/media");
      await page
        .getByRole("button", { name: records.media.file.name, exact: true })
        .click();
      await expect(
        page
          .getByRole("region", { name: "Selected media file" })
          .getByLabel("Display name", { exact: false }),
      ).toHaveValue(records.media.file.name);
    } else if (state === "builder logic" || state === "builder settings") {
      await page.goto(formRoot + "/edit");
      await page
        .getByRole("button", {
          name: "Edit " + form.fields[0].label,
          exact: true,
        })
        .click();
      // The explicit Edit question control opens its inspector dialog at every
      // viewport; selecting the canvas itself uses the desktop inline inspector.
      const inspector = page.getByRole("dialog");
      await inspector
        .getByRole("tab", {
          name: state === "builder logic" ? "Logic" : "Settings",
          exact: true,
        })
        .click();
      await expect(
        inspector.getByLabel(
          state === "builder logic" ? "Show this field when" : "Access mode",
          { exact: false },
        ),
      ).toBeVisible();
    } else if (
      state === "team announcements" ||
      state === "team conversation"
    ) {
      await page.goto(
        "/admin/team/" +
          fictionalTeam.id +
          "?section=" +
          (state === "team announcements" ? "announcements" : "chat"),
      );
      await expect(
        state === "team announcements"
          ? page.getByText(fictionalTeamPost.title, { exact: true })
          : page.getByRole("link", { name: "Open team chat", exact: true }),
      ).toBeVisible();
    } else if (state === "channel conversation") {
      await page.goto("/admin/channels?room=" + roomId);
      await expect(
        page
          .getByRole("log", { name: "Room messages" })
          .getByText(messages[1].message, { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Pinned messages", exact: true }),
      ).toBeEnabled();
    } else {
      await page.goto("/admin/newsletter");
      await page
        .getByRole("button", {
          name: records.newsletter.record.subject,
          exact: true,
        })
        .click();
      await expect(page.getByLabel("Subject", { exact: false })).toHaveValue(
        records.newsletter.record.subject,
      );
      await page
        .getByRole("button", { name: "Preview saved email", exact: true })
        .click();
      await expect(
        page
          .frameLocator('iframe[title="Saved email preview"]')
          .getByRole("heading", { name: "Fictional chapter update" }),
      ).toBeVisible();
    }
    await capture(page, info, state);
    expect(records.writes).toEqual([]);
    expect(records.errors).toEqual([]);
    expect(records.unexpected).toEqual([]);
    expect(fixture.unexpected).toEqual([]);
    expect(fixture.writes).toEqual([]);
  });
