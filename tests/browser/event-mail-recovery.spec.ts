import {
  test,
  expect,
  accessibility,
  fictionalMailEvent,
  fictionalMailAttendee,
} from "./public-fixture";
for (const lost of ["before", "after"] as const) {
  test(`event mail reconciles a lost ${lost} approval without automatic sends`, async ({
    page,
    fixture,
  }, info) => {
    fixture.authenticated = true;
    fixture.eventMail = true;
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/admin/events");
    await page
      .getByRole("row")
      .filter({ hasText: fictionalMailEvent.title })
      .getByRole("button", { name: "Attendance", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Email registered attendees", exact: true })
      .click();
    await page.getByLabel(/^Subject/).fill("Fictional browser mail " + lost);
    await page
      .getByLabel(/^Message/)
      .fill("Fictional private message " + "LongContext".repeat(30));
    await page
      .getByRole("button", { name: "Review recipients and message" })
      .click();
    await page
      .getByText("Inspect all 1 recipient addresses", { exact: true })
      .click();
    await expect(
      page
        .getByRole("listitem")
        .filter({ hasText: fictionalMailAttendee.attendee_email }),
    ).toBeVisible();
    expect(await accessibility(page)).toEqual([]);
    expect(fixture.mailApprovals).toEqual([]);
    await page
      .getByLabel(/^Current password/)
      .fill("Fictional browser password");
    await page.getByLabel(/^Type SEND 1/).fill("SEND 1");
    fixture.loseMailApproval = lost;
    await page.getByRole("button", { name: "Queue 1 messages" }).click();
    const retry = page.getByRole("button", {
      name: "Retry original email approval",
    });
    await expect(retry).toBeDisabled();
    await expect(page.getByLabel(/^Fresh current password/)).toHaveValue("");
    expect(fixture.mailApprovals).toHaveLength(1);
    expect(fixture.mailCommitted).toBe(lost === "after" ? 1 : 0);
    await page
      .getByRole("button", { name: "Review your queued event messages" })
      .click();
    const history = page.getByRole("region", {
      name: "Your queued event messages",
      exact: true,
    });
    if (lost === "after")
      await expect(history).toContainText("Approval queued");
    else
      await expect(history).toContainText(
        "No queued event messages from your account on this page.",
      );
    expect(fixture.mailApprovals).toHaveLength(1);
    await page
      .getByRole("button", { name: "Hide queued message history" })
      .click();
    await page
      .getByRole("button", { name: "Recheck saved email approval" })
      .click();
    if (lost === "before") {
      await expect(
        page.getByText(/exact saved audience review remains ready/),
      ).toBeVisible();
      expect(fixture.mailApprovals).toHaveLength(1);
      expect(fixture.mailCommitted).toBe(0);
      await page
        .getByLabel(/^Fresh current password/)
        .fill("Fictional browser password");
      await retry.click();
      expect(fixture.mailApprovals).toHaveLength(2);
      expect(fixture.mailApprovals[1]).toEqual(fixture.mailApprovals[0]);
    }
    await expect(
      page.getByText(/1 audience-bound messages are queued/),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Review email to 1 attendees" }),
    ).toHaveCount(0);
    expect(fixture.mailCommitted).toBe(1);
    expect(fixture.mailApprovals).toHaveLength(lost === "after" ? 1 : 2);
    expect(await accessibility(page)).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath("mail-" + lost + "-recovered.png"),
      fullPage: true,
      animations: "disabled",
    });
    expect(errors).toEqual([]);
  });
}
