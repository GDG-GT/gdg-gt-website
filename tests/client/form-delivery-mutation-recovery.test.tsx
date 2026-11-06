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
import DeliveryPanel from "../../src/ui/forms/DeliveryPanel";
import {
  deliveryChoices,
  prepareDeliveryWrite,
  inspectDeliveryWrite,
  type DeliveryPolicy,
  type DeliveryChoices,
} from "../../src/ui/forms/form-delivery-api";
import { ApiFailure } from "../../src/lib/api";
const { apiMock, identity, guard } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  identity: { id: "fictional-delivery-admin", role: "admin" },
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
  root = "/admin/forms/" + formId + "/delivery",
  proof = "fictional-current-proof",
  freshProof = "fictional-fresh-proof",
  onStateChange = vi.fn();
type Options = {
  method?: string;
  body?: Record<string, unknown>;
  idempotencyKey?: string;
  signal?: AbortSignal;
};
const seed = (): DeliveryPolicy => ({
  formId,
  formRevision: 3,
  revision: 0,
  matchesDraft: false,
  editable: true,
  reviewedAt: null,
  receipts: false,
  receiptAnswers: false,
  notificationUsers: [],
  chapterInbox: false,
  notificationAnswers: false,
  canReviewAnswers: true,
  mailReady: true,
  chapterInboxAvailable: true,
  selectedAccounts: [],
  reference: "DELIVERY " + formId,
});
const rows = Array.from({ length: 215 }, (_, i) => ({
  id: "fictional-recipient-" + String(i + 1).padStart(3, "0"),
  display_name: "Fictional recipient " + String(i + 1).padStart(3, "0"),
  role: "admin",
}));
let policy: DeliveryPolicy,
  mode: "" | "before" | "after",
  commits: number,
  receipts: Map<string, number>,
  failure: Error | undefined,
  policyFailure: Error | undefined,
  candidateFailure: Error | undefined,
  inspectFailure: Error | undefined,
  selectedValid: boolean;
const writes = () => apiMock.mock.calls.filter(([, o]) => o?.method);
function mount(props = {}) {
  return render(
    <MemoryRouter>
      <main id="workspace-content" tabIndex={-1}>
        <DeliveryPanel
          formId={formId}
          saved
          receiptSetting={false}
          access="internal"
          onStateChange={onStateChange}
          {...props}
        />
      </main>
    </MemoryRouter>,
  );
}
function click(name: string) {
  fireEvent.click(screen.getByRole("button", { name, exact: true }));
}
async function fill() {
  await screen.findByLabelText(/Delivery confirmation/);
  fireEvent.change(screen.getByLabelText(/Delivery confirmation/), {
    target: { value: policy.reference },
  });
  fireEvent.change(screen.getByLabelText("Current password"), {
    target: { value: proof },
  });
}
async function chooseFirst() {
  await screen.findByRole("button", { name: "Choose notification recipients" });
  click("Choose notification recipients");
  fireEvent.click(
    await screen.findByRole("checkbox", { name: /Fictional recipient 001/ }),
  );
}
async function unknown() {
  return screen.findByRole("region", { name: "Unconfirmed delivery review" });
}
beforeEach(() => {
  policy = seed();
  mode = "";
  commits = 0;
  receipts = new Map();
  failure = undefined;
  policyFailure = undefined;
  candidateFailure = undefined;
  inspectFailure = undefined;
  selectedValid = true;
  apiMock.mockReset();
  guard.mockReset();
  onStateChange.mockReset();
  identity.id = "fictional-delivery-admin";
  identity.role = "admin";
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  apiMock.mockImplementation(async (path: string, o: Options = {}) => {
    if (o.method) {
      if (failure) throw failure;
      if (mode === "before") {
        mode = "";
        throw new TypeError(
          "Fictional before-acceptance delivery interruption",
        );
      }
      if (!receipts.has(o.idempotencyKey!)) {
        const d = o.body as unknown as DeliveryChoices;
        commits++;
        const revision = policy.revision + 1;
        policy = {
          ...policy,
          ...deliveryChoices({ ...policy, ...d }),
          revision,
          selectedAccounts: d.notificationUsers.map((id) => ({
            ...rows.find((row) => row.id === id)!,
            eligible: true,
          })),
          matchesDraft: true,
        };
        receipts.set(o.idempotencyKey!, revision);
      }
      if (mode === "after") {
        mode = "";
        throw new TypeError("Fictional lost delivery acknowledgement");
      }
      return { revision: receipts.get(o.idempotencyKey!) };
    }
    if (path.includes("/candidates?")) {
      if (candidateFailure) throw candidateFailure;
      const query = new URL("https://fictional.example.test" + path)
          .searchParams,
        q = query.get("q") || "",
        page = Number(query.get("page") || 1),
        items = rows.filter((row) =>
          row.display_name.toLowerCase().includes(q.toLowerCase()),
        );
      return {
        items: items.slice((page - 1) * 30, page * 30),
        total: items.length,
        page,
        pageSize: 30,
      };
    }
    if (path.includes("/recovery?")) {
      if (inspectFailure) throw inspectFailure;
      const revision = receipts.get(o.idempotencyKey!);
      return {
        committed: !!revision,
        canRetry: !revision,
        formId,
        formRevision: policy.formRevision,
        policyRevision: policy.revision,
        editable: policy.editable,
        selectedValid,
        canReviewAnswers: policy.canReviewAnswers,
        mailReady: policy.mailReady,
        chapterInboxAvailable: policy.chapterInboxAvailable,
        receipt: revision ? { formId, revision } : null,
      };
    }
    if (policyFailure) throw policyFailure;
    return structuredClone(policy);
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("Reviewed delivery intent and complete recipient recovery", () => {
  for (const recipients of [false, true])
    for (const loss of ["before", "after"] as const)
      it(`${recipients ? "selected recipient" : "disable-only"} policy recovers ${loss} loss with original body and newly entered proof`, async () => {
        mode = loss;
        mount();
        if (recipients) await chooseFirst();
        await fill();
        await waitFor(() =>
          expect(
            (
              screen.getByRole("button", {
                name: "Confirm delivery review",
              }) as HTMLButtonElement
            ).disabled,
          ).toBe(false),
        );
        click("Confirm delivery review");
        const recovery = await unknown(),
          original = writes()[0][1];
        expect(original.body.currentPassword).toBe(proof);
        expect(original.body.notificationUsers).toEqual(
          recipients ? [rows[0].id] : [],
        );
        expect(
          (screen.getByLabelText("Current password") as HTMLInputElement).value,
        ).toBe("");
        expect(
          (
            within(recovery).getByRole("button", {
              name: "Retry identical delivery review",
            }) as HTMLButtonElement
          ).disabled,
        ).toBe(true);
        click("Check original delivery outcome");
        if (loss === "before") {
          await within(recovery).findByText(/No committed receipt was found/);
          expect(
            (
              within(recovery).getByRole("button", {
                name: "Retry identical delivery review",
              }) as HTMLButtonElement
            ).disabled,
          ).toBe(true);
          fireEvent.change(
            within(recovery).getByLabelText(
              /Current password for identical retry/,
            ),
            { target: { value: freshProof } },
          );
          click("Retry identical delivery review");
        }
        await screen.findByText(
          /Delivery review confirmed at policy revision 1/,
        );
        expect(commits).toBe(1);
        expect(writes()).toHaveLength(loss === "before" ? 2 : 1);
        if (loss === "before") {
          const { currentPassword, ...body } = writes()[1][1].body,
            { currentPassword: originalProof, ...originalBody } = original.body;
          expect(currentPassword).toBe(freshProof);
          expect(originalProof).toBe(proof);
          expect(body).toEqual(originalBody);
          expect(writes()[1][1].idempotencyKey).toBe(original.idempotencyKey);
        }
      });
  it("does not silently drop an unavailable configured recipient", async () => {
    policy = {
      ...seed(),
      notificationUsers: [rows[0].id],
      selectedAccounts: [
        {
          id: rows[0].id,
          display_name: "Unavailable chapter account",
          role: null,
          eligible: false,
        },
      ],
    };
    mount();
    await fill();
    const selected = screen.getByRole("region", {
      name: "Selected chapter recipients",
    });
    expect(
      within(selected).getByText(/Unavailable chapter account/),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /They stay in this proposal until you explicitly remove/,
      ),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Confirm delivery review",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(writes()).toHaveLength(0);
    fireEvent.click(
      within(selected).getByRole("button", {
        name: /Remove notification recipient/,
      }),
    );
    await fill();
    expect(
      (
        screen.getByRole("button", {
          name: "Confirm delivery review",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
    click("Confirm delivery review");
    await screen.findByText(/Delivery review confirmed/);
    expect(writes()[0][1].body.notificationUsers).toEqual([]);
  });
  it("finds the 215th eligible account through real paged client controls", async () => {
    mount();
    await screen.findByRole("button", {
      name: "Choose notification recipients",
    });
    click("Choose notification recipients");
    for (let page = 2; page <= 8; page++) {
      await screen.findByText(
        "Recipient page " + (page - 1) + " of 8 · 215 matching",
      );
      click("Next recipients");
    }
    await screen.findByRole("checkbox", { name: /Fictional recipient 215/ });
    fireEvent.click(
      screen.getByRole("checkbox", { name: /Fictional recipient 215/ }),
    );
    await fill();
    click("Confirm delivery review");
    await screen.findByText(/Delivery review confirmed/);
    expect(writes()[0][1].body.notificationUsers).toEqual([rows[214].id]);
  });
  it("preserves recipient selections across query changes", async () => {
    mount();
    await chooseFirst();
    fireEvent.change(
      screen.getByLabelText("Search eligible notification recipients"),
      { target: { value: "215" } },
    );
    await screen.findByRole("checkbox", { name: /Fictional recipient 215/ });
    expect(
      screen.getByRole("region", { name: "Selected chapter recipients" })
        .textContent,
    ).toContain("Fictional recipient 001");
    await fill();
    click("Confirm delivery review");
    await screen.findByText(/Delivery review confirmed/);
    expect(writes()[0][1].body.notificationUsers).toEqual([rows[0].id]);
  });
  it("keeps newly selected recipients during an inventory outage while pausing approval", async () => {
    mount();
    await chooseFirst();
    await fill();
    candidateFailure = new ApiFailure(
      503,
      "UNAVAILABLE",
      "Fictional candidate outage",
    );
    click("Recheck delivery recipients");
    await screen.findByText("Fictional candidate outage");
    expect(
      screen.getByRole("region", { name: "Selected chapter recipients" })
        .textContent,
    ).toContain("Fictional recipient 001");
    expect(
      (
        screen.getByRole("button", {
          name: "Confirm delivery review",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(writes()).toHaveLength(0);
    candidateFailure = undefined;
    click("Recheck delivery recipients");
    await waitFor(() =>
      expect(screen.queryByText("Fictional candidate outage")).toBeNull(),
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Confirm delivery review",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });
  it("clears all private policy/proposals after candidate denial", async () => {
    mount();
    await chooseFirst();
    candidateFailure = new ApiFailure(
      403,
      "FORBIDDEN",
      "Fictional candidate revocation",
    );
    click("Recheck delivery recipients");
    await screen.findByRole("heading", {
      name: "Delivery access needs to be rechecked",
    });
    expect(
      screen.queryByRole("region", { name: "Selected chapter recipients" }),
    ).toBeNull();
    expect(writes()).toHaveLength(0);
  });
  it("retains typed proof/reference choices during a matching policy read outage", async () => {
    mount();
    await fill();
    policyFailure = new ApiFailure(
      503,
      "UNAVAILABLE",
      "Fictional policy outage",
    );
    act(() => window.dispatchEvent(new Event("offline")));
    act(() => window.dispatchEvent(new Event("online")));
    click("Recheck delivery settings");
    await screen.findByText("Fictional policy outage");
    expect(
      (screen.getByLabelText(/Delivery confirmation/) as HTMLInputElement)
        .value,
    ).toBe("DELIVERY " + formId);
    expect(
      (
        screen.getByRole("button", {
          name: "Confirm delivery review",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(writes()).toHaveLength(0);
  });
  for (const change of ["form", "policy"] as const)
    it(
      "requires explicit reload for changed " + change + " revision",
      async () => {
        mount();
        await fill();
        policy = {
          ...policy,
          ...(change === "form" ? { formRevision: 4 } : { revision: 1 }),
        };
        act(() => window.dispatchEvent(new Event("offline")));
        act(() => window.dispatchEvent(new Event("online")));
        click("Recheck delivery settings");
        await screen.findByText(
          /saved draft, policy revision or previous result needs a new review/,
        );
        expect(
          (
            screen.getByRole("button", {
              name: "Confirm delivery review",
            }) as HTMLButtonElement
          ).disabled,
        ).toBe(true);
        click("Reload saved delivery settings and discard this review");
        await waitFor(() =>
          expect(
            (screen.getByLabelText(/Delivery confirmation/) as HTMLInputElement)
              .value,
          ).toBe(""),
        );
      },
    );
  for (const status of [400, 409, 429])
    it(
      "preserves known " + status + " review until explicit fresh load",
      async () => {
        failure = new ApiFailure(
          status,
          "CONFLICT",
          "Fictional delivery conflict",
        );
        mount();
        await fill();
        click("Confirm delivery review");
        await screen.findByText("Fictional delivery conflict");
        expect(
          screen.queryByRole("region", { name: "Unconfirmed delivery review" }),
        ).toBeNull();
        expect(
          (
            screen.getByRole("button", {
              name: "Confirm delivery review",
            }) as HTMLButtonElement
          ).disabled,
        ).toBe(true);
        expect(
          screen.getByRole("button", {
            name: "Reload saved delivery settings and discard this review",
          }),
        ).toBeTruthy();
      },
    );
  it("distinguishes wrong password proof from loss of private permission", async () => {
    failure = new ApiFailure(
      403,
      "PASSWORD_REQUIRED",
      "Fictional fresh proof required",
    );
    mount();
    await fill();
    click("Confirm delivery review");
    await screen.findByText("Fictional fresh proof required");
    expect(
      screen.queryByRole("heading", {
        name: "Delivery access needs to be rechecked",
      }),
    ).toBeNull();
    expect(
      (screen.getByLabelText("Current password") as HTMLInputElement).value,
    ).toBe("");
    expect(
      (screen.getByLabelText(/Delivery confirmation/) as HTMLInputElement)
        .disabled,
    ).toBe(false);
  });
  for (const status of [401, 403, 404])
    it("clears denied write " + status + " state", async () => {
      failure = new ApiFailure(
        status,
        "FORBIDDEN",
        "Fictional changed delivery access",
      );
      mount();
      await fill();
      click("Confirm delivery review");
      await screen.findByRole("heading", {
        name: "Delivery access needs to be rechecked",
      });
      expect(screen.queryByLabelText("Current password")).toBeNull();
      expect(writes()).toHaveLength(1);
    });
  for (const changed of [
    "draft",
    "policy",
    "recipients",
    "mail",
    "answers",
  ] as const)
    it("pauses an unaccepted retry after changed " + changed, async () => {
      mode = "before";
      mount();
      if (changed === "mail" || changed === "recipients") await chooseFirst();
      if (changed === "answers") {
        await screen.findByLabelText(/Include reviewed non-sensitive answers/);
        fireEvent.click(
          screen.getByLabelText(/Include reviewed non-sensitive answers/),
        );
      }
      await fill();
      click("Confirm delivery review");
      const recovery = await unknown();
      if (changed === "draft") policy = { ...policy, formRevision: 4 };
      if (changed === "policy") policy = { ...policy, revision: 1 };
      if (changed === "recipients") selectedValid = false;
      if (changed === "mail") policy = { ...policy, mailReady: false };
      if (changed === "answers")
        policy = { ...policy, canReviewAnswers: false };
      click("Check original delivery outcome");
      await within(recovery).findByText(/target is no longer ready/);
      expect(
        (
          within(recovery).getByRole("button", {
            name: "Retry identical delivery review",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
      expect(writes()).toHaveLength(1);
    });
  it("requires another inspection and new proof after a lost identical retry", async () => {
    mode = "before";
    mount();
    await fill();
    click("Confirm delivery review");
    await unknown();
    click("Check original delivery outcome");
    await screen.findByText(/No committed receipt was found/);
    fireEvent.change(
      screen.getByLabelText(/Current password for identical retry/),
      { target: { value: freshProof } },
    );
    mode = "after";
    click("Retry identical delivery review");
    await screen.findByRole("alert");
    expect(
      (
        screen.getByRole("button", {
          name: "Retry identical delivery review",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    click("Check original delivery outcome");
    await screen.findByText(/Delivery review confirmed/);
    expect(commits).toBe(1);
    expect(writes()).toHaveLength(2);
  });
  it("latches duplicate confirmations before awaiting transport", async () => {
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
      name: "Confirm delivery review",
    });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(writes()).toHaveLength(1);
    await act(async () => resolve({ revision: 1 }));
  });
  for (const event of ["gdg:session-cleared", "offline"])
    it("aborts " + event + " transport and ignores a late result", async () => {
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
      click("Confirm delivery review");
      const signal = writes()[0][1].signal;
      act(() => window.dispatchEvent(new Event(event)));
      expect(signal.aborted).toBe(true);
      await act(async () => resolve({ revision: 1 }));
      expect(screen.queryByText(/Delivery review confirmed/)).toBeNull();
      if (event === "offline") {
        await unknown();
        act(() => window.dispatchEvent(new Event("online")));
        expect(writes()).toHaveLength(1);
      } else
        await screen.findByRole("heading", {
          name: "Delivery access needs to be rechecked",
        });
    });
  it("clears an old account review and aborts pending work", async () => {
    let resolve!: (value: unknown) => void;
    const original = apiMock.getMockImplementation()!;
    apiMock.mockImplementation((path: string, o: Options = {}) =>
      o.method
        ? new Promise((done) => {
            resolve = done;
          })
        : original(path, o),
    );
    const view = mount();
    await fill();
    click("Confirm delivery review");
    const signal = writes()[0][1].signal;
    identity.id = "fictional-replacement";
    view.rerender(
      <MemoryRouter>
        <DeliveryPanel
          formId={formId}
          saved
          receiptSetting={false}
          access="internal"
          onStateChange={onStateChange}
        />
      </MemoryRouter>,
    );
    expect(signal.aborted).toBe(true);
    await act(async () => resolve({ revision: 1 }));
    expect(screen.queryByText(/Delivery review confirmed/)).toBeNull();
  });
  it("stops recovery only after reviewed activation and does not replace the request", async () => {
    mode = "after";
    mount();
    await fill();
    click("Confirm delivery review");
    await unknown();
    click("Stop tracking this delivery review");
    await screen.findByLabelText(/Delivery confirmation/);
    expect(writes()).toHaveLength(1);
    expect(screen.queryByText(/Delivery review confirmed/)).toBeNull();
  });
  it("bounds recovery to 47 hours", async () => {
    const at = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(at);
    mode = "before";
    mount();
    await fill();
    click("Confirm delivery review");
    await unknown();
    vi.mocked(Date.now).mockReturnValue(at + 47 * 60 * 60 * 1000);
    click("Check original delivery outcome");
    await screen.findByText(/safe retry window ended/);
    expect(
      apiMock.mock.calls.filter(([path]) => path.includes("/recovery?")),
    ).toHaveLength(0);
    expect(writes()).toHaveLength(1);
  });
  it("freezes a detached password-free recipient/approval document", () => {
    const p = { ...seed(), currentPassword: proof },
      draft = {
        ...deliveryChoices(p),
        notificationUsers: [rows[0].id],
        currentPassword: proof,
      },
      packet = prepareDeliveryWrite(p, draft, p.reference, true);
    draft.notificationUsers.push(rows[1].id);
    expect(JSON.parse(packet.body).notificationUsers).toEqual([rows[0].id]);
    expect(packet.body).not.toContain("currentPassword");
    expect(packet.body).not.toContain(proof);
    expect(Object.isFrozen(packet)).toBe(true);
  });
  it("rejects substituted accepted form/revision metadata", async () => {
    const packet = prepareDeliveryWrite(
      seed(),
      deliveryChoices(seed()),
      "DELIVERY " + formId,
      true,
    );
    apiMock.mockResolvedValue({
      committed: true,
      canRetry: false,
      formId: "different-form",
      formRevision: 3,
      policyRevision: 1,
      editable: true,
      selectedValid: true,
      canReviewAnswers: true,
      mailReady: true,
      chapterInboxAvailable: true,
      receipt: { formId: "different-form", revision: 1 },
    });
    await expect(inspectDeliveryWrite(packet)).rejects.toMatchObject({
      code: "UNCONFIRMED_DELIVERY",
    });
  });
});

it("limits new recipient selection to ten explicit accounts", async () => {
  mount();
  await screen.findByRole("button", { name: "Choose notification recipients" });
  click("Choose notification recipients");
  for (let i = 1; i <= 10; i++)
    fireEvent.click(
      await screen.findByRole("checkbox", {
        name: new RegExp("Fictional recipient " + String(i).padStart(3, "0")),
      }),
    );
  expect(
    (
      screen.getByRole("checkbox", {
        name: /Fictional recipient 011/,
      }) as HTMLInputElement
    ).disabled,
  ).toBe(true);
  await fill();
  click("Confirm delivery review");
  await screen.findByText(/Delivery review confirmed/);
  expect(writes()[0][1].body.notificationUsers).toHaveLength(10);
});
it("permits disable-only review without a mail provider and prevents adding recipients", async () => {
  policy = { ...seed(), mailReady: false, chapterInboxAvailable: false };
  mount();
  await screen.findByRole("button", { name: "Choose notification recipients" });
  click("Choose notification recipients");
  expect(
    (
      (await screen.findByRole("checkbox", {
        name: /Fictional recipient 001/,
      })) as HTMLInputElement
    ).disabled,
  ).toBe(true);
  await fill();
  expect(
    (
      screen.getByRole("button", {
        name: "Confirm delivery review",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(false);
  click("Confirm delivery review");
  await screen.findByText(/Delivery review confirmed/);
  expect(writes()[0][1].body.notificationUsers).toEqual([]);
});
it("rejects an incomplete selected-recipient payload rather than silently dropping choices", async () => {
  policy = { ...seed(), notificationUsers: [rows[0].id], selectedAccounts: [] };
  mount();
  await screen.findByRole("heading", {
    name: "Delivery access needs to be rechecked",
  });
  expect(screen.queryByText(rows[0].display_name)).toBeNull();
  expect(writes()).toHaveLength(0);
});
it("honors newly unavailable configured accounts even if the policy revision did not change", async () => {
  policy = {
    ...seed(),
    notificationUsers: [rows[0].id],
    selectedAccounts: [{ ...rows[0], eligible: true }],
  };
  mount();
  await fill();
  policy = {
    ...policy,
    selectedAccounts: [
      {
        id: rows[0].id,
        display_name: "Unavailable chapter account",
        role: null,
        eligible: false,
      },
    ],
    matchesDraft: false,
  };
  act(() => window.dispatchEvent(new Event("offline")));
  act(() => window.dispatchEvent(new Event("online")));
  click("Recheck delivery settings");
  await screen.findByText(
    /They stay in this proposal until you explicitly remove/,
  );
  expect(
    screen.getByRole("region", { name: "Selected chapter recipients" })
      .textContent,
  ).toContain("Unavailable chapter account");
  expect(
    (
      screen.getByRole("button", {
        name: "Confirm delivery review",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(writes()).toHaveLength(0);
});
