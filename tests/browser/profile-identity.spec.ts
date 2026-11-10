import { test, expect, accessibility } from "./public-fixture";
const kept = "f1480000-0000-4000-8000-000000000001", draft = "f1480000-0000-4000-8000-000000000002";
test("saves an empty portfolio and consolidates a member draft into the published profile", async ({ page, fixture }, info) => {
  fixture.authenticated = true;
  const profiles = [
    { id: kept, name: "Fictional Owner", role: "President", revision: 3, is_active: true, admin_user_id: kept, member_id: null as string | null },
    { id: draft, name: "Fictional Owner", role: "Founder", revision: 1, is_active: false, admin_user_id: null, member_id: draft },
  ].map((p) => ({ ...p, email: "fictional-owner@example.test", bio: "Keep the existing public biography", image_url: null, linkedin_url: "", github_url: "", portfolio_url: null, team_id: null, team_section: "Active Members", order_index: 0, deleted_at: null as string | null, updated_at: "2026-11-10T12:00:00Z", actions: ["read", "update", "publish", "create", "delete"] }));
  let saves = 0, consolidations = 0;
  await page.route("**/api/v1/admin/content-records/team-profiles**", (route) => {
    const r = route.request(), url = new URL(r.url()), id = url.pathname.split("/").at(-1),
      row = profiles.find((p) => p.id === id), reply = (data: unknown) => route.fulfill({ json: { data } });
    if (r.method() === "PATCH") {
      expect(r.postDataJSON().record.portfolio_url).toBeNull();
      saves++; row!.revision++; return reply({ record: row });
    }
    if (r.method() === "POST") {
      const body = r.postDataJSON(); expect(body.action).toBe("reconcile"); expect(body.keepId).toBe(kept);
      expect(body.profiles).toEqual(profiles.map(({ id, revision }) => ({ id, revision })));
      consolidations++; profiles[0].member_id = draft; profiles[0].revision++; profiles[1].deleted_at = "2026-11-10T12:01:00Z";
      return reply({ record: profiles[0], archived: 1 });
    }
    if (id === "capabilities") return reply({ globalCreate: true, teams: [] });
    if (url.searchParams.get("duplicates") === "true") return reply({ email: profiles[0].email, profiles: profiles.filter((p) => !p.deleted_at).map((p) => ({ id: p.id, name: p.name, role: p.role, revision: p.revision, published: p.is_active, accountLinked: !!p.admin_user_id, memberLinked: !!p.member_id })) });
    return row ? reply({ record: row }) : reply({ items: profiles.filter((p) => !p.deleted_at), total: profiles.filter((p) => !p.deleted_at).length });
  });
  await page.goto("/admin/content/team");
  await page.getByRole("button", { name: "Edit Fictional Owner", exact: true }).nth(1).click();
  await expect(page.getByLabel("Portfolio / website", { exact: true })).toHaveValue("");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect.poll(() => saves).toBe(1);
  await page.getByRole("button", { name: "Resolve duplicates for Fictional Owner (Published)", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("radio", { name: /President/ })).toBeChecked();
  await dialog.getByRole("checkbox", { name: "Keep Fictional Owner (Published) and archive the other 1 profile.", exact: true }).check();
  expect(await accessibility(page)).toEqual([]);
  await page.screenshot({ path: info.outputPath("profile-consolidation-review.png"), animations: "disabled" });
  await dialog.getByRole("button", { name: "Confirm consolidation", exact: true }).click();
  await expect.poll(() => consolidations).toBe(1);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("cell", { name: "Published", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit Fictional Owner", exact: true })).toHaveCount(1);
  await expect(page.getByText("Keep the existing public biography", { exact: true })).toHaveCount(0);
  expect(fixture.unexpected).toEqual([]);
});
