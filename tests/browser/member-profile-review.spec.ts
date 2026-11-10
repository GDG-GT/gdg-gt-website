import { test, expect, accessibility } from "./public-fixture";
const memberId = "f1700000-0000-4000-8000-000000000001",
  profileId = "f1700000-0000-4000-8000-000000000002";
test("member sync opens the exact named draft and publishing remains explicit", async ({ page, fixture }, info) => {
  fixture.authenticated = true;
  let synced = false;
  const mutations: string[] = [];
  const profile = {
    id: profileId, name: "Fictional new officer", role: "Executive board", bio: "",
    email: "fictional-officer@example.test", image_url: null, linkedin_url: "", github_url: "", portfolio_url: "",
    team_section: "Core Team", revision: 1, is_active: false, deleted_at: null, team_id: null,
    updated_at: "2026-11-10T12:00:00Z", order_index: 0, actions: ["read", "update", "create", "publish", "delete"],
  };
  const member = () => ({
    id: memberId, name: profile.name, email: profile.email, phone: "", year: "", major: "", interests: [],
    category: "organizer", is_active: true, is_core_team: true, team_section: "Core Team", team_id: null,
    teamName: null, reference: "MEM-" + memberId.replaceAll("-", "").toUpperCase(), revision: synced ? 2 : 1,
    deleted_at: null, merged_into_id: null, actions: ["read", "update"], canSyncProfile: true, activeProjectCount: 0,
    publicProfile: synced ? { id: profileId, name: profile.name, revision: profile.revision, active: profile.is_active } : null,
  });
  await page.route("**/api/v1/admin/members**", (route) => {
    const r = route.request(), path = new URL(r.url()).pathname,
      reply = (data: unknown) => route.fulfill({ json: { data } });
    if (r.method() === "POST") {
      const body = r.postDataJSON();
      expect(body.action).toBe("sync_profile");
      expect(body.confirmation).toBe(member().reference);
      mutations.push(body.action); synced = true;
      return reply({ id: memberId, revision: 2, profileId });
    }
    if (path.endsWith("/capabilities")) return reply({ globalCreate: true, merge: false, teams: [] });
    if (path.endsWith("/activity")) return reply({ items: [], page: 1, pageSize: 30 });
    if (path.endsWith("/members")) return reply({ items: [member()], total: 1, pageSize: 30, stats: { active: 1, core: 1, categories: { organizer: 1 } } });
    return reply({ member: member() });
  });
  await page.route("**/api/v1/admin/content-records/team-profiles**", (route) => {
    const r = route.request(), path = new URL(r.url()).pathname,
      reply = (data: unknown) => route.fulfill({ json: { data } });
    if (r.method() !== "GET") {
      expect(path.endsWith("/" + profileId)).toBe(true);
      expect(r.postDataJSON().action).toBe("publish");
      mutations.push("publish"); profile.is_active = true; profile.revision++;
      return reply({ record: profile });
    }
    if (path.endsWith("/capabilities")) return reply({ globalCreate: true, teams: [] });
    return path.endsWith("/" + profileId) ? reply({ record: profile }) : reply({ items: [profile], total: 1, page: 1, pageSize: 30 });
  });
  await page.goto("/admin/members?member=" + memberId);
  await page.getByRole("button", { name: "Sync draft public profile", exact: true }).click();
  await expect(page.getByLabel("Exact member reference", { exact: false })).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Create or update the draft Team profile for " + profile.name + ".", exact: true }).check();
  await page.getByLabel("Current password *", { exact: true }).fill("Fictional-review-proof");
  await page.getByRole("button", { name: "Create or update draft profile", exact: true }).click();
  await expect.poll(() => mutations).toEqual(["sync_profile"]);
  await page.getByRole("link", { name: "Review draft Team profile", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Edit " + profile.name, exact: true })).toBeVisible();
  await expect(page.getByLabel("Name *", { exact: true })).toHaveValue(profile.name);
  await page.screenshot({ path: info.outputPath("synced-team-draft.png"), animations: "disabled" });
  await page.getByRole("button", { name: "Cancel editing", exact: true }).click();
  await page.getByRole("button", { name: "Publish " + profile.name, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(profile.name);
  await dialog.getByRole("button", { name: "Confirm publication", exact: true }).click();
  await expect.poll(() => mutations).toEqual(["sync_profile", "publish"]);
  await expect(page.getByRole("cell", { name: "Published", exact: true })).toBeVisible();
  expect(await accessibility(page)).toEqual([]);
});
