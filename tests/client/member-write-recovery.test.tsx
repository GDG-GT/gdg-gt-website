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
import MembersWorkspace from "../../src/ui/members/MembersWorkspace";
import NavigationSafety from "../../src/ui/NavigationSafety";
import { ApiFailure } from "../../src/lib/api";
import { memberFields } from "../../src/ui/members/types";
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
const id = "f1330000-0000-4000-8000-000000000001",
  record = {
    ...memberFields(),
    id,
    name: "Fictional existing member",
    email: "fictional-existing@example.test",
    reference: "FICTIONAL-REF",
    team_id: null,
    teamName: null,
    revision: 1,
    deleted_at: null,
    merged_into_id: null,
    actions: ["read", "update", "delete", "merge"],
    publicProfile: null,
    canSyncProfile: false,
    activeProjectCount: 0,
  };
let loss: "before" | "after" | "none",
  receipts: Map<string, { id: string; revision: number; profileId: null }>,
  commits: number,
  readError: Error | undefined,
  canRetry: boolean,
  secondLoss: boolean,
  routers: ReturnType<typeof createMemoryRouter>[] = [];
function mount(selected = false) {
  const router = createMemoryRouter(
    [
      {
        path: "/admin/members",
        element: (
          <NavigationSafety>
            <main>
              <MembersWorkspace />
            </main>
          </NavigationSafety>
        ),
      },
    ],
    { initialEntries: ["/admin/members" + (selected ? "?member=" + id : "")] },
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
it("syncs a named member into a reviewable draft without publishing automatically", async () => {
  const profileId = "f1330000-0000-4000-8000-000000000010";
  const original = transport.getMockImplementation()!;
  transport.mockImplementation(async (path: string, options = {}) => {
    const o = options as { method?: string };
    if (o.method === "POST") return { id, revision: 2, profileId };
    const result = await original(path, options);
    return result.member ? { member: { ...result.member, canSyncProfile: true } } : result;
  });
  mount(true);
  await screen.findByRole("heading", { name: record.name });
  await waitFor(() => expect((button("Sync draft public profile") as HTMLButtonElement).disabled).toBe(false));
  click("Sync draft public profile");
  expect(screen.queryByLabelText(/Exact member reference/)).toBeNull();
  const proof = screen.getByLabelText("Current password *"), form = proof.closest("form")!;
  fireEvent.change(proof, { target: { value: "Fictional-sync-proof" } });
  fireEvent.submit(form);
  expect(attempts()).toHaveLength(0);
  fireEvent.click(screen.getByRole("checkbox", { name: /Create or update the draft Team profile for Fictional existing member/ }));
  fireEvent.submit(form);
  const review = await screen.findByRole("link", { name: "Review draft Team profile" });
  expect(review.getAttribute("href")).toBe("/admin/content/team?profile=" + profileId);
  expect(attempts()).toHaveLength(1);
  expect(attempts()[0][1].body).toMatchObject({ action: "sync_profile", confirmation: record.reference });
  expect(attempts().some(([, options]) => options.body.action === "publish")).toBe(false);
});
async function start(action = "create") {
  mount(action !== "create");
  await waitFor(() =>
    expect((button("New member") as HTMLButtonElement).disabled).toBe(false),
  );
  if (action === "create") {
    click("New member");
    fireEvent.change(screen.getByLabelText("Name *"), {
      target: { value: "Frozen original member" },
    });
    fireEvent.change(screen.getByLabelText("Email *"), {
      target: { value: "frozen-original@example.test" },
    });
  } else {
    await screen.findByRole("heading", { name: record.name });
    click(action === "update" ? "Edit member" : "Archive member");
    if (action === "update")
      fireEvent.change(screen.getByLabelText("Name *"), {
        target: { value: "Frozen original update" },
      });
    else {
      fireEvent.click(screen.getByRole("checkbox", { name: /I have reviewed/ }));
      fireEvent.change(screen.getByLabelText("Current password *"), {
        target: { value: "Fresh original proof" },
      });
    }
  }
  click("Save member changes");
  await screen.findByRole("region", { name: "Unconfirmed member save" });
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
          currentRevision: 1,
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
          receipts.set(o.idempotencyKey!, { id, revision: 2, profileId: null });
        }
        if (loss === "after" || secondLoss) {
          loss = "none";
          secondLoss = false;
          throw Error("Fictional accepted reply loss");
        }
        return receipts.get(o.idempotencyKey!);
      }
      if (path.endsWith("/capabilities"))
        return { globalCreate: true, merge: true, teams: [] };
      if (path.includes("/activity?"))
        return { items: [], page: 1, pageSize: 30 };
      if (path.includes("?"))
        return {
          items: [record],
          total: 1,
          pageSize: 30,
          stats: { active: 1, core: 0, categories: { member: 1 } },
        };
      return { member: record };
    },
  );
});
afterEach(() => {
  cleanup();
  for (const router of routers) router.dispose();
  routers = [];
  vi.restoreAllMocks();
});
describe("Original member save reconciliation and explicit identical retry", () => {
  for (const action of ["create", "update", "archive"])
    for (const position of ["before", "after"] as const)
      it(`${action} ${position} acceptance preserves exact document/key and creates only one outcome`, async () => {
        loss = position;
        await start(action);
        const original = attempts()[0];
        expect(
          (button("Save member changes") as HTMLButtonElement).disabled,
        ).toBe(true);
        expect(
          (button("Retry identical member save") as HTMLButtonElement).disabled,
        ).toBe(true);
        expect(screen.queryByDisplayValue("Fresh original proof")).toBeNull();
        click("Check original member outcome");
        if (position === "before") {
          await waitFor(() =>
            expect(
              (button("Retry identical member save") as HTMLButtonElement)
                .disabled,
            ).toBe(action === "archive"),
          );
          if (action === "archive")
            fireEvent.change(
              screen.getByLabelText(
                "Current password for original member retry *",
              ),
              { target: { value: "New explicit proof" } },
            );
          click("Retry identical member save");
        }
        await screen.findByText("Original community member save confirmed.");
        expect(commits).toBe(1);
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
          if (action === "archive")
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
    click("Check original member outcome");
    await waitFor(() =>
      expect(
        (button("Retry identical member save") as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    secondLoss = true;
    click("Retry identical member save");
    await screen.findByText("Fictional accepted reply loss");
    expect(
      (button("Retry identical member save") as HTMLButtonElement).disabled,
    ).toBe(true);
    click("Check original member outcome");
    await screen.findByText("Original community member save confirmed.");
    expect(commits).toBe(1);
    expect(attempts()).toHaveLength(2);
  });
  it("never retries a new stale request when original inspection says unsafe", async () => {
    canRetry = false;
    await start();
    click("Check original member outcome");
    await screen.findByText(/current record or access state prevents/);
    expect(
      (button("Retry identical member save") as HTMLButtonElement).disabled,
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
      click("Check original member outcome");
      await screen.findByText(/Private records and edits have been cleared/);
      expect(screen.queryByDisplayValue("Frozen original member")).toBeNull();
      expect(
        screen.queryByRole("region", { name: "Unconfirmed member save" }),
      ).toBeNull();
      expect(attempts()).toHaveLength(1);
    },
  );
  it("requires explicit recheck after offline without automatic inspection or retry", async () => {
    await start();
    click("Check original member outcome");
    await waitFor(() =>
      expect(
        (button("Retry identical member save") as HTMLButtonElement).disabled,
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
      (button("Retry identical member save") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(transport).toHaveBeenCalledTimes(before);
    expect(attempts()).toHaveLength(1);
  });
  it("fences an expired or backwards-clock recovery window before network work", async () => {
    await start();
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 47 * 60 * 60 * 1000 + 1);
    const before = transport.mock.calls.length;
    click("Check original member outcome");
    await screen.findByText(/safe member recovery window ended/);
    expect(transport).toHaveBeenCalledTimes(before);
  });
  it("reviewed stopping clears private proposals without creating a replacement save", async () => {
    loss = "after";
    await start();
    fireEvent.click(screen.getByText("Review stopping member recovery"));
    click("Stop tracking this member save");
    await screen.findByText(/Member recovery stopped/);
    expect(screen.queryByDisplayValue("Frozen original member")).toBeNull();
    expect(attempts()).toHaveLength(1);
    expect(commits).toBe(1);
  });
  it("blocks abandoning unknown original work through ordinary editor navigation", async () => {
    await start();
    expect((button("Close editor") as HTMLButtonElement).disabled).toBe(true);
    expect(
      (button("Recheck member access") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(attempts()).toHaveLength(1);
  });
  it("clears unknown original intent on session reset and never restores its old body", async () => {
    await start();
    act(() => window.dispatchEvent(new Event("gdg:session-cleared")));
    await waitFor(() =>
      expect(
        screen.queryByRole("region", { name: "Unconfirmed member save" }),
      ).toBeNull(),
    );
    expect(screen.queryByDisplayValue("Frozen original member")).toBeNull();
    expect(attempts()).toHaveLength(1);
  });
  it("keeps a lost retry's fresh-password rejection distinct from current access denial", async () => {
    await start("archive");
    click("Check original member outcome");
    await screen.findByLabelText(
      "Current password for original member retry *",
    );
    fireEvent.change(
      screen.getByLabelText("Current password for original member retry *"),
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
    click("Retry identical member save");
    await screen.findByText("Fictional fresh proof rejected");
    expect(
      screen.getByRole("region", { name: "Unconfirmed member save" }),
    ).toBeTruthy();
    expect(screen.queryByDisplayValue("Rejected current proof")).toBeNull();
    expect(
      (button("Retry identical member save") as HTMLButtonElement).disabled,
    ).toBe(true);
  });
  it("refuses a malformed accepted inspection receipt without changing the private proposal", async () => {
    await start("update");
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
    click("Check original member outcome");
    await screen.findByText(/original member outcome could not be verified/);
    expect(screen.getByDisplayValue("Frozen original update")).toBeTruthy();
    expect(
      (button("Retry identical member save") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(attempts()).toHaveLength(1);
  });
  it("aborts an in-flight save on offline, preserves its original intent and ignores a late acknowledgement", async () => {
    let finish!: (value: unknown) => void;
    const original = transport.getMockImplementation()!;
    transport.mockImplementation((p, o) =>
      o?.method === "POST" && !p.endsWith("/recovery")
        ? new Promise((resolve) => {
            finish = resolve;
            receipts.set(o.idempotencyKey, {
              id,
              revision: 1,
              profileId: null,
            });
            commits++;
          })
        : original(p, o),
    );
    mount();
    await waitFor(() =>
      expect((button("New member") as HTMLButtonElement).disabled).toBe(false),
    );
    click("New member");
    fireEvent.change(screen.getByLabelText("Name *"), {
      target: { value: "Fictional offline intent" },
    });
    fireEvent.change(screen.getByLabelText("Email *"), {
      target: { value: "offline-intent@example.test" },
    });
    click("Save member changes");
    await waitFor(() => expect(attempts()).toHaveLength(1));
    const signal = attempts()[0][1].signal;
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    act(() => window.dispatchEvent(new Event("offline")));
    await screen.findByRole("region", { name: "Unconfirmed member save" });
    expect(signal.aborted).toBe(true);
    await act(async () => finish({ id, revision: 1, profileId: null }));
    expect(
      screen.queryByText("Original community member save confirmed."),
    ).toBeNull();
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    act(() => window.dispatchEvent(new Event("online")));
    click("Check original member outcome");
    await screen.findByText("Original community member save confirmed.");
    expect(attempts()).toHaveLength(1);
    expect(commits).toBe(1);
  });
});
