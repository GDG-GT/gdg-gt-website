// @vitest-environment jsdom
import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import ProfileWorkspace from "../../src/ui/ProfileWorkspace";
import { ApiFailure } from "../../src/lib/api";
const { apiMock, refresh, identity, guard } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  refresh: vi.fn(),
  identity: {
    id: "fictional-profile",
    role: "admin",
    display_name: "Fictional officer",
    email: "fictional-officer@example.test",
  },
  guard: vi.fn(),
}));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: apiMock,
}));
vi.mock("@/contexts/AdminContext", () => ({
  useAdmin: () => ({
    currentAdmin: identity,
    mergedProfile: null,
    refreshProfile: refresh,
  }),
}));
vi.mock("@/hooks/useDraftGuard", () => ({ useDraftGuard: guard }));
const current = {
    id: "fictional-current",
    current: true,
    created_at: "2026-11-05T01:00:00Z",
    last_seen_at: "2026-11-05T01:00:00Z",
    absolute_expires_at: "2026-11-12T01:00:00Z",
  },
  other = { ...current, id: "fictional-other", current: false };
let sessions = [current, other];
function read(path: string) {
  if (path === "/admin/me/sessions") return { items: sessions };
  if (path === "/admin/me/activity") return { items: [] };
  return { user: { ...identity }, profile: null };
}
function pending() {
  let resolve!: (value: unknown) => void, reject!: (error: Error) => void;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
function mount() {
  return render(
    <main id="workspace-content" tabIndex={-1}>
      <ProfileWorkspace />
    </main>,
  );
}
const writes = () =>
  apiMock.mock.calls.filter(([, options]) => options?.method);
const account = () => screen.getByLabelText(/^Display name/);
const submitAccount = () => fireEvent.submit(account().closest("form")!);
function passwords() {
  for (const [name, value] of [
    ["currentPassword", "Fictional-current-password"],
    ["newPassword", "Fictional-next-password"],
    ["confirmPassword", "Fictional-next-password"],
  ])
    fireEvent.change(document.querySelector(`input[name="${name}"]`)!, {
      target: { value },
    });
  return document
    .querySelector("input[name=currentPassword]")!
    .closest("form")!;
}
async function review() {
  const opener = screen.getByRole("button", {
    name: "Sign out other sessions",
    exact: true,
  });
  await waitFor(() =>
    expect((opener as HTMLButtonElement).disabled).toBe(false),
  );
  fireEvent.click(opener);
  const dialog = await screen.findByRole("dialog"),
    confirm = within(dialog).getByRole("button", {
      name: "Confirm other-session sign-out",
    });
  await waitFor(() =>
    expect((confirm as HTMLButtonElement).disabled).toBe(false),
  );
  return { dialog, confirm };
}
beforeEach(() => {
  apiMock.mockReset();
  refresh.mockReset().mockResolvedValue(undefined);
  guard.mockReset();
  identity.id = "fictional-profile";
  identity.role = "admin";
  identity.display_name = "Fictional officer";
  sessions = [current, other];
  apiMock.mockImplementation((path, options) =>
    Promise.resolve(options?.method ? { updated: true } : read(path)),
  );
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: true,
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("Own-profile mutation, security review and interruption recovery", () => {
  it("freezes all profile/password inputs and blocks duplicate saves while the exact snapshot is pending", async () => {
    const write = pending();
    apiMock.mockImplementation((path, options) =>
      options?.method ? write.promise : Promise.resolve(read(path)),
    );
    mount();
    fireEvent.change(account(), {
      target: { value: "Fictional edited officer" },
    });
    const form = account().closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(writes()).toHaveLength(1);
    expect(writes()[0][1]).toMatchObject({
      body: { display_name: "Fictional edited officer" },
      signal: expect.any(AbortSignal),
    });
    for (const input of document.querySelectorAll("input,textarea"))
      expect(input.matches(":disabled")).toBe(true);
    expect(screen.queryByText("Your display name is saved.")).toBeNull();
    await act(async () => write.resolve({ updated: true }));
    await screen.findByText("Your display name is saved.");
    expect(document.activeElement?.getAttribute("role")).toBe("status");
    expect(refresh).toHaveBeenCalledTimes(1);
  });
  it("sends public profile fields through the scoped cancellable transport and refreshes account state only after acceptance", async () => {
    mount();
    fireEvent.change(screen.getByLabelText(/^Full name/), {
      target: { value: "Fictional public member" },
    });
    fireEvent.change(screen.getByLabelText(/^Chapter role/), {
      target: { value: "Fictional builder" },
    });
    fireEvent.change(screen.getByLabelText(/^Portfolio \/ website/), {
      target: { value: "https://portfolio.example.test/" },
    });
    fireEvent.submit(screen.getByLabelText(/^Full name/).closest("form")!);
    await screen.findByText(/Profile saved. New profiles remain unpublished/);
    expect(writes()).toHaveLength(1);
    expect(writes()[0][1].body.profile).toMatchObject({
      name: "Fictional public member",
      role: "Fictional builder",
      portfolioUrl: "https://portfolio.example.test/",
    });
    expect(writes()[0][1].signal).toBeInstanceOf(AbortSignal);
  });
  it("distinguishes an accepted save from a failed refresh and retries only reads", async () => {
    refresh
      .mockRejectedValueOnce(Error("Fictional refresh outage"))
      .mockResolvedValue(undefined);
    mount();
    fireEvent.change(account(), {
      target: { value: "Fictional committed name" },
    });
    submitAccount();
    await screen.findByText(
      /change was saved, but your account information could not refresh/,
    );
    expect(screen.getByText("Your display name is saved.")).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Save account details",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Recheck account information" }),
    );
    await screen.findByText(/Current account information was refreshed/);
    expect(writes()).toHaveLength(1);
    expect(screen.getByText("Current saved account values")).toBeTruthy();
    expect(screen.getByText("Saved display name")).toBeTruthy();
    expect(apiMock).toHaveBeenCalledWith("/admin/me", {
      signal: expect.any(AbortSignal),
    });
  });
  it("keeps an uncertain save unsent until explicit account read recovery, preserving non-password input", async () => {
    apiMock.mockImplementation((path, options) =>
      options?.method
        ? Promise.reject(Error("Fictional dropped response"))
        : Promise.resolve(read(path)),
    );
    mount();
    fireEvent.change(account(), {
      target: { value: "Fictional uncertain name" },
    });
    submitAccount();
    await screen.findByText(/result could not be confirmed/);
    expect((account() as HTMLInputElement).value).toBe(
      "Fictional uncertain name",
    );
    submitAccount();
    expect(writes()).toHaveLength(1);
    fireEvent.click(
      screen.getByRole("button", { name: "Recheck account information" }),
    );
    await screen.findByText(/Current account information was refreshed/);
    expect(writes()).toHaveLength(1);
  });
  it("retains the pause if account recheck fails", async () => {
    let failRead = false;
    apiMock.mockImplementation((path, options) =>
      options?.method
        ? Promise.reject(Error("Fictional uncertain write"))
        : failRead && path === "/admin/me"
          ? Promise.reject(Error("Fictional recovery read outage"))
          : Promise.resolve(read(path)),
    );
    mount();
    submitAccount();
    await screen.findByText(/result could not be confirmed/);
    failRead = true;
    fireEvent.click(
      screen.getByRole("button", { name: "Recheck account information" }),
    );
    await screen.findByText("Fictional recovery read outage");
    expect(
      (
        screen.getByRole("button", {
          name: "Save account details",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(writes()).toHaveLength(1);
  });
  it("clears denied private state and rehydrates only current account fields after explicit recovery", async () => {
    apiMock.mockImplementation((path, options) =>
      options?.method
        ? Promise.reject(
            new ApiFailure(403, "FORBIDDEN", "Fictional access changed"),
          )
        : Promise.resolve(read(path)),
    );
    mount();
    fireEvent.change(account(), {
      target: { value: "Private obsolete draft" },
    });
    submitAccount();
    await screen.findByText("Account access needs to be rechecked");
    expect(screen.queryByDisplayValue("Private obsolete draft")).toBeNull();
    identity.display_name = "Fictional current identity";
    fireEvent.click(
      screen.getByRole("button", { name: "Recheck account access" }),
    );
    await screen.findByRole("heading", { name: "My profile" });
    expect((account() as HTMLInputElement).value).toBe(
      "Fictional current identity",
    );
    expect(writes()).toHaveLength(1);
  });
  it.each(["account", "role", "session"])(
    "cancels an obsolete write and ignores late receipt after %s replacement",
    async (change) => {
      const write = pending();
      apiMock.mockImplementation((path, options) =>
        options?.method ? write.promise : Promise.resolve(read(path)),
      );
      const view = mount();
      fireEvent.change(account(), { target: { value: "Fictional old draft" } });
      submitAccount();
      const signal = writes()[0][1].signal;
      if (change === "session")
        act(() => window.dispatchEvent(new Event("gdg:session-cleared")));
      else {
        if (change === "account") identity.id = "fictional-next-account";
        else identity.role = "team_member";
        view.rerender(
          <main id="workspace-content" tabIndex={-1}>
            <ProfileWorkspace />
          </main>,
        );
      }
      expect(signal.aborted).toBe(true);
      await act(async () => write.resolve({ updated: true }));
      expect(screen.queryByText("Your display name is saved.")).toBeNull();
      expect(screen.queryByDisplayValue("Fictional old draft")).toBeNull();
      expect(refresh).not.toHaveBeenCalled();
    },
  );
  it("requires a named session consequence review and supports cancel without revocation", async () => {
    mount();
    const { dialog } = await review();
    expect(
      within(dialog).getByText(/This device stays signed in/),
    ).toBeTruthy();
    expect(
      within(dialog).getByText(/fictional-officer@example.test/),
    ).toBeTruthy();
    expect(writes()).toHaveLength(0);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Cancel review" }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(writes()).toHaveLength(0);
  });
  it("revokes only after fresh session review and guards duplicate confirmation and pending escape", async () => {
    const write = pending();
    apiMock.mockImplementation((path, options) =>
      options?.method ? write.promise : Promise.resolve(read(path)),
    );
    mount();
    const { dialog, confirm } = await review();
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(writes()).toHaveLength(1);
    expect(writes()[0][0]).toBe("/auth/sessions");
    expect(writes()[0][1].method).toBe("DELETE");
    expect(
      (
        within(dialog).getByRole("button", {
          name: "Cancel review",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    sessions = [current];
    await act(async () => write.resolve({ revoked: true }));
    await screen.findByText("Your other sessions are signed out.");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("offers read-only account/session recovery inside an uncertain revocation review", async () => {
    apiMock.mockImplementation((path, options) =>
      options?.method
        ? Promise.reject(Error("Fictional uncertain revocation"))
        : Promise.resolve(read(path)),
    );
    mount();
    const { dialog, confirm } = await review();
    fireEvent.click(confirm);
    await within(dialog).findByText(/result could not be confirmed/);
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Recheck account and sessions",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(writes()).toHaveLength(1);
    expect(apiMock).toHaveBeenCalledWith("/admin/me", {
      signal: expect.any(AbortSignal),
    });
  });
  it("blocks confirmation when the refreshed session inventory changes", async () => {
    mount();
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Sign out other sessions",
            exact: true,
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    sessions = [current, other, { ...other, id: "fictional-new-session" }];
    fireEvent.click(
      screen.getByRole("button", {
        name: "Sign out other sessions",
        exact: true,
      }),
    );
    await screen.findByText(/session inventory changed/);
    expect(
      (
        within(screen.getByRole("dialog")).getByRole("button", {
          name: "Confirm other-session sign-out",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(writes()).toHaveLength(0);
  });
  it("associates password mismatch with the confirmation field before any request", async () => {
    mount();
    const form = passwords();
    const confirmation = document.querySelector<HTMLInputElement>(
      "input[name=confirmPassword]",
    )!;
    fireEvent.change(confirmation, {
      target: { value: "Fictional-different-password" },
    });
    fireEvent.submit(form);
    await screen.findByText("The new passwords do not match.");
    expect(confirmation.getAttribute("aria-invalid")).toBe("true");
    expect(confirmation.getAttribute("aria-describedby")).toBe(
      "profile-confirm-password-error",
    );
    expect(writes()).toHaveLength(0);
  });
  it("keeps incorrect-current-password feedback on the current field without hiding the valid account", async () => {
    apiMock.mockImplementation((path, options) =>
      options?.method
        ? Promise.reject(
            new ApiFailure(
              400,
              "VALIDATION_ERROR",
              "Current password not confirmed.",
              { currentPassword: "Check the current password." },
            ),
          )
        : Promise.resolve(read(path)),
    );
    mount();
    fireEvent.submit(passwords());
    await screen.findByText("Check the current password.");
    expect(
      document
        .querySelector("input[name=currentPassword]")
        ?.getAttribute("aria-describedby"),
    ).toBe("profile-current-password-error");
    expect(screen.getByRole("heading", { name: "My profile" })).toBeTruthy();
    expect(
      screen.queryByText("Account access needs to be rechecked"),
    ).toBeNull();
  });
  it("sends the captured password change once and clears password inputs only after acceptance", async () => {
    const write = pending();
    apiMock.mockImplementation((path, options) =>
      options?.method ? write.promise : Promise.resolve(read(path)),
    );
    mount();
    const form = passwords();
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(writes()).toHaveLength(1);
    expect(writes()[0][1].body).toEqual({
      currentPassword: "Fictional-current-password",
      newPassword: "Fictional-next-password",
    });
    await act(async () => write.resolve({ changed: true }));
    await screen.findByText(
      "Password changed. Your other sessions were revoked.",
    );
    expect(
      document.querySelector<HTMLInputElement>("input[name=currentPassword]")!
        .value,
    ).toBe("");
  });
  it("preserves offline input without writing on reconnect", async () => {
    mount();
    fireEvent.change(account(), {
      target: { value: "Fictional offline draft" },
    });
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    act(() => window.dispatchEvent(new Event("offline")));
    submitAccount();
    expect(writes()).toHaveLength(0);
    expect((account() as HTMLInputElement).value).toBe(
      "Fictional offline draft",
    );
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    act(() => window.dispatchEvent(new Event("online")));
    expect(writes()).toHaveLength(0);
    expect(guard).toHaveBeenLastCalledWith(
      true,
      expect.objectContaining({ busy: false }),
    );
  });
  it("passes structural axe checks for a loaded editor and the session review", async () => {
    const view = mount();
    await screen.findByText("Other session");
    expect(
      (
        await axe.run(view.container, {
          rules: { "color-contrast": { enabled: false } },
        })
      ).violations.map((row) => row.id),
    ).toEqual([]);
    const { dialog } = await review();
    expect(
      (
        await axe.run(dialog, {
          rules: { "color-contrast": { enabled: false } },
        })
      ).violations.map((row) => row.id),
    ).toEqual([]);
  });
});
