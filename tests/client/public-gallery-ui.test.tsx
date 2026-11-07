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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import PublicGallery from "../../src/ui/media/PublicGallery";
import { ContentProvider } from "../../src/contexts/ContentContext";
const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: apiMock,
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
const eventId = "f1080000-0000-4000-8000-000000000001";
const photo = (id = "one", download = false) => ({
  id,
  url: "/api/v1/media/public/" + id,
  srcSet: `/api/v1/media/public/${id}?width=360 360w`,
  alt_text: `Fictional photo ${id}`,
  description: `Fictional caption ${id}`,
  width: 960,
  height: 640,
  event_id: eventId,
  event_title: "Fictional workshop",
  downloadUrl: download
    ? `/api/v1/media/public/${id}?width=1920&download=true`
    : null,
});
const listing = (items = [photo(), photo("two", true)], extra = {}) => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 30,
  events: [{ id: eventId, title: "Fictional workshop" }],
  ...extra,
});
const routers: ReturnType<typeof createMemoryRouter>[] = [];
function mount(url = "/gallery") {
  const router = createMemoryRouter(
    [
      {
        path: "/gallery",
        element: (
          <ContentProvider>
            <main id="main-content" tabIndex={-1}>
              <PublicGallery />
            </main>
          </ContentProvider>
        ),
      },
    ],
    { initialEntries: [url] },
  );
  routers.push(router);
  render(<RouterProvider router={router} />);
  return router;
}
beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockImplementation((path: string) =>
    Promise.resolve(path === "/public/home" ? home : listing()),
  );
});
afterEach(() => {
  cleanup();
  for (const router of routers.splice(0)) router.dispose();
});
describe("Public gallery controls and lightbox", () => {
  it("restores shared filters and page, and resets pagination when the event changes", async () => {
    const router = mount(`/gallery?event=${eventId}&page=2`);
    await screen.findByRole("button", {
      name: "View photo: Fictional photo one",
    });
    expect(apiMock).toHaveBeenCalledWith(
      `/gallery?page=2&event=${eventId}`,
      expect.anything(),
    );
    expect(
      (screen.getByLabelText("Filter by event") as HTMLSelectElement).value,
    ).toBe(eventId);
    fireEvent.change(screen.getByLabelText("Filter by event"), {
      target: { value: "" },
    });
    await waitFor(() => expect(router.state.location.search).toBe(""));
    expect(apiMock).toHaveBeenLastCalledWith(
      "/gallery?page=1",
      expect.anything(),
    );
  });
  it("focuses captions during arrow browsing and returns to the original photo on close", async () => {
    mount();
    const opener = await screen.findByRole("button", {
      name: "View photo: Fictional photo one",
    });
    opener.focus();
    fireEvent.click(opener);
    const dialog = await screen.findByRole("dialog");
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(dialog).getByRole("heading", { name: "Fictional caption one" }),
      ),
    );
    fireEvent.keyDown(dialog, { key: "ArrowRight" });
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(dialog).getByRole("heading", { name: "Fictional caption two" }),
      ),
    );
    expect(
      within(dialog).getByRole("link", {
        name: "Download approved WebP image",
      }),
    ).toBeTruthy();
    fireEvent.keyDown(dialog, { key: "ArrowRight" });
    await within(dialog).findByRole("heading", {
      name: "Fictional caption one",
    });
    expect(
      within(dialog).queryByRole("link", {
        name: "Download approved WebP image",
      }),
    ).toBeNull();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Close", exact: true }),
    );
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });
  it("keeps previous/next controls usable and reports the current photo", async () => {
    mount();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "View photo: Fictional photo one",
      }),
    );
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Next photo →" }),
    );
    expect(within(dialog).getByText("2 / 2")).toBeTruthy();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "← Previous photo" }),
    );
    expect(within(dialog).getByText("1 / 2")).toBeTruthy();
  });
  it("disables browsing for a single image", async () => {
    apiMock.mockImplementation((path: string) =>
      Promise.resolve(path === "/public/home" ? home : listing([photo()])),
    );
    mount();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "View photo: Fictional photo one",
      }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(
      (
        within(dialog).getByRole("button", {
          name: "Next photo →",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        within(dialog).getByRole("button", {
          name: "← Previous photo",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
  it("preserves captions and controls when thumbnail and lightbox images fail", async () => {
    mount();
    const opener = await screen.findByRole("button", {
      name: "View photo: Fictional photo one",
    });
    fireEvent.error(within(opener).getByRole("img"));
    expect(within(opener).getByText(/Photo unavailable/)).toBeTruthy();
    fireEvent.click(opener);
    const dialog = await screen.findByRole("dialog");
    fireEvent.error(within(dialog).getByRole("img"));
    expect(within(dialog).getByText(/This photo could not load/)).toBeTruthy();
    expect(
      within(dialog).getByRole("heading", { name: "Fictional caption one" }),
    ).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Close" })).toBeTruthy();
  });
  it("reports a failed request without claiming an empty gallery and retries with retained landmark focus", async () => {
    let attempts = 0;
    apiMock.mockImplementation((path: string) =>
      path === "/public/home"
        ? Promise.resolve(home)
        : ++attempts === 1
          ? Promise.reject(Error("Fictional outage"))
          : Promise.resolve(listing()),
    );
    mount();
    await screen.findByRole("alert");
    expect(screen.queryByText("More moments are on the way")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByRole("button", {
      name: "View photo: Fictional photo one",
    });
    expect(document.activeElement?.id).toBe("main-content");
  });
  it("offers recovery for an out-of-range page and keeps the event filter", async () => {
    apiMock.mockImplementation((path: string) =>
      Promise.resolve(
        path === "/public/home" ? home : listing([], { page: 7 }),
      ),
    );
    const router = mount(`/gallery?event=${eventId}&page=7`);
    fireEvent.click(
      await screen.findByRole("button", { name: "Back to first page" }),
    );
    await waitFor(() =>
      expect(router.state.location.search).toContain("page=1"),
    );
    expect(router.state.location.search).toContain("event=" + eventId);
    expect(document.activeElement?.id).toBe("main-content");
  });
  it("ignores an old filtered response after navigating to another result set", async () => {
    let resolve!: (value: ReturnType<typeof listing>) => void;
    const old = new Promise<ReturnType<typeof listing>>((yes) => {
      resolve = yes;
    });
    apiMock.mockImplementation((path: string) =>
      path === "/public/home"
        ? Promise.resolve(home)
        : path.includes("page=2")
          ? old
          : Promise.resolve(listing([photo("current")])),
    );
    const router = mount("/gallery?page=2");
    await act(async () => {
      await router.navigate("/gallery?page=1");
    });
    await screen.findByRole("button", {
      name: "View photo: Fictional photo current",
    });
    await act(async () => resolve(listing([photo("outdated")], { page: 2 })));
    expect(
      screen.queryByRole("button", {
        name: "View photo: Fictional photo outdated",
      }),
    ).toBeNull();
  });
});
