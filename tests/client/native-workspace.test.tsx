// @vitest-environment jsdom
import React from "react";
import { render, cleanup, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import AdminShell from "../../src/ui/AdminShell";
const { pages, logout, request } = vi.hoisted(() => ({
  pages: vi.fn(),
  logout: vi.fn(),
  request: vi.fn((run: () => void) => run()),
}));
vi.mock("@/contexts/AdminContext", () => ({
  useAdmin: () => ({
    isAuthenticated: true,
    currentAdmin: {
      id: "test-officer",
      role: "admin",
      display_name: "Officer",
    },
    logout,
  }),
}));
vi.mock("@/services/permissionsService", () => ({
  PermissionsService: { getAccessiblePages: pages },
}));
vi.mock("@/hooks/useDraftGuard", () => ({
  useNavigationSafety: () => ({ request }),
}));
vi.mock("@/components/admin/NotificationBell", () => ({ default: () => null }));
const post = vi.fn();
let router: ReturnType<typeof createMemoryRouter>;
beforeEach(() => {
  vi.stubGlobal("gdgScanner", { version: 1, wallet: false, admin: true });
  vi.stubGlobal("webkit", {
    messageHandlers: {
      gdgScanner: { postMessage: vi.fn() },
      gdgAdmin: { postMessage: post },
    },
  });
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  pages.mockResolvedValue(["/admin", "/admin/forms", "/admin/profile"]);
  logout.mockResolvedValue(true);
  post.mockReset();
  request.mockClear();
  router = createMemoryRouter(
    [
      {
        path: "*",
        element: (
          <AdminShell>
            <h1>Workspace page</h1>
          </AdminShell>
        ),
      },
    ],
    { initialEntries: ["/admin"] },
  );
});
afterEach(() => {
  cleanup();
  router.dispose();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("Native full workspace chrome", () => {
  it("publishes only permitted destinations and routes native tabs through the web router", async () => {
    const view = render(<RouterProvider router={router} />);
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "state",
          path: "/admin",
          destinations: [
            { path: "/admin", title: "Dashboard" },
            { path: "/admin/forms", title: "Forms" },
            { path: "/admin/profile", title: "My profile" },
          ],
        }),
      ),
    );
    expect(view.container.querySelector(".gt-sidebar")).toBeNull();
    window.dispatchEvent(
      new CustomEvent("gdg:native-navigation", { detail: "/admin/finances" }),
    );
    expect(router.state.location.pathname).toBe("/admin");
    window.dispatchEvent(
      new CustomEvent("gdg:native-navigation", { detail: "/admin/forms" }),
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/admin/forms"),
    );
  });
  it("uses the draft safeguard for sign-out and then asks native code to forget the account", async () => {
    render(<RouterProvider router={router} />);
    await waitFor(() => expect(post).toHaveBeenCalled());
    window.dispatchEvent(
      new CustomEvent("gdg:native-navigation", { detail: "signOut" }),
    );
    await waitFor(() => expect(logout).toHaveBeenCalled());
    expect(request).toHaveBeenCalled();
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith({ action: "signedOut" }),
    );
  });
  it("locks the native app if the server session ends", async () => {
    render(<RouterProvider router={router} />);
    await waitFor(() => expect(post).toHaveBeenCalled());
    window.dispatchEvent(new Event("gdg:session-cleared"));
    expect(post).toHaveBeenCalledWith({ action: "authRequired" });
  });
});
