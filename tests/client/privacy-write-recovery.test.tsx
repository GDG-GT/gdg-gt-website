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
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import PrivacyWorkspace from "../../src/ui/PrivacyWorkspace";
import NavigationSafety from "../../src/ui/NavigationSafety";
import { ApiFailure } from "../../src/lib/api";
const { transport, actor, subscribers } = vi.hoisted(() => ({
  transport: vi.fn(),
  actor: { id: "fictional-privacy-officer", role: "super_admin", version: 0 },
  subscribers: new Set<() => void>(),
}));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: transport,
}));
vi.mock("@/contexts/AdminContext", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    useAdmin: () => {
      useSyncExternalStore(
        (changed) => {
          subscribers.add(changed);
          return () => subscribers.delete(changed);
        },
        () => actor.version,
      );
      return { currentAdmin: actor };
    },
  };
});
const reviewId = "f1350000-0000-4000-8000-000000000001",
  recordId = "f1350000-0000-4000-8000-000000000002";
const recent = {
  reviewId,
  action: "delete",
  count: 2,
  createdAt: "2026-11-06T12:00:00Z",
  completedAt: "2026-11-06T12:02:00Z",
  expiresAt: "2099-11-06T12:05:00Z",
  pendingFiles: 2,
  pendingExports: 1,
};
let failure: Error | undefined,
  routers: ReturnType<typeof createMemoryRouter>[] = [];
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
function mount() {
  const router = createMemoryRouter(
    [
      {
        path: "/admin/privacy",
        element: (
          <NavigationSafety>
            <main>
              <PrivacyWorkspace />
            </main>
          </NavigationSafety>
        ),
      },
    ],
    { initialEntries: ["/admin/privacy"] },
  );
  routers.push(router);
  return render(<RouterProvider router={router} />);
}
const button = (name: string) =>
    screen.getByRole("button", { name, exact: true }),
  click = (name: string) => fireEvent.click(button(name)),
  posts = () => transport.mock.calls.filter(([, o]) => o?.method === "POST");
async function ready() {
  await screen.findByText("2 files · 1 export");
}
async function fill() {
  await ready();
  fireEvent.change(screen.getByLabelText("Exact requester email"), {
    target: { value: "fictional-requester@example.test" },
  });
  fireEvent.change(screen.getByLabelText(/Request purpose/), {
    target: { value: "Independently verified fictional privacy request." },
  });
  fireEvent.click(
    screen.getByRole("checkbox", { name: /I independently verified/ }),
  );
  fireEvent.change(screen.getByLabelText("Current password for scope review"), {
    target: { value: "Fictional current proof" },
  });
}
async function review() {
  await fill();
  click("Generate exact record review");
  await screen.findByRole("heading", {
    name: "2. Inspect the exact record review",
  });
  await waitFor(() =>
    expect(
      (button("Refresh cleanup status") as HTMLButtonElement).disabled,
    ).toBe(false),
  );
}
beforeEach(() => {
  transport.mockReset();
  failure = undefined;
  actor.id = "fictional-privacy-officer";
  actor.role = "super_admin";
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: true,
  });
  transport.mockImplementation(
    async (path: string, o: { method?: string } = {}) => {
      if (o.method === "POST")
        return path.endsWith("/review")
          ? {
              reviewId,
              reviewToken: "f".repeat(43),
              action: "export",
              expiresAt: new Date(Date.now() + 60000).toISOString(),
              count: 1,
              heldCount: 0,
              records: [
                {
                  kind: "contact",
                  id: recordId,
                  parentId: null,
                  held: false,
                  source: "self_reported",
                  label: "Fictional contact scope",
                },
              ],
            }
          : { action: "export", count: 1, export: [] };
      if (failure) throw failure;
      return { items: [recent] };
    },
  );
});
afterEach(() => {
  cleanup();
  for (const router of routers) router.dispose();
  routers = [];
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

let loss: "before" | "after" | "none",
  receipts: Map<string, unknown>,
  commits: number,
  recoveryError: Error | undefined,
  canRetry: boolean,
  requestedAction: string;
beforeEach(() => {
  loss = "none";
  receipts = new Map();
  commits = 0;
  recoveryError = undefined;
  canRetry = true;
  requestedAction = "redact";
  const original = transport.getMockImplementation()!;
  transport.mockImplementation(async (p, o = {}) => {
    if (p.endsWith("/recovery")) {
      if (recoveryError) throw recoveryError;
      const found = receipts.get(o.idempotencyKey) as
        | Record<string, unknown>
        | undefined;
      let receipt = found || null;
      if (found && p.includes("/commit/")) {
        const { export: bytes, ...metadata } = found;
        void bytes;
        receipt = {
          ...metadata,
          ...(found.action === "export" ? { downloadExpired: true } : {}),
        };
      }
      return { committed: !!receipt, canRetry: !receipt && canRetry, receipt };
    }
    if (o.method !== "POST") return original(p, o);
    if (loss === "before") {
      loss = "none";
      throw Error("Fictional before acceptance loss");
    }
    if (!receipts.has(o.idempotencyKey)) {
      commits++;
      const value = p.endsWith("/review")
        ? { ...(await original(p, o)), action: o.body.action }
        : {
            action: requestedAction,
            count: 1,
            ...(requestedAction === "export"
              ? {
                  export: [
                    {
                      kind: "contact",
                      data: { message: "Fictional private export" },
                    },
                  ],
                }
              : { pendingFiles: 0, pendingExports: 0, remainingMatches: 0 }),
          };
      receipts.set(o.idempotencyKey, value);
    }
    if (loss === "after") {
      loss = "none";
      throw Error("Fictional accepted reply loss");
    }
    return receipts.get(o.idempotencyKey);
  });
});
const attempts = () =>
  transport.mock.calls.filter(
    ([p, o]) => o?.method === "POST" && !p.endsWith("/recovery"),
  );
async function prepare() {
  await fill();
  fireEvent.change(screen.getByRole("combobox", { name: /Requested action/ }), {
    target: { value: requestedAction },
  });
  click("Generate exact record review");
  await screen.findByRole("heading", {
    name: "2. Inspect the exact record review",
  });
  await waitFor(() =>
    expect(
      (button("Refresh cleanup status") as HTMLButtonElement).disabled,
    ).toBe(false),
  );
}
async function start(
  action = "review",
  position: "before" | "after" = "before",
) {
  mount();
  if (action === "commit") {
    await prepare();
    fireEvent.change(
      screen.getByRole("textbox", { name: /Privacy action confirmation/ }),
      { target: { value: requestedAction.toUpperCase() + " 1 RECORDS" } },
    );
    fireEvent.change(
      screen.getByLabelText("Current password for final approval"),
      { target: { value: "Original approval proof" } },
    );
    loss = position;
    click(
      requestedAction === "export"
        ? "Prepare reviewed JSON"
        : "Confirm " + requestedAction,
    );
  } else {
    await fill();
    fireEvent.change(
      screen.getByRole("combobox", { name: /Requested action/ }),
      { target: { value: requestedAction } },
    );
    loss = position;
    click("Generate exact record review");
  }
  await screen.findByRole("region", { name: "Unconfirmed privacy request" });
}
describe("Original person-data privacy request reconciliation", () => {
  for (const action of ["review", "commit"])
    for (const position of ["before", "after"] as const)
      it(`${action} ${position} loss preserves original scope/key and needs freshly entered proof only for explicit retry`, async () => {
        await start(action, position);
        const before = attempts().length,
          original = attempts().at(-1)!;
        expect(
          (button("Refresh cleanup status") as HTMLButtonElement).disabled,
        ).toBe(true);
        expect(
          screen.queryByDisplayValue("Original approval proof"),
        ).toBeNull();
        expect(
          screen.queryByDisplayValue("Fictional current proof"),
        ).toBeNull();
        expect(
          (button("Retry identical privacy request") as HTMLButtonElement)
            .disabled,
        ).toBe(true);
        click("Check original privacy outcome");
        if (position === "before") {
          await screen.findByLabelText(
            "Current password for original privacy retry *",
          );
          fireEvent.change(
            screen.getByLabelText(
              "Current password for original privacy retry *",
            ),
            { target: { value: "New explicit proof" } },
          );
          click("Retry identical privacy request");
        }
        await waitFor(() =>
          expect(
            screen.queryByRole("region", {
              name: "Unconfirmed privacy request",
            }),
          ).toBeNull(),
        );
        if (action === "review")
          await screen.findByRole("heading", {
            name: "2. Inspect the exact record review",
          });
        else
          await screen.findByRole("heading", {
            name: "Reviewed records processed",
          });
        expect(commits).toBe(action === "review" ? 1 : 2);
        expect(attempts()).toHaveLength(
          before + (position === "before" ? 1 : 0),
        );
        const inspection = transport.mock.calls.find(([p]) =>
            p.endsWith("/recovery"),
          )!,
          body = { ...original[1].body };
        delete body.currentPassword;
        expect(inspection[1].body).toEqual(body);
        expect(inspection[1].idempotencyKey).toBe(original[1].idempotencyKey);
        if (position === "before") {
          const last = attempts().at(-1)!,
            retry = { ...last[1].body };
          delete retry.currentPassword;
          expect(retry).toEqual(body);
          expect(last[1].body.currentPassword).toBe("New explicit proof");
          expect(last[1].idempotencyKey).toBe(original[1].idempotencyKey);
        }
      });
  it.each([401, 403, 404])(
    "clears private requester/scope/review on current outcome denial %s",
    async (status) => {
      await start("commit");
      recoveryError = new ApiFailure(
        status,
        "FORBIDDEN",
        "Fictional original privacy unavailable",
      );
      click("Check original privacy outcome");
      await screen.findByText(
        /reviews and cleanup counters have been cleared/,
      );
      expect(
        screen.queryByDisplayValue("fictional-requester@example.test"),
      ).toBeNull();
      expect(
        screen.queryByRole("region", { name: "Unconfirmed privacy request" }),
      ).toBeNull();
    },
  );
  it("requires another inspection after an explicit retry loses its accepted reply", async () => {
    await start();
    click("Check original privacy outcome");
    await screen.findByLabelText(
      "Current password for original privacy retry *",
    );
    fireEvent.change(
      screen.getByLabelText("Current password for original privacy retry *"),
      { target: { value: "New explicit proof" } },
    );
    loss = "after";
    click("Retry identical privacy request");
    await screen.findByText("Fictional accepted reply loss");
    expect(
      (button("Retry identical privacy request") as HTMLButtonElement).disabled,
    ).toBe(true);
    click("Check original privacy outcome");
    await screen.findByRole("heading", {
      name: "2. Inspect the exact record review",
    });
    expect(commits).toBe(1);
  });
  it("does not retry an expired/changed/held unaccepted approval", async () => {
    await start("commit");
    canRetry = false;
    click("Check original privacy outcome");
    await screen.findByText(/prevents a safe retry/);
    expect(
      (button("Retry identical privacy request") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(attempts()).toHaveLength(2);
  });
  it("reviewed stopping clears requester and comparison without claiming undo", async () => {
    await start("commit", "after");
    fireEvent.click(screen.getByText("Review stopping privacy recovery"));
    click("Stop tracking this privacy request");
    await screen.findByText(/Privacy recovery stopped/);
    expect(
      screen.queryByDisplayValue("fictional-requester@example.test"),
    ).toBeNull();
    expect(
      screen.queryByRole("heading", {
        name: "2. Inspect the exact record review",
      }),
    ).toBeNull();
    expect(attempts()).toHaveLength(2);
  });
  it("reconnect requires explicit inspection without automatic requests", async () => {
    await start();
    click("Check original privacy outcome");
    await screen.findByLabelText(
      "Current password for original privacy retry *",
    );
    const count = transport.mock.calls.length;
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    act(() => window.dispatchEvent(new Event("offline")));
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    act(() => window.dispatchEvent(new Event("online")));
    expect(
      (button("Retry identical privacy request") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(transport.mock.calls).toHaveLength(count);
  });
  it("clears an original unknown request on explicit session reset", async () => {
    await start();
    act(() => window.dispatchEvent(new Event("gdg:session-cleared")));
    await waitFor(() =>
      expect(
        screen.queryByRole("region", { name: "Unconfirmed privacy request" }),
      ).toBeNull(),
    );
    expect(
      screen.queryByDisplayValue("fictional-requester@example.test"),
    ).toBeNull();
    expect(attempts()).toHaveLength(1);
  });
  it("never reconstructs private bytes for an accepted-but-lost export", async () => {
    requestedAction = "export";
    await start("commit", "after");
    click("Check original privacy outcome");
    await screen.findByRole("heading", { name: "Export prepared" });
    expect(
      screen.queryByRole("link", { name: "Download prepared privacy export" }),
    ).toBeNull();
    expect(screen.queryByText("Fictional private export")).toBeNull();
    expect(attempts()).toHaveLength(2);
  });
  it("offers an explicit memory-only export handoff and revokes it on clear", async () => {
    requestedAction = "export";
    const originalURL = URL,
      create = vi.fn(() => "blob:fictional-private-export"),
      revoke = vi.fn();
    vi.stubGlobal(
      "URL",
      class extends originalURL {
        static createObjectURL = create;
        static revokeObjectURL = revoke;
      },
    );
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    mount();
    await prepare();
    fireEvent.change(
      screen.getByRole("textbox", { name: /Privacy action confirmation/ }),
      { target: { value: "EXPORT 1 RECORDS" } },
    );
    fireEvent.change(
      screen.getByLabelText("Current password for final approval"),
      { target: { value: "Fresh export proof" } },
    );
    click("Prepare reviewed JSON");
    await screen.findByRole("link", {
      name: "Download prepared privacy export",
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(clickSpy).not.toHaveBeenCalled();
    expect(screen.queryByText("Fictional private export")).toBeNull();
    click("Clear prepared export");
    expect(revoke).toHaveBeenCalledWith("blob:fictional-private-export");
    expect(
      screen.queryByRole("link", { name: "Download prepared privacy export" }),
    ).toBeNull();
  });
  it("refuses inspection which attempts to replay private export bytes", async () => {
    requestedAction = "export";
    await start("commit", "after");
    const original = transport.getMockImplementation()!;
    transport.mockImplementation((p, o) =>
      p.endsWith("/recovery")
        ? Promise.resolve({
            committed: true,
            canRetry: false,
            receipt: { action: "export", count: 1, export: [{}] },
          })
        : original(p, o),
    );
    click("Check original privacy outcome");
    await screen.findByText(/original privacy outcome could not be verified/);
    expect(
      screen.queryByRole("link", { name: "Download prepared privacy export" }),
    ).toBeNull();
    expect(
      (button("Retry identical privacy request") as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
