import { test, expect, accessibility } from "./public-fixture";
const deviceId = "f1530000-0000-4000-8000-000000000001";
test("notification settings save categories and disable only the selected device", async ({ page, fixture }, info) => {
  fixture.authenticated = true;
  let preferences = { forms: true, events: true, newsletter: true, accounts: true, id: true, contact: true, workspace: true };
  let devices = [{ id: deviceId, installationId: deviceId, platform: "ios", label: "iPhone app", lastSeen: "2026-11-10T12:00:00Z" }];
  const writes: string[] = [];
  await page.route("**/api/v1/admin/app-notifications**", route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (request.method() === "PATCH") { writes.push(path); preferences = request.postDataJSON(); return route.fulfill({ json: { data: { saved: true } } }); }
    if (request.method() === "DELETE") { expect(path).toBe("/api/v1/admin/app-notifications/devices/" + deviceId); writes.push(path); devices = []; return route.fulfill({ json: { data: { removed: true } } }); }
    return route.fulfill({ json: { data: { preferences, devices, config: { ios: true, web: false } } } });
  });
  await page.goto("/admin/notifications");
  const forms = page.getByRole("checkbox", { name: "Form responses", exact: true });
  await expect(forms).toBeChecked(); await forms.uncheck();
  await expect(page.getByText("Notification preferences saved.", { exact: true })).toBeVisible();
  await expect(forms).not.toBeChecked(); expect(preferences.forms).toBe(false);
  expect(await accessibility(page)).toEqual([]);
  await page.screenshot({ path: info.outputPath("notification-settings.png"), fullPage: true });
  await page.getByRole("button", { name: "Turn off iPhone app", exact: true }).click();
  await expect(page.getByText("Notifications turned off for that device.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Turn off iPhone app", exact: true })).toHaveCount(0);
  expect(writes).toHaveLength(2); expect(fixture.unexpected).toEqual([]);
});
test("profile accepts a pasted LinkedIn address and visibly identifies the failing field", async ({ page, fixture }, info) => {
  fixture.authenticated = true;
  await page.route("**/api/v1/admin/me", route => {
    if (route.request().method() !== "PATCH") return route.fallback();
    expect(route.request().postDataJSON().profile.linkedinUrl).toBe("https://www.linkedin.com/in/fictional-person");
    return route.fulfill({ status: 400, json: { error: { code: "VALIDATION_ERROR", message: "Check the highlighted fields.", fields: { "profile.githubUrl": "Check this field." } } } });
  });
  await page.goto("/admin/profile");
  await page.getByLabel("Full name", { exact: false }).fill("Fictional officer");
  await page.getByLabel("Chapter role", { exact: false }).fill("Builder");
  await page.getByLabel("LinkedIn URL", { exact: true }).fill("www.linkedin.com/in/fictional-person");
  const github = page.getByLabel("GitHub URL", { exact: true }); await github.fill("invalid link");
  await page.getByRole("button", { name: "Save team profile", exact: true }).click();
  await expect(github).toHaveAttribute("aria-invalid", "true");
  await expect(github).toHaveCSS("border-top-color", "rgb(180, 35, 24)");
  await expect(page.getByText("GitHub URL: Enter a valid public HTTPS address.", { exact: true })).toBeVisible();
  await github.scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath("visible-profile-field-error.png") });
  expect(await accessibility(page)).toEqual([]);
  await github.fill("github.com/fictional"); await expect(github).toHaveAttribute("aria-invalid", "false");
  expect(fixture.unexpected).toEqual([]);
});
test("member import accepts the untouched organization roster structure", async ({ page, fixture }) => {
  fixture.authenticated = true;
  await page.route("**/api/v1/admin/members**", route => route.request().method() === "GET" ? route.fulfill({ json: { data: new URL(route.request().url()).pathname.endsWith("/capabilities") ? { globalCreate: true, teams: [], merge: true } : { items: [], total: 0, pageSize: 30, stats: { active: 0, core: 0, categories: {} } } } }) : route.fallback());
  await page.goto("/admin/members"); await page.getByRole("button", { name: "Import CSV", exact: true }).click();
  await page.getByText("Paste CSV instead", { exact: true }).click();
  await page.getByLabel("CSV content", { exact: false }).fill('Organization Roster\n\nExample chapter,11/9/2026\nUsername,Card ID Number,First Name,Last Name,Campus Email,Preferred Email,Local Phone,Mobile Phone,Organization ID,Organization Name,Position Name,Position Start Date,Position End Date,Last Login\n(Hidden),(Hidden),Fictional,Person,person@example.test,(Hidden),(Hidden),(Hidden),434409,Example chapter,Member,(Hidden),(Hidden),(Hidden)\n(Hidden),(Hidden),Fictional,Person,person@example.test,(Hidden),(Hidden),(Hidden),434409,Example chapter,Primary Contact,(Hidden),(Hidden),(Hidden)');
  await page.getByRole("button", { name: "Validate pasted CSV", exact: true }).click();
  await expect(page.getByText(/Organization Roster detected\. 1 repeated position rows combined/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Review import", exact: true })).toBeEnabled();
  expect(fixture.writes).toEqual([]); expect(fixture.unexpected).toEqual([]);
});
