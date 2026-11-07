// @vitest-environment jsdom
import React, { type ReactNode } from "react";
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
import { publicLinks } from "../../src/ui/preview-data";
import {
  ContentProvider,
  ContentSnapshotProvider,
  useContent,
} from "../../src/contexts/ContentContext";
import { HomePage } from "../../src/ui/PublicPages";
import SiteShell from "../../src/ui/SiteShell";
import type { HomeContent } from "../../src/lib/content-snapshot";
const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: apiMock,
}));
vi.mock("@/contexts/AdminContext", () => ({
  useAdmin: () => ({
    isAuthenticated: false,
    isLoading: false,
    login: vi.fn(),
  }),
}));
vi.mock("@/contexts/SiteAvailabilityContext", () => ({
  useSiteAvailability: () => ({ status: { is_live: true } }),
}));
vi.mock("../../src/ui/status/SiteAvailability", () => ({
  MaintenanceBanner: () => null,
}));
vi.mock("../../src/ui/HeroScene", () => ({
  default: () => <div aria-hidden="true" />,
}));
vi.mock("@/pwa/PwaControls", () => ({ InstallApp: () => null }));
vi.mock("@/components/AdminLoginModal", () => ({ default: () => null }));

function content(title = "Approved chapter copy"): HomeContent {
  return {
    settings: [{ key: "site_title", value: "Fictional chapter" }],
    pages: [{ page_slug: "home", section_key: "hero", content: { title } }],
    navigation: [{ id: "fictional-nav", label: "Home", href: "/" }],
    social: [],
    footer: [
      { section_key: "about", content: { description: "Approved footer" } },
    ],
    metrics: [
      {
        id: "fictional-metric",
        stat_label: "Workshops",
        stat_value: "2",
        stat_description: "Completed local fixtures",
      },
    ],
    sponsors: [],
  };
}
const event = {
  id: "fictional-event",
  title: "Fictional upcoming workshop",
  slug: "fictional-upcoming-workshop",
  description: "A local test only",
  start_at: "2099-10-24T18:00:00Z",
  end_at: "2099-10-24T20:00:00Z",
  timezone: "America/New_York",
  location: "Fictional classroom",
  level: "beginner",
  publication_status: "published",
};
const listing = (items: (typeof event)[] = []) => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 3,
});
function pending<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
function mount(children: ReactNode = <HomePage />) {
  return render(
    <MemoryRouter>
      <ContentProvider>
        <SiteShell>{children}</SiteShell>
      </ContentProvider>
    </MemoryRouter>,
  );
}
function Probe() {
  const value = useContent();
  return (
    <>
      <output aria-label="Current content state">
        {JSON.stringify({
          loading: value.isLoading,
          error: value.contentError,
          at: value.lastUpdated,
          title: value.getPageSection("home", "hero")?.title,
          metrics: value.chapterMetrics,
        })}
      </output>
      <button
        onClick={() => {
          void value.refreshContent();
        }}
      >
        Refresh chapter content
      </button>
    </>
  );
}
const state = () =>
  JSON.parse(
    screen.getByLabelText("Current content state").textContent || "{}",
  );
beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockImplementation((path: string) =>
    Promise.resolve(path === "/public/home" ? content() : listing()),
  );
  vi.stubGlobal("scrollTo", vi.fn());
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CONTENT-TEST-019: independent public content recovery", () => {
  it("hides the optional partner section when no approved sponsors exist", async () => {
    mount();
    await screen.findByRole("heading", { name: /Approved chapter copy$/ });
    expect(
      screen.queryByRole("region", { name: "Chapter partners" }),
    ).toBeNull();
  });
  it("acknowledges only aggregate-supplied partners and falls back safely when their logo fails", async () => {
    const snapshot = content();
    snapshot.sponsors = [
      {
        id: "fictional-partner",
        name: "Fictional approved partner",
        logo_url: "/fixture-missing-logo.png",
        tier: "gold",
      },
    ];
    apiMock.mockImplementation((path: string) =>
      Promise.resolve(path === "/public/home" ? snapshot : listing()),
    );
    mount();
    const section = await screen.findByRole("region", {
      name: "Chapter partners",
    });
    const image = screen.getByRole("img", {
      name: "Fictional approved partner",
    });
    expect(section.contains(image)).toBe(true);
    fireEvent.error(image);
    expect(
      screen.getByRole("img", { name: "Fictional approved partner" }).tagName,
    ).toBe("SPAN");
    expect(
      screen
        .getByRole("link", { name: "Meet our partners" })
        .getAttribute("href"),
    ).toBe("/sponsors");
  });
  it("names the initial event loading state and requests the next three upcoming events directly", async () => {
    const events = pending<ReturnType<typeof listing>>();
    apiMock.mockImplementation((path: string) =>
      path === "/public/home" ? Promise.resolve(content()) : events.promise,
    );
    mount();
    expect(
      screen.getByRole("status", { name: "Loading upcoming events" }),
    ).toBeTruthy();
    await screen.findByRole("heading", {
      name: /Approved chapter copy$/,
      level: 1,
    });
    expect(
      apiMock.mock.calls.some(
        ([path]) => path === "/events?status=upcoming&sort=soonest&pageSize=3",
      ),
    ).toBe(true);
    await act(async () => events.resolve(listing([event])));
    expect(
      await screen.findByRole("heading", { name: event.title }),
    ).toBeTruthy();
  });
  it("shows event request failure instead of a false empty calendar and recovers with keyboard focus retained", async () => {
    let attempts = 0;
    apiMock.mockImplementation((path: string) =>
      path === "/public/home"
        ? Promise.resolve(content())
        : ++attempts === 1
          ? Promise.reject(new Error("Events temporarily unavailable."))
          : Promise.resolve(listing([event])),
    );
    mount();
    expect(
      await screen.findByText(/Events temporarily unavailable/),
    ).toBeTruthy();
    expect(screen.queryByText("The next chapter is taking shape")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(document.activeElement).toBe(screen.getByRole("main"));
    expect(
      await screen.findByRole("heading", { name: event.title }),
    ).toBeTruthy();
    expect(screen.queryByText(/Events temporarily unavailable/)).toBeNull();
  });
  it("shows a first-use empty calendar only after the server confirms an empty result", async () => {
    mount();
    expect(
      await screen.findByRole("heading", {
        name: "The next chapter is taking shape",
      }),
    ).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("keeps event data usable when shared chapter content fails and retries the failed request separately", async () => {
    let attempts = 0;
    apiMock.mockImplementation((path: string) =>
      path === "/public/home"
        ? ++attempts === 1
          ? Promise.reject(new Error("Chapter service unavailable."))
          : Promise.resolve(content("Recovered chapter copy"))
        : Promise.resolve(listing([event])),
    );
    mount();
    expect(
      await screen.findByText(/The page is using its built-in copy/),
    ).toBeTruthy();
    expect(
      await screen.findByRole("heading", { name: event.title }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Retry chapter updates" }),
    );
    expect(document.activeElement).toBe(screen.getByRole("main"));
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: /Recovered chapter copy$/,
      }),
    ).toBeTruthy();
    expect(
      apiMock.mock.calls.filter(([path]) => path.startsWith("/events?")).length,
    ).toBe(1);
  });
  it("retains previous copy and its successful timestamp after refresh failure", async () => {
    mount(<Probe />);
    await waitFor(() => expect(state().title).toBe("Approved chapter copy"));
    const successfulAt = state().at;
    apiMock.mockRejectedValueOnce(new Error("Refresh unavailable."));
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh chapter content" }),
    );
    expect(await screen.findByText(/Showing content last loaded/)).toBeTruthy();
    expect(state()).toMatchObject({
      title: "Approved chapter copy",
      at: successfulAt,
      loading: false,
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Retry chapter updates" }),
    );
    await waitFor(() => expect(state().error).toBe(""));
    await waitFor(() => expect(state().loading).toBe(false));
  });
  it("ignores an older response that resolves after a newer refresh", async () => {
    const older = pending<HomeContent>(),
      newer = pending<HomeContent>();
    apiMock
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);
    mount(<Probe />);
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh chapter content" }),
    );
    await act(async () => newer.resolve(content("Newer copy")));
    await waitFor(() => expect(state().title).toBe("Newer copy"));
    const at = state().at;
    await act(async () => older.resolve(content("Old copy")));
    expect(state()).toMatchObject({ title: "Newer copy", at, loading: false });
  });
  it("aborts initial content and event reads when the page unmounts", async () => {
    const never = pending<never>();
    apiMock.mockReturnValue(never.promise);
    const page = mount();
    const signals = apiMock.mock.calls.map(
      ([, options]) => options.signal as AbortSignal,
    );
    expect(signals).toHaveLength(2);
    page.unmount();
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });
  it("reports malformed chapter payloads without replacing built-in copy or crashing", async () => {
    apiMock.mockImplementation((path: string) =>
      Promise.resolve(
        path === "/public/home" ? { pages: null } : listing([event]),
      ),
    );
    mount();
    expect(
      await screen.findByText(/The page is using its built-in copy/),
    ).toBeTruthy();
    expect(
      await screen.findByRole("heading", { name: event.title }),
    ).toBeTruthy();
  });
  it("keeps private saved-draft composition isolated from a failing public CMS read", async () => {
    apiMock.mockRejectedValue(new Error("Public CMS temporarily unavailable."));
    mount(
      <ContentSnapshotProvider snapshot={content("Private saved draft")}>
        <HomePage />
        <Probe />
      </ContentSnapshotProvider>,
    );
    expect(
      await screen.findByRole("heading", {
        name: /Private saved draft$/,
        level: 1,
      }),
    ).toBeTruthy();
    await waitFor(() => expect(state().loading).toBe(false));
    expect(state().error).toBe("");
    expect(state().metrics).toEqual([]);
  });
});

describe("A11Y-TEST-004: top navigation keyboard containment", () => {
  function menuFixture() {
    const snapshot = content();
    snapshot.navigation = publicLinks.map(([label, href]) => ({ label, href }));
    apiMock.mockResolvedValue(snapshot);
    return mount(<Probe />);
  }
  it("uses a top navigation panel and cycles Tab/Shift+Tab within the open navigation", async () => {
    const page = menuFixture();
    const button = screen.getByRole("button", { name: "Open navigation" });
    fireEvent.click(button);
    const menu = screen.getByRole("navigation", { name: "Mobile navigation" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).toBe("");
    const last = menu.querySelectorAll("a")[6];
    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    const brand = page.container.querySelector<HTMLAnchorElement>(
      ".gt-nav > .gt-brand",
    )!;
    expect(document.activeElement).toBe(brand);
    fireEvent.keyDown(brand, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
    expect(button.getAttribute("aria-controls")).toBe(menu.id);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    await waitFor(() => expect(state().loading).toBe(false));
  });
  it("opens the first item with ArrowDown and restores the trigger on Escape", async () => {
    menuFixture();
    const button = screen.getByRole("button", { name: "Open navigation" });
    button.focus();
    fireEvent.keyDown(button, { key: "ArrowDown" });
    const menu = screen.getByRole("navigation", { name: "Mobile navigation" });
    await waitFor(() =>
      expect(document.activeElement).toBe(menu.querySelector("a")),
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(
      screen.queryByRole("navigation", { name: "Mobile navigation" }),
    ).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Open navigation" }),
    );
  });
  it("opens keyboard navigation even when animation frames are paused", async () => {
    mount();
    const frame = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation(() => 0);
    try {
      const button = screen.getByRole("button", { name: "Open navigation" });
      fireEvent.keyDown(button, { key: "ArrowDown" });
      const menu = screen.getByRole("navigation", {
        name: "Mobile navigation",
      });
      await waitFor(() =>
        expect(document.activeElement).toBe(menu.querySelector("a")),
      );
      button.focus();
      fireEvent.keyDown(button, { key: "ArrowDown" });
      expect(document.activeElement).toBe(menu.querySelector("a"));
    } finally {
      frame.mockRestore();
    }
  });
  it("closes after selecting a route or clicking outside the panel", async () => {
    menuFixture();
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    const menu = screen.getByRole("navigation", { name: "Mobile navigation" });
    fireEvent.click(
      menu.querySelector<HTMLAnchorElement>('a[href="/events"]')!,
    );
    expect(
      screen.queryByRole("navigation", { name: "Mobile navigation" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    fireEvent.pointerDown(screen.getByRole("main"));
    expect(
      screen.queryByRole("navigation", { name: "Mobile navigation" }),
    ).toBeNull();
    await waitFor(() => expect(state().loading).toBe(false));
  });
});
