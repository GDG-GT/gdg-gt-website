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
import EventMailPanel from "../../src/ui/EventMailPanel";
import { ApiFailure } from "../../src/lib/api";
const { apiMock, navigation, onClose, onQueued } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  navigation: { request: vi.fn((action: () => void) => action()) },
  onClose: vi.fn(),
  onQueued: vi.fn(),
}));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: apiMock,
}));
vi.mock("@/hooks/useDraftGuard", () => ({
  useDraftGuard: vi.fn(),
  useNavigationSafety: () => navigation,
}));
const root = "/admin/events/fictional-event/email",
  review = {
    reviewId: "fictional-review",
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    count: 1,
    subject: "Fictional subject",
    message: "Fictional private message",
    recipients: [
      {
        id: "fictional-registration",
        email: "fictional-recipient@example.test",
      },
    ],
  };
let prepare: () => Promise<unknown>,
  approve: () => Promise<unknown>,
  recheck: () => Promise<unknown>;
const approvals = () =>
  apiMock.mock.calls.filter(
    ([path, options]) => path === root && options.method === "POST",
  );
const panel = (eventId = "fictional-event", disabled = false) => (
  <EventMailPanel
    eventId={eventId}
    disabled={disabled}
    onClose={onClose}
    onQueued={onQueued}
  />
);
beforeEach(() => {
  onClose.mockReset();
  onQueued.mockReset();
  navigation.request.mockReset().mockImplementation((action) => action());
  prepare = async () => ({
    ...review,
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  });
  approve = async () => ({ recipientCount: 1, queued: true });
  recheck = async () => ({
    state: "ready",
    at: new Date().toISOString(),
    review: await prepare(),
  });
  apiMock
    .mockReset()
    .mockImplementation((path, options) =>
      path.endsWith("/email-review")
        ? prepare()
        : path.includes("?reviewId=")
          ? recheck()
          : options.method === "POST"
            ? approve()
            : Promise.resolve({ recipientCount: 1 }),
    );
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: true,
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function savedReview() {
  fireEvent.change(screen.getByLabelText(/^Subject/), {
    target: { value: review.subject },
  });
  fireEvent.change(screen.getByLabelText(/^Message/), {
    target: { value: review.message },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Review recipients and message" }),
  );
  await screen.findByRole("heading", { name: "Review email to 1 attendees" });
}
function proof() {
  fireEvent.change(screen.getByLabelText(/^Current password/), {
    target: { value: "Fictional own proof" },
  });
  fireEvent.change(screen.getByLabelText(/^Type SEND 1/), {
    target: { value: "SEND 1" },
  });
}
async function uncertain() {
  approve = async () => {
    throw new TypeError("Fictional lost approval receipt");
  };
  await savedReview();
  proof();
  fireEvent.click(screen.getByRole("button", { name: "Queue 1 messages" }));
  await screen.findByRole("button", { name: "Recheck saved email approval" });
}
describe("Event mail approval recovery", () => {
  it("loads private queued history independently without discarding the current unsent message", async () => {
    const original = apiMock.getMockImplementation()!;
    let failure = false;
    apiMock.mockImplementation((path, options) =>
      path.includes("?history=")
        ? failure
          ? Promise.reject(
              new ApiFailure(503, "UNAVAILABLE", "Fictional history outage"),
            )
          : Promise.resolve({
              items: [
                {
                  id: "fictional-message",
                  subject: "Fictional saved subject",
                  message: "Fictional saved message",
                  recipient_count: 1,
                  created_at: "2026-11-05T12:00:00Z",
                },
              ],
              total: 21,
            })
        : original(path, options),
    );
    render(panel());
    fireEvent.change(screen.getByLabelText(/^Subject/), {
      target: { value: review.subject },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Review your queued event messages" }),
    );
    await screen.findByText("Fictional saved message");
    expect((screen.getByLabelText(/^Subject/) as HTMLInputElement).value).toBe(
      review.subject,
    );
    failure = true;
    fireEvent.click(
      screen.getByRole("button", { name: "Reload queued message history" }),
    );
    await screen.findByText("Fictional history outage");
    expect(screen.getByText("Fictional saved message")).toBeTruthy();
    expect(
      screen.getByText(/last successful history read/).querySelector("time"),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Next history page",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    failure = false;
    fireEvent.click(
      screen.getByRole("button", { name: "Reload queued message history" }),
    );
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("heading", { name: "Your queued event messages" }),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Next history page" }));
    await screen.findByText(/Page 2/);
    expect(
      apiMock.mock.calls.some(([path]) =>
        path.endsWith("?history=true&page=2"),
      ),
    ).toBe(true);
    expect(approvals()).toHaveLength(0);
  });
  it("distinguishes a failed initial history read and clears the composer when history access is denied", async () => {
    const original = apiMock.getMockImplementation()!;
    let status = 503;
    apiMock.mockImplementation((path, options) =>
      path.includes("?history=")
        ? Promise.reject(
            new ApiFailure(status, "DENIED", "Fictional history denied"),
          )
        : original(path, options),
    );
    render(panel());
    fireEvent.change(screen.getByLabelText(/^Subject/), {
      target: { value: review.subject },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Review your queued event messages" }),
    );
    await screen.findByText("Fictional history denied");
    expect(screen.queryByText(/No queued event messages from/)).toBeNull();
    expect(screen.getByText(/count unavailable/)).toBeTruthy();
    status = 403;
    fireEvent.click(
      screen.getByRole("button", { name: "Reload queued message history" }),
    );
    await screen.findByRole("button", { name: "Recheck event email access" });
    expect(screen.queryByDisplayValue(review.subject)).toBeNull();
    expect(
      screen.queryByRole("region", { name: "Your queued event messages" }),
    ).toBeNull();
  });
  it("keeps queued-message history available during uncertain approval without posting another send", async () => {
    const original = apiMock.getMockImplementation()!;
    apiMock.mockImplementation((path, options) =>
      path.includes("?history=")
        ? Promise.resolve({ items: [], total: 0 })
        : original(path, options),
    );
    render(panel());
    await uncertain();
    fireEvent.click(
      screen.getByRole("button", { name: "Review your queued event messages" }),
    );
    await screen.findByText(
      "No queued event messages from your account on this page.",
    );
    expect(approvals()).toHaveLength(1);
    expect(
      (
        screen.getByRole("button", {
          name: "Reload queued message history",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });
  it("reconciles a queued receipt after the frozen five-minute review has expired", async () => {
    render(panel());
    await uncertain();
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 2 * 60 * 60 * 1000);
    recheck = async () => ({
      state: "queued",
      at: new Date().toISOString(),
      receipt: { recipientCount: 1, queued: true },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Recheck saved email approval" }),
    );
    await waitFor(() => expect(onQueued).toHaveBeenCalledExactlyOnceWith(1));
    expect(approvals()).toHaveLength(1);
  });
  it.each(["preparation", "recheck"] as const)(
    "clears private state on denied %s without exposing the prior draft",
    async (stage) => {
      render(panel());
      if (stage === "recheck") {
        await uncertain();
        recheck = async () => {
          throw new ApiFailure(403, "DENIED", "Fictional access denied");
        };
        fireEvent.click(
          screen.getByRole("button", { name: "Recheck saved email approval" }),
        );
      } else {
        prepare = async () => {
          throw new ApiFailure(403, "DENIED", "Fictional access denied");
        };
        fireEvent.change(screen.getByLabelText(/^Subject/), {
          target: { value: review.subject },
        });
        fireEvent.submit(screen.getByLabelText(/^Subject/).closest("form")!);
      }
      await screen.findByRole("button", { name: "Recheck event email access" });
      expect(screen.queryByText(review.message)).toBeNull();
      expect(screen.queryByDisplayValue(review.subject)).toBeNull();
      expect(onQueued).not.toHaveBeenCalled();
    },
  );
  it("does not reopen the composer when a current-access recheck still fails", async () => {
    prepare = async () => {
      throw new ApiFailure(403, "DENIED", "Fictional access denied");
    };
    render(panel());
    fireEvent.submit(screen.getByLabelText(/^Subject/).closest("form")!);
    await screen.findByRole("button", { name: "Recheck event email access" });
    const original = apiMock.getMockImplementation()!;
    apiMock.mockImplementation((path, options) =>
      path === root && !options.method
        ? Promise.reject(
            new ApiFailure(503, "UNAVAILABLE", "Fictional access outage"),
          )
        : original(path, options),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Recheck event email access" }),
    );
    await screen.findByText("Fictional access outage");
    expect(screen.queryByLabelText(/^Subject/)).toBeNull();
    expect(onQueued).not.toHaveBeenCalled();
  });
  it("keeps an ordinary draft when the navigation guard declines closing", () => {
    render(panel());
    fireEvent.change(screen.getByLabelText(/^Subject/), {
      target: { value: review.subject },
    });
    navigation.request.mockImplementation(() => {});
    fireEvent.click(screen.getByRole("button", { name: "Close email" }));
    expect(navigation.request).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect((screen.getByLabelText(/^Subject/) as HTMLInputElement).value).toBe(
      review.subject,
    );
  });
  it("retains message fields after preparation failure and retries without queueing mail", async () => {
    prepare = async () => {
      throw new ApiFailure(503, "UNAVAILABLE", "Fictional review outage");
    };
    render(panel());
    fireEvent.change(screen.getByLabelText(/^Subject/), {
      target: { value: review.subject },
    });
    fireEvent.change(screen.getByLabelText(/^Message/), {
      target: { value: review.message },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Review recipients and message" }),
    );
    await screen.findByText("Fictional review outage");
    expect(
      (screen.getByLabelText(/^Message/) as HTMLTextAreaElement).value,
    ).toBe(review.message);
    prepare = async () => review;
    fireEvent.click(
      screen.getByRole("button", { name: "Review recipients and message" }),
    );
    await screen.findByText(review.message);
    expect(approvals()).toHaveLength(0);
  });
  it("latches preparation and approval, freezes fields, and reports only a confirmed server result", async () => {
    const pending = deferred<unknown>();
    prepare = () => pending.promise;
    render(panel());
    fireEvent.change(screen.getByLabelText(/^Subject/), {
      target: { value: review.subject },
    });
    fireEvent.change(screen.getByLabelText(/^Message/), {
      target: { value: review.message },
    });
    const form = screen.getByLabelText(/^Subject/).closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(apiMock).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText(/^Subject/).matches(":disabled")).toBe(true);
    await act(async () => pending.resolve(review));
    proof();
    const saving = deferred<unknown>();
    approve = () => saving.promise;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(approvals()).toHaveLength(1);
    expect(onQueued).not.toHaveBeenCalled();
    expect(
      (screen.getByLabelText(/^Current password/) as HTMLInputElement).value,
    ).toBe("");
    await act(async () => saving.resolve({ recipientCount: 1 }));
    expect(onQueued).toHaveBeenCalledExactlyOnceWith(1);
  });
  it("reconciles an accepted-but-lost approval from a durable receipt without another POST", async () => {
    render(panel());
    await uncertain();
    recheck = async () => ({
      state: "queued",
      at: new Date().toISOString(),
      receipt: { recipientCount: 1, queued: true },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Recheck saved email approval" }),
    );
    await waitFor(() => expect(onQueued).toHaveBeenCalledExactlyOnceWith(1));
    expect(approvals()).toHaveLength(1);
    const read = apiMock.mock.calls.find(([path]) =>
      path.includes("?reviewId="),
    )!;
    expect(read[1].idempotencyKey).toBe(approvals()[0][1].idempotencyKey);
    expect(read[1].method).toBeUndefined();
  });
  it("requires read-only readiness and fresh proof before explicit immutable retry", async () => {
    render(panel());
    await uncertain();
    const retry = screen.getByRole("button", {
      name: "Retry original email approval",
    });
    expect((retry as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Recheck saved email approval" }),
    );
    await screen.findByText(/exact saved audience review remains ready/);
    expect(
      (screen.getByLabelText(/^Fresh current password/) as HTMLInputElement)
        .value,
    ).toBe("");
    expect(approvals()).toHaveLength(1);
    approve = async () => ({ recipientCount: 1 });
    fireEvent.change(screen.getByLabelText(/^Fresh current password/), {
      target: { value: "Fictional fresh proof" },
    });
    fireEvent.click(retry);
    await waitFor(() => expect(onQueued).toHaveBeenCalledExactlyOnceWith(1));
    expect(approvals()).toHaveLength(2);
    expect(approvals()[1][1].idempotencyKey).toBe(
      approvals()[0][1].idempotencyKey,
    );
    expect(approvals()[1][1].body).toEqual({
      ...approvals()[0][1].body,
      currentPassword: "Fictional fresh proof",
    });
  });
  it("keeps replay disabled after a failed recheck and retains the reviewed frozen content", async () => {
    render(panel());
    await uncertain();
    recheck = async () => {
      throw new ApiFailure(503, "UNAVAILABLE", "Fictional recheck outage");
    };
    fireEvent.click(
      screen.getByRole("button", { name: "Recheck saved email approval" }),
    );
    await screen.findByText("Fictional recheck outage");
    expect(screen.getByText(review.message)).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Retry original email approval",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(approvals()).toHaveLength(1);
  });
  it.each(["expired", "audience_changed", "changed", "used", "unavailable"])(
    "does not replay an unavailable %s review",
    async (reason) => {
      render(panel());
      await uncertain();
      recheck = async () => ({
        state: "unavailable",
        reason,
        at: new Date().toISOString(),
      });
      fireEvent.click(
        screen.getByRole("button", { name: "Recheck saved email approval" }),
      );
      await screen.findByText(/approval cannot be used/);
      fireEvent.change(screen.getByLabelText(/^Fresh current password/), {
        target: { value: "Fictional fresh proof" },
      });
      fireEvent.click(
        screen.getByRole("button", { name: "Retry original email approval" }),
      );
      expect(approvals()).toHaveLength(1);
      expect(onQueued).not.toHaveBeenCalled();
    },
  );
  it("refuses a recheck whose exact audience or message no longer matches retained approval", async () => {
    render(panel());
    await uncertain();
    recheck = async () => ({
      state: "ready",
      at: new Date().toISOString(),
      review: {
        ...review,
        recipients: [{ id: "changed", email: "changed@example.test" }],
      },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Recheck saved email approval" }),
    );
    await screen.findByText(/no longer matches this approval/);
    expect(
      (
        screen.getByRole("button", {
          name: "Retry original email approval",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(approvals()).toHaveLength(1);
  });
  it("expires an unsubmitted review at action time before another timer tick", async () => {
    render(panel());
    await savedReview();
    proof();
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 2 * 60 * 60 * 1000);
    fireEvent.submit(
      screen.getByLabelText(/^Current password/).closest("form")!,
    );
    await screen.findByText(/audience review expired/);
    expect(approvals()).toHaveLength(0);
  });
  it("bounds uncertain retries to 47 hours even when a saved review recheck reports ready", async () => {
    render(panel());
    await uncertain();
    const later = Date.now() + 47 * 60 * 60 * 1000;
    vi.spyOn(Date, "now").mockReturnValue(later);
    recheck = async () => ({
      state: "ready",
      at: new Date().toISOString(),
      review: { ...review, expiresAt: new Date(later + 60000).toISOString() },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Recheck saved email approval" }),
    );
    await screen.findByText(/exact saved audience review remains ready/);
    fireEvent.change(screen.getByLabelText(/^Fresh current password/), {
      target: { value: "Fictional fresh proof" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Retry original email approval" }),
    );
    await screen.findByText(/safe retry window ended/);
    expect(approvals()).toHaveLength(1);
  });
  it.each(["message", "close"] as const)(
    "reviews abandoning uncertainty before returning to %s",
    async (where) => {
      render(panel());
      await uncertain();
      const opener = screen.getByRole("button", {
        name: where === "close" ? "Close email" : "Back to message",
      });
      fireEvent.click(opener);
      expect(screen.getByRole("dialog").textContent).toContain(
        "cannot recall accepted messages",
      );
      expect(screen.getByRole("dialog").textContent).toContain(review.subject);
      fireEvent.click(screen.getByRole("button", { name: "Keep recovery" }));
      await waitFor(() => expect(document.activeElement).toBe(opener));
      expect(onClose).not.toHaveBeenCalled();
      fireEvent.click(opener);
      fireEvent.click(
        screen.getByRole("button", {
          name: "Abandon email recovery",
          exact: true,
        }),
      );
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(approvals()).toHaveLength(1);
      if (where === "close") expect(onClose).toHaveBeenCalledTimes(1);
      else
        expect(
          (screen.getByLabelText(/^Subject/) as HTMLInputElement).value,
        ).toBe(review.subject);
    },
  );
  it("requires a new read after reconnect and never automatically queues or rechecks", async () => {
    render(panel());
    await savedReview();
    proof();
    const count = apiMock.mock.calls.length;
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    fireEvent(window, new Event("offline"));
    expect(
      (screen.getByLabelText(/^Current password/) as HTMLInputElement).value,
    ).toBe("");
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    fireEvent(window, new Event("online"));
    expect(apiMock.mock.calls).toHaveLength(count);
    expect(
      (
        screen.getByRole("button", {
          name: "Queue 1 messages",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Recheck saved email approval" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Recheck saved email approval" }),
      ).toBeNull(),
    );
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "Review email to 1 attendees" }),
    );
    expect(approvals()).toHaveLength(0);
  });
  it.each([401, 403, 404])(
    "clears all private values on denied approval %s, then checks actual access before reopening",
    async (status) => {
      approve = async () => {
        throw new ApiFailure(status, "DENIED", "Fictional approval denied");
      };
      render(panel());
      await savedReview();
      proof();
      fireEvent.click(screen.getByRole("button", { name: "Queue 1 messages" }));
      const access = await screen.findByRole("button", {
        name: "Recheck event email access",
      });
      await waitFor(() => expect(document.activeElement).toBe(access));
      expect(screen.queryByText(review.message)).toBeNull();
      expect(screen.queryByLabelText(/^Current password/)).toBeNull();
      fireEvent.click(access);
      await screen.findByLabelText(/^Subject/);
      expect(
        apiMock.mock.calls.some(
          ([path, options]) => path === root && !options.method,
        ),
      ).toBe(true);
      expect(approvals()).toHaveLength(1);
    },
  );
  it("allows wrong-password correction without destroying the saved audience", async () => {
    approve = async () => {
      throw new ApiFailure(
        403,
        "PASSWORD_REQUIRED",
        "Fictional password rejected",
      );
    };
    render(panel());
    await savedReview();
    proof();
    fireEvent.click(screen.getByRole("button", { name: "Queue 1 messages" }));
    await screen.findByText("Fictional password rejected");
    const input = screen.getByLabelText(
      /^Current password/,
    ) as HTMLInputElement;
    expect(input.value).toBe("");
    expect(input.getAttribute("aria-describedby")).toBe(
      "event-mail-password-error",
    );
    approve = async () => ({ recipientCount: 1 });
    fireEvent.change(input, { target: { value: "Fictional corrected proof" } });
    fireEvent.click(screen.getByRole("button", { name: "Queue 1 messages" }));
    await waitFor(() => expect(onQueued).toHaveBeenCalledExactlyOnceWith(1));
    expect(approvals()[1][1].idempotencyKey).toBe(
      approvals()[0][1].idempotencyKey,
    );
  });
  it("requires a current read after a conflict without silently preparing a new audience", async () => {
    approve = async () => {
      throw new ApiFailure(
        409,
        "AUDIENCE_CHANGED",
        "Fictional audience changed",
      );
    };
    render(panel());
    await savedReview();
    proof();
    fireEvent.click(screen.getByRole("button", { name: "Queue 1 messages" }));
    await screen.findByText("Fictional audience changed");
    expect(
      screen.queryByRole("button", { name: "Retry original email approval" }),
    ).toBeNull();
    fireEvent.submit(
      screen.getByLabelText(/^Current password/).closest("form")!,
    );
    expect(approvals()).toHaveLength(1);
    expect(
      apiMock.mock.calls.filter(([path]) => path.endsWith("/email-review")),
    ).toHaveLength(1);
  });
  it("cancels preparation on event replacement and fences late private review data", async () => {
    const pending = deferred<unknown>();
    prepare = () => pending.promise;
    const view = render(panel());
    fireEvent.submit(screen.getByLabelText(/^Subject/).closest("form")!);
    const signal = apiMock.mock.calls[0][1].signal;
    view.rerender(panel("fictional-other-event"));
    expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve(review));
    expect(screen.queryByText(review.message)).toBeNull();
    expect((screen.getByLabelText(/^Subject/) as HTMLInputElement).value).toBe(
      "",
    );
  });
  it("cancels uncertain recheck on session invalidation and cannot deliver its late receipt callback", async () => {
    render(panel());
    await uncertain();
    const pending = deferred<unknown>();
    recheck = () => pending.promise;
    fireEvent.click(
      screen.getByRole("button", { name: "Recheck saved email approval" }),
    );
    const signal = apiMock.mock.calls.at(-1)![1].signal;
    fireEvent(window, new Event("gdg:session-cleared"));
    expect(signal.aborted).toBe(true);
    await act(async () =>
      pending.resolve({
        state: "queued",
        at: new Date().toISOString(),
        receipt: { queued: true, recipientCount: 1 },
      }),
    );
    expect(onQueued).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Recheck event email access" }),
    ).toBeTruthy();
  });
});
