import { test, expect, accessibility } from "./public-fixture";
import { mediaFixture } from "./operations-records";
test("Super Admin security review handles a lost result without a duplicate rotation", async ({ page, fixture }, info) => {
  fixture.authenticated = true;
  let committed = false, attempts = 0;
  await page.route("**/api/v1/admin/security**", async (route) => {
    const request = route.request(), url = new URL(request.url());
    if (request.method() === "GET") return route.fulfill({ json: { data: url.pathname.endsWith("/gate")
      ? { committed, version: committed ? 8 : 7 }
      : { version: 7, rotatedAt: "2026-11-01T12:00:00Z", checkedAt: "2026-11-07T12:00:00Z", activeAccounts: 3, activeSessions: 4, lockedAccounts: 0, setupRequired: 1 } } });
    const body = request.postDataJSON();
    expect(request.method()).toBe("POST"); expect(body.expectedVersion).toBe(7); expect(body.confirmation).toBe("ROTATE GATE");
    expect(body.currentPassword).toBe("Fictional browser proof"); expect(request.headers()["idempotency-key"]).toBeTruthy();
    committed = true; attempts++; await route.abort("connectionfailed");
  });
  await page.goto("/admin/users"); await page.getByText("Account security", { exact: true }).click();
  await expect(page.getByText("Active sessions", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Rotate gate code", exact: true }).click();
  await page.getByLabel(/^New gate code/).fill("Fictional chapter gate code of sufficient length");
  await page.getByLabel("Repeat new gate code", { exact: true }).fill("Fictional chapter gate code of sufficient length");
  await page.getByRole("button", { name: "Review gate rotation", exact: true }).click();
  await page.getByLabel("Your current password", { exact: true }).fill("Fictional browser proof");
  await page.getByLabel("Type ROTATE GATE to confirm", { exact: true }).fill("ROTATE GATE");
  expect(await accessibility(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("reviewed-security.png"), fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: "Confirm gate rotation", exact: true }).click();
  await expect(page.getByText(/rotation result is unconfirmed/)).toBeVisible();
  await expect(page.getByLabel("Your current password", { exact: true })).toHaveValue("");
  await page.getByRole("button", { name: "Check original rotation result", exact: true }).click();
  await expect(page.getByText(/original rotation completed/)).toBeVisible(); expect(attempts).toBe(1); expect(fixture.unexpected).toEqual([]);
});
test("Operations clears a previous protected snapshot on current denial", async ({ page, fixture }) => {
  fixture.authenticated = true;
  let denied = false;
  await page.route("**/api/v1/admin/operations", (route) => route.fulfill(denied
    ? { status: 403, json: { error: { code: "FORBIDDEN", message: "Fictional current permission denied" } } }
    : { json: { data: { checkedAt: "2026-11-07T12:00:00Z", lastEvaluatedAt: "2026-11-07T12:00:00Z", installedAt: "2026-11-01T12:00:00Z", alerts: [], rateAggregates: [], jobs: [{ job_name: "Fictional private retention job", state: "completed", started_at: "2026-11-07T12:00:00Z", counts: { done: 7 } }] } } }));
  await page.goto("/admin/operations"); await expect(page.getByText("Fictional private retention job", { exact: true })).toBeVisible();
  denied = true; await page.getByRole("button", { name: "Refresh status", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Fictional current permission denied");
  await expect(page.getByText("Fictional private retention job", { exact: true })).toHaveCount(0); expect(fixture.unexpected).toEqual([]);
});
test("Media pages send cursors and preserve backward navigation", async ({ page, fixture }) => {
  fixture.authenticated = true;
  const media = mediaFixture(), reads: URL[] = [];
  await page.route("**/api/v1/admin/media?**", (route) => {
    const url = new URL(route.request().url()); reads.push(url);
    expect(route.request().method()).toBe("GET"); expect(url.searchParams.has("page")).toBe(false);
    const data = media.response(url.pathname.slice(7) + url.search) as { items: typeof media.file[] };
    return route.fulfill({ json: { data: { ...data, total: 2, nextCursor: url.searchParams.has("cursor") ? null : "fictional-next-cursor",
      items: [{ ...media.file, name: url.searchParams.has("cursor") ? "Fictional cursor second page" : media.file.name }] } } });
  });
  await page.goto("/admin/media"); await expect(page.getByRole("button", { name: media.file.name, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next page", exact: true }).click(); await expect(page.getByRole("button", { name: "Fictional cursor second page", exact: true })).toBeVisible();
  expect(reads.at(-1)?.searchParams.get("cursor")).toBe("fictional-next-cursor");
  await expect(page.getByRole("button", { name: "Next page", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Previous page", exact: true }).click(); await expect(page.getByRole("button", { name: media.file.name, exact: true })).toBeVisible();
  expect(reads.at(-1)?.searchParams.has("cursor")).toBe(false); expect(fixture.unexpected).toEqual([]);
});
