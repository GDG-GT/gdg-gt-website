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
import {
  createMemoryRouter,
  MemoryRouter,
  RouterProvider,
} from "react-router-dom";
import {
  EventTile,
  EventDetailPage,
  EventsPage,
} from "../../src/ui/PublicPages";
import { ContentProvider } from "../../src/contexts/ContentContext";
import NavigationSafety from "../../src/ui/NavigationSafety";
import { eventForPage, type ChapterEvent } from "../../src/ui/events";
import { ApiFailure } from "../../src/lib/api";
const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: apiMock,
}));
vi.mock("@/pwa/EventReminders", () => ({ default: () => null }));
const routers: ReturnType<typeof createMemoryRouter>[] = [];
function fixture(
  slug = "fictional",
  changes: Partial<ChapterEvent> = {},
): ChapterEvent {
  return {
    id: `f1130000-0000-4000-8000-00000000000${slug === "fictional" ? 1 : 2}`,
    title: `Fictional event ${slug}`,
    slug,
    description: "A fictional local event for interface verification.",
    short_description: "Build a fictional project together.",
    start_at: "2099-01-01T01:30:00Z",
    end_at: "2099-01-01T03:30:00Z",
    timezone: "America/Los_Angeles",
    location: "Fictional classroom",
    type: "Workshop",
    level: "beginner",
    registration_type: "internal",
    registration_enabled: true,
    registration_state: "open",
    max_participants: 10,
    external_attendees: 0,
    is_featured: false,
    team_id: null,
    revision: 1,
    publication_status: "published",
    created_at: "2026-10-26T00:00:00Z",
    updated_at: "2026-10-26T00:00:00Z",
    ...changes,
  };
}
const home = {
  settings: [],
  pages: [],
  navigation: [],
  footer: [],
  social: [],
  metrics: [],
  sponsors: [],
};
function pending<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
function mount({ guard = true } = {}) {
  const body = (
    <main id="main-content" tabIndex={-1}>
      <EventDetailPage />
    </main>
  );
  const router = createMemoryRouter(
    [
      {
        path: "/events/:slug",
        element: (
          <ContentProvider>
            {guard ? <NavigationSafety>{body}</NavigationSafety> : body}
          </ContentProvider>
        ),
      },
      { path: "/events", element: <h1>Fictional event inventory</h1> },
    ],
    {
      initialEntries: ["/events/fictional"],
    },
  );
  routers.push(router);
  return {
    ...render(<RouterProvider router={router} />),
    router,
  };
}
async function fill() {
  await screen.findByRole("heading", { name: /Fictional event/, level: 1 });
  fireEvent.change(screen.getByLabelText(/Full name/), {
    target: { value: "Fictional Participant" },
  });
  fireEvent.change(screen.getByLabelText(/Email address/), {
    target: { value: "fictional-participant@example.test" },
  });
  fireEvent.click(screen.getByRole("checkbox", { name: /I agree/ }));
}
function submit() {
  const form = screen.getByLabelText(/Full name/).closest("form")!;
  fireEvent.submit(form);
  return form;
}
const registrations = () =>
  apiMock.mock.calls.filter(
    ([path, options]) =>
      path.endsWith("/registrations") && options.method === "POST",
  );
beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockImplementation((path: string) =>
    Promise.resolve(
      path === "/public/home"
        ? home
        : path.endsWith("/registrations")
          ? { status: "registered", registrationId: "fictional-committed" }
          : { event: fixture(path.split("/")[2]), related: [] },
    ),
  );
});
afterEach(() => {
  cleanup();
  for (const router of routers.splice(0)) router.dispose();
});

describe("EVT independent listing controls", () => {
  function listing(url: string) {
    apiMock.mockImplementation((path: string) =>
      Promise.resolve(path === "/public/home" ? home : { items: [], total: 0 }),
    );
    const router = createMemoryRouter(
      [
        {
          path: "/events",
          element: (
            <ContentProvider>
              <EventsPage />
            </ContentProvider>
          ),
        },
      ],
      {
        initialEntries: [url],
      },
    );
    routers.push(router);
    render(<RouterProvider router={router} />);
    return router;
  }
  function lastQuery() {
    return new URLSearchParams(
      apiMock.mock.calls
        .filter(([path]) => path.startsWith("/events?"))
        .at(-1)![0]
        .split("?")[1],
    );
  }
  it("restores independently shared status, type, level, search, sort and page", async () => {
    listing(
      "/events?status=past&type=Workshop&level=beginner&q=build&sort=availability&page=2",
    );
    await screen.findByText("0 events");
    expect(lastQuery().get("status")).toBe("past");
    expect(lastQuery().get("type")).toBe("Workshop");
    expect(lastQuery().get("level")).toBe("beginner");
    expect(lastQuery().get("q")).toBe("build");
    expect(lastQuery().get("sort")).toBe("availability");
    expect(lastQuery().get("page")).toBe("2");
    expect(
      (screen.getByLabelText("Event type") as HTMLSelectElement).value,
    ).toBe("Workshop");
    expect(
      screen
        .getByRole("button", { name: "Past", exact: true })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });
  it("changes status without losing type, resets pagination and clears every filter on Reset", async () => {
    const router = listing(
      "/events?status=all&type=Hackathon&level=advanced&q=build&page=3",
    );
    await screen.findByText("0 events");
    fireEvent.click(screen.getByRole("button", { name: "Past", exact: true }));
    await waitFor(() => expect(lastQuery().get("status")).toBe("past"));
    expect(lastQuery().get("type")).toBe("Hackathon");
    expect(new URLSearchParams(router.state.location.search).has("page")).toBe(
      false,
    );
    fireEvent.change(screen.getByLabelText("Event type"), {
      target: { value: "Workshop" },
    });
    await waitFor(() => expect(lastQuery().get("type")).toBe("Workshop"));
    expect(lastQuery().get("status")).toBe("past");
    fireEvent.click(screen.getByRole("button", { name: "Reset", exact: true }));
    await waitFor(() => expect(router.state.location.search).toBe(""));
    expect(lastQuery().get("status")).toBe("upcoming");
    expect(lastQuery().has("type")).toBe(false);
    expect(lastQuery().get("q")).toBe("");
  });
  it("retains old shared type links when changing another control", async () => {
    const router = listing("/events?filter=demo%20day");
    await screen.findByText("0 events");
    expect(lastQuery().get("type")).toBe("Demo Day");
    fireEvent.click(screen.getByRole("button", { name: "Past", exact: true }));
    await waitFor(() => expect(lastQuery().get("status")).toBe("past"));
    expect(lastQuery().get("type")).toBe("Demo Day");
    expect(
      new URLSearchParams(router.state.location.search).has("filter"),
    ).toBe(false);
  });
  it("normalizes invalid page/status/sort values and retains custom shared event types", async () => {
    listing(
      "/events?status=nope&sort=nope&page=Infinity&type=Community%20meetup",
    );
    await screen.findByText("0 events");
    expect(lastQuery().get("page")).toBe("1");
    expect(lastQuery().get("status")).toBe("upcoming");
    expect(lastQuery().get("sort")).toBe("soonest");
    expect(
      (screen.getByLabelText("Event type") as HTMLSelectElement).value,
    ).toBe("Community meetup");
  });
  it("ignores an aborted old inventory response after filters change", async () => {
    const router = listing("/events?status=all");
    await screen.findByText("0 events");
    const old = pending<{ items: ChapterEvent[]; total: number }>();
    apiMock.mockReturnValueOnce(old.promise);
    await act(async () => {
      await router.navigate("/events?status=past");
    });
    apiMock.mockResolvedValue({ items: [fixture("current")], total: 1 });
    fireEvent.click(
      screen.getByRole("button", { name: "Upcoming", exact: true }),
    );
    await screen.findByText("Fictional event current");
    await act(async () =>
      old.resolve({ items: [fixture("outdated")], total: 1 }),
    );
    expect(screen.queryByText("Fictional event outdated")).toBeNull();
    expect(screen.getByText("Fictional event current")).toBeTruthy();
  });
});

describe("EVT display contract", () => {
  it("shows stored schedule history, the explicit end time and accurate client metadata", async () => {
    apiMock.mockImplementation((path: string) =>
      Promise.resolve(
        path === "/public/home"
          ? home
          : {
              event: fixture("fictional", {
                previous_start_at: "2098-12-30T01:30:00Z",
              }),
              related: [],
            },
      ),
    );
    mount();
    await screen.findByText(/Rescheduled from/);
    expect(screen.getByText(/Rescheduled from/).textContent).toMatch(
      /Dec 29, 2098/,
    );
    expect(
      screen.getByText(/Ends/).querySelector("time")?.getAttribute("datetime"),
    ).toBe("2099-01-01T03:30:00Z");
    const schemas = [
      ...document.querySelectorAll('script[type="application/ld+json"]'),
    ].map((node) => JSON.parse(node.textContent!));
    expect(schemas.find((row) => row["@type"] === "Event")).toMatchObject({
      eventStatus: "https://schema.org/EventRescheduled",
      previousStartDate: "2098-12-30T01:30:00Z",
    });
  });
  it("offers both configured registration routes and a safe event website", async () => {
    apiMock.mockImplementation((path: string) =>
      Promise.resolve(
        path === "/public/home"
          ? home
          : {
              event: fixture("fictional", {
                registration_type: "both",
                registration_url: "https://events.example.org/register",
                event_link: "https://events.example.org/about",
              }),
              related: [],
            },
      ),
    );
    mount();
    const organizer = await screen.findByRole("link", {
      name: /Register with the event organizer/,
    });
    expect(organizer.getAttribute("href")).toBe(
      "https://events.example.org/register",
    );
    expect(organizer.getAttribute("rel")).toBe("noopener noreferrer");
    expect(screen.getByLabelText(/Full name/)).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: /Event website/ })
        .getAttribute("target"),
    ).toBe("_blank");
  });
  it("keeps an external-only event without a safe registration link closed", async () => {
    apiMock.mockImplementation((path: string) =>
      Promise.resolve(
        path === "/public/home"
          ? home
          : {
              event: fixture("fictional", {
                registration_type: "external",
                registration_url: "javascript:alert(1)",
              }),
              related: [],
            },
      ),
    );
    mount();
    await screen.findByRole("heading", { name: "Registration is closed." });
    expect(screen.queryByLabelText(/Full name/)).toBeNull();
    expect(
      screen.queryByRole("link", { name: /Register with the event organizer/ }),
    ).toBeNull();
  });
  it("shares the canonical event address without visitor query or fragment data", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const { router } = mount();
    await act(async () => {
      await router.navigate("/events/fictional?ref=visitor#registration");
    });
    await screen.findByRole("heading", { name: /Fictional event/, level: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Share", exact: true }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        window.location.origin + "/events/fictional",
      ),
    );
  });
  it("uses the event timezone for its date badge, calendar date and explicit timezone", () => {
    const event = fixture("fictional", {
      start_at: "2030-01-01T01:30:00Z",
      end_at: "2030-01-01T03:30:00Z",
    });
    const page = render(
      <MemoryRouter>
        <EventTile event={eventForPage(event)} />
      </MemoryRouter>,
    );
    expect(screen.getByText("Dec", { exact: true })).toBeTruthy();
    expect(screen.getByText("31", { exact: true })).toBeTruthy();
    const time = page.container.querySelector("time")!;
    expect(time.textContent).toMatch(/Dec 31, 2029/);
    expect(time.textContent).toMatch(/5:30\s*PM\s*PST/);
    expect(time.getAttribute("datetime")).toBe(event.start_at);
    expect(time.getAttribute("title")).toBe("America/Los_Angeles");
    expect(
      screen.getByText("Build a fictional project together."),
    ).toBeTruthy();
  });
  it.each([
    ["open", "Registration open"],
    ["full", "Event full"],
    ["closed", "Registration closed"],
    ["ended", "Event ended"],
  ] as const)(
    "shows the server's %s registration state on cards",
    (state, label) => {
      const event = fixture("fictional", {
        registration_state: state,
        ...(state === "ended"
          ? { start_at: "2020-01-01T01:30:00Z", end_at: "2020-01-01T03:30:00Z" }
          : {}),
      });
      render(
        <MemoryRouter>
          <EventTile event={eventForPage(event)} />
        </MemoryRouter>,
      );
      expect(screen.getByText(label, { exact: true })).toBeTruthy();
      expect(screen.queryByRole("link", { name: /Register/ })).toBeNull();
    },
  );
  it("treats managed summaries as text rather than executable markup", () => {
    const event = fixture("fictional", {
      short_description: '<img src=x onerror="unsafe()">',
    });
    render(
      <MemoryRouter>
        <EventTile event={eventForPage(event)} />
      </MemoryRouter>,
    );
    expect(screen.getByText(event.short_description)).toBeTruthy();
    expect(document.querySelector(".gt-event-summary img")).toBeNull();
  });
});
describe("EVT registration interaction and scope", () => {
  it.each(["full", "closed", "ended"] as const)(
    "keeps the %s event registration control inactive",
    async (state) => {
      apiMock.mockImplementation((path: string) =>
        Promise.resolve(
          path === "/public/home"
            ? home
            : {
                event: fixture("fictional", { registration_state: state }),
                related: [],
              },
        ),
      );
      mount();
      expect(
        await screen.findByRole("link", { name: "See upcoming events" }),
      ).toBeTruthy();
      expect(
        screen.queryByRole("button", { name: "Complete registration" }),
      ).toBeNull();
    },
  );
  it("freezes inputs, prevents duplicate submits and confirms only a committed response", async () => {
    const response = pending<unknown>();
    apiMock.mockImplementation((path: string) =>
      path.endsWith("/registrations")
        ? response.promise
        : Promise.resolve(
            path === "/public/home" ? home : { event: fixture(), related: [] },
          ),
    );
    mount();
    await fill();
    const form = submit();
    fireEvent.submit(form);
    expect(registrations()).toHaveLength(1);
    expect(
      (screen.getByLabelText(/Full name/) as HTMLInputElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByLabelText(/Email address/) as HTMLInputElement).disabled,
    ).toBe(true);
    expect(
      screen.queryByRole("heading", { name: "Your place is confirmed." }),
    ).toBeNull();
    await act(async () => response.resolve({ status: "registered" }));
    const heading = await screen.findByRole("heading", {
      name: "Your place is confirmed.",
    });
    await waitFor(() => expect(document.activeElement).toBe(heading));
  });
  it("associates server field errors, focuses the first invalid control and clears corrected errors without moving focus", async () => {
    apiMock.mockImplementation((path: string) =>
      path.endsWith("/registrations")
        ? Promise.reject(
            new ApiFailure(
              400,
              "VALIDATION_ERROR",
              "Check the submitted details.",
              {
                name: "Check your full name.",
                email: "Check this email address.",
              },
            ),
          )
        : Promise.resolve(
            path === "/public/home" ? home : { event: fixture(), related: [] },
          ),
    );
    mount();
    await fill();
    submit();
    const name = screen.getByLabelText(/Full name/) as HTMLInputElement;
    await waitFor(() => expect(document.activeElement).toBe(name));
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(
      document.getElementById(name.getAttribute("aria-describedby")!)
        ?.textContent,
    ).toBe("Check your full name.");
    fireEvent.change(name, {
      target: { value: "Corrected Fictional Participant" },
    });
    expect(name.getAttribute("aria-invalid")).toBeNull();
    expect(document.activeElement).toBe(name);
  });
  it("retains input and idempotency on a recoverable retry", async () => {
    let writes = 0;
    apiMock.mockImplementation((path: string) =>
      path.endsWith("/registrations")
        ? ++writes === 1
          ? Promise.reject(
              new ApiFailure(
                503,
                "TEMPORARILY_UNAVAILABLE",
                "Registration temporarily unavailable.",
              ),
            )
          : Promise.resolve({ status: "registered" })
        : Promise.resolve(
            path === "/public/home" ? home : { event: fixture(), related: [] },
          ),
    );
    mount();
    await fill();
    submit();
    const error = await screen.findByRole("alert");
    await waitFor(() => expect(document.activeElement).toBe(error));
    expect((screen.getByLabelText(/Full name/) as HTMLInputElement).value).toBe(
      "Fictional Participant",
    );
    submit();
    await screen.findByRole("heading", { name: "Your place is confirmed." });
    expect(registrations()).toHaveLength(2);
    expect(registrations()[0][1].idempotencyKey).toBe(
      registrations()[1][1].idempotencyKey,
    );
  });
  it("responds to a last-seat rejection with the full state and an unblocked alternative-event link", async () => {
    apiMock.mockImplementation((path: string) =>
      path.endsWith("/registrations")
        ? Promise.reject(
            new ApiFailure(409, "EVENT_FULL", "This event is full."),
          )
        : Promise.resolve(
            path === "/public/home" ? home : { event: fixture(), related: [] },
          ),
    );
    mount();
    await fill();
    submit();
    const heading = await screen.findByRole("heading", {
      name: "This event is full.",
    });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    fireEvent.click(screen.getByRole("link", { name: "See upcoming events" }));
    expect(
      await screen.findByRole("heading", { name: "Fictional event inventory" }),
    ).toBeTruthy();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
  it("clears a completed registration when navigating to another event", async () => {
    const { router } = mount();
    await fill();
    submit();
    await screen.findByRole("heading", { name: "Your place is confirmed." });
    await act(async () => router.navigate("/events/other"));
    await screen.findByRole("heading", {
      name: "Fictional event other",
      level: 1,
    });
    expect(
      screen.queryByRole("heading", { name: "Your place is confirmed." }),
    ).toBeNull();
    expect((screen.getByLabelText(/Full name/) as HTMLInputElement).value).toBe(
      "",
    );
  });
  it("ignores an aborted event read even if its transport resolves after a newer page", async () => {
    const old = pending<unknown>();
    apiMock.mockImplementation((path: string) =>
      path === "/events/fictional"
        ? old.promise
        : Promise.resolve(
            path === "/public/home"
              ? home
              : { event: fixture("other"), related: [] },
          ),
    );
    const { router } = mount();
    expect(screen.getByRole("status", { name: "Loading event" })).toBeTruthy();
    await act(async () => router.navigate("/events/other"));
    await screen.findByRole("heading", {
      name: "Fictional event other",
      level: 1,
    });
    await act(async () => old.resolve({ event: fixture(), related: [] }));
    expect(
      screen.queryByRole("heading", {
        name: "Fictional event fictional",
        level: 1,
      }),
    ).toBeNull();
  });
  it("keeps a previous event's late write from confirming or unfreezing a new event", async () => {
    const first = pending<unknown>(),
      second = pending<unknown>();
    apiMock.mockImplementation((path: string) =>
      path.endsWith("/registrations")
        ? path.includes("/fictional/")
          ? first.promise
          : second.promise
        : Promise.resolve(
            path === "/public/home"
              ? home
              : { event: fixture(path.split("/")[2]), related: [] },
          ),
    );
    const { router } = mount({ guard: false });
    await fill();
    submit();
    await act(async () => router.navigate("/events/other"));
    await fill();
    submit();
    await act(async () => first.resolve({ status: "registered" }));
    expect(
      (screen.getByRole("button", { name: "Saving…" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      screen.queryByRole("heading", { name: "Your place is confirmed." }),
    ).toBeNull();
    await act(async () => second.resolve({ status: "registered" }));
    expect(
      await screen.findByRole("heading", { name: "Your place is confirmed." }),
    ).toBeTruthy();
  });
  it("retries a failed detail read and retains the main-landmark focus", async () => {
    let reads = 0;
    apiMock.mockImplementation((path: string) =>
      path === "/events/fictional" && ++reads === 1
        ? Promise.reject(
            new ApiFailure(
              503,
              "TEMPORARILY_UNAVAILABLE",
              "Event service unavailable.",
            ),
          )
        : Promise.resolve(
            path === "/public/home" ? home : { event: fixture(), related: [] },
          ),
    );
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Retry event" }));
    expect(document.activeElement).toBe(screen.getByRole("main"));
    expect(
      await screen.findByRole("heading", {
        name: "Fictional event fictional",
        level: 1,
      }),
    ).toBeTruthy();
  });
});
