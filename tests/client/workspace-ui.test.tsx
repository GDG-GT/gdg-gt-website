// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";
import React, { type ReactNode } from "react";
import Overview from "../../src/ui/AdminOverview";
import AuditWorkspace from "../../src/ui/AuditWorkspace";
const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: apiMock,
}));
vi.mock("@/contexts/AdminContext", () => ({
  useAdmin: () => ({ currentAdmin: { display_name: "Fictional Reviewer" } }),
}));
const row = {
  id: "f1070000-0000-4000-8000-000000000001",
  actor_id: null,
  action: "forms.exported",
  target_type: "form",
  target_id: "f1070000-0000-4000-8000-000000000002",
  result: "success",
  request_id: "f1070000-0000-4000-8000-000000000003",
  created_at: "2026-10-24T10:00:00Z",
};
const statistics = {
  total: 31,
  success: 30,
  denied: 1,
  failure: 0,
  firstEntry: row.created_at,
  lastEntry: row.created_at,
  actions: [{ action: row.action, count: 30 }],
  retention: {
    minimumYears: 2,
    automaticPurge: false,
    earliestAvailable: row.created_at,
  },
};
function listing(next = true) {
  return {
    items: [row],
    total: 31,
    page: 1,
    pageSize: 30,
    at: "2026-10-24T11:00:00Z",
    statistics,
    nextCursor: next
      ? { before: row.created_at, beforeId: row.id, at: "2026-10-24T11:00:00Z" }
      : null,
  };
}
function RouteProbe() {
  const location = useLocation();
  return (
    <output aria-label="Current route">
      {location.pathname + location.search}
    </output>
  );
}
function mount(children: ReactNode, initial = "/admin") {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      {children}
      <RouteProbe />
    </MemoryRouter>,
  );
}
const ready = <T,>(data: T) => ({ state: "ready", data });
function dashboard() {
  return {
    generatedAt: "2026-10-24T11:00:00Z",
    allowedRoutes: ["/admin/events", "/admin/forms"],
    widgets: {
      events: ready({ count: 5, items: [] }),
      profiles: ready({ count: 7 }),
      finances: ready({ pending: 3 }),
      messages: ready({ unread: 4 }),
      registrations: ready({
        totalEvents: 5,
        items: [
          { id: "one", title: "Fictional event", internal: 2, external: 1 },
        ],
      }),
      funding: ready({
        items: [{ status: "pending", count: 1, amount: "40.10" }],
      }),
      memberships: ready({ items: [] }),
      tasks: ready({ count: 0, items: [] }),
      activity: ready({ items: [] }),
    },
  };
}
beforeEach(() => {
  apiMock.mockReset();
});
afterEach(cleanup);
describe("A11Y-TEST-002: operational overview loading and recovery", () => {
  it("shows a named skeleton, real chart values and only permitted quick actions", async () => {
    let complete: (data: ReturnType<typeof dashboard>) => void = () => {};
    apiMock.mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    mount(<Overview />);
    expect(
      screen.getByRole("status", { name: "Loading your workspace" }),
    ).toBeTruthy();
    complete(dashboard());
    expect(
      await screen.findByRole("link", { name: /4\s*Your unread messages/ }),
    ).toBeTruthy();
    expect(screen.getByText("$40.10")).toBeTruthy();
    expect(screen.getByText("2 internal · 1 external")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Plan an event/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Update the site/ })).toBeNull();
    expect(
      screen.getByRole("heading", { name: "Nothing assigned right now" }),
    ).toBeTruthy();
  });
  it("recovers from initial failure and keeps a dated snapshot on later failure", async () => {
    apiMock
      .mockRejectedValueOnce(Error("Fictional network failure"))
      .mockResolvedValueOnce(dashboard())
      .mockRejectedValueOnce(Error("Fictional background failure"));
    mount(<Overview />);
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Fictional network failure",
    );
    fireEvent.click(screen.getByRole("button", { name: "Refresh overview" }));
    await screen.findByRole("link", { name: /4\s*Your unread messages/ });
    fireEvent.click(screen.getByRole("button", { name: "Refresh overview" }));
    await screen.findByText("Fictional background failure");
    expect(
      screen.getByRole("link", { name: /4\s*Your unread messages/ }),
    ).toBeTruthy();
    expect(screen.getByText(/Showing the overview loaded at/)).toBeTruthy();
  });
  it("contains an individual widget error while other charts remain available", async () => {
    const data = dashboard();
    apiMock.mockResolvedValue({
      ...data,
      widgets: {
        ...data.widgets,
        registrations: {
          state: "error",
          message: "Fictional unavailable registrations",
        },
      },
    });
    mount(<Overview />);
    await screen.findByText("Fictional unavailable registrations");
    expect(screen.getByText("$40.10")).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Upcoming events" }),
    ).toBeTruthy();
  });
});
describe("A11Y-TEST-003: audit interaction, focus, cursor and filter recovery", () => {
  beforeEach(() => {
    apiMock.mockImplementation(async (path: string) =>
      path === "/admin/audit/" + row.id
        ? {
            record: { ...row, metadata: { count: 2, formId: row.target_id } },
            metadataPolicy:
              "Only approved identifiers, counts and flags are shown.",
          }
        : listing(!path.includes("before=")),
    );
  });
  it("focuses opened entry details and restores the invoking control when closed", async () => {
    mount(<AuditWorkspace />, "/admin/audit-log");
    const opener = await screen.findByRole("button", {
      name: /^View details for forms.exported/,
    });
    // The complete visible command must remain in its accessible name so
    // speech users can invoke the same words they see on a populated row.
    expect(opener.getAttribute("aria-label")?.toLowerCase()).toContain(
      opener.textContent!.trim().toLowerCase(),
    );
    opener.focus();
    fireEvent.click(opener);
    const heading = await screen.findByRole("heading", {
      name: "Audit entry detail",
    });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(screen.getByText("Approved metadata")).toBeTruthy();
    expect(screen.getByText("formId")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close details" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "Audit entry detail" }),
      ).toBeNull(),
    );
    expect(document.activeElement).toBe(opener);
    expect(
      screen.getByRole("status", { name: "Current route" }).textContent,
    ).not.toContain("entry=");
  });
  it("moves through fixed-snapshot cursor pages and returns focus to history", async () => {
    mount(<AuditWorkspace />, "/admin/audit-log?action=forms.exported");
    const older = await screen.findByRole("button", { name: "Older entries" });
    fireEvent.click(older);
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith(
        expect.stringContaining("beforeId=" + row.id),
        expect.anything(),
      ),
    );
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("heading", { name: "Action history" }),
      ),
    );
    expect(
      screen.getByRole("status", { name: "Current route" }).textContent,
    ).toContain("at=2026-10-24");
    expect(
      (
        screen.getByRole("button", {
          name: "Older entries",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Newer entries" }));
    await waitFor(() =>
      expect(
        screen.getByRole("status", { name: "Current route" }).textContent,
      ).toBe("/admin/audit-log?action=forms.exported"),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Older entries" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("status", { name: "Current route" }).textContent,
      ).toContain("before="),
    );
    fireEvent.click(screen.getByRole("button", { name: "First page" }));
    await waitFor(() =>
      expect(
        screen.getByRole("status", { name: "Current route" }).textContent,
      ).not.toContain("before="),
    );
  });
  it("applies named filters, preserves them in CSV links and clears them", async () => {
    mount(<AuditWorkspace />, "/admin/audit-log");
    await screen.findByRole("heading", { name: "Action history" });
    fireEvent.change(screen.getByLabelText("Exact action"), {
      target: { value: "forms.exported" },
    });
    fireEvent.change(screen.getByLabelText("Result"), {
      target: { value: "denied" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Apply filters" }).closest("form")!,
    );
    await waitFor(() =>
      expect(
        screen.getByRole("status", { name: "Current route" }).textContent,
      ).toContain("action=forms.exported"),
    );
    expect(
      screen
        .getByRole("link", { name: "Export filtered CSV" })
        .getAttribute("href"),
    ).toContain("result=denied");
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() =>
      expect(
        screen.getByRole("status", { name: "Current route" }).textContent,
      ).toBe("/admin/audit-log"),
    );
  });
  it("announces invalid date ranges without sending them to the API", async () => {
    mount(<AuditWorkspace />, "/admin/audit-log");
    await screen.findByRole("heading", { name: "Action history" });
    const count = apiMock.mock.calls.length;
    fireEvent.change(screen.getByLabelText("From (your local time)"), {
      target: { value: "2026-12-01T12:00" },
    });
    fireEvent.change(screen.getByLabelText("To (your local time)"), {
      target: { value: "2026-01-01T12:00" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Apply filters" }).closest("form")!,
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "end of the date range",
    );
    expect(apiMock.mock.calls).toHaveLength(count);
  });
  it("shows failed detail recovery without erasing the loaded history", async () => {
    apiMock.mockImplementation(async (path: string) => {
      if (path === "/admin/audit/" + row.id)
        throw Error("Fictional detail unavailable");
      return listing();
    });
    mount(<AuditWorkspace />, "/admin/audit-log?entry=" + row.id);
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Fictional detail unavailable",
    );
    expect(
      await screen.findByRole("heading", { name: "Action history" }),
    ).toBeTruthy();
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "Audit entry detail" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() =>
      expect(
        apiMock.mock.calls.filter(([path]) => path === "/admin/audit/" + row.id)
          .length,
      ).toBe(2),
    );
  });
});
