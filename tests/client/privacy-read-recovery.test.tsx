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
});
describe("Person-data privacy independent cleanup-status recovery", () => {
  it("shows named status skeleton and prevents scope approval before a current read", async () => {
    const pending = deferred<unknown>();
    transport.mockReturnValue(pending.promise);
    mount();
    expect(
      screen.getByRole("status", { name: "Loading privacy cleanup status" }),
    ).toBeTruthy();
    expect(
      (button("Generate exact record review") as HTMLButtonElement).disabled,
    ).toBe(true);
    await act(async () => pending.resolve({ items: [recent] }));
    await ready();
    expect(posts()).toHaveLength(0);
  });
  it("retries initial metadata failure without creating another privacy review", async () => {
    failure = Error("Fictional cleanup outage");
    mount();
    await screen.findByText("Fictional cleanup outage");
    expect(screen.queryByText("No privacy requests yet")).toBeNull();
    failure = undefined;
    click("Retry privacy cleanup status");
    await ready();
    expect(posts()).toHaveLength(0);
  });
  it("retains a dated successful snapshot and proposed requester fields on background failure", async () => {
    mount();
    await fill();
    failure = Error("Fictional cleanup refresh outage");
    click("Refresh cleanup status");
    await screen.findByText("Fictional cleanup refresh outage");
    expect(screen.getByText("2 files · 1 export")).toBeTruthy();
    expect(screen.getByText(/Showing cleanup status from/)).toBeTruthy();
    expect(
      (screen.getByLabelText("Exact requester email") as HTMLInputElement)
        .value,
    ).toBe("fictional-requester@example.test");
    expect(
      (button("Generate exact record review") as HTMLButtonElement).disabled,
    ).toBe(true);
    failure = undefined;
    click("Retry privacy cleanup status");
    await waitFor(() =>
      expect(
        (button("Generate exact record review") as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    expect(posts()).toHaveLength(0);
  });
  it("preserves a prepared exact review while a background read pauses final approval", async () => {
    mount();
    await review();
    fireEvent.change(screen.getByLabelText(/Privacy action confirmation/), {
      target: { value: "EXPORT 1 RECORDS" },
    });
    fireEvent.change(
      screen.getByLabelText("Current password for final approval"),
      { target: { value: "Fictional final proof" } },
    );
    failure = Error("Fictional current metadata outage");
    click("Refresh cleanup status");
    await screen.findByText("Fictional current metadata outage");
    expect(screen.getByText("Fictional contact scope")).toBeTruthy();
    expect(
      (button("Download reviewed JSON") as HTMLButtonElement).disabled,
    ).toBe(true);
    failure = undefined;
    click("Retry privacy cleanup status");
    await waitFor(() =>
      expect(
        (button("Download reviewed JSON") as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    expect(posts()).toHaveLength(1);
  });
  it.each([401, 403, 404])(
    "clears requester proof review and cleanup metadata on current read denial %s",
    async (status) => {
      mount();
      await review();
      fireEvent.change(
        screen.getByLabelText("Current password for final approval"),
        { target: { value: "Private proof to clear" } },
      );
      failure = new ApiFailure(status, "FORBIDDEN", "Fictional privacy denied");
      click("Refresh cleanup status");
      await screen.findByText(
        /Private scope, reviews and cleanup counters have been cleared/,
      );
      expect(screen.queryByText("Fictional contact scope")).toBeNull();
      expect(screen.queryByText("2 files · 1 export")).toBeNull();
      expect(screen.queryByDisplayValue("Private proof to clear")).toBeNull();
      expect(
        (screen.getByLabelText("Exact requester email") as HTMLInputElement)
          .value,
      ).toBe("");
      const before = transport.mock.calls.length;
      await act(async () => {
        await Promise.resolve();
      });
      expect(transport).toHaveBeenCalledTimes(before);
      failure = undefined;
      click("Refresh cleanup status");
      await ready();
      expect(posts()).toHaveLength(1);
    },
  );
  it.each([
    null,
    { items: null },
    { items: [{ ...recent, pendingFiles: -1 }] },
    { items: [{ ...recent, action: "unrestricted-delete" }] },
  ])(
    "refuses malformed cleanup metadata without enabling scope mutations %j",
    async (value) => {
      transport.mockResolvedValue(value);
      mount();
      await screen.findByText(
        /current privacy request reply could not be verified/,
      );
      expect(
        (button("Generate exact record review") as HTMLButtonElement).disabled,
      ).toBe(true);
      expect(posts()).toHaveLength(0);
    },
  );
  it("requires explicit read after reconnect without silently refreshing or approving", async () => {
    mount();
    await fill();
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    act(() => window.dispatchEvent(new Event("offline")));
    expect(screen.getByText(/Showing cleanup status from/)).toBeTruthy();
    const before = transport.mock.calls.length;
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    act(() => window.dispatchEvent(new Event("online")));
    expect(
      (button("Generate exact record review") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(transport).toHaveBeenCalledTimes(before);
    click("Refresh cleanup status");
    await waitFor(() =>
      expect(
        (button("Generate exact record review") as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    expect(posts()).toHaveLength(0);
  });
  it("ignores late private metadata after session reset and clears all proposed fields", async () => {
    mount();
    await fill();
    const pending = deferred<unknown>(),
      original = transport.getMockImplementation()!;
    transport.mockImplementation((p, o) =>
      o?.method ? original(p, o) : pending.promise,
    );
    click("Refresh cleanup status");
    const options = transport.mock.calls.at(-1)![1];
    act(() => window.dispatchEvent(new Event("gdg:session-cleared")));
    expect(options.signal.aborted).toBe(true);
    await act(async () => pending.resolve({ items: [recent] }));
    expect(
      (screen.getByLabelText("Exact requester email") as HTMLInputElement)
        .value,
    ).toBe("");
    expect(posts()).toHaveLength(0);
  });
  it("discards the prior account review and requester on account/role change", async () => {
    mount();
    await review();
    act(() => {
      actor.id = "fictional-other-privacy-officer";
      actor.role = "admin";
      actor.version++;
      subscribers.forEach((changed) => changed());
    });
    await ready();
    expect(screen.queryByText("Fictional contact scope")).toBeNull();
    expect(
      (screen.getByLabelText("Exact requester email") as HTMLInputElement)
        .value,
    ).toBe("");
    expect(posts()).toHaveLength(1);
  });
  it("uses the dirty guard before leaving a prepared exact review and keeps named comparison/history scroll regions", async () => {
    mount();
    await review();
    expect(
      screen
        .getByRole("region", { name: "Reviewed privacy records" })
        .getAttribute("tabindex"),
    ).toBe("0");
    expect(
      screen
        .getByRole("region", { name: "Privacy cleanup request table" })
        .getAttribute("tabindex"),
    ).toBe("0");
    click("Back to scope");
    await screen.findByRole("alertdialog");
    click("Stay here");
    expect(screen.getByText("Fictional contact scope")).toBeTruthy();
    click("Back to scope");
    click("Discard and leave");
    expect(screen.queryByText("Fictional contact scope")).toBeNull();
    expect(posts()).toHaveLength(1);
  });
  it("keeps password rejection distinct from loss of privacy access", async () => {
    const original = transport.getMockImplementation()!;
    transport.mockImplementation((p, o) =>
      o?.method === "POST"
        ? Promise.reject(
            new ApiFailure(
              403,
              "PASSWORD_REQUIRED",
              "Fictional proof rejected",
            ),
          )
        : original(p, o),
    );
    mount();
    await fill();
    click("Generate exact record review");
    await screen.findByText("Fictional proof rejected");
    expect(
      screen.queryByText(
        /Private scope, reviews and cleanup counters have been cleared/,
      ),
    ).toBeNull();
    expect(
      (screen.getByLabelText("Exact requester email") as HTMLInputElement)
        .value,
    ).toBe("fictional-requester@example.test");
    expect(
      (
        screen.getByLabelText(
          "Current password for scope review",
        ) as HTMLInputElement
      ).value,
    ).toBe("");
  });
  it("clears private scope if a review request loses current authorization", async () => {
    const original = transport.getMockImplementation()!;
    transport.mockImplementation((p, o) =>
      o?.method === "POST"
        ? Promise.reject(
            new ApiFailure(403, "FORBIDDEN", "Fictional access revoked"),
          )
        : original(p, o),
    );
    mount();
    await fill();
    click("Generate exact record review");
    await screen.findByText(
      /Private scope, reviews and cleanup counters have been cleared/,
    );
    expect(
      (screen.getByLabelText("Exact requester email") as HTMLInputElement)
        .value,
    ).toBe("");
    expect(screen.queryByText("2 files · 1 export")).toBeNull();
  });
  it("allows an explicit restart of a stuck metadata read and ignores its late private result", async () => {
    const pending = deferred<unknown>(),
      original = transport.getMockImplementation()!;
    transport
      .mockImplementationOnce(() => pending.promise)
      .mockImplementation(original);
    mount();
    expect(
      screen.getByRole("status", { name: "Loading privacy cleanup status" }),
    ).toBeTruthy();
    const signal = transport.mock.calls[0][1].signal;
    click("Refresh cleanup status");
    await ready();
    expect(signal.aborted).toBe(true);
    await act(async () =>
      pending.resolve({ items: [{ ...recent, pendingFiles: 999 }] }),
    );
    expect(screen.queryByText(/999 files/)).toBeNull();
    expect(posts()).toHaveLength(0);
  });
});
