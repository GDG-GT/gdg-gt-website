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
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import ContactInbox from "../../src/ui/communications/ContactInbox";
import NavigationSafety from "../../src/ui/NavigationSafety";
import { ApiFailure } from "../../src/lib/api";
const { transport } = vi.hoisted(() => ({ transport: vi.fn() }));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: transport,
}));
vi.mock("@/contexts/AdminContext", () => ({
  useAdmin: () => ({
    currentAdmin: { id: "fictional-write-officer", role: "admin" },
  }),
}));
const id = "f1340000-0000-4000-8000-000000000001",
  record = {
    id,
    name: "Fictional inquiry sender",
    email: "fictional-inquiry@example.test",
    type: "general",
    message: "Fictional private inquiry for mutation recovery.",
    interests: [],
    status: "new",
    revision: 1,
    createdAt: "2026-11-06T12:00:00Z",
    resolvedAt: null,
    redactedAt: null,
    hold: false,
    holdReason: null,
    attachment: null,
  };
let loss: "before" | "after" | "none",
  receipts: Map<string, { id: string; revision: number; action: string }>,
  commits: number,
  readError: Error | undefined,
  canRetry: boolean,
  secondLoss: boolean,
  routers: ReturnType<typeof createMemoryRouter>[] = [];
function mount(selected = false) {
  const router = createMemoryRouter(
    [
      {
        path: "/admin/communications",
        element: (
          <NavigationSafety>
            <main>
              <ContactInbox />
            </main>
          </NavigationSafety>
        ),
      },
    ],
    {
      initialEntries: [
        "/admin/communications" +
          (selected ? "?tab=contact&contact=" + id : ""),
      ],
    },
  );
  routers.push(router);
  render(<RouterProvider router={router} />);
}
const button = (name: string) =>
    screen.getByRole("button", { name, exact: true }),
  click = (name: string) => fireEvent.click(button(name));
const attempts = () =>
  transport.mock.calls.filter(
    ([p, o]) => o?.method === "POST" && !p.endsWith("/recovery"),
  );
async function start(action = "status") {
  mount(true);
  await screen.findByRole("heading", { name: record.name });
  if (action === "status") {
    fireEvent.change(
      screen.getByRole("combobox", { name: "Inquiry status", exact: true }),
      { target: { value: "in_progress" } },
    );
    click("Save inquiry status");
  } else {
    click("Review retention hold");
    fireEvent.change(screen.getByLabelText("Reason for retention hold *"), {
      target: { value: "Frozen original operational hold" },
    });
    fireEvent.change(screen.getByLabelText("Current password *"), {
      target: { value: "Fresh original proof" },
    });
    fireEvent.change(screen.getByLabelText("Type HOLD CONTACT to confirm *"), {
      target: { value: "HOLD CONTACT" },
    });
    click("Confirm hold change");
  }
  await screen.findByRole("region", { name: "Unconfirmed inquiry save" });
}
beforeEach(() => {
  loss = "before";
  commits = 0;
  receipts = new Map();
  readError = undefined;
  canRetry = true;
  secondLoss = false;
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: true,
  });
  transport.mockReset();
  transport.mockImplementation(
    async (
      path: string,
      o: {
        method?: string;
        body?: Record<string, unknown>;
        idempotencyKey?: string;
      } = {},
    ) => {
      if (path.endsWith("/recovery")) {
        if (readError) throw readError;
        const r = receipts.get(o.idempotencyKey!);
        return {
          committed: !!r,
          canRetry: !r && canRetry,
          currentRevision: r ? r.revision : 1,
          receipt: r || null,
        };
      }
      if (o.method === "POST") {
        if (loss === "before") {
          loss = "none";
          throw Error("Fictional before acceptance loss");
        }
        if (!receipts.has(o.idempotencyKey!)) {
          commits++;
          receipts.set(o.idempotencyKey!, {
            id,
            revision: 2,
            action: String(o.body?.action),
          });
        }
        if (loss === "after" || secondLoss) {
          loss = "none";
          secondLoss = false;
          throw Error("Fictional accepted reply loss");
        }
        return receipts.get(o.idempotencyKey!);
      }
      return { items: [record], total: 1, page: 1 };
    },
  );
});
afterEach(() => {
  cleanup();
  for (const router of routers) router.dispose();
  routers = [];
  vi.restoreAllMocks();
});
describe("Original inquiry save reconciliation and explicit identical retry", () => {
  for (const action of ["status", "hold"])
    for (const position of ["before", "after"] as const)
      it(`${action} ${position} acceptance preserves exact document/key and creates only one outcome`, async () => {
        loss = position;
        await start(action);
        const original = attempts()[0];
        expect(
          (
            button(
              action === "hold" ? "Confirm hold change" : "Save inquiry status",
            ) as HTMLButtonElement
          ).disabled,
        ).toBe(true);
        expect(
          (button("Retry identical inquiry save") as HTMLButtonElement)
            .disabled,
        ).toBe(true);
        expect(screen.queryByDisplayValue("Fresh original proof")).toBeNull();
        click("Check original inquiry outcome");
        if (position === "before") {
          await waitFor(() =>
            expect(
              (button("Retry identical inquiry save") as HTMLButtonElement)
                .disabled,
            ).toBe(action === "hold"),
          );
          if (action === "hold")
            fireEvent.change(
              screen.getByLabelText(
                "Current password for original inquiry retry *",
              ),
              { target: { value: "New explicit proof" } },
            );
          click("Retry identical inquiry save");
        }
        await waitFor(() =>
          expect(
            screen.queryByRole("region", { name: "Unconfirmed inquiry save" }),
          ).toBeNull(),
        );
        expect(commits).toBe(1);
        await waitFor(() =>
          expect(document.activeElement).toBe(
            screen.getByRole("heading", { name: "Fictional inquiry sender", exact: true }),
          ),
        );
        expect(attempts()).toHaveLength(position === "before" ? 2 : 1);
        if (position === "before") {
          const first = { ...original[1].body },
            last = { ...attempts()[1][1].body };
          delete first.currentPassword;
          delete last.currentPassword;
          expect(last).toEqual(first);
          expect(attempts()[1][1].idempotencyKey).toBe(
            original[1].idempotencyKey,
          );
          if (action === "hold")
            expect(attempts()[1][1].body.currentPassword).toBe(
              "New explicit proof",
            );
        }
        expect(
          transport.mock.calls.find(([p]) => p.endsWith("/recovery"))![1].body,
        ).not.toHaveProperty("currentPassword");
      });
  it("requires another read-only inspection after second acceptance loss", async () => {
    await start();
    click("Check original inquiry outcome");
    await waitFor(() =>
      expect(
        (button("Retry identical inquiry save") as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    secondLoss = true;
    click("Retry identical inquiry save");
    await screen.findByText("Fictional accepted reply loss");
    expect(
      (button("Retry identical inquiry save") as HTMLButtonElement).disabled,
    ).toBe(true);
    click("Check original inquiry outcome");
    await waitFor(() =>
      expect(
        screen.queryByRole("region", { name: "Unconfirmed inquiry save" }),
      ).toBeNull(),
    );
    expect(commits).toBe(1);
    expect(attempts()).toHaveLength(2);
  });
  it("never retries a new stale request when original inspection says unsafe", async () => {
    canRetry = false;
    await start();
    click("Check original inquiry outcome");
    await screen.findByText(/current record or access state prevents/);
    expect(
      (button("Retry identical inquiry save") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(attempts()).toHaveLength(1);
  });
  it.each([401, 403, 404])(
    "conceals all private proposed fields on current outcome denial %s",
    async (status) => {
      await start();
      readError = new ApiFailure(
        status,
        "FORBIDDEN",
        "Fictional outcome unavailable",
      );
      click("Check original inquiry outcome");
      await screen.findByText(/Private records and reviews have been cleared/);
      expect(
        screen.queryByDisplayValue("Frozen original operational hold"),
      ).toBeNull();
      expect(
        screen.queryByRole("region", { name: "Unconfirmed inquiry save" }),
      ).toBeNull();
      expect(attempts()).toHaveLength(1);
    },
  );
  it("requires explicit recheck after offline without automatic inspection or retry", async () => {
    await start();
    click("Check original inquiry outcome");
    await waitFor(() =>
      expect(
        (button("Retry identical inquiry save") as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    act(() => window.dispatchEvent(new Event("offline")));
    const before = transport.mock.calls.length;
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    act(() => window.dispatchEvent(new Event("online")));
    expect(
      (button("Retry identical inquiry save") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(transport).toHaveBeenCalledTimes(before);
    expect(attempts()).toHaveLength(1);
  });
  it("fences an expired or backwards-clock recovery window before network work", async () => {
    await start();
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 47 * 60 * 60 * 1000 + 1);
    const before = transport.mock.calls.length;
    click("Check original inquiry outcome");
    await screen.findByText(/safe inquiry recovery window ended/);
    expect(transport).toHaveBeenCalledTimes(before);
  });
  it("reviewed stopping clears private proposals without creating a replacement save", async () => {
    loss = "after";
    await start();
    fireEvent.click(screen.getByText("Review stopping inquiry recovery"));
    click("Stop tracking this inquiry save");
    await screen.findByText(/Inquiry recovery stopped/);
    expect(
      screen.queryByDisplayValue("Frozen original operational hold"),
    ).toBeNull();
    expect(attempts()).toHaveLength(1);
    expect(commits).toBe(1);
  });
  it("blocks abandoning unknown original work through ordinary editor navigation", async () => {
    await start();
    expect((button("Back to inbox") as HTMLButtonElement).disabled).toBe(true);
    expect((button("Refresh inquiry") as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(attempts()).toHaveLength(1);
  });
  it("clears unknown original intent on session reset and never restores its old body", async () => {
    await start();
    act(() => window.dispatchEvent(new Event("gdg:session-cleared")));
    await waitFor(() =>
      expect(
        screen.queryByRole("region", { name: "Unconfirmed inquiry save" }),
      ).toBeNull(),
    );
    expect(
      screen.queryByDisplayValue("Frozen original operational hold"),
    ).toBeNull();
    expect(attempts()).toHaveLength(1);
  });
  it("keeps a lost retry's fresh-password rejection distinct from current access denial", async () => {
    await start("hold");
    click("Check original inquiry outcome");
    await screen.findByLabelText(
      "Current password for original inquiry retry *",
    );
    fireEvent.change(
      screen.getByLabelText("Current password for original inquiry retry *"),
      { target: { value: "Rejected current proof" } },
    );
    const original = transport.getMockImplementation()!;
    transport.mockImplementation((p, o) =>
      o?.method === "POST" && !p.endsWith("/recovery")
        ? Promise.reject(
            new ApiFailure(
              403,
              "PASSWORD_REQUIRED",
              "Fictional fresh proof rejected",
            ),
          )
        : original(p, o),
    );
    click("Retry identical inquiry save");
    await screen.findByText("Fictional fresh proof rejected");
    expect(
      screen.getByRole("region", { name: "Unconfirmed inquiry save" }),
    ).toBeTruthy();
    expect(screen.queryByDisplayValue("Rejected current proof")).toBeNull();
    expect(
      (button("Retry identical inquiry save") as HTMLButtonElement).disabled,
    ).toBe(true);
  });
  it("refuses a malformed accepted inspection receipt without changing the private proposal", async () => {
    await start("status");
    const original = transport.getMockImplementation()!;
    transport.mockImplementation((p, o) =>
      p.endsWith("/recovery")
        ? Promise.resolve({
            committed: true,
            canRetry: false,
            currentRevision: 1,
            receipt: { id, revision: 1 },
          })
        : original(p, o),
    );
    click("Check original inquiry outcome");
    await screen.findByText(/original inquiry outcome could not be verified/);
    expect(
      screen.getByRole("combobox", { name: "Inquiry status", exact: true }),
    ).toHaveProperty("value", "in_progress");
    expect(
      (button("Retry identical inquiry save") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(attempts()).toHaveLength(1);
  });
  it("aborts an in-flight status save on offline and ignores a late acknowledgement", async () => {
    let finish!: (value: unknown) => void;
    const original = transport.getMockImplementation()!;
    transport.mockImplementation((p, o) =>
      o?.method === "POST" && !p.endsWith("/recovery")
        ? new Promise((resolve) => {
            finish = resolve;
            receipts.set(o.idempotencyKey, {
              id,
              revision: 2,
              action: "status",
            });
            commits++;
          })
        : original(p, o),
    );
    mount(true);
    await screen.findByRole("heading", { name: record.name });
    fireEvent.change(
      screen.getByRole("combobox", { name: "Inquiry status", exact: true }),
      { target: { value: "in_progress" } },
    );
    click("Save inquiry status");
    await waitFor(() => expect(attempts()).toHaveLength(1));
    const signal = attempts()[0][1].signal;
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    act(() => window.dispatchEvent(new Event("offline")));
    await screen.findByRole("region", { name: "Unconfirmed inquiry save" });
    expect(signal.aborted).toBe(true);
    await act(async () => finish({ id, revision: 2, action: "status" }));
    expect(
      screen.getByRole("region", { name: "Unconfirmed inquiry save" }),
    ).toBeTruthy();
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    act(() => window.dispatchEvent(new Event("online")));
    click("Check original inquiry outcome");
    await waitFor(() =>
      expect(
        screen.queryByRole("region", { name: "Unconfirmed inquiry save" }),
      ).toBeNull(),
    );
    expect(attempts()).toHaveLength(1);
    expect(commits).toBe(1);
  });
  it.each([
    {
      committed: true,
      canRetry: false,
      currentRevision: 1,
      receipt: { id, revision: 2, action: "status" },
    },
    { committed: false, canRetry: true, currentRevision: 2, receipt: null },
    { committed: false, canRetry: true, currentRevision: 0, receipt: null },
    {
      committed: true,
      canRetry: true,
      currentRevision: 2,
      receipt: { id, revision: 2, action: "status" },
    },
    {
      committed: true,
      canRetry: false,
      currentRevision: 2,
      receipt: { id, revision: 2, action: "hold" },
    },
    {
      committed: true,
      canRetry: false,
      currentRevision: 2,
      receipt: { id: "other", revision: 2, action: "status" },
    },
  ])(
    "refuses contradictory or wrong-source recovery metadata %#",
    async (envelope) => {
      await start();
      const original = transport.getMockImplementation()!;
      transport.mockImplementation((p, o) =>
        p.endsWith("/recovery") ? Promise.resolve(envelope) : original(p, o),
      );
      click("Check original inquiry outcome");
      await screen.findByText(/original inquiry outcome could not be verified/);
      expect(
        (button("Retry identical inquiry save") as HTMLButtonElement).disabled,
      ).toBe(true);
      expect(attempts()).toHaveLength(1);
    },
  );
  it("stopped recovery reloads the current saved inquiry before another edit", async () => {
    await start("hold");
    fireEvent.click(screen.getByText("Review stopping inquiry recovery"));
    click("Stop tracking this inquiry save");
    expect((button("Save inquiry status") as HTMLButtonElement).disabled).toBe(
      true,
    );
    const original = transport.getMockImplementation()!;
    transport.mockImplementation((p, o) =>
      o?.method === "POST"
        ? original(p, o)
        : Promise.resolve({
            items: [{ ...record, status: "resolved", revision: 3 }],
            total: 1,
            page: 1,
          }),
    );
    click("Review loading current inquiry");
    await waitFor(() =>
      expect(
        screen.getByRole("combobox", { name: "Inquiry status", exact: true }),
      ).toHaveProperty("value", "resolved"),
    );
    expect(
      screen.queryByDisplayValue("Frozen original operational hold"),
    ).toBeNull();
    expect(attempts()).toHaveLength(1);
  });
});
