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
import SubmissionQueue, { QueueRuntime } from "../../src/pwa/SubmissionQueue";

const { queue, save } = vi.hoisted(() => ({
  queue: { list: vi.fn(), retry: vi.fn(), replay: vi.fn(), discard: vi.fn() },
  save: vi.fn(),
}));
vi.mock("../../shared/public-queue.mjs", () => ({ publicQueue: queue }));
vi.mock("../../src/pwa/queue-actions", () => ({ savePendingSubmission: save }));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const row = {
  id: "fictional-device-entry",
  kind: "event",
  slug: "fictional-event",
  state: "pending",
  reason: "Pending submission — not accepted by the server yet.",
  expiresAt: Date.now() + 3600000,
  attempts: 0,
  nextAt: 0,
  leaseUntil: 0,
};
beforeEach(() => {
  vi.resetAllMocks();
  queue.list.mockResolvedValue([]);
  queue.replay.mockResolvedValue(undefined);
  queue.retry.mockResolvedValue(undefined);
  queue.discard.mockResolvedValue(undefined);
  save.mockResolvedValue("fictional-device-entry");
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  // Focus must work even in a background tab with paused animation frames.
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 0),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function fillSignup() {
  await screen.findByText("No pending submissions are stored on this device.");
  fireEvent.click(screen.getByText("Save a newsletter signup for later"));
  fireEvent.change(screen.getByLabelText(/Newsletter email address/), {
    target: { value: "fictional-storage@example.test" },
  });
  fireEvent.click(
    screen.getByRole("checkbox", { name: /Save this email on this device/ }),
  );
}
function submitSignup() {
  fireEvent.submit(
    screen
      .getByRole("group", { name: "Newsletter device storage" })
      .closest("form")!,
  );
}
describe("PWA queue storage, feedback and recovery", () => {
  it("reads storage before claiming the queue is empty", async () => {
    const read = deferred<(typeof row)[]>();
    queue.list.mockReturnValue(read.promise);
    render(<SubmissionQueue />);
    expect(screen.getByRole("status").textContent).toContain("Reading pending");
    expect(
      screen.queryByText("No pending submissions are stored on this device."),
    ).toBeNull();
    read.resolve([row]);
    await screen.findByText("Event: fictional-event");
    expect(screen.queryByText(/Registration accepted/)).toBeNull();
  });
  it("recovers an unavailable store without treating it as an empty queue or replaying writes", async () => {
    queue.list
      .mockRejectedValueOnce(Error("fictional storage error"))
      .mockResolvedValue([]);
    render(<SubmissionQueue />);
    expect((await screen.findByRole("alert")).textContent).toContain(
      "has not been cleared",
    );
    expect(
      screen.queryByText("No pending submissions are stored on this device."),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Read device storage again" }),
    );
    await screen.findByText(
      "No pending submissions are stored on this device.",
    );
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("heading", {
          name: "Pending submissions on this device",
        }),
      ),
    );
    expect(queue.replay).not.toHaveBeenCalled();
    expect(queue.discard).not.toHaveBeenCalled();
  });
  it("focuses persistent storage failure after an explicit read retry", async () => {
    queue.list.mockRejectedValue(Error("fictional storage error"));
    render(<SubmissionQueue />);
    await screen.findByRole("alert");
    fireEvent.click(
      screen.getByRole("button", { name: "Read device storage again" }),
    );
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("alert")),
    );
  });
  it("fences an older storage read from replacing a more recent queue snapshot", async () => {
    const stale = deferred<(typeof row)[]>();
    queue.list.mockReturnValueOnce(stale.promise).mockResolvedValue([]);
    render(<SubmissionQueue />);
    act(() => window.dispatchEvent(new Event("gdg:queue-changed")));
    await screen.findByText(
      "No pending submissions are stored on this device.",
    );
    await act(async () => stale.resolve([row]));
    expect(screen.queryByText("Event: fictional-event")).toBeNull();
  });
  it("marks an unreadable refresh as stale and disables actions on that old snapshot", async () => {
    queue.list
      .mockResolvedValueOnce([row])
      .mockRejectedValue(Error("fictional later read failure"));
    render(<SubmissionQueue />);
    await screen.findByText("Event: fictional-event");
    act(() => window.dispatchEvent(new Event("gdg:queue-changed")));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "last successfully read copy",
    );
    expect(
      (screen.getByRole("button", { name: "Retry now" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Discard" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
  it("freezes a saved signup during the write and prevents duplicate submits before React commits", async () => {
    const writing = deferred<string>();
    save.mockReturnValue(writing.promise);
    render(<SubmissionQueue />);
    await fillSignup();
    submitSignup();
    submitSignup();
    expect(save).toHaveBeenCalledTimes(1);
    expect(
      (
        screen.getByRole("group", {
          name: "Newsletter device storage",
        }) as HTMLFieldSetElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByLabelText(/Newsletter email address/) as HTMLInputElement
      ).matches(":disabled"),
    ).toBe(true);
    writing.resolve("fictional-device-entry");
    const saved = await screen.findByText(
      /Pending signup saved on this device/,
    );
    await waitFor(() => expect(document.activeElement).toBe(saved));
    expect(saved.textContent).toContain(
      "not subscribed until the server accepts",
    );
    expect(
      (screen.getByLabelText(/Newsletter email address/) as HTMLInputElement)
        .value,
    ).toBe("");
    expect(save).toHaveBeenCalledWith("newsletter", {
      email: "fictional-storage@example.test",
      website: "",
    });
  });
  it("retains consent and email after a failed save and focuses the error", async () => {
    save.mockRejectedValue(Error("Fictional storage is full."));
    render(<SubmissionQueue />);
    await fillSignup();
    submitSignup();
    const error = await screen.findByRole("alert");
    await waitFor(() => expect(document.activeElement).toBe(error));
    expect(
      (screen.getByLabelText(/Newsletter email address/) as HTMLInputElement)
        .value,
    ).toBe("fictional-storage@example.test");
    expect(
      (
        screen.getByRole("checkbox", {
          name: /Save this email/,
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
    expect(screen.queryByText(/Pending signup saved/)).toBeNull();
  });
  it("requires storage consent even on a programmatic submit", async () => {
    render(<SubmissionQueue />);
    await screen.findByText(
      "No pending submissions are stored on this device.",
    );
    submitSignup();
    await screen.findByRole("alert");
    expect(save).not.toHaveBeenCalled();
  });
  it("disables manual retry offline and during another tab's active lease", async () => {
    const connected = vi
      .spyOn(navigator, "onLine", "get")
      .mockReturnValue(false);
    queue.list.mockResolvedValue([row]);
    render(<SubmissionQueue />);
    await screen.findByText("Event: fictional-event");
    expect(
      (screen.getByRole("button", { name: "Retry now" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    connected.mockReturnValue(true);
    act(() => window.dispatchEvent(new Event("online")));
    expect(
      (screen.getByRole("button", { name: "Retry now" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    queue.list.mockResolvedValue([{ ...row, leaseUntil: Date.now() + 60000 }]);
    act(() => window.dispatchEvent(new Event("gdg:queue-changed")));
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Retry now" }) as HTMLButtonElement)
          .disabled,
      ).toBe(true),
    );
    expect(queue.replay).not.toHaveBeenCalled();
  });
  it("restores keyboard focus after discarding the focused row and explains in-flight limits", async () => {
    queue.list.mockResolvedValueOnce([row]).mockResolvedValue([]);
    render(<SubmissionQueue />);
    await screen.findByText("Event: fictional-event");
    const discard = screen.getByRole("button", { name: "Discard" });
    discard.focus();
    fireEvent.click(discard);
    const notice = await screen.findByRole("status");
    await waitFor(() => expect(document.activeElement).toBe(notice));
    expect(notice.textContent).toContain(
      "does not cancel a request already received",
    );
    expect(queue.discard).toHaveBeenCalledWith(row.id);
  });
  it("offers original-page recovery for failed newsletter submissions without automatic retry", async () => {
    queue.list.mockResolvedValue([
      {
        ...row,
        kind: "newsletter",
        slug: null,
        state: "failed",
        reason: "The server declined this submission (429).",
      },
    ]);
    render(<SubmissionQueue />);
    await screen.findByText(/server declined/);
    expect(
      screen
        .getByRole("link", { name: /Review newsletter signup/ })
        .getAttribute("href"),
    ).toBe("/");
    expect(screen.queryByRole("button", { name: "Retry now" })).toBeNull();
    expect(queue.replay).not.toHaveBeenCalled();
  });
  it("reloads the true server state after manual retry instead of inventing acceptance", async () => {
    queue.list
      .mockResolvedValueOnce([row])
      .mockResolvedValue([
        {
          ...row,
          state: "failed",
          reason: "The event is full. Review the original page.",
        },
      ]);
    render(<SubmissionQueue />);
    await screen.findByText("Event: fictional-event");
    fireEvent.click(screen.getByRole("button", { name: "Retry now" }));
    await screen.findByText(/event is full/);
    expect(screen.queryByText(/Registration accepted/)).toBeNull();
    expect(queue.retry).toHaveBeenCalledWith(row.id);
    expect(queue.replay).toHaveBeenCalledTimes(1);
  });
});

describe("Queue replay lifecycle", () => {
  it("attempts replay on startup, online and a newly queued submission", async () => {
    render(<QueueRuntime />);
    expect(queue.replay).toHaveBeenCalledTimes(1);
    act(() => window.dispatchEvent(new Event("online")));
    act(() => window.dispatchEvent(new Event("gdg:queue-added")));
    expect(queue.replay).toHaveBeenCalledTimes(3);
    await act(async () => {});
  });
  it("pauses replay in this tab after logout storage clearing fails", async () => {
    render(<QueueRuntime />);
    act(() => window.dispatchEvent(new Event("gdg:queue-clear-failed")));
    expect(screen.getByRole("alert").textContent).toContain(
      "Automatic replay in this tab is paused",
    );
    act(() => window.dispatchEvent(new Event("online")));
    act(() => window.dispatchEvent(new Event("gdg:queue-added")));
    expect(queue.replay).toHaveBeenCalledTimes(1);
    await act(async () => {});
  });
});
