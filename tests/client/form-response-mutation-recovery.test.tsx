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
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ApiFailure } from "../../src/lib/api";
import { createTemplate } from "../../shared/forms";
import ResponseActionReview from "../../src/ui/forms/ResponseActionReview";
import ResponseWorkspace from "../../src/ui/forms/ResponseWorkspace";
import {
  prepareResponseWrite,
  inspectResponseWrite,
} from "../../src/ui/forms/response-write-api";
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
  useAdmin: () => ({ currentAdmin: identity }),
}));
vi.mock("@/hooks/useDraftGuard", () => ({
  useDraftGuard: guard,
  useNavigationSafety: () => ({
    request: (run: () => void) => run(),
    allow: (run: () => void) => run(),
  }),
}));
const formId = "fictional-form",
  root = "/admin/forms/" + formId,
  row = {
    id: "fictional-response",
    formId,
    version: 1,
    revision: 2,
    status: "complete",
    redacted: false,
    submittedAt: "2026-11-06T12:00:00Z",
    answers: { "fictional-name": "Fictional private answer" },
    respondent: {
      name: "Fictional Private Respondent",
      email: "fictional-private@example.test",
      source: "self_reported",
    },
  },
  base = root + "/responses/" + row.id;
let receipts: Map<string, unknown>,
  attempts: {
    key: string;
    body: string;
    method: string;
    signal: AbortSignal;
  }[],
  lose: "" | "before" | "after",
  currentMetadata: {
    id: string;
    revision: number;
    status: string;
    redacted: boolean;
    deleted: boolean;
  },
  commits: number,
  held: boolean;
const callbacks = {
  onStateChange: vi.fn(),
  onComplete: vi.fn(),
  onDenied: vi.fn(),
  onReload: vi.fn(),
};
function pending<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}
function mount(overrides = {}) {
  return render(
    <ResponseActionReview
      formId={formId}
      response={row}
      disabled={false}
      held={false}
      {...callbacks}
      {...overrides}
    />,
  );
}
function click(name: string) {
  fireEvent.click(screen.getByRole("button", { name, exact: true }));
}
function review(action: "delete" | "redact") {
  click(action === "delete" ? "Delete response" : "Redact identity");
  fireEvent.change(screen.getByLabelText(/Confirm response action/), {
    target: { value: action.toUpperCase() },
  });
}
async function unknown() {
  await screen.findByRole("region", {
    name: "Unconfirmed response action",
    exact: true,
  });
}
beforeEach(() => {
  apiMock.mockReset();
  guard.mockClear();
  Object.values(callbacks).forEach((fn) => fn.mockClear());
  identity.id = "fictional-reviewer";
  identity.role = "admin";
  receipts = new Map();
  attempts = [];
  lose = "";
  commits = 0;
  held = false;
  currentMetadata = {
    id: row.id,
    revision: 2,
    status: "complete",
    redacted: false,
    deleted: false,
  };
  Object.defineProperty(navigator, "onLine", {
    value: true,
    configurable: true,
  });
  apiMock.mockImplementation(
    async (
      path: string,
      options: {
        method?: string;
        body?: { revision: number };
        idempotencyKey?: string;
        signal: AbortSignal;
      },
    ) => {
      if (path.includes("/recovery?")) {
        const receipt = receipts.get(options.idempotencyKey!);
        return {
          committed: !!receipt,
          canRetry: !receipt && !held && !currentMetadata.deleted,
          held,
          ...(receipt ? { receipt } : {}),
          response: { ...currentMetadata },
        };
      }
      if (
        path === base &&
        ["DELETE", "PATCH"].includes(options?.method || "")
      ) {
        const action = options.method === "DELETE" ? "delete" : "redact",
          key = options.idempotencyKey!;
        attempts.push({
          key,
          body: JSON.stringify(options.body),
          method: options.method!,
          signal: options.signal,
        });
        if (lose === "before") {
          lose = "";
          throw TypeError("Fictional response connection loss");
        }
        if (!receipts.has(key)) {
          commits++;
          currentMetadata = {
            ...currentMetadata,
            status: action === "delete" ? "deleted" : "redacted",
            redacted: action === "redact",
            deleted: action === "delete",
          };
          receipts.set(key, { id: row.id, formId, action });
        }
        if (lose === "after") {
          lose = "";
          throw TypeError("Fictional response result loss");
        }
        return {
          committed: true,
          canRetry: false,
          receipt: receipts.get(key),
          response: { ...currentMetadata },
        };
      }
      throw Error("Unexpected fictional response request");
    },
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe("Irreversible response review and recovery", () => {
  for (const action of ["delete", "redact"] as const) {
    it(`requires exact typed ${action} review and sends metadata only`, async () => {
      mount();
      click(action === "delete" ? "Delete response" : "Redact identity");
      expect(
        (
          screen.getByRole("button", {
            name: "Confirm " + action,
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
      fireEvent.change(screen.getByLabelText(/Confirm response action/), {
        target: { value: action },
      });
      expect(
        (
          screen.getByRole("button", {
            name: "Confirm " + action,
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
      fireEvent.change(screen.getByLabelText(/Confirm response action/), {
        target: { value: action.toUpperCase() },
      });
      click("Confirm " + action);
      await waitFor(() =>
        expect(callbacks.onComplete).toHaveBeenCalledTimes(1),
      );
      expect(attempts).toHaveLength(1);
      expect(commits).toBe(1);
      expect(attempts[0].body).not.toMatch(/private|answers|respondent/);
      expect(JSON.parse(attempts[0].body)).toMatchObject({
        revision: 2,
        status: "complete",
        redacted: false,
        confirmation: action.toUpperCase(),
      });
      expect(callbacks.onStateChange).toHaveBeenCalledWith({
        dirty: true,
        busy: true,
        hideDetails: true,
      });
    });
    for (const loss of ["before", "after"] as const) {
      it(`recovers ${action} ${loss}-acceptance response loss without replacement actions`, async () => {
        lose = loss;
        mount();
        review(action);
        click("Confirm " + action);
        await unknown();
        expect(attempts).toHaveLength(1);
        expect(commits).toBe(loss === "after" ? 1 : 0);
        expect(
          (
            screen.getByRole("button", {
              name: "Retry identical response action",
            }) as HTMLButtonElement
          ).disabled,
        ).toBe(true);
        click("Check original response outcome");
        if (loss === "before") {
          await screen.findByText(/No committed receipt was found/);
          click("Retry identical response action");
        }
        await waitFor(() =>
          expect(callbacks.onComplete).toHaveBeenCalledTimes(1),
        );
        expect(commits).toBe(1);
        expect(attempts).toHaveLength(loss === "before" ? 2 : 1);
        if (loss === "before") expect(attempts[1].body).toBe(attempts[0].body);
        if (loss === "before") expect(attempts[1].key).toBe(attempts[0].key);
      });
    }
  }
  it("latches rapid duplicate confirmation before React redraws", async () => {
    mount();
    review("delete");
    const wait = pending<unknown>();
    apiMock.mockReturnValueOnce(wait.promise);
    const button = screen.getByRole("button", { name: "Confirm delete" });
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    expect(apiMock).toHaveBeenCalledTimes(1);
    expect(callbacks.onStateChange).toHaveBeenCalledWith({
      dirty: true,
      busy: true,
      hideDetails: true,
    });
    await act(async () =>
      wait.resolve({
        committed: true,
        canRetry: false,
        receipt: { id: row.id, formId, action: "delete" },
        response: { ...currentMetadata, status: "deleted", deleted: true },
      }),
    );
  });
  for (const change of ["revision", "privacy state", "hold"]) {
    it(`does not retry an unaccepted action after its current ${change} changes`, async () => {
      lose = "before";
      mount();
      review("delete");
      click("Confirm delete");
      await unknown();
      if (change === "revision") currentMetadata.revision = 3;
      if (change === "privacy state") {
        currentMetadata.status = "redacted";
        currentMetadata.redacted = true;
      }
      if (change === "hold") held = true;
      click("Check original response outcome");
      await screen.findByText(/target is no longer ready/);
      expect(
        (
          screen.getByRole("button", {
            name: "Retry identical response action",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
      expect(attempts).toHaveLength(1);
    });
  }
  it("requires a fresh outcome check after the retry response is lost", async () => {
    lose = "before";
    mount();
    review("redact");
    click("Confirm redact");
    await unknown();
    click("Check original response outcome");
    await screen.findByText(/No committed receipt was found/);
    lose = "after";
    click("Retry identical response action");
    await screen.findByText("Fictional response result loss");
    expect(
      (
        screen.getByRole("button", {
          name: "Retry identical response action",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    click("Check original response outcome");
    await waitFor(() => expect(callbacks.onComplete).toHaveBeenCalledTimes(1));
    expect(attempts).toHaveLength(2);
    expect(commits).toBe(1);
  });
  it("retains a known stale proposal for explicit current-record reload without silently resubmitting", async () => {
    mount();
    review("delete");
    apiMock.mockRejectedValueOnce(
      new ApiFailure(409, "CONFLICT", "Fictional response changed"),
    );
    click("Confirm delete");
    await screen.findByText(/Fictional response changed/);
    expect(
      (screen.getByLabelText(/Confirm response action/) as HTMLInputElement)
        .value,
    ).toBe("DELETE");
    expect(
      (
        screen.getByRole("button", {
          name: "Confirm delete",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    click("Reload current response and review again");
    expect(callbacks.onReload).toHaveBeenCalledTimes(1);
    expect(apiMock).toHaveBeenCalledTimes(1);
  });
  for (const status of [401, 403, 404]) {
    it(`clears a rejected initial ${status} action through the parent privacy fence`, async () => {
      mount();
      review("delete");
      apiMock.mockRejectedValueOnce(
        new ApiFailure(status, "DENIED", "Fictional response access changed"),
      );
      click("Confirm delete");
      await waitFor(() => expect(callbacks.onDenied).toHaveBeenCalledTimes(1));
      expect(
        screen.queryByRole("region", { name: "Unconfirmed response action" }),
      ).toBeNull();
    });
    it(`clears uncertain recovery when inspection returns ${status}`, async () => {
      lose = "before";
      mount();
      review("delete");
      click("Confirm delete");
      await unknown();
      apiMock.mockRejectedValueOnce(
        new ApiFailure(status, "DENIED", "Fictional response access changed"),
      );
      click("Check original response outcome");
      await waitFor(() => expect(callbacks.onDenied).toHaveBeenCalledTimes(1));
      expect(attempts).toHaveLength(1);
    });
  }
  it("aborts pending erasure on session invalidation and ignores its late result", async () => {
    mount();
    review("delete");
    const wait = pending<unknown>();
    apiMock.mockReturnValueOnce(wait.promise);
    click("Confirm delete");
    const signal = apiMock.mock.calls.at(-1)![1].signal;
    act(() => window.dispatchEvent(new Event("gdg:session-cleared")));
    expect(signal.aborted).toBe(true);
    expect(callbacks.onDenied).toHaveBeenCalledTimes(1);
    await act(async () =>
      wait.resolve({
        committed: true,
        canRetry: false,
        receipt: { id: row.id, formId, action: "delete" },
        response: { ...currentMetadata, deleted: true, status: "deleted" },
      }),
    );
    expect(callbacks.onComplete).not.toHaveBeenCalled();
  });
  it("marks an offline interrupted request uncertain and never resends at reconnection", async () => {
    mount();
    review("delete");
    const wait = pending<unknown>();
    apiMock.mockReturnValueOnce(wait.promise);
    click("Confirm delete");
    const signal = apiMock.mock.calls.at(-1)![1].signal;
    Object.defineProperty(navigator, "onLine", {
      value: false,
      configurable: true,
    });
    act(() => window.dispatchEvent(new Event("offline")));
    await unknown();
    expect(signal.aborted).toBe(true);
    const calls = apiMock.mock.calls.length;
    Object.defineProperty(navigator, "onLine", {
      value: true,
      configurable: true,
    });
    act(() => window.dispatchEvent(new Event("online")));
    expect(apiMock.mock.calls.length).toBe(calls);
    await act(async () => wait.resolve({}));
    expect(callbacks.onComplete).not.toHaveBeenCalled();
  });
  for (const change of ["account", "role", "form", "response"]) {
    it(`cancels original ${change} scope and fences a late accepted result`, async () => {
      const view = mount();
      review("delete");
      const wait = pending<unknown>();
      apiMock.mockReturnValueOnce(wait.promise);
      click("Confirm delete");
      const signal = apiMock.mock.calls.at(-1)![1].signal;
      if (change === "account") identity.id = "other-fictional-reviewer";
      if (change === "role") identity.role = "team_member";
      view.rerender(
        <ResponseActionReview
          formId={change === "form" ? "other-form" : formId}
          response={
            change === "response" ? { ...row, id: "other-response" } : row
          }
          disabled={false}
          held={false}
          {...callbacks}
        />,
      );
      expect(signal.aborted).toBe(true);
      await act(async () =>
        wait.resolve({
          committed: true,
          canRetry: false,
          receipt: { id: row.id, formId, action: "delete" },
          response: { ...currentMetadata, status: "deleted", deleted: true },
        }),
      );
      expect(callbacks.onComplete).not.toHaveBeenCalled();
    });
  }
  it("blocks actions without a fresh revision/state or hold check and omits repeat redaction", () => {
    const view = mount({ response: { ...row, revision: undefined } });
    expect(
      (
        screen.getByRole("button", {
          name: "Delete response",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    view.rerender(
      <ResponseActionReview
        formId={formId}
        response={row}
        disabled={false}
        held={true}
        {...callbacks}
      />,
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Delete response",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    view.rerender(
      <ResponseActionReview
        formId={formId}
        response={{ ...row, status: "redacted", redacted: true }}
        disabled={false}
        held={false}
        {...callbacks}
      />,
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Redact identity",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(apiMock).not.toHaveBeenCalled();
  });
  it("bounds response recovery to 47 hours and does not issue a late read or replacement", async () => {
    lose = "before";
    mount();
    review("delete");
    click("Confirm delete");
    await unknown();
    const count = apiMock.mock.calls.length;
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 47 * 60 * 60 * 1000);
    click("Check original response outcome");
    await screen.findByText(/safe retry window ended/);
    expect(apiMock.mock.calls.length).toBe(count);
    expect(attempts).toHaveLength(1);
  });
  it("keeps malformed saved outcomes unconfirmed rather than restoring answers", async () => {
    mount();
    review("delete");
    apiMock.mockResolvedValueOnce({
      committed: true,
      canRetry: false,
      response: {},
    });
    click("Confirm delete");
    await unknown();
    expect(callbacks.onComplete).not.toHaveBeenCalled();
  });
  it("acknowledges stopping recovery only through an explicit current-record reload", async () => {
    lose = "before";
    mount();
    review("delete");
    click("Confirm delete");
    await unknown();
    click("Stop tracking this response action");
    expect(callbacks.onReload).toHaveBeenCalledTimes(1);
    expect(attempts).toHaveLength(1);
  });
});
describe("Privacy-preserving parent workspace integration", () => {
  it("removes raw identity, answers and historical controls while preserving metadata-only reconciliation", async () => {
    const template = createTemplate(
        "Fictional integrated privacy review",
        "blank",
      ),
      form = {
        ...template,
        id: formId,
        revision: 1,
        status: "Open",
        fields: [
          {
            ...template.fields[0],
            id: "fictional-name",
            label: "Fictional question",
          },
        ],
        actions: ["view", "view_responses", "delete"],
        versions: [
          {
            ...template,
            fields: [
              {
                ...template.fields[0],
                id: "fictional-name",
                label: "Fictional question",
              },
            ],
            version: 1,
            publishedAt: "2026-11-06T12:00:00Z",
          },
        ],
      };
    const mutation = apiMock.getMockImplementation()!;
    lose = "after";
    apiMock.mockImplementation((path: string, options: { method?: string }) => {
      if (path === root && !options?.method) return Promise.resolve({ form });
      if (path === root + "/views") return Promise.resolve({ items: [] });
      if (path === root + "/privacy") return Promise.resolve({ held: false });
      if (path.startsWith(root + "/responses?") && !options?.method)
        return Promise.resolve({
          items: currentMetadata.deleted ? [] : [row],
          total: currentMetadata.deleted ? 0 : 1,
          page: 1,
          pageSize: 30,
        });
      return mutation(path, options);
    });
    render(
      <MemoryRouter initialEntries={[root + "/responses"]}>
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
    await screen.findByRole("heading", { name: "1 matching responses" });
    click("Open response " + row.id);
    await screen.findByText("Fictional private answer");
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Delete response",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    review("delete");
    click("Confirm delete");
    await unknown();
    expect(
      screen.queryByText(row.respondent.email, { exact: false }),
    ).toBeNull();
    expect(
      screen.queryByText(row.respondent.name, { exact: false }),
    ).toBeNull();
    expect(screen.queryByText("Fictional private answer")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Review revision history" }),
    ).toBeNull();
    expect(screen.getByRole("dialog")).toBeTruthy();
    click("Check original response outcome");
    await screen.findByRole("heading", { name: "No responses match" });
    expect(attempts).toHaveLength(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("rejects substituted receipts and never puts identity in a prepared request", async () => {
    const intent = prepareResponseWrite(formId, row, "delete", "DELETE");
    expect(JSON.stringify(intent)).not.toMatch(
      /Fictional Private|fictional-private|Fictional private answer/,
    );
    apiMock.mockResolvedValueOnce({
      committed: true,
      canRetry: false,
      receipt: { id: row.id, formId: "other-form", action: "delete" },
      response: { ...currentMetadata, deleted: true, status: "deleted" },
    });
    await expect(inspectResponseWrite(intent)).rejects.toMatchObject({
      status: 503,
    });
  });
});
