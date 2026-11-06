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
import axe from "axe-core";
import AccessPanel from "../../src/ui/forms/AccessPanel";
import { createTemplate } from "../../shared/forms";
import { ApiFailure } from "../../src/lib/api";
const { transport, identity, guard } = vi.hoisted(() => ({
  transport: vi.fn(),
  identity: { id: "fictional-manager", role: "admin" },
  guard: vi.fn(),
}));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: transport,
}));
vi.mock("@/contexts/AdminContext", () => ({
  useAdmin: () => ({ currentAdmin: identity }),
}));
vi.mock("@/hooks/useDraftGuard", () => ({ useDraftGuard: guard }));
const candidate = {
    id: "fictional-peer",
    display_name: "Fictional eligible account",
    role: "team_member",
    actions: ["view"],
    grantId: "fictional-grant",
    grantRevision: 2,
  },
  collaborator = {
    admin_user_id: "fictional-peer",
    display_name: "Fictional collaborator",
    actions: ["view"],
    grantId: "fictional-grant",
    grantRevision: 2,
    updated_at: "2026-11-04T12:00:00Z",
  },
  invite = {
    id: "fictional-link",
    recipientHint: "fi…@example.test",
    delivery_state: "sent",
    responded: false,
    revoked_at: null,
    expires_at: "2099-11-04T12:00:00Z",
    token_type: "invited" as const,
    revision: 1,
    last_sent_at: null,
  };
function definition(id = "fictional-form") {
  const form = {
    ...createTemplate("Fictional access form", "blank"),
    id,
    revision: 1,
    actions: ["view", "edit", "manage_access", "view_responses"],
  };
  form.settings.access = "invited";
  form.versions = [
    {
      version: 1,
      versionId: "fictional-published-version",
      title: form.title,
      description: form.description,
      fields: form.fields,
      sections: form.sections,
      settings: { ...form.settings },
      publishedAt: "2026-11-04T12:00:00Z",
    },
  ];
  return form;
}
const inventory = <T,>(items: T[], total = items.length) => ({
  items,
  total,
  page: 1,
  pageSize: 30,
});
function pending<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
let current = definition();
let read: (path: string) => unknown;
function defaults(path: string) {
  if (path.includes("collaborator-candidates")) return inventory([candidate]);
  if (path.includes("/collaborators")) return inventory([collaborator]);
  if (path.includes("/invitations")) return inventory([invite]);
  return { form: current };
}
function ack(options: { body: { userId: string }; method: string }) {
  if (!options.body.userId)
    return {
      formId: current.id,
      sourceId: invite.id,
      action: (options.body as Record<string, unknown>).action,
      queued:
        (options.body as Record<string, unknown>).action === "revoke" ? 0 : 1,
      existing: 0,
      total: 1,
    };
  return {
    committed: true,
    canRetry: false,
    formId: current.id,
    userId: options.body.userId,
    formRevision: 1,
    canSave: true,
    canRemove: true,
    allowedActions: current.actions,
    grant: null,
    receipt: {
      formId: current.id,
      userId: options.body.userId,
      action: options.method === "DELETE" ? "remove" : "save",
    },
  };
}
function mount(form = current) {
  return render(
    <main id="workspace-content" tabIndex={-1}>
      <AccessPanel form={form} />
    </main>,
  );
}
const writes = () =>
  transport.mock.calls.filter(([, options]) => options?.method);
async function loaded() {
  await screen.findByText("Fictional collaborator");
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Remove collaborator",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
}
async function review(action: "remove" | "revoke" | "resend" | "save") {
  if (action === "save") {
    fireEvent.change(
      screen.getByRole("combobox", { name: "Chapter account" }),
      { target: { value: candidate.id } },
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Edit draft" }));
  }
  fireEvent.click(
    screen.getByRole("button", {
      name: {
        remove: "Remove collaborator",
        revoke: "Revoke",
        resend: "Resend",
        save: "Save collaborator access",
      }[action],
      exact: true,
    }),
  );
  const dialog = await screen.findByRole("dialog");
  const confirm = within(dialog).getByRole("button", {
    name: {
      remove: "Remove collaborator",
      revoke: "Revoke access link",
      resend: "Replace access link",
      save: "Save collaborator access",
    }[action],
    exact: true,
  });
  await waitFor(() =>
    expect((confirm as HTMLButtonElement).disabled).toBe(false),
  );
  return { dialog, confirm };
}
beforeEach(() => {
  transport.mockReset();
  guard.mockReset();
  identity.id = "fictional-manager";
  identity.role = "admin";
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: true,
  });
  current = definition();
  read = defaults;
  transport.mockImplementation((path, options) =>
    options?.method
      ? Promise.resolve(ack(options))
      : Promise.resolve().then(() => read(path)),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("Forms access inventory, review and interruption recovery", () => {
  it("names all four independent loading states without showing false empty inventories", () => {
    transport.mockReturnValue(new Promise(() => {}));
    mount();
    for (const name of [
      "current form access",
      "collaborators",
      "eligible accounts",
      "private links",
    ])
      expect(
        screen.getByRole("status", { name: "Loading " + name }),
      ).toBeTruthy();
    expect(screen.queryByText("No private links have been issued.")).toBeNull();
    expect(writes()).toHaveLength(0);
  });
  it.each([
    ["current form access", (p: string) => !p.includes("?")],
    ["collaborators", (p: string) => p.includes("/collaborators?")],
    ["eligible accounts", (p: string) => p.includes("collaborator-candidates")],
    ["private links", (p: string) => p.includes("/invitations?")],
  ] as const)(
    "retries only the failed %s read and keeps other panels usable",
    async (name, matches) => {
      read = (path) => {
        if (matches(path)) throw Error("Fictional independent read failure");
        return defaults(path);
      };
      mount();
      const retry = await screen.findByRole("button", {
        name: "Retry " + name,
      });
      if (name !== "collaborators")
        await screen.findByText("Fictional collaborator");
      read = defaults;
      transport.mockClear();
      fireEvent.click(retry);
      await waitFor(() =>
        expect(
          screen.queryByText("Fictional independent read failure"),
        ).toBeNull(),
      );
      expect(transport.mock.calls).toHaveLength(1);
      expect(matches(transport.mock.calls[0][0])).toBe(true);
      expect(document.activeElement?.id).toBe("workspace-content");
      expect(writes()).toHaveLength(0);
    },
  );
  it("pages/searches eligible accounts on the server and clears a selection when its result scope changes", async () => {
    read = (path) =>
      path.includes("collaborator-candidates")
        ? inventory([candidate], 135)
        : defaults(path);
    mount();
    await loaded();
    fireEvent.change(
      screen.getByRole("combobox", { name: "Chapter account" }),
      { target: { value: candidate.id } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Next accounts" }));
    await waitFor(() =>
      expect(transport).toHaveBeenCalledWith(
        expect.stringContaining("collaborator-candidates?page=2&q="),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ),
    );
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("");
    fireEvent.change(
      screen.getByRole("textbox", { name: "Search eligible accounts" }),
      { target: { value: "Name & %" } },
    );
    await waitFor(() =>
      expect(transport).toHaveBeenCalledWith(
        expect.stringContaining(
          "collaborator-candidates?page=1&q=Name%20%26%20%25",
        ),
        expect.anything(),
      ),
    );
    expect(writes()).toHaveLength(0);
  });
  it("pages collaborator inventory independently of invitation pages", async () => {
    read = (path) =>
      path.includes("/collaborators?")
        ? inventory([collaborator], 130)
        : defaults(path);
    mount();
    await loaded();
    transport.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Next collaborators" }));
    await waitFor(() => expect(transport.mock.calls).toHaveLength(1));
    expect(transport.mock.calls[0][0]).toContain("/collaborators?page=2");
    expect(writes()).toHaveLength(0);
  });
  it.each(["remove", "revoke", "resend", "save"] as const)(
    "requires a consequence review before %s and sends the exact selected target",
    async (action) => {
      mount();
      await loaded();
      const { dialog, confirm } = await review(action);
      expect(within(dialog).getByText(/Fictional access form/)).toBeTruthy();
      expect(writes()).toHaveLength(0);
      fireEvent.click(confirm);
      await waitFor(() => expect(writes()).toHaveLength(1));
      const [path, options] = writes()[0];
      expect(options.signal).toBeInstanceOf(AbortSignal);
      if (action === "remove") {
        expect(options.method).toBe("DELETE");
        expect(options.body).toEqual({
          userId: collaborator.admin_user_id,
          formRevision: 1,
          grantId: collaborator.grantId,
          grantRevision: 2,
        });
      } else if (action === "save") {
        expect(options.method).toBe("PATCH");
        expect(options.body).toEqual({
          userId: candidate.id,
          formRevision: 1,
          grantId: candidate.grantId,
          grantRevision: 2,
          actions: ["view", "edit"],
        });
      } else {
        expect(path).toContain("/invitations/" + invite.id);
        expect(options.body).toMatchObject({
          action,
          formRevision: 1,
          publishedVersionId: "fictional-published-version",
          revision: 1,
        });
      }
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    },
  );
  it("does not use a substituted form payload to review another form's access", async () => {
    read = (path) =>
      path.includes("?")
        ? defaults(path)
        : { form: { ...current, id: "fictional-substituted-form" } };
    mount();
    await screen.findByText("Fictional collaborator");
    expect(
      (
        screen.getByRole("button", {
          name: "Remove collaborator",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Resend" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(writes()).toHaveLength(0);
  });
  it("cancels a review without any mutation", async () => {
    mount();
    await loaded();
    const { dialog } = await review("remove");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Cancel review" }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(writes()).toHaveLength(0);
  });
  it("freezes inputs, duplicate confirmations and escape while a write is pending", async () => {
    const write = pending<unknown>();
    transport.mockImplementation((path, options) =>
      options?.method ? write.promise : Promise.resolve(read(path)),
    );
    mount();
    await loaded();
    const { dialog, confirm } = await review("remove");
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(writes()).toHaveLength(1);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(
      (
        within(dialog).getByRole("button", {
          name: "Cancel review",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByLabelText(
          "Approved recipient emails",
        ) as HTMLTextAreaElement
      ).matches(":disabled"),
    ).toBe(true);
    await act(async () => write.resolve(ack(writes()[0][1])));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
  it("blocks a changed record and changed form revision after the review's fresh recheck", async () => {
    mount();
    await loaded();
    read = (path) =>
      path.includes("/collaborators?")
        ? inventory([{ ...collaborator, actions: ["view", "edit"] }])
        : defaults(path);
    fireEvent.click(
      screen.getByRole("button", { name: "Remove collaborator" }),
    );
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText(/selected record changed/);
    expect(
      (
        within(dialog).getByRole("button", {
          name: "Remove collaborator",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Cancel review" }),
    );
    read = defaults;
    current = { ...current, revision: 2 };
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    await screen.findByText(/selected link changed/);
    expect(writes()).toHaveLength(0);
  });
  it("clears all private inventories and input on a denied read, and can explicitly recheck access", async () => {
    mount();
    await loaded();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Approved recipient emails" }),
      { target: { value: "fictional-private@example.test" } },
    );
    read = (path) => {
      if (path.includes("/invitations?"))
        throw new ApiFailure(403, "FORBIDDEN", "Fictional revoked access");
      return defaults(path);
    };
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh delivery status" }),
    );
    await screen.findByText("Access management is restricted");
    expect(screen.queryByText("Fictional collaborator")).toBeNull();
    expect(
      screen.queryByDisplayValue("fictional-private@example.test"),
    ).toBeNull();
    read = defaults;
    fireEvent.click(
      screen.getByRole("button", { name: "Retry current access" }),
    );
    await loaded();
    expect(
      (
        screen.getByRole("textbox", {
          name: "Approved recipient emails",
        }) as HTMLTextAreaElement
      ).value,
    ).toBe("");
    expect(writes()).toHaveLength(0);
  });
  it("retains an authorized stale snapshot but disables its write controls after a temporary read failure", async () => {
    mount();
    await loaded();
    read = (path) => {
      if (path.includes("/invitations?")) throw Error("Fictional link outage");
      return defaults(path);
    };
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh delivery status" }),
    );
    await screen.findByText("Fictional link outage");
    expect(screen.getByText(invite.recipientHint)).toBeTruthy();
    expect(screen.getByText(/Last successful private links read/)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Revoke" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
  it("keeps an unknown collaborator result blocked even after inventory refresh", async () => {
    transport.mockImplementation((path, options) =>
      options?.method
        ? Promise.reject(Error("Fictional dropped connection"))
        : Promise.resolve(read(path)),
    );
    mount();
    await loaded();
    const { confirm } = await review("remove");
    fireEvent.click(confirm);
    const recovery = await screen.findByRole("region", {
      name: "Unconfirmed collaborator change",
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh delivery status" }),
    );
    expect(
      screen.getByRole("region", { name: "Unconfirmed collaborator change" }),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Remove collaborator",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      within(recovery)
        .getByRole("button", { name: "Retry identical collaborator change" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(writes()).toHaveLength(1);
  });
  it("isolates account, form and cleared-session changes, aborting old writes and ignoring their late success", async () => {
    const write = pending<unknown>();
    transport.mockImplementation((path, options) =>
      options?.method ? write.promise : Promise.resolve(read(path)),
    );
    const view = mount();
    await loaded();
    const { confirm } = await review("remove");
    fireEvent.click(confirm);
    const signal = writes()[0][1].signal;
    act(() => window.dispatchEvent(new Event("gdg:session-cleared")));
    expect(signal.aborted).toBe(true);
    await act(async () => write.resolve(ack(writes()[0][1])));
    expect(screen.queryByText("Collaborator access removed.")).toBeNull();
    await loaded();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Approved recipient emails" }),
      { target: { value: "fictional-old@example.test" } },
    );
    identity.id = "fictional-new-account";
    view.rerender(
      <main id="workspace-content" tabIndex={-1}>
        <AccessPanel form={current} />
      </main>,
    );
    await loaded();
    expect(screen.queryByDisplayValue("fictional-old@example.test")).toBeNull();
    current = definition("fictional-next-form");
    view.rerender(
      <main id="workspace-content" tabIndex={-1}>
        <AccessPanel form={current} />
      </main>,
    );
    await waitFor(() =>
      expect(transport).toHaveBeenCalledWith(
        "/admin/forms/fictional-next-form",
        expect.anything(),
      ),
    );
  });
  it("keeps offline recipients in the open tab and never writes on reconnect", async () => {
    mount();
    await loaded();
    const input = screen.getByRole("textbox", {
      name: "Approved recipient emails",
    });
    fireEvent.change(input, {
      target: { value: "fictional-draft@example.test" },
    });
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    act(() => window.dispatchEvent(new Event("offline")));
    expect(
      (
        screen.getByRole("button", {
          name: "Remove collaborator",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect((input as HTMLTextAreaElement).value).toBe(
      "fictional-draft@example.test",
    );
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    act(() => window.dispatchEvent(new Event("online")));
    expect(writes()).toHaveLength(0);
    expect(guard).toHaveBeenLastCalledWith(
      true,
      expect.objectContaining({ busy: false }),
    );
  });
  it("aborts an obsolete candidate search and ignores a late result in the new search", async () => {
    const old = pending<ReturnType<typeof inventory<typeof candidate>>>();
    read = (path) =>
      path.includes("collaborator-candidates") ? old.promise : defaults(path);
    mount();
    await screen.findByText("Fictional collaborator");
    const signal = transport.mock.calls.find(([path]) =>
      path.includes("collaborator-candidates"),
    )![1].signal;
    read = defaults;
    fireEvent.change(
      screen.getByRole("textbox", { name: "Search eligible accounts" }),
      { target: { value: "fresh" } },
    );
    await screen.findByRole("option", { name: /Fictional eligible account/ });
    expect(signal.aborted).toBe(true);
    await act(async () =>
      old.resolve(
        inventory([{ ...candidate, display_name: "Obsolete private account" }]),
      ),
    );
    expect(
      screen.queryByRole("option", { name: /Obsolete private account/ }),
    ).toBeNull();
  });
  it("fails closed for writes when current form context has no server revision", async () => {
    read = (path) =>
      path.includes("?")
        ? defaults(path)
        : { form: { ...current, revision: undefined } };
    mount();
    await screen.findByText("Fictional collaborator");
    await waitFor(() =>
      expect(
        screen.queryByRole("status", { name: "Loading current form access" }),
      ).toBeNull(),
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Remove collaborator",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(writes()).toHaveLength(0);
  });
  it("conceals a review when its fresh context no longer grants access management", async () => {
    mount();
    await loaded();
    current = { ...current, actions: ["view"] };
    fireEvent.click(
      screen.getByRole("button", { name: "Remove collaborator" }),
    );
    await screen.findByText("Access management is restricted");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(writes()).toHaveLength(0);
  });
  it("keeps an uncertain approved audience frozen across inventory refresh", async () => {
    transport.mockImplementation((path, options) =>
      options?.method
        ? Promise.reject(Error("Fictional uncertain queue"))
        : Promise.resolve(read(path)),
    );
    mount();
    await loaded();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Approved recipient emails" }),
      { target: { value: "fictional-recipient@example.test" } },
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: /I approve these recipients/ }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Review private links" }),
    );
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Queue approved private links",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Queue approved private links" }),
    );
    await screen.findByRole("region", {
      name: "Unconfirmed private link change",
    });
    const original = writes()[0][1];
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh delivery status" }),
    );
    expect(writes()).toHaveLength(1);
    expect(original.body.recipients).toEqual([
      "fictional-recipient@example.test",
    ]);
    expect(original.body.expiresAt).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Review private links",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
  it("does not let an obsolete CSV read overwrite newer typed recipients", async () => {
    mount();
    await loaded();
    const text = pending<string>();
    const file = new File(["fictional-import@example.test"], "fictional.csv", {
      type: "text/csv",
    });
    Object.defineProperty(file, "text", { value: () => text.promise });
    fireEvent.change(screen.getByLabelText("Import email CSV"), {
      target: { files: [file] },
    });
    const recipients = screen.getByRole("textbox", {
      name: "Approved recipient emails",
    });
    fireEvent.change(recipients, {
      target: { value: "fictional-typed@example.test" },
    });
    await act(async () => text.resolve("fictional-import@example.test"));
    expect((recipients as HTMLTextAreaElement).value).toBe(
      "fictional-typed@example.test",
    );
    expect(writes()).toHaveLength(0);
  });
  it("passes structural axe checks for the loaded editor and consequence review", async () => {
    const view = mount();
    await loaded();
    expect(
      (
        await axe.run(view.container, {
          rules: { "color-contrast": { enabled: false } },
        })
      ).violations.map((v) => v.id),
    ).toEqual([]);
    const { dialog } = await review("remove");
    expect(
      (
        await axe.run(dialog, {
          rules: { "color-contrast": { enabled: false } },
        })
      ).violations.map((v) => v.id),
    ).toEqual([]);
  });
});

describe("Collaborator original-request reconciliation", () => {
  let loss: "before" | "after" | "none",
    commitCount: number,
    receipts: Map<
      string,
      { formId: string; userId: string; action: "save" | "remove" }
    >,
    grant: { id: string; revision: number; actions: string[] } | null,
    inspectFailure: Error | undefined;
  const inspection = (key: string) => ({
    committed: receipts.has(key),
    canRetry: !receipts.has(key),
    formId: current.id,
    userId: candidate.id,
    formRevision: current.revision,
    canSave: true,
    canRemove: !!grant,
    allowedActions: current.actions,
    grant,
    receipt: receipts.get(key) || null,
  });
  beforeEach(() => {
    loss = "none";
    commitCount = 0;
    receipts = new Map();
    grant = { id: candidate.grantId, revision: 2, actions: ["view"] };
    inspectFailure = undefined;
    transport.mockImplementation(async (path, options = {}) => {
      if (path.includes("/collaborators/recovery")) {
        if (inspectFailure) throw inspectFailure;
        return inspection(options.idempotencyKey);
      }
      if (options.method && path.endsWith("/collaborators")) {
        if (loss === "before") {
          loss = "none";
          throw Error("Fictional before-dispatch loss");
        }
        if (!receipts.has(options.idempotencyKey)) {
          commitCount++;
          grant =
            options.method === "DELETE"
              ? null
              : {
                  id: candidate.grantId,
                  revision: 3,
                  actions: options.body.actions,
                };
          receipts.set(options.idempotencyKey, {
            formId: current.id,
            userId: candidate.id,
            action: options.method === "DELETE" ? "remove" : "save",
          });
        }
        if (loss === "after") {
          loss = "none";
          throw Error("Fictional acknowledgement loss");
        }
        return inspection(options.idempotencyKey);
      }
      return read(path);
    });
  });
  async function start(
    action: "remove" | "save",
    kind: "before" | "after" = "before",
  ) {
    loss = kind;
    mount();
    await loaded();
    const { confirm } = await review(action);
    fireEvent.click(confirm);
    return screen.findByRole("region", {
      name: "Unconfirmed collaborator change",
    });
  }
  const press = (name: string) =>
    fireEvent.click(screen.getByRole("button", { name, exact: true }));
  it.each(["remove", "save"] as const)(
    "reconciles accepted %s by read only without replaying",
    async (action) => {
      await start(action, "after");
      expect(commitCount).toBe(1);
      press("Check original collaborator outcome");
      await waitFor(() =>
        expect(
          screen.queryByRole("region", {
            name: "Unconfirmed collaborator change",
          }),
        ).toBeNull(),
      );
      expect(writes()).toHaveLength(1);
      expect(commitCount).toBe(1);
    },
  );
  it.each(["remove", "save"] as const)(
    "retries unaccepted %s with the identical original key and versioned body",
    async (action) => {
      await start(action);
      const original = writes()[0][1];
      press("Check original collaborator outcome");
      const retry = await screen.findByRole("button", {
        name: "Retry identical collaborator change",
      });
      await waitFor(() =>
        expect((retry as HTMLButtonElement).disabled).toBe(false),
      );
      fireEvent.click(retry);
      fireEvent.click(retry);
      await waitFor(() =>
        expect(
          screen.queryByRole("region", {
            name: "Unconfirmed collaborator change",
          }),
        ).toBeNull(),
      );
      expect(writes()).toHaveLength(2);
      expect(writes()[1][1].body).toEqual(original.body);
      expect(writes()[1][1].idempotencyKey).toBe(original.idempotencyKey);
      expect(commitCount).toBe(1);
    },
  );
  it.each(["revision", "generation", "form", "actions"] as const)(
    "blocks a stale %s after original-outcome inspection",
    async (change) => {
      await start("save");
      if (change === "revision") grant = { ...grant!, revision: 3 };
      if (change === "generation")
        grant = { ...grant!, id: "fictional-recreated-grant" };
      if (change === "form") current = { ...current, revision: 2 };
      if (change === "actions")
        current = { ...current, actions: ["view", "manage_access"] };
      press("Check original collaborator outcome");
      await screen.findByText(/target is no longer ready/);
      expect(
        (
          screen.getByRole("button", {
            name: "Retry identical collaborator change",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
      expect(writes()).toHaveLength(1);
    },
  );
  it("requires another inspection after a second acknowledgement loss", async () => {
    await start("save");
    press("Check original collaborator outcome");
    const retry = screen.getByRole("button", {
      name: "Retry identical collaborator change",
    });
    await waitFor(() =>
      expect((retry as HTMLButtonElement).disabled).toBe(false),
    );
    loss = "after";
    fireEvent.click(retry);
    await screen.findByText("Fictional acknowledgement loss");
    expect((retry as HTMLButtonElement).disabled).toBe(true);
    expect(commitCount).toBe(1);
    press("Check original collaborator outcome");
    await waitFor(() =>
      expect(
        screen.queryByRole("region", {
          name: "Unconfirmed collaborator change",
        }),
      ).toBeNull(),
    );
    expect(writes()).toHaveLength(2);
  });
  it.each([401, 403, 404])(
    "clears private inventories and the frozen proposal on recovery denial %s",
    async (status) => {
      await start("save");
      inspectFailure = new ApiFailure(status, "NOT_FOUND", "Fictional denial");
      press("Check original collaborator outcome");
      await screen.findByText("Access management is restricted");
      expect(screen.queryByText(candidate.display_name)).toBeNull();
      expect(
        screen.queryByRole("region", {
          name: "Unconfirmed collaborator change",
        }),
      ).toBeNull();
      expect(writes()).toHaveLength(1);
    },
  );
  it("keeps recovery after a temporary check failure and sends nothing automatically", async () => {
    await start("remove");
    inspectFailure = Error("Fictional inspection outage");
    press("Check original collaborator outcome");
    await screen.findByText("Fictional inspection outage");
    expect(
      screen.getByRole("region", { name: "Unconfirmed collaborator change" }),
    ).toBeTruthy();
    expect(writes()).toHaveLength(1);
    expect(commitCount).toBe(0);
  });
  it("requires a reviewed stop before releasing the original request and refreshing inventories", async () => {
    await start("save");
    press("Stop tracking this collaborator change");
    await waitFor(() =>
      expect(
        screen.queryByRole("region", {
          name: "Unconfirmed collaborator change",
        }),
      ).toBeNull(),
    );
    await loaded();
    expect(commitCount).toBe(0);
    expect(writes()).toHaveLength(1);
  });
  it("aborts a pending write when offline, exposes recovery and does not replay on reconnect", async () => {
    const deferred = pending<unknown>();
    transport.mockImplementation((path, options) =>
      options?.method ? deferred.promise : Promise.resolve(read(path)),
    );
    mount();
    await loaded();
    const { confirm } = await review("save");
    fireEvent.click(confirm);
    const signal = writes()[0][1].signal;
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    act(() => window.dispatchEvent(new Event("offline")));
    await screen.findByRole("region", {
      name: "Unconfirmed collaborator change",
    });
    expect(signal.aborted).toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull();
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    act(() => window.dispatchEvent(new Event("online")));
    await act(async () => deferred.resolve(ack(writes()[0][1])));
    expect(writes()).toHaveLength(1);
    expect(
      screen.getByRole("region", { name: "Unconfirmed collaborator change" }),
    ).toBeTruthy();
  });
  it("keeps the retry window bounded and never inspects or writes after expiry", async () => {
    await start("save");
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 48 * 60 * 60 * 1000);
    press("Check original collaborator outcome");
    await screen.findByText(/safe retry window ended/);
    expect(
      transport.mock.calls.filter(([p]) => p.includes("/recovery")),
    ).toHaveLength(0);
    expect(writes()).toHaveLength(1);
  });
});
