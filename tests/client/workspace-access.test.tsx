// @vitest-environment jsdom
import React from "react";
import {
  cleanup,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import PageAccessGuard from "../../src/components/admin/PageAccessGuard";
import {
  WorkspaceAccessContext,
  type WorkspaceAccessSnapshot,
} from "../../src/contexts/WorkspaceAccessContext";
import type { AdminUser } from "../../src/lib/chapter-types";
const state = vi.hoisted(() => ({
  actor: {
    id: "fictional-access-actor",
    email: "actor@example.test",
    role: "admin",
    is_active: true,
    created_at: "2026-01-01",
  },
  check: vi.fn(),
}));
vi.mock("@/contexts/AdminContext", () => ({
  useAdmin: () => ({
    currentAdmin: state.actor,
    isAuthenticated: true,
    isLoading: false,
  }),
}));
vi.mock("@/services/permissionsService", () => ({
  PermissionsService: { canAccessPage: state.check },
}));
const retry = vi.fn();
function view(
  snapshot?: WorkspaceAccessSnapshot,
  failed = false,
  path = "/admin/forms",
) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <WorkspaceAccessContext.Provider value={{ snapshot, failed, retry }}>
        <PageAccessGuard>
          <h1>Authorized destination</h1>
          <input aria-label="Unsent draft" defaultValue="Keep this draft" />
        </PageAccessGuard>
      </WorkspaceAccessContext.Provider>
    </MemoryRouter>
  );
}
function known(routes = ["/admin", "/admin/forms"]): WorkspaceAccessSnapshot {
  return { actor: state.actor as AdminUser, routes };
}
beforeEach(() => {
  state.check.mockReset().mockResolvedValue(true);
  retry.mockReset();
});
afterEach(cleanup);
describe("workspace route inventory reuse", () => {
  it("renders an already authorized destination immediately without a second page check", () => {
    render(view(known()));
    expect(
      screen.getByRole("heading", { name: "Authorized destination" }),
    ).toBeTruthy();
    expect(screen.queryByText("Checking access…")).toBeNull();
    expect(state.check).not.toHaveBeenCalled();
  });
  it("waits for the initial inventory rather than assuming access", () => {
    render(view());
    expect(screen.getByText("Checking access…")).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "Authorized destination" }),
    ).toBeNull();
  });
  it("removes a destination when a successful refreshed inventory revokes its route", () => {
    const mounted = render(view(known()));
    mounted.rerender(view(known(["/admin"])));
    expect(
      screen.queryByRole("heading", { name: "Authorized destination" }),
    ).toBeNull();
    expect(screen.getByText("This workspace is restricted")).toBeTruthy();
  });
  it("does not reuse another actor or prior actor object even with the same account id", () => {
    render(view({ ...known(), actor: { ...state.actor } as AdminUser }));
    expect(screen.getByText("Checking access…")).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "Authorized destination" }),
    ).toBeNull();
  });
  it("offers retry when the initial inventory fails", () => {
    render(view(undefined, true));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
  it("preserves a mounted draft if background revalidation has a transport failure", () => {
    const snapshot = known();
    const mounted = render(view(snapshot));
    const draft = screen.getByRole("textbox", {
      name: "Unsent draft",
    }) as HTMLInputElement;
    fireEvent.change(draft, { target: { value: "New unsaved text" } });
    mounted.rerender(view(snapshot, true));
    expect(screen.getByRole("textbox", { name: "Unsent draft" })).toBe(draft);
    expect(draft.value).toBe("New unsaved text");
  });
  it("keeps record-specific permission checks even if the form library is available", async () => {
    state.check.mockResolvedValue(false);
    const path = "/admin/forms/fictional-record/edit";
    render(view(known(), false, path));
    await waitFor(() =>
      expect(state.check).toHaveBeenCalledWith(
        state.actor,
        path,
        expect.any(AbortSignal),
      ),
    );
    await screen.findByText("This workspace is restricted");
    expect(
      screen.queryByRole("heading", { name: "Authorized destination" }),
    ).toBeNull();
  });
});
