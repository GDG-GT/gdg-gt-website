import { test, expect } from "./public-fixture";
import { financeFixture } from "./operations-records";
for (const empty of [false, true])
  test(`finance ${empty ? "empty" : "populated"} ledger ignores legacy planning figures`, async ({
    page,
    fixture,
  }) => {
    fixture.authenticated = true;
    const finance = financeFixture();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/v1/admin/{finances,budgets}**", (route) => {
      expect(route.request().method()).toBe("GET");
      const url = new URL(route.request().url());
      const path = url.pathname.replace("/api/v1", "");
      let data: unknown = finance.response(path + url.search);
      if (path.endsWith("/capabilities"))
        data = {
          ...(data as object),
          fundingReferences: [
            {
              source: "Legacy sample funding",
              amount: "9876.54",
              state: "Approved",
            },
          ],
          fundingNotice: "Legacy static planning notice",
        };
      if (path === "/admin/finances")
        data = {
          items: empty
            ? []
            : [{ ...finance.record, status: "completed", actions: [] }],
          total: empty ? 0 : 1,
          pageSize: 30,
          stateCounts: empty ? {} : { completed: 1 },
          summary: {
            completedIncome: empty ? "0.00" : "100.00",
            completedExpenses: empty ? "0.00" : "12.34",
            reservedExpenses: "0.00",
            awaitingApproval: 0,
            net: empty ? "0.00" : "87.66",
          },
        };
      if (path.endsWith("/report"))
        data = {
          months: empty
            ? []
            : [{ month: "2026-10", income: "100.00", expenses: "12.34" }],
          categories: [],
          note: "Authorized fixture ledger",
        };
      return route.fulfill({ json: { data } });
    });
    await page.goto("/admin/finances");
    await expect(page.locator("h1")).toBeVisible();
    const chart = page.locator(".gt-finance-report-grid > section");
    await expect(chart).toBeVisible();
    expect(await chart.evaluate(node => Math.abs(node.getBoundingClientRect().width - node.parentElement!.getBoundingClientRect().width))).toBeLessThanOrEqual(1);
    if (empty)
      await expect(
        page.getByText("No finance requests in this view", { exact: true }),
      ).toBeVisible();
    else
      await expect(
        page.getByText(finance.record.description, { exact: true }),
      ).toBeVisible();
    await expect(
      page.getByText("Legacy sample funding", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Legacy static planning notice", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", {
        name: "Approved planning funding",
        exact: true,
      }),
    ).toHaveCount(0);
    await page
      .getByRole("navigation", { name: "Finance sections" })
      .getByRole("button", { name: "Reports", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Authorized ledger report",
        exact: true,
      }),
    ).toBeVisible();
    const income = page
      .locator(".gt-finance-totals > div")
      .filter({ has: page.getByText("Completed income", { exact: true }) });
    await expect(income).toContainText(empty ? "$0.00" : "$100.00");
    if (empty)
      await expect(
        page.getByText("No completed activity in this filter.", {
          exact: true,
        }),
      ).toBeVisible();
    else
      await expect(
        page.getByRole("region", {
          name: "Completed finance activity by month",
        }),
      ).toContainText("$12.34");
    expect(errors).toEqual([]);
    expect(fixture.writes).toEqual([]);
    expect(fixture.unexpected).toEqual([]);
  });
