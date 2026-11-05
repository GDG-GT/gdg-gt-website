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
  },
  collaborator = {
    admin_user_id: "fictional-peer",
    display_name: "Fictional collaborator",
    actions: ["view"],
    updated_at: "2026-11-04T12:00:00Z",
  },
  invite = {
    id: "fictional-link",
    recipientHint: "fi…@example.test",
    delivery_state: "sent",
    responded: false,
    revoked_at: null,
    expires_at: "2099-11-04T12:00:00Z",
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
      ? Promise.resolve({ updated: true })
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
        expect(options.body).toEqual({ userId: collaborator.admin_user_id });
      } else if (action === "save") {
        expect(options.method).toBe("PATCH");
        expect(options.body).toEqual({
          userId: candidate.id,
          actions: ["view", "edit"],
        });
      } else {
        expect(path).toContain("/invitations/" + invite.id);
        expect(options.body).toEqual({ action });
      }
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    },
  );
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
    await act(async () => write.resolve({ updated: true }));
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
    await screen.findByText(/selected record changed/);
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
  it("keeps a failed write in review and requires a read-only recheck after an uncertain result", async () => {
    transport.mockImplementation((path, options) =>
      options?.method
        ? Promise.reject(Error("Fictional dropped connection"))
        : Promise.resolve(read(path)),
    );
    mount();
    await loaded();
    const { dialog, confirm } = await review("remove");
    fireEvent.click(confirm);
    await within(dialog).findByText("Fictional dropped connection");
    expect(
      (
        within(dialog).getByRole("button", {
          name: "Remove collaborator",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(writes()).toHaveLength(1);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Recheck review" }),
    );
    await waitFor(() =>
      expect(
        (
          within(dialog).getByRole("button", {
            name: "Remove collaborator",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
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
    await act(async () => write.resolve({ updated: true }));
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
  it("keeps exact invitation retry identity after an uncertain result and never resends on refresh", async () => {
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
    const approval = screen.getByRole("checkbox", {
      name: /I approve these recipients/,
    });
    fireEvent.click(approval);
    const button = screen.getByRole("button", { name: "Queue private links" });
    fireEvent.click(button);
    await screen.findByText("Fictional uncertain queue");
    const first = writes()[0][1];
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Recheck access inventories" }),
    );
    await waitFor(() =>
      expect((button as HTMLButtonElement).disabled).toBe(false),
    );
    expect(writes()).toHaveLength(1);
    fireEvent.click(button);
    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(writes()[1][1].idempotencyKey).toBe(first.idempotencyKey);
    expect(writes()[1][1].body).toEqual(first.body);
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
