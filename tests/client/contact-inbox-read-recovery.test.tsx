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
import ContactInbox from "../../src/ui/communications/ContactInbox";
import NavigationSafety from "../../src/ui/NavigationSafety";
import { ApiFailure } from "../../src/lib/api";
const { transport, actor, subscribers } = vi.hoisted(() => ({
  transport: vi.fn(),
  actor: { id: "fictional-inbox-officer", role: "admin", version: 0 },
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
const id = "f1340000-0000-4000-8000-000000000001",
  other = "f1340000-0000-4000-8000-000000000002",
  seed = {
    id,
    name: "Fictional inquiry sender",
    email: "fictional-inquiry@example.test",
    type: "general",
    message: "Fictional private inquiry message for read recovery.",
    interests: ["Fictional interest"],
    status: "new",
    revision: 1,
    createdAt: "2026-11-06T12:00:00Z",
    resolvedAt: null as string | null,
    redactedAt: null as string | null,
    hold: false,
    holdReason: null as string | null,
    attachment: null as null | {
      id: string;
      filename: string;
      state: string;
      bytes: number;
      canDownload: boolean;
    },
  };
let record: typeof seed,
  failures: Map<string, Error>,
  routers: ReturnType<typeof createMemoryRouter>[] = [];
const kind = (path: string) =>
  path.endsWith("/attachment")
    ? "attachment"
    : path.includes("?")
      ? "inventory"
      : "detail";
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
function mount(selected = true) {
  const router = createMemoryRouter(
    [
      {
        path: "/admin/communications",
        element: (
          <NavigationSafety>
            <main>
              <ContactInbox />
            </main>
          </NavigationSafety>
        ),
      },
    ],
    {
      initialEntries: [
        "/admin/communications?tab=contact" +
          (selected ? "&contact=" + id : ""),
      ],
    },
  );
  routers.push(router);
  render(<RouterProvider router={router} />);
  return router;
}
const button = (name: string) =>
    screen.getByRole("button", { name, exact: true }),
  click = (name: string) => fireEvent.click(button(name)),
  disabled = (name: string) =>
    expect((button(name) as HTMLButtonElement).disabled).toBe(true),
  writes = () => transport.mock.calls.filter(([, o]) => o?.method === "POST");
const ready = () =>
  screen.findByRole("heading", { name: record.name, exact: true });
function file() {
  record.attachment = {
    id: other,
    filename: "fictional-private.txt",
    bytes: 20,
    state: "clean",
    canDownload: true,
  };
}
beforeEach(() => {
  record = structuredClone(seed);
  failures = new Map();
  transport.mockReset();
  actor.id = "fictional-inbox-officer";
  actor.role = "admin";
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: true,
  });
  transport.mockImplementation(
    async (
      path: string,
      o: { method?: string; body?: { status?: string } } = {},
    ) => {
      if (o.method === "POST") {
        record = {
          ...record,
          status: o.body?.status || record.status,
          revision: record.revision + 1,
        };
        return { id, revision: record.revision };
      }
      const op = kind(path);
      if (failures.has(op)) throw failures.get(op);
      if (op === "attachment")
        return {
          url: "https://storage.example.test/fictional-private-download",
          filename: "fictional-private.txt",
          expiresIn: 60,
        };
      return { items: [structuredClone(record)], total: 1, page: 1 };
    },
  );
});
afterEach(() => {
  cleanup();
  for (const router of routers) router.dispose();
  routers = [];
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe("Contact inbox private read, review and attachment recovery", () => {
  it("shows a named selected loading state and keeps its refresh action usable after a failed read", async () => {
    const pending = deferred<unknown>(),
      original = transport.getMockImplementation()!;
    transport.mockImplementation((p, o) =>
      kind(p) === "detail" ? pending.promise : original(p, o),
    );
    mount();
    expect(
      screen.getByRole("status", { name: "Loading selected inquiry" }),
    ).toBeTruthy();
    await act(async () =>
      pending.resolve({ items: [record], total: 1, page: 1 }),
    );
    await ready();
    failures.set("detail", Error("Fictional selected outage"));
    transport.mockImplementation(original);
    click("Refresh inquiry");
    await screen.findByText("Fictional selected outage");
    expect(
      (button("Retry selected inquiry") as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(writes()).toHaveLength(0);
  });
  it("retries an initial selected failure instead of trapping a selected unavailable view", async () => {
    failures.set("detail", Error("Fictional initial detail outage"));
    mount();
    await screen.findByText("Fictional initial detail outage");
    expect(button("Back to inbox")).toBeTruthy();
    failures.clear();
    click("Retry selected inquiry");
    await ready();
    expect(writes()).toHaveLength(0);
  });
  it("recovers the independent inbox inventory without a private mutation", async () => {
    failures.set("inventory", Error("Fictional inbox outage"));
    mount(false);
    await screen.findByText("Fictional inbox outage");
    failures.clear();
    click("Retry contact inbox");
    await screen.findByRole("button", { name: record.name, exact: true });
    expect(
      screen
        .getByRole("region", { name: "Protected contact inquiries" })
        .getAttribute("tabindex"),
    ).toBe("0");
    expect(writes()).toHaveLength(0);
  });
  it("retains a dated selected snapshot and proposed status while a refresh fails", async () => {
    mount();
    await ready();
    fireEvent.change(screen.getByLabelText("Inquiry status"), {
      target: { value: "in_progress" },
    });
    failures.set("detail", Error("Fictional refresh outage"));
    click("Refresh inquiry");
    await screen.findByText("Fictional refresh outage");
    expect(screen.getByText(/Showing inquiries from/)).toBeTruthy();
    expect(
      (screen.getByLabelText("Inquiry status") as HTMLSelectElement).value,
    ).toBe("in_progress");
    disabled("Save inquiry status");
    failures.clear();
    click("Retry selected inquiry");
    await waitFor(() =>
      expect(
        (button("Save inquiry status") as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    expect(writes()).toHaveLength(0);
  });
  it("preserves a stale proposal until reviewed current-record reload, including Stay here", async () => {
    mount();
    await ready();
    fireEvent.change(screen.getByLabelText("Inquiry status"), {
      target: { value: "in_progress" },
    });
    record = { ...record, revision: 2, status: "resolved" };
    click("Refresh inquiry");
    await screen.findByText(/This inquiry changed/);
    expect(
      (screen.getByLabelText("Inquiry status") as HTMLSelectElement).value,
    ).toBe("in_progress");
    disabled("Save inquiry status");
    click("Review loading current inquiry");
    await screen.findByRole("alertdialog");
    click("Stay here");
    expect(
      (screen.getByLabelText("Inquiry status") as HTMLSelectElement).value,
    ).toBe("in_progress");
    click("Review loading current inquiry");
    click("Discard and leave");
    await waitFor(() =>
      expect(
        (screen.getByLabelText("Inquiry status") as HTMLSelectElement).value,
      ).toBe("resolved"),
    );
    expect(writes()).toHaveLength(0);
  });
  it("clears prior private body and proposed fields immediately after current redaction metadata arrives", async () => {
    mount();
    await ready();
    fireEvent.change(screen.getByLabelText("Inquiry status"), {
      target: { value: "in_progress" },
    });
    record = {
      ...record,
      name: "Removed contact",
      email: "",
      message: "Removed by contact retention.",
      interests: [],
      revision: 2,
      status: "redacted",
      redactedAt: new Date().toISOString(),
      attachment: null,
    };
    click("Refresh inquiry");
    await screen.findByRole("heading", { name: "Removed contact" });
    expect(screen.queryByText(seed.message)).toBeNull();
    expect(screen.queryByText(seed.email)).toBeNull();
    expect(screen.queryByLabelText("Inquiry status")).toBeNull();
    expect(writes()).toHaveLength(0);
  });
  it.each([401, 403, 404])(
    "clears selected record and proof on current read denial %s without automatic retries",
    async (status) => {
      mount();
      await ready();
      click("Review retention hold");
      fireEvent.change(screen.getByLabelText(/Current password/), {
        target: { value: "Fictional proof input" },
      });
      failures.set(
        "detail",
        new ApiFailure(status, "FORBIDDEN", "Fictional current denial"),
      );
      click("Refresh inquiry");
      await screen.findByText(/Private records and reviews have been cleared/);
      expect(screen.queryByText(seed.message)).toBeNull();
      expect(screen.queryByLabelText(/Current password/)).toBeNull();
      const before = transport.mock.calls.length;
      await act(async () => {
        await Promise.resolve();
      });
      expect(transport).toHaveBeenCalledTimes(before);
      failures.clear();
      click("Refresh inquiry");
      await ready();
      expect(writes()).toHaveLength(0);
    },
  );
  it.each([
    null,
    { items: [], total: 0, page: 1 },
    { items: [{ ...seed, id: other }], total: 1, page: 1 },
  ])(
    "refuses empty or mismatched selected results without crashing and offers retry %j",
    async (value) => {
      const original = transport.getMockImplementation()!;
      transport.mockImplementation((p, o) =>
        kind(p) === "detail" ? Promise.resolve(value) : original(p, o),
      );
      mount();
      await screen.findByText(/current inquiry reply could not be verified/);
      expect(screen.queryByText(seed.message)).toBeNull();
      transport.mockImplementation(original);
      click("Retry selected inquiry");
      await ready();
      expect(writes()).toHaveLength(0);
    },
  );
  it("clears an authorized file link when current inquiry reads become unverified and never restores it automatically", async () => {
    file();
    mount();
    await ready();
    click("Prepare private download");
    await screen.findByRole("link", { name: "Download fictional-private.txt" });
    failures.set("detail", Error("Fictional file context outage"));
    click("Refresh inquiry");
    await screen.findByText("Fictional file context outage");
    expect(
      screen.queryByRole("link", { name: "Download fictional-private.txt" }),
    ).toBeNull();
    failures.clear();
    click("Retry selected inquiry");
    await waitFor(() =>
      expect(
        (button("Prepare private download") as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    expect(
      screen.queryByRole("link", { name: "Download fictional-private.txt" }),
    ).toBeNull();
    expect(writes()).toHaveLength(0);
  });
  it("conceals the private parent when attachment authorization is denied", async () => {
    file();
    mount();
    await ready();
    failures.set(
      "attachment",
      new ApiFailure(404, "NOT_FOUND", "Fictional attachment unavailable"),
    );
    click("Prepare private download");
    await screen.findByText(/Private records and reviews have been cleared/);
    expect(screen.queryByText(seed.message)).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Download fictional-private.txt" }),
    ).toBeNull();
    expect(writes()).toHaveLength(0);
  });
  it("expires the activated private link after its short display window", async () => {
    file();
    mount();
    await ready();
    click("Prepare private download");
    await screen.findByRole("link", { name: "Download fictional-private.txt" });
    vi.useFakeTimers();
    click("Prepare private download");
    await act(async () => {
      await Promise.resolve();
    });
    act(() => vi.advanceTimersByTime(60001));
    expect(
      screen.queryByRole("link", { name: "Download fictional-private.txt" }),
    ).toBeNull();
  });
  it("aborts pending file authorization and ignores its late result after session reset", async () => {
    file();
    const pending = deferred<unknown>(),
      original = transport.getMockImplementation()!;
    transport.mockImplementation((p, o) =>
      kind(p) === "attachment" ? pending.promise : original(p, o),
    );
    mount();
    await ready();
    click("Prepare private download");
    const request = transport.mock.calls.find(
      ([p]) => kind(p) === "attachment",
    )!;
    act(() => window.dispatchEvent(new Event("gdg:session-cleared")));
    expect(request[1].signal.aborted).toBe(true);
    await act(async () =>
      pending.resolve({
        url: "https://storage.example.test/obsolete",
        filename: "fictional-private.txt",
      }),
    );
    expect(
      screen.queryByRole("link", { name: "Download fictional-private.txt" }),
    ).toBeNull();
    expect(writes()).toHaveLength(0);
  });
  it("clears the previous account review on direct account/role replacement", async () => {
    mount();
    await ready();
    click("Review retention hold");
    fireEvent.change(screen.getByLabelText(/Current password/), {
      target: { value: "Previous account private proof" },
    });
    act(() => {
      actor.id = "fictional-other-inbox-officer";
      actor.role = "super_admin";
      actor.version++;
      subscribers.forEach((changed) => changed());
    });
    await ready();
    expect(
      screen.queryByDisplayValue("Previous account private proof"),
    ).toBeNull();
    expect(screen.queryByLabelText(/Current password/)).toBeNull();
    expect(writes()).toHaveLength(0);
  });
  it("requires explicit current read after offline/reconnect without automatic requests", async () => {
    mount();
    await ready();
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    act(() => window.dispatchEvent(new Event("offline")));
    expect(screen.getByText(/Showing inquiries from/)).toBeTruthy();
    disabled("Save inquiry status");
    const before = transport.mock.calls.length;
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    act(() => window.dispatchEvent(new Event("online")));
    disabled("Review retention hold");
    expect(transport).toHaveBeenCalledTimes(before);
    click("Refresh inquiry");
    await waitFor(() =>
      expect(
        (button("Review retention hold") as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    expect(writes()).toHaveLength(0);
  });
  it("keeps dirty review navigation under the existing guard", async () => {
    mount();
    await ready();
    fireEvent.change(screen.getByLabelText("Inquiry status"), {
      target: { value: "in_progress" },
    });
    click("Back to inbox");
    await screen.findByRole("alertdialog");
    click("Stay here");
    expect(
      (screen.getByLabelText("Inquiry status") as HTMLSelectElement).value,
    ).toBe("in_progress");
    click("Back to inbox");
    click("Discard and leave");
    await screen.findByRole("button", { name: record.name, exact: true });
    expect(writes()).toHaveLength(0);
  });
  it("refreshes only after an acknowledged status save and displays the new record revision", async () => {
    mount();
    await ready();
    fireEvent.change(screen.getByLabelText("Inquiry status"), {
      target: { value: "in_progress" },
    });
    click("Save inquiry status");
    await screen.findByText(/revision 2/);
    expect(
      (screen.getByLabelText("Inquiry status") as HTMLSelectElement).value,
    ).toBe("in_progress");
    expect(writes()).toHaveLength(1);
    expect(writes()[0][1].body).toEqual({
      action: "status",
      revision: 1,
      status: "in_progress",
    });
  });
  it.each([
    { items: [{ id }], total: 1, page: 1 },
    { items: [{ ...seed, interests: null }], total: 1, page: 1 },
    { items: [{ ...seed, attachment: { id: other } }], total: 1, page: 1 },
  ])(
    "refuses malformed private inquiry payloads without rendering their fields %j",
    async (value) => {
      const original = transport.getMockImplementation()!;
      transport.mockImplementation((p, o) =>
        kind(p) === "detail" ? Promise.resolve(value) : original(p, o),
      );
      mount();
      await screen.findByText(/current inquiry reply could not be verified/);
      expect(screen.queryByText(seed.message)).toBeNull();
      expect(writes()).toHaveLength(0);
    },
  );
  it.each([
    "javascript:alert(1)",
    "http://storage.example.test/private",
    "https://user:password@storage.example.test/private",
  ])("refuses unsafe activated attachment URL %s", async (url) => {
    file();
    const original = transport.getMockImplementation()!;
    transport.mockImplementation((p, o) =>
      kind(p) === "attachment"
        ? Promise.resolve({
            url,
            filename: "fictional-private.txt",
            expiresIn: 60,
          })
        : original(p, o),
    );
    mount();
    await ready();
    click("Prepare private download");
    await screen.findByText(/private download link could not be verified/);
    expect(
      screen.queryByRole("link", { name: "Download fictional-private.txt" }),
    ).toBeNull();
    expect(writes()).toHaveLength(0);
  });
});
