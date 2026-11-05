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
const { apiMock, actor } = vi.hoisted(() => ({
  apiMock: vi.fn(),
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
  useDraftGuard: vi.fn(),
  useNavigationSafety: () => undefined,
}));
vi.mock("../../src/ui/forms/FormIntegrations", () => ({
  default: () => <p>Fictional scoped form controls</p>,
}));
vi.mock("../../src/ui/EventMailPanel", () => ({
  default: () => <p>Fictional mail review</p>,
}));
function event(
  id = "fictional-event",
  title = "Fictional private event",
): ChapterEvent {
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
  };
}
const person = {
  id: "fictional-registration",
  attendee_name: "Fictional private attendee",
  attendee_email: "fictional-attendee@example.test",
  notes: "Private fixture note",
  attended: false,
  registration_date: "2026-11-05T12:00:00Z",
};
const inventoryPath = "/admin/events?page=1",
  detailPath = "/admin/events/fictional-event",
  attendeesPath = detailPath + "/attendees?page=1";
let current = event(),
  inventoryTotal = 1;
let read: (path: string) => unknown;
function defaults(path: string) {
  if (path.includes("/attendees?")) return { items: [person], total: 1 };
  if (path.includes("/events?"))
    return { items: [current], total: inventoryTotal };
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
  apiMock.mockImplementation((path, options) =>
    options?.method
      ? Promise.resolve({ event: current })
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
describe("Admin event inventory, selected detail and attendee read recovery", () => {
  it("names inventory loading without showing a false first-use empty state", () => {
    apiMock.mockReturnValue(new Promise(() => {}));
    render(body());
    expect(
      screen.getByRole("status", { name: "Loading event inventory" }),
    ).toBeTruthy();
    expect(screen.queryByText("Create your first chapter event")).toBeNull();
    expect(apiMock).toHaveBeenCalledWith(inventoryPath, {
      signal: expect.any(AbortSignal),
    });
  });
  it("retries an inventory error in place and focuses the stable workspace without writing", async () => {
    read = () => {
      throw Error("Fictional event inventory outage");
    };
    render(body());
    const retry = await screen.findByRole("button", {
      name: "Retry event inventory",
    });
    expect(screen.queryByText("Create your first chapter event")).toBeNull();
    read = defaults;
    fireEvent.click(retry);
    await screen.findByText("Fictional private event");
    expect(document.activeElement?.id).toBe("workspace-content");
    expect(writes()).toHaveLength(0);
  });
  it("retains an authorized timestamped inventory on temporary refresh failure and disables its actions", async () => {
    render(body());
    await screen.findByText("Fictional private event");
    read = (path) => {
      if (path === inventoryPath) throw Error("Fictional refresh unavailable");
      return defaults(path);
    };
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh event inventory" }),
    );
    await screen.findByText(/Fictional refresh unavailable/);
    expect(screen.getByText("Fictional private event")).toBeTruthy();
    expect(screen.getByText(/Last successful read/)).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Edit",
          exact: true,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(writes()).toHaveLength(0);
  });
  it("paginates without retaining rows from the previous result page", async () => {
    inventoryTotal = 100;
    render(body());
    await screen.findByText("Fictional private event");
    const old = pending();
    read = (path) =>
      path === inventoryPath
        ? old.promise
        : {
            items: [event("fictional-second", "Fictional second page")],
            total: 100,
          };
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh event inventory" }),
    );
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Refresh event inventory",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true),
    );
    // The page control is disabled during an active request; resolve then change.
    await act(async () => old.resolve({ items: [current], total: 100 }));
    fireEvent.click(screen.getByRole("button", { name: "Next", exact: true }));
    await screen.findByText("Fictional second page");
    expect(screen.queryByText("Fictional private event")).toBeNull();
    expect(writes()).toHaveLength(0);
  });
  it("loads current selected detail before allowing a save and retries only that read", async () => {
    read = (path) => {
      if (path === detailPath) throw Error("Fictional detail outage");
      return defaults(path);
    };
    render(body());
    await edit();
    const retry = await screen.findByRole("button", {
      name: "Retry selected event",
    });
    expect(
      (
        screen.getByRole("button", {
          name: "Save draft changes",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    read = defaults;
    apiMock.mockClear();
    fireEvent.click(retry);
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Save draft changes",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    expect(apiMock.mock.calls).toHaveLength(1);
    expect(apiMock.mock.calls[0][0]).toBe(detailPath);
    expect(writes()).toHaveLength(0);
  });
  it("preserves unsaved fields when a new revision arrives and requires explicit draft replacement review", async () => {
    render(body());
    await edit();
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Save draft changes",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    fireEvent.change(screen.getByLabelText(/^Event title/), {
      target: { value: "Fictional unsaved title" },
    });
    current = {
      ...current,
      revision: 2,
      title: "Fictional remote saved title",
    };
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh selected event" }),
    );
    await screen.findByText(/saved event changed/);
    expect(
      (screen.getByLabelText(/^Event title/) as HTMLInputElement).value,
    ).toBe("Fictional unsaved title");
    expect(
      (
        screen.getByRole("button", {
          name: "Save draft changes",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Review loading saved event" }),
    );
    await screen.findByRole("heading", {
      name: "Replace this draft with the current saved event?",
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm", exact: true }),
    );
    expect(
      (screen.getByLabelText(/^Event title/) as HTMLInputElement).value,
    ).toBe("Fictional remote saved title");
    expect(writes()).toHaveLength(0);
  });
  it("loads attendee inventory independently, preserving its rows when selected-detail recovery is unavailable", async () => {
    read = (path) => {
      if (path === detailPath)
        throw Error("Fictional current event read outage");
      return defaults(path);
    };
    render(body());
    await attendance();
    await screen.findByText(person.attendee_name);
    await screen.findByRole("button", { name: "Retry selected event" });
    expect(
      (
        screen.getByRole("button", {
          name: "Email registered attendees",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Export CSV" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("textbox", {
          name: "Notes for " + person.attendee_name,
        }) as HTMLInputElement
      ).disabled,
    ).toBe(true);
    expect(writes()).toHaveLength(0);
  });
  it("names attendee loading and does not invent an empty registration state", async () => {
    read = (path) =>
      path === attendeesPath ? new Promise(() => {}) : defaults(path);
    render(body());
    await attendance();
    expect(
      screen.getByRole("status", { name: "Loading event attendees" }),
    ).toBeTruthy();
    expect(screen.queryByText("No registrations yet")).toBeNull();
  });
  it("retries only attendee reads, with current event information retained", async () => {
    read = (path) => {
      if (path === attendeesPath) throw Error("Fictional attendee read outage");
      return defaults(path);
    };
    render(body());
    await attendance();
    const retry = await screen.findByRole("button", {
      name: "Retry event attendees",
    });
    expect(screen.queryByText("No registrations yet")).toBeNull();
    read = defaults;
    apiMock.mockClear();
    fireEvent.click(retry);
    await screen.findByText(person.attendee_name);
    expect(apiMock.mock.calls).toHaveLength(1);
    expect(apiMock.mock.calls[0][0]).toBe(attendeesPath);
    expect(writes()).toHaveLength(0);
  });
  it("keeps a stale attendee snapshot read-only until explicit successful recovery", async () => {
    render(body());
    await attendance();
    await screen.findByText(person.attendee_name);
    read = (path) => {
      if (path === attendeesPath)
        throw Error("Fictional attendee refresh outage");
      return defaults(path);
    };
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh event attendees" }),
    );
    await screen.findByText(/Fictional attendee refresh outage/);
    expect(screen.getByText(person.attendee_name)).toBeTruthy();
    expect(
      (
        screen.getByRole("textbox", {
          name: "Notes for " + person.attendee_name,
        }) as HTMLInputElement
      ).disabled,
    ).toBe(true);
    fireEvent.blur(
      screen.getByRole("textbox", {
        name: "Notes for " + person.attendee_name,
      }),
      { target: { value: "Fictional stale note" } },
    );
    expect(writes()).toHaveLength(0);
  });
  it.each([inventoryPath, detailPath, attendeesPath])(
    "clears private event/attendee state on denied %s",
    async (deniedPath) => {
      render(body());
      if (deniedPath !== inventoryPath) {
        await attendance();
        await screen.findByText(person.attendee_name);
      } else await screen.findByText("Fictional private event");
      read = (path) => {
        if (path === deniedPath)
          throw new ApiFailure(403, "FORBIDDEN", "Fictional access removed");
        return defaults(path);
      };
      fireEvent.click(
        screen.getByRole("button", {
          name:
            deniedPath === inventoryPath
              ? "Refresh event inventory"
              : deniedPath === detailPath
                ? "Refresh selected event"
                : "Refresh event attendees",
        }),
      );
      await screen.findByText("Event access needs to be rechecked");
      expect(screen.queryByText(person.attendee_name)).toBeNull();
      expect(screen.queryByText("Fictional private event")).toBeNull();
      read = defaults;
      fireEvent.click(
        screen.getByRole("button", { name: "Recheck event access" }),
      );
      await screen.findByText("Fictional private event");
      expect(writes()).toHaveLength(0);
    },
  );
  it.each(["account", "role", "session"])(
    "fences a late private detail and resets draft inputs after %s replacement",
    async (change) => {
      const old = pending();
      read = (path) => (path === detailPath ? old.promise : defaults(path));
      const view = render(body());
      await edit();
      const signal = apiMock.mock.calls.find(
        ([path]) => path === detailPath,
      )![1].signal;
      fireEvent.change(screen.getByLabelText(/^Event title/), {
        target: { value: "Fictional old private draft" },
      });
      if (change === "session")
        act(() => window.dispatchEvent(new Event("gdg:session-cleared")));
      else {
        if (change === "account") actor.id = "fictional-other-officer";
        else actor.role = "team_member";
        view.rerender(body());
      }
      expect(signal.aborted).toBe(true);
      await act(async () =>
        old.resolve({
          event: { ...current, title: "Fictional obsolete returned title" },
        }),
      );
      expect(
        screen.queryByDisplayValue("Fictional old private draft"),
      ).toBeNull();
      expect(
        screen.queryByText("Fictional obsolete returned title"),
      ).toBeNull();
      expect(writes()).toHaveLength(0);
    },
  );
  it("keeps offline draft input and prevents saving or automatic writes on reconnect", async () => {
    render(body());
    await edit();
    fireEvent.change(screen.getByLabelText(/^Event title/), {
      target: { value: "Fictional offline event draft" },
    });
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    act(() => window.dispatchEvent(new Event("offline")));
    expect(
      (
        screen.getByRole("button", {
          name: "Save draft changes",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.submit(screen.getByLabelText(/^Event title/).closest("form")!);
    expect(writes()).toHaveLength(0);
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    act(() => window.dispatchEvent(new Event("online")));
    expect(
      (screen.getByLabelText(/^Event title/) as HTMLInputElement).value,
    ).toBe("Fictional offline event draft");
    expect(writes()).toHaveLength(0);
  });
  it("offers a reset after filtering a populated page to zero matching titles", async () => {
    render(body());
    await screen.findByText("Fictional private event");
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search this page of events" }),
      { target: { value: "no fictional match" } },
    );
    await screen.findByText("No events match this page");
    fireEvent.click(screen.getByRole("button", { name: "Reset page search" }));
    await screen.findByText("Fictional private event");
    expect(writes()).toHaveLength(0);
  });
});
