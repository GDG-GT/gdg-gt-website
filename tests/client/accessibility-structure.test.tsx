// @vitest-environment jsdom
import React from "react";
import axe from "axe-core";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ContentProvider } from "../../src/contexts/ContentContext";
import SiteShell from "../../src/ui/SiteShell";
import {
  HomePage,
  EventDetailPage,
  EventsPage,
  TeamPage,
  ResourcesPage,
  SponsorsPage,
  ContactPage,
  InfoPage,
  NotFoundPage,
} from "../../src/ui/PublicPages";
import PublicGallery from "../../src/ui/media/PublicGallery";
import PublicForm from "../../src/ui/forms/PublicForm";
import FormBuilder from "../../src/ui/forms/FormBuilder";
import ResponseWorkspace from "../../src/ui/forms/ResponseWorkspace";
import { createTemplate, newField } from "../../shared/forms";
import { ApiFailure } from "../../src/lib/api";
const { apiMock, listQueue } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  listQueue: vi.fn(),
}));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: apiMock,
}));
vi.mock("@/contexts/AdminContext", () => ({
  useAdmin: () => ({
    currentAdmin: {
      id: "fictional-axe-officer",
      role: "super_admin",
      display_name: "Fictional Reviewer",
    },
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
vi.mock("@/hooks/useDraftGuard", () => ({
  useDraftGuard: () => {},
  useNavigationSafety: () => ({ allow: (run: () => void) => run() }),
}));
vi.mock("../../shared/public-queue.mjs", () => ({
  publicQueue: { list: listQueue },
}));
const home = {
  settings: [],
  pages: [],
  navigation: [],
  footer: [],
  social: [],
  metrics: [],
  sponsors: [],
};
function formFixture() {
  const form = createTemplate("Fictional accessible form", "blank"),
    section = form.sections[0].id;
  form.id = "f1400000-0000-4000-8000-000000000001";
  form.slug = "fictional-accessible";
  form.revision = 1;
  form.actions = ["view", "edit", "view_responses"];
  form.fields = [
    {
      ...newField("short", section),
      label: "Fictional answer",
      required: true,
      description: "Helpful answer guidance",
    },
    {
      ...newField("rating", section),
      label: "Fictional rating",
      min: 1,
      max: 5,
    },
    {
      ...newField("likert", section),
      label: "Fictional grid",
      options: ["Clarity", "Pace"],
      columns: ["Good", "Great"],
    },
    {
      ...newField("grid", section),
      label: "Fictional multiple grid",
      options: ["Cloud", "Web"],
      columns: ["Morning", "Evening"],
    },
    {
      ...newField("ranking", section),
      label: "Fictional ranking",
      options: ["Cloud", "Web"],
    },
  ];
  return {
    ...form,
    status: "Open" as const,
    versionId: "f1400000-0000-4000-8000-000000000002",
    version: 1,
    copyAvailable: true,
  };
}
const manualRules = new Set<string>();
async function audit() {
  // JSDOM has no rendered pixel/layout engine. Contrast and real-device checks
  // remain mandatory; do not replace this explicit limitation with an AA claim.
  const result = await axe.run(document, {
    runOnly: {
      type: "tag",
      values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"],
    },
    rules: { "color-contrast": { enabled: false } },
  });
  result.incomplete.forEach((rule) => manualRules.add(rule.id));
  expect(
    result.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      targets: v.nodes.map((node) => node.target),
    })),
  ).toEqual([]);
}
function mountPublic(child: React.ReactNode, path = "/resources") {
  return render(
    <MemoryRouter
      initialEntries={[path]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <ContentProvider>
        <SiteShell>{child}</SiteShell>
      </ContentProvider>
    </MemoryRouter>,
  );
}
beforeEach(() => {
  document.documentElement.lang = "en";
  document.title = "Fictional accessibility fixture";
  listQueue.mockResolvedValue([]);
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  apiMock.mockImplementation((path: string) =>
    Promise.resolve(
      path === "/public/home"
        ? home
        : path.startsWith("/forms/")
          ? { form: formFixture() }
          : path === "/admin/forms/fictional"
            ? { form: formFixture() }
            : path.includes("/analytics?")
              ? { responseCount: 0, fields: [] }
              : { items: [], total: 0, page: 1, pageSize: 12, events: [] },
    ),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
afterAll(() =>
  console.info(
    "Axe rules still needing manual review in these JSDOM fixtures:",
    [...manualRules].sort().join(", ") || "none reported",
    "; color-contrast excluded because JSDOM has no rendering engine.",
  ),
);
describe("A11Y structural axe checks (JSDOM; no contrast/visual certification)", () => {
  it.each([
    ["home", <HomePage />, "/"],
    ["events", <EventsPage />, "/events"],
    ["team", <TeamPage />, "/team"],
    ["resources", <ResourcesPage />, "/resources"],
    ["sponsors", <SponsorsPage />, "/sponsors"],
    ["gallery", <PublicGallery />, "/gallery"],
    ["contact", <ContactPage />, "/contact"],
    ["offline help", <InfoPage kind="offline" />, "/offline"],
    ["404", <NotFoundPage />, "/not-found"],
  ] as const)(
    "checks the %s public page and shared shell",
    async (_, child, path) => {
      mountPublic(child, path);
      await waitFor(() => expect(apiMock).toHaveBeenCalled());
      await audit();
    },
  );
  it("checks the full public form field structure and associated validation errors", async () => {
    render(
      <MemoryRouter
        initialEntries={["/forms/fictional-accessible"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route
            path="/forms/:slug"
            element={
              <main id="main-content">
                <PublicForm />
              </main>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByRole("heading", { name: "Fictional accessible form" });
    await audit();
    fireEvent.submit(
      screen
        .getByRole("button", { name: /^(Submit response|Next)$/ })
        .closest("form")!,
    );
    await screen.findByRole("alert");
    await audit();
  });
  it.each(["team", "resources", "sponsors"] as const)(
    "checks populated %s cards with the real shared shell",
    async (kind) => {
      const original = apiMock.getMockImplementation()!;
      apiMock.mockImplementation((path: string) => {
        if (path.startsWith("/team?"))
          return Promise.resolve({
            items: [
              {
                id: "person",
                name: "Fictional Person",
                role: "Organizer",
                team_section: "Fictional organizers",
                linkedin_url: "https://www.linkedin.com/",
              },
            ],
            total: 1,
            page: 1,
            pageSize: 24,
          });
        if (path.startsWith("/resources?"))
          return Promise.resolve({
            items: [
              {
                id: "resource",
                title: "Fictional learning guide",
                description: "A fictional guide",
                type: "documentation",
                status: "Available",
                tags: ["Cloud"],
                url: "https://developers.google.com/",
              },
            ],
            total: 1,
            page: 1,
            pageSize: 12,
          });
        if (path.startsWith("/sponsors?"))
          return Promise.resolve({
            items: [
              {
                id: "partner",
                name: "Fictional partner",
                tier: "gold",
                logo_url: "/logo.png",
              },
            ],
            total: 1,
            page: 1,
            pageSize: 24,
          });
        if (path.startsWith("/sponsor-tiers?"))
          return Promise.resolve({
            items: [
              {
                id: "tier",
                tier_name: "Gold",
                tier_level: "gold",
                amount: "Fictional in-kind support",
                benefits: ["Workshop support"],
              },
            ],
            total: 1,
            page: 1,
            pageSize: 100,
          });
        return original(path);
      });
      mountPublic(
        kind === "team" ? (
          <TeamPage />
        ) : kind === "resources" ? (
          <ResourcesPage />
        ) : (
          <SponsorsPage />
        ),
        "/" + kind,
      );
      await screen.findByRole("heading", {
        name:
          kind === "team"
            ? "Fictional Person"
            : kind === "resources"
              ? "Fictional learning guide"
              : "Fictional partner",
      });
      await audit();
    },
  );
  it("checks the gallery lightbox with real dialog and image controls", async () => {
    const original = apiMock.getMockImplementation()!;
    apiMock.mockImplementation((path: string) =>
      path.startsWith("/gallery?")
        ? Promise.resolve({
            items: [
              {
                id: "f1400000-0000-4000-8000-000000000004",
                alt_text: "Fictional workshop photo",
                description: "Fictional caption",
                width: 960,
                height: 640,
                url: "/fictional-photo.png",
                event_title: "Fictional workshop",
              },
            ],
            total: 1,
            page: 1,
            pageSize: 24,
            events: [],
          })
        : original(path),
    );
    mountPublic(<PublicGallery />, "/gallery");
    fireEvent.click(
      await screen.findByRole("button", {
        name: "View photo: Fictional workshop photo",
      }),
    );
    await screen.findByRole("dialog");
    await audit();
  });
  it("checks event detail registration and its real validation feedback", async () => {
    const original = apiMock.getMockImplementation()!;
    apiMock.mockImplementation((path: string) =>
      path === "/events/fictional"
        ? Promise.resolve({
            event: {
              id: "f1400000-0000-4000-8000-000000000005",
              slug: "fictional",
              title: "Fictional accessible event",
              description: "A fictional event",
              start_at: "2099-01-01T18:00:00Z",
              end_at: "2099-01-01T20:00:00Z",
              timezone: "America/New_York",
              location: "Fictional room",
              type: "Workshop",
              level: "beginner",
              registration_enabled: true,
              registration_type: "internal",
              registration_state: "open",
              publication_status: "published",
            },
            related: [],
          })
        : original(path),
    );
    render(
      <MemoryRouter
        initialEntries={["/events/fictional"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <ContentProvider>
          <SiteShell>
            <Routes>
              <Route path="/events/:slug" element={<EventDetailPage />} />
            </Routes>
          </SiteShell>
        </ContentProvider>
      </MemoryRouter>,
    );
    await screen.findByRole("heading", { name: "Fictional accessible event" });
    await audit();
    fireEvent.change(screen.getByLabelText(/Full name/), {
      target: { value: "Fictional Guest" },
    });
    fireEvent.change(screen.getByLabelText(/^Email address \*/), {
      target: { value: "fictional-axe@example.test" },
    });
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /I agree to be contacted about this event/,
      }),
    );
    apiMock.mockRejectedValueOnce(
      new ApiFailure(
        422,
        "VALIDATION_ERROR",
        "Fictional registration validation failed.",
        { email: "Check this fictional email address." },
      ),
    );
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Complete registration" })
        .closest("form")!,
    );
    await screen.findByRole("alert");
    await audit();
  });
  it("checks event read failure with its page heading and retry", async () => {
    const original = apiMock.getMockImplementation()!;
    apiMock.mockImplementation((path: string) =>
      path === "/events/fictional"
        ? Promise.reject(Error("Fictional event unavailable"))
        : original(path),
    );
    render(
      <MemoryRouter
        initialEntries={["/events/fictional"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <ContentProvider>
          <SiteShell>
            <Routes>
              <Route path="/events/:slug" element={<EventDetailPage />} />
            </Routes>
          </SiteShell>
        </ContentProvider>
      </MemoryRouter>,
    );
    await screen.findByRole("heading", {
      name: "This event could not load",
      level: 1,
    });
    await audit();
  });
  it("checks the actual builder inspector and its selected tab panel", async () => {
    render(
      <MemoryRouter
        initialEntries={["/admin/forms/fictional/edit"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route
            path="/admin/forms/:formId/edit"
            element={
              <main id="workspace-content">
                <FormBuilder />
              </main>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByLabelText("Form title");
    await audit();
    fireEvent.click(screen.getByRole("tab", { name: "Logic" }));
    await audit();
  });
  it("checks response filter controls, result tabs and the empty table state", async () => {
    render(
      <MemoryRouter
        initialEntries={["/admin/forms/fictional/responses"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route
            path="/admin/forms/:formId/responses"
            element={
              <main id="workspace-content">
                <ResponseWorkspace />
              </main>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByRole("heading", { name: "No responses match" });
    await audit();
    fireEvent.click(screen.getByRole("tab", { name: "Summary" }));
    await screen.findByRole("heading", { name: "0 matching responses" });
    await audit();
  });
});
