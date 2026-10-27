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
import WhiteboardWorkspace from "../../src/ui/whiteboards/WhiteboardWorkspace";
import { ApiFailure } from "../../src/lib/api";
const { apiMock, downloadMock, actor, live, canvas } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  downloadMock: vi.fn(),
  actor: { id: "f1550000-0000-4000-8000-000000000001", role: "admin" },
  live: { refresh: () => {}, denied: () => {} },
  canvas: { change: (_document: unknown) => {} },
}));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: apiMock,
}));
vi.mock("@/contexts/AdminContext", () => ({
  useAdmin: () => ({ currentAdmin: actor }),
}));
vi.mock("@/hooks/useDraftGuard", () => ({ useDraftGuard: vi.fn() }));
vi.mock("@/hooks/useScopedRealtime", () => ({
  useScopedRealtime: (
    _scope: unknown,
    refresh: () => void,
    deny: () => void,
  ) => {
    live.refresh = refresh;
    live.denied = deny;
    return "live";
  },
}));
vi.mock("../../src/ui/whiteboards/types", async (original) => ({
  ...(await original<typeof import("../../src/ui/whiteboards/types")>()),
  downloadBoard: downloadMock,
}));
vi.mock("../../src/ui/whiteboards/BoardCanvas", () => ({
  default: ({
    readOnly,
    onChange,
  }: {
    readOnly: boolean;
    onChange: (doc: unknown) => void;
  }) => {
    canvas.change = onChange;
    return (
      <section aria-label="Drawing adapter">
        <button
          disabled={readOnly}
          onClick={() =>
            onChange({
              elements: [],
              appState: { viewBackgroundColor: "#abc" },
            })
          }
        >
          Draw fictional shape
        </button>
        <button
          disabled={readOnly}
          onClick={() =>
            onChange({
              elements: [],
              appState: { viewBackgroundColor: "#def" },
            })
          }
        >
          Continue fictional drawing
        </button>
      </section>
    );
  },
}));
const id = "f1550000-0000-4000-8000-000000000002",
  other = "f1550000-0000-4000-8000-000000000003",
  base = "/admin/whiteboards",
  path = base + "/" + id;
const scene = { elements: [], appState: { viewBackgroundColor: "#f2f3f5" } };
const board = {
  id,
  name: "Fictional planning board",
  team_id: null,
  version: 1,
  created_by: actor.id,
  updated_at: "2026-10-27T12:00:00Z",
  deleted_at: null,
  document: scene,
};
const actions = ["read", "export", "update", "manage", "delete", "restore"],
  opened = { record: board, actions };
const capabilities = {
  globalCreate: true,
  teams: [{ id: other, name: "Fictional team" }],
};
const member = {
  user_id: other,
  role: "viewer",
  user: {
    display_name: "Fictional collaborator",
    email: "fictional-board-reader@example.test",
  },
};
function response(p: string) {
  return p.endsWith("/capabilities")
    ? capabilities
    : p.includes("/collaborators")
      ? { items: [member], total: 1 }
      : p.endsWith("/export")
        ? { name: board.name, document: scene }
        : p.startsWith(base + "?")
          ? { items: [board], total: 1, pageSize: 30 }
          : opened;
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
function mount() {
  return render(
    <MemoryRouter>
      <main id="workspace-content" tabIndex={-1}>
        <WhiteboardWorkspace />
      </main>
    </MemoryRouter>,
  );
}
async function open() {
  fireEvent.click(
    await screen.findByRole("button", { name: "Open board " + board.name }),
  );
  await screen.findByRole("button", { name: "Draw fictional shape" });
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Export saved board",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
}
async function rename() {
  await open();
  fireEvent.click(screen.getByRole("button", { name: "Rename", exact: true }));
  const input = screen.getByLabelText(/Board name/);
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Confirm changes",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
  return input;
}
beforeEach(() => {
  actor.id = "f1550000-0000-4000-8000-000000000001";
  actor.role = "admin";
  downloadMock.mockReset();
  apiMock.mockReset();
  apiMock.mockImplementation((p: string, options?: { method?: string }) =>
    Promise.resolve(
      options?.method === "POST"
        ? { record: { ...board, version: 2, actions } }
        : response(p),
    ),
  );
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("Whiteboard private reads", () => {
  it("shows a directory skeleton and aborts pending directory and capability reads", () => {
    const pending = deferred<unknown>(),
      signals: AbortSignal[] = [];
    apiMock.mockImplementation(
      (_p: string, options: { signal?: AbortSignal }) => {
        if (options.signal) signals.push(options.signal);
        return pending.promise;
      },
    );
    const page = mount();
    expect(
      screen
        .getByRole("status", { name: "Loading authorized boards" })
        .querySelector(".gt-skeleton"),
    ).toBeTruthy();
    page.unmount();
    expect(signals).toHaveLength(2);
    expect(signals.every((s) => s.aborted)).toBe(true);
  });
  it("recovers a failed directory without showing perpetual loading or a false empty state", async () => {
    let failed = true;
    apiMock.mockImplementation((p: string) =>
      p.startsWith(base + "?") && failed
        ? Promise.reject(Error("Directory interrupted"))
        : Promise.resolve(response(p)),
    );
    mount();
    await screen.findByText(/Board directory is unavailable/);
    expect(
      screen.queryByRole("heading", { name: "No boards in this view" }),
    ).toBeNull();
    failed = false;
    fireEvent.click(
      screen.getByRole("button", { name: "Retry board directory" }),
    );
    expect(document.activeElement?.id).toBe("workspace-content");
    await screen.findByRole("button", { name: "Open board " + board.name });
  });
  it("retains an authorized timestamped snapshot after temporary directory failure", async () => {
    let failed = false;
    apiMock.mockImplementation((p: string) =>
      p.startsWith(base + "?") && failed
        ? Promise.reject(Error("Refresh interrupted"))
        : Promise.resolve(response(p)),
    );
    mount();
    await screen.findByRole("button", { name: "Open board " + board.name });
    failed = true;
    act(() => window.dispatchEvent(new Event("gdg:notifications-updated")));
    await screen.findByText(/Directory may be out of date/);
    expect(
      screen.getByRole("button", { name: "Open board " + board.name }),
    ).toBeTruthy();
  });
  it("resets filtered empty directory results", async () => {
    apiMock.mockImplementation((p: string) =>
      Promise.resolve(
        p.includes("q=none")
          ? { items: [], total: 0, pageSize: 30 }
          : response(p),
      ),
    );
    mount();
    await screen.findByRole("button", { name: "Open board " + board.name });
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search board names" }),
      { target: { value: "none" } },
    );
    await screen.findByRole("heading", { name: "No boards in this view" });
    fireEvent.click(
      screen.getByRole("button", { name: "Reset board filters" }),
    );
    await screen.findByRole("button", { name: "Open board " + board.name });
  });
  it("applies permission loss even when the board version stays unchanged", async () => {
    let allowed = true;
    apiMock.mockImplementation((p: string) =>
      Promise.resolve(
        p === path
          ? { ...opened, actions: allowed ? actions : ["read", "export"] }
          : response(p),
      ),
    );
    mount();
    await open();
    allowed = false;
    act(() => live.refresh());
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Draw fictional shape",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true),
    );
    expect(
      screen.queryByRole("button", { name: "Rename", exact: true }),
    ).toBeNull();
  });
  it("erases drawings, details and staged private sharing after access denial", async () => {
    mount();
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Add collaborator" }));
    fireEvent.change(screen.getByLabelText(/Exact chapter account email/), {
      target: { value: member.user.email },
    });
    apiMock.mockImplementation((p: string) =>
      p === path
        ? Promise.reject(new ApiFailure(404, "NOT_FOUND", "Board unavailable"))
        : Promise.resolve(response(p)),
    );
    act(() => live.refresh());
    await screen.findByText("Board details: Board unavailable");
    expect(screen.queryByLabelText(/Exact chapter account email/)).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Draw fictional shape" }),
    ).toBeNull();
  });
  it("keeps collaborator errors independent and retries the failed collaborator request", async () => {
    let failed = true;
    apiMock.mockImplementation((p: string) =>
      p.includes("/collaborators") && failed
        ? Promise.reject(Error("Members interrupted"))
        : Promise.resolve(response(p)),
    );
    mount();
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Board access" }));
    await screen.findByText("Collaborators: Members interrupted");
    failed = false;
    fireEvent.click(
      screen.getByRole("button", { name: "Retry collaborators" }),
    );
    await screen.findByText(member.user.display_name);
    expect(
      apiMock.mock.calls.filter(([p]) => p.includes("/collaborators")),
    ).toHaveLength(2);
  });
  it("cancels a collaborator read when its panel is closed", async () => {
    const pending = deferred<unknown>();
    let signal: AbortSignal | undefined;
    apiMock.mockImplementation(
      (p: string, options?: { signal?: AbortSignal }) => {
        if (p.includes("/collaborators")) {
          signal = options?.signal;
          return pending.promise;
        }
        return Promise.resolve(response(p));
      },
    );
    mount();
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Board access" }));
    expect(
      screen.getByRole("status", { name: "Loading board collaborators" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Board access" }));
    expect(signal?.aborted).toBe(true);
    await act(async () => pending.resolve({ items: [member], total: 1 }));
    expect(screen.queryByText(member.user.display_name)).toBeNull();
  });
});
describe("Whiteboard saves and private operations", () => {
  it("autosaves drawing changes after the pause and saves newer input against the accepted version", async () => {
    const pending = deferred<unknown>();
    let submitted = 0;
    apiMock.mockImplementation((p: string, options?: { method?: string }) =>
      options?.method === "POST"
        ? ++submitted === 1
          ? pending.promise
          : Promise.resolve({ record: { ...board, version: 3 } })
        : Promise.resolve(response(p)),
    );
    mount();
    await open();
    fireEvent.click(
      screen.getByRole("button", { name: "Draw fictional shape" }),
    );
    await waitFor(() => expect(writes()).toHaveLength(1), { timeout: 2000 });
    fireEvent.click(
      screen.getByRole("button", { name: "Continue fictional drawing" }),
    );
    await act(async () =>
      pending.resolve({
        record: { ...board, version: 2, updated_at: "2026-10-27T12:01:00Z" },
      }),
    );
    await waitFor(() => expect(writes()).toHaveLength(2), { timeout: 2000 });
    expect(writes()[1][1].body).toMatchObject({
      version: 2,
      updatedAt: "2026-10-27T12:01:00Z",
      document: { appState: { viewBackgroundColor: "#def" } },
    });
    expect(writes()[0][1].idempotencyKey).not.toBe(
      writes()[1][1].idempotencyKey,
    );
    await screen.findByText("Saved", { exact: true });
  });
  it("ignores an old editor callback after a newer remote scene replaces its canvas", async () => {
    let version = 1;
    apiMock.mockImplementation((p: string) =>
      Promise.resolve(
        p === path ? { ...opened, record: { ...board, version } } : response(p),
      ),
    );
    mount();
    await open();
    const staleChange = canvas.change;
    version = 2;
    act(() => live.refresh());
    await screen.findByText(/· Version 2/);
    act(() =>
      staleChange({ elements: [], appState: { viewBackgroundColor: "#abc" } }),
    );
    expect(screen.queryByText("Unsaved changes", { exact: true })).toBeNull();
    expect(
      (screen.getByRole("button", { name: "Save now" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(writes()).toHaveLength(0);
  });
  it("focuses the committed creation receipt after selecting the newly created board", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "New board" }));
    const input = screen.getByLabelText(/Board name/);
    fireEvent.change(input, { target: { value: "Fictional new board" } });
    fireEvent.submit(input.closest("form")!);
    await screen.findByText("Board changes saved.");
    expect(document.activeElement?.textContent).toBe("Board changes saved.");
    expect(writes()).toHaveLength(1);
    expect(writes()[0][1].body).toEqual({
      name: "Fictional new board",
      teamId: null,
    });
  });
  it("freezes metadata and suppresses duplicate rename submits", async () => {
    const pending = deferred<unknown>();
    apiMock.mockImplementation((p: string, options?: { method?: string }) =>
      options?.method === "POST"
        ? pending.promise
        : Promise.resolve(response(p)),
    );
    mount();
    const input = await rename(),
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
    await act(async () =>
      pending.resolve({ record: { ...board, version: 2 } }),
    );
    await screen.findByText("Board changes saved.");
    expect(document.activeElement?.textContent).toBe("Board changes saved.");
  });
  it("keeps an unchanged metadata retry key after an uncertain response", async () => {
    let failed = true;
    apiMock.mockImplementation((p: string, options?: { method?: string }) =>
      options?.method === "POST"
        ? failed
          ? Promise.reject(Error("Rename not confirmed"))
          : Promise.resolve({ record: { ...board, version: 2 } })
        : Promise.resolve(response(p)),
    );
    mount();
    const input = await rename();
    fireEvent.submit(input.closest("form")!);
    await screen.findByText(/Rename not confirmed/);
    failed = false;
    fireEvent.submit(input.closest("form")!);
    await screen.findByText("Board changes saved.");
    expect(writes()[0][1].idempotencyKey).toBe(writes()[1][1].idempotencyKey);
  });
  it("clears access-change passwords at request start and aborts late results on sign-out", async () => {
    const pending = deferred<unknown>();
    let signal: AbortSignal | undefined;
    apiMock.mockImplementation(
      (p: string, options?: { method?: string; signal?: AbortSignal }) => {
        if (options?.method === "POST") {
          signal = options.signal;
          return pending.promise;
        }
        return Promise.resolve(response(p));
      },
    );
    mount();
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Add collaborator" }));
    fireEvent.change(screen.getByLabelText(/Exact chapter account email/), {
      target: { value: member.user.email },
    });
    const password = screen.getByLabelText(/Your current password/);
    fireEvent.change(password, { target: { value: "Fictional-board-proof" } });
    fireEvent.submit(password.closest("form")!);
    expect((password as HTMLInputElement).value).toBe("");
    expect(writes()[0][1].body.currentPassword).toBe("Fictional-board-proof");
    act(() => window.dispatchEvent(new Event("gdg:session-cleared")));
    expect(signal?.aborted).toBe(true);
    await act(async () => pending.resolve({ record: board }));
    expect(screen.queryByText("Board changes saved.")).toBeNull();
    expect(screen.queryByLabelText(/Exact chapter account email/)).toBeNull();
  });
  it("requires exact-title confirmation even for direct archive submits", async () => {
    mount();
    await open();
    fireEvent.click(
      screen.getByRole("button", { name: "Archive", exact: true }),
    );
    const input = screen.getByLabelText(
      /Type “Fictional planning board” to confirm/,
    );
    fireEvent.submit(input.closest("form")!);
    expect(writes()).toHaveLength(0);
    fireEvent.change(input, { target: { value: board.name } });
    fireEvent.submit(input.closest("form")!);
    await screen.findByText("Board changes saved.");
    expect(writes()[0][1].body.action).toBe("archive");
  });
  it("saves a drawing once and keeps its request key across an uncertain failure", async () => {
    let failed = true;
    apiMock.mockImplementation((p: string, options?: { method?: string }) =>
      options?.method === "POST"
        ? failed
          ? Promise.reject(Error("Drawing not confirmed"))
          : Promise.resolve({ record: { ...board, version: 2 } })
        : Promise.resolve(response(p)),
    );
    mount();
    await open();
    fireEvent.click(
      screen.getByRole("button", { name: "Draw fictional shape" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save now" }));
    await screen.findByText(/Drawing not confirmed/);
    failed = false;
    fireEvent.click(screen.getByRole("button", { name: "Save now" }));
    await waitFor(() =>
      expect(screen.getByText("Saved", { exact: true })).toBeTruthy(),
    );
    expect(writes()).toHaveLength(2);
    expect(writes()[0][1].idempotencyKey).toBe(writes()[1][1].idempotencyKey);
    expect(writes()[0][1].body.document.appState.viewBackgroundColor).toBe(
      "#abc",
    );
  });
  it("retains newer drawing input while an older drawing save is in flight", async () => {
    const pending = deferred<unknown>();
    apiMock.mockImplementation((p: string, options?: { method?: string }) =>
      options?.method === "POST"
        ? pending.promise
        : Promise.resolve(response(p)),
    );
    mount();
    await open();
    fireEvent.click(
      screen.getByRole("button", { name: "Draw fictional shape" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save now" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Continue fictional drawing" }),
    );
    await act(async () =>
      pending.resolve({ record: { ...board, version: 2 } }),
    );
    expect(screen.getByText("Unsaved changes", { exact: true })).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Save now" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    expect(writes()[0][1].body.document.appState.viewBackgroundColor).toBe(
      "#abc",
    );
  });
  it("preserves a conflicting drawing for local export and locks subsequent saves", async () => {
    let version = 1;
    apiMock.mockImplementation((p: string) =>
      Promise.resolve(
        p === path ? { ...opened, record: { ...board, version } } : response(p),
      ),
    );
    mount();
    await open();
    fireEvent.click(
      screen.getByRole("button", { name: "Draw fictional shape" }),
    );
    version = 2;
    act(() => live.refresh());
    await screen.findByRole("heading", {
      name: "Another save changed this board",
    });
    expect(
      (screen.getByRole("button", { name: "Save now" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Download my unsaved copy" }),
    );
    expect(downloadMock.mock.calls[0][1].appState.viewBackgroundColor).toBe(
      "#abc",
    );
    expect(writes()).toHaveLength(0);
  });
  it("does not autosave a retained offline scene on reconnect without an explicit save", async () => {
    const online = vi.spyOn(navigator, "onLine", "get");
    online.mockReturnValue(true);
    mount();
    await open();
    online.mockReturnValue(false);
    act(() => window.dispatchEvent(new Event("offline")));
    fireEvent.click(
      screen.getByRole("button", { name: "Draw fictional shape" }),
    );
    online.mockReturnValue(true);
    act(() => window.dispatchEvent(new Event("online")));
    await new Promise((resolve) => setTimeout(resolve, 1250));
    expect(writes()).toHaveLength(0);
    expect(screen.getByText(/Autosave remains paused/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save now" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
  });
  it("aborts a pending scene save and ignores late failure after account replacement", async () => {
    const pending = deferred<unknown>();
    let signal: AbortSignal | undefined;
    apiMock.mockImplementation(
      (p: string, options?: { method?: string; signal?: AbortSignal }) => {
        if (options?.method === "POST") {
          signal = options.signal;
          return pending.promise;
        }
        return Promise.resolve(response(p));
      },
    );
    const page = mount();
    await open();
    fireEvent.click(
      screen.getByRole("button", { name: "Draw fictional shape" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save now" }));
    actor.id = other;
    page.rerender(
      <MemoryRouter>
        <main>
          <WhiteboardWorkspace />
        </main>
      </MemoryRouter>,
    );
    expect(signal?.aborted).toBe(true);
    await act(async () => pending.reject(Error("Old drawing save failed")));
    expect(screen.queryByText(/Old drawing save failed/)).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Draw fictional shape" }),
    ).toBeNull();
  });
  it("fences a late saved-board export after a denied private scope", async () => {
    const pending = deferred<unknown>();
    let signal: AbortSignal | undefined;
    apiMock.mockImplementation(
      (p: string, options?: { signal?: AbortSignal }) => {
        if (p.endsWith("/export")) {
          signal = options?.signal;
          return pending.promise;
        }
        return Promise.resolve(response(p));
      },
    );
    mount();
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Export saved board" }));
    act(() => live.denied());
    expect(signal?.aborted).toBe(true);
    await act(async () =>
      pending.resolve({ name: board.name, document: scene }),
    );
    expect(downloadMock).not.toHaveBeenCalled();
  });
  it("passes structural axe checks for the workspace shell, metadata and access forms", async () => {
    const page = mount();
    await open();
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
    fireEvent.click(
      screen.getByRole("button", { name: "Rename", exact: true }),
    );
    await audit();
    fireEvent.click(
      screen.getByRole("button", { name: "Cancel", exact: true }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add collaborator" }));
    await audit();
  });
});
