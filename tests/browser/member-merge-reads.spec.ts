import { test, expect, accessibility } from "./public-fixture";
import type { Page } from "@playwright/test";
const sourceId = "f8320000-0000-4000-8000-000000000001";
const source = {
  id: sourceId,
  name: "Fictional source member",
  email: "fictional-source@example.test",
  reference: "FICTIONAL-SOURCE",
  revision: 1,
  phone: "",
  year: "",
  major: "",
  category: "member",
  interests: [],
  is_active: true,
  is_core_team: false,
  team_section: "Active Members",
  team_id: null,
  teamName: null,
  deleted_at: null,
  merged_into_id: null,
  actions: ["read", "update", "merge"],
  publicProfile: null,
  canSyncProfile: false,
  activeProjectCount: 0,
};
const targets = Array.from({ length: 65 }, (_, i) => ({
  ...source,
  id: "f8330000-0000-4000-8000-" + String(i + 1).padStart(12, "0"),
  name: "Eligible " + String(i + 1).padStart(3, "0"),
  email: "fictional-canonical-" + i + "@example.test",
  reference: "FICTIONAL-TARGET-" + i,
}));
async function setup(page: Page) {
  const state = {
    failure: "",
    denied: false,
    previews: 0,
    merges: 0,
    targetRevision: 1,
  };
  await page.route("**/api/v1/admin/members**", (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname;
    const reply = (data: unknown) => route.fulfill({ json: { data } });
    if (path.endsWith("/merge-preview")) {
      state.previews++;
      const body = request.postDataJSON();
      return reply({
        reviewId: "f8320000-0000-4000-8000-000000000009",
        reviewToken: "f".repeat(43),
        source,
        target: {
          ...targets.find((t) => t.id === body.targetId),
          revision: state.targetRevision,
        },
        policy:
          "Fictional retained source review; canonical fields remain unchanged.",
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      });
    }
    if (request.method() !== "GET") {
      state.merges++;
      return route.fulfill({
        status: 403,
        json: {
          error: {
            code: "FORBIDDEN",
            message: "Fictional record mutation disabled",
          },
        },
      });
    }
    const kind = path.includes("/merge-candidates")
      ? "candidates"
      : path.includes("/merge-target/")
        ? "target"
        : "directory";
    if ((state.denied && kind === "target") || state.failure === kind)
      return route.fulfill({
        status: state.denied ? 404 : 503,
        json: {
          error: {
            code: state.denied ? "NOT_FOUND" : "TEMPORARILY_UNAVAILABLE",
            message: state.denied
              ? "Fictional selection unavailable"
              : "Fictional " + kind + " outage",
          },
        },
      });
    if (path.endsWith("/capabilities"))
      return reply({ globalCreate: true, merge: true, teams: [] });
    if (path.endsWith("/activity"))
      return reply({ items: [], page: 1, pageSize: 30 });
    if (kind === "candidates") {
      const page = Number(url.searchParams.get("page") || 1),
        q = url.searchParams.get("q") || "",
        all = targets.filter((t) =>
          t.name.toLowerCase().includes(q.toLowerCase()),
        );
      return reply({
        items: all.slice((page - 1) * 30, page * 30),
        total: all.length,
        page,
        pageSize: 30,
        sourceRevision: 1,
      });
    }
    if (kind === "target")
      return reply({
        member: {
          ...targets.find((t) => t.id === path.split("/").at(-1)),
          revision: state.targetRevision,
        },
        sourceRevision: 1,
      });
    if (path.endsWith("/members"))
      return reply({
        items: [source],
        total: 1,
        pageSize: 30,
        stats: { active: 1, core: 0, categories: { member: 1 } },
      });
    return reply({ member: source });
  });
  return state;
}
async function open(page: Page) {
  await page.goto("/admin/members?member=" + sourceId);
  await page
    .getByRole("button", { name: "Review duplicate merge", exact: true })
    .click();
  await expect(
    page.getByText(/65 eligible members in this owning scope/),
  ).toBeVisible();
}
async function select(page: Page, index = 0) {
  await page
    .getByLabel("Canonical member to keep")
    .selectOption(targets[index].id);
  await expect(
    page.getByRole("button", { name: "Generate current review", exact: true }),
  ).toBeEnabled();
}
async function verify(page: Page) {
  expect(await accessibility(page)).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
test("merge candidate paging reaches eligible target 65 and preserves independent off-page selection", async ({
  page,
  fixture,
}, info) => {
  fixture.authenticated = true;
  const state = await setup(page);
  await open(page);
  await page
    .getByRole("button", { name: "Next canonical members", exact: true })
    .click();
  await expect(
    page.getByRole("option", {
      name: targets[30].name + " · " + targets[30].email,
    }),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "Next canonical members", exact: true })
    .click();
  await select(page, 64);
  await page
    .getByRole("button", { name: "Previous canonical members", exact: true })
    .click();
  await expect(
    page.getByRole("option", { name: "Selected canonical member" }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Generate current review", exact: true }),
  ).toBeEnabled();
  expect(state.previews).toBe(0);
  expect(state.merges).toBe(0);
  await verify(page);
  await page.screenshot({
    path: info.outputPath("complete-merge-picker.png"),
    fullPage: true,
    animations: "disabled",
  });
  expect(fixture.unexpected).toEqual([]);
});
test("merge reviewed target read failure preserves comparison and pauses approval until independent retry", async ({
  page,
  fixture,
}, info) => {
  fixture.authenticated = true;
  const state = await setup(page);
  await open(page);
  await select(page);
  await page
    .getByRole("button", { name: "Generate current review", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Compare before merging", exact: true }),
  ).toBeFocused();
  const region = page.getByRole("region", {
    name: "Private member comparison",
    exact: true,
  });
  await expect(region).toHaveAttribute("tabindex", "0");
  await region.focus();
  await expect(region).toBeFocused();
  state.failure = "target";
  await page
    .getByRole("button", { name: "Recheck merge selection", exact: true })
    .click();
  await expect(page.getByText(/Fictional target outage/)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Compare before merging", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm retained merge", exact: true }),
  ).toBeDisabled();
  await verify(page);
  await page.screenshot({
    path: info.outputPath("retained-merge-comparison.png"),
    fullPage: true,
    animations: "disabled",
  });
  state.failure = "";
  await page
    .getByRole("button", { name: "Retry canonical member", exact: true })
    .click();
  await expect(page.getByText(/Fictional target outage/)).toHaveCount(0);
  await page
    .getByRole("button", { name: "Close merge review", exact: true })
    .click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Stay here", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Compare before merging", exact: true }),
  ).toBeVisible();
  expect(state.previews).toBe(1);
  expect(state.merges).toBe(0);
  expect(fixture.unexpected).toEqual([]);
});
test("merge selected target denial conceals private comparison and requires explicit selection recheck", async ({
  page,
  fixture,
}) => {
  fixture.authenticated = true;
  const state = await setup(page);
  await open(page);
  await select(page);
  await page
    .getByRole("button", { name: "Generate current review", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Compare before merging", exact: true }),
  ).toBeVisible();
  state.denied = true;
  await page
    .getByRole("button", { name: "Recheck merge selection", exact: true })
    .click();
  await expect(
    page.getByText(/Private records and edits have been cleared/),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Compare before merging", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("option", {
      name: targets[0].name + " · " + targets[0].email,
    }),
  ).toHaveCount(0);
  await verify(page);
  state.denied = false;
  await page
    .getByRole("button", { name: "Recheck member access", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Review duplicate merge", exact: true })
    .click();
  await select(page);
  await expect(
    page.getByRole("button", { name: "Generate current review", exact: true }),
  ).toBeEnabled();
  await verify(page);
});
