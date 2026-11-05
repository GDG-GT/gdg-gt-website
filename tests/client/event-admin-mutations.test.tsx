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
import { MemoryRouter } from "react-router-dom";
import EventWorkspace from "../../src/ui/EventWorkspace";
import { ApiFailure } from "../../src/lib/api";
import type { ChapterEvent } from "../../src/ui/events";
const { apiMock, actor, guard } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  guard: vi.fn(),
  actor: { id: "fictional-events-officer", role: "admin" },
}));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: apiMock,
}));
vi.mock("@/contexts/AdminContext", () => ({
  useAdmin: () => ({ currentAdmin: actor, userTeams: [] }),
}));
vi.mock("@/hooks/useDraftGuard", () => ({
  useDraftGuard: guard,
  useNavigationSafety: () => undefined,
}));
vi.mock("../../src/ui/forms/FormIntegrations", () => ({
  default: () => <p>Fictional scoped form controls</p>,
}));
vi.mock("../../src/ui/EventMailPanel", () => ({
  default: function FictionalMail({ disabled }: { disabled?: boolean }) {
    const [value, setValue] = React.useState("");
    return (
      <textarea
        aria-label="Fictional unsent event mail"
        disabled={disabled}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
    );
  },
}));
function event(
  id = "fictional-event",
  title = "Fictional private event",
): ChapterEvent & { actions: string[]; canExport: boolean; canEmail: boolean } {
  return {
    id,
    title,
    slug: id,
    short_description: "Fictional private workshop",
    description: "A fictional private workshop for read verification.",
    start_at: "2099-11-05T18:00:00Z",
    end_at: "2099-11-05T20:00:00Z",
    timezone: "America/New_York",
    location: "Fictional room",
    type: "Workshop",
    level: "beginner",
    registration_type: "internal",
    registration_enabled: true,
    publication_status: "draft",
    max_participants: 20,
    external_attendees: 0,
    is_featured: false,
    team_id: null,
    revision: 1,
    created_at: "2026-11-05T12:00:00Z",
    updated_at: "2026-11-05T12:00:00Z",
    actions: ["read", "create", "update", "delete", "publish"],
    canExport: true,
    canEmail: true,
  };
}
const person = {
  id: "fictional-registration",
  attendee_name: "Fictional private attendee",
  attendee_email: "fictional-attendee@example.test",
  notes: "Private fixture note",
  attended: false,
  registration_date: "2026-11-05T12:00:00Z",
  updated_at: "2026-11-05T12:00:00Z",
};
const inventoryPath = "/admin/events?page=1",
  detailPath = "/admin/events/fictional-event",
  attendeesPath = detailPath + "/attendees?page=1";
let current = event(),
  inventoryTotal = 1;
let read: (path: string) => unknown;
let write: (
  path: string,
  options: {
    body?: { event?: Partial<ChapterEvent> };
    method?: string;
    signal?: AbortSignal;
  },
) => Promise<unknown>;
function defaults(path: string) {
  if (path.includes("/attendees?")) return { items: [person], total: 1 };
  if (path.includes("/events?"))
    return {
      items: [current],
      total: inventoryTotal,
      capabilities: { globalCreate: true, teams: [] },
    };
  return { event: current };
}
function pending() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const body = () => (
  <MemoryRouter>
    <main id="workspace-content" tabIndex={-1}>
      <EventWorkspace />
    </main>
  </MemoryRouter>
);
const writes = () =>
  apiMock.mock.calls.filter(([, options]) => options?.method);
async function edit() {
  fireEvent.click(
    await screen.findByRole("button", { name: "Edit", exact: true }),
  );
  await screen.findByRole("heading", { name: "Edit event" });
}
async function attendance() {
  fireEvent.click(
    await screen.findByRole("button", { name: "Attendance", exact: true }),
  );
  await screen.findByRole("heading", { name: "Registrations & attendance" });
}
beforeEach(() => {
  apiMock.mockReset();
  actor.id = "fictional-events-officer";
  actor.role = "admin";
  current = event();
  inventoryTotal = 1;
  read = defaults;
  guard.mockClear();
  write = async (path, options) => {
    if (path.includes("/attendees/")) return { updated: true };
    current = {
      ...current,
      ...options.body?.event,
      revision: current.revision + 1,
    };
    return { event: current };
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
describe("Event mutation recovery and consequence review", () => {
  it("retains an open mail draft while event/attendee reads are unavailable or offline", async () => {
    render(body());
    await attendance();
    fireEvent.click(
      await screen.findByRole("button", { name: "Email registered attendees" }),
    );
    const message = screen.getByRole("textbox", {
      name: "Fictional unsent event mail",
    }) as HTMLTextAreaElement;
    fireEvent.change(message, {
      target: { value: "Fictional retained mail draft" },
    });
    read = (path) => {
      if (path === attendeesPath) throw Error("Temporary audience outage");
      return defaults(path);
    };
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh event attendees" }),
    );
    await screen.findByRole("button", { name: "Retry event attendees" });
    expect(message.value).toBe("Fictional retained mail draft");
    expect(message.matches(":disabled")).toBe(true);
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    act(() => window.dispatchEvent(new Event("offline")));
    expect(
      screen.getByRole("textbox", { name: "Fictional unsent event mail" }),
    ).toBe(message);
    expect(message.value).toBe("Fictional retained mail draft");
    expect(writes()).toHaveLength(0);
  });
  it("reviews the immediate public consequence before saving a published event", async () => {
    current = { ...current, publication_status: "published" };
    render(body());
    await edit();
    fireEvent.change(screen.getByLabelText(/^Event title/), {
      target: { value: "Fictional updated public title" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save published changes" }),
    );
    expect(screen.getByRole("dialog").textContent).toContain(
      "immediately on the public event page",
    );
    expect(writes()).toHaveLength(0);
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm", exact: true }),
    );
    await screen.findByText("Event save confirmed by the server.");
    expect(writes()).toHaveLength(1);
  });
  it("uses current capabilities for create and selected action affordances", async () => {
    read = (path) =>
      path === inventoryPath
        ? {
            items: [current],
            total: 1,
            capabilities: { globalCreate: false, teams: [] },
          }
        : {
            event: {
              ...current,
              actions: ["read"],
              canExport: false,
              canEmail: false,
            },
          };
    render(body());
    await screen.findByRole("button", { name: "Edit", exact: true });
    expect(
      screen.getByRole("button", { name: "Create event" }).matches(":disabled"),
    ).toBe(true);
    await edit();
    expect(
      screen
        .getByRole("button", { name: "Save draft changes" })
        .matches(":disabled"),
    ).toBe(true);
    for (const name of ["Publish", "Duplicate", "Cancel event", "Archive"])
      expect(
        screen.getByRole("button", { name, exact: true }).matches(":disabled"),
      ).toBe(true);
    expect(writes()).toHaveLength(0);
  });
  it("refuses an expired recovery write and reviews abandoning its retained intent", async () => {
    write = async () => {
      throw Error("Unconfirmed old save");
    };
    const startedAt = Date.now();
    render(body());
    await edit();
    fireEvent.submit(screen.getByLabelText(/^Event title/).closest("form")!);
    await screen.findByRole("button", { name: "Retry original operation" });
    vi.spyOn(Date, "now").mockReturnValue(startedAt + 48 * 60 * 60 * 1000);
    fireEvent.click(
      screen.getByRole("button", { name: "Recheck saved event data" }),
    );
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Retry original operation" })
          .matches(":disabled"),
      ).toBe(false),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Retry original operation" }),
    );
    await screen.findByText(/The safe retry window ended/);
    expect(writes()).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "All events" }));
    expect(screen.getByRole("dialog").textContent).toContain(
      "original operation may already have completed",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm", exact: true }),
    );
    await screen.findByRole("heading", { name: "Events", exact: true });
    expect(
      screen.queryByRole("button", { name: "Retry original operation" }),
    ).toBeNull();
    expect(writes()).toHaveLength(1);
  });
  it("defaults a team member's new draft to a currently permitted team", async () => {
    read = (path) =>
      path === inventoryPath
        ? {
            items: [],
            total: 0,
            capabilities: {
              globalCreate: false,
              teams: [
                { id: "fictional-team", name: "Fictional permitted team" },
              ],
            },
          }
        : defaults(path);
    render(body());
    fireEvent.click(
      await screen.findByRole("button", { name: "Create event" }),
    );
    expect(
      (screen.getByLabelText("Owning team") as HTMLInputElement).value,
    ).toBe("fictional-team");
    expect(screen.queryByRole("option", { name: "Chapter-wide" })).toBeNull();
  });
  it("freezes inputs and synchronously admits only one save until its receipt", async () => {
    const delayed = pending();
    write = () => delayed.promise;
    render(body());
    await edit();
    const title = screen.getByLabelText(/^Event title/);
    fireEvent.change(title, { target: { value: "Fictional saved title" } });
    const form = title.closest("form")!;
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    expect(writes()).toHaveLength(1);
    expect(title.matches(":disabled")).toBe(true);
    expect(screen.queryByText(/confirmed by the server/)).toBeNull();
    await act(async () =>
      delayed.resolve({
        event: { ...current, title: "Fictional saved title", revision: 2 },
      }),
    );
    expect(
      await screen.findByText("Event save confirmed by the server."),
    ).toBeTruthy();
    expect(writes()[0][1]).toMatchObject({
      protected: true,
      method: "PATCH",
      idempotencyKey: expect.any(String),
      signal: expect.any(AbortSignal),
    });
  });
  it("preserves invalid fields and associates server errors with their input", async () => {
    write = async () => {
      throw new ApiFailure(400, "VALIDATION_ERROR", "Choose a later end.", {
        end_at: "End must be later.",
      });
    };
    render(body());
    await edit();
    fireEvent.submit(screen.getByLabelText(/^Event title/).closest("form")!);
    const error = await screen.findByText("End must be later.");
    expect(
      screen.getByLabelText(/^End \(UTC\)/).getAttribute("aria-describedby"),
    ).toBe(error.id);
    expect(
      screen.getByLabelText(/^End \(UTC\)/).getAttribute("aria-invalid"),
    ).toBe("true");
    fireEvent.change(screen.getByLabelText(/^End \(UTC\)/), {
      target: { value: "2099-11-05T21:00" },
    });
    expect(screen.queryByText("End must be later.")).toBeNull();
  });
  it("rechecks a lost save read-only before explicit replay with the identical key and body", async () => {
    let dropped = true;
    write = async () => {
      if (dropped) {
        dropped = false;
        throw new Error("Connection lost after commit");
      }
      return { event: { ...current, revision: 2 } };
    };
    render(body());
    await edit();
    fireEvent.change(screen.getByLabelText(/^Event title/), {
      target: { value: "Fictional retained draft" },
    });
    fireEvent.submit(screen.getByLabelText(/^Event title/).closest("form")!);
    expect(
      (
        await screen.findByRole("button", { name: "Retry original operation" })
      ).matches(":disabled"),
    ).toBe(true);
    expect(
      (screen.getByLabelText(/^Event title/) as HTMLInputElement).value,
    ).toBe("Fictional retained draft");
    fireEvent.click(
      screen.getByRole("button", { name: "Recheck saved event data" }),
    );
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Retry original operation" })
          .matches(":disabled"),
      ).toBe(false),
    );
    expect(writes()).toHaveLength(1);
    fireEvent.click(
      screen.getByRole("button", { name: "Retry original operation" }),
    );
    await screen.findByText("Event save confirmed by the server.");
    expect(writes()).toHaveLength(2);
    expect(writes()[1][1].idempotencyKey).toBe(writes()[0][1].idempotencyKey);
    expect(writes()[1][1].body).toEqual(writes()[0][1].body);
  });
  it.each([401, 403, 404])(
    "clears all private draft fields after a %i write denial",
    async (status) => {
      write = async () => {
        throw new ApiFailure(status, "FORBIDDEN", "Current access unavailable");
      };
      render(body());
      await edit();
      fireEvent.submit(screen.getByLabelText(/^Event title/).closest("form")!);
      await screen.findByText("Event access needs to be rechecked");
      expect(screen.queryByDisplayValue(current.title)).toBeNull();
      expect(screen.queryByText(current.title)).toBeNull();
      fireEvent.click(
        screen.getByRole("button", { name: "Recheck event access" }),
      );
      await screen.findByRole("button", { name: "Edit", exact: true });
      expect(
        screen.getByRole("heading", { name: "Events", exact: true }),
      ).toBeTruthy();
    },
  );
  it.each(["id", "role", "session"])(
    "cancels a pending save and fences its late receipt after %s replacement",
    async (kind) => {
      const delayed = pending();
      write = () => delayed.promise;
      const view = render(body());
      await edit();
      fireEvent.submit(screen.getByLabelText(/^Event title/).closest("form")!);
      const signal = writes()[0][1].signal;
      if (kind === "session")
        act(() => window.dispatchEvent(new Event("gdg:session-cleared")));
      else {
        actor[kind] = "replacement";
        view.rerender(body());
      }
      await waitFor(() => expect(signal.aborted).toBe(true));
      await act(async () =>
        delayed.resolve({ event: { ...current, title: "Stale receipt" } }),
      );
      expect(
        screen.queryByText("Event save confirmed by the server."),
      ).toBeNull();
      expect(screen.queryByDisplayValue("Stale receipt")).toBeNull();
    },
  );
  it("requires a named publication review and cancels without a write", async () => {
    render(body());
    await edit();
    fireEvent.click(
      screen.getByRole("button", { name: "Publish", exact: true }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain(
      "Make Fictional private event visible publicly",
    );
    expect(writes()).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(writes()).toHaveLength(0);
  });
  it("requires the target slug for archive and keeps a pending review open", async () => {
    const delayed = pending();
    write = () => delayed.promise;
    render(body());
    await edit();
    fireEvent.click(
      screen.getByRole("button", { name: "Archive", exact: true }),
    );
    expect(screen.getByRole("dialog").textContent).toContain(current.title);
    expect(
      screen
        .getByRole("button", { name: "Confirm", exact: true })
        .matches(":disabled"),
    ).toBe(true);
    fireEvent.change(screen.getByLabelText("Type the event slug to confirm"), {
      target: { value: current.slug },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm", exact: true }),
    );
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Keep editing" }).matches(":disabled"),
    ).toBe(true);
    await act(async () =>
      delayed.resolve({
        event: { ...current, publication_status: "archived", revision: 2 },
      }),
    );
    await screen.findByText("Event archive confirmed by the server.");
  });
  it("blocks a reviewed action when the saved revision changes", async () => {
    render(body());
    await edit();
    fireEvent.click(
      screen.getByRole("button", { name: "Publish", exact: true }),
    );
    current = { ...current, revision: 2 };
    // A completed background read must invalidate a review of revision 1.
    fireEvent.click(
      screen.getByRole("button", {
        name: "Refresh selected event",
        hidden: true,
      }),
    );
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Confirm", exact: true })
          .matches(":disabled"),
      ).toBe(true),
    );
    expect(writes()).toHaveLength(0);
  });
  it("keeps offline event input and reconnect does not submit it", async () => {
    render(body());
    await edit();
    fireEvent.change(screen.getByLabelText(/^Event title/), {
      target: { value: "Fictional offline draft" },
    });
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    act(() => window.dispatchEvent(new Event("offline")));
    fireEvent.submit(screen.getByLabelText(/^Event title/).closest("form")!);
    expect(writes()).toHaveLength(0);
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    act(() => window.dispatchEvent(new Event("online")));
    expect(
      (screen.getByLabelText(/^Event title/) as HTMLInputElement).value,
    ).toBe("Fictional offline draft");
    expect(writes()).toHaveLength(0);
  });
  it("tracks attendee edits without blur writes and reviews their discard", async () => {
    render(body());
    await attendance();
    const notes = await screen.findByRole("textbox", {
      name: "Notes for " + person.attendee_name,
    });
    fireEvent.change(notes, { target: { value: "Fictional unsaved note" } });
    fireEvent.blur(notes);
    expect(writes()).toHaveLength(0);
    expect(guard.mock.calls.at(-1)?.[0]).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "All events" }));
    expect(screen.getByRole("dialog").textContent).toContain(
      "attendee input will be discarded",
    );
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect((notes as HTMLInputElement).value).toBe("Fictional unsaved note");
  });
  it("saves attendee corrections with the observed timestamp and a retry identity", async () => {
    render(body());
    await attendance();
    fireEvent.change(
      await screen.findByRole("textbox", {
        name: "Notes for " + person.attendee_name,
      }),
      { target: { value: "Fictional edited note" } },
    );
    const button = screen.getByRole("button", {
      name: "Save attendee changes",
      hidden: true,
    });
    fireEvent.submit(button.closest("form")!);
    await screen.findByText("Attendee update confirmed by the server.");
    expect(writes()[0][1]).toMatchObject({
      idempotencyKey: expect.any(String),
      body: { notes: "Fictional edited note", updatedAt: person.updated_at },
    });
  });
  it("names a registration and seat consequence before removal", async () => {
    render(body());
    await attendance();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Remove registration",
        hidden: true,
      }),
    );
    expect(screen.getByRole("dialog").textContent).toContain(
      person.attendee_name,
    );
    expect(screen.getByRole("dialog").textContent).toContain(
      "no longer occupy a seat",
    );
    expect(writes()).toHaveLength(0);
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm", exact: true }),
    );
    await screen.findByText("Registration removal confirmed by the server.");
    expect(writes()[0][1]).toMatchObject({
      method: "DELETE",
      body: { updatedAt: person.updated_at },
    });
  });
  it("keeps uncertain publication recovery inside its open review and replays identical intent", async () => {
    let first = true;
    write = async () => {
      if (first) {
        first = false;
        throw Error("Lost publication receipt");
      }
      return {
        event: { ...current, revision: 2, publication_status: "published" },
      };
    };
    render(body());
    await edit();
    fireEvent.click(
      screen.getByRole("button", { name: "Publish", exact: true }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm", exact: true }),
    );
    await screen.findByText(/Lost publication receipt/, {
      selector: "#event-review-feedback",
    });
    expect(
      screen
        .getByRole("dialog")
        .contains(
          screen.getByRole("button", { name: "Recheck saved event data" }),
        ),
    ).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Recheck saved event data" }),
    );
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Retry original operation" })
          .matches(":disabled"),
      ).toBe(false),
    );
    expect(writes()).toHaveLength(1);
    fireEvent.click(
      screen.getByRole("button", { name: "Retry original operation" }),
    );
    await screen.findByText("Event publish confirmed by the server.");
    expect(writes()[1][1].idempotencyKey).toBe(writes()[0][1].idempotencyKey);
    expect(writes()[1][1].body).toEqual(writes()[0][1].body);
  });
  it("retains an old attendee draft when a refreshed registration changed and requires discard", async () => {
    render(body());
    await attendance();
    const notes = await screen.findByRole("textbox", {
      name: "Notes for " + person.attendee_name,
    });
    fireEvent.change(notes, { target: { value: "Fictional retained note" } });
    read = (path) =>
      path === attendeesPath
        ? {
            items: [
              {
                ...person,
                notes: "New saved note",
                updated_at: "2026-11-05T13:00:00Z",
              },
            ],
            total: 1,
          }
        : defaults(path);
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh event attendees" }),
    );
    await screen.findByText(/This registration changed/);
    expect((notes as HTMLInputElement).value).toBe("Fictional retained note");
    expect(
      screen
        .getByRole("button", { name: "Save attendee changes", hidden: true })
        .matches(":disabled"),
    ).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Discard attendee edits" }),
    );
    expect((notes as HTMLInputElement).value).toBe("New saved note");
    expect(writes()).toHaveLength(0);
  });
  it("does not offer export, mail or attendee writes to a read-only event viewer", async () => {
    read = (path) =>
      path === detailPath
        ? {
            event: {
              ...current,
              actions: ["read"],
              canExport: false,
              canEmail: false,
            },
          }
        : defaults(path);
    render(body());
    await attendance();
    await screen.findByRole("textbox", {
      name: "Notes for " + person.attendee_name,
    });
    expect(screen.queryByRole("link", { name: "Export CSV" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Export CSV" }).matches(":disabled"),
    ).toBe(true);
    expect(
      screen
        .getByRole("button", { name: "Email registered attendees" })
        .matches(":disabled"),
    ).toBe(true);
    expect(
      screen
        .getByRole("textbox", { name: "Notes for " + person.attendee_name })
        .matches(":disabled"),
    ).toBe(true);
    expect(writes()).toHaveLength(0);
  });
  it("associates attendee email validation only with the edited registration", async () => {
    write = async () => {
      throw new ApiFailure(400, "VALIDATION_ERROR", "Check attendee email", {
        attendee_email: "Use a valid attendee email.",
      });
    };
    render(body());
    await attendance();
    fireEvent.change(
      await screen.findByRole("textbox", {
        name: "Notes for " + person.attendee_name,
      }),
      { target: { value: "Edited note" } },
    );
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Save attendee changes", hidden: true })
        .closest("form")!,
    );
    const error = await screen.findByText("Use a valid attendee email.");
    expect(
      screen.getByLabelText(/^Email/).getAttribute("aria-describedby"),
    ).toBe(error.id);
    fireEvent.change(screen.getByLabelText(/^Email/), {
      target: { value: "corrected@example.test" },
    });
    expect(screen.queryByText("Use a valid attendee email.")).toBeNull();
  });
});
