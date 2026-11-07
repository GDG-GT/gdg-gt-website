// @vitest-environment jsdom
import React from "react";
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
import NotificationBell, {
  NotificationInbox,
} from "../../src/components/admin/NotificationBell";
import { ApiFailure } from "../../src/lib/api";
const { apiMock, identity } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  identity: { id: "fictional-notification-owner", role: "admin" },
}));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: apiMock,
}));
vi.mock("@/contexts/AdminContext", () => ({
  useAdmin: () => ({ currentAdmin: identity }),
}));
vi.mock("@/hooks/useScopedRealtime", () => ({ useScopedRealtime: () => {} }));
const item = {
  id: "fictional-update",
  title: "Fictional team update",
  message: "A fictional private notification.",
  is_read: false,
  link: "/admin/forms",
  created_at: "2026-10-26T12:00:00Z",
};
function inbox({
  read = false,
  unread = read ? 0 : 1,
  total = 1,
  items = [{ ...item, is_read: read }],
} = {}) {
  return { items, total, unreadCount: unread };
}
function pending<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function mount() {
  return render(
    <MemoryRouter>
      <main>
        <h1>Fictional workspace</h1>
        <h2>Notifications</h2>
        <NotificationInbox />
      </main>
    </MemoryRouter>,
  );
}
beforeEach(() => {
  apiMock.mockReset();
  identity.id = "fictional-notification-owner";
  identity.role = "admin";
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 0),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("Account notification read/dismiss and race recovery", () => {
  it("loads with a named skeleton and does not invent an empty inbox", async () => {
    const reading = pending<ReturnType<typeof inbox>>();
    apiMock.mockReturnValue(reading.promise);
    mount();
    expect(
      screen.getByRole("status", { name: "Loading notifications" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "You’re all caught up" }),
    ).toBeNull();
    reading.resolve(inbox());
    await screen.findByRole("heading", { name: item.title });
    expect(screen.getByRole("button", { name: "Mark all read" })).toBeTruthy();
  });
  it("changes Mark all read to Dismiss all only after the real read result, and preserves new unread updates", async () => {
    let state = inbox();
    apiMock.mockImplementation(
      async (_: string, options: { method?: string; body?: unknown }) => {
        if (options?.method === "PATCH") {
          expect(options.body).toEqual({ is_read: true });
          state = inbox({ read: true });
          return { changed: 1 };
        }
        if (options?.method === "DELETE") {
          expect(options.body).toEqual({ readOnly: true });
          state = inbox({
            total: 1,
            unread: 1,
            items: [
              {
                ...item,
                id: "new-update",
                title: "New fictional unread update",
              },
            ],
          });
          return { changed: 1 };
        }
        return state;
      },
    );
    mount();
    fireEvent.click(
      await screen.findByRole("button", { name: "Mark all read" }),
    );
    await screen.findByRole("button", { name: "Dismiss all" });
    expect(screen.getByRole("status").textContent).toContain("marked read");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss all" }));
    await screen.findByRole("heading", { name: "New fictional unread update" });
    expect(screen.getByRole("button", { name: "Mark all read" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(
      "New unread notifications are kept",
    );
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("status")),
    );
  });
  it("prevents duplicate writes and pauses live reads until the mutation has finished", async () => {
    const writing = pending<object>();
    apiMock.mockImplementation((_: string, options: { method?: string }) =>
      options?.method ? writing.promise : Promise.resolve(inbox()),
    );
    mount();
    const button = await screen.findByRole("button", { name: "Mark all read" });
    fireEvent.click(button);
    fireEvent.click(button);
    act(() => window.dispatchEvent(new Event("gdg:notifications-updated")));
    expect(
      apiMock.mock.calls.filter(([, options]) => options?.method),
    ).toHaveLength(1);
    expect(
      apiMock.mock.calls.filter(([, options]) => !options?.method),
    ).toHaveLength(1);
    expect(
      (
        screen.getByRole("button", {
          name: "Dismiss " + item.title,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    writing.resolve({ changed: 1 });
    await waitFor(() =>
      expect(
        apiMock.mock.calls.filter(([, options]) => !options?.method),
      ).toHaveLength(2),
    );
  });
  it("aborts an older refresh and ignores its late row after a newer live result", async () => {
    const old = pending<ReturnType<typeof inbox>>();
    apiMock
      .mockReturnValueOnce(old.promise)
      .mockResolvedValue(inbox({ items: [], total: 0, unread: 0 }));
    mount();
    const signal = apiMock.mock.calls[0][1].signal;
    act(() => window.dispatchEvent(new Event("gdg:notifications-updated")));
    await screen.findByRole("heading", { name: "You’re all caught up" });
    await act(async () => old.resolve(inbox()));
    expect(signal.aborted).toBe(true);
    expect(screen.queryByRole("heading", { name: item.title })).toBeNull();
  });
  it("keeps stale rows labelled and actions disabled until a failed refresh recovers", async () => {
    apiMock
      .mockResolvedValueOnce(inbox())
      .mockRejectedValueOnce(Error("Fictional inbox unavailable"))
      .mockResolvedValue(inbox());
    mount();
    await screen.findByRole("heading", { name: item.title });
    act(() => window.dispatchEvent(new Event("gdg:notifications-updated")));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "last loaded",
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Mark all read",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Retry loading notifications" }),
    );
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(document.activeElement?.textContent).toBe("1 unread");
  });
  it("offers initial failed-read retry without an empty success state", async () => {
    apiMock
      .mockRejectedValueOnce(Error("Fictional initial read failure"))
      .mockResolvedValue(inbox({ items: [], total: 0, unread: 0 }));
    mount();
    await screen.findByRole("alert");
    expect(
      screen.queryByRole("heading", { name: "You’re all caught up" }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Retry loading notifications" }),
    );
    await screen.findByRole("heading", { name: "You’re all caught up" });
  });
  it("clears previously readable rows when refresh loses permission", async () => {
    apiMock
      .mockResolvedValueOnce(inbox())
      .mockRejectedValue(
        new ApiFailure(403, "FORBIDDEN", "Fictional access unavailable"),
      );
    mount();
    await screen.findByRole("heading", { name: item.title });
    act(() => window.dispatchEvent(new Event("gdg:notifications-updated")));
    await screen.findByRole("alert");
    expect(screen.queryByRole("heading", { name: item.title })).toBeNull();
    expect(screen.getByRole("alert").textContent).not.toContain("last loaded");
    expect(
      screen.queryByRole("heading", { name: "You’re all caught up" }),
    ).toBeNull();
  });
  it("preserves a failed mutation message and focuses it until an explicit refresh", async () => {
    apiMock.mockImplementation((_: string, options: { method?: string }) =>
      options?.method
        ? Promise.reject(Error("Fictional mark-read failure"))
        : Promise.resolve(inbox()),
    );
    mount();
    fireEvent.click(
      await screen.findByRole("button", { name: "Mark all read" }),
    );
    const error = await screen.findByRole("alert");
    await waitFor(() => expect(document.activeElement).toBe(error));
    act(() => window.dispatchEvent(new Event("gdg:notifications-updated")));
    await waitFor(() =>
      expect(
        apiMock.mock.calls.filter(([, options]) => !options?.method),
      ).toHaveLength(2),
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "Fictional mark-read failure",
    );
    fireEvent.click(screen.getByRole("button", { name: "Refresh inbox" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
  it("restores focus after dismissing the focused row", async () => {
    let state = inbox();
    apiMock.mockImplementation(
      async (_: string, options: { method?: string }) => {
        if (options?.method === "DELETE") {
          state = inbox({ items: [], unread: 0, total: 0 });
          return { changed: 1 };
        }
        return state;
      },
    );
    mount();
    const dismiss = await screen.findByRole("button", {
      name: "Dismiss " + item.title,
    });
    dismiss.focus();
    fireEvent.click(dismiss);
    await screen.findByRole("heading", { name: "You’re all caught up" });
    expect(document.activeElement).toBe(screen.getByRole("status"));
  });
  it("does not put arbitrary stored URLs into an actionable update link", async () => {
    apiMock.mockResolvedValue(
      inbox({
        items: [
          "javascript:alert(1)",
          "//external.example.test",
          "/\\external.example.test",
          "/admin/unsafe\npath",
        ].map((link, i) => ({ ...item, id: String(i), link })),
      }),
    );
    mount();
    await screen.findAllByRole("heading", { name: item.title });
    expect(screen.queryByRole("link", { name: "Open update" })).toBeNull();
  });
  it("hides the previous page during pagination and repositions after the result shrinks", async () => {
    apiMock.mockImplementation(async (path: string) =>
      path.includes("page=2")
        ? inbox({ items: [], total: 1 })
        : inbox({ total: 21 }),
    );
    mount();
    await screen.findByRole("heading", { name: item.title });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.queryByRole("heading", { name: item.title })).toBeNull();
    await screen.findByText("Page 1 of 2");
    expect(document.activeElement?.textContent).toBe("1 unread");
  });
  it("aborts read and write requests when the inbox unmounts", async () => {
    const writing = pending<object>();
    apiMock.mockImplementation((_: string, options: { method?: string }) =>
      options?.method ? writing.promise : Promise.resolve(inbox()),
    );
    const view = mount();
    fireEvent.click(
      await screen.findByRole("button", { name: "Mark all read" }),
    );
    const readSignal = apiMock.mock.calls[0][1].signal,
      writeSignal = apiMock.mock.calls[1][1].signal;
    view.unmount();
    expect(readSignal.aborted).toBe(true);
    expect(writeSignal.aborted).toBe(true);
    await act(async () => writing.resolve({ changed: 1 }));
    expect(apiMock).toHaveBeenCalledTimes(2);
  });
  it("remounts private inbox state when the account changes instead of retaining an open dialog", async () => {
    apiMock.mockResolvedValue(inbox());
    const view = render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Notifications/ }));
    await screen.findByRole("heading", { name: item.title });
    identity.id = "other-fictional-owner";
    view.rerender(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("heading", { name: item.title })).toBeNull();
  });
  it("keeps a newer unread count when an older background read finishes late", async () => {
    const older = pending<ReturnType<typeof inbox>>(), newer = pending<ReturnType<typeof inbox>>();
    apiMock.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    render(<MemoryRouter><NotificationBell /></MemoryRouter>);
    const firstSignal = apiMock.mock.calls[0][1].signal;
    fireEvent(document, new Event("visibilitychange"));
    expect(firstSignal.aborted).toBe(true);
    await act(async () => newer.resolve(inbox({ unread: 2 })));
    expect(screen.getByRole("button", { name: "Notifications, 2 unread" })).toBeTruthy();
    await act(async () => older.resolve(inbox({ unread: 9 })));
    expect(screen.getByRole("button", { name: "Notifications, 2 unread" })).toBeTruthy();
  });
  it("cancels a background read before the document leaves or becomes hidden", async () => {
    const reading = pending<ReturnType<typeof inbox>>();
    apiMock.mockReturnValue(reading.promise);
    const visible = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const view = render(<MemoryRouter><NotificationBell /></MemoryRouter>);
    const firstSignal = apiMock.mock.calls[0][1].signal;
    fireEvent(window, new Event("pagehide"));
    expect(firstSignal.aborted).toBe(true);
    fireEvent(document, new Event("visibilitychange"));
    const secondSignal = apiMock.mock.calls[1][1].signal;
    visible.mockReturnValue("hidden");
    fireEvent(document, new Event("visibilitychange"));
    expect(secondSignal.aborted).toBe(true);
    expect(apiMock).toHaveBeenCalledTimes(2);
    view.unmount();
    await act(async () => reading.resolve(inbox({ unread: 9 })));
  });
});
