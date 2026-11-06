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
import { MemoryRouter, Route, Routes } from "react-router-dom";
import FormsLibrary from "../../src/ui/forms/FormsLibrary";
import { ApiFailure } from "../../src/lib/api";
import { createTemplate, type PreviewForm } from "../../shared/forms";
import {
  prepareFormLibraryWrite,
  submitFormLibraryWrite,
  inspectFormLibraryWrite,
} from "../../src/ui/forms/api";
const { apiMock, actor, guard, allow } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  actor: { id: "fictional-write-admin", role: "admin" },
  guard: vi.fn(),
  allow: vi.fn((run: () => void) => run()),
}));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: apiMock,
}));
vi.mock("@/contexts/AdminContext", () => ({
  useAdmin: () => ({ currentAdmin: actor, isSuperAdmin: false }),
}));
vi.mock("@/hooks/useDraftGuard", () => ({
  useDraftGuard: guard,
  useNavigationSafety: () => ({ allow }),
}));
type Options = {
  method?: string;
  body?: Record<string, unknown>;
  idempotencyKey?: string;
  signal?: AbortSignal;
};
const originalId = "f1690000-0000-4000-8000-000000000001",
  copyId = "f1690000-0000-4000-8000-000000000002";
let rows: PreviewForm[],
  receipts: Map<string, PreviewForm>,
  mode: "normal" | "before" | "after",
  commits: number,
  mutationError: Error | undefined,
  inspectionError: Error | undefined,
  mayCreate: boolean,
  malformed: boolean,
  override: ((path: string, options: Options) => Promise<unknown>) | undefined;
let view: ReturnType<typeof render>;
const writes = () => apiMock.mock.calls.filter(([, o]) => o.method);
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function seed(): PreviewForm {
  const f = {
    ...createTemplate("Fictional library write form", "interest"),
    id: originalId,
    slug: "fictional-library-write",
    revision: 1,
    status: "Open" as const,
    actions: ["view", "edit", "publish", "delete"],
    canDuplicate: true,
    ownerLabel: "Fictional reviewer",
    updatedAt: "2026-11-06T05:00:00Z",
  };
  f.versions = [
    { ...structuredClone(f), version: 1, publishedAt: "2026-11-06T05:00:00Z" },
  ];
  return f;
}
function commit(path: string, options: Options) {
  const key = options.idempotencyKey!;
  if (receipts.has(key)) return { form: structuredClone(receipts.get(key)!) };
  const body = options.body!,
    creating = path === "/admin/forms",
    duplicate = path.endsWith("/duplicate");
  let form: PreviewForm;
  if (creating || duplicate) {
    form = {
      ...structuredClone(rows[0]),
      id: copyId,
      revision: 1,
      status: "Draft",
      versions: [],
      slug: body.slug as string,
      ...(creating
        ? (body.definition as object)
        : { title: rows[0].title + " (copy)" }),
    };
    rows.push(form);
  } else {
    form = {
      ...rows[0],
      revision: rows[0].revision! + 1,
      status:
        options.method === "DELETE"
          ? "Archived"
          : path.endsWith("/restore")
            ? "Draft"
            : (body.state as PreviewForm["status"]),
    };
    rows[0] = form;
  }
  commits++;
  receipts.set(key, structuredClone(form));
  return { form: structuredClone(form) };
}
beforeEach(() => {
  rows = [seed()];
  receipts = new Map();
  mode = "normal";
  commits = 0;
  mutationError = undefined;
  inspectionError = undefined;
  mayCreate = true;
  malformed = false;
  override = undefined;
  actor.id = "fictional-write-admin";
  actor.role = "admin";
  guard.mockReset();
  allow.mockClear();
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: true,
  });
  apiMock
    .mockReset()
    .mockImplementation(async (path: string, options: Options = {}) => {
      if (options.method) {
        if (override) return override(path, options);
        if (mutationError) throw mutationError;
        if (mode === "before") {
          mode = "normal";
          throw new TypeError("Fictional dropped before acceptance");
        }
        const result = commit(path, options);
        if (mode === "after") {
          mode = "normal";
          throw new TypeError("Fictional lost accepted response");
        }
        return malformed ? { form: undefined } : result;
      }
      if (path.startsWith("/admin/forms/recovery?")) {
        if (inspectionError) throw inspectionError;
        const query = new URLSearchParams(path.split("?")[1]),
          accepted = receipts.get(options.idempotencyKey!);
        return {
          committed: !!accepted,
          canCreate: mayCreate,
          form: accepted
            ? structuredClone(accepted)
            : query.get("action") === "create"
              ? null
              : structuredClone(rows[0]),
        };
      }
      return {
        items: structuredClone(rows),
        total: rows.length,
        page: 1,
        pageSize: 30,
        canCreate: mayCreate,
      };
    });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function panel() {
  return (
    <MemoryRouter initialEntries={["/admin/forms"]}>
      <main id="workspace-content" tabIndex={-1}>
        <Routes>
          <Route path="/admin/forms" element={<FormsLibrary />} />
          <Route
            path="/admin/forms/:id/edit"
            element={<h1>Fictional created editor</h1>}
          />
        </Routes>
      </main>
    </MemoryRouter>
  );
}
async function start(action: string) {
  view = render(panel());
  await screen.findByRole("link", { name: /Fictional library write form/ });
  if (action === "create") {
    fireEvent.click(
      screen.getByRole("button", { name: "Create form", exact: true }),
    );
    fireEvent.change(await screen.findByLabelText(/Form title/), {
      target: { value: "Fictional original creation" },
    });
    const button = within(screen.getByRole("dialog")).getByRole("button", {
      name: "Create form",
      exact: true,
    });
    await waitFor(() => expect(button).toHaveProperty("disabled", false));
    return button;
  }
  fireEvent.keyDown(
    screen.getByRole("button", { name: "Actions for " + rows[0].title }),
    { key: "Enter" },
  );
  const label =
    action === "duplicate"
      ? "Duplicate"
      : action === "archive"
        ? "Archive form"
        : action === "restore"
          ? "Restore draft"
          : rows[0].status === "Open"
            ? "Close form"
            : "Reopen form";
  fireEvent.click(
    await screen.findByRole("menuitem", { name: label, exact: true }),
  );
  const confirm = within(await screen.findByRole("dialog")).getByRole(
    "button",
    { name: action === "duplicate" ? "Duplicate form" : label, exact: true },
  );
  await waitFor(() => expect(confirm).toHaveProperty("disabled", false));
  return confirm;
}
async function inspect() {
  fireEvent.click(
    screen.getByRole("button", { name: "Recheck original library change" }),
  );
}
describe("Form library original request recovery", () => {
  it("withholds creation retry when current creation authority is absent", async () => {
    const confirm = await start("create");
    mode = "before";
    fireEvent.click(confirm);
    await screen.findByRole("region", {
      name: "Unconfirmed form library change",
    });
    mayCreate = false;
    await inspect();
    await screen.findByText(
      /The source revision, state or permissions changed/,
    );
    expect(
      screen.queryByRole("button", { name: /Retry this exact/ }),
    ).toBeNull();
    expect(writes()).toHaveLength(1);
    expect(commits).toBe(0);
  });
  it("requires another read-only check after the exact retry response is also lost", async () => {
    const confirm = await start("duplicate");
    mode = "before";
    fireEvent.click(confirm);
    await screen.findByRole("region", {
      name: "Unconfirmed form library change",
    });
    await inspect();
    mode = "after";
    fireEvent.click(
      await screen.findByRole("button", { name: /Retry this exact/ }),
    );
    await within(
      screen.getByRole("region", { name: "Unconfirmed form library change" }),
    ).findByRole("alert");
    expect(
      screen.queryByRole("button", { name: /Retry this exact/ }),
    ).toBeNull();
    expect(commits).toBe(1);
    await inspect();
    await screen.findByText(/original duplicate change confirmed/);
    expect(writes()).toHaveLength(2);
    expect(commits).toBe(1);
  });
  it("keeps a conflicting availability review visible and paused after current revision refresh", async () => {
    const confirm = await start("archive");
    rows[0].revision = 4;
    mutationError = new ApiFailure(
      409,
      "CONFLICT",
      "Fictional source revision changed",
    );
    fireEvent.click(confirm);
    await screen.findByText(
      /The form changed or is no longer in this inventory/,
    );
    expect(
      screen.getByRole("button", { name: "Archive form", exact: true }),
    ).toHaveProperty("disabled", true);
    expect(
      screen.queryByRole("region", { name: "Unconfirmed form library change" }),
    ).toBeNull();
    expect(writes()).toHaveLength(1);
  });
  it("guards uncertain template creation even when there is no typed creation draft", async () => {
    view = render(panel());
    await screen.findByRole("link", { name: /Fictional library write form/ });
    mode = "before";
    fireEvent.click(
      await screen.findByRole("button", { name: /Event Interest/ }),
    );
    await screen.findByRole("region", {
      name: "Unconfirmed form library change",
    });
    expect(guard.mock.lastCall).toEqual([
      true,
      expect.objectContaining({
        label: expect.stringContaining("Unconfirmed create"),
      }),
    ]);
    expect(writes()).toHaveLength(1);
  });
  it.each(["create", "duplicate", "archive", "restore", "state"])(
    "reconciles accepted-but-lost %s read-only without repeating its mutation",
    async (action) => {
      if (action === "restore") rows[0].status = "Archived";
      const confirm = await start(action);
      mode = "after";
      fireEvent.click(confirm);
      await screen.findByRole("region", {
        name: "Unconfirmed form library change",
      });
      expect(writes()).toHaveLength(1);
      expect(commits).toBe(1);
      expect(
        screen.queryByRole("button", { name: /Retry this exact/ }),
      ).toBeNull();
      await inspect();
      if (action === "create")
        await screen.findByRole("heading", {
          name: "Fictional created editor",
        });
      else await screen.findByText(/original .* change confirmed/);
      expect(writes()).toHaveLength(1);
      expect(commits).toBe(1);
      expect(
        screen.queryByRole("region", {
          name: "Unconfirmed form library change",
        }),
      ).toBeNull();
    },
  );
  it.each(["create", "duplicate", "archive", "restore", "state"])(
    "retries unaccepted %s only after a read-only check with its exact original packet",
    async (action) => {
      if (action === "restore") rows[0].status = "Archived";
      const confirm = await start(action);
      mode = "before";
      fireEvent.click(confirm);
      await screen.findByRole("region", {
        name: "Unconfirmed form library change",
      });
      const first = writes()[0][1];
      expect(commits).toBe(0);
      await inspect();
      const retry = await screen.findByRole("button", {
        name: /Retry this exact/,
      });
      fireEvent.click(retry);
      fireEvent.click(retry);
      if (action === "create")
        await screen.findByRole("heading", {
          name: "Fictional created editor",
        });
      else await screen.findByText(/original .* change confirmed/);
      expect(writes()).toHaveLength(2);
      expect(writes()[1][1].body).toEqual(first.body);
      expect(writes()[1][1].idempotencyKey).toBe(first.idempotencyKey);
      expect(commits).toBe(1);
      expect(
        screen.queryByRole("region", {
          name: "Unconfirmed form library change",
        }),
      ).toBeNull();
    },
  );
  it("reviews duplicate scope/consequences and cancels without creating another form", async () => {
    await start("duplicate");
    expect(screen.getByRole("dialog").textContent).toContain(
      "Responses, published versions and collaborator access are not copied",
    );
    expect(screen.getByRole("dialog").textContent).toContain(rows[0].title);
    fireEvent.click(screen.getByRole("button", { name: "Cancel review" }));
    expect(writes()).toHaveLength(0);
    expect(rows).toHaveLength(1);
  });
  it("freezes create input, filters, modal escape and duplicate activation during a pending request", async () => {
    const pending = deferred<unknown>();
    override = () => pending.promise;
    const confirm = await start("create");
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(writes()).toHaveLength(1);
    expect(screen.getByLabelText(/Form title/)).toHaveProperty(
      "disabled",
      true,
    );
    fireEvent.keyDown(screen.getByRole("dialog"), {
      key: "Escape",
      code: "Escape",
    });
    expect(screen.getByRole("dialog")).toBeTruthy();
    await act(async () =>
      pending.resolve({
        form: { ...rows[0], id: copyId, revision: 1, status: "Draft" },
      }),
    );
    await screen.findByRole("heading", { name: "Fictional created editor" });
  });
  it("keeps a validation failure associated with retained editable creation input", async () => {
    const confirm = await start("create");
    mutationError = new ApiFailure(
      400,
      "VALIDATION_ERROR",
      "Fictional title needs correction",
    );
    fireEvent.click(confirm);
    await within(screen.getByRole("dialog")).findByRole("alert");
    const input = screen.getByLabelText(/Form title/);
    expect(input).toHaveProperty("disabled", false);
    expect(input.getAttribute("aria-describedby")).toBe(
      "form-library-create-error",
    );
    expect(input).toHaveProperty("value", "Fictional original creation");
    expect(
      screen.queryByRole("region", { name: "Unconfirmed form library change" }),
    ).toBeNull();
  });
  it.each([401, 403, 404])(
    "clears private library, reviews and creation input on %s write denial",
    async (status) => {
      const confirm = await start("create");
      mutationError = new ApiFailure(
        status,
        "DENIED",
        "Fictional creation denied",
      );
      fireEvent.click(confirm);
      await screen.findByRole("heading", {
        name: "Form library access needs to be rechecked",
      });
      expect(
        screen.queryByDisplayValue("Fictional original creation"),
      ).toBeNull();
      expect(
        screen.queryByRole("link", { name: /Fictional library write form/ }),
      ).toBeNull();
      expect(writes()).toHaveLength(1);
    },
  );
  it("requires reviewed abandonment and does not undo or repeat an uncertain action", async () => {
    const confirm = await start("archive");
    mode = "after";
    fireEvent.click(confirm);
    await screen.findByRole("region", {
      name: "Unconfirmed form library change",
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Review stopping recovery" }),
    );
    expect(screen.getByRole("dialog").textContent).toContain(
      "does not undo or cancel",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Keep recovering this change" }),
    );
    expect(
      screen.getByRole("region", { name: "Unconfirmed form library change" }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Review stopping recovery" }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Stop recovery and inspect the library",
      }),
    );
    await screen.findByText(/Recovery stopped/);
    expect(rows[0].status).toBe("Archived");
    expect(writes()).toHaveLength(1);
    expect(commits).toBe(1);
  });
  it("pauses identical retry after a changed source revision", async () => {
    const confirm = await start("duplicate");
    mode = "before";
    fireEvent.click(confirm);
    await screen.findByRole("region", {
      name: "Unconfirmed form library change",
    });
    rows[0].revision = 4;
    await inspect();
    await screen.findByText(
      /The source revision, state or permissions changed/,
    );
    expect(
      screen.queryByRole("button", { name: /Retry this exact/ }),
    ).toBeNull();
    expect(writes()).toHaveLength(1);
  });
  it("keeps an uncertain request paused after inspection failure and requires another explicit check", async () => {
    const confirm = await start("archive");
    mode = "before";
    fireEvent.click(confirm);
    await screen.findByRole("region", {
      name: "Unconfirmed form library change",
    });
    inspectionError = new ApiFailure(
      503,
      "UNAVAILABLE",
      "Fictional receipt unavailable",
    );
    await inspect();
    await screen.findByText("Fictional receipt unavailable");
    expect(
      screen.queryByRole("button", { name: /Retry this exact/ }),
    ).toBeNull();
    inspectionError = undefined;
    await inspect();
    await screen.findByRole("button", { name: /Retry this exact/ });
    expect(writes()).toHaveLength(1);
  });
  it("clears an uncertain private context when the recovery read is denied", async () => {
    const confirm = await start("archive");
    mode = "after";
    fireEvent.click(confirm);
    await screen.findByRole("region", {
      name: "Unconfirmed form library change",
    });
    inspectionError = new ApiFailure(
      403,
      "DENIED",
      "Fictional recovery denied",
    );
    await inspect();
    await screen.findByRole("heading", {
      name: "Form library access needs to be rechecked",
    });
    expect(
      screen.queryByRole("region", { name: "Unconfirmed form library change" }),
    ).toBeNull();
    expect(writes()).toHaveLength(1);
  });
  it.each(["account", "role", "session"])(
    "cancels pending creation and ignores late navigation on %s replacement",
    async (kind) => {
      const pending = deferred<unknown>();
      override = () => pending.promise;
      const confirm = await start("create");
      fireEvent.click(confirm);
      const signal = writes()[0][1].signal;
      if (kind === "session")
        fireEvent(window, new Event("gdg:session-cleared"));
      else {
        if (kind === "account") actor.id = "fictional-other-write-admin";
        else actor.role = "team_member";
        view.rerender(panel());
      }
      expect(signal.aborted).toBe(true);
      await act(async () =>
        pending.resolve({
          form: { ...rows[0], id: copyId, title: "Fictional obsolete result" },
        }),
      );
      expect(
        screen.queryByRole("heading", { name: "Fictional created editor" }),
      ).toBeNull();
      expect(allow).not.toHaveBeenCalled();
      expect(writes()).toHaveLength(1);
    },
  );
  it("converts an offline pending save to explicit recovery and never retries on reconnect", async () => {
    const pending = deferred<unknown>();
    override = async (path, options) => {
      const result = commit(path, options);
      await pending.promise;
      return result;
    };
    const confirm = await start("archive");
    fireEvent.click(confirm);
    const signal = writes()[0][1].signal;
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    fireEvent(window, new Event("offline"));
    await screen.findByRole("region", {
      name: "Unconfirmed form library change",
    });
    expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve(undefined));
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    fireEvent(window, new Event("online"));
    expect(writes()).toHaveLength(1);
    await inspect();
    await screen.findByText(/original archive change confirmed/);
    expect(writes()).toHaveLength(1);
  });
  it("rechecks the 47-hour bound at retry activation without sending another request", async () => {
    const started = Date.now(),
      confirm = await start("duplicate");
    mode = "before";
    fireEvent.click(confirm);
    await screen.findByRole("region", {
      name: "Unconfirmed form library change",
    });
    await inspect();
    const retry = await screen.findByRole("button", {
      name: /Retry this exact/,
    });
    vi.spyOn(Date, "now").mockReturnValue(started + 48 * 60 * 60 * 1000);
    fireEvent.click(retry);
    await waitFor(() =>
      expect(
        within(
          screen.getByRole("region", {
            name: "Unconfirmed form library change",
          }),
        ).getByRole("status").textContent,
      ).toContain("safe retry window ended"),
    );
    expect(writes()).toHaveLength(1);
  });
  it("treats a malformed saved result as unconfirmed and reconciles it without a duplicate", async () => {
    const confirm = await start("create");
    malformed = true;
    fireEvent.click(confirm);
    await screen.findByRole("region", {
      name: "Unconfirmed form library change",
    });
    expect(commits).toBe(1);
    expect(allow).not.toHaveBeenCalled();
    malformed = false;
    await inspect();
    await screen.findByRole("heading", { name: "Fictional created editor" });
    expect(writes()).toHaveLength(1);
  });
});
describe("Frozen library request transport", () => {
  it("does not acknowledge an accepted receipt without its current saved record", async () => {
    const intent = prepareFormLibraryWrite("create", rows[0]);
    apiMock.mockResolvedValueOnce({
      committed: true,
      canCreate: true,
      form: null,
    });
    await expect(inspectFormLibraryWrite(intent)).rejects.toMatchObject({
      status: 503,
      code: "UNCONFIRMED_RESULT",
    });
    expect(writes()).toHaveLength(0);
  });
  it("normalizes choice IDs once, bounds copy slugs and preserves original bodies/keys", async () => {
    rows[0].slug = "a".repeat(120);
    rows[0].fields.find((field) => field.options.length > 0)!.optionIds =
      undefined;
    const copy = prepareFormLibraryWrite("duplicate", rows[0]);
    expect(copy.body.slug!.length).toBeLessThanOrEqual(120);
    const create = prepareFormLibraryWrite("create", rows[0]),
      original = JSON.stringify(create.body);
    rows[0].title = "Fictional later source edit";
    await submitFormLibraryWrite(create);
    await submitFormLibraryWrite(create);
    expect(JSON.stringify(create.body)).toBe(original);
    expect(writes()[0][1].idempotencyKey).toBe(writes()[1][1].idempotencyKey);
  });
  it("inspects chapter creation without adding a source ID or performing a mutation", async () => {
    const intent = prepareFormLibraryWrite("create", rows[0]);
    await inspectFormLibraryWrite(intent);
    expect(apiMock.mock.calls[0]).toEqual([
      "/admin/forms/recovery?action=create",
      expect.objectContaining({ idempotencyKey: intent.key }),
    ]);
    expect(writes()).toHaveLength(0);
  });
});
