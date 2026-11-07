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
import DirectMessageWorkspace from "../../src/ui/communications/DirectMessageWorkspace";
import { ApiFailure } from "../../src/lib/api";
const { apiMock, actor, live } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  actor: { id: "f1510000-0000-4000-8000-000000000001", role: "team_member" },
  live: { refresh: () => {} },
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
  useScopedRealtime: (_scope: unknown, onChange: () => void) => {
    live.refresh = onChange;
    return "live";
  },
}));
const base = "/admin/communications/messages",
  threadId = "f1510000-0000-4000-8000-000000000002",
  itemId = "f1510000-0000-4000-8000-000000000003",
  other = "f1510000-0000-4000-8000-000000000004";
const thread = {
  id: threadId,
  subject: "Fictional conversation",
  revision: 1,
  created_at: "2026-10-26T12:00:00Z",
  updated_at: "2026-10-26T12:00:00Z",
  participant: true,
  participantA: actor.id,
  participantB: other,
  nameA: "Fictional sender",
  nameB: "Fictional recipient",
  archived: false,
  stateRevision: 1,
  unread: 1,
  canReply: true,
};
const message = {
  id: itemId,
  from_user_id: actor.id,
  authorName: "Fictional sender",
  message: "Fictional original message",
  revision: 1,
  deleted_at: null,
  created_at: "2026-10-26T12:00:00Z",
  updated_at: "2026-10-26T12:00:00Z",
  read_at: null,
  replyToId: null,
  replyPreview: null,
  own: true,
};
const listing = {
  items: [thread],
  total: 1,
  unread: 1,
  nextCursor: null,
  actorId: actor.id,
  canReview: false,
};
const history = { items: [message], nextCursor: null };
function response(path: string) {
  return path === base + "/review"
    ? { active: false, expiresAt: null }
    : path.includes("/history")
      ? history
      : path.startsWith(base + "?")
        ? listing
        : { record: thread };
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
      initialEntries={[
        "/admin/communications?tab=messages" +
          (selected ? "&thread=" + threadId : ""),
      ]}
    >
      <main id="workspace-content" tabIndex={-1}>
        <DirectMessageWorkspace personal />
      </main>
    </MemoryRouter>,
  );
}
const writes = () =>
  apiMock.mock.calls.filter(([, options]) => options?.method === "POST");
async function reply() {
  const input = await screen.findByLabelText(/Your reply/);
  fireEvent.change(input, { target: { value: "Fictional reply draft" } });
  return input.closest("form")!;
}
beforeEach(() => {
  actor.id = "f1510000-0000-4000-8000-000000000001";
  actor.role = "team_member";
  apiMock.mockReset();
  apiMock.mockImplementation((path: string, options?: { method?: string }) =>
    Promise.resolve(
      options?.method === "POST" ? { id: threadId } : response(path),
    ),
  );
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("Private conversation read recovery", () => {
  it("shows actual skeletons and aborts initial reads when the workspace unmounts", () => {
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
        .getByRole("status", { name: "Loading conversations" })
        .querySelector(".gt-skeleton"),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("status", { name: "Loading conversation" })
        .querySelector(".gt-skeleton"),
    ).toBeTruthy();
    page.unmount();
    expect(signals.length).toBeGreaterThan(0);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });
  it("shows independent inbox/conversation errors without a false empty or perpetual loading state", async () => {
    apiMock.mockRejectedValue(Error("Fictional read interrupted"));
    mount();
    await screen.findByText("Inbox: Fictional read interrupted");
    expect(
      screen.getByText("Conversation: Fictional read interrupted"),
    ).toBeTruthy();
    expect(screen.queryByText("You’re all caught up")).toBeNull();
    expect(
      screen.queryByRole("status", { name: "Loading conversation" }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Retry inbox" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Retry conversation" }),
    ).toBeTruthy();
  });
  it("retains a timestamped readable conversation after a failed live refresh", async () => {
    mount();
    await screen.findByText("Fictional original message");
    apiMock.mockRejectedValue(Error("Refresh interrupted"));
    act(() => live.refresh());
    await screen.findByText("Conversation: Refresh interrupted");
    expect(screen.getByText("Fictional original message")).toBeTruthy();
    expect(
      screen.getByText(/Conversation may be out of date. Last loaded/),
    ).toBeTruthy();
  });
  it("conceals prior private history after a denied refresh", async () => {
    mount();
    await screen.findByText("Fictional original message");
    apiMock.mockRejectedValue(
      new ApiFailure(404, "NOT_FOUND", "Conversation unavailable"),
    );
    act(() => live.refresh());
    await screen.findByText("Conversation: Conversation unavailable");
    expect(screen.queryByText("Fictional original message")).toBeNull();
    expect(screen.queryByLabelText(/Your reply/)).toBeNull();
  });
  it("fences a superseded inbox filter and ignores its late result", async () => {
    const pending = deferred<unknown>();
    let signal: AbortSignal | undefined;
    apiMock.mockImplementation(
      (path: string, options?: { signal?: AbortSignal }) => {
        if (path.includes("q=old")) {
          signal = options?.signal;
          return pending.promise;
        }
        return Promise.resolve(response(path));
      },
    );
    mount(false);
    await screen.findByRole("button", { name: /Fictional conversation/ });
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search conversation subjects" }),
      { target: { value: "old" } },
    );
    await waitFor(() => expect(signal).toBeTruthy());
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search conversation subjects" }),
      { target: { value: "new" } },
    );
    await screen.findByRole("button", { name: /Fictional conversation/ });
    expect(signal?.aborted).toBe(true);
    await act(async () =>
      pending.resolve({
        ...listing,
        items: [{ ...thread, subject: "Obsolete hidden thread" }],
      }),
    );
    expect(screen.queryByText("Obsolete hidden thread")).toBeNull();
  });
});
describe("Private conversation mutation lifecycle", () => {
  it("freezes duplicate reply submits and focuses the committed receipt", async () => {
    const pending = deferred<unknown>();
    apiMock.mockImplementation((path: string, options?: { method?: string }) =>
      options?.method === "POST"
        ? pending.promise
        : Promise.resolve(response(path)),
    );
    mount();
    const form = await reply();
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
      (screen.getByLabelText(/Your reply/) as HTMLTextAreaElement).disabled,
    ).toBe(true);
    await act(async () => pending.resolve({ id: threadId }));
    expect(document.activeElement?.textContent).toBe("Message sent.");
    expect(
      (screen.getByLabelText(/Your reply/) as HTMLTextAreaElement).value,
    ).toBe("");
  });
  it("retains failed reply text and reuses its key for explicit retry", async () => {
    let failed = true;
    apiMock.mockImplementation((path: string, options?: { method?: string }) =>
      options?.method === "POST"
        ? failed
          ? Promise.reject(Error("Send could not be confirmed"))
          : Promise.resolve({ id: threadId })
        : Promise.resolve(response(path)),
    );
    mount();
    fireEvent.submit(await reply());
    const error = await screen.findByRole("alert");
    expect(error.textContent).toContain("Send could not be confirmed");
    expect(document.activeElement).toBe(error);
    expect(
      (screen.getByLabelText(/Your reply/) as HTMLTextAreaElement).value,
    ).toBe("Fictional reply draft");
    failed = false;
    fireEvent.submit(screen.getByLabelText(/Your reply/).closest("form")!);
    await screen.findByText("Message sent.");
    expect(writes()[0][1].idempotencyKey).toBe(writes()[1][1].idempotencyKey);
  });
  it("aborts a pending send on session clear and ignores late success and errors", async () => {
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
    fireEvent.submit(await reply());
    act(() => window.dispatchEvent(new Event("gdg:session-cleared")));
    expect(signal?.aborted).toBe(true);
    await act(async () => pending.resolve({ id: threadId }));
    expect(screen.queryByText("Message sent.")).toBeNull();
    expect(screen.queryByText("Fictional original message")).toBeNull();
  });
  it("aborts an in-flight edit on account replacement and keeps late failures out of the new account", async () => {
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
    await screen.findByText("Fictional original message");
    fireEvent.click(screen.getByRole("button", { name: "Edit", exact: true }));
    const input = screen.getByLabelText(/Edit message/);
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: "Fictional edited draft" } });
    fireEvent.submit(input.closest("form")!);
    actor.id = other;
    page.rerender(
      <MemoryRouter
        initialEntries={["/admin/communications?thread=" + threadId]}
      >
        <main id="workspace-content">
          <DirectMessageWorkspace personal />
        </main>
      </MemoryRouter>,
    );
    expect(signal?.aborted).toBe(true);
    await act(async () => pending.reject(Error("Old private edit failed")));
    expect(screen.queryByText("Old private edit failed")).toBeNull();
    expect(screen.queryByLabelText(/Edit message/)).toBeNull();
  });
  it("removes/restores only through confirmed server results and focuses their receipt", async () => {
    mount();
    await screen.findByText("Fictional original message");
    fireEvent.click(
      screen.getByRole("button", { name: "Remove", exact: true }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Remove message", exact: true }),
    );
    await screen.findByText(
      "Message removed. You can restore it from its retained placeholder.",
    );
    expect(writes()[0][1].body).toEqual({ action: "delete", revision: 1 });
    expect(document.activeElement?.textContent).toContain("Message removed.");
  });
  it("marks only the loaded history read and archives only the current participant inbox", async () => {
    mount();
    await screen.findByText("Fictional original message");
    fireEvent.click(
      screen.getByRole("button", { name: "Mark loaded messages read" }),
    );
    await screen.findByText("Loaded messages marked as read.");
    expect(writes()[0][1].body).toEqual({ action: "read", throughId: itemId });
    fireEvent.click(screen.getByRole("button", { name: "Archive for me" }));
    await screen.findByText(
      "Archived for you. The other participant’s inbox is unchanged.",
    );
    expect(writes()[1][1].body).toEqual({ action: "archive", revision: 1 });
  });
  it("creates an exact-recipient conversation and focuses its initial editor", async () => {
    mount(false);
    fireEvent.click(screen.getByRole("button", { name: "New message" }));
    expect(document.activeElement?.textContent).toBe(
      "New private conversation",
    );
    fireEvent.change(screen.getByLabelText(/Recipient email/), {
      target: { value: "FICTIONAL@example.test" },
    });
    fireEvent.change(screen.getByLabelText(/Subject/), {
      target: { value: "Fictional subject" },
    });
    const input = screen.getByLabelText(/^Message/);
    fireEvent.change(input, { target: { value: "Fictional new text" } });
    fireEvent.submit(input.closest("form")!);
    await screen.findByText("Message sent.");
    expect(writes()[0]).toMatchObject([
      base,
      {
        body: {
          recipientEmail: "fictional@example.test",
          subject: "Fictional subject",
          message: "Fictional new text",
        },
      },
    ]);
  });
  it("clears the review password immediately and ignores a review granted after sign-out", async () => {
    actor.role = "super_admin";
    const pending = deferred<unknown>();
    let signal: AbortSignal | undefined;
    apiMock.mockImplementation(
      (path: string, options?: { method?: string; signal?: AbortSignal }) => {
        if (options?.method === "POST") {
          signal = options.signal;
          return pending.promise;
        }
        return Promise.resolve(
          path.startsWith(base + "?")
            ? { ...listing, canReview: true }
            : response(path),
        );
      },
    );
    mount(false);
    fireEvent.click(
      await screen.findByRole("button", { name: "Request review" }),
    );
    fireEvent.change(screen.getByLabelText(/Review reason/), {
      target: { value: "Fictional documented support review" },
    });
    const password = screen.getByLabelText(/Current password/);
    fireEvent.change(password, { target: { value: "Fictional-review-proof" } });
    fireEvent.submit(password.closest("form")!);
    expect((password as HTMLInputElement).value).toBe("");
    act(() => window.dispatchEvent(new Event("gdg:session-cleared")));
    expect(signal?.aborted).toBe(true);
    await act(async () =>
      pending.resolve({
        active: true,
        expiresAt: new Date(Date.now() + 300000).toISOString(),
      }),
    );
    expect(
      screen.queryByText(
        "Read-only review is active for five minutes. Reads are audited.",
      ),
    ).toBeNull();
  });
  it("preserves offline text and never sends on reconnect", async () => {
    const online = vi.spyOn(navigator, "onLine", "get");
    online.mockReturnValue(true);
    mount();
    await reply();
    online.mockReturnValue(false);
    act(() => window.dispatchEvent(new Event("offline")));
    expect(
      (screen.getByRole("button", { name: "Send reply" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(screen.getByText(/You are offline. Unsent text stays/)).toBeTruthy();
    online.mockReturnValue(true);
    act(() => window.dispatchEvent(new Event("online")));
    expect(
      (screen.getByLabelText(/Your reply/) as HTMLTextAreaElement).value,
    ).toBe("Fictional reply draft");
    expect(writes()).toHaveLength(0);
  });
  it("passes structural axe checks for a conversation and message edit controls", async () => {
    const page = mount();
    await screen.findByText("Fictional original message");
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
  });
});
