// @vitest-environment jsdom
import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ProfileWorkspace from "../../src/ui/ProfileWorkspace";
import { ApiFailure } from "../../src/lib/api";
const { apiMock, actor } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  actor: {
    value: {
      id: "fictional-profile-a",
      role: "admin",
      display_name: "First officer",
      email: "first@example.test",
    },
  },
}));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: apiMock,
}));
vi.mock("@/contexts/AdminContext", () => ({
  useAdmin: () => ({
    currentAdmin: actor.value,
    mergedProfile: null,
    refreshProfile: vi.fn(),
    updateTeamProfile: vi.fn(),
  }),
}));
vi.mock("@/contexts/ContentContext", () => ({ useContent: () => ({}) }));
vi.mock("@/hooks/useDraftGuard", () => ({ useDraftGuard: vi.fn() }));
const sessions = "/admin/me/sessions",
  activity = "/admin/me/activity";
const session = {
  id: "fictional-session",
  current: true,
  created_at: "2026-11-05T01:00:00Z",
  last_seen_at: "2026-11-05T02:00:00Z",
  absolute_expires_at: "2026-11-12T01:00:00Z",
};
const action = {
  id: "fictional-activity",
  action: "profile.changed",
  created_at: "2026-11-05T02:00:00Z",
  result: "success",
};
const response = (path: string) => ({
  items: path === sessions ? [session] : [action],
});
function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise((value) => {
    resolve = value;
  });
  return { promise, resolve };
}
const body = () => (
  <main id="workspace-content" tabIndex={-1}>
    <ProfileWorkspace />
  </main>
);
beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockImplementation((path: string) => Promise.resolve(response(path)));
  actor.value = {
    id: "fictional-profile-a",
    role: "admin",
    display_name: "First officer",
    email: "first@example.test",
  };
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("shows independent loading skeletons instead of false empty inventories", () => {
  apiMock.mockReturnValue(new Promise(() => {}));
  render(body());
  expect(
    screen.getByRole("status", { name: "Loading active sessions" }),
  ).toBeTruthy();
  expect(
    screen.getByRole("status", { name: "Loading recent activity" }),
  ).toBeTruthy();
  expect(screen.queryByText("No recent activity")).toBeNull();
  expect(screen.queryByText("No active sessions to show")).toBeNull();
});
it("shows both read failures explicitly and retries only the requested panel", async () => {
  apiMock.mockRejectedValue(Error("Fictional connection lost"));
  render(body());
  await screen.findByRole("button", { name: "Retry active sessions" });
  expect(screen.getAllByRole("alert")).toHaveLength(2);
  expect(screen.queryByText("No recent activity")).toBeNull();
  apiMock.mockImplementation((path: string) => Promise.resolve(response(path)));
  const before = apiMock.mock.calls.filter(
    ([path]) => path === activity,
  ).length;
  fireEvent.click(
    screen.getByRole("button", { name: "Retry active sessions" }),
  );
  await screen.findByText("This session");
  expect(apiMock.mock.calls.filter(([path]) => path === activity)).toHaveLength(
    before,
  );
  expect(
    screen.getByRole("button", { name: "Retry recent activity" }),
  ).toBeTruthy();
  expect(document.activeElement?.id).toBe("workspace-content");
});
it("keeps successful activity available when session loading fails", async () => {
  apiMock.mockImplementation((path: string) =>
    path === sessions
      ? Promise.reject(Error("Session inventory interrupted"))
      : Promise.resolve(response(path)),
  );
  render(body());
  await screen.findByRole("button", { name: "Retry active sessions" });
  expect(screen.getByText(/profile changed/)).toBeTruthy();
});
it("retains timestamped session data on refresh failure and blocks stale session actions", async () => {
  apiMock.mockImplementation((path: string) =>
    Promise.resolve(
      path === sessions
        ? { items: [session, { ...session, id: "other", current: false }] }
        : response(path),
    ),
  );
  render(body());
  await screen.findByText("Other session");
  apiMock.mockRejectedValue(Error("Refresh interrupted"));
  fireEvent.click(
    screen.getByRole("button", { name: "Refresh active sessions" }),
  );
  await screen.findByText(/Showing information last loaded/);
  expect(screen.getByText("Other session")).toBeTruthy();
  expect(
    (
      screen.getByRole("button", {
        name: "Sign out other sessions",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
});
it("clears denied snapshots instead of preserving private session rows", async () => {
  render(body());
  await screen.findByText("This session");
  apiMock.mockRejectedValue(
    new ApiFailure(403, "FORBIDDEN", "Access is restricted"),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Refresh active sessions" }),
  );
  await screen.findByRole("button", { name: "Retry active sessions" });
  expect(screen.queryByText("This session")).toBeNull();
  expect(screen.queryByText(/Showing information last loaded/)).toBeNull();
});
it("aborts reads and resets profile input on account replacement, ignoring old results", async () => {
  const old = deferred();
  apiMock.mockReturnValue(old.promise);
  const page = render(body());
  const oldSignals = apiMock.mock.calls.map(
    ([, options]) => options.signal as AbortSignal,
  );
  fireEvent.change(screen.getByLabelText(/^Display name/), {
    target: { value: "Old unsaved profile" },
  });
  actor.value = {
    ...actor.value,
    id: "fictional-profile-b",
    display_name: "Second officer",
  };
  apiMock.mockResolvedValue({ items: [] });
  page.rerender(body());
  await screen.findByText("No recent activity");
  expect(oldSignals.every((signal) => signal.aborted)).toBe(true);
  expect(
    (screen.getByLabelText(/^Display name/) as HTMLInputElement).value,
  ).toBe("Second officer");
  old.resolve({ items: [session] });
  await waitFor(() => expect(screen.queryByText("This session")).toBeNull());
});
it("clears same-account session state and aborts obsolete reads", async () => {
  const old = deferred();
  apiMock.mockReturnValue(old.promise);
  render(body());
  const signals = apiMock.mock.calls.map(
    ([, options]) => options.signal as AbortSignal,
  );
  fireEvent.change(screen.getByLabelText(/^Display name/), {
    target: { value: "Prior session draft" },
  });
  apiMock.mockResolvedValue({ items: [] });
  fireEvent(window, new Event("gdg:session-cleared"));
  await screen.findByText("No recent activity");
  expect(signals.every((signal) => signal.aborted)).toBe(true);
  expect(
    (screen.getByLabelText(/^Display name/) as HTMLInputElement).value,
  ).toBe("First officer");
});
it("retains offline input and reconnect never auto-submits writes", async () => {
  render(body());
  await screen.findByText("This session");
  fireEvent.change(screen.getByLabelText(/^Display name/), {
    target: { value: "Offline draft" },
  });
  fireEvent(window, new Event("offline"));
  await screen.findByText(/You are offline/);
  expect(
    (
      screen.getByRole("button", {
        name: "Refresh active sessions",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  fireEvent(window, new Event("online"));
  expect(
    (screen.getByLabelText(/^Display name/) as HTMLInputElement).value,
  ).toBe("Offline draft");
  expect(apiMock.mock.calls.some(([, options]) => options.method)).toBe(false);
});
