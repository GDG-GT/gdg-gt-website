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
import TeamAnnouncements from "../../src/ui/teams/TeamAnnouncements";
import { ApiFailure } from "../../src/lib/api";
const { apiMock, safety } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  safety: { request: vi.fn((action: () => void) => action()) },
}));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: apiMock,
}));
vi.mock("@/hooks/useDraftGuard", () => ({
  useDraftGuard: vi.fn(),
  useNavigationSafety: () => safety,
}));
const post = {
    id: "fictional-post",
    title: "Fictional private post",
    message: "Fictional private announcement body",
    priority: "normal",
    is_pinned: false,
    is_published: false,
    scheduled_for: null,
    expires_at: null,
    revision: 1,
    deleted_at: null,
    created_at: "2026-11-05T12:00:00Z",
    authorName: "Fictional teammate",
    isRead: false,
    readCount: 0,
  },
  root = "/admin/teams/fictional-team/announcements";
type Options = {
  method?: string;
  signal: AbortSignal;
  body: Record<string, unknown>;
  idempotencyKey: string;
};
let current: Omit<typeof post, "deleted_at"> & { deleted_at: string | null },
  write: (path: string, options: Options) => Promise<unknown>;
const writes = () => apiMock.mock.calls.filter(([, options]) => options.method);
beforeEach(() => {
  current = { ...post };
  write = async () => ({ id: post.id, revision: 2 });
  apiMock
    .mockReset()
    .mockImplementation(async (path, options) =>
      options.method
        ? write(path, options)
        : path === root + "/" + post.id
          ? { record: { ...current }, canManage: true }
          : { items: [{ ...current }], total: 1, canManage: true },
    );
  safety.request.mockReset().mockImplementation((action) => action());
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: true,
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function view(teamId = "fictional-team") {
  return <TeamAnnouncements teamId={teamId} canManage />;
}
async function draft(existing = false) {
  await screen.findByText(post.message);
  fireEvent.click(
    screen.getByRole("button", {
      name: existing ? "Edit" : "Write announcement",
      exact: true,
    }),
  );
  const title = screen.getByLabelText(
    /^Announcement title/,
  ) as HTMLInputElement;
  fireEvent.change(title, { target: { value: "Fictional changed title" } });
  fireEvent.change(screen.getByLabelText(/^Message/), {
    target: { value: "Fictional changed body" },
  });
  return {
    title,
    save: screen.getByRole("button", {
      name: "Save private draft",
      exact: true,
    }),
  };
}
async function pending(
  action: "publish" | "unpublish" | "archive" | "restore",
) {
  await screen.findByText(post.message);
  fireEvent.click(
    screen.getByRole("button", {
      name: {
        publish: "Publish announcement",
        unpublish: "Return to draft",
        archive: "Archive announcement",
        restore: "Restore private draft",
      }[action],
      exact: true,
    }),
  );
  return {
    proof: screen.getByLabelText(/^Type announcement title/),
    confirm: screen.getByRole("button", { name: "Confirm", exact: true }),
  };
}
async function retry() {
  const button = await screen.findByRole("button", {
    name: "Retry original announcement operation",
  });
  expect((button as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(
    screen.getByRole("button", { name: "Recheck saved announcement values" }),
  );
  await screen.findByText("Inspect current saved announcement values", {
    exact: true,
  });
  expect(writes()).toHaveLength(1);
  fireEvent.click(button);
  await screen.findByText(/confirmed by the server/);
  expect(writes()).toHaveLength(2);
  expect(writes()[1][1].idempotencyKey).toBe(writes()[0][1].idempotencyKey);
  expect(writes()[1][1].body).toEqual(writes()[0][1].body);
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
describe("Team announcement mutations", () => {
  it("latches private draft saves and freezes input until the accepted response", async () => {
    const request = deferred<unknown>();
    write = () => request.promise;
    render(view());
    const { title, save } = await draft();
    fireEvent.click(save);
    fireEvent.submit(title.closest("form")!);
    expect(writes()).toHaveLength(1);
    expect(title.matches(":disabled")).toBe(true);
    await act(async () => request.resolve({ id: post.id, revision: 1 }));
    const receipt = await screen.findByText(/Announcement create confirmed/);
    expect(receipt.textContent).toContain(
      "private draft; publishing is separate",
    );
    await waitFor(() => expect(document.activeElement).toBe(receipt));
    expect(screen.queryByLabelText(/^Announcement title/)).toBeNull();
  });
  it.each(["publish", "unpublish", "archive", "restore"] as const)(
    "reviews %s and requires the exact current title before committing",
    async (action) => {
      if (action === "unpublish") current.is_published = true;
      if (action === "restore") current.deleted_at = "2026-11-05T12:00:00Z";
      render(view());
      const { proof, confirm } = await pending(action);
      expect(writes()).toHaveLength(0);
      expect((confirm as HTMLButtonElement).disabled).toBe(true);
      fireEvent.change(proof, { target: { value: "Wrong title" } });
      fireEvent.click(confirm);
      expect(writes()).toHaveLength(0);
      fireEvent.change(proof, { target: { value: post.title } });
      fireEvent.click(confirm);
      await screen.findByText(/confirmed by the server/);
      expect(writes()[0][1].body).toEqual({
        action,
        revision: 1,
        confirmation: post.title,
      });
    },
  );
  it("reviews a published edit with exact proposed fields and typed old title before hiding it", async () => {
    current.is_published = true;
    render(view());
    const { save } = await draft(true);
    fireEvent.click(save);
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain(
      "returns the published post to a private draft",
    );
    expect(dialog.textContent).toContain(post.message);
    expect(dialog.textContent).toContain("Fictional changed body");
    expect(writes()).toHaveLength(0);
    fireEvent.change(
      within(dialog).getByLabelText(/^Type announcement title/),
      { target: { value: post.title } },
    );
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Confirm published-post changes",
      }),
    );
    await screen.findByText(/Announcement update confirmed/);
    expect(writes()[0][1].body).toMatchObject({
      revision: 1,
      confirmation: post.title,
      record: {
        title: "Fictional changed title",
        message: "Fictional changed body",
      },
    });
  });
  it("returns canceled published-edit review focus to the actual save button", async () => {
    current.is_published = true;
    render(view());
    const { save } = await draft(true);
    fireEvent.click(save);
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Keep editing",
      }),
    );
    await waitFor(() => expect(document.activeElement).toBe(save));
    expect(writes()).toHaveLength(0);
  });
  it("reconciles an uncertain create through exact title lookup without creating another intent", async () => {
    let first = true;
    write = async () => {
      if (first) {
        first = false;
        throw new TypeError("Fictional lost create response");
      }
      return { id: post.id, revision: 1 };
    };
    render(view());
    fireEvent.click((await draft()).save);
    await retry();
    expect(
      apiMock.mock.calls.some(
        ([path, options]) =>
          !options.method &&
          path ===
            root +
              "?state=drafts&title=" +
              encodeURIComponent("Fictional changed title"),
      ),
    ).toBe(true);
  });
  it("reconciles an uncertain publication without making another audience intent", async () => {
    let first = true;
    write = async () => {
      if (first) {
        first = false;
        current = { ...current, is_published: true, revision: 2 };
        throw new ApiFailure(
          503,
          "UNAVAILABLE",
          "Fictional lost publication receipt",
        );
      }
      return { id: post.id, revision: 2 };
    };
    render(view());
    const { proof, confirm } = await pending("publish");
    fireEvent.change(proof, { target: { value: post.title } });
    fireEvent.click(confirm);
    await retry();
    expect(
      apiMock.mock.calls.some(
        ([path, options]) => !options.method && path === root + "/" + post.id,
      ),
    ).toBe(true);
  });
  it("replays accepted archive even when its refreshed current-view row has disappeared", async () => {
    let first = true;
    write = async () => {
      if (first) {
        first = false;
        current = {
          ...current,
          revision: 2,
          deleted_at: "2026-11-05T12:00:00Z",
        };
        throw new TypeError("Fictional lost archive receipt");
      }
      return { id: post.id, revision: 2 };
    };
    const original = apiMock.getMockImplementation()!;
    apiMock.mockImplementation((path, options) =>
      !options.method && path.includes("?page=") && current.deleted_at
        ? Promise.resolve({ items: [], total: 0, canManage: true })
        : original(path, options),
    );
    render(view());
    const { proof, confirm } = await pending("archive");
    fireEvent.change(proof, { target: { value: post.title } });
    fireEvent.click(confirm);
    await retry();
  });
  it("retains typed published-edit intent across a lost response and explicit identical retry", async () => {
    current.is_published = true;
    let first = true;
    write = async () => {
      if (first) {
        first = false;
        current = { ...current, is_published: false, revision: 2 };
        throw new TypeError("Fictional lost published edit receipt");
      }
      return { id: post.id, revision: 2 };
    };
    render(view());
    fireEvent.click((await draft(true)).save);
    fireEvent.change(screen.getByLabelText(/^Type announcement title/), {
      target: { value: post.title },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm published-post changes" }),
    );
    await retry();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it.each(["read", "pin"] as const)(
    "recovers an uncertain %s without automatically changing a post on reconnect",
    async (action) => {
      let first = true;
      write = async () => {
        if (first) {
          first = false;
          throw new TypeError("Fictional lost receipt");
        }
        return action === "read"
          ? { read: true }
          : { id: post.id, revision: 2 };
      };
      render(view());
      await screen.findByText(post.message);
      fireEvent.click(
        screen.getByRole("button", {
          name: action === "read" ? "Mark as read" : "Pin",
          exact: true,
        }),
      );
      await retry();
    },
  );
  it("blocks retry after 47 hours and reviews abandoning without another write", async () => {
    write = async () => {
      throw new TypeError("Fictional lost receipt");
    };
    render(view());
    fireEvent.click((await draft()).save);
    await screen.findByRole("button", {
      name: "Retry original announcement operation",
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Recheck saved announcement values" }),
    );
    await screen.findByText("Inspect current saved announcement values", {
      exact: true,
    });
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 47 * 60 * 60 * 1000);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Retry original announcement operation",
      }),
    );
    await screen.findByText(/safe retry window ended/);
    expect(writes()).toHaveLength(1);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Review abandoning announcement recovery",
      }),
    );
    expect(screen.getByRole("dialog").textContent).toContain(
      "No accepted change or queued notification is recalled",
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Abandon announcement recovery",
        exact: true,
      }),
    );
    expect(screen.queryByLabelText(/^Announcement title/)).toBeNull();
    expect(writes()).toHaveLength(1);
  });
  it.each([401, 403, 404])(
    "clears private draft and operation on denied write %s",
    async (status) => {
      write = async () => {
        throw new ApiFailure(status, "DENIED", "Fictional denied write");
      };
      render(view());
      fireEvent.click((await draft()).save);
      const access = await screen.findByRole("button", {
        name: "Recheck announcement access",
      });
      await waitFor(() => expect(document.activeElement).toBe(access));
      expect(screen.queryByText(post.message)).toBeNull();
      expect(screen.queryByLabelText(/^Announcement title/)).toBeNull();
    },
  );
  it("keeps retry disabled after failed recheck and clears private data after a denied recheck", async () => {
    write = async () => {
      throw new TypeError("Fictional lost response");
    };
    render(view());
    fireEvent.click((await draft()).save);
    await screen.findByRole("button", {
      name: "Retry original announcement operation",
    });
    let denied = false;
    const original = apiMock.getMockImplementation()!;
    apiMock.mockImplementation((path, options) =>
      path.includes("&title=")
        ? Promise.reject(
            new ApiFailure(
              denied ? 403 : 503,
              "UNAVAILABLE",
              "Fictional recheck failure",
            ),
          )
        : original(path, options),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Recheck saved announcement values" }),
    );
    await screen.findByText("Fictional recheck failure");
    expect(
      (
        screen.getByRole("button", {
          name: "Retry original announcement operation",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    denied = true;
    fireEvent.click(
      screen.getByRole("button", { name: "Recheck saved announcement values" }),
    );
    await screen.findByRole("button", { name: "Recheck announcement access" });
    expect(writes()).toHaveLength(1);
  });
  it("preserves rejected revision input and reviews closing before choosing a current action", async () => {
    write = async () => {
      throw new ApiFailure(409, "CONFLICT", "Fictional revision conflict");
    };
    render(view());
    const { title, save } = await draft(true);
    fireEvent.click(save);
    await screen.findByText(/saved announcement changed before/);
    expect(title.value).toBe("Fictional changed title");
    expect(title.matches(":disabled")).toBe(true);
    safety.request.mockImplementation(() => {});
    fireEvent.click(
      screen.getByRole("button", {
        name: "Review closing stale announcement action",
      }),
    );
    expect(safety.request).toHaveBeenCalledTimes(1);
    expect(writes()).toHaveLength(1);
  });
  it("fences a pending write after session invalidation", async () => {
    const request = deferred<unknown>();
    write = () => request.promise;
    render(view());
    fireEvent.click((await draft()).save);
    const signal = writes()[0][1].signal;
    fireEvent(window, new Event("gdg:session-cleared"));
    expect(signal.aborted).toBe(true);
    await act(async () => request.resolve({ id: post.id, revision: 1 }));
    expect(screen.queryByText(/confirmed by the server/)).toBeNull();
    expect(
      screen.getByRole("button", { name: "Recheck announcement access" }),
    ).toBeTruthy();
  });
  it("discards no draft automatically during offline/reconnect or canceled navigation", async () => {
    render(view());
    const { title } = await draft();
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    fireEvent(window, new Event("offline"));
    fireEvent.submit(title.closest("form")!);
    expect(writes()).toHaveLength(0);
    safety.request.mockImplementation(() => {});
    fireEvent.click(
      screen.getByRole("button", { name: "Cancel", exact: true }),
    );
    expect(safety.request).toHaveBeenCalledTimes(1);
    expect(title.value).toBe("Fictional changed title");
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    fireEvent(window, new Event("online"));
    expect(writes()).toHaveLength(0);
  });
  it("offers an explicit reset for a successful filtered empty announcement view", async () => {
    const original = apiMock.getMockImplementation()!;
    apiMock.mockImplementation((path, options) =>
      path.includes("state=archived")
        ? Promise.resolve({ items: [], total: 0, canManage: true })
        : original(path, options),
    );
    render(view());
    await screen.findByText(post.message);
    fireEvent.change(screen.getByLabelText(/^Announcement view/), {
      target: { value: "archived" },
    });
    await screen.findByText("No announcements in this view");
    fireEvent.click(
      screen.getByRole("button", { name: "Reset announcement view" }),
    );
    await screen.findByText(post.message);
    expect(writes()).toHaveLength(0);
  });
});
