import {
  test,
  expect,
  accessibility,
  fictionalBuilderForm,
} from "./public-fixture";
for (const individual of [false, true])
  for (const loss of ["before", "after"] as const)
    test(`${individual ? "individual" : "form"} privacy review recovers ${loss}-acceptance loss with fresh retry proof`, async ({
      page,
      fixture,
    }, info) => {
      fixture.authenticated = true;
      const form = {
          ...fictionalBuilderForm,
          status: "Open",
          actions: ["view", "view_responses", "delete"],
          versions: [
            {
              ...fictionalBuilderForm,
              version: 1,
              publishedAt: "2026-11-05T12:00:00Z",
            },
          ],
        },
        root = "/admin/forms/" + form.id,
        responseId = "fbbb0000-0000-4000-8000-000000000019",
        target =
          (individual ? root + "/responses/" + responseId : root) + "/privacy",
        proof = "fictional-initial-proof",
        freshProof = "fictional-new-proof",
        attempts: { key: string; body: string; proof: string }[] = [],
        receipts = new Map<string, number>(),
        errors: string[] = [];
      let lost = false,
        commits = 0,
        revision = 0,
        held = false,
        reason = "";
      page.on("pageerror", (e) => errors.push(e.message));
      const privacy = (isIndividual: boolean) => ({
        formId: form.id,
        revision: isIndividual ? 0 : revision,
        held: isIndividual ? false : held,
        reason: isIndividual ? "" : reason,
        draftDays: 7,
        canRelease: true,
        totalResponses: 1,
        heldResponses: isIndividual && held ? 1 : 0,
        dueResponses: 0,
        nextExpiry: "2027-01-01T12:00:00Z",
        pendingFiles: 0,
        ...(isIndividual
          ? {
              responseId,
              responseRevision: revision,
              responseHeld: held,
              responseReason: reason,
              responseExpiresAt: "2027-01-01T12:00:00Z",
              effectiveResponseHold: held,
            }
          : {}),
      });
      await page.route("**/api/v1/admin/forms/**", async (route) => {
        const request = route.request(),
          url = new URL(request.url()),
          path = url.pathname.replace("/api/v1", ""),
          method = request.method(),
          reply = (data: unknown) =>
            route.fulfill({ status: 200, json: { data } });
        if (method === "GET") {
          if (path === root) return reply({ form });
          if (path === root + "/views")
            return reply({ items: [], total: 0, page: 1, pageSize: 30 });
          if (path === root + "/responses")
            return reply({
              items: [
                {
                  id: responseId,
                  formId: form.id,
                  version: 1,
                  revision: 0,
                  status: individual && held ? "held" : "complete",
                  redacted: false,
                  submittedAt: "2026-11-05T12:00:00Z",
                  respondent: {
                    name: "Fictional Privacy Respondent",
                    email: "fictional-privacy@example.test",
                    source: "self_reported",
                  },
                  answers: { [form.fields[0].id]: "Fictional retained answer" },
                },
              ],
              total: 1,
              page: 1,
              pageSize: 30,
            });
          if (path === root + "/privacy") return reply(privacy(false));
          if (path === root + "/responses/" + responseId + "/privacy")
            return reply(privacy(true));
          if (path === root + "/responses/" + responseId + "/history")
            return reply({ items: [] });
          if (path === target + "/recovery") {
            const accepted = receipts.get(request.headers()["idempotency-key"]);
            return reply({
              committed: !!accepted,
              canRetry: !accepted,
              formId: form.id,
              responseId: individual ? responseId : null,
              currentRevision: revision,
              held,
              canRelease: true,
              targetExists: true,
              receipt: accepted
                ? {
                    formId: form.id,
                    responseId: individual ? responseId : null,
                    revision: accepted,
                  }
                : null,
            });
          }
          return route.fallback();
        }
        if (path !== target || method !== "POST") return route.fallback();
        const { currentPassword, ...document } = JSON.parse(
            request.postData() || "{}",
          ),
          key = request.headers()["idempotency-key"];
        attempts.push({
          key,
          body: JSON.stringify(document),
          proof: currentPassword,
        });
        if (!lost && loss === "before") {
          lost = true;
          return route.abort("connectionfailed");
        }
        if (!receipts.has(key)) {
          expect(document.revision).toBe(revision);
          revision++;
          held = document.held;
          reason = document.reason;
          commits++;
          receipts.set(key, revision);
        }
        if (!lost && loss === "after") {
          lost = true;
          return route.abort("connectionfailed");
        }
        return reply({ revision: receipts.get(key) });
      });
      await page.goto(root + "/responses");
      if (individual) {
        await page
          .getByRole("button", {
            name: "Open response " + responseId,
            exact: true,
          })
          .click();
        await page
          .getByRole("button", {
            name: "Review response retention & hold",
            exact: true,
          })
          .click();
      } else
        await page
          .getByRole("button", { name: "Retention & holds", exact: true })
          .click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("checkbox").check();
      await dialog
        .getByLabel("Private operational reason", { exact: false })
        .fill("Fictional reviewed operational reason");
      await dialog
        .getByLabel("Hold confirmation", { exact: false })
        .fill("HOLD " + (individual ? responseId : form.id));
      await dialog.getByLabel("Current password", { exact: true }).fill(proof);
      await dialog
        .getByRole("button", { name: "Confirm privacy review", exact: true })
        .click();
      const recovery = dialog.getByRole("region", {
        name: "Unconfirmed privacy review",
        exact: true,
      });
      await expect(recovery).toBeVisible();
      expect(attempts).toHaveLength(1);
      await expect(
        dialog.getByLabel("Current password", { exact: true }),
      ).toHaveValue("");
      expect(await accessibility(page)).toEqual([]);
      await recovery.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath(
          "privacy-" + (individual ? "response" : "form") + "-" + loss + ".png",
        ),
        fullPage: false,
        animations: "disabled",
      });
      await recovery
        .getByRole("button", {
          name: "Check original privacy outcome",
          exact: true,
        })
        .click();
      if (loss === "before") {
        await expect(
          recovery.getByText(/No committed receipt was found/),
        ).toBeVisible();
        await expect(
          recovery.getByRole("button", {
            name: "Retry identical privacy review",
            exact: true,
          }),
        ).toBeDisabled();
        await recovery
          .getByLabel("Current password for identical retry", { exact: false })
          .fill(freshProof);
        await recovery
          .getByRole("button", {
            name: "Retry identical privacy review",
            exact: true,
          })
          .click();
      }
      await expect(recovery).toHaveCount(0);
      await expect(
        dialog.getByText(/Privacy review confirmed at policy revision 1/),
      ).toBeVisible();
      expect(commits).toBe(1);
      expect(attempts).toHaveLength(loss === "before" ? 2 : 1);
      expect(attempts[0].proof).toBe(proof);
      if (loss === "before") {
        expect(attempts[1].key).toBe(attempts[0].key);
        expect(attempts[1].body).toBe(attempts[0].body);
        expect(attempts[1].proof).toBe(freshProof);
      }
      expect(fixture.writes).toEqual([]);
      expect(fixture.unexpected).toEqual([]);
      expect(errors).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    });
