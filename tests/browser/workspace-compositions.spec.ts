import {
  test,
  expect,
  accessibility,
  fictionalBuilderForm,
  fictionalMailEvent,
  fictionalTeam,
} from "./public-fixture";
const form = {
  ...fictionalBuilderForm,
  status: "Open",
  version: 1,
  versionId: "fbbb0000-0000-4000-8000-000000000019",
  actions: ["view", "edit", "publish", "view_responses"],
  versions: [
    {
      ...fictionalBuilderForm,
      version: 1,
      publishedAt: "2026-11-05T12:00:00Z",
    },
  ],
};
const formRoot = "/admin/forms/" + form.id;
const surfaces = [
  { name: "overview", route: "/admin", text: "Fictional review task" },
  { name: "events", route: "/admin/events", text: fictionalMailEvent.title },
  { name: "teams", route: "/admin/teams", text: fictionalTeam.name },
  {
    name: "team workspace",
    route: "/admin/team/" + fictionalTeam.id,
    text: fictionalTeam.description,
  },
  { name: "forms library", route: "/admin/forms", text: form.title },
  { name: "forms builder", route: formRoot + "/edit", text: form.title },
  { name: "public form", route: "/forms/" + form.slug, text: form.title },
  {
    name: "forms responses",
    route: formRoot + "/responses",
    text: "fictional-response@example.test",
  },
];
for (const surface of surfaces)
  test(`populated ${surface.name} composition is accessible and scrollable`, async ({
    page,
    fixture,
  }, info) => {
    fixture.authenticated = surface.name !== "public form";
    fixture.eventMail = true;
    fixture.teamReview = true;
    fixture.formLibrary = true;
    fixture.formBuilder = true;
    const errors: string[] = [],
      writes: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/v1/**", (route) => {
      const request = route.request(),
        p = new URL(request.url()).pathname.replace("/api/v1", "");
      const reply = (data: unknown) => route.fulfill({ json: { data } });
      if (
        request.method() !== "GET" &&
        !["/auth/realtime-token", "/realtime/token"].includes(p)
      ) {
        writes.push(request.method() + " " + p);
        return route.fulfill({
          status: 403,
          json: {
            error: {
              code: "FORBIDDEN",
              message: "Fictional review writes disabled",
            },
          },
        });
      }
      if (p === "/forms/" + form.slug)
        return reply({ form: { ...form, copyAvailable: true } });
      if (p === formRoot && surface.name === "forms responses")
        return reply({ form });
      if (p === formRoot + "/responses")
        return reply({
          items: [
            {
              id: "fbbb0000-0000-4000-8000-000000000014",
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
        });
      if (p === formRoot + "/analytics")
        return reply({ responseCount: 1, fields: [] });
      if (p === formRoot + "/views") return reply({ items: [] });
      if (p === formRoot + "/privacy") return reply({ held: false });
      if (p === "/admin/dashboard") {
        const ready = (data: unknown) => ({ state: "ready", data });
        return reply({
          generatedAt: "2026-11-05T12:00:00Z",
          allowedRoutes: ["/admin/events", "/admin/forms"],
          widgets: {
            events: ready({ count: 1, items: [fictionalMailEvent] }),
            profiles: ready({ count: 4 }),
            finances: ready({ pending: 2 }),
            messages: ready({ unread: 1 }),
            registrations: ready({
              totalEvents: 1,
              items: [
                {
                  id: fictionalMailEvent.id,
                  title: fictionalMailEvent.title,
                  internal: 8,
                  external: 2,
                },
              ],
            }),
            funding: ready({
              items: [{ status: "pending", count: 2, amount: "120.00" }],
            }),
            activity: ready({
              items: [
                {
                  id: "fictional-activity",
                  action: "Fictional event review",
                  result: "success",
                  created_at: "2026-11-05T12:00:00Z",
                },
              ],
            }),
            tasks: ready({
              items: [
                {
                  id: "fictional-task",
                  title: "Fictional review task",
                  status: "todo",
                  due_date: "2099-11-10",
                  priority: "normal",
                },
              ],
            }),
            memberships: ready({
              items: [
                {
                  id: fictionalTeam.id,
                  name: fictionalTeam.name,
                  role: "member",
                },
              ],
            }),
          },
        });
      }
      return route.fallback();
    });
    await page.goto(surface.route);
    await expect(
      surface.name === "forms responses"
        ? page.getByRole("cell").filter({ hasText: surface.text }).first()
        : page.getByText(surface.text, { exact: true }).first(),
    ).toBeVisible();
    await expect(page.locator("h1")).toHaveCount(1);
    expect(await accessibility(page)).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(
        "populated-" + surface.name.replaceAll(" ", "-") + ".png",
      ),
      fullPage: true,
      animations: "disabled",
    });
    await info.attach(surface.name, {
      path: info.outputPath(
        "populated-" + surface.name.replaceAll(" ", "-") + ".png",
      ),
      contentType: "image/png",
    });
    if (
      await page.evaluate(
        () => document.documentElement.scrollHeight > innerHeight,
      )
    ) {
      await page.evaluate(() => scrollTo(0, 500));
      await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
    }
    expect(errors).toEqual([]);
    expect(writes).toEqual([]);
    expect(fixture.unexpected).toEqual([]);
  });
