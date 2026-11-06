import { test, expect, accessibility } from "./public-fixture";
import type { Page } from "@playwright/test";
const reviewId = "f1350000-0000-4000-8000-000000000001",
  recordId = "f1350000-0000-4000-8000-000000000002",
  recent = {
    reviewId,
    action: "delete",
    count: 2,
    createdAt: "2026-11-06T12:00:00Z",
    completedAt: "2026-11-06T12:02:00Z",
    expiresAt: "2099-11-06T12:05:00Z",
    pendingFiles: 2,
    pendingExports: 1,
  };
async function setup(page: Page) {
  const state = { failure: false, denied: false, reviewed: 0, commits: 0 };
  await page.route("**/api/v1/admin/privacy**", (route) => {
    const r = route.request(),
      path = new URL(r.url()).pathname;
    if (path.endsWith("/review")) {
      state.reviewed++;
      return route.fulfill({
        json: {
          data: {
            reviewId,
            reviewToken: "f".repeat(43),
            action: "export",
            expiresAt: new Date(Date.now() + 60000).toISOString(),
            count: 1,
            heldCount: 0,
            records: [
              {
                kind: "contact",
                id: recordId,
                parentId: null,
                held: false,
                source: "self_reported",
                label: "Fictional reviewed contact scope",
              },
            ],
          },
        },
      });
    }
    if (r.method() !== "GET") {
      state.commits++;
      return route.fulfill({
        status: 403,
        json: {
          error: {
            code: "FORBIDDEN",
            message: "Fictional privacy commit disabled",
          },
        },
      });
    }
    if (state.denied || state.failure)
      return route.fulfill({
        status: state.denied ? 403 : 503,
        json: {
          error: {
            code: state.denied ? "FORBIDDEN" : "TEMPORARILY_UNAVAILABLE",
            message: state.denied
              ? "Fictional privacy unavailable"
              : "Fictional privacy metadata outage",
          },
        },
      });
    return route.fulfill({ json: { data: { items: [recent] } } });
  });
  return state;
}
async function fill(page: Page) {
  await expect(
    page.getByText("2 files · 1 export", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Exact requester email", { exact: true })
    .fill("fictional-requester@example.test");
  await page
    .getByRole("textbox", { name: /Request purpose/ })
    .fill("Independently verified fictional privacy request.");
  await page
    .getByRole("checkbox", { name: /I independently verified/ })
    .check();
  await page
    .getByLabel("Current password for scope review", { exact: true })
    .fill("Fictional local proof");
}
async function review(page: Page) {
  await fill(page);
  await page
    .getByRole("button", { name: "Generate exact record review", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "2. Inspect the exact record review",
      exact: true,
    }),
  ).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Refresh cleanup status", exact: true }),
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
test("privacy initial metadata retry is read-only and retains dated scope through a later outage", async ({
  page,
  fixture,
}, info) => {
  fixture.authenticated = true;
  const state = await setup(page);
  state.failure = true;
  await page.goto("/admin/privacy");
  await expect(
    page.getByText("Fictional privacy metadata outage", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Generate exact record review",
      exact: true,
    }),
  ).toBeDisabled();
  state.failure = false;
  await page
    .getByRole("button", { name: "Retry privacy cleanup status", exact: true })
    .click();
  await fill(page);
  state.failure = true;
  await page
    .getByRole("button", { name: "Refresh cleanup status", exact: true })
    .click();
  await expect(
    page.getByText("Fictional privacy metadata outage", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Showing cleanup status from/)).toBeVisible();
  await expect(
    page.getByText("2 files · 1 export", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Exact requester email", { exact: true }),
  ).toHaveValue("fictional-requester@example.test");
  await verify(page);
  await page.screenshot({
    path: info.outputPath("retained-privacy-scope.png"),
    fullPage: true,
    animations: "disabled",
  });
  expect(state.reviewed).toBe(0);
  expect(state.commits).toBe(0);
  expect(fixture.unexpected).toEqual([]);
});
test("privacy prepared review survives private metadata outage and protects navigation and comparison", async ({
  page,
  fixture,
}, info) => {
  fixture.authenticated = true;
  const state = await setup(page);
  await page.goto("/admin/privacy");
  await review(page);
  const table = page.getByRole("region", {
    name: "Reviewed privacy records",
    exact: true,
  });
  await expect(table).toHaveAttribute("tabindex", "0");
  await table.focus();
  await expect(table).toBeFocused();
  await page
    .getByRole("textbox", { name: /Privacy action confirmation/ })
    .fill("EXPORT 1 RECORDS");
  await page
    .getByLabel("Current password for final approval", { exact: true })
    .fill("Fictional final proof");
  state.failure = true;
  await page
    .getByRole("button", { name: "Refresh cleanup status", exact: true })
    .click();
  await expect(
    page.getByText("Fictional privacy metadata outage", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Fictional reviewed contact scope", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Prepare reviewed JSON", exact: true }),
  ).toBeDisabled();
  await verify(page);
  await page.screenshot({
    path: info.outputPath("retained-privacy-review.png"),
    fullPage: true,
    animations: "disabled",
  });
  state.failure = false;
  await page
    .getByRole("button", { name: "Retry privacy cleanup status", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Prepare reviewed JSON", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Back to scope", exact: true })
    .click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Stay here", exact: true }).click();
  await expect(
    page.getByText("Fictional reviewed contact scope", { exact: true }),
  ).toBeVisible();
  expect(state.reviewed).toBe(1);
  expect(state.commits).toBe(0);
  expect(fixture.unexpected).toEqual([]);
});
test("privacy current denial clears scope review proof and cleanup counters until explicit recheck", async ({
  page,
  fixture,
}) => {
  fixture.authenticated = true;
  const state = await setup(page);
  await page.goto("/admin/privacy");
  await review(page);
  await page
    .getByLabel("Current password for final approval", { exact: true })
    .fill("Fictional proof to clear");
  state.denied = true;
  await page
    .getByRole("button", { name: "Refresh cleanup status", exact: true })
    .click();
  await expect(
    page.getByText(
      /Private scope, reviews and cleanup counters have been cleared/,
    ),
  ).toBeVisible();
  await expect(
    page.getByText("Fictional reviewed contact scope", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("2 files · 1 export", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel("Exact requester email", { exact: true }),
  ).toHaveValue("");
  await verify(page);
  state.denied = false;
  await page
    .getByRole("button", { name: "Refresh cleanup status", exact: true })
    .click();
  await expect(
    page.getByText("2 files · 1 export", { exact: true }),
  ).toBeVisible();
  const table = page.getByRole("region", {
    name: "Privacy cleanup request table",
    exact: true,
  });
  await expect(table).toHaveAttribute("tabindex", "0");
  expect(state.reviewed).toBe(1);
  expect(state.commits).toBe(0);
  expect(fixture.unexpected).toEqual([]);
});
