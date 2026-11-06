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
import ProjectsWorkspace from "../../src/ui/projects/ProjectsWorkspace";
import { ApiFailure } from "../../src/lib/api";
const { apiMock, actor } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  actor: { id: "f1580000-0000-4000-8000-000000000001", role: "admin" },
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
const id = "f1580000-0000-4000-8000-000000000002",
  memberId = "f1580000-0000-4000-8000-000000000003",
  otherId = "f1580000-0000-4000-8000-000000000004",
  base = "/admin/projects",
  path = base + "/" + id;
const project = {
  id,
  title: "Fictional private project",
  description: "Fictional project context",
  short_description: "Fictional short description",
  image_url: "",
  github_url: "https://github.com/example/project",
  demo_url: "",
  tech_stack: ["TypeScript"],
  tags: ["fictional"],
  category: "web",
  status: "active",
  difficulty_level: "intermediate",
  team_size: 3,
  start_date: "",
  end_date: "",
  is_featured: false,
  is_open_source: true,
  team_id: null,
  teamName: null,
  revision: 1,
  deleted_at: null,
  stars_count: 0,
  starCount: "0",
  actions: ["read", "update", "delete"],
  memberCount: 1,
};
const member = {
  id: memberId,
  memberId: otherId,
  name: "Fictional participant",
  role: "contributor",
  active: true,
  communityActive: true,
  joinedAt: "2026-10-27T12:00:00Z",
};
const detail = { project, members: [member], memberTotal: 1, pageSize: 30 },
  listing = {
    items: [project],
    total: 1,
    pageSize: 30,
    stats: {
      active: 1,
      completed: 0,
      featured: 0,
      categories: { web: 1 },
      statuses: { active: 1 },
      technologies: { TypeScript: 1 },
    },
  },
  cap = { globalCreate: true, teams: [] };
function response(p: string) {
  return p.endsWith("/capabilities")
    ? cap
    : p.startsWith(base + "?")
      ? listing
      : detail;
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
  apiMock.mock.calls.filter(([, options]) => options?.method === "POST");
function Navigator() {
  const navigate = useNavigate();
  return (
    <button onClick={() => navigate("/admin/projects?project=" + otherId)}>
      Navigate fictional project
    </button>
  );
}
function mount(selected = true) {
  return render(
    <MemoryRouter
      initialEntries={["/admin/projects" + (selected ? "?project=" + id : "")]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <main id="workspace-content" tabIndex={-1}>
        <Navigator />
        <ProjectsWorkspace />
      </main>
    </MemoryRouter>,
  );
}
async function ready() {
  await screen.findByText(project.description);
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Edit project",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
}
async function edit() {
  await ready();
  fireEvent.click(screen.getByRole("button", { name: "Edit project" }));
  const input = screen.getByLabelText(/Project title/);
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
beforeEach(() => {
  actor.id = "f1580000-0000-4000-8000-000000000001";
  actor.role = "admin";
  apiMock.mockReset();
  apiMock.mockImplementation((p: string, options?: { method?: string }) =>
    Promise.resolve(options?.method === "POST" ? { id } : response(p)),
  );
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("Project independent reads and private context", () => {
  it("shows skeletons and aborts capability, inventory and detail reads", () => {
    const pending = deferred<unknown>(),
      signals: AbortSignal[] = [];
    apiMock.mockImplementation(
      (_p: string, options: { signal?: AbortSignal }) => {
        if (options.signal) signals.push(options.signal);
        return pending.promise;
      },
    );
    const page = mount();
    expect(
      screen
        .getByRole("status", { name: "Loading selected project" })
        .querySelector(".gt-skeleton"),
    ).toBeTruthy();
    expect(
      screen.getByRole("status", { name: "Loading private projects" }),
    ).toBeTruthy();
    page.unmount();
    expect(signals).toHaveLength(3);
    expect(signals.every((s) => s.aborted)).toBe(true);
  });
  it("keeps capability, inventory and detail errors independent", async () => {
    apiMock.mockImplementation((p: string) =>
      Promise.reject(
        Error(
          p.endsWith("/capabilities")
            ? "Capabilities interrupted"
            : p.startsWith(base + "?")
              ? "Inventory interrupted"
              : "Details interrupted",
        ),
      ),
    );
    mount();
    await screen.findByText("Project permissions: Capabilities interrupted");
    await screen.findByText("Project inventory: Inventory interrupted");
    await screen.findByText("Project details: Details interrupted");
    expect(screen.getByText(/Project inventory is unavailable/)).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "No matching projects" }),
    ).toBeNull();
  });
  it("retains timestamped inventory when a temporary refresh fails", async () => {
    let failed = false;
    apiMock.mockImplementation((p: string) =>
      p.startsWith(base + "?") && failed
        ? Promise.reject(Error("Inventory interrupted"))
        : Promise.resolve(response(p)),
    );
    mount(false);
    await screen.findByRole("button", {
      name: "Manage project " + project.title,
    });
    failed = true;
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh", exact: true }),
    );
    await screen.findByText(/Project inventory may be out of date/);
    expect(
      screen.getByRole("button", { name: "Manage project " + project.title }),
    ).toBeTruthy();
  });
  it("recovers an initial inventory failure with landmark focus", async () => {
    let failed = true;
    apiMock.mockImplementation((p: string) =>
      p.startsWith(base + "?") && failed
        ? Promise.reject(Error("Inventory interrupted"))
        : Promise.resolve(response(p)),
    );
    mount(false);
    await screen.findByText(/Project inventory is unavailable/);
    failed = false;
    fireEvent.click(
      screen.getByRole("button", { name: "Retry project inventory" }),
    );
    expect(document.activeElement?.id).toBe("workspace-content");
    await screen.findByRole("button", {
      name: "Manage project " + project.title,
    });
  });
  it("resets filtered empty project inventory", async () => {
    apiMock.mockImplementation((p: string) =>
      Promise.resolve(
        p.includes("q=none")
          ? { ...listing, items: [], total: 0 }
          : response(p),
      ),
    );
    mount(false);
    await screen.findByRole("button", {
      name: "Manage project " + project.title,
    });
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search private projects" }),
      { target: { value: "none" } },
    );
    await screen.findByRole("heading", { name: "No matching projects" });
    fireEvent.click(
      screen.getByRole("button", { name: "Reset project filters" }),
    );
    await screen.findByRole("button", {
      name: "Manage project " + project.title,
    });
  });
  it("preserves edit fields and blocks stale revisions", async () => {
    let revision = 1;
    apiMock.mockImplementation((p: string) =>
      Promise.resolve(
        p.startsWith(path + "?")
          ? { ...detail, project: { ...project, revision } }
          : response(p),
      ),
    );
    mount();
    const input = await edit();
    fireEvent.change(input, { target: { value: "Fictional retained edit" } });
    revision = 2;
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh", exact: true }),
    );
    await screen.findByText(/This project changed/);
    expect((input as HTMLInputElement).value).toBe("Fictional retained edit");
    expect(
      (
        screen.getByRole("button", {
          name: "Save changes",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
  it("applies a revoked action grant even at an unchanged revision", async () => {
    let allowed = true;
    apiMock.mockImplementation((p: string) =>
      Promise.resolve(
        p.startsWith(path + "?")
          ? {
              ...detail,
              project: {
                ...project,
                actions: allowed ? project.actions : ["read"],
              },
            }
          : response(p),
      ),
    );
    mount();
    await edit();
    allowed = false;
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh", exact: true }),
    );
    await screen.findByText(
      "Your current access no longer permits this action.",
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Save changes",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
  it("clears a private editor when its selected project is denied", async () => {
    mount();
    await edit();
    apiMock.mockImplementation((p: string) =>
      p.startsWith(path + "?")
        ? Promise.reject(
            new ApiFailure(404, "NOT_FOUND", "Project unavailable"),
          )
        : Promise.resolve(response(p)),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh", exact: true }),
    );
    await screen.findByText("Project details: Project unavailable");
    expect(screen.queryByLabelText(/Project title/)).toBeNull();
    expect(screen.queryByText(project.description)).toBeNull();
  });
  it("does not carry an edit into another project with the same revision", async () => {
    apiMock.mockImplementation((p: string) =>
      Promise.resolve(
        p.startsWith(base + "/" + otherId + "?")
          ? {
              ...detail,
              project: {
                ...project,
                id: otherId,
                title: "Another fictional project",
              },
            }
          : response(p),
      ),
    );
    mount();
    const input = await edit();
    fireEvent.change(input, { target: { value: "Old private project input" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Navigate fictional project" }),
    );
    await screen.findByRole("heading", { name: "Another fictional project" });
    expect(screen.queryByLabelText(/Project title/)).toBeNull();
    expect(screen.queryByText("Old private project input")).toBeNull();
    expect(writes()).toHaveLength(0);
  });
});
describe("Project mutations and retained participants", () => {
  it("freezes the editor and suppresses duplicate saves before rerender", async () => {
    const pending = deferred<unknown>();
    apiMock.mockImplementation((p: string, options?: { method?: string }) =>
      options?.method === "POST"
        ? pending.promise
        : Promise.resolve(response(p)),
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
      "Private project changes saved. Nothing was published.",
    );
    expect(document.activeElement?.textContent).toBe(
      "Private project changes saved. Nothing was published.",
    );
  });
  it("keeps an unchanged save key after a failed response", async () => {
    let failed = true;
    apiMock.mockImplementation((p: string, options?: { method?: string }) =>
      options?.method === "POST"
        ? failed
          ? Promise.reject(Error("Project save not confirmed"))
          : Promise.resolve({ id })
        : Promise.resolve(response(p)),
    );
    mount();
    const input = await edit();
    fireEvent.submit(input.closest("form")!);
    await screen.findByText("Project save not confirmed");
    expect(document.activeElement?.textContent).toBe(
      "Project save not confirmed",
    );
    failed = false;
    fireEvent.submit(input.closest("form")!);
    await screen.findByText(
      "Private project changes saved. Nothing was published.",
    );
    expect(writes()[0][1].idempotencyKey).toBe(writes()[1][1].idempotencyKey);
  });
  it("aborts a pending project save on session clearing and ignores late success", async () => {
    const pending = deferred<unknown>();
    let signal: AbortSignal | undefined;
    apiMock.mockImplementation(
      (p: string, options?: { method?: string; signal?: AbortSignal }) => {
        if (options?.method === "POST") {
          signal = options.signal;
          return pending.promise;
        }
        return Promise.resolve(response(p));
      },
    );
    mount();
    fireEvent.submit((await edit()).closest("form")!);
    act(() => window.dispatchEvent(new Event("gdg:session-cleared")));
    expect(signal?.aborted).toBe(true);
    await act(async () => pending.resolve({ id }));
    expect(
      screen.queryByText(
        "Private project changes saved. Nothing was published.",
      ),
    ).toBeNull();
    expect(screen.queryByLabelText(/Project title/)).toBeNull();
  });
  it("checks archive title and password at submit time and clears the password on request start", async () => {
    const pending = deferred<unknown>();
    apiMock.mockImplementation((p: string, options?: { method?: string }) =>
      options?.method === "POST"
        ? pending.promise
        : Promise.resolve(response(p)),
    );
    mount();
    await ready();
    fireEvent.click(
      screen.getByRole("button", { name: "Archive project", exact: true }),
    );
    const confirm = screen.getByLabelText("Type " + project.title, {
        exact: false,
      }),
      password = screen.getByLabelText(/Current password/);
    fireEvent.change(password, {
      target: { value: "Fictional-project-proof" },
    });
    fireEvent.submit(password.closest("form")!);
    expect(writes()).toHaveLength(0);
    fireEvent.change(confirm, { target: { value: project.title } });
    fireEvent.submit(password.closest("form")!);
    expect((password as HTMLInputElement).value).toBe("");
    expect(writes()[0][1].body).toMatchObject({
      action: "archive",
      confirmation: project.title,
      currentPassword: "Fictional-project-proof",
    });
    await act(async () => pending.resolve({ id }));
  });
  it("retains archive intent across password reentry after an uncertain failure", async () => {
    let failed = true;
    apiMock.mockImplementation((p: string, options?: { method?: string }) =>
      options?.method === "POST"
        ? failed
          ? Promise.reject(Error("Archive not confirmed"))
          : Promise.resolve({ id })
        : Promise.resolve(response(p)),
    );
    mount();
    await ready();
    fireEvent.click(
      screen.getByRole("button", { name: "Archive project", exact: true }),
    );
    const password = screen.getByLabelText(/Current password/);
    fireEvent.change(
      screen.getByLabelText("Type " + project.title, { exact: false }),
      { target: { value: project.title } },
    );
    fireEvent.change(password, {
      target: { value: "Fictional-project-proof" },
    });
    fireEvent.submit(password.closest("form")!);
    await screen.findByText("Archive not confirmed");
    failed = false;
    fireEvent.change(password, {
      target: { value: "Fictional-project-proof" },
    });
    fireEvent.submit(password.closest("form")!);
    await screen.findByText(
      "Private project changes saved. Nothing was published.",
    );
    expect(writes()[0][1].idempotencyKey).toBe(writes()[1][1].idempotencyKey);
  });
  it("adds an exact member email without altering chapter access", async () => {
    mount();
    await ready();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Add or update participant",
        exact: true,
      }),
    );
    const input = screen.getByLabelText(/Participant email/);
    fireEvent.change(input, {
      target: { value: "fictional-participant@example.test" },
    });
    fireEvent.submit(input.closest("form")!);
    await screen.findByText(
      "Private project changes saved. Nothing was published.",
    );
    expect(writes()[0][1].body).toEqual({
      action: "member_save",
      revision: 1,
      email: "fictional-participant@example.test",
      role: "contributor",
    });
  });
  it("removes a participant once and focuses the retained-history receipt", async () => {
    mount();
    await ready();
    const button = screen.getByRole("button", {
      name: "Remove " + member.name + " from project",
    });
    act(() => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await screen.findByText(
      "Participant removed; membership history is retained.",
    );
    expect(writes()).toHaveLength(1);
    expect(writes()[0][1].body).toEqual({
      action: "member_remove",
      revision: 1,
      memberId: member.memberId,
    });
    expect(document.activeElement?.textContent).toBe(
      "Participant removed; membership history is retained.",
    );
  });
  it("preserves an offline project draft and never sends on reconnect", async () => {
    const online = vi.spyOn(navigator, "onLine", "get");
    online.mockReturnValue(true);
    mount();
    const input = await edit();
    fireEvent.change(input, { target: { value: "Fictional offline project" } });
    online.mockReturnValue(false);
    act(() => window.dispatchEvent(new Event("offline")));
    expect(
      (
        screen.getByRole("button", {
          name: "Save changes",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    online.mockReturnValue(true);
    act(() => window.dispatchEvent(new Event("online")));
    expect((input as HTMLInputElement).value).toBe("Fictional offline project");
    expect(writes()).toHaveLength(0);
  });
  it("passes structural axe checks for detail, editing and participant forms", async () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Edit project" }));
    await audit();
    fireEvent.click(screen.getByRole("button", { name: "Close editor" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Add or update participant" }),
    );
    await audit();
  });
  it("keeps every project field in one normalized revision-bound save", async () => {
    mount();
    await edit();
    const fill = (label: RegExp, value: string) =>
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fill(/^Project title/, "Reviewed project details");
    fill(/^Category/, "research");
    fireEvent.change(
      screen.getByRole("combobox", { name: /^Project status/ }),
      { target: { value: "on_hold" } },
    );
    fireEvent.change(screen.getByRole("combobox", { name: /^Difficulty/ }), {
      target: { value: "advanced" },
    });
    fill(/^Planned team size/, "12");
    fill(/^Start date/, "2027-01-10");
    fill(/^End date/, "2027-02-10");
    fill(/^Repository URL/, "https://github.com/example/reviewed");
    fill(/^Demo URL/, "https://example.com/demo");
    fill(/^Image URL/, "/assets/hero-campus.webp");
    fill(/^Technologies/, "Rust, TypeScript");
    fill(/^Tags/, "research, community");
    fill(/^Short description/, "Reviewed concise summary");
    fill(
      /^Description/,
      "Reviewed project description with all changes included.",
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Featured internally" }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Open-source project" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Save changes", exact: true }),
    );
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0][1]).toMatchObject({
      idempotencyKey: expect.any(String),
      body: {
        action: "update",
        revision: 1,
        record: {
          title: "Reviewed project details",
          category: "research",
          status: "on_hold",
          difficulty_level: "advanced",
          team_size: 12,
          start_date: "2027-01-10",
          end_date: "2027-02-10",
          github_url: "https://github.com/example/reviewed",
          demo_url: "https://example.com/demo",
          image_url: "/assets/hero-campus.webp",
          tech_stack: ["Rust", "TypeScript"],
          tags: ["research", "community"],
          short_description: "Reviewed concise summary",
          description:
            "Reviewed project description with all changes included.",
          is_featured: true,
          is_open_source: false,
        },
      },
    });
  });
  it("keeps a date correction in the editor and never sends a reversed project range", async () => {
    mount();
    await edit();
    fireEvent.change(screen.getByLabelText(/^Start date/), {
      target: { value: "2027-02-10" },
    });
    fireEvent.change(screen.getByLabelText(/^End date/), {
      target: { value: "2027-01-10" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save changes", exact: true }),
    );
    await screen.findByText(/end date must follow/);
    expect(writes()).toHaveLength(0);
    expect(screen.getByLabelText(/^End date/)).toHaveProperty(
      "value",
      "2027-01-10",
    );
    fireEvent.change(screen.getByLabelText(/^End date/), {
      target: { value: "2027-03-10" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save changes", exact: true }),
    );
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0][1].body.record.end_date).toBe("2027-03-10");
  });
});
