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
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import {
  formsApi,
  useFormLibrary,
  useServerForm,
} from "../../src/ui/forms/api";
import FormBuilder from "../../src/ui/forms/FormBuilder";
import ResponseWorkspace from "../../src/ui/forms/ResponseWorkspace";
import { responseFilterLocalTime } from "../../src/ui/forms/response-filters";
import { createTemplate } from "../../shared/forms";
const { apiMock, identity } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  identity: { id: "fictional-officer", role: "admin" },
}));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: apiMock,
}));
vi.mock("@/contexts/AdminContext", () => ({
  useAdmin: () => ({ currentAdmin: identity }),
}));
vi.mock("@/hooks/useDraftGuard", () => ({
  useDraftGuard: () => {},
  useNavigationSafety: () => ({ allow: (run: () => void) => run() }),
}));
function pending<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
function form(title = "Fictional form") {
  return {
    ...createTemplate(title, "blank"),
    id: title,
    revision: 1,
    actions: ["view", "edit"],
  };
}
function listing(title = "Fictional library") {
  return { items: [form(title)], total: 1, page: 1, pageSize: 30 };
}
beforeEach(() => {
  apiMock.mockReset();
  identity.id = "fictional-officer";
  identity.role = "admin";
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("Protected Forms read scope and recovery", () => {
  it("passes an abort signal to the real definition transport", async () => {
    apiMock.mockResolvedValue({ form: form() });
    const controller = new AbortController();
    await formsApi.load("fictional", controller.signal);
    expect(apiMock).toHaveBeenCalledWith("/admin/forms/fictional", {
      signal: controller.signal,
    });
  });
  it("conceals the prior form synchronously when the requested form changes and fences its late response", async () => {
    const old = pending<{ form: ReturnType<typeof form> }>();
    apiMock
      .mockReturnValueOnce(old.promise)
      .mockResolvedValue({ form: form("New fictional form") });
    const hook = renderHook(({ id }) => useServerForm(id), {
      initialProps: { id: "old" },
    });
    const firstSignal = apiMock.mock.calls[0][1].signal;
    hook.rerender({ id: "new" });
    expect(hook.result.current.form).toBeUndefined();
    expect(firstSignal.aborted).toBe(true);
    await waitFor(() =>
      expect(hook.result.current.form?.title).toBe("New fictional form"),
    );
    await act(async () => old.resolve({ form: form("Old fictional form") }));
    expect(hook.result.current.form?.title).toBe("New fictional form");
  });
  it("does not carry a loaded definition into another account or role scope", async () => {
    apiMock
      .mockResolvedValueOnce({ form: form("Private fictional definition") })
      .mockReturnValue(new Promise(() => {}));
    const hook = renderHook(() => useServerForm("fictional"));
    await waitFor(() => expect(hook.result.current.form).toBeTruthy());
    identity.id = "other-fictional-officer";
    hook.rerender();
    expect(hook.result.current.form).toBeUndefined();
    expect(hook.result.current.loading).toBe(true);
    identity.role = "team_member";
    hook.rerender();
    expect(hook.result.current.form).toBeUndefined();
  });
  it("supports explicit retry after load failure and clears only the current error", async () => {
    apiMock
      .mockRejectedValueOnce(Error("Fictional definition read failure"))
      .mockResolvedValue({ form: form() });
    const hook = renderHook(() => useServerForm("fictional"));
    await waitFor(() =>
      expect(hook.result.current.error).toBe(
        "Fictional definition read failure",
      ),
    );
    await act(async () => {
      await hook.result.current.reload();
    });
    expect(hook.result.current.form?.title).toBe("Fictional form");
    expect(hook.result.current.error).toBe("");
    expect(hook.result.current.loading).toBe(false);
  });
  it("aborts and supersedes an older reload even when a mocked transport resolves it afterward", async () => {
    const old = pending<{ form: ReturnType<typeof form> }>();
    apiMock
      .mockResolvedValueOnce({ form: form("First version") })
      .mockReturnValueOnce(old.promise)
      .mockResolvedValue({ form: form("Latest version") });
    const hook = renderHook(() => useServerForm("fictional"));
    await waitFor(() =>
      expect(hook.result.current.form?.title).toBe("First version"),
    );
    let oldReload!: Promise<void>;
    act(() => {
      oldReload = hook.result.current.reload();
    });
    const oldSignal = apiMock.mock.calls[1][1].signal;
    await act(async () => {
      await hook.result.current.reload();
    });
    expect(oldSignal.aborted).toBe(true);
    await act(async () => {
      old.resolve({ form: form("Obsolete version") });
      await oldReload;
    });
    expect(hook.result.current.form?.title).toBe("Latest version");
  });
  it("aborts pending reads on unmount and treats an absent form ID as unavailable without a request", () => {
    apiMock.mockReturnValue(new Promise(() => {}));
    const hook = renderHook(() => useServerForm("fictional"));
    const signal = apiMock.mock.calls[0][1].signal;
    hook.unmount();
    expect(signal.aborted).toBe(true);
    apiMock.mockClear();
    const missing = renderHook(() => useServerForm(undefined));
    expect(missing.result.current.form).toBeUndefined();
    expect(missing.result.current.loading).toBe(false);
    expect(apiMock).not.toHaveBeenCalled();
  });
  it("hides a loaded library immediately across filter and account changes", async () => {
    apiMock
      .mockResolvedValueOnce(listing())
      .mockReturnValue(new Promise(() => {}));
    const hook = renderHook(({ query }) => useFormLibrary(query), {
      initialProps: { query: "page=1" },
    });
    await waitFor(() => expect(hook.result.current.items).toHaveLength(1));
    hook.rerender({ query: "page=1&q=another" });
    expect(hook.result.current.items).toEqual([]);
    expect(hook.result.current.loading).toBe(true);
    identity.id = "other-fictional-officer";
    hook.rerender({ query: "page=1&q=another" });
    expect(hook.result.current.items).toEqual([]);
  });
  it("fences an older library read after a new filter commits", async () => {
    const old = pending<ReturnType<typeof listing>>();
    apiMock
      .mockReturnValueOnce(old.promise)
      .mockResolvedValue(listing("Latest fictional library"));
    const hook = renderHook(({ query }) => useFormLibrary(query), {
      initialProps: { query: "q=old" },
    });
    hook.rerender({ query: "q=new" });
    await waitFor(() =>
      expect(hook.result.current.items[0]?.title).toBe(
        "Latest fictional library",
      ),
    );
    await act(async () => old.resolve(listing("Obsolete fictional library")));
    expect(hook.result.current.items[0]?.title).toBe(
      "Latest fictional library",
    );
  });
  it("makes a disabled invalid-date query empty without sending a request or showing an old library", async () => {
    apiMock.mockResolvedValue(listing());
    const hook = renderHook(
      ({ enabled }) => useFormLibrary("page=1", enabled),
      { initialProps: { enabled: true } },
    );
    await waitFor(() => expect(hook.result.current.items).toHaveLength(1));
    const count = apiMock.mock.calls.length;
    hook.rerender({ enabled: false });
    expect(hook.result.current.items).toEqual([]);
    expect(hook.result.current.loading).toBe(false);
    expect(apiMock).toHaveBeenCalledTimes(count);
  });
  it("retries a library failure explicitly without inventing saved forms", async () => {
    apiMock
      .mockRejectedValueOnce(Error("Fictional library read failure"))
      .mockResolvedValue(listing());
    const hook = renderHook(() => useFormLibrary("page=1"));
    await waitFor(() =>
      expect(hook.result.current.error).toBe("Fictional library read failure"),
    );
    expect(hook.result.current.items).toEqual([]);
    act(() => hook.result.current.reload());
    await waitFor(() => expect(hook.result.current.items).toHaveLength(1));
    expect(hook.result.current.error).toBe("");
  });
});
describe("Form builder initial read UI", () => {
  it("uses a loading skeleton and recovers an initial failure through a focused retry", async () => {
    const read = pending<{ form: ReturnType<typeof form> }>();
    apiMock
      .mockReturnValueOnce(read.promise)
      .mockResolvedValue({ form: form("Recovered fictional form") });
    render(
      <MemoryRouter
        initialEntries={["/admin/forms/fictional/edit"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
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
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("status", { name: "Loading form builder" }),
    ).toBeTruthy();
    await act(async () => read.reject(Error("Fictional builder read failure")));
    await screen.findByRole("heading", { name: "This form is not available" });
    expect(
      screen.getByRole("link", { name: "Back to forms" }).getAttribute("href"),
    ).toBe("/admin/forms");
    fireEvent.click(
      screen.getByRole("button", { name: "Try loading form again" }),
    );
    expect(document.activeElement).toBe(
      document.getElementById("workspace-content"),
    );
    expect(
      ((await screen.findByLabelText("Form title")) as HTMLInputElement).value,
    ).toBe("Recovered fictional form");
    expect(
      screen.queryByRole("heading", { name: "This form is not available" }),
    ).toBeNull();
  });
});
function mountResponses(path = "/admin/forms/fictional/responses") {
  return render(
    <MemoryRouter
      initialEntries={[path]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route
          path="/admin/forms/:formId/responses"
          element={
            <main id="workspace-content" tabIndex={-1}>
              <ResponseWorkspace />
            </main>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}
describe("Response workspace read recovery", () => {
  function responseReads() {
    apiMock.mockImplementation((path: string) =>
      Promise.resolve(
        path === "/admin/forms/fictional"
          ? { form: form() }
          : path.includes("/analytics?")
            ? { responseCount: 0, fields: [] }
            : path.endsWith("/views")
              ? { items: [] }
              : { items: [], total: 0, page: 1, pageSize: 30 },
      ),
    );
  }
  it("recovers a failed definition read through the same explicit focused retry", async () => {
    let failed = false;
    apiMock.mockImplementation(async (path: string) => {
      if (path === "/admin/forms/fictional") {
        if (!failed) {
          failed = true;
          throw Error("Fictional response definition failure");
        }
        return { form: form("Recovered response workspace") };
      }
      return listing();
    });
    mountResponses();
    await screen.findByRole("heading", { name: "This form is not available" });
    fireEvent.click(
      screen.getByRole("button", { name: "Try loading form again" }),
    );
    expect(document.activeElement).toBe(
      document.getElementById("workspace-content"),
    );
    await screen.findByRole("heading", {
      name: "Recovered response workspace",
    });
  });
  it("ignores an old response page that resolves after a newer summary view", async () => {
    const old = pending<{
      items: unknown[];
      page: number;
      pageSize: number;
      total: number;
    }>();
    apiMock.mockImplementation((path: string) => {
      if (path === "/admin/forms/fictional")
        return Promise.resolve({ form: form() });
      if (path.includes("/responses?")) return old.promise;
      if (path.includes("/analytics?"))
        return Promise.resolve({ responseCount: 3, fields: [] });
      return Promise.resolve({ items: [] });
    });
    mountResponses();
    await screen.findByRole("heading", { name: "Fictional form" });
    const oldSignal = apiMock.mock.calls.find(([path]) =>
      path.includes("/responses?"),
    )![1].signal;
    fireEvent.click(screen.getByRole("tab", { name: "Summary" }));
    await screen.findByRole("heading", { name: "3 matching responses" });
    await act(async () =>
      old.resolve({
        items: [
          {
            id: "old",
            formId: "fictional",
            version: 1,
            submittedAt: "2026-10-26T12:00:00Z",
            answers: {},
            respondent: {
              name: "Obsolete fictional respondent",
              email: null,
              source: "declared",
            },
          },
        ],
        page: 1,
        pageSize: 30,
        total: 1,
      }),
    );
    expect(oldSignal.aborted).toBe(true);
    expect(screen.queryByText("Obsolete fictional respondent")).toBeNull();
    expect(
      screen.queryByRole("heading", { name: "1 matching responses" }),
    ).toBeNull();
  });
  it("ignores obsolete summary results after switching back to the response table", async () => {
    const old = pending<{ responseCount: number; fields: unknown[] }>();
    apiMock.mockImplementation((path: string) => {
      if (path === "/admin/forms/fictional")
        return Promise.resolve({ form: form() });
      if (path.includes("/responses?"))
        return Promise.resolve({ items: [], page: 1, pageSize: 30, total: 0 });
      if (path.includes("/analytics?")) return old.promise;
      return Promise.resolve({ items: [] });
    });
    mountResponses();
    await screen.findByRole("heading", { name: "Fictional form" });
    fireEvent.click(screen.getByRole("tab", { name: "Summary" }));
    fireEvent.click(screen.getByRole("tab", { name: "Responses" }));
    await screen.findByRole("heading", { name: "No responses match" });
    await act(async () => old.resolve({ responseCount: 99, fields: [] }));
    expect(
      screen.queryByRole("heading", { name: "99 matching responses" }),
    ).toBeNull();
  });
  it("shows shared date instants in local controls without dropping seconds or milliseconds", async () => {
    responseReads();
    const from = "2026-10-26T12:34:56.123Z",
      to = "2026-10-26T13:45:00Z";
    mountResponses(
      "/admin/forms/fictional/responses?from=" +
        encodeURIComponent(from) +
        "&to=" +
        encodeURIComponent(to) +
        "&q=Fictional&status=complete",
    );
    await screen.findByRole("heading", { name: "No responses match" });
    const fromControl = screen.getByLabelText(
      "From (your local time)",
    ) as HTMLInputElement;
    expect(new Date(fromControl.value).toISOString()).toBe(from);
    expect(
      new Date(
        (screen.getByLabelText("To (your local time)") as HTMLInputElement)
          .value,
      ).toISOString(),
    ).toBe("2026-10-26T13:45:00.000Z");
    expect((screen.getByLabelText("Status") as HTMLSelectElement).value).toBe(
      "complete",
    );
    expect(
      (
        screen.getByLabelText(
          "Search respondents and non-sensitive answers",
        ) as HTMLInputElement
      ).value,
    ).toBe("Fictional");
    expect(fromControl.step).toBe("any");
  });
  it("clears edited controls on Reset even when the applied query was already empty", async () => {
    responseReads();
    mountResponses();
    await screen.findByRole("heading", { name: "No responses match" });
    fireEvent.change(
      screen.getByLabelText("Search respondents and non-sensitive answers"),
      { target: { value: "Unapplied fictional text" } },
    );
    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "redacted" },
    });
    fireEvent.change(screen.getByLabelText("From (your local time)"), {
      target: { value: "2026-10-26T12:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reset", exact: true }));
    expect(
      (
        screen.getByLabelText(
          "Search respondents and non-sensitive answers",
        ) as HTMLInputElement
      ).value,
    ).toBe("");
    expect((screen.getByLabelText("Status") as HTMLSelectElement).value).toBe(
      "",
    );
    expect(
      (screen.getByLabelText("From (your local time)") as HTMLInputElement)
        .value,
    ).toBe("");
    expect(document.activeElement).toBe(
      document.getElementById("workspace-content"),
    );
  });
  it("preserves an unchanged saved instant when its local clock hour repeats at daylight-saving time", async () => {
    responseReads();
    const instant = "2026-11-01T06:30:00Z";
    mountResponses(
      "/admin/forms/fictional/responses?from=" + encodeURIComponent(instant),
    );
    await screen.findByRole("heading", { name: "No responses match" });
    fireEvent.change(
      screen.getByLabelText("Search respondents and non-sensitive answers"),
      { target: { value: "Fictional daylight-saving filter" } },
    );
    fireEvent.submit(
      screen.getByRole("button", { name: "Apply filters" }).closest("form")!,
    );
    await waitFor(() => {
      const path = apiMock.mock.calls
        .filter(([value]) => value.includes("/responses?"))
        .at(-1)![0];
      expect(
        new URL(path, "https://chapter.example.test").searchParams.get("q"),
      ).toBe("Fictional daylight-saving filter");
      expect(
        new URL(path, "https://chapter.example.test").searchParams.get("from"),
      ).toBe(instant);
    });
  });
  it("restores saved-view filters to the visible controls as well as the API request", async () => {
    responseReads();
    const current = apiMock.getMockImplementation()!;
    apiMock.mockImplementation((path: string, options: unknown) =>
      path.endsWith("/views")
        ? Promise.resolve({
            items: [
              {
                id: "fictional-view",
                name: "Fictional saved view",
                filters: {
                  q: "Saved query",
                  status: "held",
                  from: "2026-10-26T12:00:00Z",
                },
                columns: [],
              },
            ],
          })
        : current(path, options),
    );
    mountResponses();
    await screen.findByRole("option", { name: "Fictional saved view" });
    await screen.findByRole("heading", { name: "No responses match" });
    fireEvent.change(
      screen.getByLabelText("Search respondents and non-sensitive answers"),
      { target: { value: "Unsaved filter" } },
    );
    fireEvent.change(screen.getByLabelText("Saved view"), {
      target: { value: "fictional-view" },
    });
    await waitFor(() =>
      expect(
        (
          screen.getByLabelText(
            "Search respondents and non-sensitive answers",
          ) as HTMLInputElement
        ).value,
      ).toBe("Saved query"),
    );
    expect((screen.getByLabelText("Status") as HTMLSelectElement).value).toBe(
      "held",
    );
    expect(
      new Date(
        (screen.getByLabelText("From (your local time)") as HTMLInputElement)
          .value,
      ).toISOString(),
    ).toBe("2026-10-26T12:00:00.000Z");
    expect(document.activeElement).toBe(
      document.getElementById("workspace-content"),
    );
  });
  it("rejects a reversed local date range before reading results and associates/focuses the end date", async () => {
    responseReads();
    mountResponses();
    await screen.findByRole("heading", { name: "No responses match" });
    const before = apiMock.mock.calls.length;
    fireEvent.change(screen.getByLabelText("From (your local time)"), {
      target: { value: "2026-10-27T12:00" },
    });
    fireEvent.change(screen.getByLabelText("To (your local time)"), {
      target: { value: "2026-10-26T12:00" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Apply filters" }).closest("form")!,
    );
    const error = screen.getByRole("alert"),
      input = screen.getByLabelText("To (your local time)");
    expect(error.textContent).toContain("on or after");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe(error.id);
    expect(document.activeElement).toBe(input);
    expect(apiMock).toHaveBeenCalledTimes(before);
  });
  it("activates response tabs with arrow/Home/End keys and labels the selected panel", async () => {
    responseReads();
    mountResponses();
    await screen.findByRole("heading", { name: "No responses match" });
    const responses = screen.getByRole("tab", { name: "Responses" }),
      summary = screen.getByRole("tab", { name: "Summary" });
    expect(responses.tabIndex).toBe(0);
    expect(summary.tabIndex).toBe(-1);
    responses.focus();
    fireEvent.keyDown(responses, { key: "ArrowRight" });
    await screen.findByRole("tabpanel", { name: "Summary" });
    expect(document.activeElement).toBe(summary);
    expect(summary.tabIndex).toBe(0);
    fireEvent.keyDown(summary, { key: "End" });
    expect(screen.getByRole("tabpanel", { name: "Responses" })).toBeTruthy();
    fireEvent.keyDown(responses, { key: "Home" });
    expect(screen.getByRole("tabpanel", { name: "Summary" })).toBeTruthy();
  });
  it("keeps a date validation message distinct from a later result refresh failure", async () => {
    responseReads();
    mountResponses();
    await screen.findByRole("heading", { name: "No responses match" });
    fireEvent.change(screen.getByLabelText("From (your local time)"), {
      target: { value: "2026-10-28T12:00" },
    });
    fireEvent.change(screen.getByLabelText("To (your local time)"), {
      target: { value: "2026-10-27T12:00" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Apply filters" }).closest("form")!,
    );
    const original = apiMock.getMockImplementation()!;
    apiMock.mockImplementation((path: string, options: unknown) =>
      path.includes("/responses?")
        ? Promise.reject(Error("Fictional result refresh failure"))
        : original(path, options),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh", exact: true }),
    );
    await screen.findByText("Fictional result refresh failure");
    const input = screen.getByLabelText("To (your local time)");
    expect(
      document.getElementById(input.getAttribute("aria-describedby")!)
        ?.textContent,
    ).toContain("end date must be on or after");
    expect(screen.getAllByRole("alert")).toHaveLength(2);
  });
  it("leaves invalid or absent filter dates empty and keeps a valid instant reversible", () => {
    expect(responseFilterLocalTime(null)).toBe("");
    expect(responseFilterLocalTime("not a date")).toBe("");
    expect(responseFilterLocalTime("+010000-01-01T00:00:00Z")).toBe("");
    const instant = "2026-10-26T12:34:56.789Z";
    expect(new Date(responseFilterLocalTime(instant)).toISOString()).toBe(
      instant,
    );
  });
});
