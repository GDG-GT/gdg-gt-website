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
let write: (
  path: string,
  options: { body: { record?: Record<string, unknown>; action?: string } },
) => Promise<unknown>;
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
  <MemoryRouter
    initialEntries={[initial]}
    future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
  >
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
  write = async (_path, options) => {
    workspace = {
      ...workspace,
      team: {
        ...workspace.team,
        ...(options.body.record || {}),
        revision: workspace.team.revision + 1,
      },
    };
    return workspace;
  };
  apiMock.mockImplementation((path, options) =>
    options?.method
      ? write(path, options)
      : Promise.resolve().then(() => read(path)),
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
async function editTeam() {
  fireEvent.click(await screen.findByRole("button", { name: "Edit details" }));
}
async function reviewSave() {
  fireEvent.change(screen.getByLabelText(/^Confirm your own password/), {
    target: { value: "Fictional team password" },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "Save team change" }).closest("form")!,
  );
  await screen.findByRole("dialog");
}
describe("Reviewed team mutation recovery", () => {
  it("reviews saved team identity/details before submitting an edit", async () => {
    render(body());
    await editTeam();
    fireEvent.change(screen.getByLabelText(/^Team name/), {
      target: { value: "Fictional revised team" },
    });
    await reviewSave();
    expect(screen.getByRole("dialog").textContent).toContain(team.name);
    expect(screen.getByRole("dialog").textContent).toContain(
      "Fictional revised team",
    );
    expect(writes()).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.getByDisplayValue("Fictional revised team")).toBeTruthy();
    expect(writes()).toHaveLength(0);
  });
  it("freezes pending team input, admits one write and blocks closing its review", async () => {
    const delayed = pending();
    write = () => delayed.promise;
    render(body());
    await editTeam();
    await reviewSave();
    const confirm = screen.getByRole("button", { name: "Confirm team change" });
    act(() => {
      fireEvent.click(confirm);
      fireEvent.click(confirm);
    });
    expect(writes()).toHaveLength(1);
    expect(screen.getByLabelText(/^Team name/).matches(":disabled")).toBe(true);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Keep editing" }).matches(":disabled"),
    ).toBe(true);
    await act(async () =>
      delayed.resolve({ ...workspace, team: { ...team, revision: 2 } }),
    );
    await screen.findByText("Edit team details confirmed by the server.");
    expect(writes()[0][1]).toMatchObject({
      protected: true,
      idempotencyKey: expect.any(String),
      signal: expect.any(AbortSignal),
    });
  });
  it("returns a dismissed review to the actual submitting control", async () => {
    render(body());
    await editTeam();
    const password = screen.getByLabelText(/^Confirm your own password/);
    fireEvent.change(password, { target: { value: "Fictional proof" } });
    password.focus();
    const save = screen.getByRole("button", { name: "Save team change" }),
      submission = new Event("submit", { bubbles: true, cancelable: true });
    Object.defineProperty(submission, "submitter", { value: save });
    fireEvent(save.closest("form")!, submission);
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    await waitFor(() => expect(document.activeElement).toBe(save));
  });
  it("retains password-free uncertain intent, rechecks read-only and explicitly replays with fresh proof", async () => {
    let first = true;
    write = async () => {
      if (first) {
        first = false;
        throw Error("Fictional lost team receipt");
      }
      return { ...workspace, team: { ...team, revision: 2 } };
    };
    render(body());
    await editTeam();
    await reviewSave();
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm team change" }),
    );
    await screen.findByRole("button", { name: "Recheck saved team values" });
    expect(
      (screen.getByLabelText(/^Current password for retry/) as HTMLInputElement)
        .value,
    ).toBe("");
    expect(
      screen
        .getByRole("button", { name: "Retry original team operation" })
        .matches(":disabled"),
    ).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Recheck saved team values" }),
    );
    await screen.findByText("Inspect current saved team and memberships");
    expect(writes()).toHaveLength(1);
    fireEvent.change(screen.getByLabelText(/^Current password for retry/), {
      target: { value: "Fictional fresh team proof" },
    });
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Retry original team operation" })
          .matches(":disabled"),
      ).toBe(false),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Retry original team operation" }),
    );
    await screen.findByText("Edit team details confirmed by the server.");
    const { currentPassword: firstProof, ...firstBody } = writes()[0][1].body,
      { currentPassword: secondProof, ...secondBody } = writes()[1][1].body;
    expect(firstProof).not.toBe(secondProof);
    expect(secondBody).toEqual(firstBody);
    expect(writes()[1][1].idempotencyKey).toBe(writes()[0][1].idempotencyKey);
  });
  it("refuses expired replay and reviews abandoning a possibly completed operation", async () => {
    const startedAt = Date.now();
    write = async () => {
      throw Error("Fictional old lost receipt");
    };
    render(body());
    await editTeam();
    await reviewSave();
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm team change" }),
    );
    await screen.findByRole("button", { name: "Recheck saved team values" });
    vi.spyOn(Date, "now").mockReturnValue(startedAt + 48 * 60 * 60 * 1000);
    fireEvent.click(
      screen.getByRole("button", { name: "Recheck saved team values" }),
    );
    await screen.findByText("Inspect current saved team and memberships");
    fireEvent.change(screen.getByLabelText(/^Current password for retry/), {
      target: { value: "Fictional fresh proof" },
    });
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Retry original team operation" })
          .matches(":disabled"),
      ).toBe(false),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Retry original team operation" }),
    );
    await screen.findByText(/The safe retry window ended/, {
      selector: "[role=alert]",
    });
    expect(writes()).toHaveLength(1);
    fireEvent.click(
      screen.getByRole("button", { name: "Review abandoning team recovery" }),
    );
    expect(screen.getByRole("dialog").textContent).toContain(
      "may already have completed",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Abandon team recovery" }),
    );
    expect(
      screen.queryByRole("button", { name: "Retry original team operation" }),
    ).toBeNull();
  });
  it("keeps password validation within the review and can accept corrected proof without closing it", async () => {
    let first = true;
    write = async () => {
      if (first) {
        first = false;
        throw new ApiFailure(
          403,
          "PASSWORD_CONFIRMATION_FAILED",
          "Fictional wrong password",
        );
      }
      return workspace;
    };
    render(body());
    await editTeam();
    await reviewSave();
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm team change" }),
    );
    await screen.findByText("Fictional wrong password", {
      selector: "[role=alert]",
    });
    const proof = screen.getByLabelText(
      /^Confirm your password again/,
    ) as HTMLInputElement;
    expect(proof.value).toBe("");
    expect(proof.getAttribute("aria-invalid")).toBe("true");
    fireEvent.change(proof, { target: { value: "Fictional corrected proof" } });
    expect(screen.getByLabelText(/^Confirm your password again/)).toBe(proof);
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm team change" }),
    );
    await screen.findByText("Edit team details confirmed by the server.");
  });
  it.each([401, 403, 404])(
    "clears every private field/review after %i write denial",
    async (status) => {
      write = async () => {
        throw new ApiFailure(
          status,
          "FORBIDDEN",
          "Current team access unavailable",
        );
      };
      render(body());
      await editTeam();
      await reviewSave();
      fireEvent.click(
        screen.getByRole("button", { name: "Confirm team change" }),
      );
      await screen.findByText("Team access needs to be rechecked");
      expect(screen.queryByDisplayValue("Fictional team password")).toBeNull();
      expect(screen.queryByText(person.user.email)).toBeNull();
      expect(screen.queryByRole("dialog")).toBeNull();
      fireEvent.click(
        screen.getByRole("button", { name: "Recheck team access" }),
      );
      await screen.findByRole("button", { name: "Open " + team.name });
    },
  );
  it.each(["id", "role", "session"])(
    "cancels team writes and fences late receipts after %s replacement",
    async (kind) => {
      const delayed = pending();
      write = () => delayed.promise;
      const view = render(body());
      await editTeam();
      await reviewSave();
      fireEvent.click(
        screen.getByRole("button", { name: "Confirm team change" }),
      );
      const signal = writes()[0][1].signal;
      if (kind === "session")
        act(() => window.dispatchEvent(new Event("gdg:session-cleared")));
      else {
        actor[kind] = "replacement";
        view.rerender(body());
      }
      await waitFor(() => expect(signal.aborted).toBe(true));
      await act(async () => delayed.resolve(workspace));
      expect(
        screen.queryByText("Edit team details confirmed by the server."),
      ).toBeNull();
      expect(screen.queryByRole("dialog")).toBeNull();
    },
  );
  it("invalidates an open team review after a newer saved revision arrives", async () => {
    render(body());
    await editTeam();
    await reviewSave();
    workspace = { ...workspace, team: { ...team, revision: 2 } };
    fireEvent.click(
      screen.getByRole("button", {
        name: "Refresh selected team",
        hidden: true,
      }),
    );
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Confirm team change" })
          .matches(":disabled"),
      ).toBe(true),
    );
    expect(writes()).toHaveLength(0);
  });
  it("names member removal identity and immediate access consequence", async () => {
    render(body());
    fireEvent.click(
      await screen.findByRole("button", { name: "Remove", exact: true }),
    );
    await reviewSave();
    expect(screen.getByRole("dialog").textContent).toContain(person.user.email);
    expect(screen.getByRole("dialog").textContent).toContain(
      "Team-derived access ends immediately",
    );
    expect(writes()).toHaveLength(0);
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm team change" }),
    );
    await screen.findByText("Remove team membership confirmed by the server.");
    expect(writes()[0][1].body).toMatchObject({
      action: "member_remove",
      membershipId: person.id,
      membershipRevision: 1,
      revision: 1,
    });
  });
  it("reviews transfer source/destination, member identity and loss of officer privileges", async () => {
    render(body());
    fireEvent.click(
      await screen.findByRole("button", { name: "Transfer", exact: true }),
    );
    await screen.findByRole("option", { name: destination.name });
    fireEvent.change(screen.getByLabelText(/^Destination team/), {
      target: { value: destination.id },
    });
    fireEvent.change(screen.getByLabelText(/^Transfer reason/), {
      target: { value: "Fictional reviewed transfer" },
    });
    await reviewSave();
    expect(screen.getByRole("dialog").textContent).toContain(destination.name);
    expect(screen.getByRole("dialog").textContent).toContain(person.user.email);
    expect(screen.getByRole("dialog").textContent).toContain(
      "Officer privileges are not inherited",
    );
    expect(writes()).toHaveLength(0);
  });
  it("keeps typed target review for archive and submits only after matching the team name", async () => {
    render(body());
    fireEvent.click(
      await screen.findByRole("button", { name: "Archive team", exact: true }),
    );
    expect(
      screen
        .getByRole("button", { name: "Save team change" })
        .matches(":disabled"),
    ).toBe(true);
    fireEvent.change(screen.getByLabelText(/^Type the complete team name/), {
      target: { value: team.name },
    });
    await reviewSave();
    expect(screen.getByRole("dialog").textContent).toContain(
      "disable its page grants",
    );
    expect(writes()).toHaveLength(0);
  });
  it("shows the exact current/proposed page grant sets before access replacement", async () => {
    render(body());
    fireEvent.click(
      await screen.findByRole("button", { name: "Permissions", exact: true }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Review & change grants" }),
    );
    fireEvent.change(screen.getByLabelText(/^Type the complete team name/), {
      target: { value: team.name },
    });
    await reviewSave();
    expect(screen.getByRole("dialog").textContent).toContain("Current grants:");
    expect(screen.getByRole("dialog").textContent).toContain(
      "Proposed grants:",
    );
    expect(screen.getByRole("dialog").textContent).toContain(
      "Sensitive grants control response/export/publication",
    );
    expect(writes()).toHaveLength(0);
  });
  it("does not submit offline input when connectivity returns", async () => {
    render(body());
    await editTeam();
    fireEvent.change(screen.getByLabelText(/^Team name/), {
      target: { value: "Fictional offline team" },
    });
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    act(() => window.dispatchEvent(new Event("offline")));
    fireEvent.submit(
      screen.getByRole("button", { name: "Save team change" }).closest("form")!,
    );
    expect(writes()).toHaveLength(0);
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    act(() => window.dispatchEvent(new Event("online")));
    expect(writes()).toHaveLength(0);
    expect(screen.getByDisplayValue("Fictional offline team")).toBeTruthy();
  });
});
