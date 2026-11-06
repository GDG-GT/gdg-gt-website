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
import { MemoryRouter } from "react-router-dom";
import ResponseSavedViews from "../../src/ui/forms/ResponseSavedViews";
import {
  prepareViewWrite,
  inspectViewWrite,
  type SavedResponseView,
  type ViewAction,
} from "../../src/ui/forms/form-view-api";
import { ApiFailure } from "../../src/lib/api";
const { apiMock, identity, guard } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  identity: { id: "fictional-view-admin", role: "admin" },
  guard: vi.fn(),
}));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: apiMock,
}));
vi.mock("@/contexts/AdminContext", () => ({
  useAdmin: () => ({ currentAdmin: identity }),
}));
vi.mock("@/hooks/useDraftGuard", () => ({
  useDraftGuard: guard,
  useNavigationSafety: () => ({ request: (run: () => void) => run() }),
}));
const formId = "fictional-form",
  root = "/admin/forms/" + formId + "/views",
  viewId = "fictional-view";
type Options = {
  method?: string;
  body?: Record<string, unknown>;
  idempotencyKey?: string;
  signal?: AbortSignal;
};
const seed = (): SavedResponseView => ({
  id: viewId,
  name: "Fictional saved view",
  revision: 2,
  filters: { q: "Fictional original private query" },
  columns: [],
  updated_at: "2026-11-06T12:00:00Z",
});
let row: SavedResponseView | null,
  mode: "" | "before" | "after",
  commits: number,
  receipts: Map<
    string,
    { id: string; formId: string; sourceId: string | null; action: ViewAction }
  >,
  failure: Error | undefined,
  inspectFailure: Error | undefined;
const handlers = {
  onNameChange: vi.fn(),
  onSearch: vi.fn(),
  onPage: vi.fn(),
  onApply: vi.fn(),
  onComplete: vi.fn(),
  onDenied: vi.fn(),
  onReload: vi.fn(),
  onStateChange: vi.fn(),
};
const writes = () => apiMock.mock.calls.filter(([, o]) => o?.method);
function props(overrides = {}) {
  return {
    formId,
    items: row ? [row] : [],
    total: 1,
    page: 1,
    pageSize: 30,
    query: "",
    scope: root,
    name: "Fictional proposed view",
    filters: { status: "complete" },
    columns: ["fictional-column"],
    disabled: false,
    ...handlers,
    ...overrides,
  };
}
function mount(overrides = {}) {
  return render(
    <MemoryRouter>
      <ResponseSavedViews {...props(overrides)} />
    </MemoryRouter>,
  );
}
function click(name: string) {
  fireEvent.click(screen.getByRole("button", { name, exact: true }));
}
function review(action: ViewAction) {
  if (action !== "create")
    fireEvent.change(screen.getByLabelText("Saved view"), {
      target: { value: viewId },
    });
  click(
    action === "create"
      ? "Save view"
      : action === "replace"
        ? "Replace selected view"
        : "Remove selected view",
  );
  click(
    action === "create"
      ? "Confirm new view"
      : action === "replace"
        ? "Confirm replacement"
        : "Confirm removal",
  );
}
async function uncertain() {
  return screen.findByRole("region", { name: "Unconfirmed saved view change" });
}
beforeEach(() => {
  row = seed();
  mode = "";
  commits = 0;
  receipts = new Map();
  failure = undefined;
  inspectFailure = undefined;
  apiMock.mockReset();
  guard.mockReset();
  Object.values(handlers).forEach((fn) => fn.mockReset());
  identity.id = "fictional-view-admin";
  identity.role = "admin";
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  apiMock.mockImplementation(async (path: string, o: Options = {}) => {
    if (o.method) {
      if (failure) throw failure;
      if (mode === "before") {
        mode = "";
        throw new TypeError("Fictional connection loss");
      }
      const action: ViewAction =
        o.method === "DELETE"
          ? "remove"
          : o.method === "PATCH"
            ? "replace"
            : "create";
      if (!receipts.has(o.idempotencyKey!)) {
        row =
          action === "remove"
            ? null
            : {
                ...seed(),
                ...(o.body as object),
                revision: action === "create" ? 1 : 3,
              };
        commits++;
        receipts.set(o.idempotencyKey!, {
          id: viewId,
          formId,
          sourceId: action === "create" ? null : viewId,
          action,
        });
      }
      if (mode === "after") {
        mode = "";
        throw new TypeError("Fictional acknowledgement loss");
      }
      return {
        committed: true,
        canRetry: false,
        receipt: receipts.get(o.idempotencyKey!),
        view: row,
      };
    }
    if (path.includes("/recovery?")) {
      if (inspectFailure) throw inspectFailure;
      const action = new URL(
        "https://fictional.example.test" + path,
      ).searchParams.get("action");
      const receipt = receipts.get(o.idempotencyKey!);
      return {
        committed: !!receipt,
        canRetry: !receipt,
        ...(receipt ? { receipt } : {}),
        view: receipt ? row : action === "create" ? null : row,
      };
    }
    throw Error("Unexpected fixture read");
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("Saved view atomic outcome recovery", () => {
  for (const action of ["create", "replace", "remove"] as const)
    for (const loss of ["before", "after"] as const)
      it(`${action} preserves original intent after ${loss}-acceptance loss`, async () => {
        mode = loss;
        mount();
        review(action);
        const recovery = await uncertain();
        expect(
          (
            within(recovery).getByRole("button", {
              name: "Retry identical saved view change",
            }) as HTMLButtonElement
          ).disabled,
        ).toBe(true);
        const original = writes()[0][1];
        expect(original.body).toEqual(
          action === "remove"
            ? { revision: 2 }
            : {
                name:
                  action === "create"
                    ? "Fictional proposed view"
                    : "Fictional saved view",
                filters: { status: "complete" },
                columns: ["fictional-column"],
                ...(action === "replace" ? { revision: 2 } : {}),
              },
        );
        click("Check original saved view outcome");
        if (loss === "before") {
          await within(recovery).findByText(/No committed receipt was found/);
          click("Retry identical saved view change");
        }
        await waitFor(() =>
          expect(handlers.onComplete).toHaveBeenCalledTimes(1),
        );
        expect(commits).toBe(1);
        expect(writes()).toHaveLength(loss === "before" ? 2 : 1);
        if (loss === "before") {
          expect(writes()[1][1].body).toEqual(original.body);
          expect(writes()[1][1].idempotencyKey).toBe(original.idempotencyKey);
        }
        expect(handlers.onNameChange).toHaveBeenLastCalledWith("");
      });
  it("opens a consequence review without writing and preserves the original proposal while fields change", () => {
    const view = mount({
      columnLabels: { "fictional-column": "Fictional original question" },
    });
    click("Save view");
    expect(writes()).toHaveLength(0);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(
      screen.getByRole("list", { name: "Answer columns to save" }),
    ).toBeTruthy();
    view.rerender(
      <MemoryRouter>
        <ResponseSavedViews
          {...props({
            filters: { status: "held" },
            columns: [],
            name: "Changed proposal",
          })}
        />
      </MemoryRouter>,
    );
    expect(
      within(screen.getByRole("dialog")).getByText("Fictional proposed view"),
    ).toBeTruthy();
    expect(
      within(screen.getByRole("dialog")).getByText("complete"),
    ).toBeTruthy();
    expect(
      screen.getByRole("list", { name: "Answer columns to save" }).textContent,
    ).toContain("Fictional original question");
  });
  it("requires current matching selected revision before replacement dispatch", () => {
    const view = mount();
    fireEvent.change(screen.getByLabelText("Saved view"), {
      target: { value: viewId },
    });
    click("Replace selected view");
    row = { ...row!, revision: 3 };
    view.rerender(
      <MemoryRouter>
        <ResponseSavedViews {...props()} />
      </MemoryRouter>,
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Confirm replacement",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(writes()).toHaveLength(0);
  });
  it("rejects an unaccepted retry if the selected saved view revision changed", async () => {
    mode = "before";
    mount();
    review("replace");
    const recovery = await uncertain();
    row = { ...row!, revision: 3 };
    click("Check original saved view outcome");
    await within(recovery).findByText(/target is no longer ready/);
    expect(
      (
        within(recovery).getByRole("button", {
          name: "Retry identical saved view change",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(writes()).toHaveLength(1);
  });
  it("requires another check after a second lost retry response", async () => {
    mode = "before";
    mount();
    review("create");
    await uncertain();
    click("Check original saved view outcome");
    await screen.findByText(/No committed receipt was found/);
    mode = "after";
    click("Retry identical saved view change");
    await screen.findByRole("alert");
    expect(
      (
        screen.getByRole("button", {
          name: "Retry identical saved view change",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    click("Check original saved view outcome");
    await waitFor(() => expect(handlers.onComplete).toHaveBeenCalledTimes(1));
    expect(commits).toBe(1);
    expect(writes()).toHaveLength(2);
  });
  for (const status of [400, 409, 429])
    it("requires reviewed reload after known " + status, async () => {
      failure = new ApiFailure(status, "CONFLICT", "Fictional stale view");
      mount();
      review("replace");
      await screen.findByRole("button", {
        name: "Reload current saved views and review again",
      });
      expect(
        screen.queryByRole("region", { name: "Unconfirmed saved view change" }),
      ).toBeNull();
      click("Reload current saved views and review again");
      expect(handlers.onReload).toHaveBeenCalledTimes(1);
      expect(writes()).toHaveLength(1);
    });
  for (const status of [401, 403, 404])
    it("clears denied writes " + status, async () => {
      failure = new ApiFailure(status, "NOT_FOUND", "Fictional denied view");
      mount();
      review("remove");
      await waitFor(() => expect(handlers.onDenied).toHaveBeenCalledTimes(1));
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(handlers.onNameChange).toHaveBeenLastCalledWith("");
    });
  it("clears denied outcome checks without retrying", async () => {
    mode = "before";
    mount();
    review("create");
    await uncertain();
    inspectFailure = new ApiFailure(
      403,
      "FORBIDDEN",
      "Fictional changed access",
    );
    click("Check original saved view outcome");
    await waitFor(() => expect(handlers.onDenied).toHaveBeenCalledTimes(1));
    expect(writes()).toHaveLength(1);
  });
  it("guards typed view names and requires reviewed abandonment", async () => {
    mode = "after";
    mount();
    expect(guard.mock.calls.at(-1)?.[0]).toBe(true);
    review("create");
    await uncertain();
    expect(handlers.onReload).not.toHaveBeenCalled();
    click("Stop tracking this saved view change");
    expect(handlers.onReload).toHaveBeenCalledTimes(1);
    expect(writes()).toHaveLength(1);
  });
  it("scopes selected rows to the current search/page before new changes", () => {
    const view = mount();
    fireEvent.change(screen.getByLabelText("Saved view"), {
      target: { value: viewId },
    });
    view.rerender(
      <MemoryRouter>
        <ResponseSavedViews
          {...props({ items: [], total: 0, scope: root + "?q=other" })}
        />
      </MemoryRouter>,
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Replace selected view",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: "Remove selected view",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
  it("offers inventory search and pagination beyond 100 rows without truncating selection", () => {
    mount({ page: 4, total: 125, pageSize: 30 });
    fireEvent.change(screen.getByLabelText("Search saved views"), {
      target: { value: "fictional query" },
    });
    expect(handlers.onSearch).toHaveBeenCalledWith("fictional query");
    click("Next saved views");
    expect(handlers.onPage).toHaveBeenCalledWith(5);
    click("Previous saved views");
    expect(handlers.onPage).toHaveBeenCalledWith(3);
  });
  it("preserves the selected proposal during read failures and pauses confirmation", () => {
    const view = mount();
    click("Save view");
    view.rerender(
      <MemoryRouter>
        <ResponseSavedViews {...props({ disabled: true })} />
      </MemoryRouter>,
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Confirm new view",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(writes()).toHaveLength(0);
  });
  for (const event of ["gdg:session-cleared", "offline"])
    it(
      "aborts pending " + event + " and ignores late acknowledgements",
      async () => {
        let resolve!: (r: unknown) => void;
        apiMock.mockImplementationOnce(
          () =>
            new Promise((done) => {
              resolve = done;
            }),
        );
        mount();
        review("create");
        const signal = writes()[0][1].signal;
        act(() => window.dispatchEvent(new Event(event)));
        expect(signal.aborted).toBe(true);
        await act(async () =>
          resolve({
            committed: true,
            canRetry: false,
            receipt: { id: viewId, formId, sourceId: null, action: "create" },
            view: seed(),
          }),
        );
        expect(handlers.onComplete).not.toHaveBeenCalled();
        if (event === "offline") {
          await uncertain();
          act(() => window.dispatchEvent(new Event("online")));
          expect(writes()).toHaveLength(1);
        } else expect(handlers.onDenied).toHaveBeenCalledTimes(1);
      },
    );
  it("account changes abort a pending action and clear the selected private proposal", async () => {
    let resolve!: (r: unknown) => void;
    apiMock.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const view = mount();
    review("create");
    const signal = writes()[0][1].signal;
    identity.id = "fictional-replacement";
    view.rerender(
      <MemoryRouter>
        <ResponseSavedViews {...props()} />
      </MemoryRouter>,
    );
    expect(signal.aborted).toBe(true);
    await act(async () =>
      resolve({
        committed: true,
        canRetry: false,
        receipt: { id: viewId, formId, sourceId: null, action: "create" },
        view: seed(),
      }),
    );
    expect(handlers.onComplete).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("bounds original retries to 47 hours", async () => {
    const at = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(at);
    mode = "before";
    mount();
    review("create");
    await uncertain();
    vi.mocked(Date.now).mockReturnValue(at + 47 * 60 * 60 * 1000);
    click("Check original saved view outcome");
    await screen.findByText(/safe retry window ended/);
    expect(
      apiMock.mock.calls.filter(([path]) => path.includes("/recovery?")),
    ).toHaveLength(0);
    expect(writes()).toHaveLength(1);
  });
  it("latches duplicate confirmation and freezes pending dismissal", async () => {
    let resolve!: (r: unknown) => void;
    apiMock.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    mount();
    click("Save view");
    const dialog = screen.getByRole("dialog"),
      button = within(dialog).getByRole("button", { name: "Confirm new view" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(writes()).toHaveLength(1);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeTruthy();
    await act(async () =>
      resolve({
        committed: true,
        canRetry: false,
        receipt: { id: viewId, formId, sourceId: null, action: "create" },
        view: seed(),
      }),
    );
    expect(handlers.onComplete).toHaveBeenCalledTimes(1);
  });
  it("acknowledges the original accepted creation if its view was later removed", async () => {
    mode = "after";
    mount();
    review("create");
    await uncertain();
    row = null;
    click("Check original saved view outcome");
    await waitFor(() => expect(handlers.onComplete).toHaveBeenCalledTimes(1));
    expect(writes()).toHaveLength(1);
  });
  for (const substitution of ["source", "action", "view"])
    it("rejects substituted " + substitution + " results", async () => {
      const intent = prepareViewWrite(
        formId,
        "replace",
        "Fictional",
        {},
        [],
        seed(),
      );
      apiMock.mockResolvedValue({
        committed: true,
        canRetry: false,
        receipt: {
          id: viewId,
          formId,
          sourceId: substitution === "source" ? "wrong" : viewId,
          action: substitution === "action" ? "remove" : "replace",
        },
        view: substitution === "view" ? { ...seed(), id: "wrong" } : seed(),
      });
      await expect(inspectViewWrite(intent)).rejects.toMatchObject({
        code: "UNCONFIRMED_VIEW",
      });
    });
  it("freezes detached normalized filter/column values and omits transport preferences", () => {
    const filters = {
        q: "Fictional",
        page: 4,
        pageSize: 100,
        sensitive: "true",
      },
      columns = ["fictional-column"];
    const packet = prepareViewWrite(
      formId,
      "create",
      " Fictional ",
      filters,
      columns,
    );
    filters.q = "Changed";
    columns.push("other");
    expect(JSON.parse(packet.body)).toEqual({
      name: "Fictional",
      filters: { q: "Fictional" },
      columns: ["fictional-column"],
    });
    expect(Object.isFrozen(packet)).toBe(true);
  });
});
