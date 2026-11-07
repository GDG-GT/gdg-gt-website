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
import { MemoryRouter, useSearchParams } from "react-router-dom";
import AuditWorkspace from "../../src/ui/AuditWorkspace";
import { ApiFailure } from "../../src/lib/api";
const { apiMock, actor } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  actor: { id: "fictional-audit-admin", role: "admin" },
}));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: apiMock,
}));
vi.mock("@/contexts/AdminContext", () => ({
  useAdmin: () => ({ currentAdmin: actor }),
}));
const row = {
  id: "fictional-audit-entry",
  actor_id: null,
  action: "fictional.audit_action",
  target_type: "fixture",
  target_id: "fictional-target",
  result: "success",
  request_id: "fictional-request",
  created_at: "2026-11-05T12:00:00Z",
};
function listing(action = row.action, empty = false) {
  return {
    items: empty ? [] : [{ ...row, action }],
    total: empty ? 0 : 1,
    pageSize: 30,
    at: row.created_at,
    nextCursor: null,
    statistics: {
      total: empty ? 0 : 1,
      success: empty ? 0 : 1,
      denied: 0,
      failure: 0,
      firstEntry: row.created_at,
      lastEntry: row.created_at,
      actions: [],
      retention: {
        minimumYears: 2,
        automaticPurge: false,
        earliestAvailable: row.created_at,
      },
    },
  };
}
const entry = {
  record: { ...row, metadata: { count: 17 } },
  metadataPolicy: "Fictional safe metadata projection",
};
const historyPath = "/admin/audit?",
  entryPath = "/admin/audit/" + row.id;
let read: (path: string) => unknown;
const defaults = (path: string) =>
  path.startsWith("/admin/audit?") ? listing() : entry;
function pending() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function EntryRoute() {
  const [params, setParams] = useSearchParams();
  return (
    <button
      onClick={() => {
        const next = new URLSearchParams(params);
        next.set("entry", "new-fictional-entry");
        setParams(next);
      }}
    >
      Open another entry
    </button>
  );
}
const body = (initial = "/admin/audit-log") => (
  <MemoryRouter initialEntries={[initial]}>
    <main id="workspace-content" tabIndex={-1}>
      <AuditWorkspace />
    </main>
    <EntryRoute />
  </MemoryRouter>
);
beforeEach(() => {
  apiMock.mockReset();
  actor.id = "fictional-audit-admin";
  actor.role = "admin";
  read = defaults;
  apiMock.mockImplementation((path) =>
    Promise.resolve().then(() => read(path)),
  );
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: true,
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("Audit history and entry recovery", () => {
  it("names loading without inventing empty history or an export", () => {
    read = () => pending().promise;
    render(body());
    expect(
      screen.getByRole("status", { name: "Loading audit history" }),
    ).toBeTruthy();
    expect(screen.queryByText("No audit history yet")).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Export filtered CSV" }),
    ).toBeNull();
  });
  it("recovers the initial history read explicitly and focuses the workspace", async () => {
    read = () => {
      throw Error("Fictional history outage");
    };
    render(body());
    const retry = await screen.findByRole("button", {
      name: "Retry audit history",
    });
    read = defaults;
    fireEvent.click(retry);
    await screen.findByText(row.action);
    expect(document.activeElement?.id).toBe("workspace-content");
    expect(apiMock.mock.calls.every(([, options]) => !options.method)).toBe(
      true,
    );
  });
  it("retains a timestamped failed-refresh snapshot with export and detail entry disabled", async () => {
    render(body());
    await screen.findByText(row.action);
    read = () => {
      throw Error("Fictional refresh outage");
    };
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh", exact: true }),
    );
    await screen.findByRole("button", { name: "Retry audit history" });
    expect(screen.getByText(row.action)).toBeTruthy();
    expect(screen.getByText(/Last successful history read/)).toBeTruthy();
    expect(
      screen.queryByRole("link", { name: "Export filtered CSV" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: /^Details for/ }).matches(":disabled"),
    ).toBe(true);
  });
  it("recovers a failed detail independently from the loaded history", async () => {
    read = (path) => {
      if (path === entryPath) throw Error("Fictional entry outage");
      return defaults(path);
    };
    render(body("/admin/audit-log?entry=" + row.id));
    await screen.findByRole("button", { name: "Retry audit entry" });
    expect(screen.getByText(row.action)).toBeTruthy();
    const inventoryReads = apiMock.mock.calls.filter(
      ([path]) => path === historyPath,
    ).length;
    read = defaults;
    fireEvent.click(screen.getByRole("button", { name: "Retry audit entry" }));
    await screen.findByText("Fictional safe metadata projection");
    expect(
      apiMock.mock.calls.filter(([path]) => path === historyPath),
    ).toHaveLength(inventoryReads);
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "Audit entry detail" }),
    );
  });
  it("retains a detail snapshot and timestamp on temporary refresh failure", async () => {
    render(body("/admin/audit-log?entry=" + row.id));
    await screen.findByText("Fictional safe metadata projection");
    read = (path) => {
      if (path === entryPath) throw Error("Fictional entry refresh outage");
      return defaults(path);
    };
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh audit entry" }),
    );
    await screen.findByRole("button", { name: "Retry audit entry" });
    expect(screen.getByText("Fictional safe metadata projection")).toBeTruthy();
    expect(screen.getByText(/Last successful entry read/)).toBeTruthy();
  });
  it.each([historyPath, entryPath])(
    "clears history and detail on denial of %s and rechecks the inventory",
    async (deniedPath) => {
      render(body("/admin/audit-log?entry=" + row.id));
      await screen.findByText("Fictional safe metadata projection");
      read = (path) => {
        if (path === deniedPath)
          throw new ApiFailure(
            deniedPath === historyPath ? 403 : 404,
            "NOT_FOUND",
            "Current access unavailable",
          );
        return defaults(path);
      };
      fireEvent.click(
        screen.getByRole("button", { name: "Refresh", exact: true }),
      );
      await screen.findByText("Audit access needs to be rechecked");
      expect(screen.queryByText(row.action)).toBeNull();
      expect(
        screen.queryByText("Fictional safe metadata projection"),
      ).toBeNull();
      read = defaults;
      fireEvent.click(
        screen.getByRole("button", { name: "Recheck audit access" }),
      );
      await screen.findByText(row.action);
      expect(
        screen.queryByRole("heading", { name: "Audit entry detail" }),
      ).toBeNull();
    },
  );
  it("hides the previous query while a changed filter loads and cancels old transport", async () => {
    render(body());
    await screen.findByText(row.action);
    const delayed = pending();
    read = () => delayed.promise;
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh", exact: true }),
    );
    const oldSignal = apiMock.mock.calls.at(-1)![1].signal;
    fireEvent.change(screen.getByLabelText("Exact action"), {
      target: { value: "fictional.changed" },
    });
    read = () => listing("fictional.changed");
    fireEvent.submit(
      screen.getByRole("button", { name: "Apply filters" }).closest("form")!,
    );
    expect(screen.queryByText(row.action)).toBeNull();
    await screen.findByText("fictional.changed");
    expect(oldSignal.aborted).toBe(true);
    await act(async () => delayed.resolve(listing("fictional.late")));
    expect(screen.queryByText("fictional.late")).toBeNull();
  });
  it("cancels a replaced entry and ignores its late metadata", async () => {
    const delayed = pending();
    read = (path) => (path === entryPath ? delayed.promise : defaults(path));
    render(body("/admin/audit-log?entry=" + row.id));
    await screen.findByText(row.action);
    const signal = apiMock.mock.calls.find(([path]) => path === entryPath)![1]
      .signal;
    fireEvent.click(screen.getByRole("button", { name: "Open another entry" }));
    await screen.findByText("Fictional safe metadata projection");
    expect(signal.aborted).toBe(true);
    await act(async () =>
      delayed.resolve({
        ...entry,
        metadataPolicy: "Fictional late private metadata",
      }),
    );
    expect(screen.queryByText("Fictional late private metadata")).toBeNull();
  });
  it.each(["id", "role", "session"])(
    "clears and cancels private history after %s replacement",
    async (kind) => {
      const view = render(body());
      await screen.findByText(row.action);
      const delayed = pending();
      read = () => delayed.promise;
      fireEvent.click(
        screen.getByRole("button", { name: "Refresh", exact: true }),
      );
      const signal = apiMock.mock.calls.at(-1)![1].signal;
      read = () => listing("fictional.replacement");
      if (kind === "session")
        act(() => window.dispatchEvent(new Event("gdg:session-cleared")));
      else {
        actor[kind] = "replacement";
        view.rerender(body());
      }
      await screen.findByText("fictional.replacement");
      expect(signal.aborted).toBe(true);
      await act(async () => delayed.resolve(listing("fictional.late")));
      expect(screen.queryByText(row.action)).toBeNull();
      expect(screen.queryByText("fictional.late")).toBeNull();
    },
  );
  it("retains timestamped offline history without enabling export or retry", async () => {
    render(body());
    await screen.findByText(row.action);
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    act(() => window.dispatchEvent(new Event("offline")));
    expect(screen.getByText(/History snapshot from/)).toBeTruthy();
    expect(
      screen.queryByRole("link", { name: "Export filtered CSV" }),
    ).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Refresh", exact: true })
        .matches(":disabled"),
    ).toBe(true);
  });
  it("distinguishes first-use from filtered empty history and offers a filter reset", async () => {
    read = () => listing(row.action, true);
    render(body("/admin/audit-log?action=fictional.none"));
    await screen.findByText("No audit entries match");
    fireEvent.click(
      screen.getByRole("button", { name: "Reset audit filters" }),
    );
    await screen.findByText("No audit history yet");
    expect(
      screen.queryByRole("button", { name: "Reset audit filters" }),
    ).toBeNull();
  });
});
