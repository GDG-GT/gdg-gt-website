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
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FormIntegrations from "../../src/ui/forms/FormIntegrations";
import {
  prepareIntegrationWrite,
  inspectIntegrationWrite,
  type FormReference,
  type IntegrationKind,
  type IntegrationWorkspace,
  type IntegrationCandidate,
  type IntegrationReceipt,
} from "../../src/ui/forms/form-integration-api";
import { ApiFailure } from "../../src/lib/api";
const { transport, identity, guard, safety } = vi.hoisted(() => ({
  transport: vi.fn(),
  identity: { id: "fictional-source-manager", role: "admin" },
  guard: vi.fn(),
  safety: { request: vi.fn((run: () => void) => run()) },
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
  useNavigationSafety: () => safety,
}));
const resourceId = "fictional-resource",
  formId = "fictional-target",
  sourceId = "fictional-reference",
  handlers = { onDenied: vi.fn(), onRecheck: vi.fn() };
const initial = (): FormReference => ({
  id: sourceId,
  slot: "primary",
  formId,
  label: "Fictional existing link",
  title: "Fictional current form",
  href: "/forms/fictional-current-form",
  revision: 2,
  versionPolicy: "latest_published",
});
const first = (): IntegrationCandidate => ({
  id: formId,
  title: "Fictional authorized form",
  formRevision: 3,
  publishedVersionId: "fictional-publication",
  version: 1,
  access: "internal",
});
let kind: IntegrationKind,
  workspace: IntegrationWorkspace,
  candidates: IntegrationCandidate[],
  target: IntegrationCandidate | undefined,
  loss: "before" | "after" | "none",
  commits: number,
  receipts: Map<string, IntegrationReceipt>,
  failPart: "" | "workspace" | "candidates" | "target",
  deniedPart: typeof failPart,
  writeFailure: Error | undefined,
  inspectFailure: Error | undefined;
type Options = {
  method?: string;
  body?: Record<string, unknown>;
  idempotencyKey?: string;
  signal?: AbortSignal;
};
const root = () => `/admin/form-integrations/${kind}/${resourceId}`,
  writes = () => transport.mock.calls.filter(([, o]) => o?.method);
function mount() {
  return render(
    <MemoryRouter>
      <FormIntegrations kind={kind} resourceId={resourceId} {...handlers} />
    </MemoryRouter>,
  );
}
function click(name: string) {
  fireEvent.click(screen.getByRole("button", { name, exact: true }));
}
async function open() {
  click("Linked forms");
  await screen.findByText("Fictional existing link");
}
async function choose() {
  const select = await screen.findByRole("combobox", {
    name: "Published form",
  });
  await waitFor(() =>
    expect((select as HTMLSelectElement).disabled).toBe(false),
  );
  fireEvent.change(select, { target: { value: formId } });
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Review new link",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
}
async function review(action: "create" | "replace" | "remove") {
  if (action === "replace") {
    click("Edit link");
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Review link changes",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    fireEvent.change(screen.getByLabelText("Link label"), {
      target: { value: "Reviewed changed label" },
    });
    click("Review link changes");
  } else if (action === "remove") click("Remove link");
  else {
    await choose();
    click("Review new link");
  }
  const name = action === "remove" ? "Confirm removal" : "Confirm form link";
  await waitFor(() =>
    expect(
      (screen.getByRole("button", { name }) as HTMLButtonElement).disabled,
    ).toBe(false),
  );
  return screen.getByRole("button", { name });
}
async function start(
  action: "create" | "replace" | "remove",
  position: "before" | "after" = "before",
) {
  loss = position;
  mount();
  await open();
  fireEvent.click(await review(action));
  return screen.findByRole("region", {
    name: "Unconfirmed linked form change",
  });
}
beforeEach(() => {
  kind = "event";
  workspace = {
    kind,
    resourceId,
    items: [initial()],
    canEdit: true,
    canLink: true,
  };
  candidates = [first()];
  target = first();
  loss = "none";
  commits = 0;
  receipts = new Map();
  failPart = "";
  deniedPart = "";
  writeFailure = undefined;
  inspectFailure = undefined;
  identity.id = "fictional-source-manager";
  identity.role = "admin";
  Object.values(handlers).forEach((f) => f.mockReset());
  transport.mockReset();
  guard.mockReset();
  safety.request.mockClear();
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: true,
  });
  transport.mockImplementation(async (path: string, o: Options = {}) => {
    const u = new URL("https://example.test" + path),
      parts = u.pathname.split("/"),
      slot = parts.at(-1) === "recovery" ? parts.at(-2)! : parts.at(-1)!;
    if (path.includes("/recovery")) {
      if (inspectFailure) throw inspectFailure;
      const action = u.searchParams.get("action") as "save" | "remove",
        originalSource = u.searchParams.get("sourceId"),
        current = workspace.items.find((r) => r.slot === slot);
      return {
        kind,
        resourceId,
        slot,
        sourceId: originalSource,
        action,
        committed: receipts.has(o.idempotencyKey!),
        canRetry: !receipts.has(o.idempotencyKey!) && workspace.canEdit,
        reference: current
          ? { id: current.id, revision: current.revision }
          : null,
        target:
          action === "save" && target
            ? {
                id: target.id,
                formRevision: target.formRevision,
                publishedVersionId: target.publishedVersionId,
              }
            : null,
        receipt: receipts.get(o.idempotencyKey!) || null,
      };
    }
    if (o.method) {
      if (writeFailure) throw writeFailure;
      if (loss === "before") {
        loss = "none";
        throw Error("Fictional before-dispatch integration loss");
      }
      if (!receipts.has(o.idempotencyKey!)) {
        commits++;
        const body = o.body!,
          action = o.method === "DELETE" ? "remove" : "save",
          originalSource = body.referenceId as string | null,
          id = originalSource || "fictional-created-reference";
        if (action === "remove")
          workspace = {
            ...workspace,
            items: workspace.items.filter((r) => r.slot !== slot),
          };
        else {
          const row = {
            ...initial(),
            id,
            slot,
            label: body.label as string,
            formId: body.formId as string,
            revision: (body.revision as number) + 1,
          };
          workspace = {
            ...workspace,
            items: [...workspace.items.filter((r) => r.slot !== slot), row],
          };
        }
        receipts.set(o.idempotencyKey!, {
          kind,
          resourceId,
          slot,
          sourceId: originalSource,
          action,
          id,
        });
      }
      if (loss === "after") {
        loss = "none";
        throw Error("Fictional integration acknowledgement loss");
      }
      return receipts.get(o.idempotencyKey!);
    }
    const selected = u.searchParams.get("selected"),
      part = path.includes("/candidates")
        ? selected
          ? "target"
          : "candidates"
        : "workspace";
    if (part === deniedPart)
      throw new ApiFailure(404, "NOT_FOUND", "Fictional source access denied");
    if (part === failPart) throw Error("Fictional " + part + " outage");
    if (part === "workspace") return workspace;
    const page = Number(u.searchParams.get("page") || 1),
      size = Number(u.searchParams.get("pageSize") || 30),
      q = u.searchParams.get("q") || "",
      filtered = selected
        ? target && target.id === selected
          ? [target]
          : []
        : candidates.filter((c) =>
            c.title.toLowerCase().includes(q.toLowerCase()),
          );
    return {
      kind,
      resourceId,
      items: filtered.slice((page - 1) * size, page * size),
      total: filtered.length,
      page,
      pageSize: size,
    };
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("First-party linked form current-read and original-request recovery", () => {
  it("waits until opened, names loading and never displays a false empty list", () => {
    transport.mockReturnValue(new Promise(() => {}));
    mount();
    expect(transport).not.toHaveBeenCalled();
    click("Linked forms");
    expect(
      screen.getByRole("status", { name: "Loading current linked forms" }),
    ).toBeTruthy();
    expect(screen.queryByText("No forms linked yet.")).toBeNull();
  });
  it.each(["event", "team", "campaign"] as const)(
    "uses current %s scope and read-only capabilities without exposing edit controls",
    async (scope) => {
      kind = scope;
      workspace = { ...workspace, kind: scope, canEdit: false, canLink: false };
      mount();
      await open();
      expect(screen.queryByRole("button", { name: "Edit link" })).toBeNull();
      expect(screen.queryByRole("combobox")).toBeNull();
      expect(transport.mock.calls.every(([p]) => p.startsWith(root()))).toBe(
        true,
      );
      expect(writes()).toHaveLength(0);
    },
  );
  it.each(["workspace", "candidates", "target"] as const)(
    "retries only the failed %s read and retains the proposal",
    async (part) => {
      mount();
      await open();
      if (part === "target") {
        await choose();
        failPart = "target";
        click("Recheck linked form access");
      } else {
        failPart = part;
        if (part === "workspace") click("Recheck linked form access");
        else {
          fireEvent.change(
            screen.getByLabelText("Find a published form", { exact: false }),
            { target: { value: "Fictional" } },
          );
          click("Search forms");
        }
      }
      await screen.findByText("Fictional " + part + " outage");
      const button =
        "Retry " +
        {
          workspace: "current linked forms",
          candidates: "published form candidates",
          target: "selected published form",
        }[part];
      failPart = "";
      transport.mockClear();
      click(button);
      await waitFor(() =>
        expect(screen.queryByText("Fictional " + part + " outage")).toBeNull(),
      );
      expect(transport.mock.calls).toHaveLength(1);
      expect(writes()).toHaveLength(0);
    },
  );
  it("clears cached selected-form metadata when its independent current read returns unavailable", async () => {
    mount();
    await open();
    click("Edit link");
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Review link changes",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    target = undefined;
    click("Recheck linked form access");
    await screen.findByText(/The selected form is no longer available/);
    expect(screen.queryByText("Fictional current form")).toBeNull();
    expect(
      screen.queryByRole("option", { name: /Fictional authorized form/ }),
    ).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Open respondent page" }),
    ).toBeNull();
    expect(screen.getByText("Fictional existing link")).toBeTruthy();
    expect(
      (
        screen.getByRole("combobox", {
          name: "Published form",
        }) as HTMLSelectElement
      ).value,
    ).toBe(formId);
    expect(
      (
        screen.getByRole("button", {
          name: "Review link changes",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    failPart = "target";
    click("Recheck linked form access");
    await screen.findByText("Fictional target outage");
    expect(
      screen.queryByRole("option", { name: /Fictional authorized form/ }),
    ).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Open respondent page" }),
    ).toBeNull();
    failPart = "";
    target = first();
    click("Retry selected published form");
    await screen.findByRole("option", { name: /Fictional authorized form/ });
    expect(handlers.onDenied).not.toHaveBeenCalled();
    expect(writes()).toHaveLength(0);
  });
  it("pages the complete authorized candidate inventory and keeps a separately checked selection across pages", async () => {
    candidates = Array.from({ length: 65 }, (_, i) => ({
      ...first(),
      id: "fictional-candidate-" + i,
      title: "Fictional candidate " + String(i).padStart(3, "0"),
    }));
    target = candidates[64];
    mount();
    await open();
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Next forms",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    click("Next forms");
    await screen.findByText("Form page 2 · 65 matching");
    click("Next forms");
    await screen.findByText("Form page 3 · 65 matching");
    fireEvent.change(screen.getByRole("combobox", { name: "Published form" }), {
      target: { value: target.id },
    });
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Review new link",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    click("Previous forms");
    await screen.findByText("Form page 2 · 65 matching");
    expect(
      (
        screen.getByRole("combobox", {
          name: "Published form",
        }) as HTMLSelectElement
      ).value,
    ).toBe(target.id);
    expect(screen.getByRole("option", { name: target.title })).toBeTruthy();
    expect(writes()).toHaveLength(0);
  });
  for (const action of ["create", "replace", "remove"] as const)
    for (const position of ["before", "after"] as const)
      it(`recovers ${action} ${position}-acceptance loss without retargeting`, async () => {
        await start(action, position);
        const original = writes()[0][1];
        expect(
          (
            screen.getByRole("button", {
              name: "Close",
              exact: true,
            }) as HTMLButtonElement
          ).disabled,
        ).toBe(true);
        click("Check original linked form outcome");
        if (position === "before") {
          await screen.findByText(/No committed receipt was found/);
          click("Retry identical linked form change");
        }
        await waitFor(() =>
          expect(
            screen.queryByRole("region", {
              name: "Unconfirmed linked form change",
            }),
          ).toBeNull(),
        );
        expect(commits).toBe(1);
        expect(writes()).toHaveLength(position === "before" ? 2 : 1);
        if (position === "before") {
          expect(writes()[1][1].body).toEqual(original.body);
          expect(writes()[1][1].idempotencyKey).toBe(original.idempotencyKey);
        }
        expect(handlers.onRecheck).toHaveBeenCalled();
      });
  it.each(["reference", "publication", "draft", "removed"] as const)(
    "blocks a changed %s after original-outcome inspection",
    async (change) => {
      await start("replace");
      if (change === "reference")
        workspace = {
          ...workspace,
          items: [{ ...initial(), id: "fictional-recreated-reference" }],
        };
      if (change === "publication")
        target = {
          ...target!,
          publishedVersionId: "fictional-later-publication",
        };
      if (change === "draft") target = { ...target!, formRevision: 4 };
      if (change === "removed") workspace = { ...workspace, items: [] };
      click("Check original linked form outcome");
      await screen.findByText(/target is no longer ready/);
      expect(
        (
          screen.getByRole("button", {
            name: "Retry identical linked form change",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
      expect(writes()).toHaveLength(1);
    },
  );
  it("acknowledges an accepted old removal without touching a recreated link", async () => {
    await start("remove", "after");
    workspace = {
      ...workspace,
      items: [
        { ...initial(), id: "fictional-recreated-reference", revision: 1 },
      ],
    };
    click("Check original linked form outcome");
    await waitFor(() =>
      expect(
        screen.queryByRole("region", {
          name: "Unconfirmed linked form change",
        }),
      ).toBeNull(),
    );
    expect(workspace.items[0].id).toBe("fictional-recreated-reference");
    expect(writes()).toHaveLength(1);
  });
  it("requires another inspection after a second acknowledgement loss", async () => {
    await start("replace");
    click("Check original linked form outcome");
    await screen.findByText(/No committed receipt was found/);
    loss = "after";
    click("Retry identical linked form change");
    await screen.findByText("Fictional integration acknowledgement loss");
    expect(
      (
        screen.getByRole("button", {
          name: "Retry identical linked form change",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    click("Check original linked form outcome");
    await waitFor(() =>
      expect(
        screen.queryByRole("region", {
          name: "Unconfirmed linked form change",
        }),
      ).toBeNull(),
    );
    expect(commits).toBe(1);
  });
  it.each(["workspace", "candidates", "target"] as const)(
    "clears all private state and the parent source on %s denial",
    async (part) => {
      mount();
      await open();
      if (part === "target") await choose();
      deniedPart = part;
      click("Recheck linked form access");
      await waitFor(() => expect(handlers.onDenied).toHaveBeenCalled());
      expect(screen.queryByText("Fictional existing link")).toBeNull();
      expect(
        screen.queryByRole("option", { name: /Fictional authorized form/ }),
      ).toBeNull();
    },
  );
  it("clears a frozen intent and source snapshot on recovery denial", async () => {
    await start("create");
    inspectFailure = new ApiFailure(
      403,
      "FORBIDDEN",
      "Fictional revoked source",
    );
    click("Check original linked form outcome");
    await waitFor(() => expect(handlers.onDenied).toHaveBeenCalledOnce());
    expect(
      screen.queryByRole("region", { name: "Unconfirmed linked form change" }),
    ).toBeNull();
    expect(screen.queryByText("Fictional existing link")).toBeNull();
  });
  it("retains current records on temporary read failure and pauses mutation approval", async () => {
    mount();
    await open();
    await choose();
    failPart = "workspace";
    click("Recheck linked form access");
    await screen.findByText("Fictional workspace outage");
    expect(screen.getByText("Fictional existing link")).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Review new link",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(writes()).toHaveLength(0);
  });
  it("keeps removal available when candidate inventory fails independently", async () => {
    mount();
    await open();
    failPart = "candidates";
    fireEvent.change(
      screen.getByLabelText("Find a published form", { exact: false }),
      { target: { value: "Fictional" } },
    );
    click("Search forms");
    await screen.findByText("Fictional candidates outage");
    click("Remove link");
    expect(
      (
        (await screen.findByRole("button", {
          name: "Confirm removal",
        })) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
    expect(writes()).toHaveLength(0);
  });
  it("requires reviewed stopping before another proposal", async () => {
    await start("replace");
    click("Stop tracking this linked form change");
    await waitFor(() =>
      expect(
        screen.queryByRole("region", {
          name: "Unconfirmed linked form change",
        }),
      ).toBeNull(),
    );
    expect(screen.queryByDisplayValue("Reviewed changed label")).toBeNull();
    expect(writes()).toHaveLength(1);
    expect(commits).toBe(0);
  });
  it("keeps unknown work protected from Escape and bounded to 47 hours", async () => {
    await start("create");
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(
      screen.getByRole("region", { name: "Unconfirmed linked form change" }),
    ).toBeTruthy();
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 48 * 60 * 60 * 1000);
    click("Check original linked form outcome");
    await screen.findByText(/safe retry window ended/);
    expect(
      transport.mock.calls.filter(([p]) => p.includes("/recovery")),
    ).toHaveLength(0);
  });
  it("never submits on reconnect and requires explicit current-access recheck", async () => {
    mount();
    await open();
    await choose();
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
      (
        screen.getByRole("button", {
          name: "Review new link",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    click("Recheck linked form access");
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Review new link",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    expect(writes()).toHaveLength(0);
  });
  it("isolates a changed resource/account and cleared session from pending writes", async () => {
    let resolve!: (v: unknown) => void;
    const normal = transport.getMockImplementation()!,
      wait = new Promise((done) => (resolve = done));
    transport.mockImplementation((p: string, o: Options = {}) =>
      o.method ? wait : normal(p, o),
    );
    const v = mount();
    await open();
    fireEvent.click(await review("replace"));
    const signal = writes()[0][1].signal;
    act(() => window.dispatchEvent(new Event("gdg:session-cleared")));
    expect(signal.aborted).toBe(true);
    await act(async () =>
      resolve({
        kind,
        resourceId,
        slot: "primary",
        sourceId,
        action: "save",
        id: sourceId,
      }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    identity.id = "fictional-next-manager";
    v.rerender(
      <MemoryRouter>
        <FormIntegrations
          kind="team"
          resourceId="fictional-new-resource"
          {...handlers}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByDisplayValue("Reviewed changed label")).toBeNull();
  });
  it("prepares immutable generation/publication-bound packets and rejects unavailable target metadata", () => {
    const candidate = first(),
      i = prepareIntegrationWrite(
        workspace,
        "save",
        " Reviewed label ",
        candidate,
        initial(),
      );
    candidate.formRevision = 99;
    expect(JSON.parse(i.body)).toEqual({
      revision: 2,
      referenceId: sourceId,
      formId,
      formRevision: 3,
      publishedVersionId: "fictional-publication",
      versionPolicy: "latest_published",
      label: "Reviewed label",
    });
    expect(Object.isFrozen(i)).toBe(true);
    expect(() =>
      prepareIntegrationWrite(workspace, "save", "Open", undefined),
    ).toThrow();
    expect(() =>
      prepareIntegrationWrite(
        { ...workspace, canEdit: false },
        "remove",
        "",
        undefined,
        initial(),
      ),
    ).toThrow();
  });
  it("rejects a substituted original receipt", async () => {
    const i = prepareIntegrationWrite(
      workspace,
      "remove",
      "",
      undefined,
      initial(),
    );
    transport.mockResolvedValue({
      kind: "team",
      resourceId,
      slot: "primary",
      sourceId,
      action: "remove",
      committed: true,
      canRetry: false,
      reference: null,
      target: null,
      receipt: {
        kind: "team",
        resourceId,
        slot: "primary",
        sourceId,
        action: "remove",
        id: sourceId,
      },
    });
    await expect(inspectIntegrationWrite(i)).rejects.toMatchObject({
      code: "UNCONFIRMED_REFERENCE",
    });
  });
});
