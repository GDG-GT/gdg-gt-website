import { test, expect, accessibility } from "./public-fixture";
import type { Page } from "@playwright/test";
const id = "f1330000-0000-4000-8000-000000000001",
  record = {
    id,
    name: "Fictional existing member",
    email: "fictional-existing@example.test",
    phone: "",
    year: "",
    major: "",
    category: "member",
    interests: [],
    is_active: true,
    is_core_team: false,
    team_section: "Active Members",
    reference: "FICTIONAL-REF",
    team_id: null,
    teamName: null,
    revision: 1,
    deleted_at: null,
    merged_into_id: null,
    actions: ["read", "update", "delete", "merge"],
    publicProfile: null,
    canSyncProfile: false,
    activeProjectCount: 0,
  };
async function setup(page: Page, action: string, loss: "before" | "after") {
  const receipts = new Map<string, unknown>(),
    state = {
      lost: false,
      commits: 0,
      reads: 0,
      denied: false,
      attempts: [] as { body: string; key: string | undefined }[],
    };
  await page.route("**/api/v1/admin/members**", (route) => {
    const r = route.request(),
      url = new URL(r.url()),
      path = url.pathname,
      reply = (data: unknown) => route.fulfill({ json: { data } });
    if (path.endsWith("/recovery")) {
      state.reads++;
      const key = r.headers()["idempotency-key"],
        body = r.postDataJSON();
      expect(key).toBe(state.attempts[0].key);
      const original = { ...JSON.parse(state.attempts[0].body) };
      delete original.currentPassword;
      expect(body).toEqual(original);
      if (state.denied)
        return route.fulfill({
          status: 404,
          json: {
            error: {
              code: "NOT_FOUND",
              message: "Fictional original access unavailable",
            },
          },
        });
      const receipt = receipts.get(key) || null;
      return reply({
        committed: !!receipt,
        canRetry: !receipt,
        currentRevision: 1,
        receipt,
      });
    }
    if (r.method() !== "GET") {
      state.attempts.push({
        body: r.postData()!,
        key: r.headers()["idempotency-key"],
      });
      if (!state.lost && loss === "before") {
        state.lost = true;
        return route.abort("connectionfailed");
      }
      const key = r.headers()["idempotency-key"];
      if (!receipts.has(key)) {
        state.commits++;
        receipts.set(key, { id, revision: 2, profileId: null });
      }
      if (!state.lost && loss === "after") {
        state.lost = true;
        return route.abort("connectionfailed");
      }
      return reply(receipts.get(key));
    }
    if (path.endsWith("/capabilities"))
      return reply({ globalCreate: true, merge: true, teams: [] });
    if (path.endsWith("/activity"))
      return reply({ items: [], page: 1, pageSize: 30 });
    if (path.endsWith("/members"))
      return reply({
        items: [record],
        total: 1,
        pageSize: 30,
        stats: { active: 1, core: 0, categories: { member: 1 } },
      });
    return reply({ member: record });
  });
  await page.goto(
    "/admin/members" + (action === "create" ? "" : "?member=" + id),
  );
  await expect(
    page.getByRole("button", { name: "New member", exact: true }),
  ).toBeEnabled();
  if (action === "create") {
    await page.getByRole("button", { name: "New member", exact: true }).click();
    await page
      .getByLabel("Name *", { exact: true })
      .fill("Frozen original browser member");
    await page
      .getByLabel("Email *", { exact: true })
      .fill("fictional-original-browser@example.test");
  } else {
    await page
      .getByRole("button", {
        name: action === "archive" ? "Archive member" : "Edit member",
        exact: true,
      })
      .click();
    if (action === "archive") {
      await page
        .getByRole("checkbox", { name: /I have reviewed/ })
        .check();
      await page
        .getByLabel("Current password *", { exact: true })
        .fill("Fictional original proof");
    } else
      await page
        .getByLabel("Name *", { exact: true })
        .fill("Frozen original browser update");
  }
  await page
    .getByRole("button", { name: "Save member changes", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Unconfirmed member save", exact: true }),
  ).toBeVisible();
  return state;
}
for (const action of ["create", "update", "archive"])
  for (const loss of ["before", "after"] as const)
    test(`member ${action} ${loss} acceptance loss preserves original fields scope revision key`, async ({
      page,
      fixture,
    }, info) => {
      fixture.authenticated = true;
      const state = await setup(page, action, loss);
      await expect(
        page.getByRole("button", { name: "Save member changes", exact: true }),
      ).toBeDisabled();
      await expect(
        page.getByRole("button", { name: "Close editor", exact: true }),
      ).toBeDisabled();
      await expect(
        page.getByRole("button", {
          name: "Retry identical member save",
          exact: true,
        }),
      ).toBeDisabled();
      expect(await accessibility(page)).toEqual([]);
      if (loss === "after")
        await page.screenshot({
          path: info.outputPath("member-original-" + action + ".png"),
          fullPage: true,
          animations: "disabled",
        });
      await page
        .getByRole("button", {
          name: "Check original member outcome",
          exact: true,
        })
        .click();
      if (loss === "before") {
        if (action === "archive")
          await page
            .getByLabel("Current password for original member retry *", {
              exact: true,
            })
            .fill("New explicit fictional proof");
        await page
          .getByRole("button", {
            name: "Retry identical member save",
            exact: true,
          })
          .click();
      }
      await expect(
        page.getByText("Original community member save confirmed.", {
          exact: true,
        }),
      ).toBeVisible();
      expect(state.commits).toBe(1);
      expect(state.reads).toBe(1);
      expect(state.attempts).toHaveLength(loss === "before" ? 2 : 1);
      if (loss === "before") {
        const first = JSON.parse(state.attempts[0].body),
          last = JSON.parse(state.attempts[1].body);
        delete first.currentPassword;
        delete last.currentPassword;
        expect(last).toEqual(first);
        expect(state.attempts[1].key).toBe(state.attempts[0].key);
      }
      expect(await accessibility(page)).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(fixture.unexpected).toEqual([]);
    });
test("member original outcome denial clears private proposal instead of creating another record", async ({
  page,
  fixture,
}) => {
  fixture.authenticated = true;
  const state = await setup(page, "create", "before");
  state.denied = true;
  await page
    .getByRole("button", { name: "Check original member outcome", exact: true })
    .click();
  await expect(
    page.getByText(/Private records and edits have been cleared/),
  ).toBeVisible();
  await expect(page.getByLabel("Name *", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Unconfirmed member save", exact: true }),
  ).toHaveCount(0);
  expect(state.commits).toBe(0);
  expect(state.attempts).toHaveLength(1);
  expect(await accessibility(page)).toEqual([]);
  expect(fixture.unexpected).toEqual([]);
});
test("member reviewed stopping clears uncertain fields and never sends a replacement", async ({
  page,
  fixture,
}) => {
  fixture.authenticated = true;
  const state = await setup(page, "create", "after");
  await page
    .getByText("Review stopping member recovery", { exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Stop tracking this member save",
      exact: true,
    })
    .click();
  await expect(page.getByText(/Member recovery stopped/)).toBeVisible();
  await expect(page.getByLabel("Name *", { exact: true })).toHaveCount(0);
  expect(state.commits).toBe(1);
  expect(state.attempts).toHaveLength(1);
  expect(await accessibility(page)).toEqual([]);
  expect(fixture.unexpected).toEqual([]);
});
