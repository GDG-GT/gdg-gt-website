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
import { MemoryRouter } from "react-router-dom";
import PrivacyPanel from "../../src/ui/forms/PrivacyPanel";
import {
  preparePrivacyWrite,
  inspectPrivacyWrite,
  type PrivacyState,
} from "../../src/ui/forms/form-privacy-api";
import { ApiFailure } from "../../src/lib/api";
const { apiMock, identity, guard } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  identity: { id: "fictional-privacy-admin", role: "admin" },
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
  useNavigationSafety: () => ({ request: (run: () => void) => run() }),
}));
const formId = "fictional-form",
  responseId = "fictional-response",
  callbacks = { onSaved: vi.fn(), onStateChange: vi.fn() },
  proof = "fictional-current-proof",
  freshProof = "fictional-fresh-proof";
type Options = {
  method?: string;
  body?: Record<string, unknown>;
  idempotencyKey?: string;
  signal?: AbortSignal;
};
let currentState: PrivacyState,
  mode: "" | "before" | "after",
  commits: number,
  receipts: Map<string, number>,
  failure: Error | undefined,
  readFailure: Error | undefined,
  inspectFailure: Error | undefined,
  reads: number;
const seed = (individual = false): PrivacyState => ({
  formId,
  revision: 0,
  held: false,
  reason: "",
  draftDays: 7,
  canRelease: true,
  totalResponses: 1,
  heldResponses: 0,
  dueResponses: 0,
  nextExpiry: "2027-01-01T12:00:00Z",
  pendingFiles: 0,
  ...(individual
    ? {
        responseId,
        responseRevision: 0,
        responseHeld: false,
        responseReason: "",
        responseExpiresAt: "2027-01-01T12:00:00Z",
        effectiveResponseHold: false,
      }
    : {}),
});
const writes = () => apiMock.mock.calls.filter(([, o]) => o?.method);
function mount(individual = false) {
  return render(
    <MemoryRouter>
      <main id="workspace-content" tabIndex={-1}>
        <PrivacyPanel
          formId={formId}
          responseId={individual ? responseId : undefined}
          {...callbacks}
        />
      </main>
    </MemoryRouter>,
  );
}
async function fill(_individual = false) {
  const reason = await screen.findByLabelText(/Private operational reason/);
  fireEvent.change(reason, {
    target: { value: "Fictional reviewed private hold reason" },
  });
  fireEvent.click(screen.getByRole("checkbox", { name: /Retain (this|all) responses?/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: /I have reviewed/ }));
  fireEvent.change(screen.getByLabelText("Current password"), {
    target: { value: proof },
  });
}
function click(name: string) {
  fireEvent.click(screen.getByRole("button", { name, exact: true }));
}
async function unknown() {
  return screen.findByRole("region", { name: "Unconfirmed privacy review" });
}
beforeEach(() => {
  currentState = seed();
  mode = "";
  commits = 0;
  receipts = new Map();
  failure = undefined;
  readFailure = undefined;
  inspectFailure = undefined;
  reads = 0;
  apiMock.mockReset();
  guard.mockReset();
  Object.values(callbacks).forEach((fn) => fn.mockReset());
  identity.id = "fictional-privacy-admin";
  identity.role = "admin";
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  apiMock.mockImplementation(async (path: string, o: Options = {}) => {
    if (o.method) {
      if (failure) throw failure;
      if (mode === "before") {
        mode = "";
        throw new TypeError("Fictional before-acceptance privacy interruption");
      }
      const individual = path.includes("/responses/");
      if (!receipts.has(o.idempotencyKey!)) {
        const previous = individual
            ? currentState.responseRevision!
            : currentState.revision,
          next = previous + 1;
        commits++;
        receipts.set(o.idempotencyKey!, next);
        currentState = {
          ...currentState,
          ...(individual
            ? {
                responseRevision: next,
                responseHeld: !!o.body!.held,
                responseReason: String(o.body!.reason),
                effectiveResponseHold: !!o.body!.held,
              }
            : {
                revision: next,
                held: !!o.body!.held,
                reason: String(o.body!.reason),
                draftDays: Number(o.body!.draftDays),
              }),
        };
      }
      if (mode === "after") {
        mode = "";
        throw new TypeError("Fictional lost privacy acknowledgement");
      }
      return { revision: receipts.get(o.idempotencyKey!) };
    }
    if (path.endsWith("/recovery")) {
      if (inspectFailure) throw inspectFailure;
      const revision = receipts.get(o.idempotencyKey!),
        individual = path.includes("/responses/");
      return {
        committed: !!revision,
        canRetry: !revision,
        formId,
        responseId: individual ? responseId : null,
        currentRevision: individual
          ? currentState.responseRevision
          : currentState.revision,
        held: individual ? currentState.responseHeld : currentState.held,
        canRelease: currentState.canRelease,
        targetExists: true,
        receipt: revision
          ? { formId, responseId: individual ? responseId : null, revision }
          : null,
      };
    }
    reads++;
    if (readFailure) throw readFailure;
    return structuredClone(currentState);
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("Revision-bound retention/hold recovery", () => {
  for (const individual of [false, true])
    for (const loss of ["before", "after"] as const)
      it(`${individual ? "individual" : "form"} hold recovers ${loss} loss with fresh proof only when needed`, async () => {
        currentState = seed(individual);
        mode = loss;
        mount(individual);
        await fill(individual);
        click("Confirm privacy review");
        const recovery = await unknown();
        const original = writes()[0][1];
        expect(original.body.currentPassword).toBe(proof);
        expect(
          (screen.getByLabelText("Current password") as HTMLInputElement).value,
        ).toBe("");
        expect(
          (
            within(recovery).getByRole("button", {
              name: "Retry identical privacy review",
            }) as HTMLButtonElement
          ).disabled,
        ).toBe(true);
        click("Check original privacy outcome");
        if (loss === "before") {
          await within(recovery).findByText(/No committed receipt was found/);
          expect(
            (
              within(recovery).getByRole("button", {
                name: "Retry identical privacy review",
              }) as HTMLButtonElement
            ).disabled,
          ).toBe(true);
          fireEvent.change(
            within(recovery).getByLabelText(
              /Current password for identical retry/,
            ),
            { target: { value: freshProof } },
          );
          click("Retry identical privacy review");
        }
        await waitFor(() => expect(callbacks.onSaved).toHaveBeenCalledTimes(1));
        expect(commits).toBe(1);
        expect(writes()).toHaveLength(loss === "before" ? 2 : 1);
        if (loss === "before") {
          const { currentPassword, ...body } = writes()[1][1].body;
          const { currentPassword: originalProof, ...originalBody } =
            original.body;
          expect(currentPassword).toBe(freshProof);
          expect(originalProof).toBe(proof);
          expect(body).toEqual(originalBody);
          expect(writes()[1][1].idempotencyKey).toBe(original.idempotencyKey);
        }
      });
  it("retains proposed values on read failure and rechecks without writing", async () => {
    mount();
    await fill();
    readFailure = new ApiFailure(
      503,
      "UNAVAILABLE",
      "Fictional retention outage",
    );
    act(() => window.dispatchEvent(new Event("offline")));
    act(() => window.dispatchEvent(new Event("online")));
    click("Recheck privacy settings");
    await screen.findByText("Fictional retention outage");
    expect(
      (
        screen.getByLabelText(
          /Private operational reason/,
        ) as HTMLTextAreaElement
      ).value,
    ).toBe("Fictional reviewed private hold reason");
    expect(
      (
        screen.getByRole("button", {
          name: "Confirm privacy review",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(writes()).toHaveLength(0);
    readFailure = undefined;
    click("Recheck privacy settings");
    await waitFor(() =>
      expect(screen.queryByText("Fictional retention outage")).toBeNull(),
    );
    expect(
      (
        screen.getByLabelText(
          /Private operational reason/,
        ) as HTMLTextAreaElement
      ).value,
    ).toBe("Fictional reviewed private hold reason");
  });
  it("requires explicit discarding/review after a changed saved policy revision", async () => {
    mount();
    await fill();
    currentState = { ...currentState, revision: 1 };
    act(() => window.dispatchEvent(new Event("offline")));
    act(() => window.dispatchEvent(new Event("online")));
    click("Recheck privacy settings");
    await screen.findByText(
      /policy revision or previous result needs a new review/,
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Confirm privacy review",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(writes()).toHaveLength(0);
    click("Reload saved privacy settings and discard this review");
    await waitFor(() =>
      expect(
        (
          screen.getByLabelText(
            /Private operational reason/,
          ) as HTMLTextAreaElement
        ).value,
      ).toBe(""),
    );
  });
  it("also detects changed form-wide policy during an individual hold proposal", async () => {
    currentState = seed(true);
    mount(true);
    await fill(true);
    currentState = { ...currentState, revision: 1, held: true };
    act(() => window.dispatchEvent(new Event("offline")));
    act(() => window.dispatchEvent(new Event("online")));
    click("Recheck privacy settings");
    await screen.findByText(
      /policy revision or previous result needs a new review/,
    );
    expect(writes()).toHaveLength(0);
  });
  it("blocks an unaccepted retry after the policy revision changes", async () => {
    mode = "before";
    mount();
    await fill();
    click("Confirm privacy review");
    const recovery = await unknown();
    currentState = { ...currentState, revision: 1 };
    click("Check original privacy outcome");
    await within(recovery).findByText(/target is no longer ready/);
    expect(
      (
        within(recovery).getByRole("button", {
          name: "Retry identical privacy review",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(writes()).toHaveLength(1);
  });
  it("requires another check and new password after a second response loss", async () => {
    mode = "before";
    mount();
    await fill();
    click("Confirm privacy review");
    await unknown();
    click("Check original privacy outcome");
    await screen.findByText(/No committed receipt was found/);
    fireEvent.change(
      screen.getByLabelText(/Current password for identical retry/),
      { target: { value: freshProof } },
    );
    mode = "after";
    click("Retry identical privacy review");
    await screen.findByRole("alert");
    expect(
      (
        screen.getByRole("button", {
          name: "Retry identical privacy review",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    click("Check original privacy outcome");
    await waitFor(() => expect(callbacks.onSaved).toHaveBeenCalledTimes(1));
    expect(commits).toBe(1);
    expect(writes()).toHaveLength(2);
  });
  it("keeps wrong-password review editable without treating it as lost data permission", async () => {
    failure = new ApiFailure(
      403,
      "PASSWORD_REQUIRED",
      "Fictional current password required",
    );
    mount();
    await fill();
    click("Confirm privacy review");
    await screen.findByText("Fictional current password required");
    expect(
      screen.queryByRole("region", { name: "Unconfirmed privacy review" }),
    ).toBeNull();
    expect(
      screen.queryByRole("heading", {
        name: "Privacy access needs to be rechecked",
      }),
    ).toBeNull();
    expect(
      (screen.getByLabelText("Current password") as HTMLInputElement).value,
    ).toBe("");
    expect(
      (
        screen.getByLabelText(
          /Private operational reason/,
        ) as HTMLTextAreaElement
      ).disabled,
    ).toBe(false);
  });
  for (const status of [400, 409, 429])
    it(
      "preserves a known " + status + " proposal until explicit fresh review",
      async () => {
        failure = new ApiFailure(
          status,
          "CONFLICT",
          "Fictional privacy conflict",
        );
        mount();
        await fill();
        click("Confirm privacy review");
        await screen.findByText("Fictional privacy conflict");
        expect(
          (
            screen.getByLabelText(
              /Private operational reason/,
            ) as HTMLTextAreaElement
          ).value,
        ).toBe("Fictional reviewed private hold reason");
        expect(
          (
            screen.getByRole("button", {
              name: "Confirm privacy review",
            }) as HTMLButtonElement
          ).disabled,
        ).toBe(true);
        expect(
          screen.getByRole("button", {
            name: "Reload saved privacy settings and discard this review",
          }),
        ).toBeTruthy();
      },
    );
  for (const status of [401, 403, 404])
    it("clears private settings on denied write " + status, async () => {
      failure = new ApiFailure(status, "NOT_FOUND", "Fictional privacy denial");
      mount();
      await fill();
      click("Confirm privacy review");
      await screen.findByRole("heading", {
        name: "Privacy access needs to be rechecked",
      });
      expect(
        screen.queryByDisplayValue("Fictional reviewed private hold reason"),
      ).toBeNull();
      expect(screen.queryByLabelText("Current password")).toBeNull();
      expect(writes()).toHaveLength(1);
    });
  it("clears private values on read denial and only recovers by explicit recheck", async () => {
    mount();
    await fill();
    readFailure = new ApiFailure(
      403,
      "FORBIDDEN",
      "Fictional revoked retention access",
    );
    act(() => window.dispatchEvent(new Event("offline")));
    act(() => window.dispatchEvent(new Event("online")));
    click("Recheck privacy settings");
    await screen.findByRole("heading", {
      name: "Privacy access needs to be rechecked",
    });
    expect(
      screen.queryByDisplayValue("Fictional reviewed private hold reason"),
    ).toBeNull();
    const count = reads;
    readFailure = undefined;
    act(() => window.dispatchEvent(new Event("online")));
    expect(reads).toBe(count);
    click("Recheck private retention access");
    await screen.findByLabelText(/Private operational reason/);
    expect(writes()).toHaveLength(0);
  });
  it("latches duplicate confirmation before awaiting transport", async () => {
    let resolve!: (value: unknown) => void;
    const original = apiMock.getMockImplementation()!;
    apiMock.mockImplementation((path: string, o: Options = {}) =>
      o.method
        ? new Promise((done) => {
            resolve = done;
          })
        : original(path, o),
    );
    mount();
    await fill();
    const button = screen.getByRole("button", {
      name: "Confirm privacy review",
    });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(writes()).toHaveLength(1);
    await act(async () => resolve({ revision: 1 }));
    expect(callbacks.onSaved).toHaveBeenCalledTimes(1);
  });
  for (const event of ["gdg:session-cleared", "offline"])
    it(
      "cancels " + event + " transport and ignores a late saved result",
      async () => {
        let resolve!: (value: unknown) => void;
        const original = apiMock.getMockImplementation()!;
        apiMock.mockImplementation((path: string, o: Options = {}) =>
          o.method
            ? new Promise((done) => {
                resolve = done;
              })
            : original(path, o),
        );
        mount();
        await fill();
        click("Confirm privacy review");
        const signal = writes()[0][1].signal;
        act(() => window.dispatchEvent(new Event(event)));
        expect(signal.aborted).toBe(true);
        await act(async () => resolve({ revision: 1 }));
        expect(callbacks.onSaved).not.toHaveBeenCalled();
        if (event === "offline") {
          await unknown();
          act(() => window.dispatchEvent(new Event("online")));
          expect(writes()).toHaveLength(1);
        }
      },
    );
  it("abandons only after an explicit review and never sends a replacement", async () => {
    mode = "after";
    mount();
    await fill();
    click("Confirm privacy review");
    await unknown();
    click("Stop tracking this privacy review");
    await screen.findByLabelText(/Private operational reason/);
    expect(writes()).toHaveLength(1);
    expect(callbacks.onSaved).not.toHaveBeenCalled();
  });
  it("keeps passwords out of frozen intent and enforces current target in metadata results", async () => {
    const intent = preparePrivacyWrite(seed(), {
      revision: 0,
      held: true,
      reason: "Fictional reason",
      confirmation: "HOLD " + formId,
      draftDays: 7,
    });
    expect(intent.body).not.toContain("Password");
    expect(Object.isFrozen(intent)).toBe(true);
    apiMock.mockResolvedValue({
      committed: true,
      canRetry: false,
      formId: "different-form",
      responseId: null,
      currentRevision: 1,
      held: true,
      canRelease: true,
      targetExists: true,
      receipt: { formId: "different-form", responseId: null, revision: 1 },
    });
    await expect(inspectPrivacyWrite(intent)).rejects.toMatchObject({
      code: "UNCONFIRMED_PRIVACY",
    });
  });
  it("limits original intent recovery to 47 hours", async () => {
    const at = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(at);
    mode = "before";
    mount();
    await fill();
    click("Confirm privacy review");
    await unknown();
    vi.mocked(Date.now).mockReturnValue(at + 47 * 60 * 60 * 1000);
    click("Check original privacy outcome");
    await screen.findByText(/safe retry window ended/);
    expect(
      apiMock.mock.calls.filter(([path]) => path.endsWith("/recovery")),
    ).toHaveLength(0);
    expect(writes()).toHaveLength(1);
  });
});

it("a non-admin cannot retry a newly held policy release", async () => {
  currentState = {
    ...seed(),
    held: true,
    reason: "Fictional current hold",
    canRelease: false,
  };
  const intent = preparePrivacyWrite(
    { ...currentState, held: false },
    {
      revision: 0,
      held: false,
      reason: "Fictional reviewed release",
      confirmation: "HOLD " + formId,
      draftDays: 7,
    },
  );
  const { privacyRetryReady } = await import(
    "../../src/ui/forms/form-privacy-api"
  );
  expect(
    privacyRetryReady(intent, {
      committed: false,
      canRetry: true,
      formId,
      responseId: null,
      currentRevision: 0,
      held: true,
      canRelease: false,
      targetExists: true,
      receipt: null,
    }),
  ).toBe(false);
});
it("never stores extra password properties in the frozen document", () => {
  const document = {
    revision: 0,
    held: true,
    reason: "Fictional review",
    confirmation: "HOLD " + formId,
    draftDays: 7,
    currentPassword: proof,
  };
  const intent = preparePrivacyWrite(seed(), document);
  expect(intent.body).not.toContain("currentPassword");
  expect(intent.body).not.toContain(proof);
});
it("keeps an unexpected saved revision unconfirmed", async () => {
  const original = apiMock.getMockImplementation()!;
  apiMock.mockImplementation((path: string, o: Options = {}) =>
    o.method ? Promise.resolve({ revision: 999 }) : original(path, o),
  );
  mount();
  await fill();
  click("Confirm privacy review");
  await unknown();
  expect(callbacks.onSaved).not.toHaveBeenCalled();
});

it("rejects a stale starting policy revision before freezing intent", () => {
  expect(() =>
    preparePrivacyWrite(seed(), {
      revision: 1,
      held: true,
      reason: "Fictional reason",
      confirmation: "HOLD " + formId,
      draftDays: 7,
    }),
  ).toThrow();
});
it("cannot prepare an unauthorized starting hold release", () => {
  expect(() =>
    preparePrivacyWrite(
      { ...seed(), held: true, canRelease: false },
      {
        revision: 0,
        held: false,
        reason: "Fictional reviewed release",
        confirmation: "HOLD " + formId,
        draftDays: 7,
      },
    ),
  ).toThrow();
});
