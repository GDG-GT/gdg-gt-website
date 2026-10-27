// @vitest-environment jsdom
import React from "react";
import axe from "axe-core";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import SiteStatusWorkspace from "../../src/ui/status/SiteStatusWorkspace";
import { ApiFailure } from "../../src/lib/api";
const { apiMock, actor } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  actor: { id: "f1620000-0000-4000-8000-000000000001", role: "admin" },
}));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: apiMock,
}));
vi.mock("@/contexts/AdminContext", () => ({
  useAdmin: () => ({ currentAdmin: actor }),
}));
vi.mock("@/hooks/useDraftGuard", () => ({
  useDraftGuard: vi.fn(),
  useNavigationSafety: () => ({
    request: (run: () => void) => run(),
    allow: (run: () => void) => run(),
  }),
}));
const state = {
  revision: 1,
  is_live: true,
  message: "Fictional maintenance notice",
  redirect_url: "",
  button_text: "Chapter updates",
  auto_redirect: false,
  updatedAt: "2026-10-27T12:00:00Z",
  canUpdate: true,
};
function deferred<T>() {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
function mount() {
  return render(
    <MemoryRouter>
      <main id="workspace-content" tabIndex={-1}>
        <SiteStatusWorkspace />
      </main>
    </MemoryRouter>,
  );
}
const writes = () =>
  apiMock.mock.calls.filter(([, o]) => o?.method === "PATCH");
async function edit() {
  fireEvent.click(
    await screen.findByRole("button", { name: "Configure availability" }),
  );
  return screen.getByLabelText(/Maintenance message/);
}
function proof(mode = "LIVE") {
  fireEvent.change(screen.getByLabelText("Type " + mode, { exact: false }), {
    target: { value: mode },
  });
  fireEvent.change(screen.getByLabelText(/Current password/), {
    target: { value: "Fictional-status-proof" },
  });
}
beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockImplementation((_p: string, o?: { method?: string }) =>
    Promise.resolve(o?.method === "PATCH" ? { ...state, revision: 2 } : state),
  );
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("Site availability recovery and private context", () => {
  it("shows a skeleton and aborts the initial private read", () => {
    const pending = deferred<unknown>();
    apiMock.mockReturnValue(pending.promise);
    const page = mount();
    expect(
      screen
        .getByRole("status", { name: "Loading site availability" })
        .querySelector(".gt-skeleton"),
    ).toBeTruthy();
    const signal = apiMock.mock.calls[0][1].signal;
    page.unmount();
    expect(signal.aborted).toBe(true);
  });
  it("shows a retryable initial error instead of indefinite loading", async () => {
    let failed = true;
    apiMock.mockImplementation(() =>
      failed
        ? Promise.reject(Error("Status interrupted"))
        : Promise.resolve(state),
    );
    mount();
    await screen.findByText(/Availability is unavailable/);
    failed = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry availability" }));
    expect(document.activeElement?.id).toBe("workspace-content");
    await screen.findByRole("button", { name: "Configure availability" });
  });
  it("retains the last status and draft on temporary refresh failure", async () => {
    let failed = false;
    apiMock.mockImplementation(() =>
      failed
        ? Promise.reject(Error("Status interrupted"))
        : Promise.resolve(state),
    );
    mount();
    const input = await edit();
    fireEvent.change(input, {
      target: { value: "Fictional retained status draft" },
    });
    failed = true;
    fireEvent.click(screen.getByRole("button", { name: "Refresh status" }));
    await screen.findByText(/Availability may be out of date/);
    expect(screen.getByRole("heading", {name:"Current state Live"})).toBeTruthy();
    expect((input as HTMLTextAreaElement).value).toBe(
      "Fictional retained status draft",
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Save site availability",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
  it("preserves unsaved input and blocks an obsolete revision", async () => {
    let revision = 1;
    apiMock.mockImplementation(() => Promise.resolve({ ...state, revision }));
    mount();
    const input = await edit();
    fireEvent.change(input, {
      target: { value: "Fictional retained status draft" },
    });
    proof();
    revision = 2;
    fireEvent.click(screen.getByRole("button", { name: "Refresh status" }));
    await screen.findByText(/The state or your permission changed/);
    expect((input as HTMLTextAreaElement).value).toBe(
      "Fictional retained status draft",
    );
    fireEvent.submit(input.closest("form")!);
    expect(writes()).toHaveLength(0);
  });
  it("honors a revoked update grant at an unchanged revision", async () => {
    let allowed = true;
    apiMock.mockImplementation(() =>
      Promise.resolve({ ...state, canUpdate: allowed }),
    );
    mount();
    await edit();
    proof();
    allowed = false;
    fireEvent.click(screen.getByRole("button", { name: "Refresh status" }));
    await screen.findByText(/The state or your permission changed/);
    fireEvent.submit(
      screen.getByLabelText(/Current password/).closest("form")!,
    );
    expect(writes()).toHaveLength(0);
  });
  it("erases private draft and password after read access is denied", async () => {
    mount();
    await edit();
    proof();
    apiMock.mockRejectedValue(
      new ApiFailure(403, "FORBIDDEN", "Status access revoked"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Refresh status" }));
    await screen.findByText(/Site availability: Status access revoked/);
    expect(screen.queryByLabelText(/Maintenance message/)).toBeNull();
    expect(screen.queryByLabelText(/Current password/)).toBeNull();
  });
  it("does not carry an editor across account role changes", async () => {
    const page = mount();
    await edit();
    const originalRole = actor.role;
    actor.role = "team_member";
    page.rerender(
      <MemoryRouter>
        <main>
          <SiteStatusWorkspace />
        </main>
      </MemoryRouter>,
    );
    expect(screen.queryByLabelText(/Maintenance message/)).toBeNull();
    actor.role = originalRole;
  });
});
describe("Site availability exact confirmation and writes", () => {
  it("rejects a confirmation for the other mode in the submit handler", async () => {
    mount();
    await edit();
    proof("LIVE");
    fireEvent.change(screen.getByLabelText("Public site mode"), {
      target: { value: "maintenance" },
    });
    fireEvent.submit(
      screen.getByLabelText(/Current password/).closest("form")!,
    );
    await screen.findByRole("alert");
    expect(writes()).toHaveLength(0);
  });
  it("rejects unsafe destinations without a request", async () => {
    mount();
    await edit();
    proof();
    fireEvent.change(screen.getByLabelText(/Safe updates destination/), {
      target: { value: "https://unapproved.example.test/" },
    });
    fireEvent.submit(
      screen.getByLabelText(/Current password/).closest("form")!,
    );
    await screen.findByRole("alert");
    expect(writes()).toHaveLength(0);
  });
  it("freezes controls and suppresses duplicate same-tick writes", async () => {
    const pending = deferred<unknown>();
    apiMock.mockImplementation((_p: string, o?: { method?: string }) =>
      o?.method === "PATCH" ? pending.promise : Promise.resolve(state),
    );
    mount();
    const input = await edit();
    proof();
    const form = input.closest("form")!;
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    expect(writes()).toHaveLength(1);
    expect(
      (screen.getByLabelText(/Current password/) as HTMLInputElement).value,
    ).toBe("");
    expect(input.closest("fieldset")?.disabled).toBe(true);
    await act(async () => pending.resolve({ ...state, revision: 2 }));
    await screen.findByText("Site-wide availability saved.");
    expect(document.activeElement?.textContent).toBe(
      "Site-wide availability saved.",
    );
  });
  it("keeps retry identity across password reentry after uncertain failure", async () => {
    apiMock.mockImplementation((_p: string, o?: { method?: string }) =>
      o?.method === "PATCH"
        ? Promise.reject(Error("Status save not confirmed"))
        : Promise.resolve(state),
    );
    mount();
    const form = (await edit()).closest("form")!;
    proof();
    fireEvent.submit(form);
    await screen.findByText("Status save not confirmed");
    expect(document.activeElement?.textContent).toBe(
      "Status save not confirmed",
    );
    proof();
    fireEvent.submit(form);
    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(writes()[0][1].idempotencyKey).toBe(writes()[1][1].idempotencyKey);
  });
  it("changes the retry key when the intended settings change", async () => {
    apiMock.mockImplementation((_p: string, o?: { method?: string }) =>
      o?.method === "PATCH"
        ? Promise.reject(Error("Status save not confirmed"))
        : Promise.resolve(state),
    );
    mount();
    const input = await edit(),
      form = input.closest("form")!;
    proof();
    fireEvent.submit(form);
    await screen.findByText("Status save not confirmed");
    fireEvent.change(input, {
      target: { value: "A different fictional notice" },
    });
    proof();
    fireEvent.submit(form);
    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(writes()[0][1].idempotencyKey).not.toBe(
      writes()[1][1].idempotencyKey,
    );
  });
  it("aborts a pending mutation after session clearing and ignores late success", async () => {
    const pending = deferred<unknown>();
    apiMock.mockImplementation((_p: string, o?: { method?: string }) =>
      o?.method === "PATCH" ? pending.promise : Promise.resolve(state),
    );
    mount();
    const form = (await edit()).closest("form")!;
    proof();
    fireEvent.submit(form);
    const signal = writes()[0][1].signal;
    act(() => window.dispatchEvent(new Event("gdg:session-cleared")));
    expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve({ ...state, revision: 2 }));
    expect(screen.queryByText("Site-wide availability saved.")).toBeNull();
    expect(screen.queryByLabelText(/Current password/)).toBeNull();
  });
  it("preserves the draft and blocks retry after a server conflict", async () => {
    apiMock.mockImplementation((_p: string, o?: { method?: string }) =>
      o?.method === "PATCH"
        ? Promise.reject(new ApiFailure(409, "CONFLICT", "Status changed"))
        : Promise.resolve(state),
    );
    mount();
    await edit();
    proof();
    fireEvent.submit(
      screen.getByLabelText(/Current password/).closest("form")!,
    );
    await screen.findByText(/The state or your permission changed/);
    proof();
    fireEvent.submit(
      screen.getByLabelText(/Current password/).closest("form")!,
    );
    expect(writes()).toHaveLength(1);
  });
  it("never applies an offline draft automatically after reconnect", async () => {
    const online = vi.spyOn(navigator, "onLine", "get");
    online.mockReturnValue(true);
    mount();
    const input = await edit();
    proof();
    online.mockReturnValue(false);
    act(() => window.dispatchEvent(new Event("offline")));
    fireEvent.submit(input.closest("form")!);
    online.mockReturnValue(true);
    act(() => window.dispatchEvent(new Event("online")));
    expect(writes()).toHaveLength(0);
    expect(screen.getByLabelText(/Maintenance message/)).toBeTruthy();
  });
  it("closes the editor and clears its password and draft", async () => {
    mount();
    await edit();
    proof();
    fireEvent.click(screen.getByRole("button", { name: "Close editor" }));
    expect(screen.queryByLabelText(/Maintenance message/)).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Configure availability" }),
    );
    expect(
      (screen.getByLabelText(/Current password/) as HTMLInputElement).value,
    ).toBe("");
  });
  it("passes structural axe checks for current state and configuration", async () => {
    const page = mount();
    await screen.findByRole("button", { name: "Configure availability" });
    const audit = async () => {
      const result = await axe.run(page.container, {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"],
        },
        rules: { "color-contrast": { enabled: false } },
      });
      expect(
        result.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => n.target),
        })),
      ).toEqual([]);
    };
    await audit();
    await edit();
    await audit();
  });
});
