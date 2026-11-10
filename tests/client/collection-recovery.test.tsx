// @vitest-environment jsdom
import React from "react";
import axe from "axe-core";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import CollectionWorkspace from "../../src/ui/content/CollectionWorkspace";
import { ApiFailure } from "../../src/lib/api";
const { apiMock, actor } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  actor: { id: "f1640000-0000-4000-8000-000000000001", role: "admin" },
}));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: apiMock,
}));
vi.mock("@/contexts/AdminContext", () => ({
  useAdmin: () => ({ currentAdmin: actor }),
}));
vi.mock("@/hooks/useDraftGuard", () => ({ useDraftGuard: vi.fn() }));
vi.mock("@/contexts/ContentContext", () => ({ useContent: () => ({}) }));
const id = "f1640000-0000-4000-8000-000000000002",
  base = "/admin/content-records/resources",
  path = base + "/" + id;
const row = {
  id,
  title: "Fictional private resource",
  description: "Fictional resource copy",
  type: "documentation",
  category: "",
  url: "",
  level: "Beginner",
  status: "Available",
  provider: "",
  duration: "",
  amount: "",
  speaker: "",
  requirements: [],
  materials: [],
  tags: [],
  icon: "",
  color: "#E6705F",
  order_index: 0,
  revision: 1,
  is_active: false,
  deleted_at: null,
  team_id: null,
  updated_at: "2026-10-27T12:00:00Z",
  actions: ["read", "update", "create", "delete", "publish"],
};
const cap = { globalCreate: true, teams: [] },
  listing = { items: [row], total: 1, page: 1, pageSize: 30 };
const response = (p: string) =>
  p.endsWith("/capabilities") ? cap : p === path ? { record: row } : listing;
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
const writes = () => apiMock.mock.calls.filter(([, o]) => o?.method);
function mount(kind: "resources" | "sponsors" | "team-profiles" = "resources") {
  return render(
    <MemoryRouter>
      <main id="workspace-content" tabIndex={-1}>
        <CollectionWorkspace initialKind={kind} />
      </main>
    </MemoryRouter>,
  );
}
async function edit() {
  fireEvent.click(
    await screen.findByRole("button", { name: "Edit " + row.title }),
  );
  const input = screen.getByLabelText(/^Title/);
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Save changes",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
  return input;
}
const refresh = () =>
  fireEvent.click(
    screen.getByRole("button", {
      name: screen.queryByRole("dialog")
        ? "Refresh review access"
        : "Refresh content records",
    }),
  );
beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockImplementation((p: string, o?: { method?: string }) =>
    Promise.resolve(
      o?.method ? { record: { ...row, revision: 2 } } : response(p),
    ),
  );
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("opens the exact synced Team draft from its member review link", async () => {
  const profile = { ...row, title: undefined, name: "Anish Kamath", role: "Executive board", team_section: "Core Team" };
  apiMock.mockImplementation(async (p: string) =>
    p.endsWith("/capabilities") ? cap : p.includes("?q=") ? { ...listing, items: [profile] } : { record: profile },
  );
  render(<MemoryRouter initialEntries={["/admin/content/team?profile=" + id]}>
    <main><CollectionWorkspace initialKind="team-profiles" /></main>
  </MemoryRouter>);
  await screen.findByRole("heading", { name: "Edit Anish Kamath" });
  expect((screen.getByLabelText(/^Name/) as HTMLInputElement).value).toBe("Anish Kamath");
  await waitFor(() => expect((screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement).disabled).toBe(false));
  expect(writes()).toHaveLength(0);
  expect(apiMock.mock.calls.some(([p]) => p === "/admin/content-records/team-profiles/" + id)).toBe(true);
});
it("shows a skeleton and aborts both independent reads", () => {
  const pending = deferred<unknown>();
  apiMock.mockReturnValue(pending.promise);
  const page = mount();
  expect(
    screen
      .getByRole("status", { name: "Loading content records" })
      .querySelector(".gt-skeleton"),
  ).toBeTruthy();
  const signals = apiMock.mock.calls.map(([, o]) => o.signal);
  page.unmount();
  expect(signals).toHaveLength(2);
  expect(signals.every((s) => s.aborted)).toBe(true);
});
it("keeps capability failure independent from a successful inventory", async () => {
  apiMock.mockImplementation((p: string) =>
    p.endsWith("/capabilities")
      ? Promise.reject(Error("Permission interrupted"))
      : Promise.resolve(response(p)),
  );
  mount();
  await screen.findByText(/Collection permissions: Permission interrupted/);
  expect(screen.getByText(row.title)).toBeTruthy();
  expect(
    (
      screen.getByRole("button", {
        name: "Edit " + row.title,
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
});
it("retains timestamped authorized inventory after a failed refresh", async () => {
  let failed = false;
  apiMock.mockImplementation((p: string) =>
    failed && p.startsWith(base + "?")
      ? Promise.reject(Error("Inventory interrupted"))
      : Promise.resolve(response(p)),
  );
  mount();
  await screen.findByText(row.title);
  failed = true;
  refresh();
  await screen.findByText(/Content inventory may be out of date/);
  expect(screen.getByText(row.title)).toBeTruthy();
});
it("retries an initial inventory failure without claiming an empty collection", async () => {
  let failed = true;
  apiMock.mockImplementation((p: string) =>
    failed && p.startsWith(base + "?")
      ? Promise.reject(Error("Inventory interrupted"))
      : Promise.resolve(response(p)),
  );
  mount();
  await screen.findByText(/Content inventory: Inventory interrupted/);
  expect(
    screen.queryByRole("heading", { name: "No matching content" }),
  ).toBeNull();
  failed = false;
  fireEvent.click(
    screen.getByRole("button", { name: "Retry content inventory" }),
  );
  expect(document.activeElement?.id).toBe("workspace-content");
  await screen.findByText(row.title);
});
it("hides old results while changed filters load and can reset an empty scope", async () => {
  const pending = deferred<unknown>();
  apiMock.mockImplementation((p: string) =>
    p.includes("q=none") ? pending.promise : Promise.resolve(response(p)),
  );
  mount();
  await screen.findByText(row.title);
  fireEvent.change(screen.getByRole("searchbox", { name: "Search content" }), {
    target: { value: "none" },
  });
  expect(screen.queryByText(row.title)).toBeNull();
  await act(async () => pending.resolve({ ...listing, items: [], total: 0 }));
  fireEvent.click(
    screen.getByRole("button", { name: "Reset content filters" }),
  );
  await screen.findByText(row.title);
});
it("preserves the draft and locks Save when the current revision changes", async () => {
  let revision = 1;
  apiMock.mockImplementation((p: string) =>
    Promise.resolve(
      p === path ? { record: { ...row, revision } } : response(p),
    ),
  );
  mount();
  const input = await edit();
  fireEvent.change(input, {
    target: { value: "Fictional retained resource edit" },
  });
  revision = 2;
  refresh();
  await screen.findByText(/This record changed/);
  expect((input as HTMLInputElement).value).toBe(
    "Fictional retained resource edit",
  );
  fireEvent.submit(input.closest("form")!);
  expect(writes()).toHaveLength(0);
});
it("applies revoked update grants at an unchanged revision", async () => {
  let allowed = true;
  apiMock.mockImplementation((p: string) =>
    Promise.resolve(
      p === path
        ? { record: { ...row, actions: allowed ? row.actions : ["read"] } }
        : response(p),
    ),
  );
  mount();
  const input = await edit();
  allowed = false;
  refresh();
  await screen.findByText(
    "Your current access no longer permits saving this draft.",
  );
  fireEvent.submit(input.closest("form")!);
  expect(writes()).toHaveLength(0);
});
it("erases private fields when the selected record is denied", async () => {
  let denied = false;
  apiMock.mockImplementation((p: string) =>
    p === path && denied
      ? Promise.reject(new ApiFailure(404, "NOT_FOUND", "Resource unavailable"))
      : Promise.resolve(response(p)),
  );
  mount();
  await edit();
  denied = true;
  refresh();
  await screen.findByText(
    "This record is no longer available in your current access.",
  );
  expect(screen.queryByLabelText(/^Title/)).toBeNull();
});
it("erases inventory and editor after a capability denial", async () => {
  let denied = false;
  apiMock.mockImplementation((p: string) =>
    p.endsWith("/capabilities") && denied
      ? Promise.reject(
          new ApiFailure(403, "FORBIDDEN", "Collection access revoked"),
        )
      : Promise.resolve(response(p)),
  );
  mount();
  await edit();
  denied = true;
  refresh();
  await screen.findByText(/Collection permissions: Collection access revoked/);
  expect(screen.queryByLabelText(/^Title/)).toBeNull();
  expect(screen.queryByText(row.title)).toBeNull();
});
it("does not carry a draft into another collection route prop", async () => {
  const page = mount();
  await edit();
  page.rerender(
    <MemoryRouter>
      <main>
        <CollectionWorkspace initialKind="team-profiles" />
      </main>
    </MemoryRouter>,
  );
  expect(screen.queryByLabelText(/^Title/)).toBeNull();
  await screen.findByRole("heading", { name: "Public team profiles" });
});
it("suppresses duplicate same-tick saves and freezes editable controls", async () => {
  const pending = deferred<unknown>();
  apiMock.mockImplementation((p: string, o?: { method?: string }) =>
    o?.method ? pending.promise : Promise.resolve(response(p)),
  );
  mount();
  const input = await edit(),
    form = input.closest("form")!;
  act(() => {
    fireEvent.submit(form);
    fireEvent.submit(form);
  });
  expect(writes()).toHaveLength(1);
  expect((input as HTMLInputElement).disabled).toBe(true);
  await act(async () => pending.resolve({ record: row }));
  await screen.findByText(
    "Saved as a private draft. Publish separately after review.",
  );
  expect(document.activeElement?.getAttribute("role")).toBe("status");
});
it("cancels pending saves on session clearing and ignores late success", async () => {
  const pending = deferred<unknown>();
  apiMock.mockImplementation((p: string, o?: { method?: string }) =>
    o?.method ? pending.promise : Promise.resolve(response(p)),
  );
  mount();
  fireEvent.submit((await edit()).closest("form")!);
  const signal = writes()[0][1].signal;
  act(() => window.dispatchEvent(new Event("gdg:session-cleared")));
  expect(signal.aborted).toBe(true);
  await act(async () => pending.resolve({ record: row }));
  expect(
    screen.queryByText(
      "Saved as a private draft. Publish separately after review.",
    ),
  ).toBeNull();
  expect(screen.queryByLabelText(/^Title/)).toBeNull();
});
it("preserves input and locks retry after a server revision conflict", async () => {
  apiMock.mockImplementation((p: string, o?: { method?: string }) =>
    o?.method
      ? Promise.reject(new ApiFailure(409, "CONFLICT", "Resource changed"))
      : Promise.resolve(response(p)),
  );
  mount();
  const input = await edit();
  fireEvent.submit(input.closest("form")!);
  await screen.findByText(/This record changed/);
  fireEvent.submit(input.closest("form")!);
  expect(writes()).toHaveLength(1);
});
it("revalidates publication grants when reviewing an unchanged record", async () => {
  let allowed = true;
  apiMock.mockImplementation((p: string) =>
    Promise.resolve(
      p === path
        ? { record: { ...row, actions: allowed ? row.actions : ["read"] } }
        : response(p),
    ),
  );
  mount();
  fireEvent.click(
    await screen.findByRole("button", { name: "Publish " + row.title }),
  );
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Confirm publication",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
  expect(document.activeElement?.textContent).toBe("Publish this record?");
  allowed = false;
  refresh();
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Confirm publication",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true),
  );
  fireEvent.click(screen.getByRole("button", { name: "Confirm publication" }));
  expect(writes()).toHaveLength(0);
});
it("confirms unpublication separately without mutating on opening review", async () => {
  apiMock.mockImplementation((p: string, o?: { method?: string }) =>
    Promise.resolve(
      o?.method
        ? { record: row }
        : p.endsWith("/capabilities")
          ? cap
          : p === path
            ? { record: { ...row, is_active: true } }
            : { ...listing, items: [{ ...row, is_active: true }] },
    ),
  );
  mount();
  fireEvent.click(
    await screen.findByRole("button", { name: "Unpublish " + row.title }),
  );
  expect(writes()).toHaveLength(0);
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Confirm unpublish",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole("button", { name: "Confirm unpublish" }));
  await screen.findByText("Publication state updated.");
  expect(writes()[0][1].body.action).toBe("unpublish");
});
it("duplicates once and focuses the accepted private-copy receipt", async () => {
  mount();
  const button = await screen.findByRole("button", {
    name: "Duplicate " + row.title,
  });
  act(() => {
    fireEvent.click(button);
    fireEvent.click(button);
  });
  await screen.findByText("A private draft copy was created.");
  expect(writes()).toHaveLength(1);
  expect(writes()[0][1].body.action).toBe("duplicate");
});
it("keeps offline input without auto-submitting on reconnect", async () => {
  const online = vi.spyOn(navigator, "onLine", "get");
  online.mockReturnValue(true);
  mount();
  const input = await edit();
  fireEvent.change(input, { target: { value: "Fictional offline resource" } });
  online.mockReturnValue(false);
  act(() => window.dispatchEvent(new Event("offline")));
  fireEvent.submit(input.closest("form")!);
  online.mockReturnValue(true);
  act(() => window.dispatchEvent(new Event("online")));
  expect((input as HTMLInputElement).value).toBe("Fictional offline resource");
  expect(writes()).toHaveLength(0);
});
it("clears private fields when a save discovers revoked access", async () => {
  apiMock.mockImplementation((p: string, o?: { method?: string }) =>
    o?.method
      ? Promise.reject(
          new ApiFailure(403, "FORBIDDEN", "Save permission revoked"),
        )
      : Promise.resolve(response(p)),
  );
  mount();
  const input = await edit();
  fireEvent.change(input, { target: { value: "Fictional denied draft" } });
  fireEvent.submit(input.closest("form")!);
  await screen.findByText("Save permission revoked");
  expect(screen.queryByLabelText(/^Title/)).toBeNull();
  expect(writes()).toHaveLength(1);
});
it.each([
  ["sponsors", "Sponsor name", "Fictional sponsor", "name"],
  ["team-profiles", "Name", "Fictional public profile", "name"],
] as const)(
  "creates a private %s draft with the same scoped write safeguards",
  async (kind, label, value, field) => {
    mount(kind);
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Create draft",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole("button", { name: "Create draft" }));
    const input = screen.getByLabelText(new RegExp("^" + label));
    fireEvent.change(input, { target: { value } });
    fireEvent.submit(input.closest("form")!);
    await screen.findByText(
      "Saved as a private draft. Publish separately after review.",
    );
    expect(writes()[0][0]).toBe("/admin/content-records/" + kind);
    expect(writes()[0][1].body.record[field]).toBe(value);
    expect(writes()[0][1].signal).toBeInstanceOf(AbortSignal);
    expect(writes()[0][1].idempotencyKey).toBeTruthy();
  },
);
it("passes structural axe checks for editor and publication review", async () => {
  const page = mount();
  await edit();
  const audit = async () => {
    const result = await axe.run(page.container, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"],
      },
      rules: { "color-contrast": { enabled: false } },
    });
    expect(
      result.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
  };
  await audit();
  fireEvent.click(screen.getByRole("button", { name: "Cancel editing" }));
  fireEvent.click(screen.getByRole("button", { name: "Publish " + row.title }));
  await audit();
});

it("sends an empty portfolio URL as null when saving a Team profile", async () => {
  const profile = { ...row, title: undefined, name: "Fictional existing officer", role: "Builder", portfolio_url: null, team_section: "Active Members" };
  apiMock.mockImplementation(async (p: string, o?: { method?: string }) => o?.method ? { record: { ...profile, revision: 2 } } : p.endsWith("/capabilities") ? cap : p.includes("?") ? { ...listing, items: [profile] } : { record: profile });
  mount("team-profiles");
  fireEvent.click(await screen.findByRole("button", { name: "Edit " + profile.name }));
  const portfolio = screen.getByLabelText("Portfolio / website");
  fireEvent.change(portfolio, { target: { value: "" } });
  await waitFor(() => expect((screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.submit(portfolio.closest("form")!);
  await screen.findByText("Saved as a private draft. Publish separately after review.");
  expect(writes()[0][1].body.record.portfolio_url).toBeNull();
});
