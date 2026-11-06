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
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import ResponseAvailability from "../../src/ui/forms/ResponseAvailability";
import { createTemplate, type PreviewForm } from "../../shared/forms";
import { ApiFailure } from "../../src/lib/api";
const { apiMock, identity, guard } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  identity: { id: "fictional-availability-admin", role: "admin" },
  guard: vi.fn(),
}));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: apiMock,
}));
vi.mock("@/contexts/AdminContext", () => ({
  useAdmin: () => ({ currentAdmin: identity }),
}));
vi.mock("@/hooks/useDraftGuard", () => ({ useDraftGuard: guard }));
type Options = {
  method?: string;
  body?: Record<string, unknown>;
  idempotencyKey?: string;
  signal?: AbortSignal;
};
let form: PreviewForm,
  mode: "" | "before" | "after",
  commits: number,
  receipts: Map<string, PreviewForm>,
  failure: Error | undefined,
  inspectionFailure: Error | undefined;
const handlers = { onComplete: vi.fn(), onDenied: vi.fn(), onReload: vi.fn() };
const writes = () => apiMock.mock.calls.filter(([, o]) => o?.method);
function renderUI(props = {}) {
  return (
    <MemoryRouter>
      <ResponseAvailability
        form={form}
        disabled={false}
        {...handlers}
        {...props}
      />
    </MemoryRouter>
  );
}
function click(name: string) {
  fireEvent.click(screen.getByRole("button", { name, exact: true }));
}
async function review(state: "Open" | "Closed" = "Open") {
  form.status = state;
  const view = render(renderUI());
  click(state === "Open" ? "Close form" : "Reopen form");
  return {
    view,
    dialog: screen.getByRole("dialog"),
    label: state === "Open" ? "Close form" : "Reopen form",
  };
}
async function uncertain() {
  return screen.findByRole("region", {
    name: "Unconfirmed form library change",
  });
}
beforeEach(() => {
  form = {
    ...createTemplate("Fictional workspace availability", "interest"),
    id: "f1420000-0000-4000-8000-000000000078",
    revision: 3,
    status: "Open",
    actions: ["view", "publish", "view_responses"],
  };
  form.versions = [
    {
      ...structuredClone(form),
      version: 1,
      publishedAt: "2026-11-06T01:00:00Z",
    },
  ];
  mode = "";
  commits = 0;
  receipts = new Map();
  failure = undefined;
  inspectionFailure = undefined;
  apiMock.mockReset();
  guard.mockReset();
  Object.values(handlers).forEach((fn) => fn.mockReset());
  identity.id = "fictional-availability-admin";
  identity.role = "admin";
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  apiMock.mockImplementation(async (path: string, options: Options = {}) => {
    if (options.method) {
      if (failure) throw failure;
      if (mode === "before") {
        mode = "";
        throw new TypeError("Fictional connection loss");
      }
      if (!receipts.has(options.idempotencyKey!)) {
        form = {
          ...form,
          status: options.body!.state as PreviewForm["status"],
          revision: form.revision! + 1,
        };
        commits++;
        receipts.set(options.idempotencyKey!, structuredClone(form));
      }
      if (mode === "after") {
        mode = "";
        throw new TypeError("Fictional acknowledgement loss");
      }
      return { form: receipts.get(options.idempotencyKey!) };
    }
    if (path.startsWith("/admin/forms/recovery?")) {
      if (inspectionFailure) throw inspectionFailure;
      const saved = receipts.get(options.idempotencyKey!);
      return { committed: !!saved, form: saved || form, canCreate: false };
    }
    throw Error("Unexpected fixture read");
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
for (const state of ["Open", "Closed"] as const)
  for (const position of ["before", "after"] as const) {
    it(`reviews ${state} availability and reconciles ${position} loss with original metadata`, async () => {
      mode = position;
      const { dialog, label } = await review(state);
      expect(writes()).toHaveLength(0);
      expect(within(dialog).getByText(/Saved revision 3/)).toBeTruthy();
      fireEvent.click(
        within(dialog).getByRole("button", { name: label, exact: true }),
      );
      const recovery = await uncertain();
      expect(guard.mock.calls.at(-1)?.[0]).toBe(true);
      const original = writes()[0][1];
      expect(original.body).toEqual({
        revision: 3,
        state: state === "Open" ? "Closed" : "Open",
      });
      click("Recheck original library change");
      if (position === "before") {
        await within(recovery).findByRole("button", {
          name:
            "Retry this exact " +
            (state === "Open" ? "close" : "reopen") +
            " request",
        });
        click(
          "Retry this exact " +
            (state === "Open" ? "close" : "reopen") +
            " request",
        );
      }
      await waitFor(() => expect(handlers.onComplete).toHaveBeenCalledTimes(1));
      expect(commits).toBe(1);
      expect(writes()).toHaveLength(position === "before" ? 2 : 1);
      if (position === "before") {
        expect(writes()[1][1].body).toEqual(original.body);
        expect(writes()[1][1].idempotencyKey).toBe(original.idempotencyKey);
      }
    });
  }
it("latches duplicate confirmations and prevents pending dismissal", async () => {
  let resolve!: (v: unknown) => void;
  apiMock.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const { dialog } = await review();
  const confirm = within(dialog).getByRole("button", {
    name: "Close form",
    exact: true,
  });
  fireEvent.click(confirm);
  fireEvent.click(confirm);
  expect(writes()).toHaveLength(1);
  fireEvent.keyDown(dialog, { key: "Escape" });
  expect(screen.getByRole("dialog")).toBeTruthy();
  await act(async () =>
    resolve({ form: { ...form, revision: 4, status: "Closed" } }),
  );
  expect(handlers.onComplete).toHaveBeenCalledTimes(1);
});
for (const field of ["revision", "status", "archived"] as const)
  it("rejects changed " + field + " before dispatch", async () => {
    const { view, dialog } = await review();
    form = {
      ...form,
      ...(field === "revision"
        ? { revision: 4 }
        : field === "status"
          ? { status: "Closed" as const }
          : field === "archived"
            ? { status: "Archived" as const }
            : { actions: ["view", "view_responses"] }),
    };
    view.rerender(renderUI());
    expect(
      (
        within(dialog).getByRole("button", {
          name: "Close form",
          exact: true,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(writes()).toHaveLength(0);
  });
it("pauses confirmation when private source reads fail without discarding review", async () => {
  const { view, dialog } = await review();
  view.rerender(renderUI({ disabled: true }));
  expect(
    within(dialog).getByText(/Current response and saved-form reads/),
  ).toBeTruthy();
  expect(
    (
      within(dialog).getByRole("button", {
        name: "Close form",
        exact: true,
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(writes()).toHaveLength(0);
});
for (const status of [400, 409, 429])
  it("requires an explicit fresh review after known " + status, async () => {
    failure = new ApiFailure(status, "CONFLICT", "Fictional stale review");
    const { dialog } = await review();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Close form", exact: true }),
    );
    await screen.findByRole("button", {
      name: "Reload current form and review again",
    });
    expect(
      screen.queryByRole("region", { name: "Unconfirmed form library change" }),
    ).toBeNull();
    click("Reload current form and review again");
    expect(handlers.onReload).toHaveBeenCalledTimes(1);
    expect(writes()).toHaveLength(1);
  });
for (const status of [401, 403, 404])
  it("clears denied write state " + status, async () => {
    failure = new ApiFailure(status, "FORBIDDEN", "Fictional access change");
    const { dialog } = await review();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Close form", exact: true }),
    );
    await waitFor(() => expect(handlers.onDenied).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
it("requires a new outcome inspection after a second retry loses its response", async () => {
  mode = "before";
  const { dialog } = await review();
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Close form", exact: true }),
  );
  await uncertain();
  click("Recheck original library change");
  await screen.findByRole("button", { name: "Retry this exact close request" });
  mode = "after";
  click("Retry this exact close request");
  await screen.findByText(/The connection was interrupted/);
  expect(
    screen.queryByRole("button", { name: "Retry this exact close request" }),
  ).toBeNull();
  click("Recheck original library change");
  await waitFor(() => expect(handlers.onComplete).toHaveBeenCalledTimes(1));
  expect(commits).toBe(1);
  expect(writes()).toHaveLength(2);
});
it("reviewed abandonment reloads without a replacement write", async () => {
  mode = "after";
  const { dialog } = await review();
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Close form", exact: true }),
  );
  await uncertain();
  click("Review stopping recovery");
  expect(handlers.onReload).not.toHaveBeenCalled();
  click("Stop tracking this availability change");
  expect(handlers.onReload).toHaveBeenCalledTimes(1);
  expect(writes()).toHaveLength(1);
});
it("session invalidation cancels pending work and rejects its late completion", async () => {
  let resolve!: (v: unknown) => void;
  apiMock.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const { dialog } = await review();
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Close form", exact: true }),
  );
  const signal = writes()[0][1].signal;
  act(() => window.dispatchEvent(new Event("gdg:session-cleared")));
  expect(signal.aborted).toBe(true);
  await act(async () =>
    resolve({ form: { ...form, revision: 4, status: "Closed" } }),
  );
  expect(handlers.onComplete).not.toHaveBeenCalled();
  expect(handlers.onDenied).toHaveBeenCalledTimes(1);
});
it("offline interruption aborts pending transport and reconnect never resubmits", async () => {
  let resolve!: (v: unknown) => void;
  apiMock.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const { dialog } = await review();
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Close form", exact: true }),
  );
  const signal = writes()[0][1].signal;
  act(() => window.dispatchEvent(new Event("offline")));
  await uncertain();
  expect(signal.aborted).toBe(true);
  act(() => window.dispatchEvent(new Event("online")));
  expect(writes()).toHaveLength(1);
  await act(async () =>
    resolve({ form: { ...form, revision: 4, status: "Closed" } }),
  );
  expect(handlers.onComplete).not.toHaveBeenCalled();
});
it("different account context aborts late writes without restoring a private review", async () => {
  let resolve!: (v: unknown) => void;
  apiMock.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const { view, dialog } = await review();
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Close form", exact: true }),
  );
  const signal = writes()[0][1].signal;
  identity.id = "fictional-replacement";
  view.rerender(renderUI());
  expect(signal.aborted).toBe(true);
  await act(async () =>
    resolve({ form: { ...form, revision: 4, status: "Closed" } }),
  );
  expect(handlers.onComplete).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("unpublished and archived forms cannot reopen", () => {
  form.status = "Archived";
  form.versions = [];
  render(renderUI());
  expect(
    (screen.getByRole("button", { name: "Reopen form" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(screen.getByText(/Restore this form as a private draft/)).toBeTruthy();
  expect(writes()).toHaveLength(0);
});
it("substituted successful targets stay unconfirmed", async () => {
  apiMock.mockImplementationOnce(async () => ({
    form: { ...form, id: "fictional-substitute", revision: 4 },
  }));
  const { dialog } = await review();
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Close form", exact: true }),
  );
  await uncertain();
  expect(handlers.onComplete).not.toHaveBeenCalled();
});

it("clears a private availability review when publication access is revoked", async () => {
  const { view } = await review();
  form = { ...form, actions: ["view", "view_responses"] };
  view.rerender(renderUI());
  await waitFor(() => expect(handlers.onDenied).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(writes()).toHaveLength(0);
});
