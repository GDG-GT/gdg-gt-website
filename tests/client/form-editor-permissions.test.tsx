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
import { MemoryRouter, Route, Routes } from "react-router-dom";
import FormBuilder from "../../src/ui/forms/FormBuilder";
import FormsLibrary from "../../src/ui/forms/FormsLibrary";
import { createTemplate, newField, type PreviewForm } from "../../shared/forms";
const { apiMock, draftState } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  draftState: vi.fn(),
}));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: apiMock,
}));
vi.mock("@/contexts/AdminContext", () => ({
  useAdmin: () => ({
    currentAdmin: { id: "fictional-viewer", role: "team_member" },
    isSuperAdmin: false,
  }),
}));
vi.mock("@/hooks/useDraftGuard", () => ({
  useDraftGuard: draftState,
  useNavigationSafety: () => ({ allow: (run: () => void) => run() }),
}));
function fixture(actions = ["view"]): PreviewForm {
  return {
    ...createTemplate("Fictional permission form", "blank"),
    id: "f1420000-0000-4000-8000-000000000001",
    revision: 1,
    ownerLabel: "Fictional owner",
    actions,
  };
}
function mountBuilder(form: PreviewForm) {
  apiMock.mockImplementation((path: string) =>
    Promise.resolve(
      path.startsWith("/admin/forms/") ? { form } : { items: [], total: 0 },
    ),
  );
  return render(
    <MemoryRouter initialEntries={["/admin/forms/fictional/edit"]}>
      <Routes>
        <Route
          path="/admin/forms/:formId/edit"
          element={
            <main id="workspace-content">
              <FormBuilder />
            </main>
          }
        />
        <Route
          path="/forms/:slug"
          element={<h1>Fictional read-only preview</h1>}
        />
      </Routes>
    </MemoryRouter>,
  );
}
function mountLibrary(form: PreviewForm, canCreate = false) {
  apiMock.mockResolvedValue({
    items: [form],
    total: 1,
    page: 1,
    pageSize: 30,
    canCreate,
  });
  return render(
    <MemoryRouter initialEntries={["/admin/forms"]}>
      <FormsLibrary />
    </MemoryRouter>,
  );
}
beforeEach(() => {
  apiMock.mockReset();
  draftState.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe("Action-aware form definition inspection", () => {
  it("keeps archived fields and publication read-only despite editing grants, rejecting local change and autosave", async () => {
    const form = fixture(["view", "edit", "publish"]);
    form.status = "Archived";
    mountBuilder(form);
    const input = await screen.findByLabelText("Form title");
    expect(input).toHaveProperty("disabled", true);
    expect(screen.getByLabelText("Form description")).toHaveProperty(
      "disabled",
      true,
    );
    expect(
      screen.getByRole("region", { name: "Archived form status" }).textContent,
    ).toContain("Restore it as a private draft");
    expect(
      screen.getByRole("button", { name: "Publish", exact: true }),
    ).toHaveProperty("disabled", true);
    vi.useFakeTimers();
    fireEvent.change(input, {
      target: { value: "Fictional forbidden archived edit" },
    });
    fireEvent.change(screen.getByLabelText(/Question label/), {
      target: { value: "Fictional forbidden archived question" },
    });
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(input).toHaveProperty("value", form.title);
    expect(apiMock.mock.calls.every(([, options]) => !options?.method)).toBe(
      true,
    );
  });
  it("keeps an unchanged archived saved preview available without attempting a save", async () => {
    const form = fixture(["view", "edit", "publish"]);
    form.status = "Archived";
    mountBuilder(form);
    await screen.findByLabelText("Form title");
    const preview = screen.getByRole("link", { name: "Preview", exact: true });
    expect(preview.getAttribute("aria-disabled")).toBe("false");
    fireEvent.click(preview);
    await screen.findByRole("heading", { name: "Fictional read-only preview" });
    expect(apiMock.mock.calls.every(([, options]) => !options?.method)).toBe(
      true,
    );
  });
  it("makes view-only title, description, section, fields and add/reorder controls truly read-only", async () => {
    mountBuilder(fixture());
    await screen.findByLabelText("Form title");
    expect(screen.getByText(/View only. Draft editing requires/)).toBeTruthy();
    for (const name of ["Form title", "Form description", "Section 1 title"])
      expect((screen.getByLabelText(name) as HTMLInputElement).disabled).toBe(
        true,
      );
    expect(screen.getByLabelText(/Question label/).matches(":disabled")).toBe(
      true,
    );
    for (const name of [
      "Short text",
      "Add question",
      "Add section",
      "Duplicate section 1",
      "Move Your question up",
      "Move Your question down",
    ])
      expect(
        (screen.getByRole("button", { name, exact: true }) as HTMLButtonElement)
          .disabled,
      ).toBe(true);
    expect(
      screen.getByRole("button", { name: "Inspect Your question" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Settings" }));
    expect(screen.getByLabelText("Access mode").matches(":disabled")).toBe(
      true,
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Version history",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
    expect(
      (
        screen.getByRole("button", {
          name: "Switch to mobile canvas",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });
  it("rejects synthetic local change/drag events for a viewer without a dirty guard or autosave", async () => {
    const form = fixture();
    mountBuilder(form);
    await screen.findByLabelText("Form title");
    vi.useFakeTimers();
    fireEvent.change(screen.getByLabelText("Form title"), {
      target: { value: "Forbidden local title" },
    });
    fireEvent.change(screen.getByLabelText(/Question label/), {
      target: { value: "Forbidden local question" },
    });
    const canvas = document.querySelector(".gt-builder-canvas")!;
    fireEvent.drop(canvas, { dataTransfer: { getData: () => "long" } });
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(
      (screen.getByLabelText("Form title") as HTMLInputElement).value,
    ).toBe(form.title);
    expect(screen.queryByText("Forbidden local question")).toBeNull();
    expect(document.querySelectorAll(".gt-builder-field")).toHaveLength(1);
    expect(draftState.mock.calls.every(([dirty]) => !dirty)).toBe(true);
    expect(apiMock.mock.calls.some(([, options]) => options?.method)).toBe(
      false,
    );
  });
  it("keeps access management independent from draft editing permission", async () => {
    const form = fixture(["view", "manage_access"]),
      original = { form };
    apiMock.mockImplementation((path: string) =>
      Promise.resolve(
        path.endsWith("/collaborators") ||
          path.endsWith("/collaborator-candidates") ||
          path.includes("/invitations?")
          ? { items: [], total: 0 }
          : original,
      ),
    );
    render(
      <MemoryRouter initialEntries={["/admin/forms/fictional/edit"]}>
        <Routes>
          <Route path="/admin/forms/:formId/edit" element={<FormBuilder />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByLabelText("Form title");
    fireEvent.click(screen.getByRole("tab", { name: "Access" }));
    const account = await screen.findByLabelText("Chapter account");
    expect(account.matches(":disabled")).toBe(false);
    expect(
      (screen.getByLabelText("Form title") as HTMLInputElement).disabled,
    ).toBe(true);
  });
  it("permits authorized field edits and updates the visible draft", async () => {
    mountBuilder(fixture(["view", "edit"]));
    await screen.findByLabelText("Form title");
    expect(
      (screen.getByLabelText("Form title") as HTMLInputElement).disabled,
    ).toBe(false);
    fireEvent.change(screen.getByLabelText("Form title"), {
      target: { value: "Authorized fictional title" },
    });
    expect(
      screen.getByRole("heading", { name: "Authorized fictional title" }),
    ).toBeTruthy();
    expect(draftState.mock.calls.some(([dirty]) => dirty)).toBe(true);
  });
});
describe("Builder ordering and undo across sections", () => {
  it("moves questions within their visible section even when the underlying fields are interleaved", async () => {
    const form = fixture(["view", "edit"]),
      first = form.sections[0].id,
      second = "f1420000-0000-4000-8000-000000000002";
    form.sections.push({
      id: second,
      title: "Second fictional section",
      description: "",
    });
    form.fields = [
      { ...newField("short", first), label: "First A" },
      { ...newField("short", second), label: "Second B" },
      { ...newField("short", first), label: "First C" },
    ];
    mountBuilder(form);
    await screen.findByLabelText("Form title");
    expect(
      (
        screen.getByRole("button", {
          name: "Move Second B up",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: "Move Second B down",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Move First C up" }));
    const labels = [
      ...document.querySelectorAll(
        ".gt-builder-section:first-of-type .gt-field-toolbar > button",
      ),
    ].map((node) => node.getAttribute("aria-label"));
    expect(labels).toEqual(["Edit First C", "Edit First A"]);
  });
  it("restores the original section and order when undoing a cross-section drag", async () => {
    const form = fixture(["view", "edit"]),
      first = form.sections[0].id,
      second = "f1420000-0000-4000-8000-000000000002";
    form.sections.push({
      id: second,
      title: "Second fictional section",
      description: "",
    });
    form.fields = [
      { ...newField("short", first), label: "First question" },
      { ...newField("short", second), label: "Second question" },
    ];
    mountBuilder(form);
    await screen.findByLabelText("Form title");
    const cards = document.querySelectorAll(".gt-builder-field");
    fireEvent.dragStart(cards[0]);
    fireEvent.drop(cards[1]);
    expect(
      document
        .querySelectorAll(".gt-builder-section")[0]
        .querySelectorAll(".gt-builder-field"),
    ).toHaveLength(0);
    expect(
      document
        .querySelectorAll(".gt-builder-section")[1]
        .querySelectorAll(".gt-builder-field"),
    ).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Undo change" }));
    const sections = document.querySelectorAll(".gt-builder-section");
    expect(sections[0].textContent).toContain("First question");
    expect(sections[0].textContent).not.toContain("Second question");
    expect(sections[1].textContent).toContain("Second question");
    expect(sections[1].textContent).not.toContain("First question");
  });
});
describe("Permission-aware library response actions", () => {
  it("hides creation templates and disables new forms for collaborators without a create grant", async () => {
    const form = fixture();
    mountLibrary(form);
    await screen.findByRole("cell", { name: "Restricted" });
    expect(
      (screen.getByRole("button", { name: "Create form" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(screen.queryByText("Event Interest")).toBeNull();
    fireEvent.keyDown(
      screen.getByRole("button", { name: "Actions for " + form.title }),
      { key: "Enter" },
    );
    expect(
      (await screen.findByRole("menuitem", { name: "Duplicate" })).getAttribute(
        "aria-disabled",
      ),
    ).toBe("true");
  });
  it("offers scoped duplication independently of editing and general creation permission", async () => {
    const form = { ...fixture(), canDuplicate: true };
    mountLibrary(form);
    await screen.findByRole("cell", { name: "Restricted" });
    fireEvent.keyDown(
      screen.getByRole("button", { name: "Actions for " + form.title }),
      { key: "Enter" },
    );
    expect(
      (await screen.findByRole("menuitem", { name: "Duplicate" })).getAttribute(
        "aria-disabled",
      ),
    ).not.toBe("true");
    expect(screen.getByRole("menuitem", { name: "View form" })).toBeTruthy();
  });
  it("offers creation templates when the inventory explicitly permits creation", async () => {
    mountLibrary(fixture(), true);
    await screen.findByText("Event Interest");
    expect(
      (screen.getByRole("button", { name: "Create form" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });
  it("shows Restricted as plain text and offers View form when response/edit permissions are absent", async () => {
    const form = fixture();
    mountLibrary(form);
    await screen.findByRole("cell", { name: "Restricted" });
    expect(
      screen
        .getAllByRole("link")
        .some((link) => link.getAttribute("href")?.endsWith("/responses")),
    ).toBe(false);
    fireEvent.keyDown(
      screen.getByRole("button", { name: "Actions for " + form.title }),
      { key: "Enter" },
    );
    await screen.findByRole("menuitem", { name: "View form" });
    expect(
      screen
        .getByRole("menuitem", { name: "View responses" })
        .getAttribute("aria-disabled"),
    ).toBe("true");
    expect(screen.queryByRole("menuitem", { name: "Edit form" })).toBeNull();
  });
  it("retains an actual response link for authorized reviewers", async () => {
    const form = {
      ...fixture(["view", "edit", "view_responses"]),
      responseCount: 7,
    };
    mountLibrary(form);
    const responses = await screen.findByRole("link", { name: "7" });
    expect(responses.getAttribute("href")).toBe(
      `/admin/forms/${form.id}/responses`,
    );
  });
});
