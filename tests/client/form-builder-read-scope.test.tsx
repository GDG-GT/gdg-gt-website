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
import { MemoryRouter, Link, Route, Routes } from "react-router-dom";
import FormBuilder from "../../src/ui/forms/FormBuilder";
import { useServerForm } from "../../src/ui/forms/api";
import { createTemplate } from "../../shared/forms";
import { ApiFailure } from "../../src/lib/api";
import { useDraftGuard } from "../../src/hooks/useDraftGuard";
const { apiMock, actor, navigation } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  actor: { id: "fictional-editor", role: "admin" },
  navigation: {
    request: vi.fn((action: () => void) => action()),
    allow: vi.fn((action: () => void) => action()),
  },
}));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: apiMock,
}));
vi.mock("@/contexts/AdminContext", () => ({
  useAdmin: () => ({ currentAdmin: actor }),
}));
vi.mock("@/hooks/useDraftGuard", () => ({
  useDraftGuard: vi.fn(),
  useNavigationSafety: () => navigation,
}));
const definition = (
  id = "fictional-form-a",
  title = "Fictional saved form A",
) => ({
  ...createTemplate(title, "blank"),
  id,
  revision: 1,
  actions: ["view", "edit", "publish"],
});
let saved: ReturnType<typeof definition>, failRead: Error | undefined;
let write: (
  path: string,
  options: {
    method: string;
    body: Record<string, unknown>;
    signal: AbortSignal;
  },
) => Promise<unknown>;
const writes = () => apiMock.mock.calls.filter(([, options]) => options.method);
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  saved = definition();
  failRead = undefined;
  actor.id = "fictional-editor";
  actor.role = "admin";
  write = async () => ({ form: { ...saved, revision: 2 } });
  apiMock.mockReset().mockImplementation(async (path, options = {}) => {
    if (options.method) return write(path, options);
    if (failRead) throw failRead;
    return {
      form: structuredClone(
        path.includes("fictional-form-b")
          ? definition("fictional-form-b", "Fictional saved form B")
          : saved,
      ),
    };
  });
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: true,
  });
  navigation.request.mockClear();
  navigation.allow.mockClear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function panel() {
  return (
    <MemoryRouter initialEntries={["/admin/forms/fictional-form-a/edit"]}>
      <Link to="/admin/forms/fictional-form-b/edit">Open fictional form B</Link>
      <Routes>
        <Route
          path="/admin/forms/:formId/edit"
          element={
            <main id="workspace-content" tabIndex={-1}>
              <FormBuilder />
            </main>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}
const title = async () =>
  (await screen.findByLabelText("Form title")) as HTMLInputElement;
describe("Private saved form reads", () => {
  it("refuses late reload callbacks from an unmounted or replaced account scope", async () => {
    const hook = renderHook(() => useServerForm(saved.id));
    await waitFor(() => expect(hook.result.current.form).toBeTruthy());
    const oldReload = hook.result.current.reload;
    actor.id = "fictional-replacement-reader";
    hook.rerender();
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    const count = apiMock.mock.calls.length;
    await act(async () => {
      await oldReload();
    });
    expect(apiMock.mock.calls).toHaveLength(count);
    const finalReload = hook.result.current.reload;
    hook.unmount();
    await finalReload();
    expect(apiMock.mock.calls).toHaveLength(count);
  });
  it("retains a timestamped matching snapshot after a transient read failure", async () => {
    const hook = renderHook(() => useServerForm(saved.id));
    await waitFor(() =>
      expect(hook.result.current.form?.title).toBe(saved.title),
    );
    const at = hook.result.current.at;
    failRead = new ApiFailure(503, "UNAVAILABLE", "Fictional read outage");
    await act(async () => {
      await hook.result.current.reload();
    });
    expect(hook.result.current.form?.title).toBe(saved.title);
    expect(hook.result.current.at).toBe(at);
    expect(hook.result.current.denied).toBe(false);
    expect(hook.result.current.error).toBe("Fictional read outage");
  });
  it.each([401, 403, 404])(
    "clears a matching private definition on read denial %s before explicit recheck",
    async (status) => {
      const hook = renderHook(() => useServerForm(saved.id));
      await waitFor(() => expect(hook.result.current.form).toBeTruthy());
      failRead = new ApiFailure(status, "DENIED", "Fictional denial");
      await act(async () => {
        await hook.result.current.reload();
      });
      expect(hook.result.current.form).toBeUndefined();
      expect(hook.result.current.at).toBeUndefined();
      expect(hook.result.current.denied).toBe(true);
      failRead = undefined;
      await act(async () => {
        await hook.result.current.reload();
      });
      expect(hook.result.current.form?.title).toBe(saved.title);
      expect(hook.result.current.denied).toBe(false);
    },
  );
  it("clears and aborts a loaded read on session invalidation without an automatic request loop", async () => {
    const hook = renderHook(() => useServerForm(saved.id));
    await waitFor(() => expect(hook.result.current.form).toBeTruthy());
    const count = apiMock.mock.calls.length;
    fireEvent(window, new Event("gdg:session-cleared"));
    expect(hook.result.current.form).toBeUndefined();
    expect(hook.result.current.denied).toBe(true);
    expect(apiMock.mock.calls).toHaveLength(count);
    await act(async () => {
      await hook.result.current.reload();
    });
    expect(hook.result.current.form?.title).toBe(saved.title);
  });
});
describe("Form builder scoped state and autosave", () => {
  it("publishes an unchanged saved definition with publish-only permission and no draft write", async () => {
    saved = {
      ...createTemplate("Fictional publish-only form", "interest"),
      id: saved.id,
      revision: 1,
      actions: ["view", "publish"],
    };
    render(panel());
    await title();
    fireEvent.click(
      screen.getByRole("button", { name: "Publish", exact: true }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Publish version", exact: true }),
    );
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0][0]).toContain("/publish");
    await screen.findByText("Published and saved");
  });
  it("guards unconfirmed publication navigation and reload even when the draft itself is unchanged", async () => {
    saved = {
      ...createTemplate("Fictional uncertain publication", "interest"),
      id: saved.id,
      revision: 1,
      actions: ["view", "edit", "publish"],
    };
    write = async () => {
      throw new Error("Fictional lost publication response");
    };
    render(panel());
    await title();
    fireEvent.click(
      screen.getByRole("button", { name: "Publish", exact: true }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Publish version", exact: true }),
    );
    await screen.findByRole("heading", {
      name: "Recheck the unconfirmed publication",
    });
    expect(vi.mocked(useDraftGuard).mock.lastCall).toEqual([
      true,
      expect.objectContaining({
        label: expect.stringContaining("unconfirmed publication"),
      }),
    ]);
    const event = new Event("beforeunload", { cancelable: true });
    fireEvent(window, event);
    expect(event.defaultPrevented).toBe(true);
    expect(writes()).toHaveLength(1);
  });
  it("preserves newer proposed edits during lost-save reconciliation and explicitly reviews resuming autosave", async () => {
    const lost = deferred<unknown>();
    let first = true;
    write = async (_path, options) => {
      if (first) {
        first = false;
        await lost.promise;
        throw new Error("Fictional lost save response");
      }
      const def = options.body.definition as typeof saved;
      saved = { ...saved, ...def, revision: 3 };
      return { form: saved };
    };
    render(panel());
    const input = await title();
    fireEvent.change(input, {
      target: { value: "Fictional original in-flight title" },
    });
    await waitFor(() => expect(writes()).toHaveLength(1), { timeout: 1800 });
    fireEvent.change(input, {
      target: { value: "Fictional newer proposed title" },
    });
    saved = {
      ...saved,
      title: "Fictional original in-flight title",
      revision: 2,
    };
    await act(async () => lost.resolve(undefined));
    await screen.findByRole("heading", {
      name: "Recheck the unconfirmed draft save",
    });
    // The real receipt route provides current data without another mutation.
    apiMock.mockImplementation(async (path, options = {}) => {
      if (options.method) return write(path, options);
      return {
        form: structuredClone(saved),
        ...(path.includes("?mutation=") ? { committed: true } : {}),
      };
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Recheck original write outcome" }),
    );
    await screen.findByText(/The original change is confirmed/);
    expect(screen.queryByText(/Fictional lost save response/)).toBeNull();
    expect(input.value).toBe("Fictional newer proposed title");
    expect(input.disabled).toBe(true);
    expect(writes()).toHaveLength(1);
    fireEvent.click(
      screen.getByRole("button", { name: "Review loading saved draft" }),
    );
    const resume = await screen.findByRole("button", {
      name: "Keep proposed draft and resume autosave",
    });
    expect((resume as HTMLButtonElement).disabled).toBe(false);
    expect(writes()).toHaveLength(1);
    fireEvent.click(resume);
    await waitFor(() => expect(writes()).toHaveLength(2), { timeout: 1800 });
    expect(writes()[1][1].body).toMatchObject({
      revision: 2,
      definition: { title: "Fictional newer proposed title" },
    });
    expect(writes()[1][1].idempotencyKey).not.toBe(
      writes()[0][1].idempotencyKey,
    );
    expect(input.value).toBe("Fictional newer proposed title");
  });
  it("does not let an old refresh completion steal focus in a replacement form", async () => {
    const pending = deferred<unknown>();
    const original = apiMock.getMockImplementation()!;
    let delay = false;
    apiMock.mockImplementation((path, options) =>
      delay && path === "/admin/forms/fictional-form-a"
        ? pending.promise
        : original(path, options),
    );
    render(panel());
    await title();
    delay = true;
    fireEvent.click(screen.getByRole("button", { name: "Recheck saved form" }));
    const link = screen.getByRole("link", { name: "Open fictional form B" });
    fireEvent.click(link);
    await waitFor(() =>
      expect(
        (screen.getByLabelText("Form title") as HTMLInputElement).value,
      ).toBe("Fictional saved form B"),
    );
    link.focus();
    await act(async () => pending.resolve({ form: saved }));
    expect(document.activeElement).toBe(link);
  });
  it("keeps a rejected validation draft editable and saves corrected values without discarding it", async () => {
    let first = true;
    write = async () => {
      if (first) {
        first = false;
        throw new ApiFailure(
          400,
          "VALIDATION_ERROR",
          "Fictional draft validation failure",
        );
      }
      return { form: { ...saved, revision: 2 } };
    };
    render(panel());
    const input = await title();
    fireEvent.change(input, {
      target: { value: "Fictional invalid proposal" },
    });
    await screen.findByText(/Fictional draft validation failure/);
    expect(input.disabled).toBe(false);
    expect(
      screen.queryByRole("button", { name: "Review loading saved draft" }),
    ).toBeNull();
    fireEvent.change(input, {
      target: { value: "Fictional corrected proposal" },
    });
    await waitFor(() => expect(writes()).toHaveLength(2), { timeout: 1800 });
    expect(input.value).toBe("Fictional corrected proposal");
  });
  it("latches publication and cancels a pending publish when the form context changes", async () => {
    saved = {
      ...createTemplate("Fictional publishable form", "interest"),
      id: saved.id,
      revision: 1,
      actions: ["view", "edit", "publish"],
    };
    const pending = deferred<unknown>();
    write = (path) =>
      path.endsWith("/publish")
        ? pending.promise
        : Promise.resolve({ form: saved });
    render(panel());
    await title();
    fireEvent.click(screen.getByRole("button", { name: /^Publish/ }));
    const confirm = screen.getByRole("button", {
      name: "Publish version",
      exact: true,
    });
    expect((confirm as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(writes()).toHaveLength(1));
    const signal = writes()[0][1].signal;
    fireEvent.keyDown(screen.getByRole("dialog"), {
      key: "Escape",
      code: "Escape",
    });
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent(window, new Event("gdg:session-cleared"));
    expect(signal.aborted).toBe(true);
    await act(async () =>
      pending.resolve({
        form: {
          ...saved,
          title: "Fictional obsolete published title",
          revision: 2,
        },
      }),
    );
    await waitFor(() =>
      expect(
        screen.queryByDisplayValue("Fictional obsolete published title"),
      ).toBeNull(),
    );
    expect(writes()).toHaveLength(1);
  });
  it.each(["account", "role", "session"] as const)(
    "resets private editor and cancels pending debounce on %s replacement",
    async (kind) => {
      const view = render(panel());
      const input = await title();
      fireEvent.change(input, {
        target: { value: "Fictional unsaved private title" },
      });
      if (kind === "session")
        fireEvent(window, new Event("gdg:session-cleared"));
      else {
        if (kind === "account") actor.id = "fictional-other-editor";
        else actor.role = "team_member";
        view.rerender(panel());
      }
      await waitFor(() =>
        expect(
          screen.queryByDisplayValue("Fictional unsaved private title"),
        ).toBeNull(),
      );
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 700));
      });
      expect(writes()).toHaveLength(0);
      expect((await title()).value).toBe(saved.title);
    },
  );
  it("cancels pending and queued saves when changing forms, ignoring a late accepted response", async () => {
    const pending = deferred<unknown>();
    write = () => pending.promise;
    render(panel());
    const input = await title();
    fireEvent.change(input, {
      target: { value: "Fictional first queued title" },
    });
    await waitFor(() => expect(writes()).toHaveLength(1), { timeout: 1800 });
    const signal = writes()[0][1].signal;
    fireEvent.change(input, {
      target: { value: "Fictional second queued title" },
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700));
    });
    fireEvent.click(
      screen.getByRole("link", { name: "Open fictional form B" }),
    );
    await waitFor(() =>
      expect(
        (screen.getByLabelText("Form title") as HTMLInputElement).value,
      ).toBe("Fictional saved form B"),
    );
    expect(signal.aborted).toBe(true);
    await act(async () =>
      pending.resolve({
        form: { ...saved, title: "Fictional old accepted title", revision: 2 },
      }),
    );
    expect(writes()).toHaveLength(1);
    expect((await title()).value).toBe("Fictional saved form B");
  });
  it("preserves proposed fields while a failed refresh pauses editing and autosave", async () => {
    render(panel());
    const input = await title();
    fireEvent.change(input, {
      target: { value: "Fictional retained proposed title" },
    });
    failRead = new ApiFailure(
      503,
      "UNAVAILABLE",
      "Fictional saved draft outage",
    );
    fireEvent.click(screen.getByRole("button", { name: "Recheck saved form" }));
    await screen.findByText("Fictional saved draft outage");
    expect(input.value).toBe("Fictional retained proposed title");
    expect(input.disabled).toBe(true);
    expect(
      screen
        .getByText(/Last successful saved draft read/)
        .querySelector("time"),
    ).toBeTruthy();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700));
    });
    expect(writes()).toHaveLength(0);
    failRead = undefined;
    fireEvent.click(screen.getByRole("button", { name: "Recheck saved form" }));
    await waitFor(() => expect(input.disabled).toBe(false));
    expect(input.value).toBe("Fictional retained proposed title");
    expect(document.activeElement?.id).toBe("form-builder-read-status");
  });
  it("preserves stale local fields and reviews discarding them before loading a newer saved revision", async () => {
    render(panel());
    const input = await title();
    fireEvent.change(input, {
      target: { value: "Fictional proposed revision" },
    });
    saved = { ...saved, title: "Fictional remote revision", revision: 2 };
    fireEvent.click(screen.getByRole("button", { name: "Recheck saved form" }));
    await screen.findByText(
      /Saved values changed or a save did not finish cleanly/,
    );
    expect(input.value).toBe("Fictional proposed revision");
    expect(input.disabled).toBe(true);
    expect(writes()).toHaveLength(0);
    fireEvent.click(
      screen.getByRole("button", { name: "Review loading saved draft" }),
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain(
      "Unsaved field, setting and undo/redo changes will be discarded",
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Keep proposed draft" }),
    );
    expect(input.value).toBe("Fictional proposed revision");
    fireEvent.click(
      screen.getByRole("button", { name: "Review loading saved draft" }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Load saved draft and discard proposed changes",
      }),
    );
    await waitFor(() => expect(input.value).toBe("Fictional remote revision"));
    expect(writes()).toHaveLength(0);
  });
  it("does not automatically retry queued saves after a failed or uncertain write", async () => {
    write = async () => {
      throw new ApiFailure(503, "UNAVAILABLE", "Fictional lost save receipt");
    };
    render(panel());
    const input = await title();
    fireEvent.change(input, { target: { value: "Fictional uncertain title" } });
    await screen.findByText(/Fictional lost save receipt/);
    expect(input.value).toBe("Fictional uncertain title");
    expect(input.disabled).toBe(true);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700));
    });
    expect(writes()).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Retry save" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Recheck saved form" }));
    await screen.findByRole("button", { name: "Review loading saved draft" });
    expect(writes()).toHaveLength(1);
  });
  it.each([401, 403, 404])(
    "clears private draft and pending controls on autosave denial %s",
    async (status) => {
      write = async () => {
        throw new ApiFailure(status, "DENIED", "Fictional save denial");
      };
      render(panel());
      fireEvent.change(await title(), {
        target: { value: "Fictional denied local title" },
      });
      await screen.findByRole("heading", {
        name: "Form access needs to be rechecked",
      });
      expect(
        screen.queryByDisplayValue("Fictional denied local title"),
      ).toBeNull();
      expect(screen.queryByLabelText("Form title")).toBeNull();
      expect(writes()).toHaveLength(1);
    },
  );
  it("pauses offline editing before the autosave debounce and never writes on offline navigation", async () => {
    render(panel());
    const input = await title();
    fireEvent.change(input, {
      target: { value: "Fictional offline local title" },
    });
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    fireEvent(window, new Event("offline"));
    expect(input.disabled).toBe(true);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700));
    });
    expect(writes()).toHaveLength(0);
    expect(
      screen.getByText("You are offline. Form changes are paused."),
    ).toBeTruthy();
  });
});
