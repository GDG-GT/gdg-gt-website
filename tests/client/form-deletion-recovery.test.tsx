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
import { MemoryRouter } from "react-router-dom";
import FormDeletionReview from "../../src/ui/forms/FormDeletionReview";
import {
  prepareDeletionWrite,
  inspectDeletionWrite,
  type DeletionState,
} from "../../src/ui/forms/form-deletion-api";
import { ApiFailure } from "../../src/lib/api";
const { transport, identity, guard, navigation } = vi.hoisted(() => ({
  transport: vi.fn(),
  identity: { id: "fictional-purge-operator", role: "super_admin" },
  guard: vi.fn(),
  navigation: { request: vi.fn((run: () => void) => run()) },
}));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: transport,
}));
vi.mock("@/contexts/AdminContext", () => ({
  useAdmin: () => ({ currentAdmin: identity }),
}));
vi.mock("@/hooks/useDraftGuard", () => ({
  useDraftGuard: guard,
  useNavigationSafety: () => navigation,
}));
const formId = "fictional-form",
  root = "/admin/forms/" + formId,
  handlers = { onClose: vi.fn(), onDeleted: vi.fn() };
const initial = (): DeletionState => ({
  formId,
  revision: 3,
  archived: true,
  purged: false,
  formHeld: false,
  heldResponses: 0,
  unexpiredResponses: 0,
  retainedResponses: 2,
  activeReferences: 0,
  drafts: 1,
  filesAwaitingCleanup: 0,
  exportsAwaitingCleanup: 0,
  activeExports: 0,
  publishedVersions: 1,
});
const freshReview = () => ({
  reviewId: "fictional-review",
  reviewToken: "fictional-capability",
  expiresAt: new Date(Date.now() + 300000).toISOString(),
  state: { ...state },
});
let state: DeletionState,
  review: ReturnType<typeof freshReview>,
  loss: "before" | "after" | "none",
  commits: number,
  receipt: unknown,
  readFailure: Error | undefined,
  inspectFailure: Error | undefined,
  writeFailure: Error | undefined;
type Options = {
  method?: string;
  body?: Record<string, unknown>;
  idempotencyKey?: string;
  signal?: AbortSignal;
};
const writes = () =>
  transport.mock.calls.filter(
    ([path, o]) => path.endsWith("/permanent-deletion") && o?.method,
  );
const inspect = () => ({
  formId,
  reviewId: review.reviewId,
  committed: !!receipt,
  canRetry: !receipt,
  revision: state.revision,
  reviewExpiresAt: receipt ? null : review.expiresAt,
  receipt,
});
function mount() {
  return render(
    <MemoryRouter>
      <FormDeletionReview
        formId={formId}
        title="Fictional private form"
        {...handlers}
      />
    </MemoryRouter>,
  );
}
function click(name: string) {
  fireEvent.click(screen.getByRole("button", { name, exact: true }));
}
async function prepare() {
  await screen.findByText(/2 retained responses/);
  click("Review permanent deletion");
  await screen.findByLabelText("Current password");
}
function fill() {
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.change(
    screen.getByLabelText("Deletion confirmation", { exact: false }),
    { target: { value: "Fictional private form" } },
  );
  fireEvent.change(screen.getByLabelText("Current password", { exact: true }), {
    target: { value: "fictional-password" },
  });
}
async function start(mode: "before" | "after" = "before") {
  loss = mode;
  mount();
  await prepare();
  fill();
  click("Permanently delete this form");
  return screen.findByRole("region", {
    name: "Unconfirmed permanent deletion change",
  });
}
beforeEach(() => {
  state = initial();
  review = freshReview();
  loss = "none";
  commits = 0;
  receipt = null;
  readFailure = undefined;
  inspectFailure = undefined;
  writeFailure = undefined;
  identity.id = "fictional-purge-operator";
  identity.role = "super_admin";
  transport.mockReset();
  guard.mockReset();
  Object.values(handlers).forEach((f) => f.mockReset());
  navigation.request.mockClear();
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: true,
  });
  transport.mockImplementation(async (path: string, o: Options = {}) => {
    if (path.includes("/recovery")) {
      if (inspectFailure) throw inspectFailure;
      return inspect();
    }
    if (path.endsWith("/deletion-review")) {
      if (o.method) return review;
      if (readFailure) throw readFailure;
      return state;
    }
    if (o.method) {
      if (writeFailure) throw writeFailure;
      if (loss === "before") {
        loss = "none";
        throw Error("Fictional before-dispatch loss");
      }
      if (!receipt) {
        commits++;
        state = { ...state, revision: 4, purged: true };
        receipt = { formId, reviewId: review.reviewId, deleted: true };
      }
      if (loss === "after") {
        loss = "none";
        throw Error("Fictional acknowledgement loss");
      }
      return receipt;
    }
    throw Error("Unexpected fictional request");
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("Irreversible deletion intent recovery", () => {
  it("names initial loading and allows independent eligibility retry without deletion", async () => {
    readFailure = Error("Fictional eligibility outage");
    mount();
    await screen.findByText("Fictional eligibility outage");
    readFailure = undefined;
    click("Retry eligibility check");
    await screen.findByText(/2 retained responses/);
    expect(writes()).toHaveLength(0);
  });
  it.each(["before", "after"] as const)(
    "recovers %s-acceptance loss with read-only inspection and fresh proof only for explicit retry",
    async (mode) => {
      await start(mode);
      const original = writes()[0][1];
      expect(original.body.currentPassword).toBe("fictional-password");
      click("Check original permanent deletion outcome");
      if (mode === "before") {
        await screen.findByText(/No committed receipt was found/);
        const retry = screen.getByRole("button", {
          name: "Retry identical permanent deletion change",
        });
        expect((retry as HTMLButtonElement).disabled).toBe(true);
        fireEvent.change(
          screen.getByLabelText(
            "Current password for identical deletion retry",
            { exact: false },
          ),
          { target: { value: "fictional-new-proof" } },
        );
        fireEvent.click(retry);
        fireEvent.click(retry);
        await waitFor(() => expect(handlers.onDeleted).toHaveBeenCalledOnce());
        expect(writes()[1][1].idempotencyKey).toBe(original.idempotencyKey);
        const { currentPassword, ...replayed } = writes()[1][1].body;
        const { currentPassword: _old, ...first } = original.body;
        expect(replayed).toEqual(first);
        expect(currentPassword).toBe("fictional-new-proof");
      } else
        await waitFor(() => expect(handlers.onDeleted).toHaveBeenCalledOnce());
      expect(commits).toBe(1);
      expect(writes()).toHaveLength(mode === "before" ? 2 : 1);
    },
  );
  it("requires a fresh inspection after a second acknowledgement loss", async () => {
    await start();
    click("Check original permanent deletion outcome");
    const input = await screen.findByLabelText(
      "Current password for identical deletion retry",
      { exact: false },
    );
    fireEvent.change(input, { target: { value: "new-proof" } });
    loss = "after";
    click("Retry identical permanent deletion change");
    await screen.findByText("Fictional acknowledgement loss");
    expect(screen.queryByDisplayValue("new-proof")).toBeNull();
    expect(
      (
        screen.getByRole("button", {
          name: "Retry identical permanent deletion change",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    click("Check original permanent deletion outcome");
    await waitFor(() => expect(handlers.onDeleted).toHaveBeenCalledOnce());
    expect(commits).toBe(1);
  });
  it.each(["revision", "expiry"] as const)(
    "blocks changed %s on an unaccepted original check",
    async (change) => {
      await start();
      if (change === "revision") state = { ...state, revision: 4 };
      else
        review = {
          ...review,
          expiresAt: new Date(Date.now() - 1000).toISOString(),
        };
      click("Check original permanent deletion outcome");
      await screen.findByText(/review expired or the form changed/);
      expect(
        (
          screen.getByRole("button", {
            name: "Retry identical permanent deletion change",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
      expect(commits).toBe(0);
    },
  );
  it.each([401, 403, 404])(
    "clears private counters, title and capability on recovery denial %s",
    async (status) => {
      await start();
      inspectFailure = new ApiFailure(
        status,
        "NOT_FOUND",
        "Fictional denied review",
      );
      click("Check original permanent deletion outcome");
      await screen.findByText("Deletion access restricted");
      expect(screen.queryByText("Fictional private form")).toBeNull();
      expect(screen.queryByText(/2 retained responses/)).toBeNull();
      expect(
        screen.queryByRole("region", {
          name: "Unconfirmed permanent deletion change",
        }),
      ).toBeNull();
      expect(handlers.onDeleted).not.toHaveBeenCalled();
    },
  );
  it("clears a current eligibility denial and excludes old snapshots", async () => {
    mount();
    await prepare();
    readFailure = new ApiFailure(
      404,
      "NOT_FOUND",
      "Fictional eligibility denial",
    );
    click("Recheck eligibility");
    await screen.findByText("Deletion access restricted");
    expect(
      screen.queryByLabelText("Current password", { exact: true }),
    ).toBeNull();
    expect(screen.queryByText(/2 retained responses/)).toBeNull();
  });
  it("keeps wrong password a known failure, clears proof and allows fresh proof before review expiry", async () => {
    mount();
    await prepare();
    fill();
    writeFailure = new ApiFailure(
      403,
      "PASSWORD_REQUIRED",
      "Fictional wrong proof",
    );
    click("Permanently delete this form");
    await screen.findByText("Fictional wrong proof");
    expect(
      (
        screen.getByLabelText("Current password", {
          exact: true,
        }) as HTMLInputElement
      ).value,
    ).toBe("");
    expect(screen.queryByText("Deletion access restricted")).toBeNull();
    expect(
      screen.queryByRole("region", {
        name: "Unconfirmed permanent deletion change",
      }),
    ).toBeNull();
  });
  it("retains proposal on transient eligibility failure and pauses deletion until explicit read succeeds", async () => {
    mount();
    await prepare();
    fill();
    readFailure = Error("Fictional retained eligibility outage");
    click("Recheck eligibility");
    await screen.findByText("Fictional retained eligibility outage");
    expect(screen.getByDisplayValue("Fictional private form")).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Permanently delete this form",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    readFailure = undefined;
    click("Retry eligibility check");
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Permanently delete this form",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    expect(writes()).toHaveLength(0);
  });
  it("blocks local review expiry even without a rerendered clock", async () => {
    mount();
    await prepare();
    fill();
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 301000);
    click("Permanently delete this form");
    await screen.findByText(/Obtain a current eligible deletion review/);
    expect(writes()).toHaveLength(0);
  });
  it("requires reviewed stopping and fresh eligibility before a replacement request", async () => {
    await start();
    click("Stop tracking this permanent deletion change");
    await waitFor(() =>
      expect(
        screen.queryByRole("region", {
          name: "Unconfirmed permanent deletion change",
        }),
      ).toBeNull(),
    );
    await screen.findByText(/2 retained responses/);
    expect(
      screen.queryByLabelText("Current password", { exact: true }),
    ).toBeNull();
    expect(writes()).toHaveLength(1);
    expect(commits).toBe(0);
  });
  it("keeps closure blocked until uncertainty is resolved", async () => {
    await start();
    expect(
      (
        screen.getByRole("button", {
          name: "Close",
          exact: true,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(handlers.onClose).not.toHaveBeenCalled();
  });
  it("clears proof on offline and requires explicit eligibility recheck after reconnect", async () => {
    mount();
    await prepare();
    fill();
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    act(() => window.dispatchEvent(new Event("offline")));
    expect(screen.queryByDisplayValue("fictional-password")).toBeNull();
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    act(() => window.dispatchEvent(new Event("online")));
    fireEvent.change(
      screen.getByLabelText("Current password", { exact: true }),
      { target: { value: "new-proof" } },
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Permanently delete this form",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    click("Recheck eligibility");
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Permanently delete this form",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    expect(writes()).toHaveLength(0);
  });
  it("drops private review and unconfirmed intent when session is cleared", async () => {
    await start();
    act(() => window.dispatchEvent(new Event("gdg:session-cleared")));
    await screen.findByText("Deletion access restricted");
    expect(
      screen.queryByRole("region", {
        name: "Unconfirmed permanent deletion change",
      }),
    ).toBeNull();
    expect(screen.queryByText("Fictional private form")).toBeNull();
  });
  it("requires Super Admin before opening private eligibility", async () => {
    identity.role = "admin";
    mount();
    await screen.findByText("Deletion access restricted");
    expect(transport).not.toHaveBeenCalled();
  });
  it("never stores password runtime properties in the frozen original request", () => {
    const i = prepareDeletionWrite(formId, {
      ...review,
      currentPassword: "do-not-freeze",
    } as typeof review);
    expect(i.body).not.toContain("do-not-freeze");
    expect(JSON.parse(i.body)).not.toHaveProperty("currentPassword");
    expect(Object.isFrozen(i)).toBe(true);
  });
  it("rejects a substituted accepted receipt or impossible tombstone revision", async () => {
    const i = prepareDeletionWrite(formId, review);
    transport.mockResolvedValue({
      ...inspect(),
      committed: true,
      revision: 3,
      receipt: { formId, reviewId: review.reviewId, deleted: true },
    });
    await expect(inspectDeletionWrite(i)).rejects.toMatchObject({
      code: "UNCONFIRMED_DELETION",
    });
  });
});

describe("Deletion authority, expiry and dispatch fences", () => {
  it("blocks operational holds before creating any review capability", async () => {
    state = { ...state, formHeld: true };
    mount();
    await screen.findByRole("region", { name: "Deletion blockers" });
    expect(
      (
        screen.getByRole("button", {
          name: "Review permanent deletion",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(transport.mock.calls.filter(([, o]) => o.method)).toHaveLength(0);
  });
  it("requires a new eligibility read after an uncertain non-destructive review-capability request", async () => {
    const normal = transport.getMockImplementation()!;
    transport.mockImplementation((path: string, o: Options = {}) =>
      path.endsWith("/deletion-review") && o.method
        ? Promise.reject(Error("Fictional review capability outage"))
        : normal(path, o),
    );
    mount();
    await screen.findByText(/2 retained responses/);
    click("Review permanent deletion");
    await screen.findByText(/No permanent deletion was requested/);
    expect(
      (
        screen.getByRole("button", {
          name: "Review permanent deletion",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    click("Recheck eligibility");
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Review permanent deletion",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    expect(writes()).toHaveLength(0);
  });
  it("rejects a malformed review capability without offering irreversible confirmation", async () => {
    review = { ...review, reviewToken: "" };
    mount();
    await screen.findByText(/2 retained responses/);
    click("Review permanent deletion");
    await screen.findByText(/review could not be verified/);
    expect(
      screen.queryByLabelText("Current password", { exact: true }),
    ).toBeNull();
    expect(writes()).toHaveLength(0);
  });
  it("treats a substituted success acknowledgement as unconfirmed", async () => {
    const normal = transport.getMockImplementation()!;
    transport.mockImplementation((path: string, o: Options = {}) =>
      path.endsWith("/permanent-deletion") && o.method
        ? Promise.resolve({
            formId: "fictional-other-form",
            reviewId: review.reviewId,
            deleted: true,
          })
        : normal(path, o),
    );
    mount();
    await prepare();
    fill();
    click("Permanently delete this form");
    await screen.findByRole("region", {
      name: "Unconfirmed permanent deletion change",
    });
    expect(handlers.onDeleted).not.toHaveBeenCalled();
  });
  it("bounds read-only recovery to 47 hours even after short review expiry", async () => {
    await start();
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 48 * 60 * 60 * 1000);
    click("Check original permanent deletion outcome");
    await screen.findByText(/safe retry window ended/);
    expect(
      transport.mock.calls.filter(([p]) => p.includes("/recovery")),
    ).toHaveLength(0);
    expect(writes()).toHaveLength(1);
  });
  it("rechecks the five-minute bound at dispatch even when an inspected retry was previously ready", async () => {
    await start();
    click("Check original permanent deletion outcome");
    const input = await screen.findByLabelText(
      "Current password for identical deletion retry",
      { exact: false },
    );
    fireEvent.change(input, { target: { value: "fresh-proof" } });
    const retry = screen.getByRole("button", {
      name: "Retry identical permanent deletion change",
    });
    expect((retry as HTMLButtonElement).disabled).toBe(false);
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 301000);
    fireEvent.click(retry);
    await screen.findByText(/original deletion review is no longer current/);
    expect(writes()).toHaveLength(1);
    expect(screen.queryByDisplayValue("fresh-proof")).toBeNull();
  });
  it("clears proof and exposes recovery when the connection goes offline during a pending erasure", async () => {
    let resolve!: (v: unknown) => void;
    const waiting = new Promise((done) => (resolve = done)),
      normal = transport.getMockImplementation()!;
    transport.mockImplementation((path: string, o: Options = {}) =>
      path.endsWith("/permanent-deletion") && o.method
        ? waiting
        : normal(path, o),
    );
    mount();
    await prepare();
    fill();
    click("Permanently delete this form");
    const signal = writes()[0][1].signal;
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    act(() => window.dispatchEvent(new Event("offline")));
    await screen.findByRole("region", {
      name: "Unconfirmed permanent deletion change",
    });
    expect(signal.aborted).toBe(true);
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    act(() => window.dispatchEvent(new Event("online")));
    await act(async () =>
      resolve({ formId, reviewId: review.reviewId, deleted: true }),
    );
    expect(handlers.onDeleted).not.toHaveBeenCalled();
    expect(writes()).toHaveLength(1);
  });
  it("isolates the form and actor scope from an obsolete pending deletion", async () => {
    let resolve!: (v: unknown) => void;
    const waiting = new Promise((done) => (resolve = done)),
      normal = transport.getMockImplementation()!;
    transport.mockImplementation((path: string, o: Options = {}) =>
      path.endsWith("/permanent-deletion") && o.method
        ? waiting
        : normal(path, o),
    );
    const v = mount();
    await prepare();
    fill();
    click("Permanently delete this form");
    const signal = writes()[0][1].signal;
    identity.id = "fictional-next-operator";
    v.rerender(
      <MemoryRouter>
        <FormDeletionReview
          formId="fictional-other-form"
          title="Fictional other form"
          {...handlers}
        />
      </MemoryRouter>,
    );
    expect(signal.aborted).toBe(true);
    await act(async () =>
      resolve({ formId, reviewId: review.reviewId, deleted: true }),
    );
    expect(handlers.onDeleted).not.toHaveBeenCalled();
    expect(screen.queryByDisplayValue("Fictional private form")).toBeNull();
  });
});
