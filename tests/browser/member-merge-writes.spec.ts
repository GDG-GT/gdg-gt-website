import { test, expect, accessibility } from "./public-fixture";
import type { Page } from "@playwright/test";
const sourceId = "f8320000-0000-4000-8000-000000000001";
const source = {
  id: sourceId,
  name: "Fictional source member",
  email: "fictional-source@example.test",
  reference: "FICTIONAL-SOURCE",
  revision: 1,
  phone: null,
  year: null,
  major: null,
  category: "member",
  interests: [],
  is_active: true,
  is_core_team: false,
  team_section: "Active Members",
  team_id: null,
  teamName: null,
  deleted_at: null,
  merged_into_id: null,
  actions: ["read", "update", "merge"],
  publicProfile: null,
  canSyncProfile: false,
  activeProjectCount: 0,
};
const targets = Array.from({ length: 65 }, (_, i) => ({
  ...source,
  id: "f8330000-0000-4000-8000-" + String(i + 1).padStart(12, "0"),
  name: "Eligible " + String(i + 1).padStart(3, "0"),
  email: "fictional-canonical-" + i + "@example.test",
  reference: "FICTIONAL-TARGET-" + i,
}));

async function setup(
  page: Page,
  action: "preview" | "commit",
  loss: "before" | "after",
) {
  const receipts = new Map<string, unknown>(),
    state = {
      lost: false,
      denied: false,
      attempts: [] as {
        path: string;
        body: Record<string, unknown>;
        key: string | undefined;
      }[],
      commits: 0,
      previews: 0,
    };
  const preview = {
    reviewId: "f8320000-0000-4000-8000-000000000009",
    reviewToken: "f".repeat(43),
    source,
    target: targets[0],
    policy:
      "The canonical member fields stay unchanged. The source remains an inactive reference.",
    expiresAt: new Date(Date.now() + 300000).toISOString(),
  };
  await page.route("**/api/v1/admin/members**", (route) => {
    const r = route.request(),
      url = new URL(r.url()),
      path = url.pathname,
      reply = (data: unknown) => route.fulfill({ json: { data } }),
      kind = path.includes("/merge-preview") ? "preview" : "commit";
    if (path.endsWith("/recovery")) {
      if (state.denied)
        return route.fulfill({
          status: 404,
          json: {
            error: {
              code: "NOT_FOUND",
              message: "Fictional merge outcome unavailable",
            },
          },
        });
      const key = r.headers()["idempotency-key"],
        original = state.attempts.find((v) => v.key === key)!;
      const body = { ...original.body };
      delete body.currentPassword;
      expect(r.postDataJSON()).toEqual(body);
      const receipt = receipts.get(key) || null;
      return reply({ committed: !!receipt, canRetry: !receipt, receipt });
    }
    if (r.method() === "POST") {
      const key = r.headers()["idempotency-key"];
      state.attempts.push({ path, body: r.postDataJSON(), key });
      if (kind === action && !state.lost && loss === "before") {
        state.lost = true;
        return route.abort("connectionfailed");
      }
      if (!receipts.has(key)) {
        if (kind === "preview") state.previews++;
        else state.commits++;
        receipts.set(
          key,
          kind === "preview"
            ? preview
            : { id: targets[0].id, revision: 2, sourceId },
        );
      }
      if (kind === action && !state.lost && loss === "after") {
        state.lost = true;
        return route.abort("connectionfailed");
      }
      return reply(receipts.get(key));
    }
    if (path.endsWith("/capabilities"))
      return reply({ globalCreate: true, merge: true, teams: [] });
    if (path.endsWith("/activity"))
      return reply({ items: [], page: 1, pageSize: 30 });
    if (path.includes("/merge-candidates"))
      return reply({
        items: targets.slice(0, 30),
        total: 65,
        page: 1,
        pageSize: 30,
        sourceRevision: 1,
      });
    if (path.includes("/merge-target/"))
      return reply({ member: targets[0], sourceRevision: 1 });
    if (path.endsWith("/members"))
      return reply({
        items: [source, targets[0]],
        total: 2,
        pageSize: 30,
        stats: { active: 2, core: 0, categories: { member: 2 } },
      });
    return reply({
      member: path.endsWith("/" + sourceId)
        ? source
        : { ...targets[0], revision: state.commits ? 2 : 1 },
    });
  });
  await page.goto("/admin/members?member=" + sourceId);
  await page
    .getByRole("button", { name: "Review duplicate merge", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: /^Canonical member to keep/ })
    .selectOption(targets[0].id);
  await expect(
    page.getByRole("button", { name: "Generate current review", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Generate current review", exact: true })
    .click();
  if (action === "commit") {
    await expect(
      page.getByRole("heading", {
        name: "Compare before merging",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: /Source reference/ })
      .fill(source.reference);
    await page
      .getByRole("textbox", { name: /Canonical reference/ })
      .fill(targets[0].reference);
    await page
      .getByLabel("Current password *", { exact: true })
      .fill("Fictional initial proof");
    await page
      .getByRole("button", { name: "Confirm retained merge", exact: true })
      .click();
  }
  await expect(
    page.getByRole("region", { name: "Unconfirmed merge save", exact: true }),
  ).toBeVisible();
  return state;
}
for (const action of ["preview", "commit"] as const)
  for (const loss of ["before", "after"] as const)
    test(`original merge ${action} ${loss} loss preserves review and explicit identical recovery`, async ({
      page,
      fixture,
    }, info) => {
      fixture.authenticated = true;
      const state = await setup(page, action, loss),
        original = state.attempts.at(-1)!;
      await expect(
        page.getByRole("button", { name: "Close merge review", exact: true }),
      ).toBeDisabled();
      await expect(
        page.getByRole("button", {
          name: "Retry identical merge save",
          exact: true,
        }),
      ).toBeDisabled();
      expect(await accessibility(page)).toEqual([]);
      if (loss === "after")
        await page.screenshot({
          path: info.outputPath("unknown-merge-" + action + ".png"),
          fullPage: true,
          animations: "disabled",
        });
      await page
        .getByRole("button", {
          name: "Check original merge outcome",
          exact: true,
        })
        .click();
      if (loss === "before") {
        if (action === "commit")
          await page
            .getByLabel("Current password for original merge retry *", {
              exact: true,
            })
            .fill("New explicit proof");
        await page
          .getByRole("button", {
            name: "Retry identical merge save",
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
          name: "Unconfirmed merge save",
          exact: true,
        }),
      ).toHaveCount(0);
      if (action === "preview")
        await expect(
          page.getByRole("heading", {
            name: "Compare before merging",
            exact: true,
          }),
        ).toBeVisible();
      else
        await expect(page.getByText(/Reviewed merge committed/)).toBeVisible();
      expect(state.previews).toBe(1);
      expect(state.commits).toBe(action === "commit" ? 1 : 0);
      expect(await accessibility(page)).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(fixture.unexpected).toEqual([]);
    });
test("merge outcome denial clears the private parent and prepared review", async ({
  page,
  fixture,
}) => {
  fixture.authenticated = true;
  const state = await setup(page, "commit", "before");
  state.denied = true;
  await page
    .getByRole("button", { name: "Check original merge outcome", exact: true })
    .click();
  await expect(
    page.getByText(/Private records and edits have been cleared/),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Compare before merging", exact: true }),
  ).toHaveCount(0);
  expect(state.commits).toBe(0);
  expect(await accessibility(page)).toEqual([]);
  expect(fixture.unexpected).toEqual([]);
});
test("stopping an uncertain accepted merge clears private proposals without a replacement", async ({
  page,
  fixture,
}) => {
  fixture.authenticated = true;
  const state = await setup(page, "commit", "after");
  await page
    .getByText("Review stopping merge recovery", { exact: true })
    .click();
  await page
    .getByRole("button", { name: "Stop tracking this merge save", exact: true })
    .click();
  await expect(page.getByText(/Merge recovery stopped/)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Compare before merging", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Generate current review", exact: true }),
  ).toBeDisabled();
  expect(state.commits).toBe(1);
  expect(state.attempts).toHaveLength(2);
  expect(fixture.unexpected).toEqual([]);
});
