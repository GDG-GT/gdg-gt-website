// @vitest-environment jsdom
import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { ApiFailure } from "../../src/lib/api";
import { createTemplate } from "../../shared/forms";
import ResponseWorkspace from "../../src/ui/forms/ResponseWorkspace";
const { apiMock, identity } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  identity: { id: "fictional-reviewer", role: "admin" },
}));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: apiMock,
}));
vi.mock("@/contexts/AdminContext", () => ({
  useAdmin: () => ({ currentAdmin: identity }),
}));
vi.mock("@/hooks/useDraftGuard", () => ({
  useDraftGuard: () => {},
  useNavigationSafety: () => ({
    request: (run: () => void) => run(),
    allow: (run: () => void) => run(),
  }),
}));
const root = "/admin/forms/fictional-form";
const template = createTemplate("Fictional response-read form", "interest");
const form = {
  ...template,
  id: "fictional-form",
  status: "Open",
  revision: 1,
  actions: [
    "view",
    "view_responses",
    "view_sensitive_responses",
    "delete",
    "publish",
  ],
  versions: [{ ...template, version: 1, publishedAt: "2026-11-05T12:00:00Z" }],
};
const row = {
  id: "fictional-response",
  formId: form.id,
  version: 1,
  submittedAt: "2026-11-05T12:00:00Z",
  status: "complete",
  answers: { [form.fields[0].id]: "Fictional stored answer" },
  respondent: {
    name: "Fictional Private Respondent",
    email: "fictional-private@example.test",
    source: "self_reported",
  },
};
function Location() {
  const navigate = useNavigate();
  return (
    <>
      <output aria-label="Current route">{useLocation().search}</output>
      <button onClick={() => navigate("?q=DifferentQuery")}>
        Change response query
      </button>
    </>
  );
}
function mount(path = root + "/responses") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/admin/forms/:formId/responses"
          element={
            <main id="workspace-content" tabIndex={-1}>
              <Location />
              <ResponseWorkspace />
            </main>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}
let fail = "",
  deny = "",
  grants = form.actions,
  held = false,
  reads: string[],
  revision = 1;
function kind(path: string) {
  return path.includes("/responses?")
    ? "responses"
    : path.includes("/analytics?")
      ? "summary"
      : path.endsWith("/views")
        ? "views"
        : path.endsWith("/privacy")
          ? "holds"
          : "form";
}
beforeEach(() => {
  apiMock.mockReset();
  identity.id = "fictional-reviewer";
  identity.role = "admin";
  fail = "";
  deny = "";
  held = false;
  reads = [];
  grants = form.actions;
  revision = 1;
  Object.defineProperty(navigator, "onLine", {
    value: true,
    configurable: true,
  });
  apiMock.mockImplementation(async (path: string) => {
    const name = kind(path);
    reads.push(name);
    if (deny === name)
      throw new ApiFailure(
        403,
        "FORBIDDEN",
        "Fictional " + name + " access changed",
      );
    if (fail === name)
      throw new ApiFailure(
        503,
        "UNAVAILABLE",
        "Fictional " + name + " read failed",
      );
    if (name === "form")
      return { form: { ...form, revision, actions: grants } };
    if (name === "responses")
      return { items: [row], total: 1, page: 1, pageSize: 30 };
    if (name === "summary") return { responseCount: 7, fields: [] };
    if (name === "views")
      return {
        items: [
          {
            id: "fictional-view",
            name: "Fictional saved view",
            filters: { status: "complete" },
            columns: [],
          },
        ],
      };
    return { held };
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const reload = (name: string) =>
  fireEvent.click(
    screen.getByRole("button", { name: "Reload " + name, exact: true }),
  );
async function loaded() {
  await screen.findByRole("heading", { name: "1 matching responses" });
  await waitFor(() =>
    expect(
      (screen.getByLabelText("Saved view") as HTMLSelectElement).disabled,
    ).toBe(false),
  );
}
describe("Independent private response workspace reads", () => {
  it("does not fetch private response children without current response-review capability", async () => {
    grants = ["view"];
    mount();
    await screen.findByRole("heading", {
      name: "Response review permission required",
    });
    expect(reads).toEqual(["form"]);
    expect(
      screen.queryByText(row.respondent.name, { exact: false }),
    ).toBeNull();
  });
  for (const source of ["responses", "summary", "views", "holds"]) {
    it(`distinguishes an initial ${source} failure and retries only that read`, async () => {
      fail = source;
      mount();
      if (source === "summary") {
        await loaded();
        fireEvent.click(screen.getByRole("tab", { name: "Summary" }));
      }
      await screen.findByText("Fictional " + source + " read failed");
      const before = [...reads];
      fail = "";
      reload(
        source === "holds"
          ? "hold status"
          : source === "views"
            ? "saved views"
            : source,
      );
      if (source === "responses")
        await screen.findByRole("heading", { name: "1 matching responses" });
      if (source === "summary")
        await screen.findByRole("heading", { name: "7 matching responses" });
      await waitFor(() =>
        expect(
          screen.queryByText("Fictional " + source + " read failed"),
        ).toBeNull(),
      );
      expect(reads.slice(before.length)).toEqual([source]);
      expect(
        screen.getByRole("region", {
          name:
            (source === "holds"
              ? "hold status"
              : source === "views"
                ? "saved views"
                : source) + " read status",
          exact: true,
        }),
      ).toBe(document.activeElement);
    });
  }
  it("retains matching response rows and selection during a failed reread while pausing actions", async () => {
    mount();
    await loaded();
    fireEvent.click(
      screen.getByRole("button", { name: "Open response " + row.id }),
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close", exact: true }));
    fail = "responses";
    reload("responses");
    await screen.findByText("Fictional responses read failed");
    expect(
      screen.getByText(row.respondent.name, { exact: false }),
    ).toBeTruthy();
    expect(screen.getByText(/Last successful responses read/)).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Open response " + row.id,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Close form" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
  it("preserves proposed view names and saved options during a temporary saved-view failure", async () => {
    mount();
    await loaded();
    fireEvent.change(screen.getByLabelText("New view name"), {
      target: { value: "Fictional proposed view" },
    });
    fail = "views";
    reload("saved views");
    await screen.findByText("Fictional views read failed");
    expect(
      (screen.getByLabelText("New view name") as HTMLInputElement).value,
    ).toBe("Fictional proposed view");
    expect(
      screen.getByRole("option", { name: "Fictional saved view" }),
    ).toBeTruthy();
    expect(
      (screen.getByLabelText("Saved view") as HTMLSelectElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Save view" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      screen.getByText(row.respondent.name, { exact: false }),
    ).toBeTruthy();
    expect(screen.getByText(/Last successful saved views read/)).toBeTruthy();
  });
  it("retains a matching summary independently of inventory and view reads", async () => {
    mount();
    await loaded();
    fireEvent.click(screen.getByRole("tab", { name: "Summary" }));
    await screen.findByRole("heading", { name: "7 matching responses" });
    const before = [...reads];
    fail = "summary";
    reload("summary");
    await screen.findByText("Fictional summary read failed");
    expect(
      screen.getByRole("heading", { name: "7 matching responses" }),
    ).toBeTruthy();
    expect(screen.getByText(/Last successful summary read/)).toBeTruthy();
    expect(reads.slice(before.length)).toEqual(["summary"]);
  });
  it("does not allow destructive response review from a stale hold-status snapshot", async () => {
    mount();
    await loaded();
    fail = "holds";
    reload("hold status");
    await screen.findByText("Fictional holds read failed");
    fireEvent.click(
      screen.getByRole("button", { name: "Open response " + row.id }),
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Delete response",
          exact: true,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: "Redact identity",
          exact: true,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(screen.getByText(/Hold status could not be checked/)).toBeTruthy();
  });
  for (const source of ["responses", "summary", "views", "holds", "form"]) {
    it(`clears private rows, preferences and query on ${source} denial without an automatic retry loop`, async () => {
      mount(root + "/responses?q=FictionalPrivate&sensitive=true");
      await loaded();
      fireEvent.change(screen.getByLabelText("New view name"), {
        target: { value: "Fictional proposed view" },
      });
      if (source === "summary") {
        fireEvent.click(screen.getByRole("tab", { name: "Summary" }));
        await screen.findByRole("heading", { name: "7 matching responses" });
      }
      deny = source;
      reload(
        source === "form"
          ? "saved form"
          : source === "holds"
            ? "hold status"
            : source === "views"
              ? "saved views"
              : source,
      );
      await screen.findByRole("heading", {
        name: "Response access needs to be rechecked",
      });
      expect(
        screen.queryByText(row.respondent.name, { exact: false }),
      ).toBeNull();
      expect(screen.queryByDisplayValue("Fictional proposed view")).toBeNull();
      expect(screen.getByLabelText("Current route").textContent).toBe("");
      const before = reads.length;
      await act(async () => {});
      expect(reads.length).toBe(before);
      deny = "";
      fireEvent.click(
        screen.getByRole("button", {
          name: "Recheck response workspace access",
        }),
      );
      if (source === "summary")
        await screen.findByRole("heading", { name: "7 matching responses" });
      else await loaded();
      expect(
        (screen.getByLabelText("New view name") as HTMLInputElement).value,
      ).toBe("");
    });
  }
  it("clears response proposals and matching snapshots when a saved-definition refresh revokes response review", async () => {
    mount();
    await loaded();
    fireEvent.change(screen.getByLabelText("New view name"), {
      target: { value: "Fictional private proposal" },
    });
    grants = ["view"];
    reload("saved form");
    await screen.findByRole("heading", {
      name: "Response access needs to be rechecked",
    });
    expect(
      screen.queryByText(row.respondent.name, { exact: false }),
    ).toBeNull();
    expect(screen.queryByDisplayValue("Fictional private proposal")).toBeNull();
    grants = form.actions;
    const previous = apiMock.getMockImplementation()!;
    apiMock.mockImplementation((path: string, options: unknown) =>
      path.includes("/responses?")
        ? new Promise(() => {})
        : previous(path, options),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Recheck response workspace access" }),
    );
    await screen.findByRole("heading", { name: form.title });
    expect(
      screen.queryByText(row.respondent.name, { exact: false }),
    ).toBeNull();
    expect(
      screen.queryByRole("heading", { name: "1 matching responses" }),
    ).toBeNull();
    expect(
      (screen.getByLabelText("New view name") as HTMLInputElement).value,
    ).toBe("");
  });
  it("conceals current selected answers immediately on a different response query", async () => {
    mount();
    await loaded();
    const change = screen.getByRole("button", {
      name: "Change response query",
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Open response " + row.id }),
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
    apiMock.mockImplementation((path: string) =>
      path.includes("/responses?")
        ? new Promise(() => {})
        : Promise.resolve({ items: [] }),
    );
    fireEvent.click(change);
    expect(
      screen.queryByText(row.respondent.name, { exact: false }),
    ).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("blocks new actions offline and leaves reconnect reload explicit", async () => {
    mount();
    await loaded();
    const before = reads.length;
    Object.defineProperty(navigator, "onLine", {
      value: false,
      configurable: true,
    });
    act(() => window.dispatchEvent(new Event("offline")));
    expect(
      screen.getByText(row.respondent.name, { exact: false }),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Reload responses",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Save view" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    Object.defineProperty(navigator, "onLine", {
      value: true,
      configurable: true,
    });
    act(() => window.dispatchEvent(new Event("online")));
    expect(reads.length).toBe(before);
    expect(
      (
        screen.getByRole("button", {
          name: "Open response " + row.id,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    reload("responses");
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Open response " + row.id,
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    expect(reads.slice(before)).toEqual(["responses"]);
  });
});

for (const action of [
  "saved view",
  "availability",
  "response privacy",
] as const)
  it(
    "clears private URL filters/proposals on denied " + action + " writes",
    async () => {
      const original = apiMock.getMockImplementation()!;
      apiMock.mockImplementation(
        async (path: string, options?: { method?: string }) => {
          if (options?.method)
            throw new ApiFailure(
              403,
              "FORBIDDEN",
              "Fictional action access changed",
            );
          const result = await original(path, options);
          if (kind(path) === "responses")
            return {
              ...result,
              items: result.items.map((item: unknown) => ({
                ...(item as object),
                revision: 2,
                redacted: false,
              })),
            };
          return result;
        },
      );
      mount(root + "/responses?q=FictionalPrivateQuery");
      await loaded();
      fireEvent.change(screen.getByLabelText("New view name"), {
        target: { value: "Fictional private proposal" },
      });
      if (action === "saved view") {
        fireEvent.click(
          screen.getByRole("button", { name: "Save view", exact: true }),
        );
        fireEvent.click(
          screen.getByRole("button", { name: "Confirm new view", exact: true }),
        );
      } else if (action === "availability") {
        fireEvent.click(
          screen.getByRole("button", { name: "Close form", exact: true }),
        );
        fireEvent.click(
          within(screen.getByRole("dialog")).getByRole("button", {
            name: "Close form",
            exact: true,
          }),
        );
      } else {
        fireEvent.click(
          screen.getByRole("button", {
            name: "Open response " + row.id,
            exact: true,
          }),
        );
        fireEvent.click(
          screen.getByRole("button", { name: "Delete response", exact: true }),
        );
        fireEvent.change(screen.getByLabelText(/Confirm response action/), {
          target: { value: "DELETE" },
        });
        fireEvent.click(
          screen.getByRole("button", { name: "Confirm delete", exact: true }),
        );
      }
      await screen.findByRole("heading", {
        name: "Response access needs to be rechecked",
      });
      expect(screen.getByLabelText("Current route").textContent).toBe("");
      expect(
        screen.queryByDisplayValue("Fictional private proposal"),
      ).toBeNull();
      expect(
        screen.queryByText(row.respondent.email, { exact: false }),
      ).toBeNull();
      expect(
        (
          screen.getByRole("button", {
            name: "Recheck response workspace access",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false);
    },
  );
