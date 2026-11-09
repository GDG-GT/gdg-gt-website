import { test, expect, accessibility } from "./public-fixture";

test("native workspace uses permitted app destinations and keeps all admin tools reachable", async ({
  page,
  fixture,
}, info) => {
  fixture.authenticated = true;
  await page.addInitScript(() => {
    Object.defineProperty(window, "gdgScanner", {
      value: { version: 1, wallet: false, admin: true },
    });
    Object.defineProperty(window, "webkit", {
      value: {
        messageHandlers: {
          gdgScanner: { postMessage: () => {} },
          gdgAdmin: {
            postMessage: (message: unknown) => {
              const native = window as Window & { nativeMessages?: unknown[] };
              (native.nativeMessages ||= []).push(message);
            },
          },
        },
      },
    });
  });
  await page.route("**/api/v1/admin/members**", (route) =>
    route.fulfill({
      json: {
        data: route.request().url().includes("/capabilities")
          ? { globalCreate: true, merge: true, teams: [] }
          : {
              items: [],
              total: 0,
              pageSize: 30,
              stats: { active: 0, core: 0, categories: {} },
            },
      },
    }),
  );
  await page.route("**/api/v1/admin/rewards**", (route) =>
    route.fulfill({
      json: {
        data: {
          members: [],
          total: 0,
          rules: [],
          activities: [],
          perks: [],
          credentials: [],
          ledger: [],
          claims: [],
          walletAvailable: false,
        },
      },
    }),
  );
  await page.goto("/admin");
  await expect(page.locator(".gt-native-workspace")).toBeVisible();
  await expect(page.locator(".gt-sidebar")).toHaveCount(0);
  await expect(page.locator(".gt-workspace-topbar")).toBeHidden();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as Window & {
            nativeMessages?: {
              action: string;
              destinations?: { path: string }[];
            }[];
          }
        ).nativeMessages?.some(
          (m) =>
            m.action === "state" &&
            m.destinations?.some((d) => d.path === "/admin/forms"),
        ),
      ),
    )
    .toBeTruthy();
  for (const path of ["/admin/events", "/admin/rewards", "/admin/members"]) {
    await page.evaluate(
      (path) =>
        window.dispatchEvent(
          new CustomEvent("gdg:native-navigation", { detail: path }),
        ),
      path,
    );
    await expect(page).toHaveURL(
      new RegExp(
        path + (path === "/admin/rewards" ? "\\?view=scanner" : "") + "$",
      ),
    );
    if (path === "/admin/rewards")
      await expect(
        page.getByRole("heading", { name: "Check-in scanner", exact: true }),
      ).toBeVisible();
    await expect(page.locator("#workspace-content h1")).toBeVisible();
    await expect(page.locator(".gt-workspace-topbar")).toBeHidden();
  }
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("gdg:native-navigation", { detail: "back" }),
    ),
  );
  await expect(page).toHaveURL(/\/admin\/rewards\?view=scanner$/);
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("gdg:native-navigation", { detail: "/admin/forms" }),
    ),
  );
  await expect(page).toHaveURL(/\/admin\/forms$/);
  await expect(page.locator("#workspace-content")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open workspace navigation" }),
  ).toHaveCount(0);
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("gdg:native-navigation", { detail: "search" }),
    ),
  );
  await expect(
    page.getByRole("dialog", { name: "Go to a workspace" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "My profile", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/profile$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await accessibility(page)).toEqual([]);
  await page.screenshot({
    path: info.outputPath("native-workspace.png"),
    fullPage: true,
  });
});
