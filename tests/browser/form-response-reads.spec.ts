import {
  test,
  expect,
  accessibility,
  fictionalBuilderForm,
} from "./public-fixture";
test("response workspace retains independent private reads and clears denied access", async ({
  page,
  fixture,
}, info) => {
  fixture.authenticated = true;
  const root = "/admin/forms/" + fictionalBuilderForm.id,
    responseId = "fbbb0000-0000-4000-8000-000000000014",
    form = {
      ...fictionalBuilderForm,
      status: "Open",
      actions: ["view", "view_responses", "publish", "delete"],
      versions: [
        {
          ...fictionalBuilderForm,
          version: 1,
          publishedAt: "2026-11-05T12:00:00Z",
        },
      ],
    },
    reads: string[] = [],
    errors: string[] = [];
  let failed = "responses",
    denied = "";
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/v1/admin/forms/**", async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname.replace("/api/v1", "");
    if (request.method() !== "GET") return route.fallback();
    const name =
      path === root
        ? "form"
        : path === root + "/responses"
          ? "responses"
          : path === root + "/analytics"
            ? "summary"
            : path === root + "/views"
              ? "views"
              : path === root + "/privacy"
                ? "holds"
                : "";
    if (!name) return route.fallback();
    reads.push(name);
    if (name === failed || name === denied)
      return route.fulfill({
        status: name === denied ? 403 : 503,
        json: {
          error: {
            code: name === denied ? "FORBIDDEN" : "UNAVAILABLE",
            message: "Fictional " + name + " recovery interruption.",
          },
        },
      });
    const data =
      name === "form"
        ? { form }
        : name === "responses"
          ? {
              items: [
                {
                  id: responseId,
                  formId: form.id,
                  version: 1,
                  submittedAt: "2026-11-05T12:00:00Z",
                  status: "complete",
                  respondent: {
                    name: "Fictional Private Respondent",
                    email: "fictional-response@example.test",
                    source: "self_reported",
                  },
                  answers: { [form.fields[0].id]: "Fictional stored answer" },
                },
              ],
              total: 1,
              page: 1,
              pageSize: 30,
            }
          : name === "summary"
            ? { responseCount: 1, fields: [] }
            : name === "views"
              ? {
                  items: [
                    {
                      id: "fictional-saved-view",
                      name: "Fictional saved response view",
                      filters: { status: "complete" },
                      columns: [],
                    },
                  ],
                }
              : { held: false };
    return route.fulfill({ status: 200, json: { data } });
  });
  await page.goto(root + "/responses?q=Fictional");
  await expect(
    page.getByText("Fictional responses recovery interruption.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "1 matching responses", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("option", {
      name: "Fictional saved response view",
      exact: true,
    }),
  ).toHaveCount(1);
  failed = "";
  const before = [...reads];
  await page
    .getByRole("button", { name: "Reload responses", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "1 matching responses", exact: true }),
  ).toBeVisible();
  expect(reads.slice(before.length)).toEqual(["responses"]);
  const proposed = page.getByLabel("New view name", { exact: false });
  await proposed.fill("Fictional proposed private view");
  failed = "views";
  await page
    .getByRole("button", { name: "Reload saved views", exact: true })
    .click();
  await expect(
    page.getByText("Fictional views recovery interruption.", { exact: true }),
  ).toBeVisible();
  await expect(proposed).toHaveValue("Fictional proposed private view");
  await expect(
    page.getByRole("button", { name: "Save view", exact: true }),
  ).toBeDisabled();
  failed = "responses";
  await page
    .getByRole("button", { name: "Reload responses", exact: true })
    .click();
  await expect(
    page.getByText("Fictional responses recovery interruption.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "1 matching responses", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Open response " + responseId,
      exact: true,
    }),
  ).toBeDisabled();
  await expect(page.getByText(/Last successful responses read/)).toBeVisible();
  expect(await accessibility(page)).toEqual([]);
  await page
    .getByRole("region", { name: "Response inventory table" })
    .evaluate((element) => (element.scrollLeft = 0));
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("response-paused.png"),
    fullPage: true,
    animations: "disabled",
  });
  failed = "";
  await page
    .getByRole("button", { name: "Reload saved views", exact: true })
    .click();
  await expect(
    page.getByText("Fictional views recovery interruption.", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Reload responses", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Open response " + responseId,
      exact: true,
    }),
  ).toBeEnabled();
  failed = "holds";
  await page
    .getByRole("button", { name: "Reload hold status", exact: true })
    .click();
  await expect(
    page.getByText("Fictional holds recovery interruption.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Open response " + responseId, exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Delete response", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Redact identity", exact: true }),
  ).toHaveCount(0);
  expect(await accessibility(page)).toEqual([]);
  await page.keyboard.press("Escape");
  failed = "";
  await page
    .getByRole("button", { name: "Reload hold status", exact: true })
    .click();
  await expect(
    page.getByText("Fictional holds recovery interruption.", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("tab", { name: "Summary", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "1 matching responses", exact: true }),
  ).toBeVisible();
  failed = "summary";
  await page
    .getByRole("button", { name: "Reload summary", exact: true })
    .click();
  await expect(
    page.getByText("Fictional summary recovery interruption.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Last successful summary read/)).toBeVisible();
  failed = "";
  denied = "summary";
  await page
    .getByRole("button", { name: "Reload summary", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Response access needs to be rechecked",
      exact: true,
    }),
  ).toBeVisible();
  await expect(proposed).toHaveCount(0);
  expect(new URL(page.url()).search).toBe("");
  denied = "";
  await page
    .getByRole("button", {
      name: "Recheck response workspace access",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "1 matching responses", exact: true }),
  ).toBeVisible();
  await expect(proposed).toHaveValue("");
  await proposed.fill("Fictional second private proposal");
  denied = "form";
  await page
    .getByRole("button", { name: "Reload saved form", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Response access needs to be rechecked",
      exact: true,
    }),
  ).toBeVisible();
  await expect(proposed).toHaveCount(0);
  denied = "";
  await page
    .getByRole("button", {
      name: "Recheck response workspace access",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "1 matching responses", exact: true }),
  ).toBeVisible();
  await expect(proposed).toHaveValue("");
  const grants = [...form.actions];
  form.actions = ["view"];
  await page
    .getByRole("button", { name: "Reload saved form", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Response access needs to be rechecked",
      exact: true,
    }),
  ).toBeVisible();
  form.actions = grants;
  await page
    .getByRole("button", {
      name: "Recheck response workspace access",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "1 matching responses", exact: true }),
  ).toBeVisible();
  expect(await accessibility(page)).toEqual([]);
  expect(fixture.writes).toEqual([]);
  expect(fixture.unexpected).toEqual([]);
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
