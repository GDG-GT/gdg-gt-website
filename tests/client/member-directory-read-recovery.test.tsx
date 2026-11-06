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
import MembersWorkspace from "../../src/ui/members/MembersWorkspace";
import NavigationSafety from "../../src/ui/NavigationSafety";
import { ApiFailure } from "../../src/lib/api";
import type { Member, Capabilities } from "../../src/ui/members/types";
const { transport, actor, subscribers } = vi.hoisted(() => ({
  transport: vi.fn(),
  actor: { id: "fictional-directory-reviewer", role: "admin", version: 0 },
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
const id = "f1320000-0000-4000-8000-000000000001",
  other = "f1320000-0000-4000-8000-000000000002";
const member: Member = {
  id,
  reference: "GDG-FICTIONAL",
  name: "Fictional directory person",
  email: "fictional-directory@example.test",
  phone: "",
  year: "",
  major: "",
  interests: ["Fictional interest"],
  category: "member",
  is_active: true,
  is_core_team: false,
  team_section: "Active Members",
  team_id: null,
  teamName: null,
  revision: 1,
  deleted_at: null,
  merged_into_id: null,
  actions: ["update", "delete", "merge"],
  publicProfile: null,
  canSyncProfile: false,
  activeProjectCount: 0,
};
const cap: Capabilities = { globalCreate: true, merge: true, teams: [] };
const inventory = () => ({
  items: [member],
  total: 1,
  pageSize: 30,
  stats: { active: 1, core: 0, categories: { member: 1 } },
});
const activity = {
  items: [
    {
      id: other,
      action: "members.created",
      result: "success",
      created_at: "2026-11-06T12:00:00Z",
    },
  ],
  page: 1,
  pageSize: 30,
};
let routers: ReturnType<typeof createMemoryRouter>[] = [],
  failures: Map<string, Error>,
  revision: number;
function category(path: string) {
  return path.endsWith("/capabilities")
    ? "permissions"
    : path.includes("/activity?")
      ? "activity"
      : path.includes("?")
        ? "inventory"
        : "detail";
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
function mount(selected = false) {
  const router = createMemoryRouter(
    [
      {
        path: "/admin/members",
        element: (
          <NavigationSafety>
            <main>
              <MembersWorkspace />
            </main>
          </NavigationSafety>
        ),
      },
    ],
    { initialEntries: ["/admin/members" + (selected ? "?member=" + id : "")] },
  );
  routers.push(router);
  const view = render(<RouterProvider router={router} />);
  return { router, ...view };
}
const button = (name: string) =>
  screen.getByRole("button", { name, exact: true });
const click = (name: string) => fireEvent.click(button(name));
const disabled = (name: string) =>
  expect((button(name) as HTMLButtonElement).disabled).toBe(true);
const writes = () =>
  transport.mock.calls.filter(([, options]) => options?.method === "POST");
async function ready() {
  await screen.findByText(/1 matching records/);
  await waitFor(() =>
    expect((button("New member") as HTMLButtonElement).disabled).toBe(false),
  );
}
beforeEach(() => {
  transport.mockReset();
  failures = new Map();
  revision = 1;
  actor.id = "fictional-directory-reviewer";
  actor.role = "admin";
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: true,
  });
  transport.mockImplementation(
    async (path: string, options: { method?: string } = {}) => {
      if (options.method === "POST")
        return { id, revision: 1, profileId: null };
      const kind = category(path);
      if (failures.has(kind)) throw failures.get(kind);
      if (kind === "permissions") return cap;
      if (kind === "inventory") return inventory();
      if (kind === "activity") return activity;
      return { member: { ...member, revision } };
    },
  );
});
afterEach(() => {
  cleanup();
  for (const router of routers) router.dispose();
  routers = [];
  vi.restoreAllMocks();
});
describe("Community directory independent private read recovery", () => {
  it("provides named independent loading states and prevents creation before current permissions", async () => {
    const pending = deferred<Capabilities>(),
      original = transport.getMockImplementation()!;
    transport.mockImplementation((path: string, o) =>
      category(path) === "permissions" ? pending.promise : original(path, o),
    );
    mount();
    await screen.findByText(/1 matching records/);
    expect(
      screen.getByRole("status", { name: "Loading member permissions" }),
    ).toBeTruthy();
    disabled("New member");
    await act(async () => pending.resolve(cap));
    await ready();
  });
  it("does not let a successful inventory hide the permissions failure and retries only that read", async () => {
    failures.set("permissions", Error("Fictional permissions outage"));
    mount();
    await screen.findByText(/Fictional permissions outage/);
    await screen.findByText(/1 matching records/);
    disabled("New member");
    const count = transport.mock.calls.filter(
      ([p]) => category(p) === "inventory",
    ).length;
    failures.delete("permissions");
    click("Retry member permissions");
    await ready();
    expect(
      transport.mock.calls.filter(([p]) => category(p) === "inventory"),
    ).toHaveLength(count);
    expect(writes()).toHaveLength(0);
  });
  it("recovers initial inventory failure without issuing a mutation", async () => {
    failures.set("inventory", Error("Fictional inventory outage"));
    mount();
    await screen.findByText(/Fictional inventory outage/);
    disabled("New member");
    failures.clear();
    click("Retry member inventory");
    await ready();
    expect(writes()).toHaveLength(0);
  });
  it("retains a dated inventory on background failure, pausing management and transfers", async () => {
    mount();
    await ready();
    failures.set("inventory", Error("Fictional background outage"));
    click("Recheck member access");
    await screen.findByText(/Fictional background outage/);
    expect(screen.getByText("fictional-directory@example.test")).toBeTruthy();
    expect(screen.getByText(/Showing member inventory from/)).toBeTruthy();
    disabled("New member");
    disabled("Import CSV");
    disabled("Manage Fictional directory person");
    failures.clear();
    click("Retry member inventory");
    await ready();
  });
  it("recovers selected-detail failure without losing the independent inventory", async () => {
    failures.set("detail", Error("Fictional selected outage"));
    mount(true);
    await screen.findByText(/Fictional selected outage/);
    expect(screen.getByText(/1 matching records/)).toBeTruthy();
    failures.clear();
    click("Retry selected member");
    await screen.findByRole("heading", { name: member.name });
    expect(writes()).toHaveLength(0);
  });
  it("keeps activity failure visible and retries it independently", async () => {
    failures.set("activity", Error("Fictional activity outage"));
    mount(true);
    await screen.findByText(/Fictional activity outage/);
    await screen.findByRole("heading", { name: member.name });
    const before = transport.mock.calls.filter(
      ([p]) => category(p) === "detail",
    ).length;
    failures.clear();
    click("Retry member activity");
    await screen.findByText("created");
    expect(
      transport.mock.calls.filter(([p]) => category(p) === "detail"),
    ).toHaveLength(before);
  });
  it("preserves proposed editor values and disables saving until a successful current read", async () => {
    mount(true);
    await ready();
    await screen.findByRole("heading", { name: member.name });
    click("Edit member");
    fireEvent.change(screen.getByLabelText("Name *"), {
      target: { value: "Unsaved fictional name" },
    });
    failures.set("detail", Error("Fictional refresh outage"));
    click("Recheck member access");
    await screen.findByText(/Fictional refresh outage/);
    expect((screen.getByLabelText("Name *") as HTMLInputElement).value).toBe(
      "Unsaved fictional name",
    );
    disabled("Save member changes");
    failures.clear();
    click("Retry selected member");
    await waitFor(() =>
      expect(
        (button("Save member changes") as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    expect((screen.getByLabelText("Name *") as HTMLInputElement).value).toBe(
      "Unsaved fictional name",
    );
    expect(writes()).toHaveLength(0);
  });
  it("keeps a changed server revision from silently replacing the proposed editor", async () => {
    mount(true);
    await ready();
    await screen.findByRole("heading", { name: member.name });
    click("Edit member");
    fireEvent.change(screen.getByLabelText("Name *"), {
      target: { value: "Held fictional proposal" },
    });
    revision = 2;
    click("Recheck member access");
    await screen.findByText(/This record or your access changed/);
    disabled("Save member changes");
    expect((screen.getByLabelText("Name *") as HTMLInputElement).value).toBe(
      "Held fictional proposal",
    );
    expect(writes()).toHaveLength(0);
  });
  it.each([401, 403, 404])(
    "clears all private snapshots and proposal after current read denial %s without an automatic retry loop",
    async (status) => {
      mount(true);
      await ready();
      await screen.findByRole("heading", { name: member.name });
      click("Edit member");
      failures.set(
        "detail",
        new ApiFailure(status, "FORBIDDEN", "Fictional current denial"),
      );
      click("Recheck member access");
      await screen.findByText(/Private records and edits have been cleared/);
      expect(screen.queryByText(member.email)).toBeNull();
      expect(screen.queryByLabelText("Name *")).toBeNull();
      disabled("New member");
      const count = transport.mock.calls.length;
      await act(async () => {
        await Promise.resolve();
      });
      expect(transport).toHaveBeenCalledTimes(count);
      failures.clear();
      click("Recheck member access");
      await ready();
      await screen.findByRole("heading", { name: member.name });
      expect(writes()).toHaveLength(0);
    },
  );
  it("hides the old query snapshot immediately and ignores a late previous-query read", async () => {
    const pending = deferred<ReturnType<typeof inventory>>(),
      original = transport.getMockImplementation()!;
    transport.mockImplementation((path: string, o) =>
      path.includes("q=Earlier")
        ? pending.promise
        : path.includes("q=Later")
          ? Promise.resolve({ ...inventory(), items: [], total: 0 })
          : original(path, o),
    );
    mount();
    await ready();
    fireEvent.change(screen.getByLabelText("Search private members"), {
      target: { value: "Earlier" },
    });
    expect(screen.queryByText(member.email)).toBeNull();
    fireEvent.change(screen.getByLabelText("Search private members"), {
      target: { value: "Later" },
    });
    await screen.findByRole("heading", {
      name: "No matching community members",
    });
    await act(async () => pending.resolve(inventory()));
    expect(screen.queryByText(member.email)).toBeNull();
  });
  it("retains dated snapshots offline and requires explicit access recheck after reconnect", async () => {
    mount();
    await ready();
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    act(() => window.dispatchEvent(new Event("offline")));
    expect(screen.getByText(/Showing member inventory from/)).toBeTruthy();
    disabled("New member");
    const before = transport.mock.calls.length;
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    act(() => window.dispatchEvent(new Event("online")));
    disabled("New member");
    expect(transport).toHaveBeenCalledTimes(before);
    click("Recheck member access");
    await ready();
  });
  it("clears private edits and aborts old reads on explicit session reset", async () => {
    mount(true);
    await ready();
    await screen.findByRole("heading", { name: member.name });
    click("Edit member");
    fireEvent.change(screen.getByLabelText("Name *"), {
      target: { value: "Old session private proposal" },
    });
    const pending = deferred<{ member: Member }>(),
      original = transport.getMockImplementation()!;
    transport.mockImplementation((path: string, o) =>
      category(path) === "detail" ? pending.promise : original(path, o),
    );
    click("Recheck member access");
    const options = transport.mock.calls
      .filter(([p]) => category(p) === "detail")
      .at(-1)![1];
    act(() => window.dispatchEvent(new Event("gdg:session-cleared")));
    expect(options.signal.aborted).toBe(true);
    await act(async () => pending.resolve({ member }));
    expect(
      screen.queryByDisplayValue("Old session private proposal"),
    ).toBeNull();
    expect(writes()).toHaveLength(0);
  });
  it("preserves dirty fields when declining navigation and clears them on reviewed departure", async () => {
    mount();
    await ready();
    click("New member");
    fireEvent.change(screen.getByLabelText("Name *"), {
      target: { value: "Held new member" },
    });
    click("Close editor");
    await screen.findByRole("alertdialog");
    click("Stay here");
    expect((screen.getByLabelText("Name *") as HTMLInputElement).value).toBe(
      "Held new member",
    );
    click("Close editor");
    click("Discard and leave");
    expect(screen.queryByLabelText("Name *")).toBeNull();
    expect(writes()).toHaveLength(0);
  });
  it("saves a permitted new private record with current scope and refreshes after server confirmation", async () => {
    mount();
    await ready();
    click("New member");
    fireEvent.change(screen.getByLabelText("Name *"), {
      target: { value: "Fictional New Person" },
    });
    fireEvent.change(screen.getByLabelText("Email *"), {
      target: { value: "new-person@example.test" },
    });
    click("Save member changes");
    await screen.findByText(/Community record saved/);
    expect(writes()).toHaveLength(1);
    expect(writes()[0][1]).toMatchObject({
      body: {
        record: {
          name: "Fictional New Person",
          email: "new-person@example.test",
        },
        teamId: null,
      },
      protected: true,
    });
  });
  it.each(["permissions", "inventory", "detail", "activity"])(
    "refuses malformed %s replies and offers a read-only retry",
    async (kind) => {
      const original = transport.getMockImplementation()!;
      transport.mockImplementation((path: string, options) =>
        category(path) === kind
          ? Promise.resolve(null)
          : original(path, options),
      );
      mount(true);
      await screen.findByText(/member data reply could not be verified/);
      if (kind !== "activity") disabled("New member");
      transport.mockImplementation(original);
      click(
        "Retry " +
          {
            permissions: "member permissions",
            inventory: "member inventory",
            detail: "selected member",
            activity: "member activity",
          }[kind],
      );
      await ready();
      await screen.findByRole("heading", { name: member.name });
      expect(writes()).toHaveLength(0);
    },
  );
  it("discards a previous account's proposed member fields on an account/role context replacement", async () => {
    mount();
    await ready();
    click("New member");
    fireEvent.change(screen.getByLabelText("Name *"), {
      target: { value: "Previous account's private proposal" },
    });
    actor.id = "fictional-new-directory-reviewer";
    actor.role = "team_member";
    act(() => {
      actor.version++;
      subscribers.forEach((changed) => changed());
    });
    await ready();
    expect(
      screen.queryByDisplayValue("Previous account's private proposal"),
    ).toBeNull();
    expect(writes()).toHaveLength(0);
  });
  it("pauses an already-open merge review when parent permissions cannot refresh", async () => {
    mount(true);
    await ready();
    await screen.findByRole("heading", { name: member.name });
    click("Review duplicate merge");
    await screen.findByRole("heading", { name: "Review a retained duplicate" });
    failures.set("permissions", Error("Fictional parent permission outage"));
    click("Recheck member access");
    await screen.findByText(/Fictional parent permission outage/);
    const field = screen
      .getByLabelText("Canonical member to keep")
      .closest("fieldset") as HTMLFieldSetElement;
    expect(field.disabled).toBe(true);
    expect(writes()).toHaveLength(0);
  });
});
