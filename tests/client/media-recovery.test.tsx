// @vitest-environment jsdom
import React from "react";
import axe from "axe-core";
import { webcrypto } from "node:crypto";
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
import MediaWorkspace from "../../src/ui/media/MediaWorkspace";
import MediaFileEditor from "../../src/ui/media/MediaFileEditor";
import MediaUpload from "../../src/ui/media/MediaUpload";
import DestinationPicker from "../../src/ui/media/DestinationPicker";
import { ApiFailure } from "../../src/lib/api";
import type { MediaFile } from "../../src/ui/media/types";
const { apiMock, actor } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  actor: { id: "f1570000-0000-4000-8000-000000000001", role: "admin" },
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
  useNavigationSafety: () => ({ request: (run: () => void) => run() }),
}));
const id = "f1570000-0000-4000-8000-000000000002",
  folderId = "f1570000-0000-4000-8000-000000000003",
  uploadId = "f1570000-0000-4000-8000-000000000004";
const file: MediaFile = {
  id,
  name: "Fictional community photo",
  originalName: "fictional-photo.png",
  fileType: "image",
  mime: "image/png",
  bytes: 12,
  revision: 1,
  teamId: null,
  folderId: null,
  scanState: "clean",
  deletedAt: null,
  purgedAt: null,
  starred: false,
  public: false,
  alt: "Fictional students at laptops",
  description: "Fictional photo caption",
  seoTitle: "",
  seoDescription: "",
  tags: [],
  eventId: null,
  order: 0,
  allowDownload: false,
  width: 40,
  height: 25,
  duration: null,
  inUse: false,
  usageCount: 0,
  publicationState: null,
  actions: ["read", "update", "delete"],
  canPublish: true,
  createdAt: "2026-10-27T12:00:00Z",
  updatedAt: "2026-10-27T12:00:00Z",
};
const folder = {
  id: folderId,
  name: "Fictional folder",
  parentId: null,
  teamId: null,
  revision: 1,
  description: "Fictional folder description",
};
const listing = {
  items: [file],
  total: 1,
  page: 1,
  pageSize: 30,
  folders: [folder],
  folder: null,
  folderId: null,
  teams: [],
  chapterCreate: true,
  chapterFolders: true,
};
function response(path: string) {
  return path.startsWith("/admin/media/events") ? { items: [] } : listing;
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
const writes = () =>
  apiMock.mock.calls.filter(
    ([, options]) => options?.method && options.method !== "GET",
  );
function shell(node: React.ReactNode) {
  return render(
    <MemoryRouter>
      <main id="workspace-content" tabIndex={-1}>
        {node}
      </main>
    </MemoryRouter>,
  );
}
function mount() {
  return shell(<MediaWorkspace />);
}
function edit(saved = vi.fn()) {
  return shell(
    <MediaFileEditor file={file} onSaved={saved} onClose={() => {}} />,
  );
}
async function scope() {
  await screen.findByRole("button", { name: file.name });
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Upload privately",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
}
async function bulk() {
  await screen.findByRole("button", { name: file.name });
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Select " + file.name }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Star", exact: true }));
  return screen
    .getByRole("button", { name: "Confirm media change" })
    .closest("form")!;
}
beforeEach(() => {
  actor.id = "f1570000-0000-4000-8000-000000000001";
  actor.role = "admin";
  apiMock.mockReset();
  apiMock.mockImplementation((path: string, options?: { method?: string }) =>
    Promise.resolve(
      options?.method && options.method !== "GET"
        ? { id: folderId, revision: 2 }
        : response(path),
    ),
  );
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  vi.stubGlobal("crypto", webcrypto);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("Media inventory and folder recovery", () => {
  it("shows an initial skeleton and aborts its inventory read", () => {
    const pending = deferred<unknown>();
    let signal: AbortSignal | undefined;
    apiMock.mockImplementation(
      (_path: string, options: { signal?: AbortSignal }) => {
        signal = options.signal;
        return pending.promise;
      },
    );
    const page = mount();
    expect(
      screen
        .getByRole("status", { name: "Loading authorized media" })
        .querySelector(".gt-skeleton"),
    ).toBeTruthy();
    page.unmount();
    expect(signal?.aborted).toBe(true);
  });
  it("recovers a failed initial inventory without a false empty library", async () => {
    let failed = true;
    apiMock.mockImplementation((path: string) =>
      failed
        ? Promise.reject(Error("Inventory interrupted"))
        : Promise.resolve(response(path)),
    );
    mount();
    await screen.findByText(/Media files could not load/);
    expect(screen.queryByText("This part of the library is empty")).toBeNull();
    failed = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry list" }));
    expect(document.activeElement?.id).toBe("workspace-content");
    await screen.findByRole("button", { name: file.name });
  });
  it("retains a timestamped authorized inventory on temporary refresh failure", async () => {
    let failed = false;
    apiMock.mockImplementation((path: string) =>
      failed
        ? Promise.reject(Error("Refresh interrupted"))
        : Promise.resolve(response(path)),
    );
    mount();
    await screen.findByRole("button", { name: file.name });
    failed = true;
    fireEvent.click(screen.getByRole("button", { name: "Refresh library" }));
    await screen.findByText(/The inventory may be out of date/);
    expect(screen.getByRole("button", { name: file.name })).toBeTruthy();
  });
  it("resets a filtered empty inventory", async () => {
    apiMock.mockImplementation((path: string) =>
      Promise.resolve(
        path.includes("q=none")
          ? { ...listing, items: [], total: 0 }
          : response(path),
      ),
    );
    mount();
    await screen.findByRole("button", { name: file.name });
    const search = screen.getByRole("searchbox", {
      name: "Search media names and descriptions",
    });
    fireEvent.change(search, { target: { value: "none" } });
    fireEvent.submit(search.closest("form")!);
    await screen.findByRole("heading", {
      name: "This part of the library is empty",
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Reset media filters" }),
    );
    await screen.findByRole("button", { name: file.name });
    expect((search as HTMLInputElement).value).toBe("");
  });
  it("freezes folder fields and suppresses duplicate create submits", async () => {
    const pending = deferred<unknown>();
    apiMock.mockImplementation((path: string, options?: { method?: string }) =>
      options?.method === "POST"
        ? pending.promise
        : Promise.resolve(response(path)),
    );
    mount();
    await scope();
    fireEvent.click(screen.getByRole("button", { name: "New folder" }));
    expect(document.activeElement?.textContent).toBe("Create a folder");
    const input = screen.getByLabelText(/Folder name/);
    fireEvent.change(input, { target: { value: "Fictional new folder" } });
    const form = input.closest("form")!;
    act(() => {
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    expect(writes()).toHaveLength(1);
    expect((input as HTMLInputElement).disabled).toBe(true);
    await act(async () => pending.resolve({ id: folderId, revision: 1 }));
    await screen.findByText("Folder change recorded.");
    expect(document.activeElement?.textContent).toBe("Folder change recorded.");
  });
  it("cancels a pending folder create on account replacement and fences late success", async () => {
    const pending = deferred<unknown>();
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
    const page = mount();
    await scope();
    fireEvent.click(screen.getByRole("button", { name: "New folder" }));
    const input = screen.getByLabelText(/Folder name/);
    fireEvent.change(input, { target: { value: "Fictional private folder" } });
    fireEvent.submit(input.closest("form")!);
    actor.id = folderId;
    page.rerender(
      <MemoryRouter>
        <main>
          <MediaWorkspace />
        </main>
      </MemoryRouter>,
    );
    expect(signal?.aborted).toBe(true);
    await act(async () => pending.resolve({ id: folderId }));
    expect(screen.queryByText("Folder change recorded.")).toBeNull();
    expect(screen.queryByLabelText(/Folder name/)).toBeNull();
  });
  it("suppresses duplicate bulk operations and focuses their committed receipt", async () => {
    const pending = deferred<unknown>();
    apiMock.mockImplementation((path: string, options?: { method?: string }) =>
      options?.method === "POST"
        ? pending.promise
        : Promise.resolve(response(path)),
    );
    mount();
    const form = await bulk();
    act(() => {
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    expect(writes()).toHaveLength(1);
    expect(writes()[0][1].body).toEqual({
      action: "star",
      files: [{ id, revision: 1 }],
      document: { starred: true },
    });
    await act(async () => pending.resolve({}));
    await screen.findByText(/Media change recorded/);
    expect(document.activeElement?.textContent).toContain(
      "Media change recorded",
    );
  });
  it("retains an unchanged bulk request key after an uncertain failure", async () => {
    let failed = true;
    apiMock.mockImplementation((path: string, options?: { method?: string }) =>
      options?.method === "POST"
        ? failed
          ? Promise.reject(Error("Bulk not confirmed"))
          : Promise.resolve({})
        : Promise.resolve(response(path)),
    );
    mount();
    const form = await bulk();
    fireEvent.submit(form);
    await screen.findByText("Bulk not confirmed");
    failed = false;
    fireEvent.submit(form);
    await screen.findByText(/Media change recorded/);
    expect(writes()[0][1].idempotencyKey).toBe(writes()[1][1].idempotencyKey);
  });
  it("clears inventory and selection after permission denial", async () => {
    let denied = false;
    apiMock.mockImplementation((path: string) =>
      denied
        ? Promise.reject(new ApiFailure(403, "FORBIDDEN", "Media denied"))
        : Promise.resolve(response(path)),
    );
    mount();
    await screen.findByRole("button", { name: file.name });
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select " + file.name }),
    );
    denied = true;
    fireEvent.click(screen.getByRole("button", { name: "Refresh library" }));
    await screen.findByText("Media inventory: Media denied");
    expect(screen.queryByRole("button", { name: file.name })).toBeNull();
    expect(
      screen.queryByRole("region", { name: "Selected media actions" }),
    ).toBeNull();
  });
});
describe("Private media metadata, capabilities and publication", () => {
  it("freezes metadata and suppresses same-tick duplicate saves", async () => {
    const pending = deferred<unknown>(),
      saved = vi.fn();
    apiMock.mockImplementation((path: string, options?: { method?: string }) =>
      options?.method === "POST"
        ? pending.promise
        : Promise.resolve(response(path)),
    );
    edit(saved);
    const input = screen.getByLabelText(/Display name/);
    fireEvent.change(input, { target: { value: "Fictional renamed photo" } });
    const form = input.closest("form")!;
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
    await act(async () => pending.resolve({}));
    expect(saved).toHaveBeenCalledTimes(1);
  });
  it("retains a metadata key after an uncertain save and focuses the error", async () => {
    let failed = true;
    apiMock.mockImplementation((path: string, options?: { method?: string }) =>
      options?.method === "POST"
        ? failed
          ? Promise.reject(Error("Metadata not confirmed"))
          : Promise.resolve({})
        : Promise.resolve(response(path)),
    );
    const saved = vi.fn();
    edit(saved);
    const input = screen.getByLabelText(/Display name/);
    fireEvent.change(input, { target: { value: "Fictional renamed photo" } });
    fireEvent.submit(input.closest("form")!);
    await screen.findByText("Metadata not confirmed");
    expect(document.activeElement?.textContent).toBe("Metadata not confirmed");
    failed = false;
    fireEvent.submit(input.closest("form")!);
    await waitFor(() => expect(saved).toHaveBeenCalled());
    expect(writes()[0][1].idempotencyKey).toBe(writes()[1][1].idempotencyKey);
  });
  it("rejects forged metadata submits after the update grant disappears", () => {
    const page = edit();
    page.rerender(
      <MemoryRouter>
        <main>
          <MediaFileEditor
            file={{ ...file, actions: ["read"] }}
            onSaved={() => {}}
            onClose={() => {}}
          />
        </main>
      </MemoryRouter>,
    );
    fireEvent.submit(screen.getByLabelText(/Display name/).closest("form")!);
    expect(writes()).toHaveLength(0);
  });
  it("preserves fields and locks saving on a new file revision", () => {
    const page = edit();
    const input = screen.getByLabelText(/Display name/);
    fireEvent.change(input, {
      target: { value: "Fictional unsaved photo name" },
    });
    page.rerender(
      <MemoryRouter>
        <main>
          <MediaFileEditor
            file={{ ...file, revision: 2 }}
            onSaved={() => {}}
            onClose={() => {}}
          />
        </main>
      </MemoryRouter>,
    );
    expect((input as HTMLInputElement).value).toBe(
      "Fictional unsaved photo name",
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Save private metadata",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
  it("clears publication passwords at request start and enforces exact confirmation in the handler", async () => {
    const pending = deferred<unknown>();
    apiMock.mockImplementation((path: string, options?: { method?: string }) =>
      options?.method === "POST"
        ? pending.promise
        : Promise.resolve(response(path)),
    );
    edit();
    fireEvent.click(
      screen.getByRole("button", { name: "Review public image" }),
    );
    expect(document.activeElement?.textContent).toBe(
      "Approve this image for the public gallery",
    );
    const password = screen.getByLabelText(/Current password/),
      confirmation = screen.getByLabelText(/Type PUBLISH IMAGE/);
    fireEvent.change(password, { target: { value: "Fictional-media-proof" } });
    fireEvent.submit(password.closest("form")!);
    expect(writes()).toHaveLength(0);
    fireEvent.change(confirmation, { target: { value: "PUBLISH IMAGE" } });
    fireEvent.submit(password.closest("form")!);
    expect((password as HTMLInputElement).value).toBe("");
    expect(writes()).toHaveLength(1);
    expect(writes()[0][1].body).toMatchObject({
      action: "publish",
      revision: 1,
      currentPassword: "Fictional-media-proof",
      confirmation: "PUBLISH IMAGE",
    });
    await act(async () => pending.resolve({}));
  });
  it("keeps an unchanged publication key after password reentry", async () => {
    let failed = true;
    const saved = vi.fn();
    apiMock.mockImplementation((path: string, options?: { method?: string }) =>
      options?.method === "POST"
        ? failed
          ? Promise.reject(Error("Publication not confirmed"))
          : Promise.resolve({})
        : Promise.resolve(response(path)),
    );
    edit(saved);
    fireEvent.click(
      screen.getByRole("button", { name: "Review public image" }),
    );
    const password = screen.getByLabelText(/Current password/);
    fireEvent.change(screen.getByLabelText(/Type PUBLISH IMAGE/), {
      target: { value: "PUBLISH IMAGE" },
    });
    fireEvent.change(password, { target: { value: "Fictional-media-proof" } });
    fireEvent.submit(password.closest("form")!);
    await screen.findByText("Publication not confirmed");
    failed = false;
    fireEvent.change(password, { target: { value: "Fictional-media-proof" } });
    fireEvent.submit(password.closest("form")!);
    await waitFor(() => expect(saved).toHaveBeenCalled());
    expect(writes()[0][1].idempotencyKey).toBe(writes()[1][1].idempotencyKey);
  });
  it("fences a late private download when the file editor unmounts", async () => {
    const pending = deferred<unknown>();
    let signal: AbortSignal | undefined;
    apiMock.mockImplementation(
      (path: string, options?: { signal?: AbortSignal }) => {
        if (path.endsWith("/download")) {
          signal = options?.signal;
          return pending.promise;
        }
        return Promise.resolve(response(path));
      },
    );
    const page = edit();
    fireEvent.click(
      screen.getByRole("button", { name: "Authorize download", exact: true }),
    );
    page.unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () =>
      pending.resolve({ url: "https://storage.example.test/private" }),
    );
    expect(screen.queryByRole("link", { name: /Download/ })).toBeNull();
  });
  it("cancels a publication after session clearing and ignores late failure", async () => {
    const pending = deferred<unknown>();
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
    edit();
    fireEvent.click(
      screen.getByRole("button", { name: "Review public image" }),
    );
    const password = screen.getByLabelText(/Current password/);
    fireEvent.change(password, { target: { value: "Fictional-media-proof" } });
    fireEvent.change(screen.getByLabelText(/Type PUBLISH IMAGE/), {
      target: { value: "PUBLISH IMAGE" },
    });
    fireEvent.submit(password.closest("form")!);
    act(() => window.dispatchEvent(new Event("gdg:session-cleared")));
    expect(signal?.aborted).toBe(true);
    await act(async () => pending.reject(Error("Old publication failed")));
    expect(screen.queryByText("Old publication failed")).toBeNull();
    expect(screen.queryByLabelText(/Current password/)).toBeNull();
  });
  it("recovers failed event choices with an explicit retry", async () => {
    let failed = true;
    apiMock.mockImplementation((path: string) =>
      path.startsWith("/admin/media/events") && failed
        ? Promise.reject(Error("Events interrupted"))
        : Promise.resolve(response(path)),
    );
    edit();
    await screen.findByText(/Event choices: Events interrupted/);
    failed = false;
    fireEvent.click(
      screen.getByRole("button", { name: "Retry event choices" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByText(/Event choices: Events interrupted/),
      ).toBeNull(),
    );
  });
  it("preserves metadata offline and never sends on reconnect", async () => {
    const online = vi.spyOn(navigator, "onLine", "get");
    online.mockReturnValue(true);
    edit();
    const input = screen.getByLabelText(/Display name/);
    fireEvent.change(input, { target: { value: "Fictional offline photo" } });
    online.mockReturnValue(false);
    act(() => window.dispatchEvent(new Event("offline")));
    expect(
      (
        screen.getByRole("button", {
          name: "Save private metadata",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    online.mockReturnValue(true);
    act(() => window.dispatchEvent(new Event("online")));
    expect((input as HTMLInputElement).value).toBe("Fictional offline photo");
    expect(writes()).toHaveLength(0);
  });
});
describe("Media upload and destination recovery", () => {
  it("cancels a pending signed upload and never queues completion after unmount", async () => {
    const pending = deferred<Response>();
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: unknown, options: { signal?: AbortSignal }) => {
        signal = options.signal;
        return pending.promise;
      }),
    );
    apiMock.mockImplementation((path: string, options?: { method?: string }) =>
      Promise.resolve(
        options?.method === "POST"
          ? {
              uploadId,
              fileId: id,
              url: "https://storage.example.test/quarantine",
              headers: {},
            }
          : response(path),
      ),
    );
    const page = shell(
      <MediaUpload
        teamId={null}
        folderId={null}
        onSaved={() => {}}
        onClose={() => {}}
      />,
    );
    const chosen = new File(["fictional"], "fictional.png", {
      type: "image/png",
    });
    Object.defineProperty(chosen, "arrayBuffer", {
      value: async () => new TextEncoder().encode("fictional").buffer,
    });
    fireEvent.change(screen.getByLabelText(/Media file/), {
      target: { files: [chosen] },
    });
    const button = screen.getByRole("button", { name: "Upload privately" });
    act(() => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await waitFor(() => expect(signal).toBeTruthy());
    expect(writes()).toHaveLength(1);
    page.unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => pending.resolve(new Response(null, { status: 200 })));
    expect(
      apiMock.mock.calls.some(([path]) => path.endsWith("/complete")),
    ).toBe(false);
  });
  it("rejects unsupported files before requesting any upload intent", async () => {
    shell(
      <MediaUpload
        teamId={null}
        folderId={null}
        onSaved={() => {}}
        onClose={() => {}}
      />,
    );
    const chosen = new File(["fictional"], "fictional.svg", {
      type: "image/svg+xml",
    });
    fireEvent.change(screen.getByLabelText(/Media file/), {
      target: { files: [chosen] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Upload privately" }));
    await screen.findByText(/Choose a supported extension/);
    expect(writes()).toHaveLength(0);
    expect(document.activeElement?.getAttribute("role")).toBe("alert");
  });
  it("retries destination reads without falsely selecting a folder", async () => {
    let failed = true;
    const change = vi.fn();
    apiMock.mockImplementation((path: string) =>
      failed
        ? Promise.reject(Error("Folders interrupted"))
        : Promise.resolve(response(path)),
    );
    shell(
      <DestinationPicker
        teams={[]}
        chapter
        initialTeam={null}
        onChange={change}
      />,
    );
    await screen.findByText(/Folders interrupted/);
    failed = false;
    fireEvent.click(
      screen.getByRole("button", { name: "Retry destination folders" }),
    );
    await screen.findByRole("button", { name: "Use this destination" });
    expect(change).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Use this destination" }),
    );
    expect(change).toHaveBeenCalledExactlyOnceWith({
      teamId: null,
      folderId: null,
    });
  });
  it("passes structural axe checks for media metadata, publication review and private upload", async () => {
    let page = edit();
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
      screen.getByRole("button", { name: "Review public image" }),
    );
    await audit();
    page.unmount();
    page = shell(
      <MediaUpload
        teamId={null}
        folderId={null}
        onSaved={() => {}}
        onClose={() => {}}
      />,
    );
    await audit();
  });
});
