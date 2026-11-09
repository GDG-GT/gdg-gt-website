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
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("gdg:native-navigation", { detail: "/admin/forms" }),
    ),
  );
  await expect(page).toHaveURL(/\/admin\/forms$/);
  await expect(page.locator("#workspace-content")).toBeVisible();
  await page.getByRole("button", { name: "Find a tool", exact: true }).click();
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
