import { test, expect, accessibility } from "./public-fixture";
import { createTemplate, newField } from "../../shared/forms";
import type { Page } from "@playwright/test";
const slug = "fictional-original-form-write",
  formId = "f1310000-0000-4000-8000-000000000011",
  versionId = "f1310000-0000-4000-8000-000000000012",
  fieldId = "f1310000-0000-4000-8000-000000000013",
  responseId = "f1310000-0000-4000-8000-000000000014",
  editToken = "e".repeat(43);
type Action = "submissions" | "edits" | "drafts";
async function setup(page: Page, action: Action, loss: "before" | "after") {
  const t = createTemplate("Fictional original form request", "blank"),
    field = {
      ...newField("short", t.sections[0].id),
      id: fieldId,
      label: "Fictional original answer",
      required: true,
    },
    form = {
      ...t,
      id: formId,
      slug,
      versionId,
      version: 1,
      status: "Open",
      fields: [field],
      settings: { ...t.settings, resume: true, editing: true, review: false },
      copyAvailable: true,
    },
    identity = {
      name: "Fictional Respondent",
      email: "own-response@example.test",
    },
    receipts = new Map<string, Record<string, unknown>>(),
    state = {
      lost: false,
      commits: 0,
      stale: false,
      deny: false,
      reads: 0,
      editLoads: 0,
      attempts: [] as { body: string; key: string | undefined }[],
    };
  await page.route("**/api/v1/forms/" + slug, (route) =>
    route.fulfill({ json: { data: { form } } }),
  );
  await page.route("**/api/v1/forms/" + slug + "/**", (route) => {
    const r = route.request(),
      path = new URL(r.url()).pathname,
      body = r.postDataJSON(),
      key = r.headers()["idempotency-key"],
      reply = (data: unknown) => route.fulfill({ json: { data } });
    if (path.endsWith("/edits/load")) {
      state.editLoads++;
      return reply({
        form,
        responseId,
        revision: 3,
        answers: { [fieldId]: "Earlier answer" },
        respondent: identity,
      });
    }
    if (path.endsWith("/recovery")) {
      state.reads++;
      expect(body).toEqual(JSON.parse(state.attempts[0].body));
      expect(key).toBe(state.attempts[0].key);
      if (state.deny)
        return route.fulfill({
          status: 404,
          json: {
            error: {
              code: "NOT_FOUND",
              message: "Fictional original access unavailable",
            },
          },
        });
      const value = receipts.get(key),
        receipt =
          value && action === "drafts"
            ? {
                revision: value.revision,
                expiresAt: value.expiresAt,
                createdAt: "2026-11-06T12:00:00Z",
              }
            : value || null;
      return reply({
        committed: !!value,
        canRetry: !value && !state.stale,
        ...(action !== "submissions"
          ? { currentRevision: state.stale ? 9 : action === "edits" ? 3 : 0 }
          : {}),
        receipt,
      });
    }
    if (path.endsWith("/" + action)) {
      state.attempts.push({ body: JSON.stringify(body), key });
      if (!state.lost && loss === "before") {
        state.lost = true;
        return route.abort("connectionfailed");
      }
      if (!receipts.has(key)) {
        state.commits++;
        receipts.set(
          key,
          action === "drafts"
            ? {
                resumeToken: body.resumeToken,
                revision: 2,
                expiresAt: "2026-11-13T12:00:00Z",
              }
            : {
                responseId,
                copyQueued: true,
                ...(action === "edits" ? { revision: 4 } : { editToken }),
              },
        );
      }
      if (!state.lost && loss === "after") {
        state.lost = true;
        return route.abort("connectionfailed");
      }
      return reply(receipts.get(key));
    }
    return route.fallback();
  });
  await page.goto(
    "/forms/" + slug + (action === "edits" ? "#edit=" + editToken : ""),
  );
  await expect(
    page.getByRole("heading", { name: t.title, exact: true }),
  ).toBeVisible();
  if (action !== "edits") {
    await page.getByLabel("Your name *", { exact: true }).fill(identity.name);
    await page
      .getByLabel("Your email *", { exact: false })
      .fill(identity.email);
  }
  await page
    .getByLabel("Fictional original answer", { exact: false })
    .fill("Frozen original browser answer " + "Long answer ".repeat(12));
  await page
    .getByRole("checkbox", {
      name: "Email me a copy of my completed response",
      exact: true,
    })
    .check();
  return { state, identity };
}
const name = (action: Action) =>
  action === "drafts"
    ? "draft save"
    : action === "edits"
      ? "response edit"
      : "submission";
async function dispatch(page: Page, action: Action) {
  await page
    .getByRole("button", {
      name: action === "drafts" ? "Save and resume later" : "Submit response",
      exact: true,
    })
    .click();
  const region = page.getByRole("region", { name: "Unconfirmed form request" });
  await expect(region).toBeVisible();
  await expect(page.getByRole("alert")).toBeVisible();
  return region;
}
for (const action of ["submissions", "edits", "drafts"] as const)
  for (const loss of ["before", "after"] as const)
    test(`original respondent ${action} ${loss} acceptance loss preserves exact answers/identity/choice/key`, async ({
      page,
      fixture,
    }, info) => {
      const { state, identity } = await setup(page, action, loss),
        region = await dispatch(page, action),
        original = state.attempts[0];
      await expect(
        region.getByRole("button", {
          name: "Retry original " + name(action),
          exact: true,
        }),
      ).toBeDisabled();
      await expect(
        page.getByRole("button", { name: "Submit response", exact: true }),
      ).toBeDisabled();
      await expect(
        page.getByRole("checkbox", {
          name: "Email me a copy of my completed response",
          exact: true,
        }),
      ).toBeDisabled();
      expect(JSON.parse(original.body).respondent).toEqual(identity);
      expect(JSON.parse(original.body).copyRequested).toBe(true);
      if (action === "drafts") {
        expect(JSON.parse(original.body).resumeToken).toHaveLength(43);
        expect(JSON.parse(original.body).draftRevision).toBe(0);
      }
      expect(await accessibility(page)).toEqual([]);
      if (loss === "after")
        await page.screenshot({
          path: info.outputPath("respondent-original-" + action + ".png"),
          fullPage: true,
          animations: "disabled",
        });
      await region
        .getByRole("button", {
          name: "Check original " + name(action) + " outcome",
          exact: true,
        })
        .click();
      if (loss === "before")
        await region
          .getByRole("button", {
            name: "Retry original " + name(action),
            exact: true,
          })
          .click();
      await expect(region).toHaveCount(0);
      await expect(
        page.getByRole("heading", {
          name:
            action === "drafts"
              ? "Your private resume link"
              : "Response submitted.",
          exact: true,
        }),
      ).toBeVisible();
      expect(state.commits).toBe(1);
      expect(state.reads).toBe(1);
      expect(state.attempts).toHaveLength(loss === "before" ? 2 : 1);
      expect(
        state.attempts.every(
          (attempt) =>
            attempt.body === original.body && attempt.key === original.key,
        ),
      ).toBe(true);
      expect(fixture.unexpected).toEqual([]);
      expect(await accessibility(page)).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    });
test("original stale draft blocks retry and reviewed stopping clears private fields without a replacement save", async ({
  page,
  fixture,
}) => {
  const { state } = await setup(page, "drafts", "before"),
    region = await dispatch(page, "drafts");
  state.stale = true;
  await region
    .getByRole("button", {
      name: "Check original draft save outcome",
      exact: true,
    })
    .click();
  await expect(
    region.getByText(/current form or saved-response state prevents/),
  ).toBeVisible();
  await expect(
    region.getByRole("button", {
      name: "Retry original draft save",
      exact: true,
    }),
  ).toBeDisabled();
  await region
    .getByText("Review stopping form recovery", { exact: true })
    .click();
  await region
    .getByRole("button", {
      name: "Stop tracking this form request",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Form recovery stopped", exact: true }),
  ).toBeVisible();
  expect(state.attempts).toHaveLength(1);
  expect(state.commits).toBe(0);
  await expect(page.getByRole("main").getByRole("textbox")).toHaveCount(0);
  expect(fixture.unexpected).toEqual([]);
  expect(await accessibility(page)).toEqual([]);
});
test("original response inspection denial conceals all respondent fields and original intent", async ({
  page,
  fixture,
}) => {
  const { state } = await setup(page, "edits", "before"),
    region = await dispatch(page, "edits");
  state.deny = true;
  await region
    .getByRole("button", {
      name: "Check original response edit outcome",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "This form isn’t available",
      exact: true,
    }),
  ).toBeVisible();
  await expect(region).toHaveCount(0);
  await expect(page.getByRole("main").getByRole("textbox")).toHaveCount(0);
  expect(state.attempts).toHaveLength(1);
  expect(fixture.unexpected).toEqual([]);
  expect(await accessibility(page)).toEqual([]);
});

test("reopening the same edit fragment after confirmation loads the current response again", async ({
  page,
  fixture,
}) => {
  const { state } = await setup(page, "edits", "after"),
    region = await dispatch(page, "edits");
  await region
    .getByRole("button", {
      name: "Check original response edit outcome",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Response submitted.", exact: true }),
  ).toBeVisible();
  expect(state.editLoads).toBe(1);
  await page.goto("/forms/" + slug + "#edit=" + editToken);
  await expect(
    page.getByRole("heading", {
      name: "Fictional original form request",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Fictional original answer", { exact: false }),
  ).toHaveValue("Earlier answer");
  expect(state.editLoads).toBe(2);
  expect(new URL(page.url()).hash).toBe("");
  expect(fixture.unexpected).toEqual([]);
  expect(await accessibility(page)).toEqual([]);
});

test("native same-form fragment navigation cannot discard an unconfirmed respondent request", async ({
  page,
  fixture,
}) => {
  const { state } = await setup(page, "edits", "before");
  await dispatch(page, "edits");
  await page.evaluate((token) => {
    window.location.hash = "edit=" + token;
  }, "n".repeat(43));
  const dialog = page.getByRole("alertdialog");
  await expect(
    dialog.getByRole("heading", {
      name: "An operation is still running",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.locator('[aria-label="Unconfirmed form request"]'),
  ).toBeVisible();
  expect(state.editLoads).toBe(1);
  expect(state.attempts).toHaveLength(1);
  await expect(
    dialog.getByRole("button", { name: "Discard and leave", exact: true }),
  ).toHaveCount(0);
  await dialog.getByRole("button", { name: "Stay here", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Unconfirmed form request", exact: true }),
  ).toBeVisible();
  expect(new URL(page.url()).hash).toBe("");
  expect(state.editLoads).toBe(1);
  expect(fixture.unexpected).toEqual([]);
});
