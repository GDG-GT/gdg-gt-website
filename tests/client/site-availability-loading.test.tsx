// @vitest-environment jsdom
import React, { useEffect } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";
import SiteAvailability from "../../src/ui/status/SiteAvailability";
const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: apiMock }));
const live = {
  revision: 1,
  is_live: true,
  message: "",
  redirect_url: "",
  button_text: "Chapter updates",
  auto_redirect: false,
};
const saved = new Map<string, string>();
beforeEach(() => {
  saved.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => saved.set(key, value),
  });
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});
function mount(path = "/") {
  let resolve!: (v: unknown) => void,
    reject!: (e: Error) => void,
    mounts = 0;
  apiMock.mockReturnValue(
    new Promise((a, b) => {
      resolve = a;
      reject = b;
    }),
  );
  function Content() {
    const location = useLocation();
    useEffect(() => {
      mounts++;
    }, []);
    return (
      <main>
        <h1>Fictional public identity</h1>
        <button>Fictional action</button>
        <p data-testid="path">{location.pathname}</p>
      </main>
    );
  }
  render(
    <MemoryRouter initialEntries={[path]}>
      <SiteAvailability>
        <Content />
      </SiteAvailability>
    </MemoryRouter>,
  );
  return { resolve, reject, mounts: () => mounts };
}
describe("progressive homepage availability", () => {
  it("renders identity immediately while native inert blocks controls, then unlocks without remounting", async () => {
    const f = mount(),
      main = screen.getByRole("main"),
      frame = main.parentElement!;
    expect(frame.inert).toBe(true);
    expect(screen.getByRole("status").textContent).toContain(
      "Checking site availability",
    );
    await act(async () => {
      f.resolve(live);
    });
    await waitFor(() => expect(frame.inert).toBe(false));
    expect(screen.getByRole("main")).toBe(main);
    expect(f.mounts()).toBe(1);
    expect(screen.queryByRole("status")).toBeNull();
  });
  it("keeps maintenance content noninteractive until the exempt destination replaces it", async () => {
    const f = mount();
    await act(async () => {
      f.resolve({ ...live, is_live: false, message: "Fictional maintenance" });
    });
    await waitFor(() =>
      expect(screen.getByTestId("path").textContent).toBe("/maintenance"),
    );
    expect(screen.getByRole("main").parentElement!.inert).toBe(false);
    expect(f.mounts()).toBe(1);
  });
  it("unlocks existing public fallback content after an unavailable status read", async () => {
    const f = mount(),
      main = screen.getByRole("main");
    await act(async () => {
      f.reject(Error("Fictional availability interruption"));
    });
    await waitFor(() => expect(main.parentElement!.inert).toBe(false));
    expect(screen.getByRole("main")).toBe(main);
    expect(f.mounts()).toBe(1);
  });
  it("retains initial blocking for other public pages and preserves exempt workspace access", async () => {
    const f = mount("/events");
    expect(screen.queryByRole("main")).toBeNull();
    await act(async () => {
      f.resolve(live);
    });
    await screen.findByRole("main");
    cleanup();
    mount("/admin/forms");
    expect(screen.getByRole("main").parentElement!.inert).toBe(false);
  });
});
