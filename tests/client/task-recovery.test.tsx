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
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import TaskWorkspace from "../../src/ui/tasks/TaskWorkspace";
import { ApiFailure } from "../../src/lib/api";
const { apiMock, actor } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  actor: { id: "f1530000-0000-4000-8000-000000000001", role: "admin" },
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
const id = "f1530000-0000-4000-8000-000000000002",
  commentId = "f1530000-0000-4000-8000-000000000003",
  base = "/admin/communications/tasks";
const record = {
  id,
  title: "Fictional task",
  description: "Fictional task detail",
  team_id: null,
  assigned_to_id: actor.id,
  assigned_by_id: actor.id,
  assigneeName: "Fictional assignee",
  creatorName: "Fictional creator",
  due_date: "2030-01-02",
  status: "pending",
  priority: "medium",
  tags: ["Fictional"],
  revision: 1,
  archived_at: null,
  updated_at: "2026-10-26T12:00:00Z",
  actions: [
    "read",
    "update",
    "assign",
    "status",
    "comment",
    "delete",
    "restore",
  ],
  commentCount: 1,
};
const comment = {
  id: commentId,
  user_id: actor.id,
  authorName: "Fictional assignee",
  comment: "Fictional original comment",
  comment_type: "comment",
  revision: 1,
  deleted_at: null,
  created_at: "2026-10-26T12:00:00Z",
  updated_at: "2026-10-26T12:00:00Z",
  canEdit: true,
  canDelete: true,
};
const capabilities = {
  personalCreate: true,
  globalCreate: true,
  actorId: actor.id,
  teams: [],
};
function response(path: string) {
  return path === "/admin/access"
    ? { accessibleRoutes: [] }
    : path.endsWith("/capabilities")
      ? capabilities
      : path.includes("/comments")
        ? { items: [comment], nextCursor: null }
        : path.startsWith(base + "?")
          ? { items: [record], total: 1, pageSize: 30 }
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
        "/admin/communications?tab=tasks" + (selected ? "&task=" + id : ""),
      ]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <main id="workspace-content" tabIndex={-1}>
        <TaskWorkspace personal />
      </main>
    </MemoryRouter>,
  );
}
async function ready() {
  await screen.findByText(record.description);
}
async function edit() {
  await ready();
  fireEvent.click(
    screen.getByRole("button", { name: "Edit task", exact: true }),
  );
  const input = screen.getByLabelText(/Task title/);
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Save task changes",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
  return input;
}
beforeEach(() => {
  actor.id = "f1530000-0000-4000-8000-000000000001";
  actor.role = "admin";
  apiMock.mockReset();
  apiMock.mockImplementation((path: string, options?: { method?: string }) =>
    Promise.resolve(
      options?.method === "POST" ? { id, revision: 2 } : response(path),
    ),
  );
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("Task private reads and recovery", () => {
  it("shows initial skeletons and aborts permissions, navigation, inventory and detail reads", () => {
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
        .getByRole("status", { name: "Loading selected task" })
        .querySelector(".gt-skeleton"),
    ).toBeTruthy();
    page.unmount();
    expect(signals).toHaveLength(5);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });
  it("does not hide an inventory failure behind a successful selected-task read", async () => {
    apiMock.mockImplementation((path: string) =>
      path.startsWith(base + "?")
        ? Promise.reject(Error("Inventory interrupted"))
        : Promise.resolve(response(path)),
    );
    mount();
    await screen.findByText("Task inventory: Inventory interrupted");
    expect(screen.getByText(record.description)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Retry task inventory" }),
    ).toBeTruthy();
  });
  it("avoids perpetual loading after a failed initial inventory and retries with landmark focus", async () => {
    let failed = true;
    apiMock.mockImplementation((path: string) =>
      path.startsWith(base + "?") && failed
        ? Promise.reject(Error("Tasks interrupted"))
        : Promise.resolve(response(path)),
    );
    mount(false);
    await screen.findByText(/Task inventory is unavailable/);
    expect(
      screen.queryByRole("status", { name: "Loading authorized tasks" }),
    ).toBeNull();
    failed = false;
    fireEvent.click(
      screen.getByRole("button", { name: "Retry task inventory" }),
    );
    expect(document.activeElement?.id).toBe("workspace-content");
    await screen.findByRole("button", { name: "Open task Fictional task" });
  });
  it("does not reread the same task just because its first comment page loaded", async () => {
    mount();
    await ready();
    await act(async () => {});
    expect(
      apiMock.mock.calls.filter(([path]) => path === base + "/" + id),
    ).toHaveLength(1);
  });
  it("preserves edit fields and disables saving when a refreshed revision changes", async () => {
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
    fireEvent.change(input, { target: { value: "Preserved fictional draft" } });
    revision = 2;
    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));
    await screen.findByText(/This task changed while you were editing/);
    expect(
      (screen.getByLabelText(/Task title/) as HTMLInputElement).value,
    ).toBe("Preserved fictional draft");
    expect(
      (
        screen.getByRole("button", {
          name: "Save task changes",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
  it("uses current action grants after refresh and preserves fields when editing authority disappears", async () => {
    let allowed = true;
    apiMock.mockImplementation((path: string) =>
      Promise.resolve(
        path === base + "/" + id
          ? {
              record: {
                ...record,
                actions: allowed ? record.actions : ["read"],
              },
            }
          : response(path),
      ),
    );
    mount();
    await edit();
    allowed = false;
    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));
    await screen.findByText(
      /This action is unavailable with the current scope/,
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Save task changes",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
  it("clears details and cancels writes after a denied refresh", async () => {
    mount();
    await edit();
    apiMock.mockImplementation((path: string) =>
      path === base + "/" + id
        ? Promise.reject(new ApiFailure(404, "NOT_FOUND", "Task unavailable"))
        : Promise.resolve(response(path)),
    );
    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));
    await screen.findByText("Task details: Task unavailable");
    expect(screen.queryByText(record.description)).toBeNull();
    expect(screen.queryByLabelText(/Task title/)).toBeNull();
    expect(screen.queryByText(comment.comment)).toBeNull();
  });
  it("resets filtered empty inventory rather than leaving an unusable blank view", async () => {
    apiMock.mockImplementation((path: string) =>
      Promise.resolve(
        path.includes("q=none")
          ? { items: [], total: 0, pageSize: 30 }
          : response(path),
      ),
    );
    mount(false);
    await screen.findByRole("button", { name: "Open task Fictional task" });
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search task titles" }),
      { target: { value: "none" } },
    );
    await screen.findByRole("heading", { name: "No tasks in this view" });
    fireEvent.click(screen.getByRole("button", { name: "Reset task filters" }));
    await screen.findByRole("button", { name: "Open task Fictional task" });
    expect(
      (
        screen.getByRole("searchbox", {
          name: "Search task titles",
        }) as HTMLInputElement
      ).value,
    ).toBe("");
  });
});
describe("Task writes, comments and private lifecycle", () => {
  it("refreshes displayed older comment pages so remote removals erase retained text", async () => {
    let removed = false;
    const old = {
      ...comment,
      id: "f1530000-0000-4000-8000-000000000004",
      comment: "Fictional older private comment",
      created_at: "2026-10-25T12:00:00Z",
    };
    apiMock.mockImplementation((path: string) =>
      Promise.resolve(
        path.includes("/comments?")
          ? {
              items: [
                {
                  ...old,
                  ...(removed
                    ? {
                        comment: "",
                        deleted_at: "2026-10-26T12:30:00Z",
                        revision: 2,
                        canEdit: false,
                        canDelete: false,
                      }
                    : {}),
                },
              ],
              nextCursor: null,
            }
          : path.endsWith("/comments")
            ? {
                items: [comment],
                nextCursor: {
                  before: comment.created_at,
                  beforeId: comment.id,
                },
              }
            : response(path),
      ),
    );
    mount();
    await ready();
    fireEvent.click(
      screen.getByRole("button", { name: "Load earlier comments" }),
    );
    const text = await screen.findByText(old.comment);
    fireEvent.click(
      within(text.closest("li")!).getByRole("button", { name: "Edit comment" }),
    );
    fireEvent.change(screen.getByLabelText(/Edit your comment/), {
      target: { value: "Preserve older edit" },
    });
    removed = true;
    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));
    await screen.findByText("Comment removed.");
    expect(screen.queryByText(old.comment)).toBeNull();
    expect(
      (screen.getByLabelText(/Edit your comment/) as HTMLTextAreaElement).value,
    ).toBe("Preserve older edit");
    expect(
      (
        screen.getByRole("button", {
          name: "Save comment",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
  it("freezes editor fields and duplicate submits, then focuses a committed task receipt", async () => {
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
    expect(document.activeElement?.textContent).toBe("Task changes saved.");
  });
  it("retains the same task request key across an uncertain failure and explicit retry", async () => {
    let failed = true;
    apiMock.mockImplementation((path: string, options?: { method?: string }) =>
      options?.method === "POST"
        ? failed
          ? Promise.reject(Error("Save not confirmed"))
          : Promise.resolve({ id })
        : Promise.resolve(response(path)),
    );
    mount();
    const input = await edit();
    fireEvent.change(input, { target: { value: "Fictional changed title" } });
    fireEvent.submit(input.closest("form")!);
    const error = await screen.findByRole("alert");
    expect(document.activeElement).toBe(error);
    failed = false;
    fireEvent.submit(input.closest("form")!);
    await screen.findByText("Task changes saved.");
    expect(writes()[0][1].idempotencyKey).toBe(writes()[1][1].idempotencyKey);
  });
  it("aborts pending task writes and ignores late success when the session clears", async () => {
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
    expect(screen.queryByText("Task changes saved.")).toBeNull();
    expect(screen.queryByLabelText(/Task title/)).toBeNull();
  });
  it("clears the reassignment password at request start and requires the exact task title", async () => {
    const pending = deferred<unknown>();
    apiMock.mockImplementation((path: string, options?: { method?: string }) =>
      options?.method === "POST"
        ? pending.promise
        : Promise.resolve(response(path)),
    );
    mount();
    await ready();
    fireEvent.click(
      screen.getByRole("button", { name: "Reassign", exact: true }),
    );
    const confirm = screen.getByLabelText(/Type “Fictional task” to confirm/),
      password = screen.getByLabelText(/current password/i);
    expect(
      (
        screen.getByRole("button", {
          name: "Save task changes",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.change(screen.getByLabelText(/New assignee/), {
      target: { value: "fictional-assignee@example.test" },
    });
    fireEvent.change(confirm, { target: { value: record.title } });
    fireEvent.change(password, { target: { value: "Fictional-task-proof" } });
    fireEvent.submit(password.closest("form")!);
    expect((password as HTMLInputElement).value).toBe("");
    expect(writes()[0][1].body).toMatchObject({
      action: "assign",
      confirmation: record.title,
      currentPassword: "Fictional-task-proof",
    });
    await act(async () => pending.resolve({ id }));
  });
  it("posts a comment once and focuses its committed receipt", async () => {
    mount();
    await ready();
    const input = screen.getByLabelText(/Add a comment/);
    fireEvent.change(input, { target: { value: "Fictional new comment" } });
    const form = input.closest("form")!;
    act(() => {
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    await screen.findByText("Comment posted.");
    expect(writes()).toHaveLength(1);
    expect(document.activeElement?.textContent).toBe("Comment posted.");
  });
  it("preserves a comment edit and disables it when its revision changes", async () => {
    let revision = 1;
    apiMock.mockImplementation((path: string) =>
      Promise.resolve(
        path.includes("/comments")
          ? { items: [{ ...comment, revision }], nextCursor: null }
          : response(path),
      ),
    );
    mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Edit comment" }));
    const input = screen.getByLabelText(/Edit your comment/);
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, {
      target: { value: "Preserve this fictional comment" },
    });
    revision = 2;
    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));
    await screen.findByText(/This comment changed or was removed/);
    expect((input as HTMLTextAreaElement).value).toBe(
      "Preserve this fictional comment",
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Save comment",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
  it("replaces a removed comment with a retained placeholder only after server success", async () => {
    mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Remove comment" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm removal" }));
    await screen.findByText("Comment removed; its audit trail is retained.");
    expect(writes()[0][1].body).toEqual({ action: "delete", revision: 1 });
    expect(document.activeElement?.textContent).toBe(
      "Comment removed; its audit trail is retained.",
    );
  });
  it("preserves offline task input and never submits on reconnect", async () => {
    const online = vi.spyOn(navigator, "onLine", "get");
    online.mockReturnValue(true);
    mount();
    const input = await edit();
    fireEvent.change(input, { target: { value: "Fictional offline draft" } });
    online.mockReturnValue(false);
    act(() => window.dispatchEvent(new Event("offline")));
    expect(
      (
        screen.getByRole("button", {
          name: "Save task changes",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    online.mockReturnValue(true);
    act(() => window.dispatchEvent(new Event("online")));
    expect((input as HTMLInputElement).value).toBe("Fictional offline draft");
    expect(writes()).toHaveLength(0);
  });
  it("clears comment input and fences a late comment after account replacement", async () => {
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
    const page = mount();
    await ready();
    const input = screen.getByLabelText(/Add a comment/);
    fireEvent.change(input, { target: { value: "Fictional private input" } });
    fireEvent.submit(input.closest("form")!);
    actor.id = commentId;
    page.rerender(
      <MemoryRouter
        initialEntries={["/admin/communications?task=" + id]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <main>
          <TaskWorkspace personal />
        </main>
      </MemoryRouter>,
    );
    expect(signal?.aborted).toBe(true);
    await act(async () => pending.reject(Error("Old private comment failed")));
    expect(screen.queryByText("Old private comment failed")).toBeNull();
    expect(
      (await screen.findByLabelText(/Add a comment/)).textContent,
    ).not.toContain("Fictional private input");
  });
  it("passes axe structural checks for task detail, comments and task editing", async () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Edit task" }));
    await audit();
  });
});
