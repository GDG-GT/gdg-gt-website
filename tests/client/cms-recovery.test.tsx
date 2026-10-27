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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import SiteContentWorkspace from "../../src/ui/content/SiteContentWorkspace";
import { ApiFailure } from "../../src/lib/api";
const { apiMock, refreshMock, actor } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  refreshMock: vi.fn(),
  actor: { id: "f1630000-0000-4000-8000-000000000001", role: "admin" },
}));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: apiMock,
}));
vi.mock("@/contexts/AdminContext", () => ({
  useAdmin: () => ({ currentAdmin: actor }),
}));
vi.mock("@/contexts/ContentContext", async (original) => ({
  ...(await original<typeof import("../../src/contexts/ContentContext")>()),
  useContent: () => ({ refreshContent: refreshMock }),
  ContentSnapshotProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));
vi.mock("@/hooks/useDraftGuard", () => ({ useDraftGuard: vi.fn() }));
vi.mock("../../src/ui/SiteShell", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("../../src/ui/PublicPages", () => ({
  HomePage: () => <h1>Fictional home composition</h1>,
  EventsPage: () => <h1>Fictional events composition</h1>,
  TeamPage: () => null,
  ResourcesPage: () => null,
  SponsorsPage: () => null,
  GalleryPage: () => null,
  ContactPage: () => null,
}));
const id = "f1630000-0000-4000-8000-000000000002",
  base = "/admin/site-content/pages",
  path = base + "/" + id;
const actions = ["read", "create", "update", "publish", "delete"],
  row = {
    id,
    revision: 1,
    is_active: false,
    deleted_at: null,
    updated_at: "2026-10-27T12:00:00Z",
    actions,
    page_slug: "home",
    section_key: "hero",
    content: {
      title: "Fictional private heading",
      description: "Fictional private copy",
    },
    order_index: 0,
  };
const listing = { items: [row], total: 1, page: 1, pageSize: 30 };
const snapshot = {
  settings: [],
  pages: [],
  navigation: [],
  social: [],
  footer: [],
  draftCount: 1,
  omitted: 0,
  generatedAt: "2026-10-27T12:00:00Z",
};
function response(p: string) {
  return p.endsWith("/capabilities")
    ? { actions }
    : p.startsWith("/admin/site-content/preview")
      ? snapshot
      : listing;
}
function deferred<T>() {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
const writes = () =>
  apiMock.mock.calls.filter(([, o]) => o?.method && o.method !== "GET");
function mount(preview = false) {
  return render(
    <MemoryRouter
      initialEntries={[
        "/admin/content" + (preview ? "?mode=preview&page=home" : ""),
      ]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <main id="workspace-content" tabIndex={-1}>
        <SiteContentWorkspace />
      </main>
    </MemoryRouter>,
  );
}
async function edit() {
  fireEvent.click(
    await screen.findByRole("button", { name: "Edit home / hero" }),
  );
  const input = screen.getByLabelText("Heading", { exact: true });
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Save private draft",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
  return input;
}
const refresh = () =>
  fireEvent.click(screen.getByRole("button", { name: "Refresh site content" }));
beforeEach(() => {
  apiMock.mockReset();
  refreshMock.mockReset();
  refreshMock.mockResolvedValue(true);
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
describe("CMS independent reads and retained drafts", () => {
  it("shows a skeleton and aborts independent capability and inventory reads", () => {
    const pending = deferred<unknown>();
    apiMock.mockReturnValue(pending.promise);
    const page = mount();
    expect(
      screen
        .getByRole("status", { name: "Loading site content" })
        .querySelector(".gt-skeleton"),
    ).toBeTruthy();
    const signals = apiMock.mock.calls.map(([, o]) => o.signal);
    page.unmount();
    expect(signals).toHaveLength(2);
    expect(signals.every((s) => s.aborted)).toBe(true);
  });
  it("keeps permission failure visible when inventory succeeds", async () => {
    apiMock.mockImplementation((p: string) =>
      p.endsWith("/capabilities")
        ? Promise.reject(Error("Permission interrupted"))
        : Promise.resolve(response(p)),
    );
    mount();
    await screen.findByText(/Content permissions: Permission interrupted/);
    expect(screen.getByRole("table", { name: "Page copy" })).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Create draft",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
  it("retains timestamped inventory after a temporary refresh error", async () => {
    let failed = false;
    apiMock.mockImplementation((p: string) =>
      failed && p.startsWith(base + "?")
        ? Promise.reject(Error("Inventory interrupted"))
        : Promise.resolve(response(p)),
    );
    mount();
    await screen.findByRole("button", { name: "Edit home / hero" });
    failed = true;
    refresh();
    await screen.findByText(/Content inventory may be out of date/);
    expect(screen.getByText("home / hero")).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Edit home / hero",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
  it("recovers an initial inventory error through retry", async () => {
    let failed = true;
    apiMock.mockImplementation((p: string) =>
      failed && p.startsWith(base + "?")
        ? Promise.reject(Error("Inventory interrupted"))
        : Promise.resolve(response(p)),
    );
    mount();
    await screen.findByText(/Content inventory: Inventory interrupted/);
    expect(
      screen.queryByRole("heading", { name: "No content in this view" }),
    ).toBeNull();
    failed = false;
    fireEvent.click(
      screen.getByRole("button", { name: "Retry content inventory" }),
    );
    expect(document.activeElement?.id).toBe("workspace-content");
    await screen.findByRole("button", { name: "Edit home / hero" });
  });
  it("does not display a previous collection while the next scope loads", async () => {
    const pending = deferred<unknown>();
    apiMock.mockImplementation((p: string) =>
      p.startsWith("/admin/site-content/social")
        ? pending.promise
        : Promise.resolve(response(p)),
    );
    mount();
    await screen.findByRole("button", { name: "Edit home / hero" });
    fireEvent.click(screen.getByRole("button", { name: "Social links" }));
    expect(screen.queryByText("home / hero")).toBeNull();
    expect(
      screen.getByRole("status", { name: "Loading site content" }),
    ).toBeTruthy();
  });
  it("preserves unsaved copy and blocks an obsolete selected revision", async () => {
    let revision = 1;
    apiMock.mockImplementation((p: string) =>
      Promise.resolve(
        p.startsWith(path + "?")
          ? { ...listing, items: [{ ...row, revision }] }
          : response(p),
      ),
    );
    mount();
    const input = await edit();
    fireEvent.change(input, { target: { value: "Fictional retained draft" } });
    revision = 2;
    refresh();
    await screen.findByText(/This content changed/);
    expect((input as HTMLTextAreaElement).value).toBe(
      "Fictional retained draft",
    );
    fireEvent.submit(input.closest("form")!);
    expect(writes()).toHaveLength(0);
  });
  it("blocks saving when an update grant is revoked without a revision change", async () => {
    let allowed = true;
    apiMock.mockImplementation((p: string) =>
      Promise.resolve(
        p.endsWith("/capabilities")
          ? { actions: allowed ? actions : ["read"] }
          : response(p),
      ),
    );
    mount();
    const input = await edit();
    allowed = false;
    refresh();
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Save private draft",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true),
    );
    fireEvent.submit(input.closest("form")!);
    expect(writes()).toHaveLength(0);
  });
  it("erases private drafts after capability read denial", async () => {
    let denied = false;
    apiMock.mockImplementation((p: string) =>
      p.endsWith("/capabilities") && denied
        ? Promise.reject(new ApiFailure(403, "FORBIDDEN", "CMS access revoked"))
        : Promise.resolve(response(p)),
    );
    mount();
    await edit();
    denied = true;
    refresh();
    await screen.findByText(/Content permissions: CMS access revoked/);
    expect(screen.queryByLabelText("Heading", { exact: true })).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });
  it("clears a selected editor whose row is no longer accessible", async () => {
    let missing = false;
    apiMock.mockImplementation((p: string) =>
      Promise.resolve(
        p.startsWith(path + "?") && missing
          ? { ...listing, items: [], total: 0 }
          : response(p),
      ),
    );
    mount();
    await edit();
    missing = true;
    refresh();
    await screen.findByText(
      "This content is no longer available in your current access.",
    );
    expect(screen.queryByLabelText("Heading", { exact: true })).toBeNull();
  });
});
describe("CMS private mutations and recovery", () => {
  it("suppresses duplicate saves and freezes the open fields", async () => {
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
    expect((input as HTMLTextAreaElement).disabled).toBe(true);
    await act(async () => pending.resolve({ record: row }));
    await screen.findByText("Saved privately. Review and publish separately.");
    expect(document.activeElement?.textContent).toBe(
      "Saved privately. Review and publish separately.",
    );
  });
  it("preserves uncertain saves and retains their server retry identity", async () => {
    apiMock.mockImplementation((p: string, o?: { method?: string }) =>
      o?.method
        ? Promise.reject(Error("Save not confirmed"))
        : Promise.resolve(response(p)),
    );
    mount();
    const input = await edit(),
      form = input.closest("form")!;
    fireEvent.change(input, { target: { value: "Fictional uncertain draft" } });
    fireEvent.submit(form);
    await screen.findByText("Save not confirmed");
    expect((input as HTMLTextAreaElement).value).toBe(
      "Fictional uncertain draft",
    );
    fireEvent.submit(form);
    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(writes()[0][1].idempotencyKey).toBe(writes()[1][1].idempotencyKey);
    expect(
      (
        screen.getByRole("button", {
          name: "Save private draft",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });
  it("allows correcting a known validation failure without losing draft copy", async () => {
    let failed = true;
    apiMock.mockImplementation((p: string, o?: { method?: string }) =>
      o?.method
        ? failed
          ? Promise.reject(
              new ApiFailure(400, "VALIDATION_ERROR", "Check supplied copy", {
                "record.content.title": "Invalid",
              }),
            )
          : Promise.resolve({ record: row })
        : Promise.resolve(response(p)),
    );
    mount();
    const input = await edit(),
      form = input.closest("form")!;
    fireEvent.submit(form);
    await screen.findByText("Check supplied copy");
    failed = false;
    fireEvent.change(input, { target: { value: "Corrected fictional draft" } });
    fireEvent.submit(form);
    await screen.findByText("Saved privately. Review and publish separately.");
    expect(writes()).toHaveLength(2);
  });
  it("reports a committed save truthfully when the public refresh fails", async () => {
    refreshMock.mockResolvedValue(false);
    mount();
    fireEvent.submit((await edit()).closest("form")!);
    await screen.findByText(
      /Saved privately\. Review and publish separately\. Public page content could not refresh/,
    );
    expect(writes()).toHaveLength(1);
  });
  it("aborts a pending save on session loss and ignores its late result", async () => {
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
      screen.queryByText("Saved privately. Review and publish separately."),
    ).toBeNull();
    expect(screen.queryByLabelText("Heading", { exact: true })).toBeNull();
    expect(refreshMock).not.toHaveBeenCalled();
  });
  it("requires a current publication review and applies its refreshed grant", async () => {
    let allowed = true;
    apiMock.mockImplementation((p: string) =>
      Promise.resolve(
        p.endsWith("/capabilities")
          ? { actions: allowed ? actions : ["read"] }
          : response(p),
      ),
    );
    mount();
    fireEvent.click(
      await screen.findByRole("button", { name: "Publish home / hero" }),
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
    expect(document.activeElement?.textContent).toBe(
      "Publish approved content?",
    );
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
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm publication" }),
    );
    expect(writes()).toHaveLength(0);
  });
  it("confirms unpublication separately and never changes a record on opening review", async () => {
    apiMock.mockImplementation((p: string, o?: { method?: string }) =>
      Promise.resolve(
        o?.method
          ? { record: row }
          : p.endsWith("/capabilities")
            ? { actions }
            : { ...listing, items: [{ ...row, is_active: true }] },
      ),
    );
    mount();
    fireEvent.click(
      await screen.findByRole("button", { name: "Unpublish home / hero" }),
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
    await screen.findByText("Public visibility updated.");
    expect(writes()[0][1].body.action).toBe("unpublish");
  });
  it("requires separate archive confirmation and retains the record", async () => {
    mount();
    fireEvent.click(
      await screen.findByRole("button", { name: "Archive home / hero" }),
    );
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Confirm archive",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm archive" }));
    await screen.findByText("Public visibility updated.");
    expect(writes()[0][1]).toMatchObject({
      method: "DELETE",
      body: { revision: 1, action: "archive" },
    });
  });
  it("preserves an offline draft without automatic writes on reconnect", async () => {
    const online = vi.spyOn(navigator, "onLine", "get");
    online.mockReturnValue(true);
    mount();
    const input = await edit();
    fireEvent.change(input, { target: { value: "Fictional offline content" } });
    online.mockReturnValue(false);
    act(() => window.dispatchEvent(new Event("offline")));
    fireEvent.submit(input.closest("form")!);
    online.mockReturnValue(true);
    act(() => window.dispatchEvent(new Event("online")));
    expect((input as HTMLTextAreaElement).value).toBe(
      "Fictional offline content",
    );
    expect(writes()).toHaveLength(0);
  });
  it("passes structural axe checks for editing and publication review", async () => {
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
    fireEvent.click(
      screen.getByRole("button", { name: "Publish home / hero" }),
    );
    await audit();
  });
});
describe("Private CMS composition snapshots", () => {
  it("aborts an abandoned preview and ignores a late response", async () => {
    const pending = deferred<unknown>();
    apiMock.mockReturnValue(pending.promise);
    const page = mount(true),
      signal = apiMock.mock.calls[0][1].signal;
    page.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve(snapshot));
    expect(screen.queryByText(/Includes 1 saved drafts/)).toBeNull();
  });
  it("keeps a timestamped preview on temporary reload failure and clears denied content", async () => {
    let status = "ready";
    apiMock.mockImplementation(() =>
      status === "ready"
        ? Promise.resolve(snapshot)
        : Promise.reject(
            status === "denied"
              ? new ApiFailure(403, "FORBIDDEN", "Preview access revoked")
              : Error("Preview interrupted"),
          ),
    );
    mount(true);
    await screen.findByText(/Includes 1 saved drafts/);
    status = "failed";
    fireEvent.click(
      screen.getByRole("button", { name: "Reload saved drafts" }),
    );
    await screen.findByText(/Showing the private snapshot last loaded/);
    expect(screen.getByText(/Includes 1 saved drafts/)).toBeTruthy();
    status = "denied";
    fireEvent.click(
      screen.getByRole("button", { name: "Reload saved drafts" }),
    );
    await screen.findByText("Preview access revoked");
    expect(screen.queryByText(/Includes 1 saved drafts/)).toBeNull();
  });
  it("hides the old composition while a different page loads", async () => {
    const pending = deferred<unknown>();
    apiMock.mockImplementation((p: string) =>
      p.includes("page=events") ? pending.promise : Promise.resolve(snapshot),
    );
    mount(true);
    await screen.findByText(/Includes 1 saved drafts/);
    fireEvent.change(screen.getByLabelText("Preview page"), {
      target: { value: "events" },
    });
    expect(screen.queryByText(/Includes 1 saved drafts/)).toBeNull();
    await act(async () => pending.resolve(snapshot));
    await screen.findByRole("heading", {
      name: "Fictional events composition",
    });
    expect(
      screen.queryByRole("heading", { name: "Fictional home composition" }),
    ).toBeNull();
  });
});
