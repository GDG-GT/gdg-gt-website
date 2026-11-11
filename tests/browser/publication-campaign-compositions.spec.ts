import { captureSecondaryComposition as capture } from "./composition-capture";
import {
  test,
  expect,
  fictionalMailEvent,
  fictionalMailAttendee,
} from "./public-fixture";
import { mediaFixture, newsletterFixture } from "./operations-records";

const states = [
  "private upload selection",
  "private upload validation",
  "image publication review",
  "image revocation review",
  "campaign custom audience",
  "campaign send entry",
  "campaign send approval",
  "campaign delivery results",
  "registration data table",
  "event email approval review",
] as const;

for (const state of states)
  test(`secondary ${state} keeps publication consequences and delivery status readable`, async ({
    page,
    fixture,
  }, info) => {
    fixture.authenticated = true;
    fixture.eventMail = state === "event email approval review";
    const media = mediaFixture(),
      newsletter = newsletterFixture();
    if (state === "image revocation review") media.file.public = true;
    if (state === "campaign delivery results")
      newsletter.record.status = "sent";
    if (state === "campaign send approval")
      newsletter.record.content = Array(24)
        .fill(
          "Fictional workshop update: review the complete message, caption plan, practical checklist and accessible demo instructions before approving any delivery.",
        )
        .join("\n\n");
    const reviewRecipients = Array.from({ length: 18 }, (_, index) => ({
      id: "f1600000-0000-4000-8000-" + String(index + 20).padStart(12, "0"),
      email:
        index === 0
          ? "fictional-confirmed@example.test"
          : `fictional-confirmed-${index + 1}@example.test`,
    }));
    const campaignRoot = "/admin/newsletter/campaigns/" + newsletter.id;
    const eventRoot = "/admin/events/" + fictionalMailEvent.id;
    const eventSubject = "Fictional attendee reminder";
    const eventMessage =
      "Fictional reminder: review the accessible workshop checklist before arriving.";
    const writes: string[] = [],
      unexpected: string[] = [],
      errors: string[] = [];
    const syntheticReviews: unknown[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/v1/**", async (route) => {
      const request = route.request(),
        url = new URL(request.url());
      const p = url.pathname.replace("/api/v1", "");
      const reply = (data: unknown) => route.fulfill({ json: { data } });
      if (request.method() === "GET" && p === eventRoot + "/attendees")
        return reply({
          items: reviewRecipients.map((person, index) => ({
            ...fictionalMailAttendee,
            id: person.id,
            attendee_name: `Fictional attendee ${index + 1}`,
            attendee_email: person.email,
          })),
          total: reviewRecipients.length,
          page: 1,
          pageSize: 50,
        });
      if (
        request.method() === "POST" &&
        p === eventRoot + "/email-review" &&
        state === "event email approval review"
      ) {
        const body = request.postDataJSON();
        syntheticReviews.push(body);
        return reply({
          reviewId: "f1600000-0000-4000-8000-000000000040",
          subject: body.subject,
          message: body.message,
          expiresAt: "2026-11-05T12:05:00Z",
          count: reviewRecipients.length,
          recipients: reviewRecipients,
        });
      }
      if (request.method() === "GET" && p === "/admin/dashboard")
        return reply({
          generatedAt: "2026-11-05T12:00:00Z",
          allowedRoutes: [],
          widgets: {
            registrations: {
              state: "ready",
              data: {
                totalEvents: 1,
                items: [
                  {
                    id: "f1600000-0000-4000-8000-000000000015",
                    title: "Fictional accessible workshop registration review",
                    internal: 8,
                    external: 2,
                  },
                ],
              },
            },
          },
        });
      // This one POST is answered entirely by the fictional fixture. It creates
      // no server receipt, freezes no real audience and never approves delivery.
      if (
        request.method() === "POST" &&
        p === campaignRoot + "/send-review" &&
        state === "campaign send approval"
      ) {
        syntheticReviews.push(request.postDataJSON());
        return reply({
          reviewId: "f1600000-0000-4000-8000-000000000011",
          reviewToken: "fictional-review-handle",
          expiresAt: "2026-11-05T12:05:00Z",
          count: reviewRecipients.length,
          subject: newsletter.record.subject,
          content: newsletter.record.content,
          recipients: reviewRecipients,
        });
      }
      if (request.method() !== "GET") {
        if (["/auth/realtime-token", "/realtime/token"].includes(p))
          return route.fallback();
        writes.push(request.method() + " " + p);
        return route.fulfill({
          status: 403,
          json: {
            error: {
              code: "FORBIDDEN",
              message:
                "Composition fixture refuses application writes and sends",
            },
          },
        });
      }
      if (p === "/admin/media" || p === "/admin/media/events")
        return reply(media.response(p + url.search));
      if (p === campaignRoot + "/delivery")
        return reply({
          status: "sent",
          counts: { accepted: 1, failed: 1 },
          page: 1,
          total: 2,
          items: [
            {
              id: "f1600000-0000-4000-8000-000000000013",
              email: "fictional-confirmed@example.test",
              state: "sent",
              provider_state: null,
              error_code: null,
              attempt_count: 1,
            },
            {
              id: "f1600000-0000-4000-8000-000000000014",
              email: "fictional-failed@example.test",
              state: "failed",
              provider_state: "email.bounced",
              error_code: "FICTIONAL_FAILURE",
              attempt_count: 1,
            },
          ],
        });
      if (p.startsWith("/admin/newsletter")) {
        if (p.includes("/forms"))
          return reply({ items: [], total: 0, pageSize: 30 });
        return reply(newsletter.response(p + url.search));
      }
      if (p.startsWith("/admin/media")) {
        unexpected.push(p);
        return route.fulfill({
          status: 404,
          json: { error: { code: "NOT_FOUND" } },
        });
      }
      return route.fallback();
    });
    if (state.startsWith("private upload")) {
      await page.goto("/admin/media");
      await page
        .getByRole("button", { name: "Upload privately", exact: true })
        .click();
      const upload = page.getByRole("region", { name: "Upload private media" });
      await expect(upload).toBeVisible();
      const picker = upload.locator('input[type="file"]');
      await expect(picker).toHaveAccessibleName(/^Media file(?:\s|$)/);
      await picker.setInputFiles({
        name:
          state === "private upload validation"
            ? "fictional-unsupported.svg"
            : "fictional-workshop-handout.pdf",
        mimeType:
          state === "private upload validation"
            ? "image/svg+xml"
            : "application/pdf",
        buffer: Buffer.from(
          "Fictional composition input; no upload is submitted.",
        ),
      });
      const submit = upload.getByRole("button", {
        name: "Upload privately",
        exact: true,
      });
      await expect(submit).toBeEnabled();
      if (state === "private upload validation") {
        await submit.click();
        await expect(upload.getByRole("alert")).toContainText(
          "SVG and HTML are not supported",
        );
        await expect(
          upload.getByRole("button", { name: "Retry private upload" }),
        ).toBeEnabled();
      } else
        await expect(upload).toContainText("fictional-workshop-handout.pdf");
    } else if (state.startsWith("image")) {
      await page.goto("/admin/media");
      await page
        .getByRole("button", { name: media.file.name, exact: true })
        .click();
      const editor = page.getByRole("region", { name: "Selected media file" });
      const revoke = state === "image revocation review";
      await editor
        .getByRole("button", {
          name: revoke ? "Review revocation" : "Review public image",
          exact: true,
        })
        .click();
      await expect(
        editor.getByRole("heading", {
          name: revoke
            ? "Revoke public image delivery"
            : "Approve this image for the public gallery",
          exact: true,
        }),
      ).toBeVisible();
      await expect(editor.getByLabel(/^Current password(?:\s|$)/)).toHaveValue(
        "",
      );
      await expect(
        editor.getByRole("button", {
          name: revoke ? "Revoke publication" : "Approve public WebP image",
          exact: true,
        }),
      ).toBeDisabled();
    } else if (state === "event email approval review") {
      await page.goto("/admin/events");
      const row = page
        .getByRole("row")
        .filter({ hasText: fictionalMailEvent.title });
      await row
        .getByRole("button", { name: "Attendance", exact: true })
        .click();
      await page
        .getByRole("button", {
          name: "Email registered attendees",
          exact: true,
        })
        .click();
      await page.getByRole("textbox", { name: /^Subject/ }).fill(eventSubject);
      await page.getByRole("textbox", { name: /^Message/ }).fill(eventMessage);
      await page
        .getByRole("button", {
          name: "Review recipients and message",
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("heading", {
          name: "Review email to 18 attendees",
          exact: true,
        }),
      ).toBeVisible();
      await page
        .getByText("Inspect all 18 recipient addresses", { exact: true })
        .click();
      const addresses = page.getByRole("list", {
        name: "Event email recipient addresses for review",
        exact: true,
      });
      const bounds = await addresses.evaluate((node) => ({
        visible: node.clientHeight,
        content: node.scrollHeight,
      }));
      expect(bounds.content).toBeGreaterThan(bounds.visible);
      await addresses.focus();
      await expect(addresses).toBeFocused();
      await page.keyboard.press("PageDown");
      await expect
        .poll(() => addresses.evaluate((node) => node.scrollTop))
        .toBeGreaterThan(0);
      await page.keyboard.press("End");
      await expect
        .poll(() =>
          addresses.evaluate(
            (node) =>
              Math.abs(
                node.scrollHeight - node.clientHeight - node.scrollTop,
              ) <= 1,
          ),
        )
        .toBe(true);
      await page.keyboard.press("Home");
      await expect
        .poll(() => addresses.evaluate((node) => node.scrollTop))
        .toBe(0);
      await expect(
        page.getByRole("button", { name: "Queue 18 messages", exact: true }),
      ).toBeDisabled();
      expect(fixture.mailApprovals).toEqual([]);
      expect(fixture.mailCommitted).toBe(0);
    } else if (state === "registration data table") {
      await page.goto("/admin");
      await page
        .getByText("View registration data table", { exact: true })
        .click();
      const table = page.getByRole("region", {
        name: "Registration data table, scroll horizontally for all columns",
        exact: true,
      });
      await expect(table).toContainText(
        "Fictional accessible workshop registration review",
      );
      await table.focus();
      await expect(table).toBeFocused();
      const width = await table.evaluate((node) => ({
        visible: node.clientWidth,
        content: node.scrollWidth,
      }));
      if (width.content > width.visible) {
        await page.keyboard.press("ArrowRight");
        await expect
          .poll(() => table.evaluate((node) => node.scrollLeft))
          .toBeGreaterThan(0);
        await page.keyboard.press("Home");
        await expect
          .poll(() => table.evaluate((node) => node.scrollLeft))
          .toBe(0);
      }
    } else {
      await page.goto("/admin/newsletter");
      await page
        .getByRole("button", { name: newsletter.record.subject!, exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Preview saved email", exact: true }),
      ).toBeVisible();
      if (state === "campaign custom audience") {
        await page
          .getByRole("combobox", { name: "Audience", exact: true })
          .selectOption("custom");
        const recipient = page.getByRole("checkbox", {
          name: "fictional-subscriber@example.test",
          exact: true,
        });
        await expect(recipient).toBeVisible();
        await recipient.check();
        await expect(
          page.getByRole("group", {
            name: "Choose recipients · 1 selected",
            exact: true,
          }),
        ).toBeVisible();
      } else if (state === "campaign delivery results") {
        const delivery = page.getByRole("region", {
          name: "Campaign delivery results",
        });
        await expect(delivery).toContainText(
          "fictional-confirmed@example.test",
        );
        await expect(delivery).toContainText("Accepted");
        await expect(delivery).toContainText("Not reported");
        await expect(delivery).toContainText("bounced");
        const table = delivery.getByRole("region", {
          name: "Campaign delivery table, scroll horizontally for all columns",
          exact: true,
        });
        await table.focus();
        await expect(table).toBeFocused();
        const width = await table.evaluate((node) => ({
          visible: node.clientWidth,
          content: node.scrollWidth,
        }));
        if (width.content > width.visible) {
          await page.keyboard.press("ArrowRight");
          await expect
            .poll(() => table.evaluate((node) => node.scrollLeft))
            .toBeGreaterThan(0);
          await page.keyboard.press("Home");
          await expect
            .poll(() => table.evaluate((node) => node.scrollLeft))
            .toBe(0);
        }
      } else {
        await page
          .getByRole("button", { name: "Review audience & send", exact: true })
          .click();
        await expect(
          page.getByRole("heading", {
            name: "Review the exact audience",
            exact: true,
          }),
        ).toBeVisible();
        if (state === "campaign send approval") {
          await page
            .getByRole("button", { name: "Generate send review", exact: true })
            .click();
          await page
            .getByText("Review recipient addresses (18)", { exact: true })
            .click();
          await expect(
            page.getByText("fictional-confirmed@example.test", { exact: true }),
          ).toBeVisible();
          await expect(
            page.getByLabel(/^Current password(?:\s|$)/),
          ).toHaveValue("");
          await expect(
            page.getByRole("button", { name: "Approve send", exact: true }),
          ).toBeDisabled();
          const recipients = page.getByRole("list", {
            name: "Confirmed recipient addresses for review",
            exact: true,
          });
          const message = page.getByRole("region", {
            name: "Campaign message for review",
            exact: true,
          });
          for (const reviewPanel of [recipients, message]) {
            const bounds = await reviewPanel.evaluate((node) => ({
              visible: node.clientHeight,
              content: node.scrollHeight,
            }));
            expect(bounds.content).toBeGreaterThan(bounds.visible);
            await reviewPanel.focus();
            await expect(reviewPanel).toBeFocused();
            await page.keyboard.press("ArrowDown");
            await expect
              .poll(() => reviewPanel.evaluate((node) => node.scrollTop))
              .toBeGreaterThan(0);
            const before = await reviewPanel.evaluate((node) => node.scrollTop);
            await page.keyboard.press("PageDown");
            await expect
              .poll(() => reviewPanel.evaluate((node) => node.scrollTop))
              .toBeGreaterThan(before);
            await page.keyboard.press("End");
            await expect
              .poll(() =>
                reviewPanel.evaluate(
                  (node) =>
                    Math.abs(
                      node.scrollHeight - node.clientHeight - node.scrollTop,
                    ) <= 1,
                ),
              )
              .toBe(true);
            await page.keyboard.press("Home");
            await expect
              .poll(() => reviewPanel.evaluate((node) => node.scrollTop))
              .toBe(0);
          }
        }
      }
    }
    await capture(page, info, state);
    expect(syntheticReviews).toEqual(
      state === "campaign send approval"
        ? [{ revision: 1 }]
        : state === "event email approval review"
          ? [{ subject: eventSubject, message: eventMessage }]
          : [],
    );
    expect(writes).toEqual([]);
    expect(unexpected).toEqual([]);
    expect(errors).toEqual([]);
    expect(fixture.writes).toEqual([]);
    expect(fixture.unexpected).toEqual([]);
  });
