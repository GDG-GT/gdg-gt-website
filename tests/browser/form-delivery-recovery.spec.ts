import {
  test,
  expect,
  accessibility,
  fictionalBuilderForm,
} from "./public-fixture";
import type { Page, Locator, TestInfo } from "@playwright/test";
const recipients = Array.from({ length: 215 }, (_, i) => ({
  id: "fbbb0000-0000-4000-8000-" + String(1000 + i).padStart(12, "0"),
  display_name: "Fictional browser recipient " + String(i + 1).padStart(3, "0"),
  role: "admin",
}));
async function setup(
  page: Page,
  selected: boolean,
  loss: "before" | "after",
  unavailable = false,
) {
  const form = {
      ...fictionalBuilderForm,
      status: "Draft",
      settings: {
        ...fictionalBuilderForm.settings,
        access: "internal",
        receipts: false,
      },
      actions: ["view", "edit", "manage_access", "view_responses"],
      versions: [],
    },
    root = "/admin/forms/" + form.id,
    base = root + "/delivery";
  let policy = {
    formId: form.id,
    formRevision: form.revision,
    revision: 0,
    matchesDraft: false,
    editable: true,
    reviewedAt: null as string | null,
    receipts: false,
    receiptAnswers: false,
    notificationUsers: unavailable ? [recipients[214].id] : ([] as string[]),
    chapterInbox: false,
    notificationAnswers: false,
    canReviewAnswers: true,
    mailReady: true,
    chapterInboxAvailable: true,
    selectedAccounts: unavailable
      ? [
          {
            ...recipients[214],
            display_name: "Unavailable chapter account",
            role: null as string | null,
            eligible: false,
          },
        ]
      : ([] as {
          id: string;
          display_name: string;
          role: string | null;
          eligible: boolean;
        }[]),
    reference: "DELIVERY " + form.id,
  };
  const state = {
      lost: false,
      commits: 0,
      failCandidates: false,
      attempts: [] as { key: string; body: string; proof: string }[],
    },
    receipts = new Map<string, number>();
  await page.route("**/api/v1/admin/forms/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname.replace("/api/v1", ""),
      method = request.method(),
      reply = (data: unknown, status = 200) =>
        route.fulfill({
          status,
          json:
            status === 200
              ? { data }
              : {
                  error: {
                    code: "UNAVAILABLE",
                    message: "Fictional recipient inventory outage.",
                  },
                },
        });
    if (method === "GET") {
      if (path === root) return reply({ form });
      if (path === base) return reply(policy);
      if (path === base + "/candidates") {
        const n = Number(url.searchParams.get("page") || 1),
          q = url.searchParams.get("q") || "",
          items = recipients.filter((account) =>
            account.display_name.toLowerCase().includes(q.toLowerCase()),
          );
        return reply(
          {
            items: items.slice((n - 1) * 30, n * 30),
            total: items.length,
            page: n,
            pageSize: 30,
          },
          state.failCandidates ? 503 : 200,
        );
      }
      if (path === base + "/recovery") {
        const revision = receipts.get(request.headers()["idempotency-key"]);
        return reply({
          committed: !!revision,
          canRetry: !revision,
          formId: form.id,
          formRevision: form.revision,
          policyRevision: policy.revision,
          editable: true,
          selectedValid: true,
          canReviewAnswers: true,
          mailReady: true,
          chapterInboxAvailable: true,
          receipt: revision ? { formId: form.id, revision } : null,
        });
      }
      return route.fallback();
    }
    if (path !== base || method !== "POST") return route.fallback();
    const { currentPassword, ...document } = JSON.parse(
        request.postData() || "{}",
      ),
      key = request.headers()["idempotency-key"];
    state.attempts.push({
      key,
      body: JSON.stringify(document),
      proof: currentPassword,
    });
    if (!state.lost && loss === "before" && !unavailable) {
      state.lost = true;
      return route.abort("connectionfailed");
    }
    if (!receipts.has(key)) {
      expect(document.formRevision).toBe(form.revision);
      expect(document.policyRevision).toBe(policy.revision);
      policy = {
        ...policy,
        receipts: document.receipts,
        receiptAnswers: document.receiptAnswers,
        notificationUsers: document.notificationUsers,
        chapterInbox: document.chapterInbox,
        notificationAnswers: document.notificationAnswers,
        revision: policy.revision + 1,
        matchesDraft: true,
        selectedAccounts: document.notificationUsers.map((id: string) => ({
          ...recipients.find((account) => account.id === id)!,
          eligible: true,
        })),
      };
      state.commits++;
      receipts.set(key, policy.revision);
    }
    if (!state.lost && loss === "after" && !unavailable) {
      state.lost = true;
      return route.abort("connectionfailed");
    }
    return reply({ revision: receipts.get(key) });
  });
  return { root, base, state, form, selected };
}
async function open(page: Page, info: TestInfo) {
  if (info.project.name.includes("mobile"))
    await page.getByRole("button", { name: "Settings", exact: true }).click();
  else await page.getByRole("tab", { name: "Settings", exact: true }).click();
  await page
    .getByRole("button", { name: "Review chapter notifications", exact: true })
    .click();
  return page.getByRole("dialog", {
    name: "Receipts & notifications",
    exact: true,
  });
}
async function fill(dialog: Locator, _id: string, proof: string) {
  await dialog
    .getByRole("checkbox", { name: /I have reviewed these email/ })
    .check();
  await dialog.getByLabel("Current password", { exact: true }).fill(proof);
}
for (const selected of [false, true])
  for (const loss of ["before", "after"] as const)
    test(`delivery ${selected ? "recipient" : "disable-only"} policy recovers ${loss}-acceptance loss with fresh proof`, async ({
      page,
      fixture,
    }, info) => {
      fixture.authenticated = true;
      fixture.formBuilder = true;
      const { root, form, state } = await setup(page, selected, loss),
        errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(root + "/edit");
      const dialog = await open(page, info);
      if (selected) {
        await dialog
          .getByRole("button", {
            name: "Choose notification recipients",
            exact: true,
          })
          .click();
        await dialog
          .getByRole("checkbox", { name: /Fictional browser recipient 001/ })
          .check();
      }
      await fill(dialog, form.id, "fictional-initial-proof");
      await dialog
        .getByRole("button", { name: "Confirm delivery review", exact: true })
        .click();
      const recovery = dialog.getByRole("region", {
        name: "Unconfirmed delivery review",
        exact: true,
      });
      await expect(recovery).toBeVisible();
      expect(state.attempts).toHaveLength(1);
      expect(JSON.parse(state.attempts[0].body).notificationUsers).toEqual(
        selected ? [recipients[0].id] : [],
      );
      await expect(
        dialog.getByLabel("Current password", { exact: true }),
      ).toHaveValue("");
      expect(await accessibility(page)).toEqual([]);
      await recovery.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath(
          "delivery-" +
            (selected ? "recipient" : "disabled") +
            "-" +
            loss +
            ".png",
        ),
        fullPage: false,
        animations: "disabled",
      });
      await recovery
        .getByRole("button", {
          name: "Check original delivery outcome",
          exact: true,
        })
        .click();
      if (loss === "before") {
        await expect(
          recovery.getByText(/No committed receipt was found/),
        ).toBeVisible();
        await expect(
          recovery.getByRole("button", {
            name: "Retry identical delivery review",
            exact: true,
          }),
        ).toBeDisabled();
        await recovery
          .getByLabel("Current password for identical retry", { exact: false })
          .fill("fictional-new-proof");
        await recovery
          .getByRole("button", {
            name: "Retry identical delivery review",
            exact: true,
          })
          .click();
      }
      await expect(recovery).toHaveCount(0);
      await expect(
        dialog.getByText(/Delivery review confirmed at policy revision 1/),
      ).toBeVisible();
      expect(state.commits).toBe(1);
      expect(state.attempts).toHaveLength(loss === "before" ? 2 : 1);
      if (loss === "before") {
        expect(state.attempts[1].key).toBe(state.attempts[0].key);
        expect(state.attempts[1].body).toBe(state.attempts[0].body);
        expect(state.attempts[1].proof).toBe("fictional-new-proof");
      }
      expect(fixture.writes).toEqual([]);
      expect(fixture.unexpected).toEqual([]);
      expect(errors).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    });
test("unavailable configured recipients require explicit removal", async ({
  page,
  fixture,
}, info) => {
  fixture.authenticated = true;
  fixture.formBuilder = true;
  const { root, form, state } = await setup(page, false, "after", true);
  await page.goto(root + "/edit");
  const dialog = await open(page, info);
  await expect(
    dialog.getByText(/They stay in this proposal until you explicitly remove/),
  ).toBeVisible();
  await fill(dialog, form.id, "fictional-proof");
  await expect(
    dialog.getByRole("button", {
      name: "Confirm delivery review",
      exact: true,
    }),
  ).toBeDisabled();
  expect(state.attempts).toHaveLength(0);
  await dialog
    .getByRole("region", { name: "Selected chapter recipients" })
    .getByRole("button", { name: /Remove notification recipient/ })
    .click();
  await fill(dialog, form.id, "fictional-proof");
  await dialog
    .getByRole("button", { name: "Confirm delivery review", exact: true })
    .click();
  await expect(
    dialog.getByText(/Delivery review confirmed at policy revision 1/),
  ).toBeVisible();
  expect(JSON.parse(state.attempts[0].body).notificationUsers).toEqual([]);
  expect(state.commits).toBe(1);
  expect(await accessibility(page)).toEqual([]);
  expect(fixture.writes).toEqual([]);
  expect(fixture.unexpected).toEqual([]);
});
test("recipient paging reaches 215 and retains a proposal through an inventory outage", async ({
  page,
  fixture,
}, info) => {
  fixture.authenticated = true;
  fixture.formBuilder = true;
  const { root, form, state } = await setup(page, true, "after");
  await page.goto(root + "/edit");
  const dialog = await open(page, info);
  await dialog
    .getByRole("button", {
      name: "Choose notification recipients",
      exact: true,
    })
    .click();
  await dialog
    .getByLabel("Search eligible notification recipients", { exact: false })
    .fill("Fictional browser");
  for (let n = 2; n <= 8; n++) {
    await expect(
      dialog.getByRole("button", { name: "Next recipients", exact: true }),
    ).toBeEnabled();
    await dialog
      .getByRole("button", { name: "Next recipients", exact: true })
      .click();
    await expect(
      dialog.getByText("Recipient page " + n + " of 8 · 215 matching", {
        exact: true,
      }),
    ).toBeVisible();
  }
  await dialog
    .getByRole("checkbox", { name: /Fictional browser recipient 215/ })
    .check();
  await fill(dialog, form.id, "fictional-proof");
  state.failCandidates = true;
  await dialog
    .getByRole("button", { name: "Recheck delivery recipients", exact: true })
    .click();
  await expect(
    dialog.getByText("Fictional recipient inventory outage.", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("region", { name: "Selected chapter recipients" }),
  ).toContainText("Fictional browser recipient 215");
  await expect(
    dialog.getByRole("button", {
      name: "Confirm delivery review",
      exact: true,
    }),
  ).toBeDisabled();
  expect(state.attempts).toHaveLength(0);
  expect(await accessibility(page)).toEqual([]);
  state.failCandidates = false;
  await dialog
    .getByRole("button", { name: "Recheck delivery recipients", exact: true })
    .click();
  await expect(
    dialog.getByText("Fictional recipient inventory outage.", { exact: true }),
  ).toHaveCount(0);
  await expect(
    dialog.getByRole("button", {
      name: "Confirm delivery review",
      exact: true,
    }),
  ).toBeEnabled();
  expect(fixture.writes).toEqual([]);
  expect(fixture.unexpected).toEqual([]);
});
