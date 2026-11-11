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
import LinktreeWorkspace from "../../src/ui/linktree/LinktreeWorkspace";
import { ApiFailure } from "../../src/lib/api";
import type { Profile, Detail, Analytics } from "../../src/ui/linktree/types";
const { apiMock, actor } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  actor: { id: "fictional-admin", role: "admin" },
}));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: apiMock,
}));
vi.mock("@/contexts/AdminContext", () => ({
  useAdmin: () => ({ currentAdmin: actor }),
}));
vi.mock("@/hooks/useDraftGuard", async (original) => ({
  ...(await original<typeof import("../../src/hooks/useDraftGuard")>()),
  useDraftGuard: vi.fn(),
  useNavigationSafety: () => ({
    request: (run: () => void) => run(),
    allow: (run: () => void) => run(),
  }),
}));
const id = "f1490000-0000-4000-8000-000000000001",
  second = "f1490000-0000-4000-8000-000000000002";
const profile = (recordId = id): Profile => ({
  id: recordId,
  username: recordId === id ? "fictional-hub" : "fictional-second",
  displayName: recordId === id ? "Fictional first hub" : "Fictional second hub",
  bio: "Fictional chapter links",
  avatarUrl: "",
  background: { type: "color", value: "#f8d8c6" },
  theme: "light",
  active: false,
  deletedAt: null,
  teamId: null,
  teamName: null,
  revision: 1,
  actions: ["read", "create", "update", "publish", "delete"],
});
const detail = (recordId = id): Detail => ({
  profile: profile(recordId),
  links: [],
  linkTotal: 0,
  linkPageSize: 30,
});
const report: Analytics = {
  views: "17",
  clicks: "6",
  lifetimeViews: "17",
  days: [],
  links: [],
  note: "Fictional aggregate note",
};
function deferred<T>() {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
const response = (path: string) =>
  path.endsWith("/capabilities")
    ? { globalCreate: true, teams: [] }
    : path.startsWith("/admin/linktree/analytics")
      ? report
      : /\/profiles\//.test(path)
        ? detail(path.split("/").at(-1)!.split("?")[0])
        : { items: [profile(), profile(second)], total: 2, pageSize: 30 };
function mount(selected = "") {
  return render(
    <MemoryRouter
      initialEntries={[
        "/admin/linktree" + (selected ? "?profile=" + selected : ""),
      ]}
    >
      <main id="workspace-content" tabIndex={-1}>
        <LinktreeWorkspace />
      </main>
    </MemoryRouter>,
  );
}
async function editProfile() {
  const button = await screen.findByRole("button", { name: "Edit profile" });
  await waitFor(() =>
    expect((button as HTMLButtonElement).disabled).toBe(false),
  );
  fireEvent.click(button);
  return screen.findByLabelText(/Display name/);
}
beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockImplementation((path: string) => Promise.resolve(response(path)));
  actor.id = "fictional-admin";
  actor.role = "admin";
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("Linktree independent reads and recovery", () => {
  it("keeps capability errors visible when inventory succeeds, and retries with landmark focus", async () => {
    let failed = true;
    apiMock.mockImplementation((path: string) =>
      path.endsWith("/capabilities") && failed
        ? Promise.reject(Error("Permissions temporarily unavailable"))
        : Promise.resolve(response(path)),
    );
    mount();
    await screen.findByText(
      /creation permissions: Permissions temporarily unavailable/,
    );
    await screen.findByText("Fictional first hub");
    expect(
      (screen.getByRole("button", { name: "New profile" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    failed = false;
    fireEvent.click(
      screen.getByRole("button", { name: "Retry creation permissions" }),
    );
    expect(document.activeElement?.id).toBe("workspace-content");
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "New profile",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    expect(
      screen.queryByText(/Permissions temporarily unavailable/),
    ).toBeNull();
  });
  it("provides actual skeletons for initial capabilities, inventory, detail and analytics", async () => {
    const pending = deferred<unknown>();
    apiMock.mockReturnValue(pending.promise);
    const page = mount(id);
    for (const name of ["creation permissions", "profiles", "profile details"])
      expect(
        screen
          .getByRole("status", { name: "Loading " + name })
          .querySelector(".gt-skeleton"),
      ).toBeTruthy();
    page.unmount();
    await act(async () => pending.resolve(detail()));
  });
  it("hides rows immediately on changed filters, aborts superseded reads and ignores late results", async () => {
    const pending = deferred<unknown>();
    let signal: AbortSignal | undefined;
    apiMock.mockImplementation(
      (path: string, options?: { signal?: AbortSignal }) => {
        if (path.includes("q=old")) {
          signal = options?.signal;
          return pending.promise;
        }
        return Promise.resolve(response(path));
      },
    );
    mount();
    await screen.findByText("Fictional first hub");
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search link profiles" }),
      { target: { value: "old" } },
    );
    expect(screen.queryByText("Fictional first hub")).toBeNull();
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search link profiles" }),
      { target: { value: "new" } },
    );
    await screen.findByText("Fictional first hub");
    expect(signal?.aborted).toBe(true);
    await act(async () =>
      pending.resolve({
        items: [{ ...profile(), displayName: "Obsolete hidden hub" }],
        total: 1,
        pageSize: 30,
      }),
    );
    expect(screen.queryByText("Obsolete hidden hub")).toBeNull();
  });
  it("retains timestamped stale inventory after failed background refresh and blocks row actions", async () => {
    mount();
    await screen.findByText("Fictional first hub");
    apiMock.mockImplementation((path: string) =>
      path.includes("/profiles?")
        ? Promise.reject(Error("Inventory interrupted"))
        : Promise.resolve(response(path)),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh", exact: true }),
    );
    await screen.findByText(/profiles: Inventory interrupted/);
    expect(
      screen.getByText(/profiles may be out of date. Last loaded/),
    ).toBeTruthy();
    expect(screen.getByText("Fictional first hub")).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Manage Fictional first hub",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
  it("clears private rows and editors on a denied inventory refresh", async () => {
    mount(id);
    await editProfile();
    apiMock.mockImplementation((path: string) =>
      path.includes("/profiles?")
        ? Promise.reject(new ApiFailure(403, "FORBIDDEN", "No permission"))
        : Promise.resolve(response(path)),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh", exact: true }),
    );
    await screen.findByText(/profiles: No permission/);
    expect(screen.queryByLabelText(/Display name/)).toBeNull();
    expect(screen.queryByText("Fictional first hub")).toBeNull();
    const pending = deferred<unknown>();
    apiMock.mockReturnValue(pending.promise);
    fireEvent.click(screen.getByRole("button", { name: "Retry profiles" }));
    expect(
      screen.queryByRole("heading", { name: "Fictional first hub" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit profile" })).toBeNull();
    expect(screen.queryByText("Fictional aggregate note")).toBeNull();
  });
  it("shows recoverable detail and analytics failures independently", async () => {
    apiMock.mockImplementation((path: string) =>
      path.startsWith("/admin/linktree/analytics")
        ? Promise.reject(Error("Analytics interrupted"))
        : Promise.resolve(response(path)),
    );
    mount(id);
    await screen.findByText(/analytics: Analytics interrupted/);
    expect(screen.getByRole("button", { name: "Edit profile" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Retry analytics" }),
    ).toBeTruthy();
    expect(screen.queryByText(/profile details:/)).toBeNull();
  });
  it("hides previous analytics as soon as its selected period changes", async () => {
    const pending = deferred<unknown>();
    apiMock.mockImplementation((path: string) =>
      path.includes("days=7")
        ? pending.promise
        : Promise.resolve(response(path)),
    );
    mount(id);
    await screen.findByText("Fictional aggregate note");
    fireEvent.change(screen.getByLabelText("Analytics period"), {
      target: { value: "7" },
    });
    expect(screen.queryByText("Fictional aggregate note")).toBeNull();
    expect(
      screen.getByRole("status", { name: "Loading analytics" }),
    ).toBeTruthy();
    await act(async () =>
      pending.resolve({ ...report, note: "New seven-day aggregate" }),
    );
    expect(screen.getByText("New seven-day aggregate")).toBeTruthy();
  });
  it("resets filtered empty states with a permitted next step instead of suggesting unavailable creation", async () => {
    apiMock.mockImplementation((path: string) =>
      Promise.resolve(
        path.endsWith("/capabilities")
          ? { globalCreate: false, teams: [] }
          : path.includes("q=none")
            ? { items: [], total: 0, pageSize: 30 }
            : response(path),
      ),
    );
    mount();
    await screen.findByText("Fictional first hub");
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search link profiles" }),
      { target: { value: "none" } },
    );
    await screen.findByRole("heading", {
      name: "No profiles match these filters",
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Reset profile filters" }),
    );
    await screen.findByText("Fictional first hub");
    expect(
      (
        screen.getByRole("searchbox", {
          name: "Search link profiles",
        }) as HTMLInputElement
      ).value,
    ).toBe("");
  });
});
describe("Linktree mutation lifecycle", () => {
  it("keeps active profile changes locked until exact target and current-password confirmation", async () => {
    apiMock.mockImplementation((path: string, options?: { method?: string }) =>
      Promise.resolve(
        options?.method === "POST"
          ? { id }
          : /\/profiles\//.test(path)
            ? { ...detail(), profile: { ...profile(), active: true } }
            : response(path),
      ),
    );
    mount(id);
    await editProfile();
    const save = screen.getByRole("button", {
        name: "Save changes",
      }) as HTMLButtonElement,
      confirm = screen.getByLabelText(/Type “Fictional first hub” to confirm/),
      password = screen.getByLabelText(/Current password/);
    expect(save.disabled).toBe(true);
    fireEvent.change(confirm, { target: { value: "Wrong target" } });
    fireEvent.change(password, {
      target: { value: "Fictional-test-confirmation" },
    });
    fireEvent.submit(confirm.closest("form")!);
    expect(
      apiMock.mock.calls.some(([, options]) => options?.method === "POST"),
    ).toBe(false);
    fireEvent.change(confirm, { target: { value: "Fictional first hub" } });
    expect(save.disabled).toBe(false);
    fireEvent.submit(confirm.closest("form")!);
    await screen.findByText("Linktree changes saved.");
    expect(
      apiMock.mock.calls.filter(
        ([, options]) => options?.method === "POST",
      )[0][1].body,
    ).toMatchObject({
      action: "update",
      confirmation: "Fictional first hub",
      currentPassword: "Fictional-test-confirmation",
    });
  });
  it("creates a private profile only in the currently granted team scope", async () => {
    const team = "f1490000-0000-4000-8000-000000000003";
    apiMock.mockImplementation((path: string, options?: { method?: string }) =>
      Promise.resolve(
        options?.method === "POST"
          ? { id }
          : path.endsWith("/capabilities")
            ? {
                globalCreate: false,
                teams: [{ id: team, name: "Fictional permitted team" }],
              }
            : response(path),
      ),
    );
    mount();
    const start = await screen.findByRole("button", { name: "New profile" });
    await waitFor(() =>
      expect((start as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(start);
    fireEvent.change(screen.getByLabelText(/Public username/), {
      target: { value: "fictional-draft" },
    });
    fireEvent.change(screen.getByLabelText(/Display name/), {
      target: { value: "Fictional new draft" },
    });
    expect(
      (
        screen.getByRole("button", {
          name: "Save changes",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.change(screen.getByLabelText("Team"), {
      target: { value: team },
    });
    fireEvent.submit(screen.getByLabelText(/Display name/).closest("form")!);
    await screen.findByText(
      "Private draft saved. Activate it separately after review.",
    );
    const writes = apiMock.mock.calls.filter(
      ([, options]) => options?.method === "POST",
    );
    expect(writes).toHaveLength(1);
    expect(writes[0][0]).toBe("/admin/linktree/profiles");
    expect(writes[0][1].body).toMatchObject({
      teamId: team,
      record: {
        username: "fictional-draft",
        displayName: "Fictional new draft",
      },
    });
    expect(writes[0][1].body).not.toHaveProperty("active");
  });
  it("keeps a 409 draft visible while blocking stale saves", async () => {
    apiMock.mockImplementation((path: string, options?: { method?: string }) =>
      options?.method === "POST"
        ? Promise.reject(new ApiFailure(409, "CONFLICT", "Revision changed"))
        : Promise.resolve(response(path)),
    );
    mount(id);
    const name = await editProfile();
    fireEvent.change(name, { target: { value: "Preserved stale draft" } });
    fireEvent.submit(name.closest("form")!);
    await screen.findByText("Revision changed");
    expect(
      (
        screen.getByRole("button", {
          name: "Save changes",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (screen.getByLabelText(/Display name/) as HTMLInputElement).value,
    ).toBe("Preserved stale draft");
  });
  it("requires exact target confirmation, freezes a decision synchronously and focuses its receipt", async () => {
    const pending = deferred<{ id: string }>();
    apiMock.mockImplementation((path: string, options?: { method?: string }) =>
      options?.method === "POST"
        ? pending.promise
        : Promise.resolve(response(path)),
    );
    mount(id);
    const start = await screen.findByRole("button", {
      name: "Archive profile",
    });
    await waitFor(() =>
      expect((start as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(start);
    const confirm = screen.getByLabelText(
        /Type “Fictional first hub” to confirm/,
      ),
      password = screen.getByLabelText(/Current password/);
    expect(
      (
        screen.getByRole("button", {
          name: "Confirm change",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.change(confirm, { target: { value: "Fictional first hub" } });
    fireEvent.change(password, {
      target: { value: "Fictional-test-confirmation" },
    });
    act(() => {
      fireEvent.submit(confirm.closest("form")!);
      fireEvent.submit(confirm.closest("form")!);
    });
    const writes = apiMock.mock.calls.filter(
      ([, options]) => options?.method === "POST",
    );
    expect(writes).toHaveLength(1);
    expect(writes[0][1].body).toMatchObject({
      action: "archive",
      revision: 1,
      confirmation: "Fictional first hub",
    });
    expect((password as HTMLInputElement).value).toBe("");
    await act(async () => pending.resolve({ id }));
    expect(document.activeElement?.textContent).toBe(
      "Confirmed Linktree change recorded.",
    );
  });
  it("passes axe structural checks for management, profile fields and decision controls", async () => {
    const page = mount(id);
    const ready = await screen.findByRole("button", { name: "Edit profile" });
    await waitFor(() =>
      expect((ready as HTMLButtonElement).disabled).toBe(false),
    );
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
    fireEvent.click(ready);
    await screen.findByLabelText(/Display name/);
    await audit();
    fireEvent.click(screen.getByRole("button", { name: "Close editor" }));
    fireEvent.click(screen.getByRole("button", { name: "Archive profile" }));
    await screen.findByLabelText(/Current password/);
    await audit();
  });
  it("prevents synchronous duplicate submissions, freezes inputs, then focuses server success", async () => {
    const pending = deferred<{ id: string }>();
    apiMock.mockImplementation((path: string, options?: { method?: string }) =>
      options?.method === "POST"
        ? pending.promise
        : Promise.resolve(response(path)),
    );
    mount(id);
    const name = await editProfile(),
      form = name.closest("form")!;
    fireEvent.change(name, { target: { value: "Updated fictional hub" } });
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    expect(
      apiMock.mock.calls.filter(([, options]) => options?.method === "POST"),
    ).toHaveLength(1);
    expect((name as HTMLInputElement).disabled).toBe(true);
    await act(async () => pending.resolve({ id }));
    expect(document.activeElement?.textContent).toBe("Linktree changes saved.");
  });
  it("retains failed draft input and focuses its safe error", async () => {
    apiMock.mockImplementation((path: string, options?: { method?: string }) =>
      options?.method === "POST"
        ? Promise.reject(Error("Save interrupted"))
        : Promise.resolve(response(path)),
    );
    mount(id);
    const name = await editProfile();
    fireEvent.change(name, { target: { value: "Keep my fictional draft" } });
    fireEvent.submit(name.closest("form")!);
    const error = await screen.findByRole("alert");
    expect(error.textContent).toContain("Save interrupted");
    expect(document.activeElement).toBe(error);
    expect((name as HTMLInputElement).value).toBe("Keep my fictional draft");
  });
  it("aborts pending reads/mutations and ignores committed late callbacks after account replacement", async () => {
    const pending = deferred<{ id: string }>();
    let signal: AbortSignal | undefined;
    apiMock.mockImplementation(
      (path: string, options?: { method?: string; signal?: AbortSignal }) => {
        if (options?.method === "POST") {
          signal = options.signal;
          return pending.promise;
        }
        return Promise.resolve(response(path));
      },
    );
    const page = mount(id);
    fireEvent.submit((await editProfile()).closest("form")!);
    actor.id = "fictional-replacement";
    page.rerender(
      <MemoryRouter initialEntries={["/admin/linktree?profile=" + id]}>
        <main id="workspace-content" tabIndex={-1}>
          <LinktreeWorkspace />
        </main>
      </MemoryRouter>,
    );
    expect(signal?.aborted).toBe(true);
    await act(async () => pending.resolve({ id }));
    expect(screen.queryByText("Linktree changes saved.")).toBeNull();
    expect(screen.queryByLabelText(/Display name/)).toBeNull();
  });
  it("preserves an offline draft, disables saving and never submits automatically on reconnect", async () => {
    const online = vi.spyOn(navigator, "onLine", "get");
    online.mockReturnValue(true);
    mount(id);
    fireEvent.change(await editProfile(), {
      target: { value: "Offline fictional input" },
    });
    online.mockReturnValue(false);
    act(() => window.dispatchEvent(new Event("offline")));
    expect(
      screen.getByText(/You are offline. This open tab retains/),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Save changes",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    online.mockReturnValue(true);
    act(() => window.dispatchEvent(new Event("online")));
    expect(
      (screen.getByLabelText(/Display name/) as HTMLInputElement).value,
    ).toBe("Offline fictional input");
    expect(apiMock.mock.calls.some(([, o]) => o?.method === "POST")).toBe(
      false,
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Save changes",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh", exact: true }),
    );
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Save changes",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
  });
  it.each(["color", "image", "gradient"])(
    "saves all profile metadata with a reviewed %s background",
    async (background) => {
      apiMock.mockImplementation((p, o) =>
        Promise.resolve(o?.method === "POST" ? { id } : response(p)),
      );
      mount(id);
      await editProfile();
      const fill = (label: RegExp, value: string) =>
        fireEvent.change(screen.getByLabelText(label), { target: { value } });
      fill(/^Public username/, "reviewed-hub");
      fill(/^Display name/, "Reviewed chapter hub");
      fill(/^Avatar URL/, "/assets/hero-campus.webp");
      fill(/^Bio/, "Reviewed chapter links and resources.");
      fireEvent.change(screen.getByRole("combobox", { name: /^Theme/ }), {
        target: { value: "dark" },
      });
      fireEvent.change(
        screen.getByRole("combobox", { name: /^Background type/ }),
        { target: { value: background } },
      );
      const expected =
        background === "gradient"
          ? { type: "gradient", from: "#112244", to: "#445566", angle: 220 }
          : background === "image"
            ? { type: "image", value: "/assets/hero-campus.webp" }
            : { type: "color", value: "#112244" };
      if (background === "gradient") {
        fill(/^Gradient start/, "#112244");
        fill(/^Gradient end/, "#445566");
        fill(/^Gradient angle/, "220");
      } else
        fill(
          background === "image"
            ? /^Public background image URL/
            : /^Background color/,
          background === "image" ? "/assets/hero-campus.webp" : "#112244",
        );
      fireEvent.click(
        screen.getByRole("button", { name: "Save changes", exact: true }),
      );
      await screen.findByText("Linktree changes saved.");
      const writes = apiMock.mock.calls.filter(([, o]) => o?.method === "POST");
      expect(writes).toHaveLength(1);
      expect(writes[0][1].body).toMatchObject({
        action: "update",
        revision: 1,
        record: {
          username: "reviewed-hub",
          displayName: "Reviewed chapter hub",
          avatarUrl: "/assets/hero-campus.webp",
          bio: "Reviewed chapter links and resources.",
          theme: "dark",
          background: expected,
        },
      });
    },
  );
  it("preserves destination, embed, appearance and click-count choices in one inactive draft link", async () => {
    apiMock.mockImplementation((p, o) =>
      Promise.resolve(o?.method === "POST" ? { id } : response(p)),
    );
    mount(id);
    await screen.findByRole("button", { name: "Add draft link" });
    fireEvent.click(screen.getByRole("button", { name: "Add draft link" }));
    for (const [label, value] of [
      [/^Link title/, "Reviewed video"],
      [/^Public destination/, "https://www.youtube.com/watch?v=abcdefghijk"],
      [/^Link description/, "Reviewed video description"],
      [/^Button color/, "#112244"],
      [/^Button text color/, "#f4f5f7"],
    ] as const)
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    for (const [name, value] of [
      [/^Icon/, "video"],
      [/^Button style/, "filled"],
      [/^Embed option/, "youtube"],
    ] as const)
      fireEvent.change(screen.getByRole("combobox", { name }), {
        target: { value },
      });
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /Show this link's approximate click count/,
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Save changes", exact: true }),
    );
    await screen.findByText(
      "Private draft saved. Activate it separately after review.",
    );
    const writes = apiMock.mock.calls.filter(([, o]) => o?.method === "POST");
    expect(writes).toHaveLength(1);
    expect(writes[0][1].body).toMatchObject({
      action: "link_create",
      revision: 1,
      record: {
        title: "Reviewed video",
        url: "https://www.youtube.com/watch?v=abcdefghijk",
        description: "Reviewed video description",
        icon: "video",
        buttonStyle: "filled",
        embedType: "youtube",
        buttonColor: "#112244",
        textColor: "#f4f5f7",
        showClickCount: true,
      },
    });
  });
  it("keeps an unsafe private capability destination editable until corrected to a public path", async () => {
    apiMock.mockImplementation((p, o) =>
      Promise.resolve(o?.method === "POST" ? { id } : response(p)),
    );
    mount(id);
    await screen.findByRole("button", { name: "Add draft link" });
    fireEvent.click(screen.getByRole("button", { name: "Add draft link" }));
    fireEvent.change(screen.getByLabelText(/^Link title/), {
      target: { value: "Public interest form" },
    });
    const url = screen.getByLabelText(/^Public destination/);
    fireEvent.change(url, {
      target: { value: "/forms/club-interest#resume=fictional-private" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save changes", exact: true }),
    );
    await screen.findByRole("alert");
    expect(
      apiMock.mock.calls.filter(([, o]) => o?.method === "POST"),
    ).toHaveLength(0);
    expect(url).toHaveProperty(
      "value",
      "/forms/club-interest#resume=fictional-private",
    );
    fireEvent.change(url, { target: { value: "/forms/club-interest" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Save changes", exact: true }),
    );
    await screen.findByText(
      "Private draft saved. Activate it separately after review.",
    );
    expect(
      apiMock.mock.calls.filter(([, o]) => o?.method === "POST")[0][1].body
        .record.url,
    ).toBe("/forms/club-interest");
  });
});
