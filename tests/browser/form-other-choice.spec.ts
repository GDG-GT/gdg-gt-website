import {
  test,
  expect,
  accessibility,
  fictionalBuilderForm,
} from "./public-fixture";
import { createTemplate, newField } from "../../shared/forms";

test("Other write-ins submit their exact text and consent keeps clear checkbox spacing", async ({
  page,
  fixture,
}, info) => {
  const form = createTemplate("Fictional Other choices", "blank");
  const section = form.sections[0].id;
  const one = {
    ...newField("radio", section),
    label: "Pick one area",
    options: ["Code", "Other"],
    required: true,
  };
  const many = {
    ...newField("checkbox", section),
    label: "Pick your interests",
    options: ["Code", "Other"],
    required: true,
    maxChoices: 2,
  };
  const consent = {
    ...newField("consent", section),
    label: "Confirm your answers",
    required: true,
  };
  const slug = "fictional-other-choices";
  const bodies: Record<string, unknown>[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/v1/forms/" + slug + "**", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({
        json: {
          data: {
            form: {
              ...form,
              slug,
              id: "fc100000-0000-4000-8000-000000000001",
              versionId: "fc100000-0000-4000-8000-000000000002",
              version: 1,
              status: "Open",
              fields: [one, many, consent],
              settings: {
                ...form.settings,
                resume: false,
                editing: false,
                review: false,
              },
              copyAvailable: false,
            },
          },
        },
      });
    expect(new URL(route.request().url()).pathname).toBe(
      "/api/v1/forms/" + slug + "/submissions",
    );
    bodies.push(route.request().postDataJSON());
    return route.fulfill({
      json: {
        data: {
          responseId: "fc100000-0000-4000-8000-000000000003",
          submittedAt: "2026-11-08T12:00:00Z",
          copyQueued: false,
        },
      },
    });
  });
  await page.goto("/forms/" + slug);
  await expect(
    page.getByRole("heading", { name: form.title, exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Your name *", { exact: true })
    .fill("Fictional Respondent");
  await page
    .getByRole("textbox", { name: /^Your email \*/ })
    .fill("person@example.test");
  await page
    .getByRole("group", { name: /Pick one area/ })
    .getByRole("radio", { name: "Other", exact: true })
    .check();
  await page
    .getByRole("group", { name: /Pick your interests/ })
    .getByRole("checkbox", { name: "Code", exact: true })
    .check();
  await page
    .getByRole("group", { name: /Pick your interests/ })
    .getByRole("checkbox", { name: "Other", exact: true })
    .check();
  await expect(page.getByRole("textbox", { name: "Pick one area: Other answer", exact: true })).toHaveCSS("border-top-left-radius", "8px");
  const checkbox = page.getByRole("checkbox", {
    name: "I agree to the statement above.",
    exact: true,
  });
  await checkbox.check();
  await page
    .getByRole("button", { name: "Submit response", exact: true })
    .click();
  expect(bodies).toEqual([]);
  await page
    .getByRole("textbox", { name: "Pick one area: Other answer", exact: true })
    .fill("Robotics");
  await page
    .getByRole("textbox", {
      name: "Pick your interests: Other answer",
      exact: true,
    })
    .fill("Community design");
  const gap = await checkbox.evaluate((input) => {
    const label = input.closest("label")!;
    return (
      label.querySelector("span")!.getBoundingClientRect().left -
      input.getBoundingClientRect().right
    );
  });
  expect(gap).toBeGreaterThanOrEqual(10);
  expect(await accessibility(page)).toEqual([]);
  await page.screenshot({
    path: info.outputPath("other-choice-and-consent.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Submit response", exact: true })
    .click();
  await expect.poll(() => bodies.length).toBe(1);
  expect(bodies[0].answers).toEqual({
    [one.id]: { kind: "choice_other", selected: "Other", other: "Robotics" },
    [many.id]: {
      kind: "choice_other",
      selected: ["Code", "Other"],
      other: "Community design",
    },
    [consent.id]: "Agreed",
  });
  expect(errors).toEqual([]);
  expect(fixture.unexpected).toEqual([]);
});

for (const role of ["super_admin", "admin"] as const)
  test(`form deletion is discoverable only for ${role === "super_admin" ? "Super Admin" : "restricted for Admin"}`, async ({
    page,
    fixture,
  }) => {
    fixture.authenticated = true;
    const form = {
      ...fictionalBuilderForm,
      status: "Draft",
      actions: ["view", "edit", "delete"],
      versions: [],
    };
    await page.route("**/api/v1/admin/me", (route) =>
      route.fulfill({
        json: {
          data: {
            user: {
              id: "fbbb0000-0000-4000-8000-000000000001",
              email: "fictional-browser@example.test",
              display_name: "Fictional reviewer",
              role,
              is_active: true,
              created_at: "2026-11-04T12:00:00Z",
            },
            memberships: [],
            profile: null,
          },
        },
      }),
    );
    await page.route("**/api/v1/admin/forms?**", (route) =>
      route.fulfill({
        json: {
          data: {
            items: [form],
            total: 1,
            page: 1,
            pageSize: 30,
            canCreate: true,
          },
        },
      }),
    );
    await page.route(
      "**/api/v1/admin/forms/" + form.id + "/deletion-review",
      (route) => {
        expect(route.request().method()).toBe("GET");
        return route.fulfill({
          json: {
            data: {
              formId: form.id,
              revision: 1,
              archived: false,
              purged: false,
              formHeld: false,
              heldResponses: 0,
              unexpiredResponses: 0,
              retainedResponses: 0,
              activeReferences: 0,
              drafts: 0,
              filesAwaitingCleanup: 0,
              exportsAwaitingCleanup: 0,
              activeExports: 0,
              publishedVersions: 0,
            },
          },
        });
      },
    );
    await page.goto("/admin/forms");
    await page
      .getByRole("button", { name: "Actions for " + form.title, exact: true })
      .click();
    const item = page.getByRole("menuitem", {
      name: "Delete form…",
      exact: true,
    });
    if (role === "super_admin") {
      await expect(item).toBeVisible();
      await item.click();
      const dialog = page.getByRole("dialog", {
        name: "Permanent form deletion",
        exact: true,
      });
      await expect(
        dialog.getByText("Archive the form first.", { exact: true }),
      ).toBeVisible();
      await expect(
        dialog.getByRole("button", {
          name: "Review permanent deletion",
          exact: true,
        }),
      ).toBeDisabled();
    } else await expect(item).toHaveCount(0);
    expect(fixture.writes).toEqual([]);
    expect(fixture.unexpected).toEqual([]);
  });
