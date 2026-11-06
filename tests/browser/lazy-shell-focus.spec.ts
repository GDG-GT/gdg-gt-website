import { test, expect } from "./public-fixture";
test("a failed lazy shell shows the safe reload path without a developer error dump", async ({
  page,
  fixture,
}) => {
  fixture.authenticated = true;
  await page.route("**/assets/AdminShell-*.js", (route) =>
    route.abort("connectionfailed"),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Workspace", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "This page couldn’t load." }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Reload page" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Return home" })).toHaveAttribute(
    "href",
    "/",
  );
  await expect(
    page.getByText("Unexpected Application Error!", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Your saved data hasn’t been changed.", { exact: false }),
  ).toHaveCount(0);
  expect(fixture.unexpected).toEqual([]);
});
test("keyboard workspace entry waits for its route-lazy content landmark", async ({
  page,
  fixture,
}) => {
  fixture.authenticated = true;
  let release!: () => void,
    requested = false;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/assets/AdminShell-*.js", async (route) => {
    requested = true;
    await pending;
    await route.continue();
  });
  try {
    await page.goto("/");
    const entry = page.getByRole("button", { name: "Workspace", exact: true });
    await expect(entry).toBeVisible();
    await entry.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/admin$/);
    await expect.poll(() => requested).toBe(true);
    await expect(
      page.getByRole("status", { name: "Loading page", exact: true }),
    ).toBeVisible();
    release();
    await expect(page.locator("#workspace-content h1")).toBeVisible();
    await expect(page.locator("#workspace-content")).toBeFocused();
    expect(errors).toEqual([]);
    expect(fixture.unexpected).toEqual([]);
  } finally {
    release();
  }
});
for (const submit of ["Enter", "Subscribe"] as const)
  test(`footer ${submit} loads sign-in after a fictional gate acknowledgement`, async ({
    page,
    fixture,
  }) => {
    let requests = 0;
    await page.route("**/api/v1/newsletter/subscriptions", (route) => {
      expect(route.request().method()).toBe("POST");
      expect(route.request().postDataJSON().email).toBe(
        "fictional-gate@example.test",
      );
      requests++;
      return route.fulfill({ json: { data: { gateValid: true } } });
    });
    await page.goto("/");
    const input = page.locator("#newsletter-email");
    await input.fill("fictional-gate@example.test");
    if (submit === "Enter") await input.press("Enter");
    else
      await page
        .getByRole("button", { name: "Subscribe", exact: true })
        .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByLabel("Email Address", { exact: true }),
    ).toBeFocused();
    await expect(dialog.getByLabel("Password", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(input).toHaveValue("");
    expect(requests).toBe(1);
    expect(fixture.unexpected).toEqual([]);
  });
for (const maintenance of [false, true])
  test(`homepage renders early but keeps controls inert until ${maintenance ? "maintenance" : "live"} is confirmed`, async ({
    page,
    fixture,
  }) => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/v1/site-status", async (route) => {
      await pending;
      return route.fulfill({
        json: {
          data: {
            revision: 1,
            is_live: !maintenance,
            message: maintenance ? "Fictional maintenance notice" : "",
            redirect_url: "",
            button_text: "Chapter updates",
            auto_redirect: false,
          },
        },
      });
    });
    try {
      await page.goto("/", { waitUntil: "domcontentloaded" });
      const hero = page.locator(".gt-home-hero");
      await expect(hero).toBeVisible();
      await expect(page.locator(".gt-availability-frame")).toHaveJSProperty(
        "inert",
        true,
      );
      const action = hero.locator(".gt-hero-actions a").first();
      await action.focus();
      await expect(action).not.toBeFocused();
      await page.locator("#main-content").evaluate((element) => {
        element.setAttribute("data-owned-mount", "original");
      });
      release();
      if (maintenance) {
        await expect(page).toHaveURL(/\/maintenance$/);
        await expect(
          page.getByRole("heading", {
            name: "A little work behind the scenes.",
          }),
        ).toBeVisible();
      } else {
        await expect(page.locator(".gt-availability-frame")).toHaveJSProperty(
          "inert",
          false,
        );
        await expect(page.locator("#main-content")).toHaveAttribute(
          "data-owned-mount",
          "original",
        );
        await action.focus();
        await expect(action).toBeFocused();
      }
      expect(fixture.unexpected).toEqual([]);
    } finally {
      release();
    }
  });
