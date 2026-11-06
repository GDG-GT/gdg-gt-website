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
import TeamInvitations from "../../src/ui/teams/TeamInvitations";
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
const invite = {
    id: "fictional-invitation",
    email: "fictional-recipient@example.test",
    role: "lead",
    status: "pending",
    expires_at: "2026-11-12T12:00:00Z",
    revision: 1,
    invited_by: "fictional-admin",
    last_sent_at: "2026-11-05T12:00:00Z",
  },
  post = {
    id: "fictional-post",
    title: "Fictional private post",
    message: "Fictional private body",
    priority: "normal",
    is_pinned: false,
    is_published: false,
    scheduled_for: null,
    expires_at: null,
    revision: 1,
    deleted_at: null,
    created_at: "2026-11-05T12:00:00Z",
    authorName: "Fictional officer",
    isRead: false,
    readCount: 0,
  };
type Kind = "invitations" | "announcements";
let failure: Error | undefined;
let result: {
  items: (typeof invite | typeof post)[];
  total: number;
  canManage: boolean;
  actorId: string;
  canInviteOfficers: boolean;
};
const mutationCalls = () =>
  apiMock.mock.calls.filter(([, options]) => options?.method);
const panel = (kind: Kind, teamId = "fictional-team") =>
  kind === "invitations" ? (
    <TeamInvitations teamId={teamId} />
  ) : (
    <TeamAnnouncements teamId={teamId} canManage />
  );
const rowText = (kind: Kind) =>
  kind === "invitations" ? invite.email : post.message;
const accessButton = (kind: Kind) =>
  kind === "invitations"
    ? "Recheck invitation access"
    : "Recheck announcement access";
async function draft(kind: Kind) {
  await screen.findByText(rowText(kind));
  if (kind === "announcements")
    fireEvent.click(
      await screen.findByRole("button", { name: "Write announcement" }),
    );
  const field = await screen.findByLabelText(
    kind === "invitations" ? /^Recipient email/ : /^Announcement title/,
  );
  fireEvent.change(field, {
    target: {
      value:
        kind === "invitations"
          ? "unsent-fictional@example.test"
          : "Fictional unsaved title",
    },
  });
  return field as HTMLInputElement;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  failure = undefined;
  result = {
    items: [],
    total: 21,
    canManage: true,
    actorId: "fictional-admin",
    canInviteOfficers: true,
  };
  apiMock.mockReset();
  safety.request.mockReset().mockImplementation((action) => action());
  apiMock.mockImplementation(async (path, options) => {
    if (options?.method) return {};
    if (failure) throw failure;
    return {
      ...result,
      items: result.items.length
        ? result.items
        : [path.includes("invitations") ? { ...invite } : { ...post }],
    };
  });
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: true,
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe.each(["invitations", "announcements"] as const)(
  "%s private reads",
  (kind) => {
    it("distinguishes a first read failure from an empty inventory", async () => {
      failure = new ApiFailure(
        503,
        "UNAVAILABLE",
        "Fictional temporary outage",
      );
      render(panel(kind));
      await screen.findByText("Fictional temporary outage");
      expect(
        screen.queryByText(
          /No invitations recorded|No announcements in this view/,
        ),
      ).toBeNull();
      expect(screen.getByText(/count unavailable/)).toBeTruthy();
      failure = undefined;
      fireEvent.click(screen.getByRole("button", { name: "Reload " + kind }));
      await screen.findByText(rowText(kind));
      expect(mutationCalls()).toHaveLength(0);
    });
    it("retains matching private rows and unsent input during a temporary failure", async () => {
      render(panel(kind));
      await screen.findByText(rowText(kind));
      const input = await draft(kind);
      failure = new ApiFailure(
        503,
        "UNAVAILABLE",
        "Fictional temporary outage",
      );
      fireEvent.click(screen.getByRole("button", { name: "Reload " + kind }));
      await screen.findByText("Fictional temporary outage");
      expect(screen.getByText(rowText(kind))).toBeTruthy();
      expect(
        screen.getByText(/Showing the last successful/).querySelector("time")
          ?.dateTime,
      ).toBeTruthy();
      expect(input.value).toContain(
        kind === "invitations" ? "unsent-fictional" : "unsaved",
      );
      expect(input.matches(":disabled")).toBe(true);
      fireEvent.submit(input.closest("form")!);
      expect(mutationCalls()).toHaveLength(0);
      failure = undefined;
      fireEvent.click(screen.getByRole("button", { name: "Reload " + kind }));
      await waitFor(() => expect(input.matches(":disabled")).toBe(false));
      expect(document.activeElement?.getAttribute("aria-label")).toBe(
        kind === "invitations"
          ? "Private team invitations"
          : "Team announcements",
      );
      expect(input.value).toContain(
        kind === "invitations" ? "unsent-fictional" : "unsaved",
      );
    });
    it.each([401, 403, 404])(
      "clears all private input after read denial %s and explicitly rechecks",
      async (status) => {
        render(panel(kind));
        const input = await draft(kind);
        if (kind === "invitations")
          fireEvent.change(
            screen.getByLabelText(/^Confirm your own password/),
            { target: { value: "Fictional private proof" } },
          );
        failure = new ApiFailure(status, "DENIED", "Fictional denial");
        fireEvent.click(screen.getByRole("button", { name: "Reload " + kind }));
        await screen.findByRole("button", { name: accessButton(kind) });
        expect(screen.queryByText(rowText(kind))).toBeNull();
        expect(screen.queryByDisplayValue(input.value)).toBeNull();
        expect(
          screen.queryByDisplayValue("Fictional private proof"),
        ).toBeNull();
        failure = undefined;
        fireEvent.click(
          screen.getByRole("button", { name: accessButton(kind) }),
        );
        await screen.findByText(rowText(kind));
        if (kind === "invitations")
          expect(
            (screen.getByLabelText(/^Recipient email/) as HTMLInputElement)
              .value,
          ).toBe("");
        else expect(screen.queryByLabelText(/^Announcement title/)).toBeNull();
        expect(mutationCalls()).toHaveLength(0);
      },
    );
    it("hides replaced team snapshots and ignores late reads", async () => {
      const pending = deferred<unknown>();
      let oldSignal: AbortSignal | undefined;
      apiMock.mockImplementation((path, options) => {
        if (path.includes("fictional-team/")) {
          oldSignal = options.signal;
          return pending.promise;
        }
        return Promise.resolve({ ...result, items: [] });
      });
      const view = render(panel(kind));
      view.rerender(panel(kind, "fictional-replacement"));
      await screen.findByText(
        kind === "invitations"
          ? "No invitations recorded"
          : "No announcements in this view",
      );
      expect(oldSignal?.aborted).toBe(true);
      await act(async () =>
        pending.resolve({
          ...result,
          items: [kind === "invitations" ? invite : post],
        }),
      );
      expect(screen.queryByText(rowText(kind))).toBeNull();
    });
    it("clears rows and drafts when the session is invalidated", async () => {
      render(panel(kind));
      const input = await draft(kind);
      fireEvent(window, new Event("gdg:session-cleared"));
      await screen.findByRole("button", { name: accessButton(kind) });
      expect(screen.queryByText(rowText(kind))).toBeNull();
      expect(screen.queryByDisplayValue(input.value)).toBeNull();
      expect(mutationCalls()).toHaveLength(0);
    });
    it("pauses offline writes and does not automatically read or submit on reconnection", async () => {
      render(panel(kind));
      const input = await draft(kind),
        count = apiMock.mock.calls.length;
      Object.defineProperty(navigator, "onLine", {
        configurable: true,
        value: false,
      });
      fireEvent(window, new Event("offline"));
      expect(input.matches(":disabled")).toBe(true);
      fireEvent.submit(input.closest("form")!);
      Object.defineProperty(navigator, "onLine", {
        configurable: true,
        value: true,
      });
      fireEvent(window, new Event("online"));
      expect(apiMock.mock.calls).toHaveLength(count);
      expect(mutationCalls()).toHaveLength(0);
    });
    it("reviews page changes before discarding an unsent draft", async () => {
      render(panel(kind));
      const input = await draft(kind);
      safety.request.mockImplementation(() => {});
      fireEvent.click(
        screen.getByRole("button", { name: "Next", exact: true }),
      );
      expect(safety.request).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/Page 1/)).toBeTruthy();
      expect(input.value).toContain(
        kind === "invitations" ? "unsent-fictional" : "unsaved",
      );
      act(() => safety.request.mock.calls[0][0]());
      await screen.findByText(/Page 2/);
      expect(mutationCalls()).toHaveLength(0);
    });
    it("cancels an in-flight write on replacement and fences its late receipt", async () => {
      const pending = deferred<unknown>();
      let signal: AbortSignal | undefined;
      apiMock.mockImplementation(async (path, options) => {
        if (options?.method) {
          signal = options.signal;
          return pending.promise;
        }
        return {
          ...result,
          items: [path.includes("invitations") ? invite : post],
        };
      });
      const view = render(panel(kind));
      const input = await draft(kind);
      if (kind === "invitations")
        fireEvent.change(screen.getByLabelText(/^Confirm your own password/), {
          target: { value: "Fictional private proof" },
        });
      else
        fireEvent.change(screen.getByLabelText(/^Message/), {
          target: { value: "Fictional private draft body" },
        });
      fireEvent.submit(input.closest("form")!);
      fireEvent.submit(input.closest("form")!);
      if (kind === "invitations") {
        const confirm = screen.getByRole("button", {
          name: "Confirm reviewed invitation change",
        });
        fireEvent.click(confirm);
        fireEvent.click(confirm);
      }
      expect(mutationCalls()).toHaveLength(1);
      view.rerender(panel(kind, "fictional-replacement"));
      expect(signal?.aborted).toBe(true);
      await act(async () => pending.resolve({}));
      expect(
        screen.queryByText(/Invitation saved|Announcement saved/),
      ).toBeNull();
    });
  },
);
it("blocks a changed invitation revision until stale-action closing is reviewed", async () => {
  render(panel("invitations"));
  await screen.findByText(invite.email);
  fireEvent.click(screen.getByRole("button", { name: "Revoke", exact: true }));
  result.items = [{ ...invite, revision: 2 }];
  fireEvent.click(screen.getByRole("button", { name: "Reload invitations" }));
  await screen.findByText(/This invitation changed/);
  const input = screen.getByLabelText(/^Confirm your own password/);
  fireEvent.submit(input.closest("form")!);
  expect(mutationCalls()).toHaveLength(0);
  safety.request.mockImplementation(() => {});
  fireEvent.click(
    screen.getByRole("button", {
      name: "Review closing stale invitation action",
    }),
  );
  expect(safety.request).toHaveBeenCalledTimes(1);
});
it("retains a stale announcement draft but blocks saving it after revision change", async () => {
  render(panel("announcements"));
  await screen.findByText(post.message);
  fireEvent.click(screen.getByRole("button", { name: "Edit", exact: true }));
  const input = screen.getByLabelText(
    /^Announcement title/,
  ) as HTMLInputElement;
  fireEvent.change(input, { target: { value: "Fictional stale title" } });
  result.items = [{ ...post, revision: 2 }];
  fireEvent.click(screen.getByRole("button", { name: "Reload announcements" }));
  await screen.findByText(/This announcement changed/);
  expect(input.value).toBe("Fictional stale title");
  fireEvent.submit(input.closest("form")!);
  expect(mutationCalls()).toHaveLength(0);
  safety.request.mockImplementation(() => {});
  fireEvent.click(
    screen.getByRole("button", {
      name: "Review closing stale announcement action",
    }),
  );
  expect(safety.request).toHaveBeenCalledTimes(1);
});
it("does not permit an officer invitation action after fresh capability downgrade", async () => {
  render(panel("invitations"));
  await screen.findByText(invite.email);
  fireEvent.click(screen.getByRole("button", { name: "Revoke", exact: true }));
  result.canInviteOfficers = false;
  fireEvent.click(screen.getByRole("button", { name: "Reload invitations" }));
  await screen.findByText(/This invitation changed/);
  const input = screen.getByLabelText(/^Confirm your own password/);
  fireEvent.submit(input.closest("form")!);
  expect(mutationCalls()).toHaveLength(0);
});
it("clears announcement editor when fresh manager capability is lost", async () => {
  render(panel("announcements"));
  const input = await draft("announcements");
  result.canManage = false;
  fireEvent.click(screen.getByRole("button", { name: "Reload announcements" }));
  await waitFor(() =>
    expect(screen.queryByLabelText(/^Announcement title/)).toBeNull(),
  );
  expect(screen.queryByDisplayValue(input.value)).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Write announcement" }),
  ).toBeNull();
});
