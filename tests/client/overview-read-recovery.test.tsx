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
import AdminOverview from "../../src/ui/AdminOverview";
import { ApiFailure } from "../../src/lib/api";
const { apiMock, actor } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  actor: {
    id: "fictional-overview-admin",
    role: "admin",
    display_name: "Fictional Reviewer",
  },
}));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: apiMock,
}));
vi.mock("@/contexts/AdminContext", () => ({
  useAdmin: () => ({ currentAdmin: actor }),
}));
function dashboard() {
  const ready = <T,>(data: T) => ({ state: "ready" as const, data });
  return {
    generatedAt: "2026-11-05T12:00:00Z",
    allowedRoutes: ["/admin/events", "/admin/forms"],
    widgets: {
      messages: ready({ unread: 7 }),
      events: ready({ count: 3, items: [] }),
      profiles: ready({ count: 9 }),
      finances: ready({ pending: 4 }),
      registrations: ready({ totalEvents: 0, items: [] }),
      funding: ready({ items: [] }),
      activity: ready({
        items: [
          {
            id: "fictional-activity",
            action: "fictional.private_action",
            result: "success",
            created_at: "2026-11-05T12:00:00Z",
          },
        ],
      }),
      tasks: ready({
        items: [
          {
            id: "fictional-task",
            title: "Fictional assigned task",
            status: "todo",
            priority: "normal",
            due_date: null,
          },
        ],
      }),
      memberships: ready({
        items: [
          {
            id: "fictional-team",
            name: "Fictional private team",
            role: "member",
          },
        ],
      }),
    },
  };
}
let read: () => unknown;
function pending() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const body = () => (
  <MemoryRouter
    future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
  >
    <main id="workspace-content" tabIndex={-1}>
      <AdminOverview />
    </main>
  </MemoryRouter>
);
beforeEach(() => {
  apiMock.mockReset();
  actor.id = "fictional-overview-admin";
  actor.role = "admin";
  read = dashboard;
  apiMock.mockImplementation(() => Promise.resolve().then(read));
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: true,
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("Overview private read recovery", () => {
  it("names the loading skeleton without inventing metric values", () => {
    read = () => pending().promise;
    render(body());
    expect(
      screen.getByRole("status", { name: "Loading your workspace" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("link", { name: /Your unread messages/ }),
    ).toBeNull();
    expect(apiMock).toHaveBeenCalledWith("/admin/dashboard", {
      signal: expect.any(AbortSignal),
    });
  });
  it("retries initial failure read-only and restores workspace focus", async () => {
    read = () => {
      throw Error("Fictional overview outage");
    };
    render(body());
    const retry = await screen.findByRole("button", { name: "Retry overview" });
    read = dashboard;
    fireEvent.click(retry);
    await screen.findByRole("link", { name: /7\s*Your unread messages/ });
    expect(document.activeElement?.id).toBe("workspace-content");
    expect(apiMock.mock.calls.every(([, options]) => !options.method)).toBe(
      true,
    );
  });
  it("retains a dated failed-refresh snapshot but removes stale quick actions", async () => {
    render(body());
    await screen.findByRole("link", { name: /Plan an event/ });
    read = () => {
      throw Error("Fictional background outage");
    };
    fireEvent.click(screen.getByRole("button", { name: "Refresh overview" }));
    await screen.findByText("Fictional background outage");
    expect(screen.getByText("Fictional assigned task")).toBeTruthy();
    expect(screen.getByText(/Showing the overview loaded at/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Plan an event/ })).toBeNull();
    expect(
      screen.getByText("Refresh the overview to check current shortcuts."),
    ).toBeTruthy();
  });
  it.each([401, 403, 404])(
    "clears all private widgets on %i denial and explicitly rechecks access",
    async (status) => {
      render(body());
      await screen.findByText("Fictional assigned task");
      read = () => {
        throw new ApiFailure(status, "FORBIDDEN", "Current access unavailable");
      };
      fireEvent.click(screen.getByRole("button", { name: "Refresh overview" }));
      await screen.findByText("Overview access needs to be rechecked");
      expect(screen.queryByText("Fictional assigned task")).toBeNull();
      expect(screen.queryByText("Fictional private team")).toBeNull();
      expect(
        screen.queryByRole("link", { name: /Your unread messages/ }),
      ).toBeNull();
      read = dashboard;
      fireEvent.click(
        screen.getByRole("button", { name: "Recheck overview access" }),
      );
      await screen.findByText("Fictional assigned task");
    },
  );
  it.each(["id", "role", "session"])(
    "cancels pending reads and clears old snapshots after %s replacement",
    async (kind) => {
      const view = render(body());
      await screen.findByText("Fictional assigned task");
      const delayed = pending();
      read = () => delayed.promise;
      fireEvent.click(screen.getByRole("button", { name: "Refresh overview" }));
      const signal = apiMock.mock.calls.at(-1)![1].signal;
      read = () => ({
        ...dashboard(),
        widgets: {
          ...dashboard().widgets,
          tasks: { state: "ready", data: { items: [] } },
        },
      });
      if (kind === "session")
        act(() => window.dispatchEvent(new Event("gdg:session-cleared")));
      else {
        actor[kind] = "replacement";
        view.rerender(body());
      }
      await screen.findByRole("heading", {
        name: "Nothing assigned right now",
      });
      expect(signal.aborted).toBe(true);
      await act(async () => delayed.resolve(dashboard()));
      expect(screen.queryByText("Fictional assigned task")).toBeNull();
    },
  );
  it("aborts a pending overview request on unmount", () => {
    read = () => pending().promise;
    const view = render(body());
    const signal = apiMock.mock.calls[0][1].signal;
    view.unmount();
    expect(signal.aborted).toBe(true);
  });
  it("offers a named failed-widget retry while keeping unrelated ready panels", async () => {
    read = () => ({
      ...dashboard(),
      widgets: {
        ...dashboard().widgets,
        registrations: {
          state: "error",
          message: "Fictional registration widget outage",
        },
      },
    });
    render(body());
    const retry = await screen.findByRole("button", {
      name: "Retry registrations",
    });
    expect(screen.getByText("Fictional assigned task")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /7\s*Your unread messages/ }),
    ).toBeTruthy();
    read = dashboard;
    fireEvent.click(retry);
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Retry registrations" }),
      ).toBeNull(),
    );
    expect(apiMock.mock.calls).toHaveLength(2);
    expect(document.activeElement?.id).toBe("workspace-content");
  });
  it("retains offline snapshots and reconnect sends no write or automatic read", async () => {
    render(body());
    await screen.findByText("Fictional assigned task");
    const count = apiMock.mock.calls.length;
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    act(() => window.dispatchEvent(new Event("offline")));
    expect(screen.getByText(/Overview snapshot from/)).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Refresh overview" })
        .matches(":disabled"),
    ).toBe(true);
    expect(screen.queryByRole("link", { name: /Plan an event/ })).toBeNull();
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    act(() => window.dispatchEvent(new Event("online")));
    expect(apiMock.mock.calls).toHaveLength(count);
    expect(screen.getByText("Fictional assigned task")).toBeTruthy();
  });
});
