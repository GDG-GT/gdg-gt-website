import { test, expect } from "./public-fixture";
import type { Page } from "@playwright/test";

async function openWorkspacePage(page: Page, name: string) {
  const opener = page.getByRole("button", {
    name: "Open workspace navigation",
    exact: true,
  });
  if (await opener.isVisible()) await opener.click();
  await page
    .getByRole("navigation", { name: "Workspace navigation", exact: true })
    .getByRole("link", { name, exact: true })
    .click();
}

const destinations = [
  ["Events", "/admin/events"],
  ["Forms", "/admin/forms"],
  ["Operating guide", "/admin/guide"],
  ["My profile", "/admin/profile"],
  ["Dashboard", "/admin"],
] as const;
test("consecutive workspace links render the destination without refreshing", async ({
  page,
  fixture,
}) => {
  fixture.authenticated = true;
  await page.goto("/admin");
  await expect(page.locator("#workspace-content h1")).toHaveCount(1);
  const originalShell = await page
    .locator("#workspace-content")
    .elementHandle();
  for (const [name, path] of destinations) {
    const before = await page.locator("#workspace-content h1").textContent();
    await openWorkspacePage(page, name);
    await expect(page).toHaveURL(new RegExp(path.replaceAll("/", "\\/") + "$"));
    await expect(page.locator("#workspace-content h1")).toHaveCount(1);
    await expect(page.locator("#workspace-content h1")).not.toHaveText(
      before || "",
    );
    expect(await originalShell!.evaluate((node) => node.isConnected)).toBe(
      true,
    );
  }
  expect(fixture.writes).toEqual([]);
  expect(fixture.unexpected).toEqual([]);
});

test("a pending destination module replaces the previous page immediately and completes without refresh", async ({
  page,
  fixture,
}) => {
  fixture.authenticated = true;
  let release!: () => void,
    requested = false;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/assets/FormsLibrary-*.js", async (route) => {
    requested = true;
    await pending;
    await route.continue();
  });
  try {
    await page.goto("/admin");
    await expect(page.locator("#workspace-content h1")).toContainText(
      "Welcome back",
    );
    await openWorkspacePage(page, "Forms");
    await expect(page).toHaveURL(/\/admin\/forms$/);
    await expect.poll(() => requested).toBe(true);
    await expect(
      page.getByRole("heading", { name: /Welcome back/ }),
    ).toHaveCount(0, { timeout: 1000 });
    await expect(
      page.getByRole("status", { name: "Loading page", exact: true }),
    ).toBeVisible({ timeout: 1000 });
    release();
    await expect(page.locator("#workspace-content h1")).toHaveText("Forms");
    expect(fixture.writes).toEqual([]);
    expect(fixture.unexpected).toEqual([]);
  } finally {
    release();
  }
});

test("a stalled destination read offers retry and loads without a document refresh", async ({
  page,
  fixture,
}) => {
  fixture.authenticated = true;
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let reads = 0;
  await page.route("**/api/v1/admin/forms?**", async (route) => {
    reads++;
    if (reads === 1) {
      await held;
      await route.abort().catch(() => {});
    } else await route.fallback();
  });
  try {
    await page.goto("/admin");
    await expect(page.locator("#workspace-content h1")).toContainText(
      "Welcome back",
    );
    await openWorkspacePage(page, "Forms");
    await expect(page.locator("#workspace-content h1")).toHaveText("Forms");
    await expect(
      page.getByRole("alert").filter({
        hasText: "This information is taking too long to load. Try again.",
      }),
    ).toBeVisible({ timeout: 12000 });
    release();
    await page
      .getByRole("button", { name: "Recheck form library", exact: true })
      .click();
    await expect(
      page.getByText("Current authorized inventory loaded.", { exact: false }),
    ).toBeVisible();
    expect(reads).toBe(2);
    expect(fixture.writes).toEqual([]);
    expect(fixture.unexpected).toEqual([]);
  } finally {
    release();
  }
});

test("public links keep the site shell mounted and render each destination", async ({
  page,
  fixture,
}) => {
  await page.goto("/events");
  await expect(page.locator("h1")).toHaveCount(1);
  const originalShell = await page.getByRole("contentinfo").elementHandle();
  for (const [name, path] of [
    ["Team", "/team"],
    ["Resources", "/resources"],
    ["Sponsors", "/sponsors"],
    ["Gallery", "/gallery"],
    ["Contact", "/contact"],
    ["Events", "/events"],
  ]) {
    const before = await page.locator("h1").textContent();
    const opener = page.getByRole("button", {
      name: "Open navigation",
      exact: true,
    });
    const mobile = await opener.isVisible();
    if (mobile) await opener.click();
    await page
      .getByRole("navigation", {
        name: mobile ? "Mobile navigation" : "Main navigation",
        exact: true,
      })
      .getByRole("link", { name, exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(path + "$"));
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("h1")).not.toHaveText(before || "");
    expect(await originalShell!.evaluate((node) => node.isConnected)).toBe(
      true,
    );
  }
  expect(fixture.writes).toEqual([]);
  expect(fixture.unexpected).toEqual([]);
});

test("a delayed public route replaces home with a loading state before the chunk arrives", async ({
  page,
  fixture,
}) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/assets/PublicPages-*.js", async (route) => {
    await pending;
    await route.continue();
  });
  try {
    await page.goto("/");
    await expect(page.locator("h1")).toBeVisible();
    const home = await page.locator("h1").elementHandle();
    await page
      .getByRole("link", { name: "Upcoming Events", exact: true })
      .click();
    await expect(page).toHaveURL(/\/events$/);
    await expect(
      page.getByRole("status", { name: "Loading page", exact: true }),
    ).toBeVisible({ timeout: 1000 });
    expect(await home!.evaluate((node) => node.isConnected)).toBe(false);
    release();
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(
      page.getByRole("status", { name: "Loading page", exact: true }),
    ).toHaveCount(0);
    expect(fixture.writes).toEqual([]);
    expect(fixture.unexpected).toEqual([]);
  } finally {
    release();
  }
});

test("workspace navigation reuses known access while a fresh inventory can still revoke it", async ({
  page,
  fixture,
}) => {
  fixture.authenticated = true;
  await page.goto("/admin");
  await expect(page.locator("#workspace-content h1")).toContainText(
    "Welcome back",
  );
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested = false;
  const duplicateChecks: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      url.pathname === "/api/v1/admin/access" &&
      url.searchParams.has("route")
    )
      duplicateChecks.push(url.search);
  });
  await page.route("**/api/v1/admin/access", async (route) => {
    requested = true;
    await held;
    await route.fulfill({
      json: { data: { accessibleRoutes: ["/admin"], grants: [] } },
    });
  });
  try {
    await openWorkspacePage(page, "Forms");
    await expect.poll(() => requested).toBe(true);
    await expect(page.locator("#workspace-content h1")).toHaveText("Forms");
    await expect(
      page.getByText("Checking access…", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Current authorized inventory loaded.", { exact: false }),
    ).toBeVisible();
    expect(duplicateChecks).toEqual([]);
    release();
    await expect(
      page.getByText("This workspace is restricted", { exact: true }),
    ).toBeVisible();
    await expect(page.locator("#workspace-content h1")).toHaveCount(0);
    expect(fixture.writes).toEqual([]);
    expect(fixture.unexpected).toEqual([]);
  } finally {
    release();
  }
});
