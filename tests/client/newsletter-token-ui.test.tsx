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
  RouterProvider,
  useParams,
} from "react-router-dom";
import NewsletterTokenPage from "../../src/ui/NewsletterTokenPage";
import NavigationSafety from "../../src/ui/NavigationSafety";
import CapabilityBoundary from "../../src/ui/CapabilityBoundary";
import { ApiFailure } from "../../src/lib/api";
const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: apiMock,
}));
const routers: ReturnType<typeof createMemoryRouter>[] = [];
const first = "a".repeat(43),
  second = "b".repeat(43);
function pending<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
function Page() {
  const { kind } = useParams();
  return (
    <CapabilityBoundary names={["token"]} allowQuery>
      <main id="main-content" tabIndex={-1}>
        <NewsletterTokenPage
          kind={kind === "confirm" ? "confirm" : "unsubscribe"}
        />
      </main>
    </CapabilityBoundary>
  );
}
function mount(kind = "confirm", token = first, guard = true) {
  const url = `/newsletter/${kind}${token ? "#token=" + token : ""}`;
  window.history.replaceState({}, "", url);
  const router = createMemoryRouter(
    [
      {
        path: "/newsletter/:kind",
        element: guard ? (
          <NavigationSafety>
            <Page />
          </NavigationSafety>
        ) : (
          <Page />
        ),
      },
      { path: "/", element: <h1>Fictional home</h1> },
    ],
    { initialEntries: [url], future: { v7_relativeSplatPath: true } },
  );
  routers.push(router);
  render(
    <RouterProvider router={router} future={{ v7_startTransition: true }} />,
  );
  return router;
}
const mutations = () =>
  apiMock.mock.calls.filter(([path]) => !path.endsWith("/validate"));
beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockImplementation((path: string) =>
    Promise.resolve(
      path.endsWith("/validate")
        ? { valid: true, applied: false }
        : { updated: true },
    ),
  );
});
afterEach(() => {
  cleanup();
  for (const router of routers.splice(0)) router.dispose();
  window.history.replaceState({}, "", "/");
});
describe("Newsletter validation before preference mutation", () => {
  it.each([
    ["confirm", "Confirm subscription"],
    ["unsubscribe", "Unsubscribe"],
  ])("reviews %s without auto-consuming the link", async (kind, label) => {
    mount(kind);
    await screen.findByRole("button", { name: label, exact: true });
    expect(apiMock).toHaveBeenCalledTimes(1);
    expect(apiMock.mock.calls[0][0]).toBe(`/newsletter/${kind}/validate`);
    expect(mutations()).toHaveLength(0);
    expect(location.hash).toBe("");
    expect(document.body.textContent).not.toContain(first);
    expect(
      document.querySelector('meta[name="robots"]')?.getAttribute("content"),
    ).toBe("noindex, nofollow");
  });
  it("blocks duplicates and waits for committed success before focusing confirmation", async () => {
    const request = pending<{ updated: boolean }>();
    apiMock.mockImplementation((path: string) =>
      path.endsWith("/validate")
        ? Promise.resolve({ valid: true, applied: false })
        : request.promise,
    );
    mount();
    const button = await screen.findByRole("button", {
      name: "Confirm subscription",
      exact: true,
    });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(mutations()).toHaveLength(1);
    expect(
      (screen.getByRole("button", { name: "Saving…" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      screen.queryByRole("heading", { name: "You’re on the list." }),
    ).toBeNull();
    await act(async () => request.resolve({ updated: true }));
    const heading = await screen.findByRole("heading", {
      name: "You’re on the list.",
    });
    await waitFor(() => expect(document.activeElement).toBe(heading));
  });
  it("does not request a missing token or echo it into the invalid state", async () => {
    mount("confirm", "");
    await screen.findByRole("heading", {
      name: "This link is no longer available.",
    });
    expect(apiMock).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Confirm subscription" }),
    ).toBeNull();
  });
  it("shows invalid validation without offering a mutation", async () => {
    apiMock.mockResolvedValue({ valid: false, applied: false });
    mount();
    await screen.findByRole("heading", {
      name: "This link is no longer available.",
    });
    expect(mutations()).toHaveLength(0);
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("shows an already-applied result without consuming again", async () => {
    apiMock.mockResolvedValue({ valid: true, applied: true });
    mount("unsubscribe");
    await screen.findByRole("heading", { name: "You’re unsubscribed." });
    expect(mutations()).toHaveLength(0);
  });
  it("retries a failed read-only check and focuses its recovered decision", async () => {
    let attempts = 0;
    apiMock.mockImplementation(() =>
      ++attempts === 1
        ? Promise.reject(Error("Fictional outage"))
        : Promise.resolve({ valid: true, applied: false }),
    );
    mount();
    await screen.findByRole("heading", {
      name: "This link could not be checked.",
    });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    const heading = await screen.findByRole("heading", {
      name: "Confirm your subscription.",
    });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(mutations()).toHaveLength(0);
  });
  it("describes an ambiguous commit honestly and retries the same capability", async () => {
    let attempts = 0;
    apiMock.mockImplementation((path: string) =>
      path.endsWith("/validate")
        ? Promise.resolve({ valid: true, applied: false })
        : ++attempts === 1
          ? Promise.reject(Error("Fictional lost response"))
          : Promise.resolve({ updated: true }),
    );
    mount("unsubscribe");
    fireEvent.click(
      await screen.findByRole("button", { name: "Unsubscribe", exact: true }),
    );
    await screen.findByRole("heading", {
      name: "We couldn’t confirm the result.",
    });
    expect(screen.getByText(/The change may have completed/)).toBeTruthy();
    expect(screen.queryByText(/preferences have not been changed/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByRole("heading", { name: "You’re unsubscribed." });
    expect(mutations()).toHaveLength(2);
    expect(mutations()[0][1].body).toEqual(mutations()[1][1].body);
  });
  it("handles expiry between validation and the final POST without claiming success", async () => {
    apiMock.mockImplementation((path: string) =>
      path.endsWith("/validate")
        ? Promise.resolve({ valid: true, applied: false })
        : Promise.reject(new ApiFailure(410, "TOKEN_EXPIRED", "Unavailable")),
    );
    mount();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Confirm subscription",
        exact: true,
      }),
    );
    await screen.findByRole("heading", {
      name: "This link is no longer available.",
    });
    expect(
      screen.queryByRole("heading", { name: "You’re on the list." }),
    ).toBeNull();
  });
  it("aborts an old token mutation when a genuine capability replacement mounts", async () => {
    const old = pending<{ updated: boolean }>();
    apiMock.mockImplementation((path: string) =>
      path.endsWith("/validate")
        ? Promise.resolve({ valid: true, applied: false })
        : old.promise,
    );
    const router = mount("confirm", first, false);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Confirm subscription",
        exact: true,
      }),
    );
    const signal = mutations()[0][1].signal;
    await act(async () => {
      const next = "/newsletter/unsubscribe#token=" + second;
      window.history.replaceState({}, "", next);
      await router.navigate(next);
    });
    await screen.findByRole("button", { name: "Unsubscribe", exact: true });
    expect(signal.aborted).toBe(true);
    await act(async () => old.resolve({ updated: true }));
    expect(
      screen.queryByRole("heading", { name: "You’re on the list." }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Unsubscribe", exact: true }),
    ).toBeTruthy();
  });
  it("retains the pending navigation safeguard until the preference operation finishes", async () => {
    const request = pending<{ updated: boolean }>();
    apiMock.mockImplementation((path: string) =>
      path.endsWith("/validate")
        ? Promise.resolve({ valid: true, applied: false })
        : request.promise,
    );
    mount();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Confirm subscription",
        exact: true,
      }),
    );
    fireEvent.click(screen.getByRole("link", { name: "Return home" }));
    await screen.findByRole("alertdialog");
    expect(
      screen.queryByRole("button", { name: "Discard and leave" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Stay here" }));
    await act(async () => request.resolve({ updated: true }));
    await screen.findByRole("heading", { name: "You’re on the list." });
  });
});
