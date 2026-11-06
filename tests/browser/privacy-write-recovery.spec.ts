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

async function setup(
  page: Page,
  action: "review" | "commit",
  loss: "before" | "after" | "none",
  requested = "redact",
) {
  const receipts = new Map<string, Record<string, unknown>>(),
    state = {
      lost: false,
      denied: false,
      attempts: [] as {
        path: string;
        body: Record<string, unknown>;
        key: string | undefined;
      }[],
      reviews: 0,
      commits: 0,
    };
  await page.route("**/api/v1/admin/privacy**", (route) => {
    const r = route.request(),
      path = new URL(r.url()).pathname,
      reply = (data: unknown) => route.fulfill({ json: { data } });
    if (path.endsWith("/recovery")) {
      if (state.denied)
        return route.fulfill({
          status: 403,
          json: {
            error: {
              code: "FORBIDDEN",
              message: "Fictional privacy outcome unavailable",
            },
          },
        });
      const key = r.headers()["idempotency-key"],
        original = state.attempts.find((v) => v.key === key)!,
        body = { ...original.body };
      delete body.currentPassword;
      expect(r.postDataJSON()).toEqual(body);
      let receipt = receipts.get(key) || null;
      if (receipt && path.includes("/commit/")) {
        const { export: bytes, ...metadata } = receipt;
        void bytes;
        receipt = {
          ...metadata,
          ...(requested === "export" ? { downloadExpired: true } : {}),
        };
      }
      return reply({ committed: !!receipt, canRetry: !receipt, receipt });
    }
    if (r.method() === "POST") {
      const key = r.headers()["idempotency-key"],
        kind = path.endsWith("/review") ? "review" : "commit";
      state.attempts.push({ path, body: r.postDataJSON(), key });
      if (kind === action && !state.lost && loss === "before") {
        state.lost = true;
        return route.abort("connectionfailed");
      }
      if (!receipts.has(key)) {
        if (kind === "review") state.reviews++;
        else state.commits++;
        receipts.set(
          key,
          kind === "review"
            ? {
                reviewId,
                reviewToken: "f".repeat(43),
                action: requested,
                expiresAt: new Date(Date.now() + 300000).toISOString(),
                count: 1,
                heldCount: 0,
                records: [
                  {
                    kind: "contact",
                    id: recordId,
                    parentId: null,
                    held: false,
                    source: "inquiry",
                    label: "Fictional reviewed contact",
                  },
                ],
              }
            : {
                action: requested,
                count: 1,
                ...(requested === "export"
                  ? {
                      export: [
                        {
                          kind: "contact",
                          data: { message: "Fictional private export only" },
                        },
                      ],
                    }
                  : {
                      pendingFiles: 0,
                      pendingExports: 0,
                      remainingMatches: 0,
                    }),
              },
        );
      }
      if (kind === action && !state.lost && loss === "after") {
        state.lost = true;
        return route.abort("connectionfailed");
      }
      return reply(receipts.get(key));
    }
    return reply({ items: [recent] });
  });
  await page.goto("/admin/privacy");
  await fill(page);
  await page
    .getByRole("combobox", { name: /Requested action/ })
    .selectOption(requested);
  await page
    .getByRole("button", { name: "Generate exact record review", exact: true })
    .click();
  if (action === "commit") {
    await expect(
      page.getByRole("heading", {
        name: "2. Inspect the exact record review",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: /Privacy action confirmation/ })
      .fill(requested.toUpperCase() + " 1 RECORDS");
    await page
      .getByLabel("Current password for final approval", { exact: true })
      .fill("Fictional current proof");
    await page
      .getByRole("button", {
        name:
          requested === "export"
            ? "Prepare reviewed JSON"
            : "Confirm " + requested,
        exact: true,
      })
      .click();
  }
  if (loss !== "none")
    await expect(
      page.getByRole("region", {
        name: "Unconfirmed privacy request",
        exact: true,
      }),
    ).toBeVisible();
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

for (const action of ["review", "commit"] as const)
  for (const loss of ["before", "after"] as const)
    test(`privacy original ${action} ${loss} loss preserves exact scope and fresh-proof retry`, async ({
      page,
      fixture,
    }, info) => {
      fixture.authenticated = true;
      const state = await setup(page, action, loss),
        original = state.attempts.at(-1)!;
      await expect(
        page.getByRole("button", {
          name: "Refresh cleanup status",
          exact: true,
        }),
      ).toBeDisabled();
      await expect(
        page.getByRole("button", {
          name: "Retry identical privacy request",
          exact: true,
        }),
      ).toBeDisabled();
      expect(await accessibility(page)).toEqual([]);
      if (loss === "after")
        await page.screenshot({
          path: info.outputPath("unknown-privacy-" + action + ".png"),
          fullPage: true,
          animations: "disabled",
        });
      await page
        .getByRole("button", {
          name: "Check original privacy outcome",
          exact: true,
        })
        .click();
      if (loss === "before") {
        await page
          .getByLabel("Current password for original privacy retry *", {
            exact: true,
          })
          .fill("New explicit proof");
        await page
          .getByRole("button", {
            name: "Retry identical privacy request",
            exact: true,
          })
          .click();
        const last = state.attempts.at(-1)!,
          a = { ...original.body },
          b = { ...last.body };
        delete a.currentPassword;
        delete b.currentPassword;
        expect(b).toEqual(a);
        expect(last.key).toBe(original.key);
      }
      await expect(
        page.getByRole("region", {
          name: "Unconfirmed privacy request",
          exact: true,
        }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("heading", {
          name:
            action === "review"
              ? "2. Inspect the exact record review"
              : "Reviewed records processed",
          exact: true,
        }),
      ).toBeVisible();
      expect(state.reviews).toBe(1);
      expect(state.commits).toBe(action === "commit" ? 1 : 0);
      expect(await accessibility(page)).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(fixture.unexpected).toEqual([]);
    });
test("privacy original denial clears private scope and prepared comparison", async ({
  page,
  fixture,
}) => {
  fixture.authenticated = true;
  const state = await setup(page, "commit", "before");
  state.denied = true;
  await page
    .getByRole("button", {
      name: "Check original privacy outcome",
      exact: true,
    })
    .click();
  await expect(
    page.getByText(/reviews and cleanup counters have been cleared/),
  ).toBeVisible();
  await expect(
    page.getByRole("region", {
      name: "Unconfirmed privacy request",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel("Exact requester email", { exact: true }),
  ).toHaveValue("");
  expect(state.commits).toBe(0);
  expect(fixture.unexpected).toEqual([]);
});
test("stopping an unknown accepted privacy approval cannot create another request", async ({
  page,
  fixture,
}) => {
  fixture.authenticated = true;
  const state = await setup(page, "commit", "after");
  await page
    .getByText("Review stopping privacy recovery", { exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Stop tracking this privacy request",
      exact: true,
    })
    .click();
  await expect(page.getByText(/Privacy recovery stopped/)).toBeVisible();
  await expect(
    page.getByLabel("Exact requester email", { exact: true }),
  ).toHaveValue("");
  expect(state.commits).toBe(1);
  expect(state.attempts).toHaveLength(2);
  expect(fixture.unexpected).toEqual([]);
});
test("accepted lost privacy export confirms prepared state without replaying private bytes", async ({
  page,
  fixture,
}) => {
  fixture.authenticated = true;
  const state = await setup(page, "commit", "after", "export");
  await page
    .getByRole("button", {
      name: "Check original privacy outcome",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Export prepared", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: "Download prepared privacy export",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Fictional private export only", { exact: true }),
  ).toHaveCount(0);
  expect(state.commits).toBe(1);
  expect(state.attempts).toHaveLength(2);
  expect(fixture.unexpected).toEqual([]);
});
test("confirmed privacy export waits for explicit download and can clear the private handoff", async ({
  page,
  fixture,
}) => {
  fixture.authenticated = true;
  const downloads: string[] = [];
  page.on("download", (d) => downloads.push(d.suggestedFilename()));
  const state = await setup(page, "commit", "none", "export");
  const link = page.getByRole("link", {
    name: "Download prepared privacy export",
    exact: true,
  });
  await expect(link).toBeVisible();
  expect(downloads).toEqual([]);
  const [file] = await Promise.all([
    page.waitForEvent("download"),
    link.click(),
  ]);
  expect(file.suggestedFilename()).toBe("privacy-export-" + reviewId + ".json");
  await file.delete();
  await page
    .getByRole("button", { name: "Clear prepared export", exact: true })
    .click();
  await expect(link).toHaveCount(0);
  expect(state.commits).toBe(1);
  expect(await accessibility(page)).toEqual([]);
  expect(fixture.unexpected).toEqual([]);
});
