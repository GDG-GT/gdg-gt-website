import {
  test,
  expect,
  accessibility,
  fictionalBuilderForm,
} from "./public-fixture";
test("private response history recovers list and selected answers independently", async ({
  page,
  fixture,
}, info) => {
  fixture.authenticated = true;
  const root = "/admin/forms/" + fictionalBuilderForm.id,
    responseId = "fbbb0000-0000-4000-8000-000000000011",
    historyRoot = root + "/responses/" + responseId + "/history",
    recordedAt = "2026-11-05T12:00:00Z";
  let failList = false,
    failRevision = false,
    deny = false;
  const reads: string[] = [],
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const form = {
    ...fictionalBuilderForm,
    status: "Open",
    actions: ["view", "view_responses", "view_sensitive_responses"],
    versions: [
      { ...fictionalBuilderForm, version: 1, publishedAt: recordedAt },
    ],
  };
  await page.route("**/api/v1/admin/forms/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname.replace("/api/v1", "");
    if (request.method() !== "GET") return route.fallback();
    const reply = (data: unknown, status = 200) =>
      route.fulfill({
        status,
        json:
          status === 200
            ? { data }
            : {
                error: {
                  code: status === 403 ? "FORBIDDEN" : "UNAVAILABLE",
                  message:
                    status === 403
                      ? "Fictional history access changed."
                      : "Fictional history request unavailable.",
                },
              },
      });
    if (path === root) return reply({ form });
    if (path === root + "/views") return reply({ items: [] });
    if (path === root + "/responses")
      return reply({
        items: [
          {
            id: responseId,
            formId: form.id,
            version: 1,
            submittedAt: recordedAt,
            status: "complete",
            respondent: {
              name: "Fictional History Respondent",
              email: "fictional-history@example.test",
              source: "self_reported",
            },
            answers: { [form.fields[0].id]: "Current fictional answer" },
          },
        ],
        total: 1,
        page: 1,
        pageSize: 30,
      });
    if (path === historyRoot) {
      reads.push("list");
      if (deny || failList) return reply(null, deny ? 403 : 503);
      return reply({
        items: [
          { revision: 1, recordedAt, current: true },
          { revision: 0, recordedAt, current: false },
        ],
        currentRevision: 1,
        version: 1,
        total: 2,
        page: 1,
        pageSize: 20,
        redacted: false,
      });
    }
    if (path === historyRoot + "/0") {
      reads.push("snapshot:" + url.searchParams.get("sensitive"));
      if (deny || failRevision) return reply(null, deny ? 403 : 503);
      const sensitive = url.searchParams.get("sensitive") === "true";
      return reply({
        responseId,
        revision: 0,
        version: 1,
        current: false,
        recordedAt,
        redacted: false,
        fields: [
          {
            id: "fictional-history-field",
            label: "Original fictional question",
            type: "short",
            sensitive: false,
            masked: false,
            answered: true,
            value: "Fictional historical answer",
          },
          {
            id: "fictional-private-history-field",
            label: "Sensitive fictional question",
            type: "email",
            sensitive: true,
            masked: !sensitive,
            answered: true,
            value: sensitive ? "fictional-sensitive@example.test" : null,
          },
        ],
      });
    }
    return route.fallback();
  });
  await page.goto(root + "/responses");
  await page
    .getByRole("button", { name: "Open response " + responseId, exact: true })
    .click();
  const dialog = page.getByRole("dialog"),
    history = dialog.getByRole("region", {
      name: "Response revision history",
      exact: true,
    });
  await history
    .getByRole("button", { name: "Review revision history" })
    .click();
  failRevision = true;
  await history
    .getByRole("button", { name: "Revision 0", exact: true })
    .click();
  await expect(
    history.getByText("Fictional history request unavailable.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(history.getByText("2 revisions · Form version 1")).toBeVisible();
  failRevision = false;
  await history
    .getByRole("button", { name: "Reload selected revision" })
    .click();
  await expect(
    history.getByText("Fictional historical answer", { exact: true }),
  ).toBeVisible();
  expect(reads).toEqual(["list", "snapshot:false", "snapshot:false"]);
  await expect(
    history.getByText("Hidden by default", { exact: true }),
  ).toBeVisible();
  failRevision = true;
  await history
    .getByRole("button", { name: "Reload selected revision" })
    .click();
  await expect(
    history.getByText(/Last successful selected revision read/),
  ).toBeVisible();
  await expect(
    history.getByText("Fictional historical answer", { exact: true }),
  ).toBeVisible();
  expect(await accessibility(page)).toEqual([]);
  failRevision = false;
  await history
    .getByRole("button", { name: "Reload selected revision" })
    .click();
  await expect(
    history.getByText("Fictional history request unavailable.", {
      exact: true,
    }),
  ).toHaveCount(0);
  await history.getByRole("checkbox").check();
  await expect(
    history.getByText("fictional-sensitive@example.test", { exact: true }),
  ).toBeVisible();
  await history.getByRole("checkbox").uncheck();
  await expect(
    history.getByText("fictional-sensitive@example.test", { exact: true }),
  ).toHaveCount(0);
  await expect(
    history.getByText("Hidden by default", { exact: true }),
  ).toBeVisible();
  failList = true;
  await history
    .getByRole("button", { name: "Reload history", exact: true })
    .click();
  await expect(history.getByText(/Last successful history read/)).toBeVisible();
  await expect(
    history.getByRole("button", { name: "Revision 0", exact: true }),
  ).toBeDisabled();
  await expect(
    history.getByText("Fictional historical answer", { exact: true }),
  ).toBeVisible();
  expect(await accessibility(page)).toEqual([]);
  await history
    .getByRole("region", { name: "Selected revision 0", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath("history-paused.png"),
    fullPage: false,
    animations: "disabled",
  });
  failList = false;
  deny = true;
  await history
    .getByRole("button", { name: "Reload history", exact: true })
    .click();
  await expect(
    history.getByText(
      "Private history and selected answers have been cleared.",
    ),
  ).toBeVisible();
  await expect(
    history.getByText("Fictional historical answer", { exact: true }),
  ).toHaveCount(0);
  await expect(
    history.getByRole("button", { name: "Revision 0", exact: true }),
  ).toHaveCount(0);
  deny = false;
  await history
    .getByRole("button", { name: "Recheck response history access" })
    .click();
  await expect(
    history.getByRole("button", { name: "Revision 0", exact: true }),
  ).toBeEnabled();
  await expect(
    history.getByText("Fictional historical answer", { exact: true }),
  ).toHaveCount(0);
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
