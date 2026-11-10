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
import { ApiFailure } from "../../src/lib/api";
import ResponseExports from "../../src/ui/forms/ResponseExports";
import {
  inspectExportWrite,
  prepareExportCreation,
  submitExportWrite,
} from "../../src/ui/forms/form-export-api";
const { apiMock, identity, guard } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  identity: { id: "fictional-reviewer", role: "admin" },
  guard: vi.fn(),
}));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: apiMock,
}));
vi.mock("@/contexts/AdminContext", () => ({
  useAdmin: () => ({ currentAdmin: identity.id ? identity : null }),
}));
vi.mock("@/hooks/useDraftGuard", () => ({ useDraftGuard: guard }));
const props = {
    formId: "fictional-form",
    filters: { q: "Fictional original filter" },
    selected: ["fictional-response"],
    columns: ["fictional-field"],
    canSensitive: true,
  },
  root = "/admin/forms/fictional-form/exports",
  originalJob = {
    id: "fictional-export",
    format: "csv" as const,
    state: "pending" as const,
    count: 1,
    sensitive: false,
    bytes: null,
    errorCode: null,
    createdAt: "2026-11-06T12:00:00Z",
    expiresAt: "2099-11-07T12:00:00Z",
  };
let jobs: Record<string, unknown>[],
  receipts: Map<
    string,
    { action: string; body: string; job: Record<string, unknown> }
  >,
  attempts: { path: string; key: string; body: string; signal: AbortSignal }[],
  commits: number,
  lose: "" | "before" | "after",
  readFailure: number,
  inspectFailure: number,
  downloadFailure: number;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}
function click(name: string | RegExp) {
  fireEvent.click(screen.getByRole("button", { name }));
}
async function loaded() {
  await screen.findByText(
    "No exports in this sign-in yet. Choose a format and review the current selection.",
  );
}
async function review() {
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Review export",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
  click("Review export");
  await screen.findByRole("region", { name: "Review export creation" });
}
async function uncertain() {
  await screen.findByRole("region", { name: "Unconfirmed export change" });
}
beforeEach(() => {
  apiMock.mockReset();
  guard.mockClear();
  identity.id = "fictional-reviewer";
  identity.role = "admin";
  jobs = [];
  receipts = new Map();
  attempts = [];
  commits = 0;
  lose = "";
  readFailure = 0;
  inspectFailure = 0;
  downloadFailure = 0;
  Object.defineProperty(navigator, "onLine", {
    value: true,
    configurable: true,
  });
  apiMock.mockImplementation(
    async (
      path: string,
      options: {
        method?: string;
        body?: unknown;
        idempotencyKey?: string;
        signal: AbortSignal;
      },
    ) => {
      if (path === root && !options?.method) {
        if (readFailure)
          throw new ApiFailure(
            readFailure,
            "UNAVAILABLE",
            "Fictional export inventory failure",
          );
        return { items: structuredClone(jobs) };
      }
      if (path.includes("/recovery?")) {
        if (inspectFailure)
          throw new ApiFailure(
            inspectFailure,
            "UNAVAILABLE",
            "Fictional export inspection failure",
          );
        const q = new URL(path, "http://localhost").searchParams,
          action = q.get("action"),
          receipt = receipts.get(options.idempotencyKey!);
        return {
          committed: !!receipt,
          canRetry: !receipt,
          job: receipt
            ? structuredClone(jobs.find((j) => j.id === receipt.job.id))
            : action === "cancel"
              ? structuredClone(jobs[0])
              : null,
          ...(receipt
            ? {
                receipt: {
                  id: receipt.job.id,
                  formId: props.formId,
                  sourceId: action === "cancel" ? q.get("job") : null,
                  action,
                },
              }
            : {}),
        };
      }
      if (path.endsWith("/download")) {
        if (downloadFailure)
          throw new ApiFailure(
            downloadFailure,
            "UNAVAILABLE",
            "Fictional export authorization failure",
          );
        return {
          url: "https://storage.example.test/form-exports/fictional.csv?signature=fictional",
          expiresIn: 60,
        };
      }
      if (options?.method === "POST" || options?.method === "DELETE") {
        const action = options.method === "DELETE" ? "cancel" : "create",
          key = options.idempotencyKey!,
          body = JSON.stringify(options.body);
        attempts.push({ path, key, body, signal: options.signal });
        if (lose === "before") {
          lose = "";
          throw TypeError("Fictional connection loss");
        }
        if (!receipts.has(key)) {
          const job =
            action === "cancel"
              ? { ...jobs[0], state: "cancelled" }
              : {
                  ...originalJob,
                  sensitive: (options.body as { sensitive: boolean }).sensitive,
                };
          jobs = [job];
          receipts.set(key, { action, body, job });
          commits++;
        }
        if (lose === "after") {
          lose = "";
          throw TypeError("Fictional response loss");
        }
        return { job: structuredClone(jobs[0]) };
      }
      throw Error("Unexpected fictional export request");
    },
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe("Private background export read and write recovery", () => {
  it("distinguishes an initial failed inventory from empty jobs and supports explicit focused retry", async () => {
    readFailure = 503;
    render(<ResponseExports {...props} />);
    await screen.findByText("Fictional export inventory failure");
    expect(screen.queryByText(/No exports in this sign-in/)).toBeNull();
    expect(
      (
        screen.getByRole("button", {
          name: "Review export",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    readFailure = 0;
    click("Refresh exports");
    await loaded();
    expect(
      screen.getByRole("region", { name: "Background response exports" }),
    ).toBe(document.activeElement);
  });
  it("retains matching jobs and a proposed review on a transient read failure and pauses changes", async () => {
    jobs = [{ ...originalJob, state: "ready", bytes: 100 }];
    render(<ResponseExports {...props} />);
    await review();
    readFailure = 503;
    click("Refresh exports");
    await screen.findByText("Fictional export inventory failure");
    expect(screen.getByText("CSV · 1 responses")).toBeTruthy();
    expect(
      screen.getByRole("region", { name: "Review export creation" }),
    ).toBeTruthy();
    expect(
      screen.getByText(/Last successful export inventory read/),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Create export",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(attempts).toHaveLength(0);
  });
  for (const status of [401, 403, 404]) {
    it(`clears private jobs/reviews on ${status} without an automatic access retry loop`, async () => {
      jobs = [{ ...originalJob, state: "ready", bytes: 100 }];
      render(<ResponseExports {...props} />);
      await review();
      readFailure = status;
      click("Refresh exports");
      await screen.findByRole("button", { name: "Recheck export access" });
      expect(screen.queryByText("CSV · 1 responses")).toBeNull();
      expect(
        screen.queryByRole("region", { name: "Review export creation" }),
      ).toBeNull();
      const count = apiMock.mock.calls.length;
      await act(async () => {});
      expect(apiMock.mock.calls.length).toBe(count);
      readFailure = 0;
      click("Recheck export access");
      await screen.findByText("CSV · 1 responses");
      expect(
        (screen.getByLabelText("Export format") as HTMLSelectElement).value,
      ).toBe("csv");
    });
  }
  it("reconciles an accepted lost creation read-only with one original job", async () => {
    lose = "after";
    render(<ResponseExports {...props} />);
    await loaded();
    await review();
    click("Create export");
    await uncertain();
    expect(commits).toBe(1);
    expect(attempts).toHaveLength(1);
    expect(guard.mock.calls.at(-1)![0]).toBe(true);
    click("Check original export outcome");
    await screen.findByText(/Original export request confirmed/);
    expect(attempts).toHaveLength(1);
    expect(commits).toBe(1);
    expect(
      screen.queryByRole("region", { name: "Unconfirmed export change" }),
    ).toBeNull();
  });
  it("requires current inspection then explicitly retries the exact unaccepted body and request key", async () => {
    lose = "before";
    const view = render(<ResponseExports {...props} />);
    await loaded();
    await review();
    click("Create export");
    await uncertain();
    const original = { ...attempts[0] };
    expect(commits).toBe(0);
    expect(
      (
        screen.getByRole("button", {
          name: "Retry identical export change",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    view.rerender(
      <ResponseExports
        {...props}
        selected={["changed-response"]}
        filters={{ q: "Changed current filter" }}
      />,
    );
    click("Check original export outcome");
    await screen.findByText(/No committed receipt was found/);
    click("Retry identical export change");
    await screen.findByText(/Original export request confirmed/);
    expect(attempts).toHaveLength(2);
    expect(attempts[1].key).toBe(original.key);
    expect(attempts[1].body).toBe(original.body);
    expect(commits).toBe(1);
    expect(JSON.parse(attempts[1].body).filters.q).toBe(props.filters.q);
  });
  it("requires another outcome check after a retry response is lost", async () => {
    lose = "before";
    render(<ResponseExports {...props} />);
    await loaded();
    await review();
    click("Create export");
    await uncertain();
    click("Check original export outcome");
    await screen.findByText(/No committed receipt was found/);
    lose = "after";
    click("Retry identical export change");
    await screen.findByText("Fictional response loss");
    expect(
      (
        screen.getByRole("button", {
          name: "Retry identical export change",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    click("Check original export outcome");
    await screen.findByText(/Original export request confirmed/);
    expect(attempts).toHaveLength(2);
    expect(commits).toBe(1);
  });
  it("reconciles accepted cancellation without repeating its DELETE", async () => {
    jobs = [{ ...originalJob }];
    render(<ResponseExports {...props} />);
    await screen.findByText("CSV · 1 responses");
    click(/Remove export/);
    await screen.findByRole("region", { name: "Review export removal" });
    lose = "after";
    click("Confirm removal");
    await uncertain();
    click("Check original export outcome");
    await screen.findByText(/Export removal confirmed/);
    expect(attempts).toHaveLength(1);
    expect(attempts[0].path).toBe(root + "/" + originalJob.id);
    expect(commits).toBe(1);
  });
  it("retains a frozen reviewed creation after known validation failure without an automatic retry", async () => {
    render(<ResponseExports {...props} />);
    await loaded();
    await review();
    const previous = apiMock.getMockImplementation()!;
    apiMock.mockImplementation((path: string, options: { method?: string }) =>
      options?.method === "POST"
        ? Promise.reject(
            new ApiFailure(
              400,
              "VALIDATION_ERROR",
              "Fictional validation failure",
            ),
          )
        : previous(path, options),
    );
    click("Create export");
    await screen.findByText("Fictional validation failure");
    expect(
      screen.getByRole("region", { name: "Review export creation" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("region", { name: "Unconfirmed export change" }),
    ).toBeNull();
    expect(
      (
        screen.getByRole("button", {
          name: "Create export",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });
  it("abandonment requires its consequence review and a fresh inventory read before another change", async () => {
    lose = "before";
    render(<ResponseExports {...props} />);
    await loaded();
    await review();
    click("Create export");
    await uncertain();
    click("Stop tracking this export change");
    await screen.findByText(/Stopped tracking the original export change/);
    expect(
      (
        screen.getByRole("button", {
          name: "Review export",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(attempts).toHaveLength(1);
    click("Refresh exports");
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Review export",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    expect(attempts).toHaveLength(1);
  });
  for (const status of [401, 403, 404]) {
    it(`clears uncertain private intent when outcome inspection returns ${status}`, async () => {
      lose = "before";
      render(<ResponseExports {...props} />);
      await loaded();
      await review();
      click("Create export");
      await uncertain();
      inspectFailure = status;
      click("Check original export outcome");
      await screen.findByRole("button", { name: "Recheck export access" });
      expect(
        screen.queryByRole("region", { name: "Unconfirmed export change" }),
      ).toBeNull();
      expect(attempts).toHaveLength(1);
    });
  }
  for (const change of ["account", "role", "form", "sensitive capability"]) {
    it(`clears private state synchronously on ${change} replacement and rejects a late inventory`, async () => {
      jobs = [{ ...originalJob, state: "ready", bytes: 100 }];
      const view = render(<ResponseExports {...props} />);
      await review();
      const pending = deferred<{ items: typeof jobs }>();
      apiMock.mockReturnValueOnce(pending.promise);
      click("Refresh exports");
      const signal = apiMock.mock.calls.at(-1)![1].signal;
      if (change === "account") identity.id = "other-fictional-reviewer";
      if (change === "role") identity.role = "team_member";
      apiMock.mockReturnValue(new Promise(() => {}));
      view.rerender(
        <ResponseExports
          {...props}
          formId={change === "form" ? "other-form" : props.formId}
          canSensitive={change !== "sensitive capability"}
        />,
      );
      expect(screen.queryByText("CSV · 1 responses")).toBeNull();
      expect(
        screen.queryByRole("region", { name: "Review export creation" }),
      ).toBeNull();
      expect(signal.aborted).toBe(true);
      await act(async () => pending.resolve({ items: jobs }));
      expect(screen.queryByText("CSV · 1 responses")).toBeNull();
    });
  }
  it("cancels pending creation on session invalidation and ignores a late accepted result", async () => {
    render(<ResponseExports {...props} />);
    await loaded();
    await review();
    const pending = deferred<{ job: typeof originalJob }>();
    apiMock.mockReturnValueOnce(pending.promise);
    click("Create export");
    const signal = apiMock.mock.calls.at(-1)![1].signal;
    act(() => window.dispatchEvent(new Event("gdg:session-cleared")));
    expect(signal.aborted).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: "Recheck export access",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await act(async () => pending.resolve({ job: originalJob }));
    expect(screen.queryByText(/Original export request confirmed/)).toBeNull();
  });
  it("turns interrupted pending creation into manual uncertainty and never retries at reconnection", async () => {
    render(<ResponseExports {...props} />);
    await loaded();
    await review();
    const pending = deferred<{ job: typeof originalJob }>();
    apiMock.mockReturnValueOnce(pending.promise);
    click("Create export");
    const signal = apiMock.mock.calls.at(-1)![1].signal;
    Object.defineProperty(navigator, "onLine", {
      value: false,
      configurable: true,
    });
    act(() => window.dispatchEvent(new Event("offline")));
    await uncertain();
    expect(signal.aborted).toBe(true);
    const count = apiMock.mock.calls.length;
    Object.defineProperty(navigator, "onLine", {
      value: true,
      configurable: true,
    });
    act(() => window.dispatchEvent(new Event("online")));
    expect(apiMock.mock.calls.length).toBe(count);
    await act(async () => pending.resolve({ job: originalJob }));
    expect(screen.queryByText(/Original export request confirmed/)).toBeNull();
  });
  it("stops polling after a transient failure and preserves matching jobs until explicit retry", async () => {
    vi.useFakeTimers();
    jobs = [{ ...originalJob }];
    render(<ResponseExports {...props} />);
    await act(async () => {});
    readFailure = 503;
    await act(async () => vi.advanceTimersByTime(5000));
    expect(screen.getByText("Fictional export inventory failure")).toBeTruthy();
    expect(screen.getByText("CSV · 1 responses")).toBeTruthy();
    const count = apiMock.mock.calls.length;
    await act(async () => vi.advanceTimersByTime(15000));
    expect(apiMock.mock.calls.length).toBe(count);
    readFailure = 0;
    await act(async () => click("Refresh exports"));
    expect(screen.queryByText("Fictional export inventory failure")).toBeNull();
  });
  it("authorizes a private link explicitly and clears it immediately across current-filter replacement", async () => {
    jobs = [{ ...originalJob, state: "ready", bytes: 100 }];
    const view = render(<ResponseExports {...props} />);
    await screen.findByText("CSV · 1 responses");
    click(/Authorize download/);
    const link = await screen.findByRole("link", { name: "Download CSV" });
    expect(link.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(link.getAttribute("target")).toBe("_blank");
    view.rerender(
      <ResponseExports
        {...props}
        filters={{ q: "Different current filter" }}
      />,
    );
    expect(screen.queryByRole("link")).toBeNull();
  });
  it("cancels late link authorization when its current filter/selection scope is replaced", async () => {
    jobs = [{ ...originalJob, state: "ready", bytes: 100 }];
    const view = render(<ResponseExports {...props} />);
    await screen.findByText("CSV · 1 responses");
    const pending = deferred<{ url: string; expiresIn: number }>();
    apiMock.mockReturnValueOnce(pending.promise);
    click(/Authorize download/);
    const signal = apiMock.mock.calls.at(-1)![1].signal;
    view.rerender(
      <ResponseExports {...props} selected={["different-response"]} />,
    );
    expect(signal.aborted).toBe(true);
    await act(async () =>
      pending.resolve({
        url: "https://storage.example.test/fictional",
        expiresIn: 60,
      }),
    );
    expect(screen.queryByRole("link")).toBeNull();
  });
  it("treats malformed mutation and inspection results as unconfirmed", async () => {
    render(<ResponseExports {...props} />);
    await loaded();
    await review();
    apiMock.mockResolvedValueOnce({ job: {} });
    click("Create export");
    await uncertain();
    apiMock.mockResolvedValueOnce({
      committed: true,
      canRetry: false,
      receipt: {},
      job: originalJob,
    });
    click("Check original export outcome");
    await screen.findByText(/export result could not be verified/);
    expect(
      (
        screen.getByRole("button", {
          name: "Retry identical export change",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
  it("latches rapid duplicate creation activation before React can redraw", async () => {
    render(<ResponseExports {...props} />);
    await loaded();
    await review();
    const pending = deferred<{ job: typeof originalJob }>();
    apiMock.mockReturnValueOnce(pending.promise);
    const create = screen.getByRole("button", { name: "Create export" });
    act(() => {
      fireEvent.click(create);
      fireEvent.click(create);
    });
    expect(
      apiMock.mock.calls.filter(([, options]) => options?.method === "POST"),
    ).toHaveLength(1);
    await act(async () => pending.resolve({ job: { ...originalJob, sensitive: true } }));
    await screen.findByText(/Original export request confirmed/);
  });
  it("refuses an expired proposed review before dispatching a creation", async () => {
    render(<ResponseExports {...props} />);
    await loaded();
    await review();
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 47 * 60 * 60 * 1000);
    click("Create export");
    await screen.findByText(/export review expired/);
    expect(attempts).toHaveLength(0);
  });
  it("bounds uncertain recovery to 47 hours without an automatic replacement", async () => {
    lose = "before";
    render(<ResponseExports {...props} />);
    await loaded();
    await review();
    click("Create export");
    await uncertain();
    const calls = apiMock.mock.calls.length;
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 47 * 60 * 60 * 1000);
    click("Check original export outcome");
    await screen.findByText(
      /safe retry window or target export lifetime ended/,
    );
    expect(apiMock.mock.calls.length).toBe(calls);
    expect(attempts).toHaveLength(1);
  });
  it("aborts an unmounted outcome check and ignores its late accepted result", async () => {
    lose = "after";
    const view = render(<ResponseExports {...props} />);
    await loaded();
    await review();
    click("Create export");
    await uncertain();
    const pending = deferred<unknown>();
    apiMock.mockReturnValueOnce(pending.promise);
    click("Check original export outcome");
    const signal = apiMock.mock.calls.at(-1)![1].signal;
    view.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () =>
      pending.resolve({
        committed: true,
        canRetry: false,
        job: originalJob,
        receipt: {
          id: originalJob.id,
          formId: props.formId,
          sourceId: null,
          action: "create",
        },
      }),
    );
    expect(screen.queryByText(/Original export request confirmed/)).toBeNull();
    expect(attempts).toHaveLength(1);
  });
  it("expires an authorized export link without fetching again or moving focus", async () => {
    vi.useFakeTimers();
    jobs = [{ ...originalJob, state: "ready", bytes: 100 }];
    render(<ResponseExports {...props} />);
    await act(async () => {});
    await act(async () => click(/Authorize download/));
    expect(screen.queryByRole("link")).toBeTruthy();
    const refreshButton = screen.getByRole("button", {
      name: "Refresh exports",
    });
    refreshButton.focus();
    const calls = apiMock.mock.calls.length;
    act(() => vi.advanceTimersByTime(55000));
    expect(screen.queryByRole("link")).toBeNull();
    expect(document.activeElement).toBe(refreshButton);
    expect(apiMock.mock.calls.length).toBe(calls);
  });
  it("does not load or expose private exports without a current account", () => {
    identity.id = "";
    render(<ResponseExports {...props} />);
    expect(apiMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
describe("Immutable export intent transport", () => {
  it("detaches selected IDs and filters from later caller mutations", () => {
    const request = {
        format: "csv" as const,
        filters: { ...props.filters },
        selected: [...props.selected],
        columns: [...props.columns],
        sensitive: false,
      },
      intent = prepareExportCreation(props.formId, request);
    request.filters.q = "Changed later";
    request.selected[0] = "Changed later";
    expect(JSON.parse(intent.body).filters.q).toBe(props.filters.q);
    expect(JSON.parse(intent.body).filters.selected).toEqual(props.selected);
  });
  it("rejects an apparently valid saved job with a different requested format or sensitive audience", async () => {
    const intent = prepareExportCreation(props.formId, {
      format: "csv",
      ...props,
      sensitive: false,
    });
    apiMock.mockResolvedValueOnce({ job: { ...originalJob, format: "json" } });
    await expect(submitExportWrite(intent)).rejects.toMatchObject({
      status: 503,
    });
    apiMock.mockResolvedValueOnce({
      committed: true,
      canRetry: false,
      job: { ...originalJob, sensitive: true },
      receipt: {
        id: originalJob.id,
        formId: props.formId,
        sourceId: null,
        action: "create",
      },
    });
    await expect(inspectExportWrite(intent)).rejects.toMatchObject({
      status: 503,
    });
  });
  it("rejects substituted receipt targets and malformed saved jobs before acknowledgment", async () => {
    const intent = prepareExportCreation(props.formId, {
      format: "csv",
      ...props,
      sensitive: false,
    });
    apiMock.mockResolvedValueOnce({ job: { ...originalJob, count: -1 } });
    await expect(submitExportWrite(intent)).rejects.toMatchObject({
      status: 503,
    });
    apiMock.mockResolvedValueOnce({
      committed: true,
      canRetry: false,
      job: originalJob,
      receipt: {
        id: originalJob.id,
        formId: "other-form",
        sourceId: null,
        action: "create",
      },
    });
    await expect(inspectExportWrite(intent)).rejects.toMatchObject({
      status: 503,
    });
  });
});
