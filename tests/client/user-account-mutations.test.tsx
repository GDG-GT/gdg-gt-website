// @vitest-environment jsdom
import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import UserWorkspace from "../../src/ui/users/UserWorkspace";
import { ApiFailure } from "../../src/lib/api";
const { apiMock, actor } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  actor: { id: "fictional-directory-superadmin", role: "super_admin" },
}));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: apiMock,
}));
vi.mock("@/contexts/AdminContext", () => ({
  useAdmin: () => ({ currentAdmin: actor }),
}));
vi.mock("@/hooks/useDraftGuard", () => ({ useDraftGuard: vi.fn() }));
const person = {
    id: "fictional-person",
    display_name: "Fictional private person",
    email: "fictional-person@example.test",
    role: "team_member",
    is_active: true,
    must_change_password: false,
    revision: 1,
    deleted_at: null,
    last_login_at: null,
    locked_until: null,
  },
  second = {
    ...person,
    id: "fictional-second",
    display_name: "Fictional second person",
    email: "fictional-second@example.test",
  },
  directoryPath = "/admin/users?q=&state=current&page=1",
  sessionPath = "/admin/users/" + person.id + "/sessions";
let read: (path: string) => unknown;
let current = { ...person };
let write: (
  path: string,
  options: { method: string; body: Record<string, unknown> },
) => Promise<unknown>;
function defaults(path: string) {
  if (/^\/admin\/users\/[^/]+$/.test(path))
    return { record: path.endsWith(second.id) ? second : current };
  return path.endsWith("/sessions")
    ? {
        items: [
          {
            id: "fictional-session",
            created_at: "2026-11-01T12:00:00Z",
            last_seen_at: "2026-11-05T12:00:00Z",
            idle_expires_at: "2099-11-05T12:00:00Z",
          },
        ],
      }
    : {
        items: [current, second],
        total: 21,
        page: 1,
        pageSize: 20,
        actorId: actor.id,
      };
}
function pending() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const body = () => (
  <main id="workspace-content" tabIndex={-1}>
    <UserWorkspace />
  </main>
);
const row = (email = person.email) =>
  within(screen.getByText(email).closest("tr")!);
async function openSessions(email = person.email) {
  await screen.findByText(email);
  const opener = row(email).getByRole("button", {
    name: "Sessions",
    exact: true,
  });
  opener.focus();
  fireEvent.click(opener);
  return opener;
}
beforeEach(() => {
  apiMock.mockReset();
  actor.id = "fictional-directory-superadmin";
  actor.role = "super_admin";
  read = defaults;
  current = { ...person };
  write = async (_path, options) => {
    current = {
      ...current,
      ...((options.body.record as object) || {}),
      revision: current.revision + 1,
    };
    return { record: current };
  };
  apiMock.mockImplementation((path, options) =>
    options?.method
      ? write(path, options)
      : Promise.resolve().then(() => read(path)),
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
const writes = () =>
  apiMock.mock.calls.filter(([, options]) => options?.method);
async function editAccount() {
  await screen.findByText(person.email);
  fireEvent.click(row().getByRole("button", { name: "Edit", exact: true }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Save account" }).matches(":disabled"),
    ).toBe(false),
  );
}
async function submitEditor() {
  fireEvent.change(screen.getByLabelText(/^Confirm your own password/), {
    target: { value: "Fictional current password" },
  });
  fireEvent.submit(screen.getByLabelText(/^Display name/).closest("form")!);
  await screen.findByRole("dialog");
}
describe("Account mutation reviews and uncertain-result recovery", () => {
  it("returns a dismissed review to the actual submitter even when the password input held focus", async () => {
    render(body());
    await editAccount();
    const password = screen.getByLabelText(/^Confirm your own password/);
    fireEvent.change(password, {
      target: { value: "Fictional focused proof" },
    });
    password.focus();
    const save = screen.getByRole("button", { name: "Save account" }),
      form = save.closest("form")!;
    const submission = new Event("submit", { bubbles: true, cancelable: true });
    Object.defineProperty(submission, "submitter", { value: save });
    fireEvent(form, submission);
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    await waitFor(() => expect(document.activeElement).toBe(save));
    expect(writes()).toHaveLength(0);
  });
  it("refuses expired retries and reviews abandoning an operation that may have completed", async () => {
    const startedAt = Date.now();
    write = async () => {
      throw Error("Fictional old uncertain save");
    };
    render(body());
    await editAccount();
    await submitEditor();
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm account change" }),
    );
    await screen.findByRole("button", { name: "Recheck saved account values" });
    vi.spyOn(Date, "now").mockReturnValue(startedAt + 48 * 60 * 60 * 1000);
    fireEvent.click(
      screen.getByRole("button", { name: "Recheck saved account values" }),
    );
    await screen.findByText("Inspect current saved account values");
    fireEvent.change(screen.getByLabelText(/^Current password for retry/), {
      target: { value: "Fictional new proof" },
    });
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Retry original account operation" })
          .matches(":disabled"),
      ).toBe(false),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Retry original account operation" }),
    );
    await screen.findByText(/The safe retry window ended/, {
      selector: "[role=alert]",
    });
    expect(writes()).toHaveLength(1);
    fireEvent.click(
      screen.getByRole("button", { name: "Review abandoning this operation" }),
    );
    expect(screen.getByRole("dialog").textContent).toContain(
      "may already have completed",
    );
    fireEvent.click(screen.getByRole("button", { name: "Abandon recovery" }));
    expect(screen.queryByLabelText(/^Current password for retry/)).toBeNull();
    expect(writes()).toHaveLength(1);
  });
  it("recovers an independent selected-account read before enabling a write", async () => {
    read = (path) => {
      if (path === "/admin/users/" + person.id)
        throw Error("Fictional selected account outage");
      return defaults(path);
    };
    render(body());
    await screen.findByText(person.email);
    fireEvent.click(row().getByRole("button", { name: "Edit", exact: true }));
    await screen.findByRole("button", { name: "Retry selected account" });
    expect(
      screen.getByRole("button", { name: "Save account" }).matches(":disabled"),
    ).toBe(true);
    read = defaults;
    fireEvent.click(
      screen.getByRole("button", { name: "Retry selected account" }),
    );
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Save account" })
          .matches(":disabled"),
      ).toBe(false),
    );
    expect(writes()).toHaveLength(0);
  });
  it("reviews target identity and role consequences before an account edit", async () => {
    render(body());
    await editAccount();
    fireEvent.change(screen.getByLabelText(/^Display name/), {
      target: { value: "Fictional updated name" },
    });
    fireEvent.change(screen.getByLabelText(/^Account role/), {
      target: { value: "blog_editor" },
    });
    await submitEditor();
    expect(screen.getByRole("dialog").textContent).toContain(person.email);
    expect(screen.getByRole("dialog").textContent).toContain(
      "Team member → Blog editor",
    );
    expect(screen.getByRole("dialog").textContent).toContain(
      "sign out existing sessions",
    );
    expect(writes()).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(
      (screen.getByLabelText(/^Display name/) as HTMLInputElement).value,
    ).toBe("Fictional updated name");
  });
  it("reviews the exact new recipient and queued setup-link consequence before creation", async () => {
    render(body());
    await screen.findByText(person.email);
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    fireEvent.change(screen.getByLabelText(/^Display name/), {
      target: { value: "Fictional new account" },
    });
    fireEvent.change(screen.getByLabelText(/^Account email/), {
      target: { value: "fictional-created@example.test" },
    });
    await submitEditor();
    expect(screen.getByRole("dialog").textContent).toContain(
      "fictional-created@example.test",
    );
    expect(screen.getByRole("dialog").textContent).toContain(
      "Queue one intended-recipient setup link",
    );
    expect(writes()).toHaveLength(0);
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm account change" }),
    );
    await screen.findByText(/Account creation confirmed by the server/);
    expect(writes()).toHaveLength(1);
    expect(writes()[0][1]).toMatchObject({
      method: "POST",
      idempotencyKey: expect.any(String),
      body: {
        currentPassword: "Fictional current password",
        record: {
          email: "fictional-created@example.test",
          role: "team_member",
        },
      },
    });
  });
  it("admits one pending save, freezes inputs and keeps its modal open until acknowledgment", async () => {
    const delayed = pending();
    write = () => delayed.promise;
    render(body());
    await editAccount();
    await submitEditor();
    const confirm = screen.getByRole("button", {
      name: "Confirm account change",
    });
    act(() => {
      fireEvent.click(confirm);
      fireEvent.click(confirm);
    });
    expect(writes()).toHaveLength(1);
    expect(screen.getByLabelText(/^Display name/).matches(":disabled")).toBe(
      true,
    );
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Keep editing" }).matches(":disabled"),
    ).toBe(true);
    expect(screen.queryByText(/Account update confirmed/)).toBeNull();
    await act(async () =>
      delayed.resolve({ record: { ...current, revision: 2 } }),
    );
    await screen.findByText(/Account update confirmed by the server/);
    expect(writes()[0][1].signal).toBeInstanceOf(AbortSignal);
  });
  it("rechecks an uncertain save without a password/write, then replays exact intent with fresh proof", async () => {
    let first = true;
    write = async () => {
      if (first) {
        first = false;
        throw Error("Fictional lost receipt");
      }
      return { record: { ...current, revision: 2 } };
    };
    render(body());
    await editAccount();
    await submitEditor();
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm account change" }),
    );
    await screen.findByRole("button", { name: "Recheck saved account values" });
    expect(
      (screen.getByLabelText(/^Current password for retry/) as HTMLInputElement)
        .value,
    ).toBe("");
    expect(
      screen
        .getByRole("button", { name: "Retry original account operation" })
        .matches(":disabled"),
    ).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Recheck saved account values" }),
    );
    await screen.findByText("Inspect current saved account values");
    expect(writes()).toHaveLength(1);
    fireEvent.change(screen.getByLabelText(/^Current password for retry/), {
      target: { value: "Fictional fresh password proof" },
    });
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Retry original account operation" })
          .matches(":disabled"),
      ).toBe(false),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Retry original account operation" }),
    );
    await screen.findByText(/Account update confirmed by the server/);
    expect(writes()).toHaveLength(2);
    expect(writes()[1][1].idempotencyKey).toBe(writes()[0][1].idempotencyKey);
    const { currentPassword: firstProof, ...firstBody } = writes()[0][1].body;
    const { currentPassword: secondProof, ...secondBody } = writes()[1][1].body;
    expect(firstProof).not.toBe(secondProof);
    expect(secondBody).toEqual(firstBody);
  });
  it("associates a rejected password with its field while preserving the reviewed account", async () => {
    write = async () => {
      throw new ApiFailure(
        403,
        "PASSWORD_CONFIRMATION_FAILED",
        "Fictional password confirmation failed",
      );
    };
    render(body());
    await editAccount();
    await submitEditor();
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm account change" }),
    );
    await screen.findByText("Fictional password confirmation failed", {
      selector: "[role=alert]",
    });
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    const password = screen.getByLabelText(
      /^Confirm your own password/,
    ) as HTMLInputElement;
    expect(password.value).toBe("");
    expect(password.getAttribute("aria-invalid")).toBe("true");
    expect(
      screen.queryByText("Account access needs to be rechecked"),
    ).toBeNull();
    fireEvent.change(password, {
      target: { value: "Fictional corrected proof" },
    });
    expect(password.getAttribute("aria-invalid")).toBeNull();
  });
  it.each([401, 403, 404])(
    "clears all account fields and credentials after %i mutation denial",
    async (status) => {
      write = async () => {
        throw new ApiFailure(
          status,
          "FORBIDDEN",
          "Current account access unavailable",
        );
      };
      render(body());
      await editAccount();
      await submitEditor();
      fireEvent.click(
        screen.getByRole("button", { name: "Confirm account change" }),
      );
      await screen.findByText("Account access needs to be rechecked");
      expect(screen.queryByDisplayValue(person.email)).toBeNull();
      expect(
        screen.queryByDisplayValue("Fictional current password"),
      ).toBeNull();
      fireEvent.click(
        screen.getByRole("button", { name: "Recheck account access" }),
      );
      await screen.findByText(person.email);
      expect(screen.queryByRole("dialog")).toBeNull();
    },
  );
  it.each(["id", "role", "session"])(
    "cancels pending account writes and fences late receipts after %s replacement",
    async (kind) => {
      const delayed = pending();
      write = () => delayed.promise;
      const view = render(body());
      await editAccount();
      await submitEditor();
      fireEvent.click(
        screen.getByRole("button", { name: "Confirm account change" }),
      );
      const signal = writes()[0][1].signal;
      if (kind === "session")
        act(() => window.dispatchEvent(new Event("gdg:session-cleared")));
      else {
        actor[kind] = "replacement";
        view.rerender(body());
      }
      await waitFor(() => expect(signal.aborted).toBe(true));
      await act(async () => delayed.resolve({ record: current }));
      expect(
        screen.queryByText(/Account update confirmed by the server/),
      ).toBeNull();
      expect(screen.queryByRole("dialog")).toBeNull();
    },
  );
  it("retains stale editor fields and explicitly reviews replacing them with current saved values", async () => {
    render(body());
    await editAccount();
    const name = screen.getByLabelText(/^Display name/) as HTMLInputElement;
    fireEvent.change(name, { target: { value: "Fictional retained name" } });
    current = {
      ...current,
      display_name: "Fictional other saved name",
      revision: 2,
    };
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh selected account" }),
    );
    await screen.findByText(/The saved account changed/);
    expect(name.value).toBe("Fictional retained name");
    expect(
      screen.getByRole("button", { name: "Save account" }).matches(":disabled"),
    ).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Review loading saved account" }),
    );
    expect(screen.getByRole("dialog").textContent).toContain(
      "No server write occurs",
    );
    fireEvent.click(screen.getByRole("button", { name: "Load saved account" }));
    expect(name.value).toBe("Fictional other saved name");
    expect(writes()).toHaveLength(0);
  });
  it("blocks a save review when the selected account revision changes", async () => {
    render(body());
    await editAccount();
    await submitEditor();
    current = { ...current, revision: 2 };
    fireEvent.click(
      screen.getByRole("button", {
        name: "Refresh selected account",
        hidden: true,
      }),
    );
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Confirm account change" })
          .matches(":disabled"),
      ).toBe(true),
    );
    expect(writes()).toHaveLength(0);
  });
  it("keeps offline fields and never auto-submits when connectivity returns", async () => {
    render(body());
    await editAccount();
    fireEvent.change(screen.getByLabelText(/^Display name/), {
      target: { value: "Fictional offline draft" },
    });
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    act(() => window.dispatchEvent(new Event("offline")));
    fireEvent.submit(screen.getByLabelText(/^Display name/).closest("form")!);
    expect(writes()).toHaveLength(0);
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    act(() => window.dispatchEvent(new Event("online")));
    expect(
      (screen.getByLabelText(/^Display name/) as HTMLInputElement).value,
    ).toBe("Fictional offline draft");
    expect(writes()).toHaveLength(0);
  });
  it("reviews discarding unsaved account input and clears entered password only after confirmation", async () => {
    render(body());
    await editAccount();
    fireEvent.change(screen.getByLabelText(/^Confirm your own password/), {
      target: { value: "Fictional retained password" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Cancel", exact: true }),
    );
    expect(screen.getByRole("dialog").textContent).toContain(person.email);
    expect(writes()).toHaveLength(0);
    fireEvent.click(
      screen.getByRole("button", { name: "Discard unsaved input" }),
    );
    expect(
      screen.queryByDisplayValue("Fictional retained password"),
    ).toBeNull();
    expect(screen.queryByLabelText(/^Display name/)).toBeNull();
  });
  it("sends a typed-email security action against the freshly read revision", async () => {
    render(body());
    await screen.findByText(person.email);
    fireEvent.click(
      row().getByRole("button", { name: "Deactivate account", exact: true }),
    );
    fireEvent.change(screen.getByLabelText(/^Type the account email/), {
      target: { value: person.email },
    });
    fireEvent.change(screen.getByLabelText(/^Confirm your own password/), {
      target: { value: "Fictional current password" },
    });
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Confirm change" })
          .matches(":disabled"),
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm change" }));
    await screen.findByText(/Deactivate account confirmed by the server/);
    expect(writes()[0][1]).toMatchObject({
      method: "POST",
      idempotencyKey: expect.any(String),
      body: { action: "deactivate", revision: 1, confirmation: person.email },
    });
  });
});
