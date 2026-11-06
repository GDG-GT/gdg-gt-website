// @vitest-environment jsdom
import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import FormsLibrary from "../../src/ui/forms/FormsLibrary";
import { createTemplate, type PreviewForm } from "../../shared/forms";
import { ApiFailure } from "../../src/lib/api";
const { apiMock, guard } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  guard: vi.fn(),
}));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: apiMock,
}));
vi.mock("@/contexts/AdminContext", () => ({
  useAdmin: () => ({
    currentAdmin: { id: "fictional-form-reviewer", role: "admin" },
    isSuperAdmin: false,
  }),
}));
vi.mock("@/hooks/useDraftGuard", () => ({
  useDraftGuard: guard,
  useNavigationSafety: () => ({ allow: (run: () => void) => run() }),
}));
let form: PreviewForm;
beforeEach(() => {
  form = {
    ...createTemplate("Fictional availability form", "blank"),
    id: "f1420000-0000-4000-8000-000000000077",
    status: "Open",
    revision: 7,
    actions: ["view", "publish", "delete"],
    responseCount: 0,
  };
  form.versions = [
    {
      ...structuredClone(form),
      version: 1,
      publishedAt: "2026-11-05T01:00:00Z",
    },
  ];
  apiMock.mockReset();
  guard.mockReset();
  apiMock.mockImplementation((_path: string, options?: { method?: string }) =>
    Promise.resolve(
      options?.method
        ? { form }
        : { items: [form], total: 1, page: 1, pageSize: 30, canCreate: false },
    ),
  );
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const writes = () =>
  apiMock.mock.calls.filter(([, options]) => options?.method);
async function openReview(label: string, ready = true) {
  render(
    <MemoryRouter>
      <FormsLibrary />
    </MemoryRouter>,
  );
  fireEvent.keyDown(
    await screen.findByRole("button", { name: "Actions for " + form.title }),
    { key: "Enter" },
  );
  fireEvent.click(await screen.findByRole("menuitem", { name: label }));
  const dialog = await screen.findByRole("dialog", { name: label + "?" });
  if (ready)
    await waitFor(() =>
      expect(
        (
          within(dialog).getByRole("button", {
            name: label,
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
  return dialog;
}
it.each([
  [
    "Archive form",
    "Open",
    "DELETE",
    "",
    undefined,
    /Responses and published history are retained/,
  ],
  [
    "Restore draft",
    "Archived",
    "POST",
    "/restore",
    undefined,
    /does not reopen it/,
  ],
  ["Close form", "Open", "POST", "/state", "Closed", /Stop new submissions/],
  ["Reopen form", "Closed", "POST", "/state", "Open", /existing access rules/],
] as const)(
  "reviews %s before one revision-bound operation",
  async (label, status, method, suffix, state, consequence) => {
    form.status = status;
    const dialog = await openReview(label);
    expect(within(dialog).getByText(form.title)).toBeTruthy();
    expect(within(dialog).getByText(consequence)).toBeTruthy();
    expect(writes()).toHaveLength(0);
    expect(guard.mock.calls.some(([dirty]) => dirty)).toBe(true);
    fireEvent.click(within(dialog).getByRole("button", { name: label }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0][0]).toBe("/admin/forms/" + form.id + suffix);
    expect(writes()[0][1]).toMatchObject({
      method,
      protected: true,
      body: { revision: 7, ...(state ? { state } : {}) },
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
      await screen.findByText(/^Fictional availability form: /),
    ).toBeTruthy();
  },
);
it("cancels an archive review without a write", async () => {
  const dialog = await openReview("Archive form");
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Cancel review" }),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(writes()).toHaveLength(0);
});
it("shows a rejected validation operation inside the retained review", async () => {
  const dialog = await openReview("Close form");
  apiMock.mockRejectedValue(
    new ApiFailure(400, "VALIDATION_ERROR", "Fictional close not confirmed"),
  );
  fireEvent.click(within(dialog).getByRole("button", { name: "Close form" }));
  await within(dialog).findByRole("alert");
  expect(within(dialog).getByRole("alert").textContent).toContain(
    "Fictional close not confirmed",
  );
  expect(within(dialog).getByText(form.title)).toBeTruthy();
});
it("freezes a pending review and suppresses duplicate immediate confirmation", async () => {
  const dialog = await openReview("Archive form");
  apiMock.mockReturnValue(new Promise(() => {}));
  const confirm = within(dialog).getByRole("button", { name: "Archive form" });
  fireEvent.click(confirm);
  fireEvent.click(confirm);
  expect(writes()).toHaveLength(1);
  expect(
    (
      within(dialog).getByRole("button", {
        name: "Cancel review",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  fireEvent.keyDown(dialog, { key: "Escape" });
  expect(screen.getByRole("dialog")).toBeTruthy();
});
it("keeps an offline review and never auto-confirms after reconnect", async () => {
  const dialog = await openReview("Close form");
  fireEvent(window, new Event("offline"));
  expect(
    (
      within(dialog).getByRole("button", {
        name: "Close form",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  fireEvent(window, new Event("online"));
  expect(writes()).toHaveLength(0);
  expect(
    within(dialog).getByRole("button", { name: "Close form" }),
  ).toBeTruthy();
});
it("clears an old review when the same-account session is replaced", async () => {
  await openReview("Archive form");
  fireEvent(window, new Event("gdg:session-cleared"));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(writes()).toHaveLength(0);
});
it("rechecks current grants before permitting an availability confirmation", async () => {
  let reads = 0;
  apiMock.mockImplementation(() =>
    Promise.resolve({
      items: [{ ...form, actions: ++reads > 1 ? ["view"] : form.actions }],
      total: 1,
      page: 1,
      pageSize: 30,
    }),
  );
  const dialog = await openReview("Archive form", false);
  await within(dialog).findByText(
    "Your current permissions do not allow this action.",
  );
  expect(
    (
      within(dialog).getByRole("button", {
        name: "Archive form",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(writes()).toHaveLength(0);
});
it("requires a new review when the form changes during the current-state check", async () => {
  let reads = 0;
  apiMock.mockImplementation(() =>
    Promise.resolve({
      items: [{ ...form, revision: ++reads > 1 ? 8 : 7 }],
      total: 1,
      page: 1,
      pageSize: 30,
    }),
  );
  const dialog = await openReview("Close form", false);
  await within(dialog).findByText(/The form changed or is no longer/);
  expect(
    (
      within(dialog).getByRole("button", {
        name: "Close form",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(writes()).toHaveLength(0);
});
