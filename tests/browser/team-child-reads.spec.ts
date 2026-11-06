import {
  test,
  expect,
  accessibility,
  fictionalTeam,
  fictionalTeamInvite,
  fictionalTeamPost,
} from "./public-fixture";
for (const kind of ["invitations", "announcements"] as const) {
  test(`${kind} preserve drafts during read failure and clear private state on denial`, async ({
    page,
    fixture,
  }, info) => {
    fixture.authenticated = true;
    fixture.teamReview = true;
    fixture.failedTeamPanel = kind;
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/admin/team/" + fictionalTeam.id + "?section=" + kind);
    await expect(
      page.getByText("Fictional browser fixture request unavailable.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText(
        kind === "invitations"
          ? "No invitations recorded"
          : "No announcements in this view",
        { exact: true },
      ),
    ).toHaveCount(0);
    fixture.failedTeamPanel = "";
    const reload = page.getByRole("button", {
      name: "Reload " + kind,
      exact: true,
    });
    await reload.click();
    const text =
      kind === "invitations"
        ? fictionalTeamInvite.email
        : fictionalTeamPost.title;
    await expect(page.getByText(text, { exact: true })).toBeVisible();
    if (kind === "announcements")
      await page.getByRole("button", { name: "Write announcement" }).click();
    const input = page.getByLabel(
        kind === "invitations" ? /^Recipient email/ : /^Announcement title/,
      ),
      value =
        kind === "invitations"
          ? "fictional-unsent@example.test"
          : "Fictional unsent private announcement";
    await input.fill(value);
    fixture.failedTeamPanel = kind;
    await reload.click();
    await expect(
      page.getByText("Fictional browser fixture request unavailable.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(input).toHaveValue(value);
    await expect(input).toBeDisabled();
    await expect(page.getByText(/Showing the last successful/)).toBeVisible();
    await expect(page.getByText(text, { exact: true })).toBeVisible();
    fixture.failedTeamPanel = "";
    await reload.click();
    await expect(input).toBeEnabled();
    await expect(input).toHaveValue(value);
    await expect(
      page.getByRole("region", {
        name:
          kind === "invitations"
            ? "Private team invitations"
            : "Team announcements",
        exact: true,
      }),
    ).toBeFocused();
    expect(await accessibility(page)).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(kind + "-recovered.png"),
      fullPage: true,
      animations: "disabled",
    });
    fixture.deniedTeamPanel = kind;
    await reload.click();
    const recheck = page.getByRole("button", {
      name:
        kind === "invitations"
          ? "Recheck invitation access"
          : "Recheck announcement access",
    });
    await expect(recheck).toBeVisible();
    await expect(input).toHaveCount(0);
    await expect(page.getByText(text, { exact: true })).toHaveCount(0);
    expect(await accessibility(page)).toEqual([]);
    fixture.deniedTeamPanel = "";
    await recheck.click();
    await expect(page.getByText(text, { exact: true })).toBeVisible();
    if (kind === "invitations") await expect(input).toHaveValue("");
    else await expect(input).toHaveCount(0);
    expect(fixture.teamWrites).toEqual([]);
    expect(errors).toEqual([]);
  });
}
