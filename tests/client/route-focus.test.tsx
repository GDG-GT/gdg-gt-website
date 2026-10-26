// @vitest-environment jsdom
import React, { useEffect, useRef, useState } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  createMemoryRouter,
  Link,
  RouterProvider,
  useLocation,
} from "react-router-dom";
import RouteFocus from "../../src/ui/RouteFocus";
import NavigationSafety from "../../src/ui/NavigationSafety";
import { useDraftGuard } from "../../src/hooks/useDraftGuard";
const routers: ReturnType<typeof createMemoryRouter>[] = [];
function Page({
  customFocus = false,
  landmark = true,
}: {
  customFocus?: boolean;
  landmark?: boolean;
}) {
  const location = useLocation(),
    [dirty, setDirty] = useState(false),
    heading = useRef<HTMLHeadingElement>(null),
    previous = useRef(location.pathname);
  useDraftGuard(dirty, { privateDraft: false, label: "Fictional page draft" });
  useEffect(() => {
    if (previous.current !== location.pathname && customFocus)
      heading.current?.focus();
    previous.current = location.pathname;
  }, [location.pathname, customFocus]);
  const privatePage =
    location.pathname.startsWith("/admin") &&
    !location.pathname.startsWith("/admin/invite/");
  return (
    <>
      <RouteFocus />
      <nav aria-label="Test pages">
        <Link to="/events">Events</Link>
        <Link to="/admin/forms">Forms workspace</Link>
        <Link to="/team">Team</Link>
      </nav>
      <main
        id={
          landmark
            ? privatePage
              ? "workspace-content"
              : "main-content"
            : undefined
        }
        tabIndex={-1}
        key={location.pathname}
      >
        <h1 ref={heading} tabIndex={-1}>
          Fictional destination
        </h1>
        <label>
          Fictional draft
          <input onChange={() => setDirty(true)} />
        </label>
        <button>Local action</button>
      </main>
    </>
  );
}
function mount(initial = "/", options = {}) {
  const router = createMemoryRouter(
    [
      {
        path: "*",
        element: (
          <NavigationSafety>
            <Page {...options} />
          </NavigationSafety>
        ),
      },
    ],
    { initialEntries: [initial], future: { v7_relativeSplatPath: true } },
  );
  routers.push(router);
  render(
    <RouterProvider router={router} future={{ v7_startTransition: true }} />,
  );
  return router;
}
afterEach(() => {
  cleanup();
  for (const r of routers.splice(0)) r.dispose();
});
describe("Page navigation focus", () => {
  it("does not move focus on initial mounting", () => {
    mount();
    expect(document.activeElement).toBe(document.body);
  });
  it("moves from a navigation link to the persistent public content landmark on page changes", async () => {
    mount();
    const link = screen.getByRole("link", { name: "Events" });
    link.focus();
    fireEvent.click(link);
    await waitFor(() =>
      expect(document.activeElement?.id).toBe("main-content"),
    );
  });
  it("selects the workspace landmark across the public/admin boundary", async () => {
    const r = mount();
    await act(async () => {
      await r.navigate("/admin/forms");
    });
    expect(document.activeElement?.id).toBe("workspace-content");
    await act(async () => {
      await r.navigate("/team");
    });
    expect(document.activeElement?.id).toBe("main-content");
  });
  it("keeps invitation routes on the public landmark", async () => {
    const r = mount("/admin/forms");
    await act(async () => {
      await r.navigate("/admin/invite/fictional");
    });
    expect(document.activeElement?.id).toBe("main-content");
  });
  it("preserves local control focus across filters, pagination, editor tabs and fragments", async () => {
    const r = mount("/events");
    const button = screen.getByRole("button", { name: "Local action" });
    button.focus();
    for (const path of [
      "/events?status=past",
      "/events?page=2",
      "/events?page=2#registration",
    ]) {
      await act(async () => {
        await r.navigate(path);
      });
      expect(document.activeElement).toBe(button);
    }
    await act(async () => {
      await r.navigate("/admin/forms");
    });
    const privateButton = screen.getByRole("button", { name: "Local action" });
    privateButton.focus();
    await act(async () => {
      await r.navigate("/admin/forms?tab=responses");
    });
    expect(document.activeElement).toBe(privateButton);
  });
  it("moves focus for a changed contact inquiry without reacting to cosmetic query values", async () => {
    const r = mount("/contact?type=membership");
    const button = screen.getByRole("button", { name: "Local action" });
    button.focus();
    await act(async () => {
      await r.navigate("/contact?type=membership&ref=fictional");
    });
    expect(document.activeElement).toBe(button);
    await act(async () => {
      await r.navigate("/contact?type=sponsorship");
    });
    expect(document.activeElement?.id).toBe("main-content");
  });
  it("keeps the previous page focus on Stay and focuses the accepted destination after Discard", async () => {
    mount();
    fireEvent.change(screen.getByLabelText("Fictional draft"), {
      target: { value: "Unsaved fictional draft" },
    });
    const link = screen.getByRole("link", { name: "Events" });
    link.focus();
    fireEvent.click(link);
    await screen.findByRole("alertdialog");
    fireEvent.click(screen.getByRole("button", { name: "Stay here" }));
    await waitFor(() => expect(document.activeElement).toBe(link));
    fireEvent.click(link);
    await screen.findByRole("alertdialog");
    fireEvent.click(screen.getByRole("button", { name: "Discard and leave" }));
    await waitFor(() =>
      expect(document.activeElement?.id).toBe("main-content"),
    );
  });
  it("allows a destination's more specific focus to take precedence", async () => {
    const r = mount("/", { customFocus: true });
    await act(async () => {
      await r.navigate("/events");
    });
    expect(document.activeElement).toBe(screen.getByRole("heading"));
  });
  it("ignores frames without a matching public or workspace landmark", async () => {
    const r = mount("/", { landmark: false });
    await act(async () => {
      await r.navigate("/admin/content");
    });
    expect(document.activeElement).toBe(document.body);
  });
});
