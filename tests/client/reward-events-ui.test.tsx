// @vitest-environment jsdom
import React from "react";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import EventConnections from "../../src/ui/rewards/EventConnections";
import MemberEventLinks from "../../src/ui/rewards/MemberEventLinks";
import AppDialogHost from "../../src/ui/AppDialogHost";
const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: apiMock,
}));
const event = {
  id: "d3100000-0000-4000-8000-000000000001",
  title: "Fictional DevFest",
  origin: "https://event.example.org/",
  opens_at: "2026-11-08T10:00:00Z",
  closes_at: "2026-11-08T18:00:00Z",
  is_active: true,
  activity_id: null,
  revision: 1,
};
const mount = (element: React.ReactNode) =>
  render(
    <MemoryRouter>
      <AppDialogHost />
      {element}
    </MemoryRouter>,
  );
const storage = {
  setItem: vi.fn(),
  getItem: vi.fn(() => null),
  removeItem: vi.fn(),
};
beforeEach(() => {
  apiMock.mockReset();
  storage.setItem.mockClear();
  vi.stubGlobal("localStorage", storage);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("does not lose an uncertain event check-in request or award chapter points automatically", async () => {
  let confirms = 0;
  apiMock.mockImplementation(async (path, options) => {
    if (!options) return { events: [event], checkins: [] };
    if (path.endsWith("/lookup"))
      return {
        member: { name: "Fictional Member" },
        registration: { status: "registered", checkedIn: false },
        reviewId: "fictional-review",
      };
    if (path.endsWith("/confirm")) {
      if (++confirms === 1) throw Error("Lost response");
      return { state: "completed" };
    }
    throw Error("Unexpected write");
  });
  mount(<EventConnections checkinOnly initialCredential={"A".repeat(43)} />);
  fireEvent.change(
    await screen.findByRole("combobox", { name: "Check-in event" }),
    { target: { value: event.id } },
  );
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Check this card for the event",
    }),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Confirm event check-in" }),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Retry same event request" }),
  );
  await screen.findByText(
    "Event check-in confirmed. Chapter points have not been awarded.",
  );
  const writes = apiMock.mock.calls.filter(([p]) => p.endsWith("/confirm"));
  expect(writes).toHaveLength(2);
  expect(writes[0][1]).toEqual(writes[1][1]);
  expect(
    apiMock.mock.calls.some(
      ([p]) => p.endsWith("/points") || p.endsWith("/award"),
    ),
  ).toBe(false);
});
it("can discard unsaved connection edits and does not persist a server credential", async () => {
  apiMock.mockImplementation(async (path, options) =>
    options
      ? { ...event, credential: event.id + "." + "A".repeat(43) }
      : { events: [], checkins: [] },
  );
  const browserConfirm = vi.spyOn(window, "confirm");
  mount(<EventConnections />);
  const name = screen.getByRole("textbox", { name: "Event name" });
  fireEvent.change(name, { target: { value: "Unsaved event" } });
  fireEvent.click(screen.getByRole("button", { name: "Cancel changes" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Discard changes" }),
  );
  await waitFor(() =>
    expect(screen.getByRole("textbox", { name: "Event name" })).toHaveProperty(
      "value",
      "",
    ),
  );
  expect(browserConfirm).not.toHaveBeenCalled();
  expect(screen.getByRole("textbox", { name: "Event name" })).toHaveProperty(
    "value",
    "",
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Event name" }), {
    target: { value: event.title },
  });
  fireEvent.change(screen.getByRole("textbox", { name: /^Event website/ }), {
    target: { value: event.origin },
  });
  fireEvent.change(screen.getByLabelText("Check-in opens"), {
    target: { value: "2026-11-08T10:00" },
  });
  fireEvent.change(screen.getByLabelText(/^Check-in closes/), {
    target: { value: "2026-11-08T18:00" },
  });
  fireEvent.submit(
    screen
      .getByRole("button", { name: "Create event connection" })
      .closest("form")!,
  );
  expect(
    await screen.findByRole("textbox", { name: "Server credential" }),
  ).toHaveProperty("value", event.id + "." + "A".repeat(43));
  expect(storage.setItem).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "I have saved this credential" }),
  );
  expect(
    screen.queryByRole("textbox", { name: "Server credential" }),
  ).toBeNull();
});
it("keeps event link codes private and supports disconnecting an event account", async () => {
  let linked = false;
  apiMock.mockImplementation(async () => ({
    events: [event],
    links: linked ? [{ eventId: event.id }] : [],
  }));
  const fetchMock = vi.fn(
    async (path: string, options?: { headers: Record<string, string> }) => {
      if (path.endsWith("/code")) {
        linked = true;
        return new Response(
          JSON.stringify({
            data: { code: "B".repeat(43), expiresAt: "2099-11-08T12:10:00Z" },
          }),
        );
      }
      linked = false;
      return new Response(JSON.stringify({ data: { unlinked: true } }));
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  mount(<MemberEventLinks csrf="fictional-member-csrf" />);
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Get link code for Fictional DevFest",
    }),
  );
  expect(
    await screen.findByRole("textbox", { name: "Event link code" }),
  ).toHaveProperty("value", "B".repeat(43));
  expect(storage.setItem).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Done with this code" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Disconnect Fictional DevFest" }),
  );
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Disconnect event",
      exact: true,
    }),
  );
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  await screen.findByRole("button", {
    name: "Get link code for Fictional DevFest",
  });
  expect(fetchMock.mock.calls[0][1]?.headers["x-rewards-csrf"]).toBe(
    "fictional-member-csrf",
  );
});
it("preserves an unsaved connection form when a different connection key is rotated", async () => {
  apiMock.mockImplementation(async (_path, options) =>
    options
      ? { ...event, credential: event.id + "." + "A".repeat(43) }
      : { events: [event], checkins: [] },
  );
  mount(<EventConnections />);
  const input = screen.getByRole("textbox", { name: "Event name" });
  fireEvent.change(input, { target: { value: "Unsaved next event" } });
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Rotate key for Fictional DevFest",
    }),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Rotate key", exact: true }),
  );
  await screen.findByRole("textbox", { name: "Server credential" });
  expect(screen.getByRole("textbox", { name: "Event name" })).toHaveProperty(
    "value",
    "Unsaved next event",
  );
  fireEvent.click(
    screen.getByRole("button", { name: "I have saved this credential" }),
  );
  expect(screen.getByRole("textbox", { name: "Event name" })).toHaveProperty(
    "value",
    "Unsaved next event",
  );
});
