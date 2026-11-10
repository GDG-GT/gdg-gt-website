import { readFile } from "node:fs/promises";
import { test, expect, accessibility } from "./public-fixture";
import { emailDocument } from "../../shared/email.mjs";

test("subscription email shows the chapter mark and a readable confirmation button", async ({
  page,
}, info) => {
  const url = "http://127.0.0.1:4173/email-brand-fixture";
  await page.route(url, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: emailDocument({
        subject: "Confirm your GDG at Georgia Tech subscription",
        content:
          "Get chapter news and event updates. Confirm your email below.\n\nThis button expires in 24 hours. If you didn’t sign up, you can ignore this email.",
        actions: [
          {
            label: "Confirm subscription",
            url: "https://gdggt.dev/newsletter/confirm#token=fictional",
          },
        ],
      }),
    }),
  );
  const logo = await readFile("public/logo.png");
  await page.route("https://gdggt.dev/logo.png", (route) =>
    route.fulfill({ contentType: "image/png", body: logo }),
  );
  await page.goto(url);
  await expect(
    page.getByRole("heading", {
      name: "Confirm your GDG at Georgia Tech subscription",
    }),
  ).toBeVisible();
  const action = page.getByRole("link", {
    name: "Confirm subscription",
    exact: true,
  });
  await expect(action).toBeVisible();
  expect((await action.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(
    await page
      .locator("img")
      .evaluate((img) => (img as HTMLImageElement).naturalWidth),
  ).toBeGreaterThan(0);
  expect(await accessibility(page)).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("subscription-email.png"),
    fullPage: true,
  });
});
