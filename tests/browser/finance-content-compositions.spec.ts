import type { Page } from "@playwright/test";
import { test, expect } from "./public-fixture";
import { financeFixture } from "./operations-records";
import { captureSecondaryComposition as capture } from "./composition-capture";
import { financeStates } from "../../shared/finances.mjs";

const contentId = "fbbf0000-0000-4000-8000-000000000001";
const recordName = "Fictional chapter record";
const contentRecord = {
  id: contentId,
  revision: 1,
  is_active: false,
  deleted_at: null,
  team_id: null,
  updated_at: "2026-11-05T12:00:00Z",
  actions: ["update", "publish", "delete"],
  title: recordName,
  name: recordName,
  description:
    "Fictional approved learning opportunity for a chapter workshop.",
  type: "documentation",
  category: "Learning",
  url: "https://example.test/learning",
  level: "Beginner",
  status: "Available",
  provider: "Fictional chapter",
  duration: "One hour",
  tags: ["Fictional"],
  requirements: ["Bring a laptop"],
  materials: ["Fictional workshop notes"],
  color: "#E6705F",
  order_index: 1,
  logo_url: "/logo.png",
  website_url: "https://example.test",
  tier: "gold",
  role: "Fictional chapter officer",
  bio: "Fictional biography for a chapter content review.",
  image_url: "/logo.png",
  email: "fictional-officer@example.test",
  team_section: "Active Members",
};

async function records(page: Page, decision: boolean) {
  const finance = financeFixture();
  if (decision) {
    Object.assign(finance.record, {
      status: "pending",
      createdBy: "f1560000-0000-4000-8000-000000000009",
      submittedBy: "f1560000-0000-4000-8000-000000000009",
      creatorName: "Fictional request submitter",
      submittedAt: "2026-11-05T12:00:00Z",
      actions: ["admin_approve", "reject", "note"],
    });
  }
  expect(financeStates).toContain(finance.record.status);
  const writes: string[] = [],
    errors: string[] = [],
    unexpected: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/v1/**", (route) => {
    const request = route.request(),
      url = new URL(request.url());
    const p = url.pathname.replace("/api/v1", "");
    if (["/auth/realtime-token", "/realtime/token"].includes(p))
      return route.fallback();
    if (request.method() !== "GET") {
      writes.push(request.method() + " " + p);
      return route.fulfill({
        status: 403,
        json: {
          error: {
            code: "FORBIDDEN",
            message: "Read-only fictional composition review",
          },
        },
      });
    }
    const reply = (data: unknown) => route.fulfill({ json: { data } });
    if (p === "/admin/finances/report")
      return reply({
        months: [{ month: "2026-10", income: "100.00", expenses: "12.34" }],
        categories: [
          {
            category: "Fictional workshop supplies",
            transaction_type: "expense",
            amount: "12.34",
          },
        ],
        note: "Fictional scoped report",
      });
    if (p.startsWith("/admin/finances") || p.startsWith("/admin/budgets")) {
      const data = finance.response(p + url.search);
      return reply(
        decision && p === "/admin/finances"
          ? {
              ...data,
              stateCounts: { pending: 1 },
              summary: {
                completedIncome: "0.00",
                completedExpenses: "0.00",
                reservedExpenses: "0.00",
                awaitingApproval: 1,
                net: "0.00",
              },
            }
          : data,
      );
    }
    if (p.startsWith("/admin/content-records/")) {
      if (p.endsWith("/capabilities"))
        return reply({ globalCreate: true, teams: [] });
      if (p.endsWith("/" + contentId)) return reply({ record: contentRecord });
      if (
        /^\/admin\/content-records\/(resources|sponsors|team-profiles)$/.test(p)
      )
        return reply({
          items: [contentRecord],
          total: 1,
          page: 1,
          pageSize: 30,
        });
      unexpected.push(p);
      return route.fulfill({
        status: 404,
        json: { error: { code: "NOT_FOUND" } },
      });
    }
    return route.fallback();
  });
  return { finance, writes, errors, unexpected };
}

async function keyboardTable(page: Page, name: string) {
  const region = page.getByRole("region", { name, exact: true });
  await expect(region).toBeVisible();
  await region.focus();
  await expect(region).toBeFocused();
  const overflowing = await region.evaluate(
    (node) => node.scrollWidth > node.clientWidth,
  );
  if (overflowing) {
    await region.press("End");
    await expect
      .poll(() => region.evaluate((node) => node.scrollLeft))
      .toBeGreaterThan(0);
    await region.press("Home");
    await expect.poll(() => region.evaluate((node) => node.scrollLeft)).toBe(0);
  }
}

for (const state of [
  "finance request table",
  "budget allocation table",
  "finance draft editor",
  "budget draft editor",
  "budget management",
  "finance approval review",
  "finance rejection review",
  "finance report tables",
] as const) {
  test(`finance-content ${state} is readable and keyboard accessible`, async ({
    page,
    fixture,
  }, info) => {
    fixture.authenticated = true;
    const review = await records(page, state.includes("review"));
    const budget = state.startsWith("budget");
    await page.goto(
      "/admin/finances" +
        (budget
          ? "?tab=budgets"
          : state.includes("review")
            ? "?request=" + review.finance.id
            : state === "finance report tables"
              ? "?tab=reports"
              : ""),
    );
    await expect(
      page
        .getByText(
          budget
            ? review.finance.budget.name
            : state === "finance report tables"
              ? "Fictional scoped report"
              : review.finance.record.description,
          { exact: true },
        )
        .first(),
    ).toBeVisible();
    if (state === "finance request table")
      await keyboardTable(page, "Finance requests");
    if (state === "budget allocation table")
      await keyboardTable(page, "Budget allocations");
    if (state === "finance report tables") {
      await keyboardTable(page, "Completed finance activity by month");
      await keyboardTable(page, "Completed finance totals by category");
    }
    if (state === "finance draft editor") {
      await page
        .getByRole("button", { name: "New request", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "New finance request", exact: true }),
      ).toBeVisible();
    }
    if (state === "budget draft editor") {
      await page
        .getByRole("button", { name: "New allocation", exact: true })
        .click();
      await expect(
        page.getByRole("heading", {
          name: "New budget allocation",
          exact: true,
        }),
      ).toBeVisible();
    }
    if (state === "budget management") {
      await page
        .getByRole("button", {
          name: "Manage " + review.finance.budget.name,
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("heading", {
          name: review.finance.budget.name,
          exact: true,
        }),
      ).toBeVisible();
    }
    if (state.includes("review")) {
      const action = state.includes("rejection")
        ? "Reject request"
        : "Approve as administrator";
      await page.getByRole("button", { name: action, exact: true }).click();
      await expect(
        page.getByRole("heading", { name: action, exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Confirm decision", exact: true }),
      ).toBeDisabled();
    }
    await capture(page, info, state);
    expect(review.writes).toEqual([]);
    expect(review.errors).toEqual([]);
    expect(review.unexpected).toEqual([]);
    expect(fixture.unexpected).toEqual([]);
  });
}

for (const [state, route, action] of [
  ["resource editor", "resources", "Edit"],
  ["resource publication review", "resources", "Publish"],
  ["sponsor editor", "sponsors", "Edit"],
  ["sponsor archive review", "sponsors", "Archive"],
  ["team profile editor", "team", "Edit"],
] as const) {
  test(`finance-content ${state} is readable and keyboard accessible`, async ({
    page,
    fixture,
  }, info) => {
    fixture.authenticated = true;
    const review = await records(page, false);
    await page.goto("/admin/" + route);
    await expect(
      page.getByText(recordName, { exact: true }).first(),
    ).toBeVisible();
    await keyboardTable(
      page,
      (route === "resources"
        ? "Resources"
        : route === "sponsors"
          ? "Sponsors"
          : "Public team profiles") + " records",
    );
    await page
      .getByRole("button", { name: action + " " + recordName, exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name:
          action === "Edit"
            ? "Edit " + recordName
            : action === "Publish"
              ? "Publish this record?"
              : "Move this record to archive?",
        exact: true,
      }),
    ).toBeVisible();
    await capture(page, info, state);
    expect(review.writes).toEqual([]);
    expect(review.errors).toEqual([]);
    expect(review.unexpected).toEqual([]);
    expect(fixture.unexpected).toEqual([]);
  });
}
