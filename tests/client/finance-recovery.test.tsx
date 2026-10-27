// @vitest-environment jsdom
import React from "react";
import axe from "axe-core";
import { webcrypto } from "node:crypto";
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
import FinanceWorkspace from "../../src/ui/finances/FinanceWorkspace";
import FinanceEditor from "../../src/ui/finances/FinanceEditor";
import BudgetEditor from "../../src/ui/finances/BudgetEditor";
import FinanceDetail from "../../src/ui/finances/FinanceDetail";
import FinanceAttachments from "../../src/ui/finances/FinanceAttachments";
import { ApiFailure } from "../../src/lib/api";
import type { Finance, Budget } from "../../src/ui/finances/types";
const { apiMock, actor } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  actor: { id: "f1560000-0000-4000-8000-000000000001", role: "admin" },
}));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: apiMock,
}));
vi.mock("@/contexts/AdminContext", () => ({
  useAdmin: () => ({ currentAdmin: actor }),
}));
vi.mock("@/hooks/useDraftGuard", async (original) => ({
  ...(await original<typeof import("../../src/hooks/useDraftGuard")>()),
  useDraftGuard: vi.fn(),
  useNavigationSafety: () => ({ request: (action: () => void) => action() }),
}));
const id = "f1560000-0000-4000-8000-000000000002",
  budgetId = "f1560000-0000-4000-8000-000000000003",
  fileId = "f1560000-0000-4000-8000-000000000004",
  base = "/admin/finances",
  path = base + "/" + id;
const cap = {
  actorId: actor.id,
  globalAdmin: true,
  canCreate: true,
  teams: [],
  fundingReferences: [],
  fundingNotice: "Fictional funding reference",
};
const record: Finance = {
  id,
  reference: "FIN-FICTIONAL-001",
  transactionType: "expense",
  category: "Event Costs",
  amount: "12.34",
  currency: "USD",
  description: "Fictional event supplies",
  vendorName: "Fictional vendor",
  referenceNumber: "",
  transactionDate: "2026-10-27",
  teamId: null,
  teamName: null,
  budgetId: null,
  budgetName: null,
  eventId: null,
  projectId: null,
  recurringFrequency: null,
  requiresTeamApproval: false,
  status: "draft",
  revision: 1,
  createdBy: actor.id,
  creatorName: "Fictional officer",
  approverName: null,
  teamApproverName: null,
  submittedBy: null,
  submittedAt: null,
  createdAt: "2026-10-27T12:00:00Z",
  updatedAt: "2026-10-27T12:00:00Z",
  rejectionReason: null,
  actions: ["update", "submit", "note"],
};
const budget: Budget = {
  id: budgetId,
  name: "Fictional allocation",
  description: "Fictional planning allocation",
  totalAmount: "100.00",
  teamId: null,
  teamName: null,
  fiscalYear: "2026",
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  status: "draft",
  revision: 1,
  usage: { spent: "0.00", reserved: "0.00" },
  canManage: true,
};
const listing = {
  items: [record],
  total: 1,
  pageSize: 30,
  stateCounts: { draft: 1 },
  summary: {
    completedIncome: "0.00",
    completedExpenses: "0.00",
    reservedExpenses: "0.00",
    awaitingApproval: 0,
    net: "0.00",
  },
};
const detail = {
  record,
  decisions: [],
  notes: [],
  noteTotal: 0,
  notePageSize: 30,
  retention: "Fictional retained ledger",
};
const files = {
  items: [],
  total: 0,
  pageSize: 30,
  canUpload: true,
  revision: 1,
};
const cleanFile = {
  id: fileId,
  filename: "Fictional receipt.pdf",
  mime: "application/pdf",
  bytes: 12,
  state: "clean",
  uploaderName: "Fictional officer",
  createdAt: "2026-10-27T12:00:00Z",
};
function response(p: string) {
  return p.endsWith("/capabilities")
    ? cap
    : p.includes("/attachments")
      ? files
      : p.startsWith("/admin/budgets")
        ? { items: [budget], total: 1, pageSize: 30 }
        : p.startsWith(base + "/report")
          ? { months: [], categories: [], note: "Fictional report" }
          : p.startsWith(base + "?")
            ? listing
            : detail;
}
function deferred<T>() {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
const writes = () =>
  apiMock.mock.calls.filter(([, options]) => options?.method === "POST");
function mount(selected = false, tab = "requests") {
  return render(
    <MemoryRouter
      initialEntries={[
        "/admin/finances?tab=" + tab + (selected ? "&request=" + id : ""),
      ]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <main id="workspace-content" tabIndex={-1}>
        <FinanceWorkspace />
      </main>
    </MemoryRouter>,
  );
}
function shell(node: React.ReactNode) {
  return render(
    <MemoryRouter>
      <main>{node}</main>
    </MemoryRouter>,
  );
}
const onState = vi.fn();
function editor(onSaved = vi.fn()) {
  return shell(
    <FinanceEditor
      record={record}
      capabilities={cap}
      onSaved={onSaved}
      onCancel={() => {}}
      onEditState={onState}
    />,
  );
}
function budgetEditor(onSaved = vi.fn()) {
  return shell(
    <BudgetEditor
      record={budget}
      capabilities={cap}
      onSaved={onSaved}
      onCancel={() => {}}
      onEditState={onState}
    />,
  );
}
function ledger(onRefresh = vi.fn()) {
  return shell(
    <FinanceDetail
      detail={detail}
      actorId={actor.id}
      notePage={1}
      onNotePage={() => {}}
      onRefresh={onRefresh}
      onEdit={() => {}}
      onClose={() => {}}
      onEditState={onState}
    />,
  );
}
function attachments() {
  return shell(
    <FinanceAttachments
      financeId={id}
      revision={1}
      disabled={false}
      onEditState={onState}
    />,
  );
}
function submitDecision() {
  fireEvent.click(
    screen.getByRole("button", { name: "Submit request", exact: true }),
  );
  const input = screen.getByLabelText(/Type FIN-FICTIONAL-001 to confirm/),
    password = screen.getByLabelText(/Your current password/);
  fireEvent.change(input, { target: { value: record.reference } });
  fireEvent.change(password, { target: { value: "Fictional-finance-proof" } });
  return { input, password, form: password.closest("form")! };
}
beforeEach(() => {
  actor.id = "f1560000-0000-4000-8000-000000000001";
  actor.role = "admin";
  onState.mockReset();
  apiMock.mockReset();
  apiMock.mockImplementation((p: string, options?: { method?: string }) =>
    Promise.resolve(options?.method === "POST" ? { id } : response(p)),
  );
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  vi.stubGlobal("crypto", webcrypto);
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("Finance independent private reads", () => {
  it("cancels other private reads after capability denial and ignores their late data", async () => {
    const inventory = deferred<unknown>(),
      capability = deferred<unknown>();
    let signal: AbortSignal | undefined;
    apiMock.mockImplementation(
      (p: string, options?: { signal?: AbortSignal }) => {
        if (p.endsWith("/capabilities")) return capability.promise;
        if (p.startsWith(base + "?")) {
          signal = options?.signal;
          return inventory.promise;
        }
        return Promise.resolve(response(p));
      },
    );
    mount();
    await act(async () =>
      capability.reject(
        new ApiFailure(403, "FORBIDDEN", "Finance unavailable"),
      ),
    );
    expect(signal?.aborted).toBe(true);
    await act(async () => inventory.resolve(listing));
    expect(
      screen.queryByRole("button", { name: "Review " + record.reference }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "New request" })).toBeNull();
  });
  it("aborts every initial read when its private workspace unmounts", () => {
    const pending = deferred<unknown>(),
      signals: AbortSignal[] = [];
    apiMock.mockImplementation(
      (_p: string, options: { signal?: AbortSignal }) => {
        if (options.signal) signals.push(options.signal);
        return pending.promise;
      },
    );
    const page = mount(true);
    expect(
      screen
        .getByRole("status", { name: "Loading finance requests" })
        .querySelector(".gt-skeleton"),
    ).toBeTruthy();
    page.unmount();
    expect(signals).toHaveLength(5);
    expect(signals.every((s) => s.aborted)).toBe(true);
  });
  it("keeps request inventory usable when reports and budgets fail independently", async () => {
    apiMock.mockImplementation((p: string) =>
      p.startsWith("/admin/budgets")
        ? Promise.reject(Error("Budget interrupted"))
        : p.startsWith(base + "/report")
          ? Promise.reject(Error("Report interrupted"))
          : Promise.resolve(response(p)),
    );
    mount();
    await screen.findByRole("button", { name: "Review " + record.reference });
    await screen.findByText("Budget allocations: Budget interrupted");
    await screen.findByText("Finance reports: Report interrupted");
    expect(screen.getByText(record.description)).toBeTruthy();
  });
  it("does not show a false empty budget table after a failed initial read", async () => {
    apiMock.mockImplementation((p: string) =>
      p.startsWith("/admin/budgets")
        ? Promise.reject(Error("Budget interrupted"))
        : Promise.resolve(response(p)),
    );
    mount(false, "budgets");
    await screen.findByText(
      "Budget allocations are unavailable. Retry to check your scope.",
    );
    expect(
      screen.queryByRole("heading", {
        name: "No permitted budget allocations",
      }),
    ).toBeNull();
  });
  it("retries a failed report without discarding independent request data", async () => {
    let failed = true;
    apiMock.mockImplementation((p: string) =>
      p.startsWith(base + "/report") && failed
        ? Promise.reject(Error("Report interrupted"))
        : Promise.resolve(response(p)),
    );
    mount(false, "reports");
    await screen.findByText(/Report data is unavailable/);
    failed = false;
    fireEvent.click(
      screen.getByRole("button", { name: "Retry finance reports" }),
    );
    expect(document.activeElement?.id).toBe("workspace-content");
    await screen.findByText("Fictional report");
  });
  it("retains timestamped authorized rows on a temporary inventory refresh failure", async () => {
    let failed = false;
    apiMock.mockImplementation((p: string) =>
      p.startsWith(base + "?") && failed
        ? Promise.reject(Error("Inventory interrupted"))
        : Promise.resolve(response(p)),
    );
    mount();
    await screen.findByRole("button", { name: "Review " + record.reference });
    failed = true;
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh", exact: true }),
    );
    await screen.findByText(/Request inventory may be out of date/);
    expect(
      screen.getByRole("button", { name: "Review " + record.reference }),
    ).toBeTruthy();
  });
  it("rejects an inverted date range locally and resets filters", async () => {
    mount();
    await screen.findByRole("button", { name: "Review " + record.reference });
    fireEvent.change(screen.getByLabelText("From date"), {
      target: { value: "2030-01-01" },
    });
    fireEvent.change(screen.getByLabelText("To date"), {
      target: { value: "2020-01-01" },
    });
    await screen.findByText("Choose a from date on or before the to date.");
    expect(
      apiMock.mock.calls.some(
        ([p]) => p.includes("from=2030-01-01") && p.includes("to=2020-01-01"),
      ),
    ).toBe(false);
    fireEvent.click(
      screen.getByRole("button", { name: "Reset finance filters" }),
    );
    await screen.findByRole("button", { name: "Review " + record.reference });
  });
  it("erases a selected private editor after its protected read is denied", async () => {
    let denied = false;
    apiMock.mockImplementation((p: string) =>
      p.startsWith(path + "?") && denied
        ? Promise.reject(
            new ApiFailure(404, "NOT_FOUND", "Request unavailable"),
          )
        : Promise.resolve(response(p)),
    );
    mount(true);
    await screen.findByRole("button", { name: "Edit draft", exact: true });
    fireEvent.click(
      screen.getByRole("button", { name: "Edit draft", exact: true }),
    );
    await screen.findByRole("heading", { name: "Edit " + record.reference });
    denied = true;
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh", exact: true }),
    );
    await screen.findByText("Request details: Request unavailable");
    expect(
      screen.queryByRole("heading", { name: "Edit " + record.reference }),
    ).toBeNull();
    expect(screen.queryByLabelText("Description", { exact: false })).toBeNull();
  });
  it("preserves unsaved amount and disables editing when the current revision changes", async () => {
    let revision = 1;
    apiMock.mockImplementation((p: string) =>
      Promise.resolve(
        p.startsWith(path + "?")
          ? { ...detail, record: { ...record, revision } }
          : response(p),
      ),
    );
    mount(true);
    fireEvent.click(
      await screen.findByRole("button", { name: "Edit draft", exact: true }),
    );
    const input = screen.getByLabelText(/Amount \(USD\)/);
    fireEvent.change(input, { target: { value: "25.01" } });
    revision = 2;
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh", exact: true }),
    );
    await screen.findByText(/This request changed or editing access ended/);
    expect((input as HTMLInputElement).value).toBe("25.01");
    expect(
      (screen.getByRole("button", { name: "Save draft" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
  it("clears a pending editor on account replacement and fences its late result", async () => {
    const pending = deferred<unknown>();
    let signal: AbortSignal | undefined;
    apiMock.mockImplementation(
      (p: string, options?: { method?: string; signal?: AbortSignal }) => {
        if (options?.method === "POST") {
          signal = options.signal;
          return pending.promise;
        }
        return Promise.resolve(response(p));
      },
    );
    const page = mount(true);
    fireEvent.click(
      await screen.findByRole("button", { name: "Edit draft", exact: true }),
    );
    fireEvent.submit(
      screen.getByLabelText("Description", { exact: false }).closest("form")!,
    );
    actor.id = budgetId;
    page.rerender(
      <MemoryRouter>
        <main>
          <FinanceWorkspace />
        </main>
      </MemoryRouter>,
    );
    expect(signal?.aborted).toBe(true);
    await act(async () => pending.resolve({ id }));
    expect(
      screen.queryByText(
        "Private draft saved. Submit it separately after review.",
      ),
    ).toBeNull();
    expect(screen.queryByLabelText("Description", { exact: false })).toBeNull();
  });
});
describe("Finance drafts, allocations and retained decisions", () => {
  it("preserves note input for copying when refreshed grants remove note access", async () => {
    const page = ledger();
    const input = screen.getByLabelText(/Add a note/);
    fireEvent.change(input, {
      target: { value: "Fictional unsaved private note" },
    });
    page.rerender(
      <MemoryRouter>
        <main>
          <FinanceDetail
            detail={{ ...detail, record: { ...record, actions: [] } }}
            actorId={actor.id}
            notePage={1}
            onNotePage={() => {}}
            onRefresh={() => {}}
            onEdit={() => {}}
            onClose={() => {}}
            onEditState={onState}
          />
        </main>
      </MemoryRouter>,
    );
    const preserved = screen.getByLabelText(
      /Add a note/,
    ) as HTMLTextAreaElement;
    expect(preserved.value).toBe("Fictional unsaved private note");
    expect(preserved.readOnly).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Append note" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
  it("suppresses duplicate draft submits and preserves decimal strings exactly", async () => {
    const pending = deferred<unknown>(),
      saved = vi.fn();
    apiMock.mockImplementation((p: string, options?: { method?: string }) =>
      options?.method === "POST"
        ? pending.promise
        : Promise.resolve(response(p)),
    );
    editor(saved);
    const input = screen.getByLabelText(/Amount \(USD\)/);
    fireEvent.change(input, { target: { value: "25.01" } });
    const form = input.closest("form")!;
    act(() => {
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    expect(writes()).toHaveLength(1);
    expect(writes()[0][1].body.record.amount).toBe("25.01");
    expect((input as HTMLInputElement).disabled).toBe(true);
    await act(async () => pending.resolve({ id }));
    expect(saved).toHaveBeenCalledExactlyOnceWith(id);
  });
  it("retains the request draft key after an uncertain failure", async () => {
    let failed = true;
    apiMock.mockImplementation((p: string, options?: { method?: string }) =>
      options?.method === "POST"
        ? failed
          ? Promise.reject(Error("Draft not confirmed"))
          : Promise.resolve({ id })
        : Promise.resolve(response(p)),
    );
    const saved = vi.fn();
    editor(saved);
    const form = screen
      .getByLabelText("Description", { exact: false })
      .closest("form")!;
    fireEvent.submit(form);
    await screen.findByText("Draft not confirmed");
    expect(document.activeElement?.textContent).toBe("Draft not confirmed");
    failed = false;
    fireEvent.submit(form);
    await waitFor(() => expect(saved).toHaveBeenCalled());
    expect(writes()[0][1].idempotencyKey).toBe(writes()[1][1].idempotencyKey);
  });
  it("retries budget choice failures through the failed picker request", async () => {
    let failed = true;
    apiMock.mockImplementation((p: string) =>
      p.startsWith("/admin/budgets") && failed
        ? Promise.reject(Error("Choices interrupted"))
        : Promise.resolve(response(p)),
    );
    editor();
    await screen.findByText(/Budget search: Choices interrupted/);
    failed = false;
    fireEvent.click(
      screen.getByRole("button", { name: "Retry budget choices" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByText(/Budget search: Choices interrupted/),
      ).toBeNull(),
    );
    expect(
      apiMock.mock.calls.filter(([p]) => p.startsWith("/admin/budgets")),
    ).toHaveLength(2);
  });
  it("requires exact allocation confirmation and clears its password before a pending write", async () => {
    const pending = deferred<unknown>();
    apiMock.mockImplementation((p: string, options?: { method?: string }) =>
      options?.method === "POST"
        ? pending.promise
        : Promise.resolve(response(p)),
    );
    budgetEditor();
    const confirmation = screen.getByLabelText(/Type the budget name:/),
      password = screen.getByLabelText(/current password/i);
    fireEvent.change(password, { target: { value: "Fictional-budget-proof" } });
    fireEvent.submit(password.closest("form")!);
    expect(writes()).toHaveLength(0);
    fireEvent.change(confirmation, { target: { value: budget.name } });
    fireEvent.submit(password.closest("form")!);
    expect((password as HTMLInputElement).value).toBe("");
    expect(writes()).toHaveLength(1);
    expect(writes()[0][1].body.record.totalAmount).toBe("100.00");
    await act(async () => pending.resolve({ id: budgetId }));
  });
  it("keeps an unchanged allocation key through a failure and password reentry", async () => {
    let failed = true;
    apiMock.mockImplementation((p: string, options?: { method?: string }) =>
      options?.method === "POST"
        ? failed
          ? Promise.reject(Error("Budget not confirmed"))
          : Promise.resolve({ id: budgetId })
        : Promise.resolve(response(p)),
    );
    const saved = vi.fn();
    budgetEditor(saved);
    fireEvent.change(screen.getByLabelText(/Type the budget name:/), {
      target: { value: budget.name },
    });
    const password = screen.getByLabelText(/current password/i);
    fireEvent.change(password, { target: { value: "Fictional-budget-proof" } });
    fireEvent.submit(password.closest("form")!);
    await screen.findByText("Budget not confirmed");
    failed = false;
    fireEvent.change(password, { target: { value: "Fictional-budget-proof" } });
    fireEvent.submit(password.closest("form")!);
    await waitFor(() => expect(saved).toHaveBeenCalled());
    expect(writes()[0][1].idempotencyKey).toBe(writes()[1][1].idempotencyKey);
  });
  it("guards a retained decision against duplicate submits and focuses its receipt", async () => {
    const pending = deferred<unknown>(),
      refresh = vi.fn();
    apiMock.mockImplementation((p: string, options?: { method?: string }) =>
      options?.method === "POST"
        ? pending.promise
        : Promise.resolve(response(p)),
    );
    ledger(refresh);
    const { password, form } = submitDecision();
    expect(document.activeElement?.textContent).toBe("Submit request");
    act(() => {
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    expect(writes()).toHaveLength(1);
    expect((password as HTMLInputElement).value).toBe("");
    await act(async () => pending.resolve({ id }));
    await screen.findByText("Decision saved with its immutable history entry.");
    expect(document.activeElement?.textContent).toBe(
      "Decision saved with its immutable history entry.",
    );
    expect(refresh).toHaveBeenCalledTimes(1);
  });
  it("blocks direct decision submission when the reference confirmation is wrong", () => {
    ledger();
    const { input, form } = submitDecision();
    fireEvent.change(input, { target: { value: "wrong reference" } });
    fireEvent.submit(form);
    expect(writes()).toHaveLength(0);
  });
  it("aborts a decision on session clearing without showing a late receipt", async () => {
    const pending = deferred<unknown>();
    let signal: AbortSignal | undefined;
    apiMock.mockImplementation(
      (p: string, options?: { method?: string; signal?: AbortSignal }) => {
        if (options?.method === "POST") {
          signal = options.signal;
          return pending.promise;
        }
        return Promise.resolve(response(p));
      },
    );
    ledger();
    fireEvent.submit(submitDecision().form);
    act(() => window.dispatchEvent(new Event("gdg:session-cleared")));
    expect(signal?.aborted).toBe(true);
    await act(async () => pending.resolve({ id }));
    expect(
      screen.queryByText("Decision saved with its immutable history entry."),
    ).toBeNull();
  });
  it("appends an attributed note once and focuses the committed note receipt", async () => {
    ledger();
    const input = screen.getByLabelText(/Add a note/);
    fireEvent.change(input, { target: { value: "Fictional progress note" } });
    const form = input.closest("form")!;
    act(() => {
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    await screen.findByText("Note appended.");
    expect(writes()).toHaveLength(1);
    expect(writes()[0][1].body).toEqual({ note: "Fictional progress note" });
    expect(document.activeElement?.textContent).toBe("Note appended.");
  });
  it("never submits an offline request draft on reconnection", async () => {
    const online = vi.spyOn(navigator, "onLine", "get");
    online.mockReturnValue(true);
    mount(true);
    fireEvent.click(
      await screen.findByRole("button", { name: "Edit draft", exact: true }),
    );
    const input = screen.getByLabelText(/Amount \(USD\)/);
    fireEvent.change(input, { target: { value: "25.01" } });
    online.mockReturnValue(false);
    act(() => window.dispatchEvent(new Event("offline")));
    expect(
      (screen.getByRole("button", { name: "Save draft" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    online.mockReturnValue(true);
    act(() => window.dispatchEvent(new Event("online")));
    expect((input as HTMLInputElement).value).toBe("25.01");
    expect(writes()).toHaveLength(0);
  });
  it("does not expose a late private download after the attachment context unmounts", async () => {
    const pending = deferred<unknown>();
    let signal: AbortSignal | undefined;
    apiMock.mockImplementation(
      (p: string, options?: { signal?: AbortSignal }) => {
        if (p.endsWith("/download")) {
          signal = options?.signal;
          return pending.promise;
        }
        return Promise.resolve(
          p.includes("/attachments")
            ? { ...files, items: [cleanFile] }
            : response(p),
        );
      },
    );
    const page = attachments();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Authorize download of " + cleanFile.filename,
      }),
    );
    page.unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () =>
      pending.resolve({
        url: "https://storage.example.test/fictional-private",
      }),
    );
    expect(screen.queryByRole("link", { name: /Download/ })).toBeNull();
  });
  it("cancels an in-flight quarantine upload and never completes it after unmount", async () => {
    const pending = deferred<Response>();
    let uploadSignal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: unknown, options: { signal?: AbortSignal }) => {
        uploadSignal = options.signal;
        return pending.promise;
      }),
    );
    apiMock.mockImplementation((p: string, options?: { method?: string }) =>
      Promise.resolve(
        options?.method === "POST"
          ? {
              uploadId: fileId,
              url: "https://storage.example.test/fictional-quarantine",
              headers: {},
            }
          : response(p),
      ),
    );
    const page = attachments();
    await screen.findByLabelText(/Supporting file/);
    const file = new File(["%PDF-1.4 fictional"], "fictional.pdf", {
      type: "application/pdf",
    });
    Object.defineProperty(file, "arrayBuffer", {
      value: async () => new TextEncoder().encode("%PDF-1.4 fictional").buffer,
    });
    fireEvent.change(screen.getByLabelText(/Supporting file/), {
      target: { files: [file] },
    });
    fireEvent.submit(screen.getByLabelText(/Supporting file/).closest("form")!);
    await waitFor(() => expect(uploadSignal).toBeTruthy());
    page.unmount();
    expect(uploadSignal?.aborted).toBe(true);
    await act(async () => pending.resolve(new Response(null, { status: 200 })));
    expect(apiMock.mock.calls.some(([p]) => p.endsWith("/complete"))).toBe(
      false,
    );
  });
  it("passes structural axe checks for request editing, budget confirmation and decision controls", async () => {
    let page = editor();
    const audit = async () => {
      const result = await axe.run(page.container, {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"],
        },
        rules: { "color-contrast": { enabled: false } },
      });
      expect(
        result.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => n.target),
        })),
      ).toEqual([]);
    };
    await audit();
    page.unmount();
    page = budgetEditor();
    await audit();
    page.unmount();
    page = ledger();
    submitDecision();
    await audit();
  });
});
