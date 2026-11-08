import { test, expect, accessibility } from "./public-fixture";

test.describe("Dedicated leaderboard host", () => {
  test.use({ frontendHost: "leaderboards.gdggt.dev" });
  test("uses the root and member URLs without showing the chapter homepage", async ({
    page,
    fixture,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/v1/rewards/leaderboard**", (r) =>
      r.fulfill({
        json: { data: { items: [], total: 0, perks: [], ssoAvailable: false } },
      }),
    );
    await page.route("**/api/v1/rewards/me", (r) =>
      r.fulfill({
        status: 401,
        json: {
          error: { code: "AUTH_REQUIRED", message: "Sign in required." },
        },
      }),
    );
    await page.goto("https://leaderboards.gdggt.dev/");
    await expect(
      page.getByRole("heading", { name: "Show up. Build. Give back." }),
    ).toBeVisible();
    await expect(page).toHaveURL("https://leaderboards.gdggt.dev/");
    await expect(page.getByRole("contentinfo")).toHaveCount(0);
    await expect(
      page.getByRole("navigation", { name: "Main navigation", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", {
        name: "GDG@GT member leaderboard",
        exact: true,
      }),
    ).toHaveAttribute("href", "/");
    await page
      .getByRole("link", { name: "My membership", exact: true })
      .click();
    await expect(page).toHaveURL("https://leaderboards.gdggt.dev/member");
    await expect(
      page.getByRole("button", {
        name: "Sign in with Georgia Tech",
        exact: true,
      }),
    ).toBeDisabled();
    await page.getByRole("link", { name: "Leaderboard", exact: true }).click();
    await expect(page).toHaveURL("https://leaderboards.gdggt.dev/");
    expect(await accessibility(page)).toEqual([]);
    expect(errors).toEqual([]);
    expect(fixture.writes).toEqual([]);
    expect(fixture.unexpected).toEqual([]);
  });
});

test.describe("Chapter host", () => {
  test.use({ frontendHost: "gdggt.dev" });
  test("has no leaderboard or member routes", async ({ page, fixture }) => {
    for (const path of ["/leaderboard", "/leaderboard/member", "/member"]) {
      await page.goto("https://gdggt.dev" + path);
      await expect(
        page.getByRole("heading", { name: /off the beaten path/i }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Show up. Build. Give back." }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", {
          name: "Sign in with Georgia Tech",
          exact: true,
        }),
      ).toHaveCount(0);
    }
    expect(fixture.unexpected).toEqual([]);
    expect(fixture.writes).toEqual([]);
  });
});
