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
import FormWriteRecovery, {
  type FormWriteIntent,
} from "../../src/ui/forms/FormWriteRecovery";
import { createTemplate } from "../../shared/forms";
import { ApiFailure } from "../../src/lib/api";
const { inspect, save, publish } = vi.hoisted(() => ({
  inspect: vi.fn(),
  save: vi.fn(),
  publish: vi.fn(),
}));
vi.mock("../../src/ui/forms/api", () => ({
  formsApi: { inspectWrite: inspect, save, publish },
}));
let intent: FormWriteIntent;
const reconciled = vi.fn(),
  denied = vi.fn(),
  busy = vi.fn();
function panel() {
  return (
    <FormWriteRecovery
      intent={intent}
      onReconciled={reconciled}
      onDenied={denied}
      onBusy={busy}
    />
  );
}
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
const recheck = () =>
  fireEvent.click(
    screen.getByRole("button", { name: "Recheck original write outcome" }),
  );
beforeEach(() => {
  vi.resetAllMocks();
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: true,
  });
  intent = {
    action: "draft",
    snapshot: {
      ...createTemplate("Fictional original save", "interest"),
      id: "fictional-form",
      revision: 3,
      actions: ["view", "edit", "publish"],
    },
    key: "fictional-original-key",
    startedAt: Date.now(),
  };
  inspect.mockImplementation(async () => ({
    committed: false,
    form: structuredClone(intent.snapshot),
  }));
  save.mockImplementation(async () => ({ ...intent.snapshot, revision: 4 }));
  publish.mockImplementation(async () => ({ ...intent.snapshot, revision: 4 }));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("Explicit original form write recovery", () => {
  it("does no work on mount and requires read-only inspection before offering exact retry", async () => {
    render(panel());
    expect(inspect).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Retry this exact draft save" }),
    ).toBeNull();
    recheck();
    await screen.findByRole("button", { name: "Retry this exact draft save" });
    expect(inspect).toHaveBeenCalledWith(
      intent.snapshot.id,
      "draft",
      intent.key,
      expect.any(AbortSignal),
    );
    expect(save).not.toHaveBeenCalled();
    expect(reconciled).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toBe(document.activeElement);
  });
  it.each(["draft", "publish"] as const)(
    "reconciles accepted %s without repeating a mutation",
    async (action) => {
      intent.action = action;
      const form = { ...intent.snapshot, revision: 8 };
      inspect.mockResolvedValue({
        committed: true,
        form,
        receipt: { revision: 4 },
      });
      render(panel());
      recheck();
      await screen.findByText(/The original change is confirmed/);
      expect(reconciled).toHaveBeenCalledWith(form);
      expect(save).not.toHaveBeenCalled();
      expect(publish).not.toHaveBeenCalled();
      expect(
        screen.queryByRole("button", { name: /Retry this exact/ }),
      ).toBeNull();
    },
  );
  it.each(["draft", "publish"] as const)(
    "retries %s only after explicit activation with the original snapshot/key",
    async (action) => {
      intent.action = action;
      render(panel());
      recheck();
      const button = await screen.findByRole("button", {
        name:
          action === "draft"
            ? "Retry this exact draft save"
            : "Retry this exact publication",
      });
      fireEvent.click(button);
      fireEvent.click(button);
      await screen.findByText(/The original change is confirmed/);
      const mutation = action === "draft" ? save : publish;
      expect(mutation).toHaveBeenCalledTimes(1);
      expect(mutation).toHaveBeenCalledWith(
        intent.snapshot,
        expect.any(AbortSignal),
        intent.key,
      );
      expect(busy).toHaveBeenLastCalledWith(false);
    },
  );
  it.each(["revision", "permission", "archived"])(
    "does not retry after current %s changes",
    async (changed) => {
      const form = {
        ...intent.snapshot,
        ...(changed === "revision"
          ? { revision: 9 }
          : changed === "permission"
            ? { actions: ["view"] }
            : { status: "Archived" }),
      };
      inspect.mockResolvedValue({ committed: false, form });
      render(panel());
      recheck();
      await screen.findByText(/The saved revision or permissions changed/);
      expect(
        screen.queryByRole("button", { name: /Retry this exact/ }),
      ).toBeNull();
    },
  );
  it("makes another check necessary after inspection failure, preserving the original draft", async () => {
    inspect.mockRejectedValueOnce(
      new Error("Fictional inspection unavailable"),
    );
    render(panel());
    recheck();
    await screen.findByRole("alert");
    expect(screen.getByText(/Fictional original save/)).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
    recheck();
    await screen.findByRole("button", { name: "Retry this exact draft save" });
  });
  it("pauses after a second lost response and rechecks before another retry", async () => {
    save.mockRejectedValue(new Error("Fictional lost retry response"));
    render(panel());
    recheck();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Retry this exact draft save",
      }),
    );
    await screen.findByRole("alert");
    expect(save).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("button", { name: /Retry this exact/ }),
    ).toBeNull();
  });
  it.each([401, 403, 404])(
    "clears private recovery through the owner callback on %s",
    async (status) => {
      inspect.mockRejectedValue(
        new ApiFailure(status, "FORBIDDEN", "Fictional denial"),
      );
      render(panel());
      recheck();
      await waitFor(() => expect(denied).toHaveBeenCalledTimes(1));
      expect(reconciled).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
    },
  );
  it("cancels inspection on unmount and ignores its late result", async () => {
    const result = deferred<{
      committed: boolean;
      form: FormWriteIntent["snapshot"];
    }>();
    inspect.mockReturnValue(result.promise);
    const view = render(panel());
    recheck();
    const signal = inspect.mock.calls[0][3];
    view.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () =>
      result.resolve({ committed: true, form: intent.snapshot }),
    );
    expect(reconciled).not.toHaveBeenCalled();
  });
  it("cancels a pending retry offline and requires a fresh read after reconnecting", async () => {
    const result = deferred<FormWriteIntent["snapshot"]>();
    save.mockReturnValue(result.promise);
    render(panel());
    recheck();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Retry this exact draft save",
      }),
    );
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    fireEvent(window, new Event("offline"));
    expect(save.mock.calls[0][1].aborted).toBe(true);
    await act(async () => result.resolve(intent.snapshot));
    expect(reconciled).not.toHaveBeenCalled();
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    fireEvent(window, new Event("online"));
    expect(
      screen.queryByRole("button", { name: /Retry this exact/ }),
    ).toBeNull();
    expect(inspect).toHaveBeenCalledTimes(1);
  });
  it("checks the 47-hour bound again at retry activation", async () => {
    render(panel());
    recheck();
    const button = await screen.findByRole("button", {
      name: "Retry this exact draft save",
    });
    vi.spyOn(Date, "now").mockReturnValue(
      intent.startedAt + 47 * 60 * 60 * 1000,
    );
    fireEvent.click(button);
    expect(save).not.toHaveBeenCalled();
  });
  it("blocks already expired or clock-reversed intents", () => {
    intent.startedAt = Date.now() + 10000;
    render(panel());
    expect(
      screen.getByRole("button", { name: "Recheck original write outcome" }),
    ).toHaveProperty("disabled", true);
    expect(screen.getByText(/safe retry window ended/)).toBeTruthy();
  });
});
