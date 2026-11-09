// @vitest-environment jsdom
import React from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import ScannerEntry from "../../src/ui/rewards/ScannerEntry";
const { admin } = vi.hoisted(() => ({
  admin: {
    isLoading: false,
    isAuthenticated: false,
    isSuperAdmin: false,
    error: null,
    login: vi.fn(),
    logout: vi.fn(),
  },
}));
vi.mock("@/contexts/AdminContext", () => ({ useAdmin: () => admin }));
const gate = vi.fn();
function mount() {
  return render(
    <MemoryRouter initialEntries={["/admin/scanner"]}>
      <Routes>
        <Route path="/admin/scanner" element={<ScannerEntry />} />
        <Route path="/admin/rewards" element={<h1>Check-in workspace</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}
beforeEach(() => {
  admin.isLoading = false;
  admin.isAuthenticated = false;
  admin.isSuperAdmin = false;
  admin.error = null;
  admin.login.mockReset().mockResolvedValue(false);
  admin.logout.mockReset().mockResolvedValue(true);
  gate.mockReset();
  vi.stubGlobal("fetch", gate);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("Scanner first-launch access", () => {
  it("requires the existing server gate before credentials can be entered", async () => {
    gate.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { gateValid: true } }),
    });
    mount();
    expect(screen.queryByRole("textbox", { name: "Email" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Access code"), {
      target: { value: "fictional-entry-code" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    const email = await screen.findByRole("textbox", { name: "Email" });
    expect(document.activeElement).toBe(email);
    expect(gate).toHaveBeenCalledWith(
      "/api/v1/auth/gate",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: JSON.stringify({ code: "fictional-entry-code" }),
      }),
    );
    fireEvent.change(email, { target: { value: "officer@example.test" } });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "fictional-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() =>
      expect(admin.login).toHaveBeenCalledWith({
        username: "officer@example.test",
        password: "fictional-password",
      }),
    );
    expect(screen.getByLabelText("Password")).toHaveProperty("value", "");
    fireEvent.click(
      screen.getByRole("button", { name: "Use another access code" }),
    );
    expect(screen.getByLabelText("Access code")).toHaveProperty("value", "");
  });
  it("does not proceed when the code is rejected or the network fails", async () => {
    gate.mockResolvedValue({ ok: false });
    mount();
    fireEvent.change(screen.getByLabelText("Access code"), {
      target: { value: "incorrect" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByRole("alert");
    expect(screen.queryByLabelText("Password")).toBeNull();
    expect(admin.login).not.toHaveBeenCalled();
    gate.mockRejectedValue(new Error("Offline"));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText("Offline");
  });
  it("sends a restored Super Admin straight to check-in and rejects a regular admin", async () => {
    admin.isAuthenticated = true;
    admin.isSuperAdmin = true;
    const view = mount();
    await screen.findByRole("heading", { name: "Check-in workspace" });
    expect(gate).not.toHaveBeenCalled();
    view.unmount();
    admin.isSuperAdmin = false;
    mount();
    expect(
      screen.getByText("This account cannot use the scanner."),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(admin.logout).toHaveBeenCalled());
  });
  it("does not show credentials while a session is restoring", () => {
    admin.isLoading = true;
    mount();
    expect(screen.getByRole("status").textContent).toContain(
      "Loading your account",
    );
    expect(screen.queryByLabelText("Access code")).toBeNull();
  });
  it("aborts the outstanding gate request when leaving", () => {
    gate.mockReturnValue(new Promise(() => {}));
    const view = mount();
    fireEvent.change(screen.getByLabelText("Access code"), {
      target: { value: "example" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    const signal = gate.mock.calls[0][1].signal;
    view.unmount();
    expect(signal.aborted).toBe(true);
  });
});
