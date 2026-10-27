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
import ChannelWorkspace from "../../src/ui/channels/ChannelWorkspace";
import { ApiFailure } from "../../src/lib/api";
const { apiMock, actor, live } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  actor: { id: "f1520000-0000-4000-8000-000000000001", role: "admin" },
  live: { refresh: () => {}, denied: () => {} },
}));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: apiMock,
}));
vi.mock("@/contexts/AdminContext", () => ({
  useAdmin: () => ({ currentAdmin: actor }),
}));
vi.mock("@/hooks/useDraftGuard", async (original) => ({
  ...(await original<typeof import("../../src/hooks/useDraftGuard")>()),
  useDraftGuard: vi.fn(),
}));
vi.mock("@/hooks/useScopedRealtime", () => ({
  useScopedRealtime: (
    _scope: unknown,
    change: () => void,
    deny: () => void,
  ) => {
    live.refresh = change;
    live.denied = deny;
    return "live";
  },
}));
const id = "f1520000-0000-4000-8000-000000000002",
  itemId = "f1520000-0000-4000-8000-000000000003",
  otherId = "f1520000-0000-4000-8000-000000000004",
  base = "/admin/channels",
  path = base + "/" + id;
const record = {
  id,
  name: "fictional-builders",
  description: "Fictional room description",
  visibility: "private",
  team_id: null,
  is_archived: false,
  is_team_chat: false,
  revision: 1,
};
const room = {
  record,
  actorId: actor.id,
  canRestore: false,
  actions: { manage: true, moderate: true, send: true, manageMembers: true },
};
const item = {
  id: itemId,
  sender_id: actor.id,
  senderName: "Fictional teammate",
  message: "Fictional original room message",
  is_deleted: false,
  is_pinned: false,
  revision: 1,
  creation_sequence: 1,
  change_sequence: 1,
  created_at: "2026-10-26T12:00:00Z",
  updated_at: "2026-10-26T12:00:00Z",
  canEdit: true,
  canDelete: true,
  reply: null,
};
function response(route: string) {
  return route === base + "/capabilities"
    ? { globalCreate: true, teams: [] }
    : route.includes("/updates?")
      ? { items: [], cursor: 1, hasMore: false }
      : route.includes("/members?")
        ? {
            items: [
              {
                admin_user_id: actor.id,
                role: "owner",
                user: {
                  display_name: "Fictional teammate",
                  email: "fictional@example.test",
                },
              },
            ],
            total: 1,
          }
        : route.includes("/messages?")
          ? {
              items: route.includes("pinned=1") ? [] : [item],
              nextCursor: null,
              highWaterMark: 1,
            }
          : route.startsWith(base + "?")
            ? { items: [record], total: 1, pageSize: 30 }
            : room;
}
function deferred<T>() {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
function mount(selected = true) {
  return render(
    <MemoryRouter
      initialEntries={["/admin/channels" + (selected ? "?room=" + id : "")]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <main id="workspace-content" tabIndex={-1}>
        <ChannelWorkspace />
      </main>
    </MemoryRouter>,
  );
}
const writes = () =>
  apiMock.mock.calls.filter(
    ([, options]) => options?.method && options.method !== "GET",
  );
async function ready() {
  await screen.findByText(item.message);
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Mark loaded messages read",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
}
async function draft() {
  await ready();
  const input = screen.getByLabelText(/Message this room/);
  fireEvent.change(input, { target: { value: "Fictional room draft" } });
  return input.closest("form")!;
}
beforeEach(() => {
  actor.id = "f1520000-0000-4000-8000-000000000001";
  actor.role = "admin";
  apiMock.mockReset();
  apiMock.mockImplementation((route: string, options?: { method?: string }) =>
    Promise.resolve(
      options?.method && options.method !== "GET"
        ? { record }
        : response(route),
    ),
  );
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  vi.spyOn(window, "confirm").mockReturnValue(true);
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete (HTMLElement.prototype as unknown as { scrollIntoView?: unknown })
    .scrollIntoView;
});
describe("Channel read recovery and isolation", () => {
  it("uses named initial skeletons and aborts pending reads on unmount", () => {
    const pending = deferred<unknown>(),
      signals: AbortSignal[] = [];
    apiMock.mockImplementation(
      (_route: string, options: { signal?: AbortSignal }) => {
        if (options.signal) signals.push(options.signal);
        return pending.promise;
      },
    );
    const page = mount();
    for (const name of [
      "Loading rooms",
      "Loading room creation permissions",
      "Loading selected room",
    ])
      expect(
        screen.getByRole("status", { name }).querySelector(".gt-skeleton"),
      ).toBeTruthy();
    page.unmount();
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });
  it("retries failed creation permissions even when the list itself succeeded", async () => {
    let failed = true;
    apiMock.mockImplementation((route: string) =>
      route.endsWith("capabilities") && failed
        ? Promise.reject(Error("Permission read interrupted"))
        : Promise.resolve(response(route)),
    );
    mount(false);
    await screen.findByText("capabilities: Permission read interrupted");
    expect(screen.queryByRole("button", { name: "Create room" })).toBeNull();
    failed = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry capabilities" }));
    expect(document.activeElement?.id).toBe("workspace-content");
    await screen.findByRole("button", { name: "Create room" });
    expect(
      screen.queryByText("capabilities: Permission read interrupted"),
    ).toBeNull();
  });
  it("does not turn failed room/list reads into empty or indefinite-loading states", async () => {
    apiMock.mockImplementation((route: string) =>
      route.endsWith("capabilities")
        ? Promise.resolve(response(route))
        : Promise.reject(Error("Read interrupted")),
    );
    mount();
    await screen.findByText("list: Read interrupted");
    expect(screen.getByText("room: Read interrupted")).toBeTruthy();
    expect(screen.getByText(/Rooms are unavailable/)).toBeTruthy();
    expect(screen.getByText(/This room is unavailable/)).toBeTruthy();
    expect(
      screen.queryByRole("status", { name: "Loading selected room" }),
    ).toBeNull();
  });
  it("hides unpinned history immediately while a pinned-only read is pending", async () => {
    const pending = deferred<unknown>();
    apiMock.mockImplementation((route: string) =>
      route.includes("pinned=1")
        ? pending.promise
        : Promise.resolve(response(route)),
    );
    mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Pinned messages" }));
    expect(screen.queryByText(item.message)).toBeNull();
    expect(
      screen.getByRole("status", { name: "Loading room messages" }),
    ).toBeTruthy();
    await act(async () =>
      pending.resolve({ items: [], nextCursor: null, highWaterMark: 1 }),
    );
    await screen.findByText("No pinned messages in this room.");
  });
  it("retains timestamped stale history on network failure but erases denied history", async () => {
    mount();
    await ready();
    apiMock.mockRejectedValue(Error("Refresh interrupted"));
    act(() => live.refresh());
    await screen.findByText("room: Refresh interrupted");
    expect(screen.getByText(item.message)).toBeTruthy();
    expect(
      screen.getByText(/Room history may be out of date. Last loaded/),
    ).toBeTruthy();
    apiMock.mockRejectedValue(
      new ApiFailure(403, "FORBIDDEN", "Room access ended"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry room" }));
    await screen.findByText("room: Room access ended");
    expect(screen.queryByText(item.message)).toBeNull();
  });
  it("retries membership failures and prevents a late membership read after leaving the workspace", async () => {
    let failed = true;
    const pending = deferred<unknown>();
    let signal: AbortSignal | undefined;
    apiMock.mockImplementation(
      (route: string, options: { signal?: AbortSignal }) => {
        if (route.includes("/members?")) {
          if (failed)
            return Promise.reject(Error("Membership read interrupted"));
          signal = options.signal;
          return pending.promise;
        }
        return Promise.resolve(response(route));
      },
    );
    const page = mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Room memberships" }));
    await screen.findByText("members: Membership read interrupted");
    failed = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry members" }));
    expect(
      screen.getByRole("status", { name: "Loading room memberships" }),
    ).toBeTruthy();
    page.unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => pending.resolve({ items: [], total: 0 }));
  });
  it("applies every bounded catch-up page rather than skipping an intermediate live message", async () => {
    const second = {
        ...item,
        id: otherId,
        message: "Fictional second delta",
        creation_sequence: 2,
        change_sequence: 2,
      },
      third = {
        ...item,
        id: "f1520000-0000-4000-8000-000000000005",
        message: "Fictional third delta",
        creation_sequence: 3,
        change_sequence: 3,
      };
    apiMock.mockImplementation((route: string) =>
      Promise.resolve(
        route.includes("/updates?after=1")
          ? { items: [second], cursor: 2, hasMore: true }
          : route.includes("/updates?after=2")
            ? { items: [third], cursor: 3, hasMore: false }
            : response(route),
      ),
    );
    mount();
    await screen.findByText(third.message);
    expect(screen.getByText(item.message)).toBeTruthy();
    expect(screen.getByText(second.message)).toBeTruthy();
  });
  it("offers a reset action when room search has no matches", async () => {
    apiMock.mockImplementation((route: string) =>
      Promise.resolve(
        route.includes("q=none")
          ? { items: [], total: 0, pageSize: 30 }
          : response(route),
      ),
    );
    mount(false);
    await screen.findByRole("button", { name: /fictional-builders/ });
    fireEvent.change(screen.getByRole("searchbox", { name: "Search rooms" }), {
      target: { value: "none" },
    });
    await screen.findByRole("button", { name: "Reset room filters" });
    fireEvent.click(screen.getByRole("button", { name: "Reset room filters" }));
    await screen.findByRole("button", { name: /fictional-builders/ });
    expect(
      (
        screen.getByRole("searchbox", {
          name: "Search rooms",
        }) as HTMLInputElement
      ).value,
    ).toBe("");
  });
});
describe("Channel mutations and private lifecycle", () => {
  it("creates only an explicitly chosen permitted room audience with a password", async () => {
    mount(false);
    const start = await screen.findByRole("button", { name: "Create room" });
    await waitFor(() =>
      expect((start as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(start);
    fireEvent.change(screen.getByLabelText(/Room name/), {
      target: { value: "fictional-new-room" },
    });
    const save = screen.getByRole("button", {
      name: "Save room change",
    }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Confirm your own password/), {
      target: { value: "Fictional-room-proof" },
    });
    fireEvent.submit(save.closest("form")!);
    await screen.findByText(/Room change saved with an audit entry/);
    expect(writes()[0]).toMatchObject([
      base,
      {
        body: {
          record: {
            name: "fictional-new-room",
            visibility: "private",
            teamId: null,
          },
          currentPassword: "Fictional-room-proof",
        },
      },
    ]);
  });
  it("prevents synchronous duplicate sends and focuses only a committed receipt", async () => {
    const pending = deferred<unknown>();
    apiMock.mockImplementation(
      (route: string, options?: { method?: string }) =>
        options?.method === "POST"
          ? pending.promise
          : Promise.resolve(response(route)),
    );
    mount();
    const form = await draft();
    act(() => {
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    expect(writes()).toHaveLength(1);
    expect(
      (screen.getByLabelText(/Message this room/) as HTMLTextAreaElement)
        .disabled,
    ).toBe(true);
    await act(async () => pending.resolve({ id: itemId }));
    expect(document.activeElement?.textContent).toBe(
      "Message sent to this room.",
    );
    expect(
      (screen.getByLabelText(/Message this room/) as HTMLTextAreaElement).value,
    ).toBe("");
  });
  it("preserves failed text and retries with the same idempotency key", async () => {
    let failed = true;
    apiMock.mockImplementation(
      (route: string, options?: { method?: string }) =>
        options?.method === "POST"
          ? failed
            ? Promise.reject(Error("Send not confirmed"))
            : Promise.resolve({ id: itemId })
          : Promise.resolve(response(route)),
    );
    mount();
    fireEvent.submit(await draft());
    const error = await screen.findByText("Send not confirmed");
    expect(document.activeElement).toBe(error.closest("p"));
    failed = false;
    fireEvent.submit(
      screen.getByLabelText(/Message this room/).closest("form")!,
    );
    await screen.findByText("Message sent to this room.");
    expect(writes()[0][1].idempotencyKey).toBe(writes()[1][1].idempotencyKey);
  });
  it("aborts pending sends on session clearing and rejects late success", async () => {
    const pending = deferred<unknown>();
    let signal: AbortSignal | undefined;
    apiMock.mockImplementation(
      (route: string, options?: { method?: string; signal?: AbortSignal }) => {
        if (options?.method === "POST") {
          signal = options.signal;
          return pending.promise;
        }
        return Promise.resolve(response(route));
      },
    );
    mount();
    fireEvent.submit(await draft());
    act(() => window.dispatchEvent(new Event("gdg:session-cleared")));
    expect(signal?.aborted).toBe(true);
    await act(async () => pending.resolve({ id: itemId }));
    expect(screen.queryByText("Message sent to this room.")).toBeNull();
    expect(
      (await screen.findByLabelText(/Message this room/)).textContent,
    ).not.toContain("Fictional room draft");
  });
  it("cancels a pending room change on account replacement and ignores its failure", async () => {
    const pending = deferred<unknown>();
    let signal: AbortSignal | undefined;
    apiMock.mockImplementation(
      (route: string, options?: { method?: string; signal?: AbortSignal }) => {
        if (options?.method === "PATCH") {
          signal = options.signal;
          return pending.promise;
        }
        return Promise.resolve(response(route));
      },
    );
    const page = mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Edit room" }));
    fireEvent.change(screen.getByLabelText(/Room name/), {
      target: { value: "fictional-updated" },
    });
    const password = screen.getByLabelText(/Confirm your own password/);
    fireEvent.change(password, { target: { value: "Fictional-room-proof" } });
    fireEvent.submit(password.closest("form")!);
    expect((password as HTMLInputElement).value).toBe("");
    actor.id = otherId;
    page.rerender(
      <MemoryRouter
        initialEntries={["/admin/channels?room=" + id]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <main>
          <ChannelWorkspace />
        </main>
      </MemoryRouter>,
    );
    expect(signal?.aborted).toBe(true);
    await act(async () => pending.reject(Error("Old room change failed")));
    expect(screen.queryByText("Old room change failed")).toBeNull();
  });
  it("cancels pending writes on a realtime access denial", async () => {
    const pending = deferred<unknown>();
    let signal: AbortSignal | undefined;
    apiMock.mockImplementation(
      (route: string, options?: { method?: string; signal?: AbortSignal }) => {
        if (options?.method === "POST") {
          signal = options.signal;
          return pending.promise;
        }
        return Promise.resolve(response(route));
      },
    );
    mount();
    fireEvent.submit(await draft());
    act(() => live.denied());
    expect(signal?.aborted).toBe(true);
    await act(async () => pending.resolve({ id: itemId }));
    expect(screen.queryByText("Message sent to this room.")).toBeNull();
  });
  it("edits/pins/marks loaded history only through the current room's server result", async () => {
    mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Edit", exact: true }));
    const input = screen.getByLabelText(/Edit your message/);
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: "Fictional revised text" } });
    fireEvent.submit(input.closest("form")!);
    await screen.findByText("Message change saved.");
    expect(writes()[0][1].body).toEqual({
      action: "edit",
      revision: 1,
      message: "Fictional revised text",
    });
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Pin", exact: true }));
    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(writes()[1][1].body).toEqual({
      action: "pin",
      revision: 1,
      pinned: true,
    });
  });
  it("requires exact room confirmation and a password before archiving", async () => {
    mount();
    await ready();
    fireEvent.click(
      screen.getByRole("button", { name: "Archive", exact: true }),
    );
    const save = screen.getByRole("button", {
      name: "Save room change",
    }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Type the complete room name/), {
      target: { value: record.name },
    });
    fireEvent.change(screen.getByLabelText(/Confirm your own password/), {
      target: { value: "Fictional-room-proof" },
    });
    expect(save.disabled).toBe(false);
    fireEvent.submit(save.closest("form")!);
    await screen.findByText(/Room change saved with an audit entry/);
    expect(writes()[0][1].body).toMatchObject({
      action: "archive",
      revision: 1,
      confirmation: record.name,
    });
  });
  it("preserves an offline draft without sending automatically after reconnect", async () => {
    const online = vi.spyOn(navigator, "onLine", "get");
    online.mockReturnValue(true);
    mount();
    await draft();
    online.mockReturnValue(false);
    act(() => window.dispatchEvent(new Event("offline")));
    expect(
      (
        screen.getByRole("button", {
          name: "Send message",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    online.mockReturnValue(true);
    act(() => window.dispatchEvent(new Event("online")));
    expect(
      (screen.getByLabelText(/Message this room/) as HTMLTextAreaElement).value,
    ).toBe("Fictional room draft");
    expect(writes()).toHaveLength(0);
  });
  it("passes axe structural checks for room chat, message editing and room settings", async () => {
    const page = mount();
    await ready();
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
    fireEvent.click(screen.getByRole("button", { name: "Edit", exact: true }));
    await audit();
    fireEvent.click(screen.getByRole("button", { name: "Cancel edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit room" }));
    await audit();
  });
});
