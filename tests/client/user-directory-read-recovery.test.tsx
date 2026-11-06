// @vitest-environment jsdom
import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import UserWorkspace from "../../src/ui/users/UserWorkspace";
import { ApiFailure } from "../../src/lib/api";
const { apiMock, actor } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  actor: { id: "fictional-directory-superadmin", role: "super_admin" },
}));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: apiMock,
}));
vi.mock("@/contexts/AdminContext", () => ({
  useAdmin: () => ({ currentAdmin: actor }),
}));
vi.mock("@/hooks/useDraftGuard", () => ({ useDraftGuard: vi.fn() }));
const person = {
    id: "fictional-person",
    display_name: "Fictional private person",
    email: "fictional-person@example.test",
    role: "team_member",
    is_active: true,
    must_change_password: false,
    revision: 1,
    deleted_at: null,
    last_login_at: null,
    locked_until: null,
  },
  second = {
    ...person,
    id: "fictional-second",
    display_name: "Fictional second person",
    email: "fictional-second@example.test",
  },
  directoryPath = "/admin/users?q=&state=current&page=1",
  sessionPath = "/admin/users/" + person.id + "/sessions";
let read: (path: string) => unknown;
function defaults(path: string) {
  if (/^\/admin\/users\/[^/]+$/.test(path))
    return { record: path.endsWith(second.id) ? second : person };
  return path.endsWith("/sessions")
    ? {
        items: [
          {
            id: "fictional-session",
            created_at: "2026-11-01T12:00:00Z",
            last_seen_at: "2026-11-05T12:00:00Z",
            idle_expires_at: "2099-11-05T12:00:00Z",
          },
        ],
      }
    : {
        items: [person, second],
        total: 21,
        page: 1,
        pageSize: 20,
        actorId: actor.id,
      };
}
function pending() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const body = () => (
  <main id="workspace-content" tabIndex={-1}>
    <UserWorkspace />
  </main>
);
const row = (email = person.email) =>
  within(screen.getByText(email).closest("tr")!);
async function openSessions(email = person.email) {
  await screen.findByText(email);
  const opener = row(email).getByRole("button", {
    name: "Sessions",
    exact: true,
  });
  opener.focus();
  fireEvent.click(opener);
  return opener;
}
beforeEach(() => {
  apiMock.mockReset();
  actor.id = "fictional-directory-superadmin";
  actor.role = "super_admin";
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
describe("Account directory and selected-account session read recovery", () => {
  it("names initial loading without false empty inventory or enabled creation", () => {
    read = () => pending().promise;
    render(body());
    expect(
      screen.getByRole("status", { name: "Loading accounts" }),
    ).toBeTruthy();
    expect(screen.queryByText("No matching accounts")).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Create account" })
        .matches(":disabled"),
    ).toBe(true);
  });
  it("retries initial failure read-only and focuses the workspace", async () => {
    read = () => {
      throw Error("Fictional directory outage");
    };
    render(body());
    const retry = await screen.findByRole("button", {
      name: "Retry account directory",
    });
    read = defaults;
    fireEvent.click(retry);
    await screen.findByText(person.email);
    expect(document.activeElement?.id).toBe("workspace-content");
    expect(apiMock.mock.calls.every(([, options]) => !options.method)).toBe(
      true,
    );
  });
  it("retains a dated directory snapshot with security/session actions disabled after failed refresh", async () => {
    render(body());
    await screen.findByText(person.email);
    read = () => {
      throw Error("Fictional directory refresh outage");
    };
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh account directory" }),
    );
    await screen.findByRole("button", { name: "Retry account directory" });
    expect(screen.getByText(person.email)).toBeTruthy();
    expect(screen.getByText(/Last successful account read/)).toBeTruthy();
    for (const name of ["Edit", "Sessions", "Deactivate account"])
      expect(
        row().getByRole("button", { name, exact: true }).matches(":disabled"),
      ).toBe(true);
  });
  it("retains unsaved editor fields on temporary inventory failure and blocks saving", async () => {
    render(body());
    await screen.findByText(person.email);
    fireEvent.click(row().getByRole("button", { name: "Edit", exact: true }));
    const name = screen.getByLabelText(/^Display name/) as HTMLInputElement;
    fireEvent.change(name, { target: { value: "Fictional unsaved name" } });
    read = () => {
      throw Error("Fictional interrupted refresh");
    };
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh account directory" }),
    );
    await screen.findByRole("button", { name: "Retry account directory" });
    expect(name.value).toBe("Fictional unsaved name");
    expect(
      screen.getByRole("button", { name: "Save account" }).matches(":disabled"),
    ).toBe(true);
    expect(apiMock.mock.calls.every(([, options]) => !options.method)).toBe(
      true,
    );
  });
  it("hides old rows on search replacement and ignores late cancelled reads", async () => {
    render(body());
    await screen.findByText(person.email);
    const delayed = pending();
    read = () => delayed.promise;
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh account directory" }),
    );
    const signal = apiMock.mock.calls.at(-1)![1].signal;
    read = () => ({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      actorId: actor.id,
    });
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search account emails" }),
      { target: { value: "fictional-none" } },
    );
    expect(screen.queryByText(person.email)).toBeNull();
    await screen.findByText("No matching accounts");
    expect(signal.aborted).toBe(true);
    await act(async () => delayed.resolve(defaults(directoryPath)));
    expect(screen.queryByText(person.email)).toBeNull();
  });
  it("hides the previous page while another page loads", async () => {
    render(body());
    await screen.findByText(person.email);
    const delayed = pending();
    read = () => delayed.promise;
    fireEvent.click(screen.getByRole("button", { name: "Next", exact: true }));
    expect(screen.queryByText(person.email)).toBeNull();
    expect(
      screen.getByRole("status", { name: "Loading accounts" }),
    ).toBeTruthy();
    await act(async () =>
      delayed.resolve({
        items: [second],
        total: 21,
        page: 2,
        pageSize: 20,
        actorId: actor.id,
      }),
    );
    await screen.findByText(second.email);
    expect(screen.queryByText(person.email)).toBeNull();
  });
  it("loads and retries selected sessions independently without inventing an empty result", async () => {
    read = (path) => {
      if (path === sessionPath) throw Error("Fictional session outage");
      return defaults(path);
    };
    render(body());
    await openSessions();
    const retry = await screen.findByRole("button", {
      name: "Retry account sessions",
    });
    expect(screen.queryByText("No active sessions.")).toBeNull();
    const reads = apiMock.mock.calls.filter(
      ([path]) => path === directoryPath,
    ).length;
    read = defaults;
    fireEvent.click(retry);
    await screen.findByText(/^Signed in/);
    expect(
      apiMock.mock.calls.filter(([path]) => path === directoryPath),
    ).toHaveLength(reads);
  });
  it("retains a timestamped session snapshot on temporary failure and restores its opener on close", async () => {
    render(body());
    const opener = await openSessions();
    await screen.findByText(/^Signed in/);
    read = (path) => {
      if (path === sessionPath) throw Error("Fictional session refresh outage");
      return defaults(path);
    };
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh account sessions" }),
    );
    await screen.findByRole("button", { name: "Retry account sessions" });
    expect(screen.getByText(/^Signed in/)).toBeTruthy();
    expect(screen.getByText(/Last successful session read/)).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Close session details" }),
    );
    expect(document.activeElement).toBe(opener);
  });
  it("cancels replaced session inventory and fences its late result", async () => {
    const delayed = pending();
    read = (path) => (path === sessionPath ? delayed.promise : defaults(path));
    render(body());
    await openSessions();
    const signal = apiMock.mock.calls.find(([path]) => path === sessionPath)![1]
      .signal;
    await openSessions(second.email);
    await screen.findByText(/^Signed in/);
    expect(signal.aborted).toBe(true);
    await act(async () => delayed.resolve({ items: [] }));
    expect(screen.queryByText("No active sessions.")).toBeNull();
    expect(
      screen.getByRole("heading", {
        name: "Active sessions · " + second.email,
      }),
    ).toBeTruthy();
  });
  it.each([directoryPath, sessionPath])(
    "clears private directory, sessions and editor credentials on denial of %s",
    async (pathDenied) => {
      render(body());
      await openSessions();
      await screen.findByText(/^Signed in/);
      fireEvent.click(row().getByRole("button", { name: "Edit", exact: true }));
      fireEvent.change(screen.getByLabelText(/^Confirm your own password/), {
        target: { value: "Fictional never sent password" },
      });
      read = (path) => {
        if (path === pathDenied)
          throw new ApiFailure(403, "FORBIDDEN", "Current access denied");
        return defaults(path);
      };
      fireEvent.click(
        screen.getByRole("button", {
          name:
            pathDenied === directoryPath
              ? "Refresh account directory"
              : "Refresh account sessions",
        }),
      );
      await screen.findByText("Account access needs to be rechecked");
      expect(screen.queryByText(person.email)).toBeNull();
      expect(
        screen.queryByDisplayValue("Fictional never sent password"),
      ).toBeNull();
      read = defaults;
      fireEvent.click(
        screen.getByRole("button", { name: "Recheck account access" }),
      );
      await screen.findByText(person.email);
      expect(
        screen.queryByRole("region", { name: "Selected account sessions" }),
      ).toBeNull();
    },
  );
  it.each(["id", "role", "session"])(
    "isolates private reads and fields after %s replacement",
    async (kind) => {
      const view = render(body());
      await screen.findByText(person.email);
      fireEvent.click(row().getByRole("button", { name: "Edit", exact: true }));
      fireEvent.change(screen.getByLabelText(/^Display name/), {
        target: { value: "Fictional private draft" },
      });
      const delayed = pending();
      read = () => delayed.promise;
      fireEvent.click(
        screen.getByRole("button", { name: "Refresh account directory" }),
      );
      const signal = apiMock.mock.calls.at(-1)![1].signal;
      read = () => ({
        items: [],
        total: 0,
        page: 1,
        pageSize: 20,
        actorId: actor.id,
      });
      if (kind === "session")
        act(() => window.dispatchEvent(new Event("gdg:session-cleared")));
      else {
        actor[kind] = "replacement";
        view.rerender(body());
      }
      await screen.findByText("No matching accounts");
      expect(signal.aborted).toBe(true);
      expect(screen.queryByDisplayValue("Fictional private draft")).toBeNull();
      await act(async () => delayed.resolve(defaults(directoryPath)));
      expect(screen.queryByText(person.email)).toBeNull();
    },
  );
  it("retains timestamped offline inventory without permitting writes or reconnect resubmission", async () => {
    render(body());
    await screen.findByText(person.email);
    const count = apiMock.mock.calls.length;
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    act(() => window.dispatchEvent(new Event("offline")));
    expect(screen.getByText(/Directory snapshot from/)).toBeTruthy();
    expect(
      row()
        .getByRole("button", { name: "Edit", exact: true })
        .matches(":disabled"),
    ).toBe(true);
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    act(() => window.dispatchEvent(new Event("online")));
    expect(apiMock.mock.calls).toHaveLength(count);
  });
  it("resets a filtered empty directory in place", async () => {
    render(body());
    await screen.findByText(person.email);
    read = (path) =>
      path.includes("q=fictional-none")
        ? { items: [], total: 0, pageSize: 20, page: 1, actorId: actor.id }
        : defaults(path);
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search account emails" }),
      { target: { value: "fictional-none" } },
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Reset account filters" }),
    );
    await screen.findByText(person.email);
    expect(
      (
        screen.getByRole("searchbox", {
          name: "Search account emails",
        }) as HTMLInputElement
      ).value,
    ).toBe("");
  });
});
