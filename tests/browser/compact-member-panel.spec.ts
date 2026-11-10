import { test, expect, accessibility } from "./public-fixture";
const id = "f1540000-0000-4000-8000-000000000001";
const record = {
  id, reference: "FICTIONAL", name: "Anish Example", email: "anish@example.test", phone: "", year: "2028", major: "Computer Science",
  interests: [], category: "member", is_active: true, is_core_team: false, team_section: "Active Members", team_id: null, teamName: null,
  revision: 1, deleted_at: null, merged_into_id: null, actions: ["update", "delete", "merge"], publicProfile: null, canSyncProfile: false, activeProjectCount: 0,
};
test("members search as typed and management stays in a bounded panel with guarded edits", async ({ page, fixture }, info) => {
  fixture.authenticated = true;
  const queries: string[] = [], writes: string[] = [];
  await page.route("**/api/v1/admin/members**", route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname.replace("/api/v1", "");
    if (req.method() !== "GET") { writes.push(req.method()); return route.abort(); }
    const reply = (data: unknown) => route.fulfill({ json: { data } });
    if (path.endsWith("/capabilities")) return reply({ globalCreate: true, merge: true, teams: [] });
    if (path.endsWith("/activity")) return reply({ items: [], page: 1, pageSize: 30 });
    if (path === "/admin/members/" + id) return reply({ member: record });
    queries.push(url.searchParams.get("q") || "");
    return reply({ items: [record], total: 1, pageSize: 30, stats: { active: 1, core: 0, categories: { member: 1 } } });
  });
  await page.goto("/admin/members");
  const search = page.getByRole("searchbox", { name: "Search private members", exact: true });
  await search.fill("anish");
  await expect.poll(() => queries.includes("anish")).toBe(true);
  await expect(search).toBeFocused();
  const before = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.getByRole("button", { name: "Manage Anish Example", exact: true }).click();
  const panel = page.getByRole("region", { name: "Member details", exact: true });
  await expect(panel.getByRole("heading", { name: record.name, exact: true })).toBeVisible();
  const box = await panel.boundingBox(), viewport = page.viewportSize()!;
  expect(box!.height).toBeLessThanOrEqual(viewport.height - 15);
  expect(box!.width).toBeLessThanOrEqual(Math.min(768, viewport.width - 15));
  expect(box!.x).toBeGreaterThanOrEqual(7);
  expect(box!.y).toBeGreaterThanOrEqual(7);
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(before);
  expect(await accessibility(page)).toEqual([]);
  await page.screenshot({ path: info.outputPath("compact-member-details.png") });
  await panel.getByRole("button", { name: "Edit member", exact: true }).click();
  const editor = page.getByRole("region", { name: "Member editor", exact: true });
  await expect(editor).toBeVisible();
  await editor.getByLabel("Name", { exact: false }).first().fill("Unsaved member name");
  await editor.getByRole("button", { name: "Close editor", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Stay here", exact: true }).click();
  await expect(editor.getByLabel("Name", { exact: false }).first()).toHaveValue("Unsaved member name");
  const ebox = await editor.boundingBox();
  expect(ebox!.height).toBeLessThanOrEqual(viewport.height - 15);
  await editor.screenshot({ path: info.outputPath("compact-member-editor.png") });
  await editor.getByRole("button", { name: "Close editor", exact: true }).click();
  await page.getByRole("button", { name: "Discard and leave", exact: true }).click();
  await expect(editor).toHaveCount(0);
  expect(writes).toEqual([]);
  expect(fixture.unexpected).toEqual([]);
});
