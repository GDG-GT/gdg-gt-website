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
      return { id: records[0].id };
    },
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("Source-bound member merge picker private read recovery", () => {
  it("provides a named candidate loading state before selecting or reviewing", async () => {
    const pending = deferred<unknown>(),
      original = transport.getMockImplementation()!;
    transport.mockImplementation((p, o) =>
      kind(p) === "candidates" ? pending.promise : original(p, o),
    );
    mount();
    expect(
      screen.getByRole("status", { name: "Loading merge candidates" }),
    ).toBeTruthy();
    expect(
      (button("Generate current review") as HTMLButtonElement).disabled,
    ).toBe(true);
    await act(async () =>
      pending.resolve(
        await original(
          "/admin/members/" + source.id + "/merge-candidates?page=1&q=",
        ),
      ),
    );
    await select();
    expect(posts()).toHaveLength(0);
  });
  it("retries initial candidate failure without preparing a merge", async () => {
    failures.set("candidates", Error("Fictional candidate outage"));
    mount();
    await screen.findByText(/Fictional candidate outage/);
    failures.clear();
    click("Retry merge candidates");
    await select();
    expect(posts()).toHaveLength(0);
  });
  it("pages the complete eligible inventory and loads the last target with source-bound authority", async () => {
    mount();
    await screen.findByRole("option", {
      name: records[0].name + " · " + records[0].email,
    });
    click("Next canonical members");
    await screen.findByRole("option", {
      name: records[30].name + " · " + records[30].email,
    });
    click("Next canonical members");
    await select(64);
    expect(transport).toHaveBeenCalledWith(
      "/admin/members/" + source.id + "/merge-target/" + records[64].id,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(posts()).toHaveLength(0);
  });
  it("retains a generic selected value outside the current page while verifying the selected target independently", async () => {
    mount();
    await select();
    click("Next canonical members");
    await screen.findByRole("option", { name: "Selected canonical member" });
    expect(
      (screen.getByLabelText("Canonical member to keep") as HTMLSelectElement)
        .value,
    ).toBe(records[0].id);
    await waitFor(() =>
      expect(
        (button("Generate current review") as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    expect(posts()).toHaveLength(0);
  });
  it("retains a dated candidate snapshot on background failure and disables selecting a different target", async () => {
    mount();
    await select();
    failures.set("candidates", Error("Fictional candidate refresh outage"));
    click("Recheck merge selection");
    await screen.findByText(/Fictional candidate refresh outage/);
    expect(screen.getByText(/Showing merge candidates from/)).toBeTruthy();
    expect(
      (screen.getByLabelText("Canonical member to keep") as HTMLSelectElement)
        .disabled,
    ).toBe(true);
    expect(
      (button("Generate current review") as HTMLButtonElement).disabled,
    ).toBe(true);
    failures.clear();
    click("Retry merge candidates");
    await waitFor(() =>
      expect(
        (button("Generate current review") as HTMLButtonElement).disabled,
      ).toBe(false),
    );
  });
  it("recovers selected-target failure independently of the candidate page", async () => {
    failures.set("target", Error("Fictional selected target outage"));
    mount();
    await screen.findByRole("option", {
      name: records[0].name + " · " + records[0].email,
    });
    fireEvent.change(screen.getByLabelText("Canonical member to keep"), {
      target: { value: records[0].id },
    });
    await screen.findByText(/Fictional selected target outage/);
    const before = transport.mock.calls.filter(
      ([p]) => kind(p) === "candidates",
    ).length;
    failures.clear();
    click("Retry canonical member");
    await waitFor(() =>
      expect(
        (button("Generate current review") as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    expect(
      transport.mock.calls.filter(([p]) => kind(p) === "candidates"),
    ).toHaveLength(before);
    expect(posts()).toHaveLength(0);
  });
  it("keeps an existing review on a transient target refresh error while pausing approval", async () => {
    mount();
    await review();
    failures.set("target", Error("Fictional reviewed target outage"));
    click("Recheck merge selection");
    await screen.findByText(/Fictional reviewed target outage/);
    expect(
      screen.getByRole("heading", { name: "Compare before merging" }),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Confirm retained merge",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(posts()).toHaveLength(1);
  });
  it.each([401, 403, 404])(
    "clears private candidates/target/review/proof after current selection denial %s",
    async (status) => {
      mount();
      await review();
      failures.set(
        "target",
        new ApiFailure(status, "NOT_FOUND", "Fictional selection unavailable"),
      );
      click("Recheck merge selection");
      await screen.findByText(
        /Private candidates, target and review have been cleared/,
      );
      expect(
        screen.queryByRole("heading", { name: "Compare before merging" }),
      ).toBeNull();
      expect(
        screen.queryByRole("option", {
          name: records[0].name + " · " + records[0].email,
        }),
      ).toBeNull();
      const before = transport.mock.calls.length;
      await act(async () => {
        await Promise.resolve();
      });
      expect(transport).toHaveBeenCalledTimes(before);
      failures.clear();
      click("Recheck merge selection");
      await select();
      expect(posts()).toHaveLength(1);
    },
  );
  it("blocks review when source metadata no longer matches the parent source revision", async () => {
    sourceRevision = 2;
    mount();
    await screen.findByText(/source member changed/);
    expect(
      (button("Generate current review") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(posts()).toHaveLength(0);
  });
  it("keeps a changed target revision from approving a stale review", async () => {
    mount();
    await review();
    targetRevision = 2;
    click("Recheck merge selection");
    await screen.findByText(/This review changed or expired/);
    expect(
      (
        screen.getByRole("button", {
          name: "Confirm retained merge",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(posts()).toHaveLength(1);
  });
  it("requires explicit recheck after offline without preparing or committing automatically", async () => {
    mount();
    await select();
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    act(() => window.dispatchEvent(new Event("offline")));
    expect(screen.getByText(/Showing merge candidates from/)).toBeTruthy();
    const before = transport.mock.calls.length;
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    act(() => window.dispatchEvent(new Event("online")));
    expect(
      (button("Generate current review") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(transport).toHaveBeenCalledTimes(before);
    click("Recheck merge selection");
    await waitFor(() =>
      expect(
        (button("Generate current review") as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    expect(posts()).toHaveLength(0);
  });
  it("discards a review explicitly before changing canonical selection and keeps comparison keyboard-scrollable", async () => {
    mount();
    await review();
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "Compare before merging" }),
    );
    expect(
      screen
        .getByRole("region", { name: "Private member comparison" })
        .getAttribute("tabindex"),
    ).toBe("0");
    click("Discard this merge review");
    expect(
      screen.queryByRole("heading", { name: "Compare before merging" }),
    ).toBeNull();
    expect(posts()).toHaveLength(1);
    click("Close merge review");
    expect(onClose).toHaveBeenCalledOnce();
  });
  it("aborts old private reads on unmount and cannot restore an old target afterward", async () => {
    const pending = deferred<unknown>(),
      original = transport.getMockImplementation()!;
    transport.mockImplementation((p, o) =>
      kind(p) === "target" ? pending.promise : original(p, o),
    );
    const view = mount();
    await screen.findByRole("option", {
      name: records[0].name + " · " + records[0].email,
    });
    fireEvent.change(screen.getByLabelText("Canonical member to keep"), {
      target: { value: records[0].id },
    });
    const last = transport.mock.calls.find(([p]) => kind(p) === "target")!;
    view.unmount();
    expect(last[1].signal.aborted).toBe(true);
    await act(async () =>
      pending.resolve({ member: records[0], sourceRevision: 1 }),
    );
    expect(posts()).toHaveLength(0);
  });
});
