import {
  test,
  expect,
  accessibility,
  fictionalBuilderForm,
} from "./public-fixture";
for (const scenario of [
  "expiry and denial",
  "late response after close",
] as const) {
  test(`private response attachment authorization handles ${scenario}`, async ({
    page,
    fixture,
  }, info) => {
    fixture.authenticated = true;
    const formId = fictionalBuilderForm.id,
      responseId = "fbbb0000-0000-4000-8000-000000000012",
      fileId = "fbbb0000-0000-4000-8000-000000000013",
      root = "/admin/forms/" + formId,
      fields = [
        {
          ...fictionalBuilderForm.fields[0],
          id: "fictional-file-field",
          type: "file",
          label: "Fictional supporting document",
          options: [],
        },
      ],
      form = {
        ...fictionalBuilderForm,
        fields,
        status: "Open",
        actions: ["view", "view_responses"],
        versions: [
          {
            ...fictionalBuilderForm,
            fields,
            version: 1,
            publishedAt: "2026-11-05T12:00:00Z",
          },
        ],
      };
    let status = 200,
      attempts = 0,
      release: (() => void) | undefined;
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const wait = new Promise<void>((done) => (release = done));
    await page.route("**/api/v1/admin/forms/**", async (route) => {
      const request = route.request(),
        path = new URL(request.url()).pathname.replace("/api/v1", "");
      if (request.method() !== "GET") return route.fallback();
      const reply = (data: unknown) =>
        route.fulfill({ status: 200, json: { data } });
      if (path === root) return reply({ form });
      if (path === root + "/views") return reply({ items: [] });
      if (path === root + "/responses")
        return reply({
          items: [
            {
              id: responseId,
              formId,
              version: 1,
              submittedAt: "2026-11-05T12:00:00Z",
              status: "complete",
              respondent: {
                name: "Fictional File Respondent",
                email: "fictional-file@example.test",
                source: "self_reported",
              },
              answers: { "fictional-file-field": [fileId] },
            },
          ],
          total: 1,
          page: 1,
          pageSize: 30,
        });
      if (path === root + "/responses/" + responseId + "/files/" + fileId) {
        attempts++;
        if (scenario === "late response after close") await wait;
        try {
          if (status !== 200)
            return await route.fulfill({
              status,
              json: {
                error: {
                  code: "UNAVAILABLE",
                  message: "Fictional attachment access unavailable.",
                },
              },
            });
          return await reply({
            url: "https://storage.example.test/form-uploads/fictional.pdf?signature=fictional",
            expiresIn: 60,
          });
        } catch {
          /* A closed response deliberately aborts the in-flight read. */
        }
        return;
      }
      return route.fallback();
    });
    await page.goto(root + "/responses");
    await page
      .getByRole("button", { name: "Open response " + responseId, exact: true })
      .click();
    const dialog = page.getByRole("dialog"),
      button = dialog.getByRole("button", {
        name: "Authorize private attachment 1",
      });
    await button.click();
    if (scenario === "late response after close") {
      await expect(button).toHaveCount(0);
      await expect(
        dialog.getByRole("button", { name: "Authorizing…" }),
      ).toBeDisabled();
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      release!();
      await page
        .getByRole("button", {
          name: "Open response " + responseId,
          exact: true,
        })
        .click();
      await expect(
        dialog.getByRole("link", { name: "Download attachment 1" }),
      ).toHaveCount(0);
      await expect(button).toBeEnabled();
      expect(attempts).toBe(1);
    } else {
      const link = dialog.getByRole("link", { name: "Download attachment 1" });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute("referrerpolicy", "no-referrer");
      expect(attempts).toBe(1);
      await page.clock.setFixedTime(new Date("2026-11-05T12:02:00Z"));
      // Dispatch activation only to exercise the expiry guard; expired URLs must not navigate.
      await link.dispatchEvent("click");
      await expect(link).toHaveCount(0);
      await expect(
        dialog.getByText(/download link expired or the connection changed/),
      ).toBeVisible();
      status = 403;
      await button.click();
      await expect(dialog.getByRole("alert")).toHaveText(
        "Fictional attachment access unavailable.",
      );
      await expect(link).toHaveCount(0);
      expect(attempts).toBe(2);
      status = 200;
      await button.click();
      await expect(link).toBeVisible();
      expect(attempts).toBe(3);
      await dialog
        .getByRole("group", { name: "Private response attachments" })
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath("private-file-authorized.png"),
        fullPage: false,
        animations: "disabled",
      });
    }
    expect(await accessibility(page)).toEqual([]);
    expect(fixture.writes).toEqual([]);
    expect(fixture.unexpected).toEqual([]);
    expect(errors).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(page.context().pages()).toHaveLength(1);
  });
}
