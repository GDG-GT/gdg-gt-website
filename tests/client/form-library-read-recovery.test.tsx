// @vitest-environment jsdom
import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { useFormLibrary } from "../../src/ui/forms/api";
import FormsLibrary from "../../src/ui/forms/FormsLibrary";
import { createTemplate } from "../../shared/forms";
import { ApiFailure } from "../../src/lib/api";
const { apiMock, actor, guard, allow } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  actor: { id: "fictional-library-admin", role: "admin" },
  guard: vi.fn(),
  allow: vi.fn((run: () => void) => run()),
}));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: apiMock,
}));
vi.mock("@/contexts/AdminContext", () => ({
  useAdmin: () => ({ currentAdmin: actor, isSuperAdmin: false }),
}));
vi.mock("@/hooks/useDraftGuard", () => ({
  useDraftGuard: guard,
  useNavigationSafety: () => ({ allow }),
}));
const form = {
  ...createTemplate("Fictional retained library form", "interest"),
  id: "f1660000-0000-4000-8000-000000000001",
  revision: 1,
  actions: ["view", "edit", "publish", "delete"],
  canDuplicate: true,
  responseCount: 0,
};
let fail: Error | undefined;
const listing = () => ({
  items: [structuredClone(form)],
  total: 1,
  page: 1,
  pageSize: 30,
  canCreate: true,
});
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function panel() {
  return (
    <MemoryRouter>
      <main id="workspace-content" tabIndex={-1}>
        <FormsLibrary />
      </main>
    </MemoryRouter>
  );
}
beforeEach(() => {
  fail = undefined;
  actor.id = "fictional-library-admin";
  actor.role = "admin";
  guard.mockReset();
  allow.mockClear();
  apiMock.mockReset().mockImplementation(async (_path, options = {}) => {
    if (options.method)
      throw Error("No mutation is authorized by this read-only test.");
    if (fail) throw fail;
    return listing();
  });
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: true,
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("Form library private saved-read recovery", () => {
  it("keeps denial blocked across local filter clearing until explicit access recheck", async () => {
    const hook = renderHook(({ q }) => useFormLibrary(q), {
      initialProps: { q: "q=private-filter" },
    });
    await waitFor(() => expect(hook.result.current.items).toHaveLength(1));
    fail = new ApiFailure(403, "DENIED", "Fictional filtered access denied");
    await act(async () => {
      await hook.result.current.reload();
    });
    const reads = apiMock.mock.calls.length;
    hook.rerender({ q: "q=" });
    expect(hook.result.current.denied).toBe(true);
    await act(async () => {});
    expect(apiMock).toHaveBeenCalledTimes(reads);
    expect(hook.result.current.items).toEqual([]);
    fail = undefined;
    await act(async () => {
      await hook.result.current.reload();
    });
    expect(hook.result.current.items).toHaveLength(1);
  });
  it("retains a matching timestamped inventory after refresh failure, withholding creation authority", async () => {
    const hook = renderHook(() => useFormLibrary("page=1"));
    await waitFor(() => expect(hook.result.current.items).toHaveLength(1));
    const at = hook.result.current.at;
    fail = new ApiFailure(503, "UNAVAILABLE", "Fictional inventory outage");
    await act(async () => {
      await hook.result.current.reload();
    });
    expect(hook.result.current.items[0].title).toBe(form.title);
    expect(hook.result.current.at).toBe(at);
    expect(hook.result.current.error).toBe("Fictional inventory outage");
    expect(hook.result.current.canCreate).toBe(false);
    fail = undefined;
    await act(async () => {
      await hook.result.current.reload();
    });
    expect(hook.result.current.canCreate).toBe(true);
    expect(apiMock.mock.calls.every(([, o]) => !o.method)).toBe(true);
  });
  it.each([401, 403, 404])(
    "clears the inventory on %s and requires explicit current-access recheck",
    async (status) => {
      const hook = renderHook(() => useFormLibrary("page=1"));
      await waitFor(() => expect(hook.result.current.items).toHaveLength(1));
      fail = new ApiFailure(status, "DENIED", "Fictional library denied");
      await act(async () => {
        await hook.result.current.reload();
      });
      expect(hook.result.current.items).toEqual([]);
      expect(hook.result.current.at).toBeUndefined();
      expect(hook.result.current.denied).toBe(true);
      const reads = apiMock.mock.calls.length;
      await act(async () => {});
      expect(apiMock).toHaveBeenCalledTimes(reads);
      fail = undefined;
      await act(async () => {
        await hook.result.current.reload();
      });
      expect(hook.result.current.items).toHaveLength(1);
    },
  );
  it("clears on session replacement without starting an automatic read", async () => {
    const hook = renderHook(() => useFormLibrary("page=1"));
    await waitFor(() => expect(hook.result.current.items).toHaveLength(1));
    const count = apiMock.mock.calls.length;
    fireEvent(window, new Event("gdg:session-cleared"));
    expect(hook.result.current.items).toEqual([]);
    expect(hook.result.current.denied).toBe(true);
    expect(apiMock).toHaveBeenCalledTimes(count);
  });
  it("refuses old reload callbacks after identity/filter replacement and unmount", async () => {
    const hook = renderHook(({ q }) => useFormLibrary(q), {
      initialProps: { q: "page=1" },
    });
    await waitFor(() => expect(hook.result.current.items).toHaveLength(1));
    const old = hook.result.current.reload;
    actor.id = "fictional-other-library-admin";
    hook.rerender({ q: "page=1&q=other" });
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    const count = apiMock.mock.calls.length;
    await act(async () => {
      await old();
    });
    expect(apiMock).toHaveBeenCalledTimes(count);
    const current = hook.result.current.reload;
    hook.unmount();
    await current();
    expect(apiMock).toHaveBeenCalledTimes(count);
  });
  it("aborts a superseded refresh and ignores its late inventory", async () => {
    const old = deferred<ReturnType<typeof listing>>();
    const hook = renderHook(() => useFormLibrary("page=1"));
    await waitFor(() => expect(hook.result.current.items).toHaveLength(1));
    apiMock.mockReturnValueOnce(old.promise);
    let pending!: Promise<void>;
    act(() => {
      pending = hook.result.current.reload();
    });
    const signal = apiMock.mock.calls[1][1].signal;
    await act(async () => {
      await hook.result.current.reload();
    });
    expect(signal.aborted).toBe(true);
    await act(async () => {
      old.resolve({
        ...listing(),
        items: [{ ...form, title: "Fictional obsolete inventory" }],
      });
      await pending;
    });
    expect(hook.result.current.items[0].title).toBe(form.title);
  });
});
describe("Form library read feedback and retained proposals", () => {
  it("guards a retained title after closing creation and clears it only after confirmed creation navigation", async () => {
    render(panel());
    await screen.findByRole("link", {
      name: /Fictional retained library form/,
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create form", exact: true }),
    );
    fireEvent.change(await screen.findByLabelText(/Form title/), {
      target: { value: "Fictional guarded creation proposal" },
    });
    fireEvent.keyDown(screen.getByRole("dialog"), {
      key: "Escape",
      code: "Escape",
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(guard.mock.lastCall).toEqual([
      true,
      expect.objectContaining({ label: "New form draft" }),
    ]);
    apiMock.mockImplementation(async (_path, options = {}) =>
      options.method
        ? { form: { ...form, title: "Fictional guarded creation proposal" } }
        : listing(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Create form", exact: true }),
    );
    const submit = within(await screen.findByRole("dialog")).getByRole(
      "button",
      { name: "Create form", exact: true },
    );
    await waitFor(() => expect(submit).toHaveProperty("disabled", false));
    fireEvent.click(submit);
    await waitFor(() => expect(allow).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(guard.mock.lastCall?.[0]).toBe(false);
    expect(apiMock.mock.calls.filter(([, o]) => o.method)).toHaveLength(1);
  });
  it("does not move focus into a different filter after an obsolete refresh completes", async () => {
    const old = deferred<ReturnType<typeof listing>>();
    render(panel());
    await screen.findByRole("link", {
      name: /Fictional retained library form/,
    });
    apiMock.mockReturnValueOnce(old.promise);
    fireEvent.click(
      screen.getByRole("button", { name: "Recheck form library", exact: true }),
    );
    const search = screen.getByRole("searchbox", { name: "Search forms" });
    search.focus();
    fireEvent.change(search, { target: { value: "different filter" } });
    await screen.findByRole("link", {
      name: /Fictional retained library form/,
    });
    await act(async () => old.resolve(listing()));
    expect(document.activeElement).toBe(search);
  });
  it.each(["account", "role", "session"])(
    "clears a private new-form title across %s replacement",
    async (kind) => {
      const view = render(panel());
      await screen.findByRole("link", {
        name: /Fictional retained library form/,
      });
      fireEvent.click(
        screen.getByRole("button", { name: "Create form", exact: true }),
      );
      fireEvent.change(await screen.findByLabelText(/Form title/), {
        target: { value: "Fictional context-bound proposal" },
      });
      if (kind === "session")
        fireEvent(window, new Event("gdg:session-cleared"));
      else {
        if (kind === "account") actor.id = "fictional-other-library-account";
        else actor.role = "team_member";
        view.rerender(panel());
      }
      await waitFor(() =>
        expect(
          screen.queryByDisplayValue("Fictional context-bound proposal"),
        ).toBeNull(),
      );
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(apiMock.mock.calls.every(([, o]) => !o.method)).toBe(true);
    },
  );
  it("keeps first read failure separate from an empty inventory and focuses its explicit retry", async () => {
    fail = new Error("Fictional initial library failure");
    render(panel());
    await screen.findByText(/Fictional initial library failure/);
    expect(screen.queryByText("No forms are available")).toBeNull();
    expect(screen.queryByText("Matching forms")).toBeNull();
    fail = undefined;
    fireEvent.click(
      screen.getByRole("button", { name: "Recheck form library", exact: true }),
    );
    await screen.findByRole("link", {
      name: /Fictional retained library form/,
    });
    expect(document.activeElement?.id).toBe("form-library-read-status");
    expect(apiMock.mock.calls.every(([, o]) => !o.method)).toBe(true);
  });
  it("keeps populated rows visible after failure and pauses write menu items", async () => {
    render(panel());
    await screen.findByRole("link", {
      name: /Fictional retained library form/,
    });
    fail = new Error("Fictional refresh outage");
    fireEvent.click(
      screen.getByRole("button", { name: "Recheck form library", exact: true }),
    );
    await screen.findByText(/Fictional refresh outage/);
    expect(
      screen.getByRole("link", { name: /Fictional retained library form/ }),
    ).toBeTruthy();
    expect(screen.getByText(/Last successful form library read/)).toBeTruthy();
    expect(
      screen.getByRole("region", { name: "Form inventory table" }),
    ).toHaveProperty("tabIndex", 0);
    fireEvent.keyDown(
      screen.getByRole("button", { name: "Actions for " + form.title }),
      { key: "Enter" },
    );
    for (const name of ["Duplicate", "Archive form"])
      expect(
        (await screen.findByRole("menuitem", { name })).getAttribute(
          "aria-disabled",
        ),
      ).toBe("true");
    expect(apiMock.mock.calls.every(([, o]) => !o.method)).toBe(true);
  });
  it("retains a proposed creation title through failed access refresh then clears it on denial", async () => {
    render(panel());
    await screen.findByRole("link", {
      name: /Fictional retained library form/,
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create form", exact: true }),
    );
    const dialog = await screen.findByRole("dialog");
    const input = within(dialog).getByLabelText(/Form title/);
    fireEvent.change(input, {
      target: { value: "Fictional private proposed title" },
    });
    fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fail = new ApiFailure(
      503,
      "UNAVAILABLE",
      "Fictional creation access outage",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Create form", exact: true }),
    );
    await screen.findByText(/Your proposed title remains on this page/);
    expect(screen.getByLabelText(/Form title/)).toHaveProperty(
      "value",
      "Fictional private proposed title",
    );
    expect(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Create form",
        exact: true,
      }),
    ).toHaveProperty("disabled", true);
    fail = new ApiFailure(403, "DENIED", "Fictional creation access denied");
    fireEvent.click(
      screen.getByRole("button", { name: "Recheck form creation access" }),
    );
    await screen.findByRole("heading", {
      name: "Form library access needs to be rechecked",
    });
    expect(
      screen.queryByDisplayValue("Fictional private proposed title"),
    ).toBeNull();
    expect(
      screen.queryByRole("link", { name: /Fictional retained library form/ }),
    ).toBeNull();
    fail = undefined;
    fireEvent.click(
      screen.getByRole("button", { name: "Recheck form library access" }),
    );
    await screen.findByRole("link", {
      name: /Fictional retained library form/,
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create form", exact: true }),
    );
    expect(await screen.findByLabelText(/Form title/)).toHaveProperty(
      "value",
      "",
    );
    expect(apiMock.mock.calls.every(([, o]) => !o.method)).toBe(true);
  });
  it("pauses writes and read retries offline without issuing another request", async () => {
    render(panel());
    await screen.findByRole("link", {
      name: /Fictional retained library form/,
    });
    const count = apiMock.mock.calls.length;
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    fireEvent(window, new Event("offline"));
    expect(
      screen.getByRole("button", { name: "Create form", exact: true }),
    ).toHaveProperty("disabled", true);
    expect(
      screen.getByRole("button", { name: "Recheck form library", exact: true }),
    ).toHaveProperty("disabled", true);
    expect(apiMock).toHaveBeenCalledTimes(count);
  });
});
