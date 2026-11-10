import { test, expect, accessibility } from "./public-fixture";
import type { Page } from "@playwright/test";
const id = "f1320000-0000-4000-8000-000000000001";
const record = {
  id,
  reference: "FICTIONAL-READ-ONLY",
  name: "Fictional browser directory person",
  email: "fictional-directory-browser@example.test",
  phone: "",
  year: "",
  major: "",
  interests: ["Fictional interest"],
  category: "member",
  is_active: true,
  is_core_team: false,
  team_section: "Active Members",
  team_id: null,
  teamName: null,
  revision: 1,
  deleted_at: null,
  merged_into_id: null,
  actions: ["update", "delete", "merge"],
  publicProfile: null,
  canSyncProfile: false,
  activeProjectCount: 0,
};
async function setup(page: Page) {
  const state = {
    fail: new Set<string>(),
    denied: false,
    reads: [] as string[],
    writes: [] as string[],
    revision: 1,
  };
  await page.route("**/api/v1/admin/members**", (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname;
    if (request.method() !== "GET") {
      state.writes.push(request.method() + " " + path);
      return route.fulfill({
        status: 403,
        json: {
          error: {
            code: "FORBIDDEN",
            message: "Fictional browser writes disabled",
          },
        },
      });
    }
    const kind = path.endsWith("/capabilities")
      ? "permissions"
      : path.endsWith("/activity")
        ? "activity"
        : path.endsWith("/members")
          ? "inventory"
          : "detail";
    state.reads.push(kind);
    if (state.denied && kind === "detail")
      return route.fulfill({
        status: 404,
        json: {
          error: {
            code: "NOT_FOUND",
            message: "Fictional current member unavailable",
          },
        },
      });
    if (state.fail.has(kind))
      return route.fulfill({
        status: 503,
        json: {
          error: {
            code: "TEMPORARILY_UNAVAILABLE",
            message: "Fictional " + kind + " outage",
          },
        },
      });
    return route.fulfill({
      json: {
        data:
          kind === "permissions"
            ? { globalCreate: true, merge: true, teams: [] }
            : kind === "inventory"
              ? {
                  items: [record],
                  total: 35,
                  pageSize: 30,
                  stats: { active: 35, core: 0, categories: { member: 35 } },
                }
              : kind === "activity"
                ? {
                    items: [
                      {
                        id: "fictional-activity",
                        action: "members.created",
                        result: "success",
                        created_at: "2026-11-06T12:00:00Z",
                      },
                    ],
                    page: 1,
                    pageSize: 30,
                  }
                : { member: { ...record, revision: state.revision } },
      },
    });
  });
  return state;
}
async function ready(page: Page, selected = false) {
  await expect(
    page.getByRole("button", { name: "New member", exact: true }),
  ).toBeEnabled();
  if (selected)
    await expect(
      page.getByRole("heading", { name: record.name, exact: true }),
    ).toBeVisible();
}
async function verify(page: Page, state: { writes: string[] }) {
  expect(state.writes).toEqual([]);
  expect(await accessibility(page)).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
test("member permission retry remains independent from a successful populated inventory", async ({
  page,
  fixture,
}, info) => {
  fixture.authenticated = true;
  const state = await setup(page);
  state.fail.add("permissions");
  await page.goto("/admin/members");
  await expect(page.getByText(/Fictional permissions outage/)).toBeVisible();
  await expect(page.getByText(record.email)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "New member", exact: true }),
  ).toBeDisabled();
  const before = state.reads.filter((k) => k === "inventory").length;
  state.fail.clear();
  await page
    .getByRole("button", { name: "Retry member permissions", exact: true })
    .click();
  await ready(page);
  expect(state.reads.filter((k) => k === "inventory")).toHaveLength(before);
  await verify(page, state);
  expect(fixture.unexpected).toEqual([]);
  await page.screenshot({
    path: info.outputPath("populated-directory-read.png"),
    fullPage: true,
    animations: "disabled",
  });
});
test("member detail outage preserves the typed proposal and stale revisions block saving", async ({
  page,
  fixture,
}, info) => {
  fixture.authenticated = true;
  const state = await setup(page);
  await page.goto("/admin/members?member=" + id);
  await ready(page, true);
  await page.getByRole("button", { name: "Edit member", exact: true }).click();
  await page
    .getByLabel("Name *", { exact: true })
    .fill("Preserved fictional proposal");
  state.fail.add("detail");
  await page
    .getByRole("button", { name: "Recheck member access", exact: true })
    .click();
  await expect(page.getByText(/Fictional detail outage/)).toBeVisible();
  await expect(page.getByLabel("Name *", { exact: true })).toHaveValue(
    "Preserved fictional proposal",
  );
  await expect(
    page.getByRole("button", { name: "Save member changes", exact: true }),
  ).toBeDisabled();
  await expect(page.getByText(/Showing selected member from/)).toBeVisible();
  await verify(page, state);
  await page.screenshot({
    path: info.outputPath("retained-directory-proposal.png"),
    fullPage: true,
    animations: "disabled",
  });
  state.fail.clear();
  state.revision = 2;
  await page
    .getByRole("button", { name: "Retry selected member", exact: true })
    .click();
  await expect(
    page.getByText(/This record or your access changed/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save member changes", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Close editor", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Stay here", exact: true }).click();
  await expect(page.getByLabel("Name *", { exact: true })).toHaveValue(
    "Preserved fictional proposal",
  );
  await verify(page, state);
  expect(fixture.unexpected).toEqual([]);
});
test("member denial clears private fields and requires an explicit current access recheck", async ({
  page,
  fixture,
}) => {
  fixture.authenticated = true;
  const state = await setup(page);
  await page.goto("/admin/members?member=" + id);
  await ready(page, true);
  await page.getByRole("button", { name: "Edit member", exact: true }).click();
  await page
    .getByLabel("Name *", { exact: true })
    .fill("Private denied proposal");
  state.denied = true;
  await page
    .getByRole("button", { name: "Recheck member access", exact: true })
    .click();
  await expect(
    page.getByText(/Private records and edits have been cleared/),
  ).toBeVisible();
  await expect(page.getByText(record.email)).toHaveCount(0);
  await expect(page.getByLabel("Name *", { exact: true })).toHaveCount(0);
  await verify(page, state);
  const before = state.reads.length;
  await expect(
    page.getByRole("button", { name: "New member", exact: true }),
  ).toBeDisabled();
  expect(state.reads).toHaveLength(before);
  state.denied = false;
  await page
    .getByRole("button", { name: "Recheck member access", exact: true })
    .click();
  await ready(page, true);
  await verify(page, state);
  expect(fixture.unexpected).toEqual([]);
});
test("member activity retries independently and a failed later page retains a previous-page escape", async ({
  page,
  fixture,
}) => {
  fixture.authenticated = true;
  const state = await setup(page);
  state.fail.add("activity");
  await page.goto("/admin/members?member=" + id);
  await ready(page, true);
  await expect(page.getByText(/Fictional activity outage/)).toBeVisible();
  const before = state.reads.filter((k) => k === "detail").length;
  state.fail.clear();
  await page
    .getByRole("button", { name: "Retry member activity", exact: true })
    .click();
  await expect(page.getByText("created", { exact: true })).toBeVisible();
  expect(state.reads.filter((k) => k === "detail")).toHaveLength(before);
  state.fail.add("inventory");
  await page.getByRole("button", { name: "Next members", exact: true }).click();
  await expect(page.getByText(/Fictional inventory outage/)).toBeVisible();
  await expect(page.getByText(record.email)).toHaveCount(1);
  state.fail.clear();
  await page
    .getByRole("button", { name: "Previous members", exact: true })
    .click();
  await ready(page, true);
  await verify(page, state);
  expect(fixture.unexpected).toEqual([]);
});

test("typing a member search keeps its position and focus during a slow read", async ({
  page,
  fixture,
}, info) => {
  fixture.authenticated = true;
  const state = await setup(page);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/admin/members?**", async (route) => {
    if (new URL(route.request().url()).searchParams.get("q")) await held;
    await route.fallback();
  });
  try {
    await page.goto("/admin/members");
    await ready(page);
    const search = page.getByRole("searchbox", {
      name: "Search private members",
      exact: true,
    });
    await search.scrollIntoViewIfNeeded();
    await search.focus();
    const before = await search.boundingBox();
    await search.pressSequentially("ani", { delay: 20 });
    const loading = page.getByRole("status", {
      name: "Loading member inventory",
      exact: true,
    });
    await expect(loading).toBeVisible();
    const during = await search.boundingBox(),
      placeholder = await loading.locator(".gt-skeleton").boundingBox();
    expect(Math.abs(during!.y - before!.y)).toBeLessThanOrEqual(2);
    expect(placeholder!.height).toBeLessThanOrEqual(64);
    expect(placeholder!.y).toBeGreaterThan(during!.y + during!.height);
    await expect(search).toBeFocused();
    await expect(search).toHaveValue("ani");
    await page.screenshot({
      path: info.outputPath("member-search-pending.png"),
      animations: "disabled",
    });
    release();
    await expect(loading).toHaveCount(0);
    await expect(search).toBeFocused();
    await verify(page, state);
  } finally {
    release();
  }
});
