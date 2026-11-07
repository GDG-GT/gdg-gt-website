import { test, expect } from "./public-fixture";
import { captureSecondaryComposition as capture } from "./composition-capture";
import { boardDocument } from "../../shared/whiteboards.mjs";

const id = "fbbf0000-0000-4000-8000-000000000001";
const actor = "fbbb0000-0000-4000-8000-000000000001";
const document = boardDocument.parse({
  elements: [
    {
      id: "fictional-planning-frame",
      type: "rectangle",
      x: 80,
      y: 80,
      width: 360,
      height: 140,
      angle: 0,
      strokeColor: "#ad4033",
      backgroundColor: "transparent",
      roughness: 0,
      strokeWidth: 2,
    },
    {
      id: "fictional-planning-label",
      type: "text",
      x: 100,
      y: 125,
      width: 315,
      height: 25,
      angle: 0,
      text: "Fictional accessible workshop",
      originalText: "Fictional accessible workshop",
      fontSize: 20,
      fontFamily: 2,
      strokeColor: "#292827",
      backgroundColor: "transparent",
    },
  ],
  appState: { viewBackgroundColor: "#f2f3f4" },
});
const board = {
  id,
  name: "Fictional chapter planning board",
  team_id: null,
  version: 1,
  created_by: actor,
  updated_at: "2026-11-05T12:00:00Z",
  deleted_at: null,
};

for (const state of ["whiteboard canvas", "whiteboard collaborators"] as const)
  test(`secondary ${state} remains readable with the actual drawing editor`, async ({
    page,
    fixture,
  }, info) => {
    fixture.authenticated = true;
    const writes: string[] = [],
      unexpected: string[] = [],
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/v1/**", (route) => {
      const request = route.request(),
        p = new URL(request.url()).pathname.replace("/api/v1", "");
      const reply = (data: unknown) => route.fulfill({ json: { data } });
      if (
        request.method() !== "GET" &&
        !["/auth/realtime-token", "/realtime/token"].includes(p)
      ) {
        writes.push(request.method() + " " + p);
        return route.fulfill({
          status: 403,
          json: { error: { code: "FORBIDDEN", message: "Read-only review" } },
        });
      }
      if (p === "/admin/whiteboards")
        return reply({ items: [board], total: 1, pageSize: 30 });
      if (p === "/admin/whiteboards/capabilities")
        return reply({ globalCreate: true, teams: [] });
      if (p === "/admin/whiteboards/" + id)
        return reply({
          record: { ...board, document },
          actions: ["read", "update", "export", "manage", "delete", "restore"],
        });
      if (p === "/admin/whiteboards/" + id + "/collaborators")
        return reply({
          items: [
            {
              user_id: "fbbf0000-0000-4000-8000-000000000002",
              role: "viewer",
              user: {
                display_name: "Fictional workshop reviewer",
                email: "fictional-board-reader@example.test",
              },
            },
          ],
          total: 1,
        });
      if (p.startsWith("/admin/whiteboards")) {
        unexpected.push(p);
        return route.fulfill({
          status: 404,
          json: { error: { code: "NOT_FOUND" } },
        });
      }
      return route.fallback();
    });
    await page.goto("/admin/whiteboard");
    await page
      .getByRole("button", { name: "Open board " + board.name })
      .click();
    await expect(
      page.getByRole("region", { name: "Open board", exact: true }),
    ).toBeVisible();
    await expect(
      page.locator(".gt-board-canvas .excalidraw canvas").first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Save now", exact: true }),
    ).toBeDisabled();
    const drawing = page.locator(".gt-board-canvas");
    const menu = drawing.getByRole("button", {
      name: "Drawing menu",
      exact: true,
    });
    await expect(menu).toBeVisible();
    // The editor's mobile toolbar has no desktop zoom bar. Audit its full UI
    // below, and exercise the visible zoom/reset controls at desktop sizes.
    if (!info.project.name.includes("mobile")) {
      const reset = drawing.locator(".reset-zoom-button");
      await expect(reset).toHaveAccessibleName("100% · Reset zoom");
      await drawing
        .getByRole("button", { name: "Zoom out", exact: true })
        .click();
      await expect(reset).not.toHaveText("100%");
      await expect(reset).toHaveAccessibleName(/\d+% · Reset zoom/);
      await reset.click();
      await expect(reset).toHaveText("100%");
      await expect(reset).toHaveAccessibleName("100% · Reset zoom");
    }
    if (state === "whiteboard collaborators") {
      await page
        .getByRole("button", { name: "Board access", exact: true })
        .click();
      await expect(
        page.getByRole("region", { name: "Explicit board collaborators" }),
      ).toContainText("fictional-board-reader@example.test");
    }
    await capture(page, info, state);
    expect(writes).toEqual([]);
    expect(unexpected).toEqual([]);
    expect(errors).toEqual([]);
    expect(fixture.unexpected).toEqual([]);
    expect(fixture.writes).toEqual([]);
  });
