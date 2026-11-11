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
import NewsletterWorkspace from "../../src/ui/newsletter/NewsletterWorkspace";
import NewsletterEditor from "../../src/ui/newsletter/NewsletterEditor";
import NewsletterSend from "../../src/ui/newsletter/NewsletterSend";
import SubscriberBulk from "../../src/ui/newsletter/SubscriberBulk";
import { ApiFailure } from "../../src/lib/api";
import type { NewsletterRecord } from "../../src/ui/newsletter/types";
const { apiMock, actor } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  actor: { id: "f1600000-0000-4000-8000-000000000001", role: "admin" },
}));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: apiMock,
}));
vi.mock("@/contexts/AdminContext", () => ({
  useAdmin: () => ({ currentAdmin: actor }),
}));
vi.mock("@/hooks/useDraftGuard", () => ({
  useDraftGuard: vi.fn(),
  useNavigationSafety: () => ({
    request: (run: () => void) => run(),
    allow: (run: () => void) => run(),
  }),
}));
vi.mock("../../src/ui/forms/FormIntegrations", () => ({ default: () => null }));
const id = "f1600000-0000-4000-8000-000000000002",
  base = "/admin/newsletter",
  path = base + "/campaigns/" + id;
const record: NewsletterRecord = {
  id,
  teamId: null,
  revision: 1,
  actions: ["read", "update", "create", "delete", "send_email"],
  deletedAt: null,
  subject: "Fictional campaign",
  content: "Fictional newsletter text",
  status: "draft",
  audience: "all",
  createdAt: "2026-10-27T12:00:00Z",
  updatedAt: "2026-10-27T12:00:00Z",
};
const subscriber: NewsletterRecord = {
  ...record,
  email: "fictional-subscriber@example.test",
  state: "active",
  subject: undefined,
  status: undefined,
};
const cap = {
    chapterRead: true,
    chapterCreate: true,
    chapterSend: true,
    teams: [],
  },
  listing = { items: [record], total: 1, page: 1, pageSize: 50 };
function review() {
  return {
    reviewId: id,
    reviewToken: "Fictional-review-token",
    count: 1,
    subject: record.subject,
    content: record.content,
    html: "<p>Fictional</p>",
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    recipients: [{ id, email: subscriber.email }],
  };
}
function deferred<T>() {
  let resolve!: (v: T) => void, reject!: (v: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
function response(p: string) {
  return p.endsWith("/capabilities")
    ? cap
    : p === path
      ? { record }
      : p.endsWith("/send-review")
        ? review()
        : p.includes("/subscribers?")
          ? { ...listing, items: [subscriber] }
          : listing;
}
const writes = () => apiMock.mock.calls.filter(([, o]) => o?.method === "POST");
function workspace() {
  return render(
    <MemoryRouter>
      <main id="workspace-content" tabIndex={-1}>
        <NewsletterWorkspace />
      </main>
    </MemoryRouter>,
  );
}
function editor(r: NewsletterRecord | undefined = record) {
  return render(
    <main>
      <NewsletterEditor
        kind="campaigns"
        record={r}
        scope="chapter"
        onSaved={vi.fn()}
        onClose={vi.fn()}
      />
    </main>,
  );
}
function sending(r: NewsletterRecord = record, onSaved = vi.fn()) {
  return render(
    <main>
      <NewsletterSend record={r} onSaved={onSaved} />
    </main>,
  );
}
async function generate() {
  fireEvent.click(
    screen.getByRole("button", { name: "Review audience & send" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Generate send review" }));
  await screen.findByText("1 recipient");
}
function proof(expected = "SEND 1") {
  fireEvent.change(screen.getByLabelText(/Current password/), {
    target: { value: "Fictional-newsletter-proof" },
  });
  fireEvent.change(
    screen.getByLabelText("Type " + expected + " to confirm", { exact: false }),
    { target: { value: expected } },
  );
}
beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockImplementation((p: string, o?: { method?: string }) =>
    Promise.resolve(
      p.endsWith("/send-review")
        ? review()
        : o?.method === "POST"
          ? { id, count: 1 }
          : response(p),
    ),
  );
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("Newsletter independent reads and private editor", () => {
  it("shows loading state and aborts both workspace reads", () => {
    const pending = deferred<unknown>(),
      signals: AbortSignal[] = [];
    apiMock.mockImplementation((_p: string, o: { signal: AbortSignal }) => {
      signals.push(o.signal);
      return pending.promise;
    });
    const page = workspace();
    expect(screen.getByText("Loading campaigns…")).toBeTruthy();
    page.unmount();
    expect(signals).toHaveLength(2);
    expect(signals.every((s) => s.aborted)).toBe(true);
  });
  it("does not mask permission failure with inventory success", async () => {
    apiMock.mockImplementation((p: string) =>
      p.endsWith("/capabilities")
        ? Promise.reject(Error("Permission read interrupted"))
        : Promise.resolve(response(p)),
    );
    workspace();
    await screen.findByText(
      /Newsletter permissions: Permission read interrupted/,
    );
    expect(screen.getByRole("button", { name: record.subject })).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Write campaign",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
  it("retains a timestamped list when refresh temporarily fails", async () => {
    let failed = false;
    apiMock.mockImplementation((p: string) =>
      failed && p.startsWith(base + "/campaigns?")
        ? Promise.reject(Error("Inventory interrupted"))
        : Promise.resolve(response(p)),
    );
    workspace();
    await screen.findByRole("button", { name: record.subject });
    failed = true;
    fireEvent.click(screen.getByRole("button", { name: "Refresh workspace" }));
    await screen.findByText(/Newsletter inventory may be out of date/);
    expect(screen.getByRole("button", { name: record.subject })).toBeTruthy();
  });
  it("recovers initial list failure via explicit retry", async () => {
    let failed = true;
    apiMock.mockImplementation((p: string) =>
      failed && p.startsWith(base + "/campaigns?")
        ? Promise.reject(Error("Inventory interrupted"))
        : Promise.resolve(response(p)),
    );
    workspace();
    await screen.findByRole("heading", { name: "Newsletter unavailable" });
    failed = false;
    fireEvent.click(
      screen.getByRole("button", { name: "Retry newsletter inventory" }),
    );
    expect(document.activeElement?.id).toBe("workspace-content");
    await screen.findByRole("button", { name: record.subject });
  });
  it("refreshes the selected record without replacing its unsaved input", async () => {
    let revision = 1;
    apiMock.mockImplementation((p: string) =>
      Promise.resolve(
        p === path ? { record: { ...record, revision } } : response(p),
      ),
    );
    workspace();
    fireEvent.click(
      await screen.findByRole("button", { name: record.subject }),
    );
    const input = await screen.findByLabelText(/Subject/);
    fireEvent.change(input, {
      target: { value: "Fictional unsaved campaign" },
    });
    revision = 2;
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh record access" }),
    );
    await screen.findByText(/This newsletter record changed/);
    expect((input as HTMLInputElement).value).toBe(
      "Fictional unsaved campaign",
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Save private changes",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
  it("clears private editing after selected detail is denied", async () => {
    let denied = false;
    apiMock.mockImplementation((p: string) =>
      denied && p === path
        ? Promise.reject(
            new ApiFailure(404, "NOT_FOUND", "Campaign unavailable"),
          )
        : Promise.resolve(response(p)),
    );
    workspace();
    fireEvent.click(
      await screen.findByRole("button", { name: record.subject }),
    );
    await screen.findByLabelText(/Subject/);
    denied = true;
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh record access" }),
    );
    await screen.findByText(
      "Newsletter record access changed. Private editor cleared.",
    );
    expect(screen.queryByLabelText(/Subject/)).toBeNull();
  });
  it("aborts a pending editor save and ignores late success on unmount", async () => {
    const pending = deferred<unknown>(),
      saved = vi.fn();
    apiMock.mockImplementation(() => pending.promise);
    const page = render(
      <NewsletterEditor
        kind="campaigns"
        record={record}
        scope="chapter"
        onSaved={saved}
        onClose={vi.fn()}
      />,
    );
    const input = screen.getByLabelText(/Subject/);
    fireEvent.change(input, { target: { value: "Fictional changed subject" } });
    fireEvent.submit(input.closest("form")!);
    expect(writes()).toHaveLength(1);
    const signal = writes()[0][1].signal;
    page.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve({ id }));
    expect(saved).not.toHaveBeenCalled();
  });
  it("suppresses duplicate editor submissions and freezes fields", async () => {
    const pending = deferred<unknown>();
    apiMock.mockImplementation(() => pending.promise);
    editor();
    const input = screen.getByLabelText(/Subject/);
    fireEvent.change(input, { target: { value: "Fictional changed subject" } });
    const form = input.closest("form")!;
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    expect(writes()).toHaveLength(1);
    expect(input.closest("fieldset")?.disabled).toBe(true);
    await act(async () => pending.resolve({ id }));
  });
  it("retains an unchanged draft key after uncertain save", async () => {
    apiMock.mockRejectedValue(Error("Save not confirmed"));
    editor();
    const input = screen.getByLabelText(/Subject/);
    fireEvent.change(input, { target: { value: "Fictional changed subject" } });
    const form = input.closest("form")!;
    fireEvent.submit(form);
    await screen.findByText("Save not confirmed");
    expect(document.activeElement?.textContent).toBe("Save not confirmed");
    fireEvent.submit(form);
    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(writes()[0][1].idempotencyKey).toBe(writes()[1][1].idempotencyKey);
  });
  it("preserves fields and blocks retry after a server revision conflict", async () => {
    apiMock.mockRejectedValue(
      new ApiFailure(409, "CONFLICT", "Campaign changed"),
    );
    editor();
    const input = screen.getByLabelText(/Subject/);
    fireEvent.change(input, {
      target: { value: "Fictional conflicting draft" },
    });
    fireEvent.submit(input.closest("form")!);
    await screen.findByText(/This newsletter record changed/);
    expect((input as HTMLInputElement).value).toBe(
      "Fictional conflicting draft",
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Save private changes",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
  it("keeps offline input and never saves on reconnect", () => {
    const online = vi.spyOn(navigator, "onLine", "get");
    online.mockReturnValue(true);
    editor();
    const input = screen.getByLabelText(/Subject/);
    fireEvent.change(input, {
      target: { value: "Fictional offline campaign" },
    });
    online.mockReturnValue(false);
    act(() => window.dispatchEvent(new Event("offline")));
    fireEvent.submit(input.closest("form")!);
    online.mockReturnValue(true);
    act(() => window.dispatchEvent(new Event("online")));
    expect((input as HTMLInputElement).value).toBe(
      "Fictional offline campaign",
    );
    expect(writes()).toHaveLength(0);
  });
  it("prevents read-only record mutation even through synthetic form submit", () => {
    editor({ ...record, actions: ["read"] });
    fireEvent.submit(screen.getByLabelText(/Subject/).closest("form")!);
    expect(writes()).toHaveLength(0);
  });
  it("retries a failed custom-recipient inventory", async () => {
    let failed = true;
    apiMock.mockImplementation(() =>
      failed
        ? Promise.reject(Error("Recipients interrupted"))
        : Promise.resolve({ ...listing, items: [subscriber] }),
    );
    editor({ ...record, audience: "custom", recipientIds: [id] });
    await screen.findByText(/Confirmed subscribers are unavailable/);
    failed = false;
    fireEvent.click(
      screen.getByRole("button", { name: "Retry confirmed subscribers" }),
    );
    await screen.findByText(subscriber.email!);
  });
  it("uses the returned page size for recipient navigation", async () => {
    apiMock.mockResolvedValue({
      ...listing,
      pageSize: 1,
      total: 2,
      items: [subscriber],
    });
    editor({ ...record, audience: "custom", recipientIds: [id] });
    await screen.findByText(subscriber.email!);
    fireEvent.click(screen.getByRole("button", { name: "Next recipients" }));
    await waitFor(() =>
      expect(apiMock.mock.calls.some(([p]) => p.includes("page=2"))).toBe(true),
    );
  });
});
describe("Newsletter delivery confirmation and expiry", () => {
  it("generates one review for same-tick requests", async () => {
    const pending = deferred<unknown>();
    apiMock.mockImplementation(() => pending.promise);
    sending();
    fireEvent.click(
      screen.getByRole("button", { name: "Review audience & send" }),
    );
    const button = screen.getByRole("button", { name: "Generate send review" });
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    expect(writes()).toHaveLength(1);
    await act(async () => pending.resolve(review()));
    await screen.findByText("1 recipient");
    expect(document.activeElement?.textContent).toBe(
      "Review the exact audience",
    );
  });
  it("requires exact text and clears password at approval start", async () => {
    const pending = deferred<unknown>();
    apiMock.mockImplementation((p: string) =>
      p.endsWith("/send-review") ? Promise.resolve(review()) : pending.promise,
    );
    sending();
    await generate();
    fireEvent.change(screen.getByLabelText(/Current password/), {
      target: { value: "Fictional-newsletter-proof" },
    });
    expect(
      (
        screen.getByRole("button", {
          name: "Approve send",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    proof();
    fireEvent.click(screen.getByRole("button", { name: "Approve send" }));
    expect(
      (screen.getByLabelText(/Current password/) as HTMLInputElement).value,
    ).toBe("");
    expect(writes().at(-1)![1].body).toMatchObject({
      confirmation: "SEND 1",
      currentPassword: "Fictional-newsletter-proof",
      reviewId: id,
    });
    await act(async () => pending.resolve({ id }));
  });
  it("rechecks expiry at approval time before the timer rerenders", async () => {
    sending();
    await generate();
    proof();
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 120000);
    fireEvent.click(screen.getByRole("button", { name: "Approve send" }));
    await screen.findByText(
      "This send review expired. Generate a fresh review before approval.",
    );
    expect(writes()).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "Refresh expired review" }),
    ).toBeTruthy();
  });
  it("does not approve a malformed-expiry review", async () => {
    apiMock.mockResolvedValue({ ...review(), expiresAt: "not-a-date" });
    sending();
    await generate();
    expect(
      screen.getByRole("button", { name: "Refresh expired review" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve send" })).toBeNull();
  });
  it("rejects schedule outside the allowed window before sending", async () => {
    sending();
    await generate();
    proof();
    fireEvent.change(screen.getByLabelText(/Schedule in your local time/), {
      target: { value: "2020-01-01T10:00" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Approve scheduled send" }),
    );
    await screen.findByText(/Choose a time at least one minute/);
    expect(writes()).toHaveLength(1);
  });
  it("keeps an unchanged send key across password reentry", async () => {
    apiMock.mockImplementation((p: string) =>
      p.endsWith("/send-review")
        ? Promise.resolve(review())
        : Promise.reject(Error("Approval not confirmed")),
    );
    sending();
    await generate();
    proof();
    fireEvent.click(screen.getByRole("button", { name: "Approve send" }));
    await screen.findByText("Approval not confirmed");
    proof();
    fireEvent.click(screen.getByRole("button", { name: "Approve send" }));
    await waitFor(() => expect(writes()).toHaveLength(3));
    expect(writes()[1][1].idempotencyKey).toBe(writes()[2][1].idempotencyKey);
  });
  it("aborts an old review when campaign revision changes", async () => {
    const pending = deferred<unknown>();
    apiMock.mockImplementation(() => pending.promise);
    const page = sending();
    fireEvent.click(
      screen.getByRole("button", { name: "Review audience & send" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Generate send review" }),
    );
    const signal = writes()[0][1].signal;
    page.rerender(
      <main>
        <NewsletterSend record={{ ...record, revision: 2 }} onSaved={vi.fn()} />
      </main>,
    );
    expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve(review()));
    expect(screen.queryByText("1 recipient")).toBeNull();
    expect(screen.queryByLabelText(/Current password/)).toBeNull();
  });
  it("clears reviewed addresses when send permission is revoked", async () => {
    const page = sending();
    await generate();
    page.rerender(
      <main>
        <NewsletterSend
          record={{ ...record, actions: ["read"] }}
          onSaved={vi.fn()}
        />
      </main>,
    );
    expect(screen.queryByText("1 recipient")).toBeNull();
    expect(screen.queryByRole("button", { name: "Approve send" })).toBeNull();
  });
  it("does not open delivery controls offline or without fresh reads", () => {
    const page = render(
      <NewsletterSend record={record} onSaved={vi.fn()} unavailable />,
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Review audience & send",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    page.rerender(<NewsletterSend record={record} onSaved={vi.fn()} />);
    act(() => window.dispatchEvent(new Event("offline")));
    expect(
      (
        screen.getByRole("button", {
          name: "Review audience & send",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(writes()).toHaveLength(0);
  });
  it("keeps parent draft fields frozen while a delivery review is open", async () => {
    editor();
    fireEvent.click(
      screen.getByRole("button", { name: "Review audience & send" }),
    );
    expect(screen.getByLabelText(/Subject/).closest("fieldset")?.disabled).toBe(
      true,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Close delivery controls" }),
    );
    await waitFor(() =>
      expect(
        screen.getByLabelText(/Subject/).closest("fieldset")?.disabled,
      ).toBe(false),
    );
  });
  it("confirms a self-only test and focuses its receipt", async () => {
    sending();
    fireEvent.click(screen.getByRole("button", { name: "Send test to me" }));
    proof("SEND TEST");
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm self-only test" }),
    );
    await screen.findByText(
      /Test email queued for your account/,
    );
    expect(writes()[0][0]).toBe(path + "/test");
    expect(writes()[0][1].body.confirmation).toBe("SEND TEST");
    expect(document.activeElement?.getAttribute("role")).toBe("status");
  });
  it("confirms cancellation only for an active delivery state", async () => {
    const saved = vi.fn();
    sending({ ...record, status: "scheduled" }, saved);
    fireEvent.click(
      screen.getByRole("button", { name: "Cancel remaining sends" }),
    );
    proof("CANCEL SEND");
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm cancellation" }),
    );
    await waitFor(() => expect(saved).toHaveBeenCalled());
    expect(writes()[0][0]).toBe(path + "/cancel");
  });
  it("passes structural axe checks for draft and send review", async () => {
    const page = editor();
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
    await generate();
    await audit();
  });
});
describe("Newsletter bulk subscriber review", () => {
  function bulk() {
    return render(
      <main>
        <SubscriberBulk
          records={[subscriber]}
          archived={false}
          onSaved={vi.fn()}
          onClear={vi.fn()}
          onLockChange={vi.fn()}
        />
      </main>,
    );
  }
  it("blocks confirmation when a selected revision changes", () => {
    const page = bulk();
    fireEvent.click(
      screen.getByRole("button", { name: "Review selected archive" }),
    );
    proof("ARCHIVE 1");
    page.rerender(
      <main>
        <SubscriberBulk
          records={[{ ...subscriber, revision: 2 }]}
          archived={false}
          onSaved={vi.fn()}
          onClear={vi.fn()}
          onLockChange={vi.fn()}
        />
      </main>,
    );
    expect(
      screen.getByText(/The selected records or permissions changed/),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Confirm selected changes",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(writes()).toHaveLength(0);
  });
  it("keeps bulk retry intent across password reentry", async () => {
    apiMock.mockRejectedValue(Error("Bulk not confirmed"));
    bulk();
    fireEvent.click(
      screen.getByRole("button", { name: "Review selected deactivation" }),
    );
    proof("DEACTIVATE 1");
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm selected changes" }),
    );
    await screen.findByText("Bulk not confirmed");
    proof("DEACTIVATE 1");
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm selected changes" }),
    );
    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(writes()[0][1].idempotencyKey).toBe(writes()[1][1].idempotencyKey);
  });
  it("removes bulk authority when the current delete grant is gone", () => {
    render(
      <SubscriberBulk
        records={[{ ...subscriber, actions: ["read"] }]}
        archived={false}
        onSaved={vi.fn()}
        onClear={vi.fn()}
        onLockChange={vi.fn()}
      />,
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Review selected archive",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(writes()).toHaveLength(0);
  });
  it("keeps subscriber identity and explicit consent together before a simulated opt-in request", async () => {
    const saved = vi.fn();
    render(
      <main>
        <NewsletterEditor
          kind="subscribers"
          scope="chapter"
          onSaved={saved}
          onClose={vi.fn()}
        />
      </main>,
    );
    fireEvent.change(screen.getByLabelText(/^Email address/), {
      target: { value: "REVIEWED@example.test" },
    });
    fireEvent.change(screen.getByLabelText(/^Name$/), {
      target: { value: "Reviewed subscriber" },
    });
    const button = screen.getByRole("button", {
      name: "Send newsletter invitation",
      exact: true,
    });
    fireEvent.submit(button.closest("form")!);
    await screen.findByText(/acknowledge the subscriber/);
    expect(writes()).toHaveLength(0);
    fireEvent.click(
      screen.getByRole("checkbox", { name: /This person requested to join/ }),
    );
    fireEvent.click(button);
    await waitFor(() => expect(saved).toHaveBeenCalled());
    expect(writes()).toHaveLength(1);
    expect(writes()[0][1].body).toEqual({
      teamId: null,
      email: "reviewed@example.test",
      name: "Reviewed subscriber",
      consentAcknowledged: true,
    });
  });
  it("saves a complete reusable template as private text without preparing a campaign", async () => {
    const saved = vi.fn();
    render(
      <main>
        <NewsletterEditor
          kind="templates"
          scope="chapter"
          onSaved={saved}
          onClose={vi.fn()}
        />
      </main>,
    );
    fireEvent.change(screen.getByLabelText(/^Template name/), {
      target: { value: "Reviewed workshop template" },
    });
    fireEvent.change(screen.getByLabelText(/^Description$/), {
      target: { value: "Reusable chapter workshop context" },
    });
    fireEvent.change(screen.getByLabelText(/^Message/), {
      target: { value: "Hello chapter,\nA new workshop is ready for review." },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save private changes", exact: true }),
    );
    await waitFor(() =>
      expect(saved).toHaveBeenCalledWith("Saved newsletter changes.", id),
    );
    expect(writes()).toHaveLength(1);
    expect(writes()[0][0]).toBe(base + "/templates");
    expect(writes()[0][1].body).toEqual({
      teamId: null,
      record: {
        name: "Reviewed workshop template",
        description: "Reusable chapter workshop context",
        content: "Hello chapter,\nA new workshop is ready for review.",
      },
    });
  });
  it("copies template text and preserves explicitly selected confirmed recipients across paging and search", async () => {
    const other = "f1600000-0000-4000-8000-000000000009",
      saved = vi.fn();
    apiMock.mockImplementation(async (p, o) => {
      if (o?.method === "POST") return { id };
      if (p.startsWith(base + "/templates?"))
        return {
          items: [
            {
              ...record,
              name: "Reviewed source template",
              content: "Copied approved workshop text",
            },
          ],
          total: 1,
          page: 1,
          pageSize: 50,
        };
      if (p.startsWith(base + "/subscribers?")) {
        const page = Number(
          new URL(p, "https://fixture.invalid").searchParams.get("page"),
        );
        return {
          items: [
            page === 2
              ? {
                  ...subscriber,
                  id: other,
                  email: "fictional-second@example.test",
                }
              : subscriber,
          ],
          total: 80,
          page,
          pageSize: 50,
        };
      }
      return response(p);
    });
    render(
      <main>
        <NewsletterEditor
          kind="campaigns"
          record={record}
          scope="chapter"
          onSaved={saved}
          onClose={vi.fn()}
        />
      </main>,
    );
    fireEvent.click(screen.getByText("Start from a saved template"));
    fireEvent.change(screen.getByLabelText("Find templates"), {
      target: { value: "workshop" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Find templates", exact: true }),
    );
    await screen.findByText("Reviewed source template");
    fireEvent.click(
      screen.getByRole("button", { name: "Use this template", exact: true }),
    );
    expect(screen.getByLabelText(/^Message/)).toHaveProperty(
      "value",
      "Copied approved workshop text",
    );
    fireEvent.change(screen.getByLabelText(/^Subject/), {
      target: { value: "Reviewed workshop announcement" },
    });
    fireEvent.change(screen.getByLabelText(/^Message/), {
      target: {
        value: "Copied approved workshop text\nWith a reviewed update.",
      },
    });
    fireEvent.change(screen.getByRole("combobox", { name: /^Audience/ }), {
      target: { value: "custom" },
    });
    fireEvent.click(
      await screen.findByRole("checkbox", {
        name: /fictional-subscriber@example.test/,
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Next recipients", exact: true }),
    );
    fireEvent.click(
      await screen.findByRole("checkbox", {
        name: /fictional-second@example.test/,
      }),
    );
    await screen.findByText(/Choose recipients · 2 selected/);
    fireEvent.click(
      screen.getByRole("button", { name: "Clear selected", exact: true }),
    );
    await screen.findByText(/Choose recipients · 0 selected/);
    fireEvent.click(
      screen.getByRole("checkbox", { name: /fictional-second@example.test/ }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Previous recipients", exact: true }),
    );
    fireEvent.click(
      await screen.findByRole("checkbox", {
        name: /fictional-subscriber@example.test/,
      }),
    );
    fireEvent.change(screen.getByLabelText("Find subscribers"), {
      target: { value: "fictional" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Find subscribers", exact: true }),
    );
    await screen.findByText(/Choose recipients · 2 selected/);
    fireEvent.click(
      screen.getByRole("button", { name: "Save private changes", exact: true }),
    );
    await waitFor(() => expect(saved).toHaveBeenCalled());
    expect(writes()).toHaveLength(1);
    expect(writes()[0][1].body).toEqual({
      action: "update",
      revision: 1,
      record: {
        subject: "Reviewed workshop announcement",
        content: "Copied approved workshop text\nWith a reviewed update.",
        audience: "custom",
        recipientIds: [other, id],
      },
    });
    expect(writes()[0][0]).toBe(path);
    expect(apiMock.mock.calls.some(([p]) => p.endsWith("/send"))).toBe(false);
  });
});
