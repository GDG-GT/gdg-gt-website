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
import { MemoryRouter, useLocation } from "react-router-dom";
import {
  ResourcesPage,
  SponsorsPage,
  TeamPage,
} from "../../src/ui/PublicPages";
const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: apiMock,
}));
vi.mock("@/contexts/ContentContext", () => ({
  useContent: () => ({
    getSiteSetting: () => "Fictional chapter",
    getPageSection: () => null,
  }),
}));
const resource = {
  id: "fictional-resource",
  title: "Fictional Cloud Guide",
  description: "A fictional local guide",
  type: "documentation",
  status: "Available",
  tags: ["Cloud"],
  url: "https://developers.google.com/",
};
const tier = {
  id: "fictional-tier",
  tier_name: "Fictional Gold",
  tier_level: "gold",
  amount: "Fictional in-kind support",
  benefits: ["Fictional workshop support"],
};
function listing(
  items: unknown[] = [],
  page = 1,
  total = items.length,
  pageSize = 12,
) {
  return { items, page, total, pageSize };
}
function LocationProbe() {
  const location = useLocation();
  return (
    <div aria-label="Current URL">{location.pathname + location.search}</div>
  );
}
function mount(path = "/resources") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <main id="main-content" tabIndex={-1}>
        {path.startsWith("/sponsors") ? (
          <SponsorsPage />
        ) : path.startsWith("/team") ? (
          <TeamPage />
        ) : (
          <ResourcesPage />
        )}
      </main>
      <LocationProbe />
    </MemoryRouter>,
  );
}
const requested = () =>
  apiMock.mock.calls
    .filter(([path, options]) => !options?.method)
    .map(([path]) => new URL(path, "https://fictional.example.test"));
beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockResolvedValue(listing());
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 0),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("Public resource discovery and filter recovery", () => {
  it("reflects every shared filter and normalizes supported value casing before the API read", async () => {
    apiMock.mockResolvedValue(listing([resource]));
    mount(
      "/resources?q=Cloud&type=DOCUMENTATION&level=Beginner&status=coming%20soon&tag=Cloud&page=2",
    );
    await screen.findByRole("heading", { name: resource.title });
    expect(
      screen
        .getByRole("button", { name: "Documentation" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect((screen.getByLabelText("Level") as HTMLSelectElement).value).toBe(
      "beginner",
    );
    expect(
      (screen.getByLabelText("Availability") as HTMLSelectElement).value,
    ).toBe("Coming Soon");
    expect(Object.fromEntries(requested()[0].searchParams)).toEqual({
      page: "2",
      pageSize: "12",
      q: "Cloud",
      type: "documentation",
      level: "Beginner",
      status: "Coming Soon",
      tag: "Cloud",
    });
  });
  it("keeps malformed shared filters within the public API bounds and presents actual applied values", async () => {
    mount(
      "/resources?q=" +
        "x".repeat(101) +
        "&tag=" +
        "y".repeat(101) +
        "&type=unknown&level=unknown&status=unknown&page=-1",
    );
    await screen.findByRole("heading", { name: "No resources match just yet" });
    const params = requested()[0].searchParams;
    expect(params.get("q")).toHaveLength(100);
    expect(params.get("tag")).toHaveLength(100);
    expect(params.get("page")).toBe("1");
    for (const name of ["type", "level", "status"])
      expect(params.has(name)).toBe(false);
    expect(
      (
        screen.getByRole("searchbox", {
          name: "Search resources",
        }) as HTMLInputElement
      ).maxLength,
    ).toBe(100);
    expect(
      screen
        .getByRole("button", { name: "All resources" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });
  it("changes a single filter without losing the other filters and resets pagination", async () => {
    mount(
      "/resources?q=Cloud&level=beginner&status=Available&tag=Cloud&page=4",
    );
    await screen.findByRole("heading", { name: "No resources match just yet" });
    fireEvent.click(screen.getByRole("button", { name: "Study jams" }));
    await waitFor(() =>
      expect(requested().at(-1)?.searchParams.get("type")).toBe("study_jam"),
    );
    const params = requested().at(-1)!.searchParams;
    expect(Object.fromEntries(params)).toEqual({
      page: "1",
      pageSize: "12",
      q: "Cloud",
      type: "study_jam",
      level: "Beginner",
      status: "Available",
      tag: "Cloud",
    });
  });
  it("keeps Reset filters available on a failed read and restores focus to persistent content", async () => {
    apiMock
      .mockRejectedValueOnce(Error("Fictional read failure"))
      .mockResolvedValue(listing([resource]));
    mount("/resources?q=Cloud&type=study_jam&page=4");
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
    await screen.findByRole("heading", { name: resource.title });
    expect(screen.getByLabelText("Current URL").textContent).toBe("/resources");
    expect(document.activeElement).toBe(
      document.getElementById("main-content"),
    );
    expect(Object.fromEntries(requested().at(-1)!.searchParams)).toEqual({
      page: "1",
      pageSize: "12",
    });
  });
  it("recovers an out-of-range page without falsely saying the filtered inventory is empty", async () => {
    apiMock
      .mockResolvedValueOnce(listing([], 4, 2))
      .mockResolvedValue(listing([resource]));
    mount("/resources?q=Cloud&page=4");
    await screen.findByText("There are no results on page 4.");
    expect(
      screen.queryByRole("heading", { name: "No resources match just yet" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back to first page" }));
    await screen.findByRole("heading", { name: resource.title });
    expect(requested().at(-1)!.searchParams.get("q")).toBe("Cloud");
    expect(requested().at(-1)!.searchParams.get("page")).toBe("1");
  });
  it("keeps an external resource actionable while its view-count request is unresolved", async () => {
    apiMock.mockImplementation((path: string) =>
      path.endsWith("/view")
        ? new Promise(() => {})
        : Promise.resolve(listing([resource])),
    );
    mount();
    const link = await screen.findByRole("link", {
      name: "Open resource (opens a new tab)",
    });
    fireEvent.click(link);
    expect(link.getAttribute("href")).toBe(resource.url);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(apiMock).toHaveBeenCalledWith("/resources/fictional-resource/view", {
      method: "POST",
    });
  });
  it("conceals old filtered cards while the next filter's read is still loading", async () => {
    let complete!: (value: ReturnType<typeof listing>) => void;
    apiMock.mockResolvedValueOnce(listing([resource])).mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    mount();
    await screen.findByRole("heading", { name: resource.title });
    fireEvent.click(screen.getByRole("button", { name: "Study jams" }));
    expect(screen.queryByRole("heading", { name: resource.title })).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Loading results");
    await act(async () => complete(listing()));
    await screen.findByRole("heading", { name: "No resources match just yet" });
  });
});
describe("Sponsor and team public presentation", () => {
  it("omits a legacy empty tier without suppressing an explained package", async () => {
    apiMock.mockImplementation((path: string) =>
      Promise.resolve(
        path.startsWith("/sponsor-tiers?")
          ? listing([
              {
                ...tier,
                id: "empty",
                tier_name: "Fictional empty package",
                amount: "  ",
                benefits: [" "],
              },
              tier,
            ])
          : listing(),
      ),
    );
    mount("/sponsors");
    await screen.findByRole("heading", { name: "Fictional Gold" });
    expect(
      screen.queryByRole("heading", { name: "Fictional empty package" }),
    ).toBeNull();
    expect(
      screen
        .getByRole("link", { name: "Discuss this package" })
        .getAttribute("href"),
    ).toBe("/contact?type=sponsorship");
  });
  it("omits the entire package section when every tier is empty", async () => {
    apiMock.mockImplementation((path: string) =>
      Promise.resolve(
        path.startsWith("/sponsor-tiers?")
          ? listing([{ ...tier, amount: "", benefits: [] }])
          : listing(),
      ),
    );
    mount("/sponsors");
    await screen.findByRole("heading", { name: /Good things grow/ });
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    expect(
      screen.queryByRole("region", { name: "Approved sponsorship packages" }),
    ).toBeNull();
  });
  it("keeps sponsor grouping ordered by configured tiers and preserves safe logo/link behavior", async () => {
    const partners = [
      {
        id: "bronze",
        name: "Fictional Bronze Partner",
        tier: "bronze",
        logo_url: "/bronze.png",
      },
      {
        id: "gold",
        name: "Fictional Gold Partner",
        tier: "gold",
        logo_url: "/gold.png",
        website_url: "https://developers.google.com/",
      },
    ];
    apiMock.mockImplementation((path: string) =>
      Promise.resolve(
        path.startsWith("/sponsor-tiers?")
          ? listing([
              tier,
              {
                ...tier,
                id: "bronze-tier",
                tier_name: "Fictional Bronze",
                tier_level: "bronze",
              },
            ])
          : path.startsWith("/sponsors?")
            ? listing(partners)
            : listing(),
      ),
    );
    mount("/sponsors");
    await screen.findByRole("heading", { name: "Fictional Gold Partner" });
    const groups = screen.getAllByRole("region", { name: /partners$/ });
    expect(groups.map((group) => group.getAttribute("aria-label"))).toEqual([
      "Fictional Gold partners",
      "Fictional Bronze partners",
    ]);
    expect(
      screen
        .getByRole("img", { name: "Fictional Gold Partner" })
        .getAttribute("alt"),
    ).toBe("Fictional Gold Partner");
    expect(
      screen
        .getByRole("link", { name: "Visit partner (opens a new tab)" })
        .getAttribute("rel"),
    ).toBe("noopener noreferrer");
  });
  it("shows grouped team initials and safe social links without inventing or exposing an email", async () => {
    apiMock.mockResolvedValue(
      listing([
        {
          id: "fictional-person",
          name: "Fictional Person",
          role: "Fictional reviewer",
          team_section: "Fictional organizers",
          bio: "Fictional bio",
          linkedin_url: "https://www.linkedin.com/",
          github_url: "javascript:alert(1)",
          email: "private-profile@example.test",
        },
      ]),
    );
    mount("/team");
    await screen.findByRole("heading", { name: "Fictional Person" });
    expect(
      screen.getByRole("heading", { name: "Fictional organizers" }),
    ).toBeTruthy();
    expect(screen.getByText("FP")).toBeTruthy();
    expect(
      screen
        .getByRole("link", {
          name: "Fictional Person on LinkedIn (opens a new tab)",
        })
        .getAttribute("rel"),
    ).toBe("noopener noreferrer");
    expect(screen.queryByRole("link", { name: /GitHub/ })).toBeNull();
    expect(screen.queryByText("private-profile@example.test")).toBeNull();
  });
});
