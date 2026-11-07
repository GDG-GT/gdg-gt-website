import type { Page, TestInfo } from "@playwright/test";
import { expect, accessibility } from "./public-fixture";

export async function captureSecondaryComposition(
  page: Page,
  info: TestInfo,
  name: string,
) {
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator("#workspace-content h1")).toHaveCount(1);
  expect(await accessibility(page)).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  // Verify that an overflowing modal can reach its bottom without trapping the user.
  const dialog = page.getByRole("dialog");
  const modal = (await dialog.count()) === 1;
  const save = async (label: string) => {
    const path = info.outputPath(label.replaceAll(" ", "-") + ".png");
    await page.screenshot({ path, fullPage: !modal, animations: "disabled" });
    await info.attach(label, { path, contentType: "image/png" });
  };
  if (modal) {
    const dimensions = await dialog.evaluate((node) => ({
      height: node.clientHeight,
      scroll: node.scrollHeight,
    }));
    if (dimensions.scroll > dimensions.height) {
      await dialog.evaluate((node) => {
        node.scrollTop = node.scrollHeight;
      });
      await expect
        .poll(() => dialog.evaluate((node) => node.scrollTop))
        .toBeGreaterThan(0);
    }
    await save(name + " lower controls");
    await dialog.evaluate((node) => {
      node.scrollTop = 0;
    });
  } else if (
    await page.evaluate(
      () => document.documentElement.scrollHeight > innerHeight,
    )
  ) {
    await page.evaluate(() => scrollTo(0, 500));
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
    await page.evaluate(() => scrollTo(0, 0));
  }
  await save(name);
}
