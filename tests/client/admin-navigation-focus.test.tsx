// @vitest-environment jsdom
import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import AdminShell from "../../src/ui/AdminShell";
import RouteFocus from "../../src/ui/RouteFocus";
const { actor, pages } = vi.hoisted(() => ({
  actor: {
    id: "fictional-navigation-actor",
    role: "super_admin",
    display_name: "Fictional reviewer",
  },
  pages: vi.fn(),
}));
vi.mock("@/contexts/AdminContext", () => ({
  useAdmin: () => ({
    currentAdmin: actor,
    isAuthenticated: true,
    logout: vi.fn(),
  }),
}));
vi.mock("@/services/permissionsService", () => ({
  PermissionsService: { getAccessiblePages: pages },
}));
vi.mock("@/components/admin/NotificationBell", () => ({ default: () => null }));
vi.mock("@/hooks/useDraftGuard", () => ({
  useNavigationSafety: () => ({ request: (run: () => void) => run() }),
}));
const routers: ReturnType<typeof createMemoryRouter>[] = [];
beforeEach(() => {
  pages.mockResolvedValue(["/admin", "/admin/forms", "/admin/profile"]);
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  for (const router of routers.splice(0)) router.dispose();
  vi.restoreAllMocks();
});
function mount() {
  const router = createMemoryRouter(
    [
      {
        path: "*",
        element: (
          <>
            <RouteFocus />
            <AdminShell>
              <h1>Fictional workspace page</h1>
              <input aria-label="Fictional local field" />
            </AdminShell>
          </>
        ),
      },
    ],
    { initialEntries: ["/admin"] },
  );
  routers.push(router);
  render(<RouterProvider router={router} />);
  return router;
}
async function open() {
  const opener = screen.getByRole("button", {
    name: "Open workspace navigation",
  });
  // A pointer event need not focus the button on a mobile engine. Return focus
  // must be explicitly tied to the invoker rather than the previous DOM focus.
  fireEvent.click(opener);
  const dialog = await screen.findByRole("dialog", {
    name: "Workspace navigation",
  });
  await within(dialog).findByRole("link", { name: "My profile", exact: true });
  return { opener, dialog };
}
describe("workspace drawer focus return and accepted route focus", () => {
  it("returns to the pointer-invoked opener on Escape", async () => {
    mount();
    const { opener, dialog } = await open();
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });
  it("returns to the opener after the explicit Close action", async () => {
    mount();
    const { opener, dialog } = await open();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Close", exact: true }),
    );
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });
  it("repeated pointer reopening dismisses Escape even when its focused child consumes bubbling", async () => {
    mount();
    for (let attempt = 0; attempt < 3; attempt++) {
      const { opener, dialog } = await open();
      const link = within(dialog).getByRole("link", {
        name: "Dashboard",
        exact: true,
      });
      link.focus();
      link.addEventListener("keydown", (event) => event.stopPropagation(), {
        once: true,
      });
      fireEvent.keyDown(link, { key: "Escape" });
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      await waitFor(() => expect(document.activeElement).toBe(opener));
    }
  });
  it("keeps the reopened drawer during Escape composition and dismisses it after composition ends", async () => {
    mount();
    const { opener, dialog } = await open();
    fireEvent.keyDown(dialog, { key: "Escape", isComposing: true });
    expect(screen.getByRole("dialog", { name: "Workspace navigation" })).toBe(
      dialog,
    );
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });
  it("preserves destination content focus after choosing a different workspace route", async () => {
    const router = mount();
    const { opener, dialog } = await open();
    fireEvent.click(
      within(dialog).getByRole("link", { name: "Forms", exact: true }),
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/admin/forms"),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() =>
      expect(document.activeElement?.id).toBe("workspace-content"),
    );
    expect(document.activeElement).not.toBe(opener);
  });
  it("focuses the current page after choosing its own drawer destination", async () => {
    mount();
    const { dialog } = await open();
    fireEvent.click(
      within(dialog).getByRole("link", { name: "Dashboard", exact: true }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() =>
      expect(document.activeElement?.id).toBe("workspace-content"),
    );
  });
  it("returns to the explicit search opener after Escape", async () => {
    mount();
    const opener = screen.getByRole("button", { name: "Search the workspace · ⌘ K" });
    fireEvent.click(opener);
    const dialog = await screen.findByRole("dialog", {
      name: "Go to a workspace",
    });
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });
  it("returns to the existing field after shortcut-invoked search is dismissed", async () => {
    mount();
    const field = screen.getByLabelText("Fictional local field");
    field.focus();
    fireEvent.keyDown(document, { key: "k", metaKey: true });
    const dialog = await screen.findByRole("dialog", {
      name: "Go to a workspace",
    });
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(document.activeElement).toBe(field));
  });
  it("does not dismiss search when Escape belongs to an active text composition", async () => {
    mount();
    fireEvent.click(
      screen.getByRole("button", { name: "Search the workspace · ⌘ K" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Go to a workspace",
    });
    const input = within(dialog).getByRole("searchbox", {
      name: "Search workspace destinations",
    });
    fireEvent.keyDown(input, { key: "Escape", isComposing: true });
    expect(screen.getByRole("dialog", { name: "Go to a workspace" })).toBe(
      dialog,
    );
    fireEvent.keyDown(input, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
  for (const [label, path] of [
    ["Dashboard", "/admin"],
    ["Forms", "/admin/forms"],
  ])
    it(`keeps workspace content focus after selecting ${label} in search`, async () => {
      const router = mount();
      fireEvent.click(
        screen.getByRole("button", { name: "Search the workspace · ⌘ K" }),
      );
      const dialog = await screen.findByRole("dialog", {
        name: "Go to a workspace",
      });
      fireEvent.click(
        await within(dialog).findByRole("link", { name: label, exact: true }),
      );
      await waitFor(() => expect(router.state.location.pathname).toBe(path));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      await waitFor(() =>
        expect(document.activeElement?.id).toBe("workspace-content"),
      );
    });
});
