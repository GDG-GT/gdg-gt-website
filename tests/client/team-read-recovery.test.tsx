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
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TeamWorkspace from "../../src/ui/teams/TeamWorkspace";
import { ApiFailure } from "../../src/lib/api";
const { apiMock, actor, navigation } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  actor: { id: "fictional-team-admin", role: "admin" },
  navigation: { request: vi.fn((action: () => void) => action()) },
}));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: apiMock,
}));
vi.mock("@/contexts/AdminContext", () => ({
  useAdmin: () => ({ currentAdmin: actor, refreshTeams: vi.fn() }),
}));
// The actual router hook is retained for local section changes; guards are separately exercised.
vi.mock("@/hooks/useDraftGuard", async () => {
  const router = await import("react-router-dom");
  return {
    useDraftGuard: vi.fn(),
    useApprovedSearchParams: router.useSearchParams,
    useNavigationSafety: () => navigation,
  };
});
vi.mock("../../src/ui/forms/FormIntegrations", () => ({
  default: () => <p>Fictional linked forms</p>,
}));
vi.mock("../../src/ui/teams/TeamChat", () => ({
  default: () => <p>Fictional scoped chat</p>,
}));
vi.mock("../../src/ui/teams/TeamInvitations", () => ({
  default: function FictionalInvites({ disabled }: { disabled?: boolean }) {
    const [value, setValue] = React.useState("");
    return (
      <input
        aria-label="Fictional unsent invitation"
        disabled={disabled}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
    );
  },
}));
vi.mock("../../src/ui/teams/TeamAnnouncements", () => ({
  default: function FictionalPosts({ disabled }: { disabled?: boolean }) {
    const [value, setValue] = React.useState("");
    return (
      <input
        aria-label="Fictional announcement draft"
        disabled={disabled}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
    );
  },
}));
const team = {
    id: "fictional-team",
    name: "Fictional private team",
    description: "Fictional team description",
    slug: "fictional-team",
    color: "#4285F4",
    icon: "users",
    revision: 1,
    is_active: true,
    deleted_at: null,
  },
  destination = {
    ...team,
    id: "fictional-destination",
    name: "Fictional destination",
    slug: "fictional-destination",
  },
  person = {
    id: "fictional-membership",
    admin_user_id: "fictional-member",
    role: "member",
    revision: 1,
    is_active: true,
    joined_at: "2026-11-05T12:00:00Z",
    user: {
      display_name: "Fictional private member",
      email: "fictional-member@example.test",
      role: "team_member",
      is_active: true,
    },
  },
  inventoryPath = "/admin/teams?q=&state=current&page=1",
  detailPath = "/admin/teams/" + team.id,
  destinationPath = "/admin/teams?q=&pageSize=100";
let workspace: {
  team: typeof team;
  members: (typeof person)[];
  actions: { settings: boolean; manage: boolean; permissions: boolean };
  actorRole: string;
  permissions: never[];
  pages: never[];
  statistics: {
    activeMembers: number;
    activeLeads: number;
    membershipChanges: number;
  };
};
let read: (path: string) => unknown;
function defaults(path: string) {
  if (path.includes("pageSize=100"))
    return {
      items: [team, destination],
      total: 2,
      pageSize: 100,
      canCreate: true,
    };
  if (path.includes("/activity?"))
    return {
      items: [
        {
          id: "fictional-activity",
          action: "fixture.team_action",
          created_at: "2026-11-05T12:00:00Z",
        },
      ],
      total: 1,
    };
  if (path.includes("/transfers?")) return { items: [], total: 0 };
  if (path.startsWith("/admin/teams?"))
    return {
      items: [team, destination],
      total: 21,
      pageSize: 20,
      canCreate: true,
    };
  return workspace;
}
const pending = () => {
  let resolve!: (value: unknown) => void;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { resolve, promise };
};
const body = (initial = "/admin/team/" + team.id) => (
  <MemoryRouter initialEntries={[initial]}>
    <main id="workspace-content" tabIndex={-1}>
      <Routes>
        <Route path="/admin/team/:teamId" element={<TeamWorkspace />} />
        <Route path="/admin/teams" element={<TeamWorkspace />} />
      </Routes>
    </main>
  </MemoryRouter>
);
const writes = () =>
  apiMock.mock.calls.filter(([, options]) => options?.method);
beforeEach(() => {
  apiMock.mockReset();
  actor.id = "fictional-team-admin";
  actor.role = "admin";
  navigation.request.mockClear();
  workspace = {
    team: { ...team },
    members: [{ ...person }],
    actions: { settings: true, manage: true, permissions: true },
    actorRole: "admin",
    permissions: [],
    pages: [],
    statistics: { activeMembers: 1, activeLeads: 0, membershipChanges: 1 },
  };
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
describe("Independent team workspace private reads", () => {
  it("names initial directory loading without a false empty state", () => {
    read = () => pending().promise;
    render(body("/admin/teams"));
    expect(
      screen.getByRole("status", { name: "Loading team inventory" }),
    ).toBeTruthy();
    expect(screen.queryByText("No teams in this view")).toBeNull();
  });
  it("keeps selected detail visible when the independent directory fails and retries it in place", async () => {
    read = (path) => {
      if (path === inventoryPath)
        throw Error("Fictional team directory outage");
      return defaults(path);
    };
    render(body());
    await screen.findByText(person.user.email);
    const retry = await screen.findByRole("button", {
      name: "Retry team inventory",
    });
    const count = apiMock.mock.calls.filter(
      ([path]) => path === detailPath,
    ).length;
    read = defaults;
    fireEvent.click(retry);
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Retry team inventory" }),
      ).toBeNull(),
    );
    expect(
      apiMock.mock.calls.filter(([path]) => path === detailPath),
    ).toHaveLength(count);
    expect(document.activeElement?.id).toBe("workspace-content");
  });
  it("independently retries selected-team failure without pretending no team exists", async () => {
    read = (path) => {
      if (path === detailPath) throw Error("Fictional selected team outage");
      return defaults(path);
    };
    render(body());
    const retry = await screen.findByRole("button", {
      name: "Retry selected team",
    });
    expect(screen.queryByText("No teams in this view")).toBeNull();
    const count = apiMock.mock.calls.filter(
      ([path]) => path === inventoryPath,
    ).length;
    read = defaults;
    fireEvent.click(retry);
    await screen.findByText(person.user.email);
    expect(
      apiMock.mock.calls.filter(([path]) => path === inventoryPath),
    ).toHaveLength(count);
    expect(writes()).toHaveLength(0);
  });
  it("retains timestamped selected team and unsaved fields after a failed refresh while actions pause", async () => {
    render(body());
    fireEvent.click(
      await screen.findByRole("button", { name: "Edit details" }),
    );
    fireEvent.change(screen.getByLabelText(/^Team name/), {
      target: { value: "Fictional retained team input" },
    });
    read = (path) => {
      if (path === detailPath) throw Error("Fictional detail refresh outage");
      return defaults(path);
    };
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh selected team" }),
    );
    await screen.findByRole("button", { name: "Retry selected team" });
    expect(
      screen.getByDisplayValue("Fictional retained team input"),
    ).toBeTruthy();
    expect(screen.getByText(person.user.email)).toBeTruthy();
    expect(screen.getByText(/Last successful read/)).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Save team change" })
        .matches(":disabled"),
    ).toBe(true);
    expect(writes()).toHaveLength(0);
  });
  it("blocks writes when the team or edited membership revision changes without replacing input", async () => {
    render(body());
    fireEvent.click(
      await screen.findByRole("button", { name: "Change role", exact: true }),
    );
    workspace = { ...workspace, members: [{ ...person, revision: 2 }] };
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh selected team" }),
    );
    await screen.findByText(/The saved team or membership changed/);
    expect(
      screen
        .getByRole("button", { name: "Save team change" })
        .matches(":disabled"),
    ).toBe(true);
    expect(writes()).toHaveLength(0);
    fireEvent.click(
      screen.getByRole("button", { name: "Review closing stale team editor" }),
    );
    expect(navigation.request).toHaveBeenCalled();
  });
  it("shows a recoverable history failure without a false empty-history statement", async () => {
    read = (path) => {
      if (path.includes("/activity?")) throw Error("Fictional activity outage");
      return defaults(path);
    };
    render(body());
    fireEvent.click(
      await screen.findByRole("button", { name: "Activity", exact: true }),
    );
    const retry = await screen.findByRole("button", {
      name: "Retry team activity",
    });
    expect(screen.queryByText("No activity recorded.")).toBeNull();
    expect(screen.getByRole("heading", { name: team.name })).toBeTruthy();
    read = defaults;
    fireEvent.click(retry);
    await screen.findByText("Fixture.team action");
    expect(writes()).toHaveLength(0);
  });
  it("retains a stale history snapshot and disables paging after refresh failure", async () => {
    render(body());
    fireEvent.click(
      await screen.findByRole("button", { name: "Activity", exact: true }),
    );
    await screen.findByText("Fixture.team action");
    read = (path) => {
      if (path.includes("/activity?"))
        throw Error("Fictional history refresh outage");
      return defaults(path);
    };
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh team activity" }),
    );
    await screen.findByRole("button", { name: "Retry team activity" });
    expect(screen.getByText("Fixture.team action")).toBeTruthy();
    expect(
      within(screen.getByRole("navigation", { name: "Team history pages" }))
        .getByRole("button", { name: "Next" })
        .matches(":disabled"),
    ).toBe(true);
  });
  it("loads and retries transfer destinations independently and blocks a stale selection", async () => {
    read = (path) => {
      if (path === destinationPath)
        throw Error("Fictional destinations outage");
      return defaults(path);
    };
    render(body());
    fireEvent.click(
      await screen.findByRole("button", { name: "Transfer", exact: true }),
    );
    const retry = await screen.findByRole("button", {
      name: "Retry destination teams",
    });
    expect(
      screen.getByLabelText(/^Destination team/).matches(":disabled"),
    ).toBe(true);
    read = defaults;
    fireEvent.click(retry);
    await screen.findByRole("option", { name: destination.name });
    fireEvent.change(screen.getByLabelText(/^Destination team/), {
      target: { value: destination.id },
    });
    read = (path) => {
      if (path === destinationPath)
        throw Error("Fictional destination refresh outage");
      return defaults(path);
    };
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh destination teams" }),
    );
    await screen.findByRole("button", { name: "Retry destination teams" });
    expect(
      (screen.getByLabelText(/^Destination team/) as HTMLSelectElement).value,
    ).toBe(destination.id);
    expect(
      screen
        .getByRole("button", { name: "Save team change" })
        .matches(":disabled"),
    ).toBe(true);
    expect(writes()).toHaveLength(0);
  });
  it.each([
    inventoryPath,
    detailPath,
    detailPath + "/activity?page=1",
    destinationPath,
  ])("clears private team state on denial of %s", async (deniedPath) => {
    render(body());
    await screen.findByText(person.user.email);
    if (deniedPath.includes("activity"))
      fireEvent.click(
        screen.getByRole("button", { name: "Activity", exact: true }),
      );
    if (deniedPath === destinationPath)
      fireEvent.click(
        screen.getByRole("button", { name: "Transfer", exact: true }),
      );
    read = (path) => {
      if (path === deniedPath)
        throw new ApiFailure(403, "FORBIDDEN", "Current access unavailable");
      return defaults(path);
    };
    const refresh =
      deniedPath === inventoryPath
        ? "Refresh team inventory"
        : deniedPath === detailPath
          ? "Refresh selected team"
          : deniedPath === destinationPath
            ? "Refresh destination teams"
            : "Refresh team activity";
    fireEvent.click(await screen.findByRole("button", { name: refresh }));
    await screen.findByText("Team access needs to be rechecked");
    expect(screen.queryByText(person.user.email)).toBeNull();
    expect(screen.queryByLabelText(/^Your current password/)).toBeNull();
    read = defaults;
    fireEvent.click(
      screen.getByRole("button", { name: "Recheck team access" }),
    );
    await screen.findByRole("button", { name: "Open " + team.name });
    expect(writes()).toHaveLength(0);
  });
  it.each(["id", "role", "session"])(
    "isolates team input and cancels private reads after %s replacement",
    async (kind) => {
      const view = render(body());
      fireEvent.click(
        await screen.findByRole("button", { name: "Edit details" }),
      );
      fireEvent.change(screen.getByLabelText(/^Team name/), {
        target: { value: "Fictional old account draft" },
      });
      const delayed = pending();
      read = (path) => (path === detailPath ? delayed.promise : defaults(path));
      fireEvent.click(
        screen.getByRole("button", { name: "Refresh selected team" }),
      );
      const signal = apiMock.mock.calls.findLast(
        ([path]) => path === detailPath,
      )![1].signal;
      read = defaults;
      if (kind === "session")
        act(() => window.dispatchEvent(new Event("gdg:session-cleared")));
      else {
        actor[kind] = "replacement";
        view.rerender(body());
      }
      await screen.findByText(person.user.email);
      expect(signal.aborted).toBe(true);
      expect(
        screen.queryByDisplayValue("Fictional old account draft"),
      ).toBeNull();
      await act(async () =>
        delayed.resolve({
          ...workspace,
          team: { ...team, name: "Late private team" },
        }),
      );
      expect(screen.queryByText("Late private team")).toBeNull();
    },
  );
  it("keeps an announcement draft mounted but disabled during parent read failure", async () => {
    render(body());
    fireEvent.click(
      await screen.findByRole("button", { name: "Announcements", exact: true }),
    );
    const input = screen.getByRole("textbox", {
      name: "Fictional announcement draft",
    }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Fictional unsent post" } });
    read = (path) => {
      if (path === detailPath) throw Error("Fictional parent outage");
      return defaults(path);
    };
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh selected team" }),
    );
    await screen.findByRole("button", { name: "Retry selected team" });
    expect(input.value).toBe("Fictional unsent post");
    expect(input.matches(":disabled")).toBe(true);
    expect(writes()).toHaveLength(0);
  });
  it("keeps an invitation draft mounted but disabled while current team reads pause", async () => {
    render(body());
    fireEvent.click(
      await screen.findByRole("button", { name: "Invitations", exact: true }),
    );
    const input = screen.getByRole("textbox", {
      name: "Fictional unsent invitation",
    }) as HTMLInputElement;
    fireEvent.change(input, {
      target: { value: "fictional-unsent@example.test" },
    });
    read = (path) => {
      if (path === detailPath) throw Error("Fictional parent outage");
      return defaults(path);
    };
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh selected team" }),
    );
    await screen.findByRole("button", { name: "Retry selected team" });
    expect(input.value).toBe("fictional-unsent@example.test");
    expect(input.matches(":disabled")).toBe(true);
    expect(writes()).toHaveLength(0);
  });
  it("hides a replaced directory page and ignores an old inventory response", async () => {
    render(body("/admin/teams"));
    await screen.findByRole("button", { name: "Open " + team.name });
    const delayed = pending();
    read = () => delayed.promise;
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh team inventory" }),
    );
    const signal = apiMock.mock.calls.at(-1)![1].signal;
    read = () => ({
      items: [destination],
      total: 21,
      pageSize: 20,
      canCreate: true,
    });
    fireEvent.change(screen.getByRole("searchbox", { name: "Search teams" }), {
      target: { value: "destination" },
    });
    expect(
      screen.queryByRole("button", { name: "Open " + team.name }),
    ).toBeNull();
    await screen.findByRole("button", { name: "Open " + destination.name });
    expect(signal.aborted).toBe(true);
    await act(async () => delayed.resolve(defaults(inventoryPath)));
    expect(
      screen.queryByRole("button", { name: "Open " + team.name }),
    ).toBeNull();
  });
  it("retains offline team input, disables writes and reconnect does not submit", async () => {
    render(body());
    fireEvent.click(
      await screen.findByRole("button", { name: "Edit details" }),
    );
    fireEvent.change(screen.getByLabelText(/^Team name/), {
      target: { value: "Fictional offline draft" },
    });
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    act(() => window.dispatchEvent(new Event("offline")));
    expect(screen.getByDisplayValue("Fictional offline draft")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Save team change" })
        .matches(":disabled"),
    ).toBe(true);
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    act(() => window.dispatchEvent(new Event("online")));
    expect(writes()).toHaveLength(0);
  });
});
