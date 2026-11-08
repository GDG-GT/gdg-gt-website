import { test, expect, accessibility } from "./public-fixture";
const routes = [
  "/admin",
  "/admin/events",
  "/admin/forms",
  "/admin/members",
  "/admin/teams",
  "/admin/communications",
  "/admin/channels",
  "/admin/whiteboard",
  "/admin/finances",
  "/admin/newsletter",
  "/admin/sponsors",
  "/admin/linktree",
  "/admin/content",
  "/admin/resources",
  "/admin/gallery",
  "/admin/media",
  "/admin/blog",
  "/admin/projects",
  "/admin/users",
  "/admin/site-status",
  "/admin/audit-log",
  "/admin/privacy",
  "/admin/operations",
  "/admin/guide",
  "/admin/profile",
];
test("complete super-admin navigation stays keyboard reachable without losing the sign-out controls", async ({
  page,
  fixture,
  browserName,
}, info) => {
  fixture.authenticated = true;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/v1/admin/access**", (route) =>
    route.fulfill({
      json: { data: { allowed: true, accessibleRoutes: routes } },
    }),
  );
  await page.goto("/admin");
  const mobile = info.project.name.includes("mobile");
  const opener = page.getByRole("button", {
    name: "Open workspace navigation",
  });
  if (mobile) {
    await opener.focus();
    await page.keyboard.press("Enter");
  }
  const navigation = page.getByRole("navigation", {
    name: "Workspace navigation",
    exact: true,
  });
  await expect(navigation).toBeVisible();
  await expect(navigation.getByRole("link")).toHaveCount(routes.length);
  const first = navigation.getByRole("link", {
      name: "Dashboard",
      exact: true,
    }),
    last = navigation.getByRole("link", { name: "My profile", exact: true });
  await first.focus();
  for (let i = 1; i < routes.length; i++)
    // WebKit's default keyboard mode skips links with plain Tab. Option+Tab
    // traverses clickable items without changing a browser/OS preference.
    await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
  await expect(last).toBeFocused();
  await expect(last).toBeInViewport();
  await expect
    .poll(() => navigation.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  const container = mobile
    ? page.getByRole("dialog", { name: "Workspace navigation" })
    : page.locator(".gt-sidebar");
  await expect(
    container.getByRole("button", { name: "Sign out", exact: true }),
  ).toBeInViewport();
  expect(await accessibility(page)).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("complete-navigation-last-links.png"),
    fullPage: true,
    animations: "disabled",
  });
  if (mobile) {
    await page.keyboard.press("Escape");
    await expect(container).toHaveCount(0);
    await expect(opener).toBeFocused();
    await page.locator("#workspace-content").focus();
    await opener.click();
    await expect(container).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(opener).toBeFocused();
    await opener.click();
    await container.getByRole("link", { name: "Forms", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/forms$/);
    await expect(container).toHaveCount(0);
    await expect(page.locator("#workspace-content")).toBeFocused();
    await expect(opener).not.toBeFocused();
  }
  const search = page.getByRole("button", {
    name: "Search the workspace · ⌘ K",
    exact: true,
  });
  await search.focus();
  await page.keyboard.press("Enter");
  const command = page.getByRole("dialog", { name: "Go to a workspace" });
  await expect(command).toBeVisible();
  await expect(
    command.getByRole("searchbox", { name: "Search workspace destinations" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(command).toHaveCount(0);
  await expect(search).toBeFocused();
  await page.locator("#workspace-content").focus();
  await page.keyboard.press("Control+k");
  await expect(command).toBeVisible();
  await expect(
    command.getByRole("searchbox", { name: "Search workspace destinations" }),
  ).toBeFocused();
  const currentDestination = mobile ? "Forms" : "Dashboard";
  await command
    .getByRole("link", { name: currentDestination, exact: true })
    .click();
  await expect(command).toHaveCount(0);
  await expect(page.locator("#workspace-content")).toBeFocused();
  expect(errors).toEqual([]);
  expect(fixture.unexpected).toEqual([]);
});
