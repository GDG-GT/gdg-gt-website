import { test, expect, accessibility, fictionalBuilderForm } from "./public-fixture";

test("form settings persist an optional per-submission chapter email alert", async ({ page, fixture }, info) => {
  fixture.authenticated = true;
  fixture.formBuilder = true;
  await page.goto("/admin/forms/" + fictionalBuilderForm.id + "/edit");
  await page.getByRole(info.project.name.includes("mobile") ? "button" : "tab", { name: "Settings", exact: true }).click();
  const toggle = page.getByRole("switch", { name: "Email on every submission", exact: true });
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await expect.poll(() => fixture.formAttempts.filter(attempt => attempt.action === "draft").map(attempt => (attempt.body as { definition?: { settings?: { notifyOnSubmission?: boolean } } }).definition?.settings?.notifyOnSubmission).at(-1)).toBe(true);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  expect(await accessibility(page)).toEqual([]);
  await toggle.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("submission-email-setting.png"), animations: "disabled" });
  await toggle.uncheck();
  await expect.poll(() => fixture.formAttempts.filter(attempt => attempt.action === "draft").map(attempt => (attempt.body as { definition?: { settings?: { notifyOnSubmission?: boolean } } }).definition?.settings?.notifyOnSubmission).at(-1)).toBe(false);
});
