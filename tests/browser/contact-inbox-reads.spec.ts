import { test, expect, accessibility } from "./public-fixture";
import type { Page } from "@playwright/test";
const id = "f1340000-0000-4000-8000-000000000001",
  seed = {
    id,
    name: "Fictional inquiry sender",
    email: "fictional-inquiry@example.test",
    type: "general",
    message: "Fictional private inquiry for browser read recovery.",
    interests: [],
    status: "new",
    revision: 1,
    createdAt: "2026-11-06T12:00:00Z",
    resolvedAt: null,
    redactedAt: null as string | null,
    hold: false,
    holdReason: null,
    attachment: {
      id: "f1340000-0000-4000-8000-000000000002",
      filename: "fictional-private.txt",
      state: "clean",
      bytes: 20,
      canDownload: true,
    },
  };
async function setup(page: Page) {
  const state = {
    failure: "",
    denied: false,
    record: structuredClone(seed),
    writes: [] as string[],
  };
  await page.route("**/api/v1/admin/contact-submissions**", (route) => {
    const r = route.request(),
      url = new URL(r.url()),
      op = url.pathname.endsWith("/attachment")
        ? "attachment"
        : url.pathname.endsWith("/contact-submissions")
          ? "inventory"
          : "detail";
    if (r.method() !== "GET") {
      state.writes.push(r.method() + " " + url.pathname);
      return route.fulfill({
        status: 403,
        json: {
          error: {
            code: "FORBIDDEN",
            message: "Fictional browser record writes disabled",
          },
        },
      });
    }
    if ((state.denied && op === "detail") || state.failure === op)
      return route.fulfill({
        status: state.denied ? 404 : 503,
        json: {
          error: {
            code: state.denied ? "NOT_FOUND" : "TEMPORARILY_UNAVAILABLE",
            message: "Fictional " + op + " outage",
          },
        },
      });
    return route.fulfill({
      json: {
        data:
          op === "attachment"
            ? {
                url: "https://storage.example.test/fictional-private-download",
                filename: "fictional-private.txt",
                expiresIn: 60,
              }
            : {
                items: [state.record],
                total: 51,
                page: Number(url.searchParams.get("page") || 1),
              },
      },
    });
  });
  return state;
}
async function open(page: Page) {
  await page.goto("/admin/communications?tab=contact&contact=" + id);
  await expect(
    page.getByRole("heading", { name: seed.name, exact: true }),
  ).toBeVisible();
}
async function verify(page: Page, state: { writes: string[] }) {
  expect(state.writes).toEqual([]);
  expect(await accessibility(page)).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
test("selected inquiry has an initial read-only retry and retained proposal across a later refresh failure", async ({
  page,
  fixture,
}, info) => {
  fixture.authenticated = true;
  const state = await setup(page);
  state.failure = "detail";
  await page.goto("/admin/communications?tab=contact&contact=" + id);
  await expect(
    page.getByText("Fictional detail outage", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry selected inquiry", exact: true }),
  ).toBeEnabled();
  state.failure = "";
  await page
    .getByRole("button", { name: "Retry selected inquiry", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: seed.name, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Inquiry status", exact: true })
    .selectOption("in_progress");
  state.failure = "detail";
  await page
    .getByRole("button", { name: "Refresh inquiry", exact: true })
    .click();
  await expect(
    page.getByText("Fictional detail outage", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Inquiry status", exact: true }),
  ).toHaveValue("in_progress");
  await expect(
    page.getByRole("button", { name: "Save inquiry status", exact: true }),
  ).toBeDisabled();
  await expect(page.getByText(/Showing inquiries from/)).toBeVisible();
  await verify(page, state);
  await page.screenshot({
    path: info.outputPath("retained-private-inquiry.png"),
    fullPage: true,
    animations: "disabled",
  });
  state.failure = "";
  await page
    .getByRole("button", { name: "Retry selected inquiry", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Save inquiry status", exact: true }),
  ).toBeEnabled();
  expect(fixture.unexpected).toEqual([]);
});
test("stale inquiry proposal reload requires review and current redaction removes prior private fields", async ({
  page,
  fixture,
}) => {
  fixture.authenticated = true;
  const state = await setup(page);
  await open(page);
  await page
    .getByRole("combobox", { name: "Inquiry status", exact: true })
    .selectOption("in_progress");
  state.record = { ...state.record, revision: 2, status: "resolved" };
  await page
    .getByRole("button", { name: "Refresh inquiry", exact: true })
    .click();
  await expect(page.getByText(/This inquiry changed/)).toBeVisible();
  await page
    .getByRole("button", {
      name: "Review loading current inquiry",
      exact: true,
    })
    .click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Stay here", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Inquiry status", exact: true }),
  ).toHaveValue("in_progress");
  await page
    .getByRole("button", {
      name: "Review loading current inquiry",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Discard and leave", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Inquiry status", exact: true }),
  ).toHaveValue("resolved");
  state.record = {
    ...state.record,
    name: "Removed contact",
    email: "",
    message: "Removed by contact retention.",
    interests: [],
    revision: 3,
    status: "redacted",
    redactedAt: new Date().toISOString(),
  };
  await page
    .getByRole("button", { name: "Refresh inquiry", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Removed contact", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(seed.message, { exact: true })).toHaveCount(0);
  await expect(page.getByText(seed.email, { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("combobox", { name: "Inquiry status", exact: true }),
  ).toHaveCount(0);
  await verify(page, state);
  expect(fixture.unexpected).toEqual([]);
});
test("authorized inquiry file link is cleared on unverified context and private denial clears the parent", async ({
  page,
  fixture,
}) => {
  fixture.authenticated = true;
  const state = await setup(page);
  await open(page);
  await page
    .getByRole("button", { name: "Prepare private download", exact: true })
    .click();
  await expect(
    page.getByRole("link", {
      name: "Download fictional-private.txt",
      exact: true,
    }),
  ).toBeVisible();
  state.failure = "detail";
  await page
    .getByRole("button", { name: "Refresh inquiry", exact: true })
    .click();
  await expect(
    page.getByText("Fictional detail outage", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: "Download fictional-private.txt",
      exact: true,
    }),
  ).toHaveCount(0);
  state.failure = "";
  await page
    .getByRole("button", { name: "Retry selected inquiry", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Prepare private download", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("link", {
      name: "Download fictional-private.txt",
      exact: true,
    }),
  ).toHaveCount(0);
  state.denied = true;
  await page
    .getByRole("button", { name: "Refresh inquiry", exact: true })
    .click();
  await expect(
    page.getByText(/Private records and reviews have been cleared/),
  ).toBeVisible();
  await expect(page.getByText(seed.message, { exact: true })).toHaveCount(0);
  await verify(page, state);
  state.denied = false;
  await page
    .getByRole("button", { name: "Refresh inquiry", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: seed.name, exact: true }),
  ).toBeVisible();
  expect(fixture.unexpected).toEqual([]);
});
test("failed later inbox page has a previous escape and a filtered error can reset its filters", async ({
  page,
  fixture,
}) => {
  fixture.authenticated = true;
  const state = await setup(page);
  await page.goto("/admin/communications?tab=contact");
  const table = page.getByRole("region", {
    name: "Protected contact inquiries",
    exact: true,
  });
  await expect(table).toHaveAttribute("tabindex", "0");
  await table.focus();
  await expect(table).toBeFocused();
  state.failure = "inventory";
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    page.getByText("Fictional inventory outage", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Previous", exact: true }),
  ).toBeEnabled();
  state.failure = "";
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(
    page.getByRole("button", { name: seed.name, exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Search contact inquiries", { exact: true })
    .fill("Fictional filter");
  state.failure = "inventory";
  await page
    .getByRole("button", { name: "Search inquiries", exact: true })
    .click();
  await expect(
    page.getByText("Fictional inventory outage", { exact: true }),
  ).toBeVisible();
  state.failure = "";
  await page
    .getByRole("button", { name: "Reset inquiry filters", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: seed.name, exact: true }),
  ).toBeVisible();
  await verify(page, state);
  expect(fixture.unexpected).toEqual([]);
});

test("contact search controls stay mounted and focused while results load", async ({
  page,
  fixture,
}) => {
  fixture.authenticated = true;
  const state = await setup(page);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/admin/contact-submissions?**", async (route) => {
    if (new URL(route.request().url()).searchParams.get("q")) await held;
    await route.fallback();
  });
  try {
    await page.goto("/admin/communications?tab=contact");
    await expect(page.getByText(seed.email, { exact: true })).toBeVisible();
    const search = page.getByRole("searchbox", {
      name: "Search contact inquiries",
      exact: true,
    });
    await search.scrollIntoViewIfNeeded();
    const before = await search.boundingBox();
    await search.fill("fictional");
    await search.press("Enter");
    const loading = page.getByRole("status", {
      name: "Loading contact inbox",
      exact: true,
    });
    await expect(loading).toBeVisible();
    await expect(search).toBeFocused();
    expect(
      Math.abs((await search.boundingBox())!.y - before!.y),
    ).toBeLessThanOrEqual(2);
    expect(
      (await loading.locator(".gt-skeleton").boundingBox())!.height,
    ).toBeLessThanOrEqual(64);
    release();
    await expect(loading).toHaveCount(0);
    await expect(search).toBeFocused();
    await verify(page, state);
  } finally {
    release();
  }
});
