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
import AnnouncementWorkspace from "../../src/ui/communications/AnnouncementWorkspace";
import { ApiFailure } from "../../src/lib/api";
const { apiMock, actor, live } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  actor: { id: "f1540000-0000-4000-8000-000000000001", role: "admin" },
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
    refresh: () => void,
    denied: () => void,
  ) => {
    live.refresh = refresh;
    live.denied = denied;
    return "live";
  },
}));
const id = "f1540000-0000-4000-8000-000000000002",
  base = "/admin/communications/announcements";
const record = {
  id,
  title: "Fictional chapter update",
  message: "Fictional announcement body",
  priority: "medium",
  pinned: false,
  state: "Draft",
  revision: 1,
  audience: { type: "all" },
  scheduledFor: null,
  expiresAt: null,
  emailEnabled: false,
  publicationVersion: 0,
  canManage: true,
  canAcknowledge: false,
  isRead: false,
  authorName: "Fictional officer",
  updated_at: "2026-10-27T12:00:00Z",
  readCount: null,
  recipientCount: null,
  delivery: null,
};
const preview = {
  id: "f1540000-0000-4000-8000-000000000003",
  count: 1,
  expiresAt: "2099-01-01T00:00:00Z",
  sample: ["Fictional recipient"],
};
const capabilities = {
  canManage: true,
  teams: [
    { id: "f1540000-0000-4000-8000-000000000004", name: "Fictional team" },
  ],
};
function response(path: string) {
  return path.endsWith("/capabilities")
    ? capabilities
    : path.endsWith("/preview")
      ? preview
      : path.startsWith(base + "?")
        ? { items: [record], total: 1, pageSize: 30, canManage: true }
        : { record };
}
function deferred<T>() {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
const writes = () =>
  apiMock.mock.calls.filter(([, options]) => options?.method === "POST");
function mount(selected = true) {
  return render(
    <MemoryRouter
      initialEntries={[
        "/admin/communications?tab=announcements" +
          (selected ? "&announcement=" + id : ""),
      ]}
    >
      <main id="workspace-content" tabIndex={-1}>
        <AnnouncementWorkspace />
      </main>
    </MemoryRouter>,
  );
}
async function ready() {
  await screen.findByText(record.message);
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Edit draft",
          exact: true,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
}
async function edit() {
  await ready();
  fireEvent.click(
    screen.getByRole("button", { name: "Edit draft", exact: true }),
  );
  const input = screen.getByLabelText(/^Title/);
  await waitFor(() =>
    expect(
      (screen.getByRole("button", { name: "Save draft" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
  return input;
}
async function review() {
  await ready();
  fireEvent.click(
    screen.getByRole("button", { name: "Preview publication audience" }),
  );
  await screen.findByRole("heading", { name: "Confirm publication" });
}
function confirmation() {
  const title = screen.getByLabelText("Type announcement title to confirm", {
      exact: false,
    }),
    password = screen.getByLabelText("Current password", { exact: false });
  fireEvent.change(title, { target: { value: record.title } });
  fireEvent.change(password, {
    target: { value: "Fictional-announcement-proof" },
  });
  return { title, password, form: password.closest("form")! };
}
beforeEach(() => {
  actor.id = "f1540000-0000-4000-8000-000000000001";
  actor.role = "admin";
  apiMock.mockReset();
  apiMock.mockImplementation((path: string, options?: { method?: string }) =>
    Promise.resolve(
      options?.method === "POST" && !path.endsWith("/preview")
        ? { id, state: "Published" }
        : response(path),
    ),
  );
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("Announcement reads and private recovery", () => {
  it("shows skeletons and aborts capability, detail and delayed inventory reads", async () => {
    const pending = deferred<unknown>(),
      signals: AbortSignal[] = [];
    apiMock.mockImplementation(
      (_path: string, options: { signal?: AbortSignal }) => {
        if (options.signal) signals.push(options.signal);
        return pending.promise;
      },
    );
    const page = mount();
    expect(
      screen
        .getByRole("status", { name: "Loading selected announcement" })
        .querySelector(".gt-skeleton"),
    ).toBeTruthy();
    await waitFor(() => expect(signals).toHaveLength(3));
    page.unmount();
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });
  it("shows failed inventory as unavailable and recovers with landmark focus", async () => {
    let failed = true;
    apiMock.mockImplementation((path: string) =>
      path.startsWith(base + "?") && failed
        ? Promise.reject(Error("Inventory interrupted"))
        : Promise.resolve(response(path)),
    );
    mount(false);
    await screen.findByText(/Announcement inventory is unavailable/);
    expect(screen.queryByText("No announcements in this view")).toBeNull();
    failed = false;
    fireEvent.click(
      screen.getByRole("button", { name: "Retry announcement inventory" }),
    );
    expect(document.activeElement?.id).toBe("workspace-content");
    await screen.findByRole("button", {
      name: "Open announcement " + record.title,
    });
  });
  it("does not mask independent inventory and detail errors", async () => {
    apiMock.mockImplementation((path: string) =>
      path === base + "/" + id
        ? Promise.reject(Error("Detail interrupted"))
        : path.startsWith(base + "?")
          ? Promise.reject(Error("List interrupted"))
          : Promise.resolve(response(path)),
    );
    mount();
    await screen.findByText("Announcement details: Detail interrupted");
    await screen.findByText("Announcement inventory: List interrupted");
    expect(
      screen.getByText("This announcement is currently unavailable."),
    ).toBeTruthy();
  });
  it("retains a timestamped successful inventory after a temporary refresh failure", async () => {
    let failed = false;
    apiMock.mockImplementation((path: string) =>
      path.startsWith(base + "?") && failed
        ? Promise.reject(Error("Refresh interrupted"))
        : Promise.resolve(response(path)),
    );
    mount(false);
    await screen.findByRole("button", {
      name: "Open announcement " + record.title,
    });
    failed = true;
    act(() => live.refresh());
    await screen.findByText("Announcement inventory: Refresh interrupted");
    expect(
      screen.getByRole("button", { name: "Open announcement " + record.title }),
    ).toBeTruthy();
    expect(
      screen.getByText(/Announcement inventory may be out of date/),
    ).toBeTruthy();
  });
  it("preserves draft fields while a newer version disables saving", async () => {
    let revision = 1;
    apiMock.mockImplementation((path: string) =>
      Promise.resolve(
        path === base + "/" + id
          ? { record: { ...record, revision } }
          : response(path),
      ),
    );
    mount();
    const input = await edit();
    fireEvent.change(input, { target: { value: "Fictional unsaved edit" } });
    revision = 2;
    act(() => live.refresh());
    await screen.findByText(/This announcement changed/);
    expect((input as HTMLInputElement).value).toBe("Fictional unsaved edit");
    expect(
      (screen.getByRole("button", { name: "Save draft" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
  it("disables saving after the current record loses managing permission", async () => {
    let canManage = true;
    apiMock.mockImplementation((path: string) =>
      Promise.resolve(
        path === base + "/" + id
          ? { record: { ...record, canManage } }
          : response(path),
      ),
    );
    mount();
    await edit();
    canManage = false;
    act(() => live.refresh());
    await screen.findByText(/Saving is unavailable/);
    expect(
      (screen.getByRole("button", { name: "Save draft" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
  it("erases private draft fields after an access-denied refresh", async () => {
    mount();
    await edit();
    apiMock.mockImplementation((path: string) =>
      path === base + "/" + id
        ? Promise.reject(
            new ApiFailure(404, "NOT_FOUND", "Announcement unavailable"),
          )
        : Promise.resolve(response(path)),
    );
    act(() => live.refresh());
    await screen.findByText("Announcement details: Announcement unavailable");
    expect(screen.queryByLabelText(/^Title/)).toBeNull();
    expect(screen.queryByText(record.message)).toBeNull();
    expect(
      screen.queryByRole("status", { name: "Loading selected announcement" }),
    ).toBeNull();
  });
  it("resets a filtered empty announcement inventory", async () => {
    apiMock.mockImplementation((path: string) =>
      Promise.resolve(
        path.includes("q=none")
          ? { items: [], total: 0, pageSize: 30 }
          : response(path),
      ),
    );
    mount(false);
    await screen.findByRole("button", {
      name: "Open announcement " + record.title,
    });
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search announcements" }),
      { target: { value: "none" } },
    );
    await screen.findByRole("heading", { name: "No matching announcements" });
    fireEvent.click(
      screen.getByRole("button", { name: "Reset announcement filters" }),
    );
    await screen.findByRole("button", {
      name: "Open announcement " + record.title,
    });
    expect(
      (
        screen.getByRole("searchbox", {
          name: "Search announcements",
        }) as HTMLInputElement
      ).value,
    ).toBe("");
  });
});
describe("Announcement draft and publication lifecycle", () => {
  it("keeps the publication request key after an uncertain confirmation failure and password reentry", async () => {
    let failed = true;
    apiMock.mockImplementation((path: string) =>
      path.endsWith("/confirm")
        ? failed
          ? Promise.reject(Error("Publication not confirmed"))
          : Promise.resolve({ id, state: "Published" })
        : Promise.resolve(response(path)),
    );
    mount();
    await review();
    fireEvent.submit(confirmation().form);
    await screen.findByText("Publication not confirmed");
    failed = false;
    fireEvent.submit(confirmation().form);
    await screen.findByText(/Announcement published\./);
    const confirms = writes().filter(([path]) => path.endsWith("/confirm"));
    expect(confirms).toHaveLength(2);
    expect(confirms[0][1].idempotencyKey).toBe(confirms[1][1].idempotencyKey);
  });
  it("freezes fields and suppresses same-tick duplicate draft saves", async () => {
    const pending = deferred<unknown>();
    apiMock.mockImplementation((path: string, options?: { method?: string }) =>
      options?.method === "POST"
        ? pending.promise
        : Promise.resolve(response(path)),
    );
    mount();
    const input = await edit(),
      form = input.closest("form")!;
    act(() => {
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    expect(writes()).toHaveLength(1);
    expect((input as HTMLInputElement).disabled).toBe(true);
    await act(async () => pending.resolve({ id }));
    expect(document.activeElement?.textContent).toContain("Draft saved.");
  });
  it("retains the draft request key after an uncertain failure", async () => {
    let failed = true;
    apiMock.mockImplementation((path: string, options?: { method?: string }) =>
      options?.method === "POST"
        ? failed
          ? Promise.reject(Error("Draft not confirmed"))
          : Promise.resolve({ id })
        : Promise.resolve(response(path)),
    );
    mount();
    const input = await edit();
    fireEvent.submit(input.closest("form")!);
    await screen.findByText("Draft not confirmed");
    expect(document.activeElement?.textContent).toBe("Draft not confirmed");
    failed = false;
    fireEvent.submit(input.closest("form")!);
    await screen.findByText(/Draft saved\./);
    expect(writes()[0][1].idempotencyKey).toBe(writes()[1][1].idempotencyKey);
  });
  it("fences a late draft result when the session clears", async () => {
    const pending = deferred<unknown>();
    let signal: AbortSignal | undefined;
    apiMock.mockImplementation(
      (path: string, options?: { method?: string; signal?: AbortSignal }) => {
        if (options?.method === "POST") {
          signal = options.signal;
          return pending.promise;
        }
        return Promise.resolve(response(path));
      },
    );
    mount();
    const input = await edit();
    fireEvent.submit(input.closest("form")!);
    act(() => window.dispatchEvent(new Event("gdg:session-cleared")));
    expect(signal?.aborted).toBe(true);
    await act(async () => pending.resolve({ id }));
    expect(screen.queryByText(/Draft saved\./)).toBeNull();
    expect(screen.queryByLabelText(/^Title/)).toBeNull();
  });
  it("focuses the audience review and cancels a late preview on private denial", async () => {
    const pending = deferred<unknown>();
    let signal: AbortSignal | undefined;
    apiMock.mockImplementation(
      (path: string, options?: { method?: string; signal?: AbortSignal }) => {
        if (path.endsWith("/preview")) {
          signal = options?.signal;
          return pending.promise;
        }
        return Promise.resolve(response(path));
      },
    );
    mount();
    await ready();
    const button = screen.getByRole("button", {
      name: "Preview publication audience",
    });
    act(() => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(writes()).toHaveLength(1);
    act(() => live.denied());
    expect(signal?.aborted).toBe(true);
    await act(async () => pending.resolve(preview));
    expect(
      screen.queryByRole("heading", { name: "Confirm publication" }),
    ).toBeNull();
    expect(screen.queryByText(record.message)).toBeNull();
  });
  it("clears the publication password at request start and focuses a committed receipt", async () => {
    const pending = deferred<unknown>();
    apiMock.mockImplementation((path: string, options?: { method?: string }) =>
      path.endsWith("/confirm")
        ? pending.promise
        : Promise.resolve(response(path)),
    );
    mount();
    await review();
    expect(document.activeElement?.textContent).toBe("Confirm publication");
    const { password, form } = confirmation();
    fireEvent.submit(form);
    expect((password as HTMLInputElement).value).toBe("");
    expect(writes().at(-1)?.[1].body.currentPassword).toBe(
      "Fictional-announcement-proof",
    );
    await act(async () => pending.resolve({ id, state: "Published" }));
    expect(document.activeElement?.textContent).toContain(
      "Announcement published.",
    );
  });
  it("rejects an expired preview at submit time even before the clock tick rerenders", async () => {
    mount();
    await review();
    const { password, form } = confirmation();
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2100-01-01T00:00:00Z"));
    fireEvent.submit(form);
    await screen.findByText(
      "This audience preview expired. Cancel publication and request a new preview.",
    );
    expect((password as HTMLInputElement).value).toBe("");
    expect(writes().filter(([path]) => path.endsWith("/confirm"))).toHaveLength(
      0,
    );
  });
  it("cannot bypass the exact title requirement with a direct form submit", async () => {
    mount();
    await review();
    const { title, form } = confirmation();
    fireEvent.change(title, { target: { value: "wrong title" } });
    fireEvent.submit(form);
    expect(writes().filter(([path]) => path.endsWith("/confirm"))).toHaveLength(
      0,
    );
  });
  it("never auto-submits a preserved offline draft on reconnect", async () => {
    const online = vi.spyOn(navigator, "onLine", "get");
    online.mockReturnValue(true);
    mount();
    const input = await edit();
    fireEvent.change(input, { target: { value: "Fictional offline draft" } });
    online.mockReturnValue(false);
    act(() => window.dispatchEvent(new Event("offline")));
    expect(
      (screen.getByRole("button", { name: "Save draft" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    online.mockReturnValue(true);
    act(() => window.dispatchEvent(new Event("online")));
    expect((input as HTMLInputElement).value).toBe("Fictional offline draft");
    expect(writes()).toHaveLength(0);
  });
  it("fences a pending publication result after account replacement", async () => {
    const pending = deferred<unknown>();
    let signal: AbortSignal | undefined;
    apiMock.mockImplementation(
      (path: string, options?: { signal?: AbortSignal }) => {
        if (path.endsWith("/confirm")) {
          signal = options?.signal;
          return pending.promise;
        }
        return Promise.resolve(response(path));
      },
    );
    const page = mount();
    await review();
    fireEvent.submit(confirmation().form);
    actor.id = id;
    page.rerender(
      <MemoryRouter
        initialEntries={["/admin/communications?announcement=" + id]}
      >
        <main>
          <AnnouncementWorkspace />
        </main>
      </MemoryRouter>,
    );
    expect(signal?.aborted).toBe(true);
    await act(async () => pending.reject(Error("Old publication failed")));
    expect(screen.queryByText("Old publication failed")).toBeNull();
    expect(
      screen.queryByLabelText("Current password", { exact: false }),
    ).toBeNull();
  });
  it("requires a current exact-title archive confirmation", async () => {
    mount();
    await ready();
    fireEvent.click(
      screen.getByRole("button", { name: "Archive", exact: true }),
    );
    const input = screen.getByLabelText("Type announcement title to confirm", {
      exact: false,
    });
    expect(document.activeElement?.textContent).toBe("Archive announcement");
    fireEvent.submit(input.closest("form")!);
    expect(writes()).toHaveLength(0);
    fireEvent.change(input, { target: { value: record.title } });
    fireEvent.submit(input.closest("form")!);
    await screen.findByText("Announcement updated.");
    expect(writes()[0][1].body).toEqual({
      action: "archive",
      revision: 1,
      confirmation: record.title,
    });
  });
  it("passes structural axe checks for detail, audience confirmation and editing", async () => {
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
    await review();
    await audit();
    fireEvent.click(screen.getByRole("button", { name: "Cancel publication" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Edit draft", exact: true }),
    );
    await audit();
  });
});
