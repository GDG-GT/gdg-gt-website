import { captureSecondaryComposition as capture } from "./composition-capture";
import { test, expect, fictionalBuilderForm } from "./public-fixture";

const responseId = "f2600000-0000-4000-8000-000000000001";
const peerId = "f2600000-0000-4000-8000-000000000002";
const recordedAt = "2026-11-05T12:00:00Z";
const states = [
  "builder access",
  "published version comparison",
  "form publication review",
  "response revision review",
  "response retention review",
  "response export review",
  "response sensitive reveal",
] as const;

for (const state of states)
  test(`secondary ${state} keeps permissions and private review readable`, async ({
    page,
    fixture,
  }, info) => {
    fixture.authenticated = true;
    fixture.formBuilder = true;
    const snapshot = {
      ...structuredClone(fictionalBuilderForm),
      settings: { ...fictionalBuilderForm.settings, access: "internal" },
      fields: fictionalBuilderForm.fields.map((field, index) => ({
        ...field,
        sensitive: index === 0,
      })),
    };
    const form = {
      ...snapshot,
      status: "Open",
      actions: [
        "view",
        "edit",
        "publish",
        "manage_access",
        "view_responses",
        "view_sensitive_responses",
        "export_responses",
        "delete",
      ],
      versions: [{ ...snapshot, version: 1, publishedAt: recordedAt }],
    };
    const root = "/admin/forms/" + form.id;
    const historyRoot = root + "/responses/" + responseId + "/history";
    const writes: string[] = [],
      unexpected: string[] = [],
      errors: string[] = [],
      sensitiveReads: boolean[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/v1/**", async (route) => {
      const request = route.request(),
        url = new URL(request.url()),
        p = url.pathname.replace("/api/v1", "");
      const reply = (data: unknown) => route.fulfill({ json: { data } });
      if (request.method() !== "GET") {
        if (["/auth/realtime-token", "/realtime/token"].includes(p))
          return route.fallback();
        writes.push(request.method() + " " + p);
        return route.fulfill({
          status: 403,
          json: {
            error: {
              code: "FORBIDDEN",
              message: "Read-only fictional form review",
            },
          },
        });
      }
      if (p === root) return reply({ form });
      if (p === root + "/views" || p === root + "/exports")
        return reply({ items: [] });
      if (p === root + "/responses") {
        const sensitive = url.searchParams.get("sensitive") === "true";
        sensitiveReads.push(sensitive);
        return reply({
          items: [
            {
              id: responseId,
              formId: form.id,
              version: 1,
              revision: 1,
              submittedAt: recordedAt,
              status: "complete",
              respondent: {
                name: "Fictional review respondent",
                email: "fictional-review@example.test",
                source: "self_reported",
              },
              answers: sensitive
                ? { [form.fields[0].id]: "Fictional sensitive answer" }
                : {},
            },
          ],
          total: 1,
          page: 1,
          pageSize: 30,
        });
      }
      if (p === root + "/privacy")
        return reply({
          formId: form.id,
          revision: 0,
          held: false,
          reason: "",
          draftDays: 7,
          canRelease: true,
          totalResponses: 1,
          heldResponses: 0,
          dueResponses: 0,
          nextExpiry: "2027-01-01T12:00:00Z",
          pendingFiles: 0,
        });
      if (p === historyRoot)
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
      if (p === historyRoot + "/0")
        return reply({
          responseId,
          revision: 0,
          version: 1,
          current: false,
          recordedAt,
          redacted: false,
          fields: [
            {
              id: form.fields[0].id,
              label: "Original fictional private question",
              type: "short",
              sensitive: true,
              masked: true,
              answered: true,
              value: null,
            },
            {
              id: "fictional-previous-note",
              label: "Original fictional note",
              type: "short",
              sensitive: false,
              masked: false,
              answered: true,
              value: "Fictional historical answer",
            },
          ],
        });
      if (p === root + "/collaborators")
        return reply({
          items: [
            {
              admin_user_id: peerId,
              display_name: "Fictional form collaborator",
              actions: ["view", "view_responses"],
              grantId: "f2600000-0000-4000-8000-000000000003",
              grantRevision: 1,
              updated_at: recordedAt,
            },
          ],
          total: 1,
          page: 1,
          pageSize: 30,
        });
      if (p === root + "/collaborator-candidates")
        return reply({
          items: [
            {
              id: peerId,
              display_name: "Fictional form collaborator",
              role: "team_member",
              actions: ["view", "view_responses"],
              grantId: "f2600000-0000-4000-8000-000000000003",
              grantRevision: 1,
            },
          ],
          total: 1,
          page: 1,
          pageSize: 30,
        });
      if (p === root + "/invitations")
        return reply({ items: [], total: 0, page: 1, pageSize: 30 });
      if (p.startsWith(root + "/")) {
        unexpected.push(p);
        return route.fulfill({
          status: 404,
          json: {
            error: {
              code: "NOT_FOUND",
              message: "Unmapped fictional form review read",
            },
          },
        });
      }
      return route.fallback();
    });
    const builder = [
      "builder access",
      "published version comparison",
      "form publication review",
    ].includes(state);
    await page.goto(root + (builder ? "/edit" : "/responses"));
    if (state === "builder access") {
      if (info.project.name.includes("mobile"))
        await page
          .getByRole("button", { name: "Settings", exact: true })
          .click();
      await page.getByRole("tab", { name: "Access", exact: true }).click();
      const panel = info.project.name.includes("mobile")
        ? page.getByRole("dialog", { name: "Form access", exact: true })
        : page.getByRole("tabpanel", { name: "Access", exact: true });
      await expect(
        panel.getByText("Fictional form collaborator", { exact: true }),
      ).toBeVisible();
      await expect(
        panel.getByRole("button", { name: "Remove collaborator", exact: true }),
      ).toBeEnabled();
      await expect(
        panel.getByRole("button", {
          name: "Save collaborator access",
          exact: true,
        }),
      ).toBeDisabled();
    } else if (state === "published version comparison") {
      await page
        .getByRole("button", { name: "Version history", exact: true })
        .click();
      const dialog = page.getByRole("dialog", {
        name: "Published versions",
        exact: true,
      });
      await dialog
        .getByText("Compare with another version or the current draft", {
          exact: true,
        })
        .click();
      await expect(
        dialog.getByRole("combobox", { name: /^Compare snapshot against/ }),
      ).toHaveValue("draft");
      await dialog
        .getByText("Published version settings", { exact: true })
        .click();
      await expect(dialog.locator("pre").last()).toContainText(
        '"access": "internal"',
      );
    } else if (state === "form publication review") {
      await page.getByRole("button", { name: "Publish", exact: true }).click();
      const dialog = page.getByRole("dialog", {
        name: "Ready to share?",
        exact: true,
      });
      await expect(
        dialog.getByText(/This publishes immutable version 2/),
      ).toBeVisible();
      await expect(
        dialog.getByRole("button", { name: "Publish version", exact: true }),
      ).toBeEnabled();
    } else if (state === "response retention review") {
      await page
        .getByRole("button", { name: "Retention & holds", exact: true })
        .click();
      const dialog = page.getByRole("dialog", {
        name: "Form retention & holds",
        exact: true,
      });
      await expect(
        dialog.getByRole("spinbutton", { name: /^Incomplete draft retention/ }),
      ).toHaveValue("7");
      await expect(
        dialog.getByRole("button", {
          name: "Confirm privacy review",
          exact: true,
        }),
      ).toBeDisabled();
    } else if (state === "response export review") {
      await page
        .getByRole("button", { name: "Review export", exact: true })
        .click();
      const review = page.getByRole("region", {
        name: "Review export creation",
        exact: true,
      });
      await expect(review).toContainText("Sensitive answers excluded.");
      await expect(
        review.getByRole("button", { name: "Create export", exact: true }),
      ).toBeEnabled();
    } else {
      if (state === "response sensitive reveal") {
        const reveal = page.getByRole("checkbox", {
          name: "Reveal sensitive answers (audited)",
          exact: true,
        });
        // This control updates router search state asynchronously. Verify the
        // eventual controlled value rather than check()'s immediate DOM read.
        await reveal.click();
        await expect(reveal).toBeChecked();
        await expect(page).toHaveURL(/sensitive=true/);
        await expect.poll(() => sensitiveReads.includes(true)).toBe(true);
      }
      await page
        .getByRole("button", {
          name: "Open response " + responseId,
          exact: true,
        })
        .click();
      const dialog = page.getByRole("dialog");
      if (state === "response sensitive reveal") {
        await expect(
          dialog.getByText("Fictional sensitive answer", { exact: true }),
        ).toBeVisible();
      } else {
        await expect(
          dialog.getByText("Hidden by default", { exact: true }),
        ).toHaveCount(1);
        await dialog
          .getByRole("button", { name: "Review revision history", exact: true })
          .click();
        await dialog
          .getByRole("button", { name: "Revision 0", exact: true })
          .click();
        const history = dialog.getByRole("region", {
          name: "Response revision history",
          exact: true,
        });
        await expect(
          history.getByText("Fictional historical answer", { exact: true }),
        ).toBeVisible();
        await expect(
          history.getByText("Hidden by default", { exact: true }),
        ).toBeVisible();
        await expect(history.getByRole("checkbox")).not.toBeChecked();
      }
    }
    await capture(page, info, state);
    expect(writes).toEqual([]);
    expect(unexpected).toEqual([]);
    expect(errors).toEqual([]);
  });
