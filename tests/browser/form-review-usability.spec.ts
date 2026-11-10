import { test, expect, accessibility, fictionalBuilderForm } from "./public-fixture";

test("response review follows question order and opens the uploaded resume directly", async ({ page, context, fixture }, info) => {
  fixture.authenticated = true;
  const root = "/admin/forms/" + fictionalBuilderForm.id,
    responseId = "fbbb0000-0000-4000-8000-000000000042",
    fileId = "fbbb0000-0000-4000-8000-000000000043",
    sections = [
      { id: "intro", title: "About you", description: "" },
      { id: "application", title: "Application", description: "" },
    ],
    fields = [
      { ...fictionalBuilderForm.fields[0], id: "resume", type: "file", label: "Résumé", sectionId: "application", sensitive: true },
      { ...fictionalBuilderForm.fields[0], id: "name", type: "short", label: "Full name", sectionId: "intro", sensitive: false },
      { ...fictionalBuilderForm.fields[0], id: "email", type: "email", label: "Email", sectionId: "intro", sensitive: true },
    ],
    form = {
      ...fictionalBuilderForm, fields, sections, status: "Open",
      actions: ["view", "view_responses", "view_sensitive_responses"],
      versions: [{ ...fictionalBuilderForm, fields, sections, version: 1, publishedAt: "2026-11-10T12:00:00Z" }],
    };
  await page.route("**/api/v1/admin/forms/**", async route => {
    const path = new URL(route.request().url()).pathname.replace("/api/v1", ""),
      reply = (data: unknown) => route.fulfill({ status: 200, json: { data } });
    if (path === root) return reply({ form });
    if (path === root + "/views") return reply({ items: [] });
    if (path === root + "/responses") return reply({ items: [{
      id: responseId, formId: form.id, version: 1, status: "complete", submittedAt: "2026-11-10T15:00:00Z",
      respondent: { name: "Fictional applicant", email: "applicant@example.test", source: "self_reported" },
      answers: { resume: [fileId], name: "Fictional applicant", email: "applicant@example.test" },
    }], total: 1, page: 1, pageSize: 30 });
    if (path.endsWith("/files/" + fileId + "/open")) return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: "<title>Sample document</title><h1>Fictional resume viewer</h1>" });
    return route.fallback();
  });
  await context.route("**/api/v1/admin/forms/**/files/**/open", route => route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: "<title>Sample document</title><h1>Fictional resume viewer</h1>" }));
  await page.goto(root + "/responses?sensitive=false");
  await page.getByRole("button", { name: "Open response " + responseId, exact: true }).click();
  const dialog = page.getByRole("dialog");
  expect(await dialog.locator(".gt-response-answers > div > strong").allTextContents()).toEqual(["Full name", "Email · Sensitive", "Résumé · Sensitive"]);
  await expect(dialog.locator(".gt-response-answers").getByText("applicant@example.test", { exact: true })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /reveal sensitive/i })).toHaveCount(0);
  expect(await accessibility(page)).toEqual([]);
  await dialog.screenshot({ path: info.outputPath("readable-response.png") });
  const [viewer] = await Promise.all([
    page.waitForEvent("popup"),
    dialog.getByRole("link", { name: "Open Résumé", exact: true }).click(),
  ]);
  await expect(viewer.getByRole("heading", { name: "Fictional resume viewer" })).toBeVisible();
  await viewer.close();
  await expect(dialog).toBeVisible();
});
