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
import MergeReview from "../../src/ui/members/MergeReview";
import { memberFields, type Member } from "../../src/ui/members/types";
import { ApiFailure } from "../../src/lib/api";
const { transport } = vi.hoisted(() => ({ transport: vi.fn() }));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: transport,
}));
const source: Member = {
  ...memberFields(),
  id: "f8320000-0000-4000-8000-000000000001",
  name: "Fictional merge source",
  email: "fictional-merge-source@example.test",
  reference: "FICTIONAL-SOURCE",
  team_id: null,
  teamName: null,
  revision: 1,
  deleted_at: null,
  merged_into_id: null,
  actions: ["merge", "read"],
  publicProfile: null,
  canSyncProfile: false,
  activeProjectCount: 0,
};
const records = Array.from(
  { length: 65 },
  (_, i): Member => ({
    ...source,
    id: "f8330000-0000-4000-8000-" + String(i + 1).padStart(12, "0"),
    name: "Eligible " + String(i + 1).padStart(3, "0"),
    email: "fictional-merge-" + i + "@example.test",
    reference: "FICTIONAL-TARGET-" + i,
  }),
);
let failures: Map<string, Error>,
  targetRevision: number,
  sourceRevision: number;
const onSaved = vi.fn(),
  onClose = vi.fn(),
  onBusy = vi.fn(),
  onDirty = vi.fn();
function props(disabled = false) {
  return { source, tick: 0, disabled, onSaved, onClose, onBusy, onDirty };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
const button = (name: string) =>
  screen.getByRole("button", { name, exact: true });
const click = (name: string) => fireEvent.click(button(name));
const posts = () =>
  transport.mock.calls.filter(([, o]) => o?.method === "POST");
const kind = (path: string) =>
  path.includes("/merge-candidates?")
    ? "candidates"
    : path.includes("/merge-target/")
      ? "target"
      : path.endsWith("/merge-preview")
        ? "preview"
        : "commit";
function mount() {
  return render(<MergeReview {...props()} />);
}
async function select(index = 0) {
  await screen.findByRole("option", {
    name: records[index].name + " · " + records[index].email,
  });
  fireEvent.change(screen.getByLabelText("Canonical member to keep"), {
    target: { value: records[index].id },
  });
  await waitFor(() =>
    expect(
      (button("Generate current review") as HTMLButtonElement).disabled,
    ).toBe(false),
  );
}
async function review() {
  await select();
  click("Generate current review");
  await screen.findByRole("heading", { name: "Compare before merging" });
}
beforeEach(() => {
  transport.mockReset();
  onSaved.mockReset();
  onClose.mockReset();
  onBusy.mockReset();
  onDirty.mockReset();
  failures = new Map();
  targetRevision = 1;
  sourceRevision = 1;
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: true,
  });
  transport.mockImplementation(
    async (
      path: string,
      o: { body?: { targetId?: string }; method?: string } = {},
    ) => {
      const op = kind(path);
      if (failures.has(op)) throw failures.get(op);
      if (op === "candidates") {
        const url = new URL(path, "https://fictional.example.test"),
          q = url.searchParams.get("q") || "",
          page = Number(url.searchParams.get("page") || 1),
          all = records.filter((m) =>
            (m.name + " " + m.email).toLowerCase().includes(q.toLowerCase()),
          );
        return {
          items: all.slice((page - 1) * 30, page * 30),
          total: all.length,
          page,
          pageSize: 30,
          sourceRevision,
        };
      }
      if (op === "target")
        return {
          member: {
            ...records.find((m) => m.id === path.split("/").at(-1)),
            revision: targetRevision,
          },
          sourceRevision,
        };
      if (op === "preview")
        return {
          reviewId: "f8320000-0000-4000-8000-000000000009",
          reviewToken: "f".repeat(43),
          source,
          target: {
            ...records.find((m) => m.id === o.body?.targetId),
            revision: targetRevision,
          },
          policy:
            "Fictional retained source; canonical fields remain unchanged.",
          expiresAt: new Date(Date.now() + 60000).toISOString(),
        };
      return { id: records[0].id, revision: 2, sourceId: source.id };
    },
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

let loss: "before" | "after" | "none",
  receipts: Map<string, unknown>,
  commits: number,
  recoveryError: Error | undefined,
  canRetry: boolean;
beforeEach(() => {
  loss = "none";
  receipts = new Map();
  commits = 0;
  recoveryError = undefined;
  canRetry = true;
  const original = transport.getMockImplementation()!;
  transport.mockImplementation(async (p, o = {}) => {
    if (p.endsWith("/recovery")) {
      if (recoveryError) throw recoveryError;
      const receipt = receipts.get(o.idempotencyKey) || null;
      return { committed: !!receipt, canRetry: !receipt && canRetry, receipt };
    }
    if (o.method !== "POST") return original(p, o);
    if (loss === "before") {
      loss = "none";
      throw Error("Fictional before acceptance loss");
    }
    if (!receipts.has(o.idempotencyKey)) {
      commits++;
      receipts.set(o.idempotencyKey, await original(p, o));
    }
    if (loss === "after") {
      loss = "none";
      throw Error("Fictional accepted reply loss");
    }
    return receipts.get(o.idempotencyKey);
  });
});
const attempts = () =>
  transport.mock.calls.filter(
    ([p, o]) => o?.method === "POST" && !p.endsWith("/recovery"),
  );
async function start(
  action = "preview",
  position: "before" | "after" = "before",
) {
  mount();
  if (action === "commit") {
    await review();
    fireEvent.click(screen.getByRole("checkbox", { name: /I want to retain this duplicate/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /I want to keep this member/ }));
    fireEvent.change(screen.getByLabelText("Current password *"), {
      target: { value: "Original proof" },
    });
    loss = position;
    click("Confirm retained merge");
  } else {
    await select();
    loss = position;
    click("Generate current review");
  }
  await screen.findByRole("region", { name: "Unconfirmed merge save" });
}
describe("Original merge review and commit reconciliation", () => {
  for (const action of ["preview", "commit"])
    for (const position of ["before", "after"] as const)
      it(`${action} ${position} loss preserves exact original scope/document/key and commits once`, async () => {
        await start(action, position);
        const before = attempts().length,
          original = attempts().at(-1)!;
        expect(
          (button("Close merge review") as HTMLButtonElement).disabled,
        ).toBe(true);
        expect(
          (button("Generate current review") as HTMLButtonElement).disabled,
        ).toBe(true);
        expect(
          (button("Retry identical merge save") as HTMLButtonElement).disabled,
        ).toBe(true);
        expect(screen.queryByDisplayValue("Original proof")).toBeNull();
        click("Check original merge outcome");
        if (position === "before") {
          await screen.findByText(/may explicitly retry the identical/);
          if (action === "commit")
            fireEvent.change(
              screen.getByLabelText(
                "Current password for original merge retry *",
              ),
              { target: { value: "New explicit proof" } },
            );
          click("Retry identical merge save");
        }
        await waitFor(() =>
          expect(
            screen.queryByRole("region", { name: "Unconfirmed merge save" }),
          ).toBeNull(),
        );
        if (action === "preview")
          await screen.findByRole("heading", {
            name: "Compare before merging",
          });
        else expect(onSaved).toHaveBeenCalledWith(records[0].id);
        expect(commits).toBe(action === "preview" ? 1 : 2);
        expect(attempts()).toHaveLength(
          before + (position === "before" ? 1 : 0),
        );
        const inspection = transport.mock.calls.find(([p]) =>
          p.endsWith("/recovery"),
        )!;
        const body = { ...original[1].body };
        delete body.currentPassword;
        expect(inspection[1].body).toEqual(body);
        expect(inspection[1].idempotencyKey).toBe(original[1].idempotencyKey);
        if (position === "before") {
          const last = attempts().at(-1)!;
          expect(last[1].idempotencyKey).toBe(original[1].idempotencyKey);
          const retried = { ...last[1].body };
          delete retried.currentPassword;
          expect(retried).toEqual(body);
          if (action === "commit")
            expect(last[1].body.currentPassword).toBe("New explicit proof");
        }
      });
  it.each([401, 403, 404])(
    "clears proposed private merge fields on current denial %s",
    async (status) => {
      await start("commit");
      recoveryError = new ApiFailure(
        status,
        "FORBIDDEN",
        "Fictional current access unavailable",
      );
      click("Check original merge outcome");
      await screen.findByText(/Private candidates/);
      expect(
        screen.queryByRole("heading", { name: "Compare before merging" }),
      ).toBeNull();
      expect(
        screen.queryByRole("region", { name: "Unconfirmed merge save" }),
      ).toBeNull();
      expect(onSaved).not.toHaveBeenCalled();
    },
  );
  it("does not retry an expired or stale unaccepted merge", async () => {
    await start("commit");
    canRetry = false;
    click("Check original merge outcome");
    await screen.findByText(/prevents a safe retry/);
    expect(
      (button("Retry identical merge save") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(attempts()).toHaveLength(2);
  });
  it("requires a new inspection after the retry reply is lost again", async () => {
    await start();
    click("Check original merge outcome");
    await screen.findByText(/may explicitly retry/);
    loss = "after";
    click("Retry identical merge save");
    await screen.findByText("Fictional accepted reply loss");
    expect(
      (button("Retry identical merge save") as HTMLButtonElement).disabled,
    ).toBe(true);
    click("Check original merge outcome");
    await screen.findByRole("heading", { name: "Compare before merging" });
    expect(commits).toBe(1);
    expect(attempts()).toHaveLength(2);
  });
  it("offline/reconnect invalidates retry eligibility without automatic writes", async () => {
    await start();
    click("Check original merge outcome");
    await screen.findByText(/may explicitly retry/);
    const count = transport.mock.calls.length;
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    act(() => window.dispatchEvent(new Event("offline")));
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    act(() => window.dispatchEvent(new Event("online")));
    expect(
      (button("Retry identical merge save") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(transport.mock.calls).toHaveLength(count);
  });
  it("reviewed stopping clears the review and freezes actions until explicit current selection recheck", async () => {
    await start("commit", "after");
    fireEvent.click(screen.getByText("Review stopping merge recovery"));
    click("Stop tracking this merge save");
    await screen.findByText(/Merge recovery stopped/);
    expect(
      screen.queryByRole("heading", { name: "Compare before merging" }),
    ).toBeNull();
    expect(
      (button("Generate current review") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(attempts()).toHaveLength(2);
    expect(onSaved).not.toHaveBeenCalled();
  });
  it("refuses a malformed accepted review without discarding the original intent", async () => {
    await start();
    const original = transport.getMockImplementation()!;
    transport.mockImplementation((p, o) =>
      p.endsWith("/recovery")
        ? Promise.resolve({
            committed: true,
            canRetry: false,
            receipt: { reviewId: "fictional" },
          })
        : original(p, o),
    );
    click("Check original merge outcome");
    await screen.findByText(/original merge outcome could not be verified/);
    expect(
      (button("Retry identical merge save") as HTMLButtonElement).disabled,
    ).toBe(true);
  });
  it("fences clock reversal and expiry before inspecting the network", async () => {
    await start();
    const now = Date.now(),
      count = transport.mock.calls.length;
    vi.spyOn(Date, "now").mockReturnValue(now + 47 * 60 * 60 * 1000 + 1);
    click("Check original merge outcome");
    await screen.findByText(/safe merge recovery window ended/);
    expect(transport.mock.calls).toHaveLength(count);
  });
  it("cancels an in-flight merge preview on offline and ignores its late receipt", async () => {
    const original = transport.getMockImplementation()!;
    let finish!: (v: unknown) => void;
    transport.mockImplementation((p, o) =>
      p.endsWith("/merge-preview")
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : original(p, o),
    );
    mount();
    await select();
    click("Generate current review");
    await waitFor(() => expect(attempts()).toHaveLength(1));
    const signal = attempts()[0][1].signal;
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    act(() => window.dispatchEvent(new Event("offline")));
    await screen.findByRole("region", { name: "Unconfirmed merge save" });
    expect(signal.aborted).toBe(true);
    await act(async () => finish({ reviewId: "late" }));
    expect(
      screen.queryByRole("heading", { name: "Compare before merging" }),
    ).toBeNull();
  });
  it("accepts nullable optional member fields in an original authorized preview", async () => {
    const original = transport.getMockImplementation()!;
    transport.mockImplementation(async (p, o) => {
      const r = await original(p, o);
      return p.endsWith("/merge-preview")
        ? {
            ...r,
            source: { ...r.source, phone: null, year: null, major: null },
            target: { ...r.target, phone: null, year: null, major: null },
          }
        : r;
    });
    mount();
    await review();
    expect(
      screen.queryByRole("region", { name: "Unconfirmed merge save" }),
    ).toBeNull();
    expect(commits).toBe(1);
  });
});
