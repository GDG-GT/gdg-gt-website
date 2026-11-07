// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  createMemoryRouter,
  RouterProvider,
  useLocation,
} from "react-router-dom";
import PublicProfile from "../../src/ui/linktree/PublicProfile";
import NavigationSafety from "../../src/ui/NavigationSafety";
import { ContentProvider } from "../../src/contexts/ContentContext";
import { linktreeLink, linktreeProfile } from "../../shared/linktree.mjs";
import { ApiFailure } from "../../src/lib/api";
const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: apiMock,
}));
function fixture(username = "fictional") {
  const links = [
    {
      title: "Fictional video",
      url: "https://www.youtube.com/watch?v=abcdefghijk",
      embedType: "youtube",
    },
    {
      title: "Fictional external form",
      url: "https://docs.google.com/forms/d/e/fictional1234567890/viewform",
      embedType: "google_form",
    },
    {
      title: "Developer documentation",
      url: "https://developers.google.com/",
      embedType: "none",
    },
  ].map((row, index) => ({
    id: `f1120000-0000-4000-8000-00000000000${index + 1}`,
    ...linktreeLink.parse(row),
    clickCount: null,
  }));
  return {
    profile: {
      ...linktreeProfile.parse({
        username,
        displayName: `Fictional hub ${username}`,
      }),
      id: "f1120000-0000-4000-8000-000000000010",
      links,
    },
  };
}
function RouteProbe() {
  return <output aria-label="Current route">{useLocation().pathname}</output>;
}
function mount() {
  const router = createMemoryRouter(
    [
      {
        path: "/l/:username",
        element: (
          <ContentProvider>
            <NavigationSafety>
              <main id="main-content" tabIndex={-1}>
                <PublicProfile />
              </main>
              <RouteProbe />
            </NavigationSafety>
          </ContentProvider>
        ),
      },
    ],
    {
      initialEntries: ["/l/fictional"],
    },
  );
  const page = render(<RouterProvider router={router} />);
  return { ...page, router };
}
beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockImplementation((path: string) =>
    Promise.resolve(
      path === "/public/home"
        ? {
            settings: [],
            pages: [],
            navigation: [],
            footer: [],
            social: [],
            metrics: [],
            sponsors: [],
          }
        : /^\/linktree\/[^/]+$/.test(path)
          ? fixture(path.split("/")[2])
          : {},
    ),
  );
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(Date.now()), 0),
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) =>
    window.clearTimeout(id),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
async function openForm() {
  const trigger = await screen.findByRole("button", {
    name: "Fictional external form (opens a preview)",
  });
  fireEvent.click(trigger);
  fireEvent.click(
    screen.getByRole("button", { name: "Load Google Forms preview" }),
  );
  return trigger;
}
describe("CONTENT/A11Y Linktree consent and navigation", () => {
  it("does not load a third-party frame before explicit consent and marks external navigation", async () => {
    mount();
    await screen.findByRole("heading", {
      name: "Fictional hub fictional",
      level: 1,
    });
    expect(document.querySelector("iframe")).toBeNull();
    const link = screen.getByRole("link", {
      name: "Developer documentation (opens a new tab)",
    });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(
      apiMock.mock.calls.some(([path]) => path === "/linktree/fictional/views"),
    ).toBe(true);
  });
  it("focuses the inline preview heading, loads only the allowed embed and returns focus on close", async () => {
    mount();
    const trigger = await screen.findByRole("button", {
      name: "Fictional video (opens a preview)",
    });
    fireEvent.click(trigger);
    const heading = screen.getByRole("heading", {
      name: "Fictional video",
      level: 2,
    });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(document.querySelector("iframe")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Load YouTube preview" }),
    );
    const frame = document.querySelector("iframe")!;
    expect(frame.getAttribute("src")).toBe(
      "https://www.youtube-nocookie.com/embed/abcdefghijk?rel=0",
    );
    expect(frame.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(frame.getAttribute("sandbox")).toContain("allow-scripts");
    fireEvent.click(screen.getByRole("button", { name: "Close preview" }));
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(document.querySelector("iframe")).toBeNull();
  });
  it("toggles an expanded preview from its original trigger", async () => {
    mount();
    const trigger = await screen.findByRole("button", {
      name: "Fictional video (opens a preview)",
    });
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(trigger);
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("button", { name: "Close preview" })).toBeNull();
  });
  it("guards a loaded external form on close and keeps it after Stay here", async () => {
    mount();
    const trigger = await openForm();
    const close = screen.getByRole("button", { name: "Close preview" });
    close.focus();
    fireEvent.click(close);
    expect(await screen.findByRole("alertdialog")).toBeTruthy();
    expect(document.querySelector("iframe")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Stay here" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(close));
    expect(document.querySelector("iframe")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close preview" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard and leave" }));
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(document.querySelector("iframe")).toBeNull();
  });
  it("does not carry the previous profile's loaded frame or consent into a new profile", async () => {
    const { router } = mount();
    await openForm();
    await act(async () => router.navigate("/l/other"));
    expect(await screen.findByRole("alertdialog")).toBeTruthy();
    expect(screen.getByLabelText("Current route").textContent).toBe(
      "/l/fictional",
    );
    fireEvent.click(screen.getByRole("button", { name: "Discard and leave" }));
    expect(
      await screen.findByRole("heading", {
        name: "Fictional hub other",
        level: 1,
      }),
    ).toBeTruthy();
    expect(document.querySelector("iframe")).toBeNull();
    expect(screen.queryByRole("button", { name: "Close preview" })).toBeNull();
  });
  it("requires discard before switching a loaded form and focuses the new consent heading", async () => {
    mount();
    await openForm();
    const video = screen.getByRole("button", {
      name: "Fictional video (opens a preview)",
    });
    video.focus();
    fireEvent.click(video);
    expect(await screen.findByRole("alertdialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Stay here" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(document.querySelector("iframe")?.getAttribute("title")).toBe(
      "Fictional external form",
    );
    video.focus();
    fireEvent.click(video);
    fireEvent.click(screen.getByRole("button", { name: "Discard and leave" }));
    const heading = await screen.findByRole("heading", {
      name: "Fictional video",
      level: 2,
    });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(document.querySelector("iframe")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close preview" }));
    await waitFor(() => expect(document.activeElement).toBe(video));
  });
  it("rejects malformed public link URLs while preserving other usable links", async () => {
    const result = fixture();
    result.profile.links.push({
      ...result.profile.links[0],
      id: "fictional-unsafe",
      title: "Unsafe entry",
      url: "javascript:alert(1)",
    });
    apiMock.mockImplementation((path: string) =>
      Promise.resolve(
        path.startsWith("/linktree/")
          ? result
          : {
              settings: [],
              pages: [],
              navigation: [],
              footer: [],
              social: [],
              metrics: [],
              sponsors: [],
            },
      ),
    );
    mount();
    await screen.findByRole("heading", { name: "Fictional hub fictional" });
    expect(screen.queryByText("Unsafe entry")).toBeNull();
    expect(
      screen.getByRole("link", { name: /Developer documentation/ }),
    ).toBeTruthy();
  });
  it("recovers from a generic public load error without disclosing a private profile", async () => {
    const ready = fixture();
    let requests = 0;
    apiMock.mockImplementation((path: string) =>
      path === "/linktree/fictional"
        ? ++requests === 1
          ? Promise.reject(
              new ApiFailure(
                503,
                "TEMPORARILY_UNAVAILABLE",
                "internal detail must not render",
              ),
            )
          : Promise.resolve(ready)
        : Promise.resolve({
            settings: [],
            pages: [],
            navigation: [],
            footer: [],
            social: [],
            metrics: [],
            sponsors: [],
          }),
    );
    mount();
    expect(
      await screen.findByRole("heading", { name: "Link page unavailable" }),
    ).toBeTruthy();
    expect(screen.queryByText(/internal detail/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("heading", {
        name: "Fictional hub fictional",
        level: 1,
      }),
    ).toBeTruthy();
  });
});
