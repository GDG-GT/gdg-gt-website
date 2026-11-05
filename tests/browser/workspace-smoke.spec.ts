import { test, expect, accessibility } from "./public-fixture";
for (const path of ["/admin/profile", "/admin/forms", "/admin/guide", "/admin/events"]) {
  test(`workspace ${path} keeps shared labels and actions readable`, async ({
    page,
    fixture,
  }, info) => {
    fixture.authenticated = true;
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(path);
    const main = page.locator("#workspace-content");
    await expect(main.locator("h1")).toHaveCount(1);
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    expect(await accessibility(page)).toEqual([]);
    if (path === "/admin/profile") {
      const table = page.getByRole("region", { name: "Active sessions table" });
      await expect(table).toHaveAttribute("tabindex", "0");
      await table.focus();
      await expect(table).toBeFocused();
      if (
        await table.evaluate(
          (element) => element.scrollWidth > element.clientWidth,
        )
      ) {
        await page.keyboard.press("ArrowRight");
        await expect
          .poll(() => table.evaluate((element) => element.scrollLeft))
          .toBeGreaterThan(0);
      }
    }
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.screenshot({
      path: info.outputPath("workspace-review.png"),
      fullPage: true,
      animations: "disabled",
    });
    expect(errors).toEqual([]);
  });
}
