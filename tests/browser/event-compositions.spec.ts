import {
  test,
  expect,
  fictionalMailEvent,
  fictionalMailAttendee,
} from "./public-fixture";
import { captureSecondaryComposition as capture } from "./composition-capture";

const states = [
  "event editor",
  "event attendees",
  "attendee correction",
  "attendee removal review",
  "event email draft",
  "event email history",
  "event archive review",
  "event cancellation review",
  "event unpublish review",
  "event duplication review",
] as const;

for (const state of states)
  test(`secondary ${state} composition remains readable and accessible`, async ({
    page,
    fixture,
  }, info) => {
    fixture.authenticated = true;
    fixture.eventMail = true;
    const errors: string[] = [],
      writes: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/v1/**", (route) => {
      const request = route.request(),
        url = new URL(request.url()),
        p = url.pathname.replace("/api/v1", "");
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
              message: "Read-only fictional event composition review",
            },
          },
        });
      }
      if (
        p === "/admin/events/" + fictionalMailEvent.id + "/email" &&
        url.searchParams.get("history") === "true"
      )
        return route.fulfill({
          json: {
            data: {
              items: [
                {
                  id: "fbbe0000-0000-4000-8000-000000000001",
                  subject: "Fictional saved event message",
                  message:
                    "Fictional saved message for an accessible workshop. Queued is not delivered.",
                  recipient_count: 1,
                  created_at: "2026-11-05T11:30:00Z",
                },
              ],
              total: 1,
            },
          },
        });
      return route.fallback();
    });
    await page.goto("/admin/events");
    const row = page
      .getByRole("row")
      .filter({ hasText: fictionalMailEvent.title });
    if (
      state === "event editor" ||
      state === "event archive review" ||
      state === "event cancellation review" ||
      state === "event unpublish review" ||
      state === "event duplication review"
    ) {
      await row.getByRole("button", { name: "Edit", exact: true }).click();
      await expect(
        page.getByLabel("Event title", { exact: false }),
      ).toHaveValue(fictionalMailEvent.title);
      if (state !== "event editor") {
        const action = {
          "event archive review": "Archive",
          "event cancellation review": "Cancel event",
          "event unpublish review": "Unpublish",
          "event duplication review": "Duplicate",
        }[state];
        await page.getByRole("button", { name: action, exact: true }).click();
        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();
        await expect(dialog).toContainText(fictionalMailEvent.title);
        if (
          state === "event archive review" ||
          state === "event cancellation review"
        ) {
          await expect(
            dialog.getByLabel("Type the event slug to confirm"),
          ).toHaveValue("");
          await expect(
            dialog.getByRole("button", { name: "Confirm", exact: true }),
          ).toBeDisabled();
        }
      }
    } else {
      await row
        .getByRole("button", { name: "Attendance", exact: true })
        .click();
      await expect(
        page.getByText(fictionalMailAttendee.attendee_email, { exact: true }),
      ).toBeVisible();
      if (
        state === "attendee correction" ||
        state === "attendee removal review"
      ) {
        await page.getByText("Edit attendee", { exact: true }).click();
        await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
          fictionalMailAttendee.attendee_name,
        );
        if (state === "attendee removal review") {
          await page
            .getByRole("button", { name: "Remove registration" })
            .click();
          await expect(
            page.getByRole("dialog", { name: "Remove this registration?" }),
          ).toContainText(fictionalMailAttendee.attendee_name);
        }
      } else if (
        state === "event email draft" ||
        state === "event email history"
      ) {
        await page
          .getByRole("button", {
            name: "Email registered attendees",
            exact: true,
          })
          .click();
        await expect(
          page.getByLabel("Subject", { exact: false }),
        ).toBeVisible();
        if (state === "event email draft") {
          await page.getByLabel(/^Subject/).fill("Fictional workshop reminder");
          await page
            .getByLabel(/^Message/)
            .fill(
              "Fictional reminder: bring your laptop and join the accessible demo review before the workshop.",
            );
        } else {
          await page
            .getByRole("button", { name: "Review your queued event messages" })
            .click();
          await expect(
            page
              .getByRole("region", { name: "Your queued event messages" })
              .getByRole("heading", { name: "Fictional saved event message" }),
          ).toBeVisible();
        }
      }
    }
    await capture(page, info, state);
    expect(errors).toEqual([]);
    expect(writes).toEqual([]);
    expect(fixture.unexpected).toEqual([]);
    expect(fixture.writes).toEqual([]);
    expect(fixture.mailApprovals).toEqual([]);
    expect(fixture.mailCommitted).toBe(0);
  });
