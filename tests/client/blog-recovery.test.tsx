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
import { MemoryRouter, useNavigate } from "react-router-dom";
import BlogWorkspace from "../../src/ui/blog/BlogWorkspace";
import { BlogFileDownload, BlogFileUpload } from "../../src/ui/blog/BlogFiles";
import EditorialOverview from "../../src/ui/blog/EditorialOverview";
import { ApiFailure } from "../../src/lib/api";
const { apiMock, actor } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  actor: { id: "f1590000-0000-4000-8000-000000000001", role: "admin" },
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
const id = "f1590000-0000-4000-8000-000000000002",
  other = "f1590000-0000-4000-8000-000000000003",
  base = "/admin/blog",
  path = base + "/posts/" + id;
const record = {
  id,
  title: "Fictional private article",
  slug: "fictional-private-article",
  content: "Retained fictional writing",
  author_name: "Fictional writer",
  author_email: "",
  featured_image_url: "",
  author_avatar_url: "",
  excerpt: "",
  tags: [],
  category_id: null,
  read_time_minutes: 5,
  is_featured: false,
  status: "draft",
  approval_status: "draft",
  revision: 1,
  reference: "BLOG-F1590000000040008000000000000002",
  actions: [
    "read",
    "update",
    "submit",
    "approve",
    "reject",
    "publish",
    "unpublish",
    "delete",
    "assign",
  ],
  ownerId: actor.id,
};
const cap = {
    admin: true,
    editor: false,
    globalCreate: true,
    teams: [],
    editors: [],
  },
  listing = { items: [record], total: 1, pageSize: 30 },
  detail = {
    record,
    versions: [],
    versionTotal: 0,
    discussion: [],
    discussionTotal: 0,
    pageSize: 30,
  };
function response(p: string) {
  return p.endsWith("/capabilities")
    ? cap
    : p.startsWith(base + "/categories")
      ? { items: [], total: 0, pageSize: 30 }
      : p.startsWith(path + "?")
        ? detail
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
const writes = () => apiMock.mock.calls.filter(([, o]) => o?.method === "POST");
function Navigator() {
  const navigate = useNavigate();
  return (
    <button onClick={() => navigate("/admin/blog?record=" + other)}>
      Navigate other article
    </button>
  );
}
function mount(selected = true) {
  return render(
    <MemoryRouter
      initialEntries={["/admin/blog" + (selected ? "?record=" + id : "")]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <main id="workspace-content" tabIndex={-1}>
        <Navigator />
        <BlogWorkspace />
      </main>
    </MemoryRouter>,
  );
}
async function ready() {
  await screen.findByText(record.content);
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Edit proposed version",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
}
async function edit() {
  await ready();
  fireEvent.click(
    screen.getByRole("button", { name: "Edit proposed version" }),
  );
  return screen.getByLabelText("Title", { exact: true });
}
const refresh = () =>
  fireEvent.click(
    screen.getByRole("button", { name: "Refresh editorial records" }),
  );
beforeEach(() => {
  actor.role = "admin";
  apiMock.mockReset();
  apiMock.mockImplementation((p: string, o?: { method?: string }) =>
    Promise.resolve(o?.method === "POST" ? { id } : response(p)),
  );
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("Editorial independent reads and private context", () => {
  it("shows skeletons and aborts all independent reads on unmount", () => {
    const pending = deferred<unknown>(),
      signals: AbortSignal[] = [];
    apiMock.mockImplementation((_p: string, o: { signal: AbortSignal }) => {
      signals.push(o.signal);
      return pending.promise;
    });
    const page = mount();
    expect(
      screen
        .getByRole("status", { name: "Loading selected editorial record" })
        .querySelector(".gt-skeleton"),
    ).toBeTruthy();
    expect(
      screen.getByRole("status", { name: "Loading editorial inventory" }),
    ).toBeTruthy();
    page.unmount();
    expect(signals).toHaveLength(4);
    expect(signals.every((s) => s.aborted)).toBe(true);
  });
  it("does not let inventory success hide capability and category failures", async () => {
    apiMock.mockImplementation((p: string) =>
      p.endsWith("/capabilities") || p.startsWith(base + "/categories")
        ? Promise.reject(Error("Read interrupted"))
        : Promise.resolve(response(p)),
    );
    mount();
    await screen.findByText(/Editorial permissions: Read interrupted/);
    await screen.findByText(/Editorial categories: Read interrupted/);
    expect(
      screen.getByRole("table", { name: "Authorized articles" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "New article" })).toBeNull();
  });
  it("retains a timestamped snapshot when inventory refresh fails", async () => {
    let failed = false;
    apiMock.mockImplementation((p: string) =>
      failed && p.startsWith(base + "/posts?")
        ? Promise.reject(Error("Inventory interrupted"))
        : Promise.resolve(response(p)),
    );
    mount(false);
    await screen.findByRole("table", { name: "Authorized articles" });
    failed = true;
    refresh();
    await screen.findByText(/Editorial inventory may be out of date/);
    expect(
      screen.getByRole("button", { name: "Review " + record.title }),
    ).toBeTruthy();
  });
  it("recovers initial inventory failure with landmark focus", async () => {
    let failed = true;
    apiMock.mockImplementation((p: string) =>
      failed && p.startsWith(base + "/posts?")
        ? Promise.reject(Error("Inventory interrupted"))
        : Promise.resolve(response(p)),
    );
    mount(false);
    await screen.findByText(/Editorial records unavailable/);
    failed = false;
    fireEvent.click(
      screen.getByRole("button", { name: "Retry editorial inventory" }),
    );
    expect(document.activeElement?.id).toBe("workspace-content");
    await screen.findByRole("table", { name: "Authorized articles" });
  });
  it("hides the previous filter scope and resets an empty result", async () => {
    const pending = deferred<unknown>();
    apiMock.mockImplementation((p: string) =>
      p.includes("q=none") ? pending.promise : Promise.resolve(response(p)),
    );
    mount(false);
    await screen.findByRole("table", { name: "Authorized articles" });
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search editorial records" }),
      { target: { value: "none" } },
    );
    expect(screen.queryByText(record.title)).toBeNull();
    await act(async () => pending.resolve({ ...listing, items: [], total: 0 }));
    fireEvent.click(
      screen.getByRole("button", { name: "Reset editorial filters" }),
    );
    await screen.findByRole("button", { name: "Review " + record.title });
  });
  it("preserves draft fields and blocks a newer revision", async () => {
    let revision = 1;
    apiMock.mockImplementation((p: string) =>
      Promise.resolve(
        p.startsWith(path + "?")
          ? { ...detail, record: { ...record, revision } }
          : response(p),
      ),
    );
    mount();
    const input = await edit();
    fireEvent.change(input, { target: { value: "Fictional retained draft" } });
    revision = 2;
    refresh();
    await screen.findByText(/This record changed/);
    expect((input as HTMLInputElement).value).toBe("Fictional retained draft");
    expect(
      (
        screen.getByRole("button", {
          name: "Save editorial change",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
  it("applies revoked actions without requiring a revision change", async () => {
    let allowed = true;
    apiMock.mockImplementation((p: string) =>
      Promise.resolve(
        p.startsWith(path + "?")
          ? {
              ...detail,
              record: {
                ...record,
                actions: allowed ? record.actions : ["read"],
              },
            }
          : response(p),
      ),
    );
    mount();
    await edit();
    allowed = false;
    refresh();
    await screen.findByText("This action is no longer granted.");
    expect(
      (
        screen.getByRole("button", {
          name: "Save editorial change",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
  it("clears the editor after a selected-record denial", async () => {
    mount();
    await edit();
    apiMock.mockImplementation((p: string) =>
      p.startsWith(path + "?")
        ? Promise.reject(
            new ApiFailure(404, "NOT_FOUND", "Editorial record unavailable"),
          )
        : Promise.resolve(response(p)),
    );
    refresh();
    await screen.findByText(/Editorial details: Editorial record unavailable/);
    expect(screen.queryByLabelText("Title", { exact: true })).toBeNull();
    expect(screen.queryByText(record.content)).toBeNull();
  });
  it("clears all private views after capability denial", async () => {
    mount();
    await edit();
    apiMock.mockImplementation((p: string) =>
      p.endsWith("/capabilities")
        ? Promise.reject(
            new ApiFailure(403, "FORBIDDEN", "Editorial access revoked"),
          )
        : Promise.resolve(response(p)),
    );
    refresh();
    await screen.findByText(/Editorial permissions: Editorial access revoked/);
    expect(screen.queryByLabelText("Title", { exact: true })).toBeNull();
    expect(screen.queryByText(record.content)).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });
  it("does not carry edits to another article at the same revision", async () => {
    apiMock.mockImplementation((p: string) =>
      Promise.resolve(
        p.startsWith(base + "/posts/" + other + "?")
          ? {
              ...detail,
              record: {
                ...record,
                id: other,
                title: "Another fictional article",
              },
            }
          : response(p),
      ),
    );
    mount();
    const input = await edit();
    fireEvent.change(input, { target: { value: "Old private draft" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Navigate other article" }),
    );
    await screen.findByRole("heading", { name: "Another fictional article" });
    expect(screen.queryByLabelText("Title", { exact: true })).toBeNull();
    expect(writes()).toHaveLength(0);
  });
  it("pages category choices beyond the first inventory page", async () => {
    apiMock.mockImplementation((p: string) =>
      Promise.resolve(
        p.startsWith(base + "/categories?page=")
          ? {
              items: [
                {
                  id: other,
                  name: p.endsWith("=2") ? "Later category" : "First category",
                  is_active: true,
                },
              ],
              total: 31,
              pageSize: 30,
            }
          : response(p),
      ),
    );
    mount();
    await edit();
    await screen.findByRole("option", { name: "First category" });
    fireEvent.click(
      screen.getByRole("button", { name: "Next category choices" }),
    );
    await screen.findByRole("option", { name: "Later category" });
    expect(
      apiMock.mock.calls.some(([p]) => p === base + "/categories?page=2"),
    ).toBe(true);
  });
});
describe("Editorial writes and confirmation", () => {
  it("freezes fields and suppresses duplicate same-tick saves", async () => {
    const pending = deferred<unknown>();
    apiMock.mockImplementation((p: string, o?: { method?: string }) =>
      o?.method === "POST" ? pending.promise : Promise.resolve(response(p)),
    );
    mount();
    const input = await edit(),
      form = input.closest("form")!;
    act(() => {
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    expect(writes()).toHaveLength(1);
    expect(input.closest("fieldset")?.disabled).toBe(true);
    await act(async () => pending.resolve({ id }));
    await screen.findByText(
      "Editorial change saved privately. No public Blog or email was created.",
    );
    expect(document.activeElement?.textContent).toBe(
      "Editorial change saved privately. No public Blog or email was created.",
    );
  });
  it("retains an unchanged update key after uncertain failure", async () => {
    apiMock.mockImplementation((p: string, o?: { method?: string }) =>
      o?.method === "POST"
        ? Promise.reject(Error("Save not confirmed"))
        : Promise.resolve(response(p)),
    );
    mount();
    const form = (await edit()).closest("form")!;
    fireEvent.submit(form);
    await screen.findByText("Save not confirmed");
    expect(document.activeElement?.textContent).toBe("Save not confirmed");
    fireEvent.submit(form);
    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(writes()[0][1].idempotencyKey).toBe(writes()[1][1].idempotencyKey);
  });
  it("aborts a pending mutation on session clearing and ignores late success", async () => {
    const pending = deferred<unknown>();
    apiMock.mockImplementation((p: string, o?: { method?: string }) =>
      o?.method === "POST" ? pending.promise : Promise.resolve(response(p)),
    );
    mount();
    fireEvent.submit((await edit()).closest("form")!);
    const signal = writes()[0][1].signal;
    act(() => window.dispatchEvent(new Event("gdg:session-cleared")));
    expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve({ id }));
    expect(
      screen.queryByText(
        "Editorial change saved privately. No public Blog or email was created.",
      ),
    ).toBeNull();
    expect(screen.queryByLabelText("Title", { exact: true })).toBeNull();
  });
  it("requires exact reference at submit time and clears password at request start", async () => {
    const pending = deferred<unknown>();
    apiMock.mockImplementation((p: string, o?: { method?: string }) =>
      o?.method === "POST" ? pending.promise : Promise.resolve(response(p)),
    );
    mount();
    await ready();
    fireEvent.click(
      screen.getByRole("button", { name: "Archive", exact: true }),
    );
    const password = screen.getByLabelText("Current password");
    fireEvent.change(password, { target: { value: "Fictional-blog-proof" } });
    fireEvent.submit(password.closest("form")!);
    expect(writes()).toHaveLength(0);
    fireEvent.change(screen.getByLabelText(/Exact editorial reference/), {
      target: { value: record.reference },
    });
    fireEvent.submit(password.closest("form")!);
    expect((password as HTMLInputElement).value).toBe("");
    expect(writes()[0][1].body).toMatchObject({
      action: "archive",
      currentPassword: "Fictional-blog-proof",
      confirmation: record.reference,
    });
    await act(async () => pending.resolve({ id }));
  });
  it("keeps confirmation intent across different password reentry", async () => {
    apiMock.mockImplementation((p: string, o?: { method?: string }) =>
      o?.method === "POST"
        ? Promise.reject(Error("Archive not confirmed"))
        : Promise.resolve(response(p)),
    );
    mount();
    await ready();
    fireEvent.click(
      screen.getByRole("button", { name: "Archive", exact: true }),
    );
    const password = screen.getByLabelText("Current password"),
      form = password.closest("form")!;
    fireEvent.change(screen.getByLabelText(/Exact editorial reference/), {
      target: { value: record.reference },
    });
    fireEvent.change(password, { target: { value: "Fictional-first-proof" } });
    fireEvent.submit(form);
    await screen.findByText("Archive not confirmed");
    fireEvent.change(password, {
      target: { value: "Fictional-reentered-proof" },
    });
    fireEvent.submit(form);
    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(writes()[0][1].idempotencyKey).toBe(writes()[1][1].idempotencyKey);
  });
  it("rejects local invalid creation fields without sending", async () => {
    mount(false);
    fireEvent.click(await screen.findByRole("button", { name: "New article" }));
    fireEvent.submit(
      screen.getByLabelText("Title", { exact: true }).closest("form")!,
    );
    await screen.findByRole("alert");
    expect(writes()).toHaveLength(0);
  });
  it("keeps an offline draft and does not submit on reconnect", async () => {
    const online = vi.spyOn(navigator, "onLine", "get");
    online.mockReturnValue(true);
    mount();
    const input = await edit();
    fireEvent.change(input, { target: { value: "Fictional offline draft" } });
    online.mockReturnValue(false);
    act(() => window.dispatchEvent(new Event("offline")));
    fireEvent.submit(input.closest("form")!);
    online.mockReturnValue(true);
    act(() => window.dispatchEvent(new Event("online")));
    expect((input as HTMLInputElement).value).toBe("Fictional offline draft");
    expect(writes()).toHaveLength(0);
  });
  it("passes structural axe checks for detail, draft and confirmation", async () => {
    const page = mount();
    await ready();
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
    fireEvent.click(
      screen.getByRole("button", { name: "Edit proposed version" }),
    );
    await audit();
    fireEvent.click(
      screen.getByRole("button", { name: "Close editorial editor" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Archive", exact: true }),
    );
    await audit();
  });
});
describe("Editorial private files and overview", () => {
  function upload() {
    return render(
      <main>
        <BlogFileUpload globalCreate teams={[]} onCreated={vi.fn()} />
      </main>,
    );
  }
  function file() {
    const f = new File(["Fictional file content"], "fictional.txt", {
      type: "text/plain",
    });
    Object.defineProperty(f, "arrayBuffer", {
      value: () =>
        Promise.resolve(
          new TextEncoder().encode("Fictional file content").buffer,
        ),
    });
    fireEvent.change(screen.getByLabelText("Private editorial file"), {
      target: { files: [f] },
    });
    return f;
  }
  it("suppresses duplicate uploads and aborts intent on unmount", async () => {
    const pending = deferred<unknown>();
    apiMock.mockImplementation(() => pending.promise);
    const page = upload();
    file();
    const form = screen
      .getByLabelText("Private editorial file")
      .closest("form")!;
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    await waitFor(() => expect(writes()).toHaveLength(1));
    const signal = writes()[0][1].signal;
    page.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () =>
      pending.resolve({
        uploadId: id,
        submissionId: id,
        url: "http://127.0.0.1/fictional",
        headers: {},
      }),
    );
  });
  it("rejects an unsupported editorial file without an intent", async () => {
    upload();
    fireEvent.change(screen.getByLabelText("Private editorial file"), {
      target: {
        files: [
          new File(["x"], "fictional.exe", {
            type: "application/octet-stream",
          }),
        ],
      },
    });
    fireEvent.submit(
      screen.getByLabelText("Private editorial file").closest("form")!,
    );
    await screen.findByText("Choose an allowed file up to 20 MB.");
    expect(writes()).toHaveLength(0);
  });
  it("retains upload intent identity after an uncertain response", async () => {
    apiMock.mockRejectedValue(Error("Intent not confirmed"));
    upload();
    file();
    const form = screen
      .getByLabelText("Private editorial file")
      .closest("form")!;
    fireEvent.submit(form);
    await screen.findByText("Intent not confirmed");
    fireEvent.submit(form);
    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(writes()[0][1].idempotencyKey).toBe(writes()[1][1].idempotencyKey);
  });
  it("cancels download authorization when read availability changes", async () => {
    const pending = deferred<unknown>();
    apiMock.mockImplementation(() => pending.promise);
    const page = render(
      <BlogFileDownload uploadId={id} filename="fictional.txt" />,
    );
    const button = screen.getByRole("button", {
      name: "Authorize private download",
    });
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    expect(apiMock).toHaveBeenCalledTimes(1);
    const signal = apiMock.mock.calls[0][1].signal;
    page.rerender(
      <BlogFileDownload uploadId={id} filename="fictional.txt" unavailable />,
    );
    expect(signal.aborted).toBe(true);
    await act(async () =>
      pending.resolve({ url: "http://127.0.0.1/fictional" }),
    );
    expect(screen.queryByRole("link")).toBeNull();
  });
  it("clears a signed download link when the upload changes", async () => {
    apiMock.mockResolvedValue({ url: "http://127.0.0.1/fictional" });
    const page = render(
      <BlogFileDownload uploadId={id} filename="fictional.txt" />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Authorize private download" }),
    );
    await screen.findByRole("link");
    page.rerender(<BlogFileDownload uploadId={other} filename="another.txt" />);
    expect(screen.queryByRole("link")).toBeNull();
  });
  it("does not restore an aborted overview response", async () => {
    const pending = deferred<unknown>();
    apiMock.mockImplementation(() => pending.promise);
    const page = render(
      <MemoryRouter>
        <EditorialOverview />
      </MemoryRouter>,
    );
    const signals = apiMock.mock.calls.map(([, o]) => o.signal);
    page.unmount();
    expect(signals.every((s) => s.aborted)).toBe(true);
    await act(async () =>
      pending.resolve({
        articles: 99,
        assignedSubmissions: 0,
        states: {},
        revisionMonths: [],
      }),
    );
    expect(screen.queryByText(/99 accessible articles/)).toBeNull();
  });
  it("clears denied overview counts while preserving independent personal counts", async () => {
    let denied = false;
    apiMock.mockImplementation((p: string) =>
      p.endsWith("/overview")
        ? denied
          ? Promise.reject(new ApiFailure(403, "FORBIDDEN", "Overview revoked"))
          : Promise.resolve({
              articles: 9,
              assignedSubmissions: 0,
              states: { draft: 9 },
              revisionMonths: [],
            })
        : Promise.resolve({
            widgets: {
              tasks: { state: "ready", data: { count: 2 } },
              messages: { state: "ready", data: { unread: 3 } },
            },
          }),
    );
    render(
      <MemoryRouter>
        <EditorialOverview />
      </MemoryRouter>,
    );
    await screen.findByText(/9 accessible articles/);
    denied = true;
    fireEvent.click(screen.getByRole("button", { name: "Refresh overview" }));
    await screen.findByText("Overview revoked");
    expect(screen.queryByText(/9 accessible articles/)).toBeNull();
    expect(screen.getByRole("link", { name: "Your tasks (2)" })).toBeTruthy();
  });
});
