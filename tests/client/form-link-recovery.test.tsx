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
import PrivateFormLinks from "../../src/ui/forms/PrivateFormLinks";
import { createTemplate } from "../../shared/forms";
import {
  prepareLinkWrite,
  inspectLinkWrite,
  type PrivateFormLink,
  type LinkAction,
  type LinkReceipt,
} from "../../src/ui/forms/form-link-api";
import { ApiFailure } from "../../src/lib/api";
const { transport, guard } = vi.hoisted(() => ({
  transport: vi.fn(),
  guard: vi.fn(),
}));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: transport,
}));
vi.mock("@/hooks/useDraftGuard", () => ({ useDraftGuard: guard }));
const formId = "fictional-link-form",
  targetId = "fictional-link",
  root = "/admin/forms/" + formId + "/invitations",
  versionId = "fictional-published-version";
const initialForm = () => {
  const f = {
    ...createTemplate("Fictional private-link form", "blank"),
    id: formId,
    revision: 1,
    actions: ["view", "manage_access"],
    status: "Open" as const,
  };
  f.settings.access = "invited";
  f.versions = [
    {
      version: 1,
      versionId,
      title: f.title,
      description: f.description,
      fields: f.fields,
      sections: f.sections,
      settings: { ...f.settings },
      publishedAt: "2026-11-05T12:00:00Z",
    },
  ];
  return f;
};
const seed = (): PrivateFormLink => ({
  id: targetId,
  token_type: "invited",
  revision: 2,
  recipientHint: "fi…@example.test",
  responded: false,
  revoked_at: null,
  last_sent_at: null,
  expires_at: "2099-11-05T12:00:00Z",
  delivery_state: "sent",
});
type Options = {
  method?: string;
  body?: Record<string, unknown>;
  idempotencyKey?: string;
  signal?: AbortSignal;
};
let form: ReturnType<typeof initialForm>,
  rows: PrivateFormLink[],
  loss: "before" | "after" | "none",
  commits: number,
  receipts: Map<string, LinkReceipt>,
  readFailure: Error | undefined,
  inspectFailure: Error | undefined,
  writeFailure: Error | undefined,
  malformed: boolean;
const handlers = {
  onRecheck: vi.fn(),
  onDenied: vi.fn(),
  onStateChange: vi.fn(),
};
function props() {
  return { form, contextReady: true, disabled: false, ...handlers };
}
function mount() {
  return render(
    <main id="workspace-content" tabIndex={-1}>
      <PrivateFormLinks {...props()} />
    </main>,
  );
}
const writes = () => transport.mock.calls.filter(([, o]) => o?.method);
function click(name: string) {
  fireEvent.click(screen.getByRole("button", { name, exact: true }));
}
async function review(action: LinkAction) {
  await screen.findByText("fi…@example.test");
  if (action === "create") {
    fireEvent.change(screen.getByLabelText("Approved recipient emails"), {
      target: { value: "fictional-approved@example.test" },
    });
    fireEvent.click(
      screen.getByRole("checkbox", { name: /I approve these recipients/ }),
    );
    click("Review private links");
  } else click(action === "resend" ? "Resend" : "Revoke");
  const dialog = await screen.findByRole("dialog"),
    button = within(dialog).getByRole("button", {
      name:
        action === "create"
          ? "Queue approved private links"
          : action === "resend"
            ? "Replace access link"
            : "Revoke access link",
      exact: true,
    });
  await waitFor(() =>
    expect((button as HTMLButtonElement).disabled).toBe(false),
  );
  return { dialog, button };
}
async function start(action: LinkAction, where: "before" | "after" = "before") {
  loss = where;
  mount();
  const { button } = await review(action);
  fireEvent.click(button);
  return screen.findByRole("region", {
    name: "Unconfirmed private link change",
  });
}
beforeEach(() => {
  form = initialForm();
  rows = [seed()];
  loss = "none";
  commits = 0;
  receipts = new Map();
  readFailure = undefined;
  inspectFailure = undefined;
  writeFailure = undefined;
  malformed = false;
  transport.mockReset();
  guard.mockReset();
  Object.values(handlers).forEach((f) => f.mockReset());
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: true,
  });
  transport.mockImplementation(async (path: string, o: Options = {}) => {
    if (path.includes("/recovery")) {
      if (inspectFailure) throw inspectFailure;
      const q = new URL("https://example.test" + path).searchParams,
        action = q.get("action") as LinkAction,
        sourceId = q.get("sourceId"),
        target = rows.find((r) => r.id === sourceId),
        receipt = receipts.get(o.idempotencyKey!) || null;
      return {
        formId,
        sourceId,
        action,
        committed: !!receipt,
        canRetry: !receipt,
        formRevision: form.revision,
        publishedVersionId: form.versions.at(-1)?.versionId || null,
        accessType: form.settings.access,
        archived: form.status === "Archived",
        target: target
          ? {
              id: target.id,
              revision: target.revision,
              type: target.token_type,
              responded: target.responded,
              revoked: !!target.revoked_at,
              expiresAt: target.expires_at,
              cooldownUntil: null,
            }
          : null,
        receipt,
      };
    }
    if (!o.method) {
      if (readFailure) throw readFailure;
      return {
        items: rows.map((r) => ({ ...r })),
        total: rows.length,
        page: 1,
        pageSize: 30,
      };
    }
    if (writeFailure) throw writeFailure;
    if (loss === "before") {
      loss = "none";
      throw Error("Fictional before-dispatch link loss");
    }
    const action = path === root ? "create" : (o.body!.action as LinkAction),
      sourceId = action === "create" ? null : targetId;
    if (!receipts.has(o.idempotencyKey!)) {
      commits++;
      const r = {
        formId,
        sourceId,
        action,
        queued: action === "revoke" ? 0 : 1,
        existing: 0,
        total: 1,
      };
      receipts.set(o.idempotencyKey!, r);
      if (action === "create")
        rows = [
          ...rows,
          {
            ...seed(),
            id: "fictional-created-link",
            revision: 1,
            recipientHint: "ap…@example.test",
          },
        ];
      else
        rows = rows.map((row) =>
          row.id === targetId
            ? {
                ...row,
                revision: row.revision + 1,
                ...(action === "revoke"
                  ? {
                      revoked_at: new Date().toISOString(),
                      delivery_state: "revoked",
                    }
                  : {
                      expires_at: o.body!.expiresAt as string,
                      last_sent_at: new Date().toISOString(),
                      delivery_state: "pending",
                    }),
              }
            : row,
        );
    }
    if (loss === "after") {
      loss = "none";
      throw Error("Fictional private-link acknowledgement loss");
    }
    return malformed
      ? { ...receipts.get(o.idempotencyKey!), formId: "substituted-form" }
      : receipts.get(o.idempotencyKey!);
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("Private-link original-request lifecycle recovery", () => {
  it.each(["create", "resend", "revoke"] as const)(
    "reviews %s consequences and current context before any write",
    async (action) => {
      mount();
      const { dialog } = await review(action);
      expect(writes()).toHaveLength(0);
      expect(within(dialog).getByText(/Reviewed form revision 1/)).toBeTruthy();
      if (action === "create")
        expect(
          within(dialog).getByText("fictional-approved@example.test"),
        ).toBeTruthy();
      click("Cancel review");
      expect(writes()).toHaveLength(0);
    },
  );
  for (const action of ["create", "resend", "revoke"] as const)
    for (const where of ["before", "after"] as const)
      it(`recovers ${action} ${where}-acceptance loss using only original intent`, async () => {
        await start(action, where);
        const original = writes()[0][1];
        expect(handlers.onStateChange).toHaveBeenLastCalledWith({
          dirty: true,
          busy: false,
          uncertain: true,
        });
        click("Refresh delivery status");
        expect(writes()).toHaveLength(1);
        click("Check original private link outcome");
        if (where === "before") {
          await screen.findByText(/No committed receipt was found/);
          click("Retry identical private link change");
        }
        await waitFor(() =>
          expect(
            screen.queryByRole("region", {
              name: "Unconfirmed private link change",
            }),
          ).toBeNull(),
        );
        expect(commits).toBe(1);
        expect(writes()).toHaveLength(where === "before" ? 2 : 1);
        if (where === "before") {
          expect(writes()[1][1].body).toEqual(original.body);
          expect(writes()[1][1].idempotencyKey).toBe(original.idempotencyKey);
        }
        expect(handlers.onRecheck).toHaveBeenCalled();
      });
  it("requires another outcome check after a second acknowledgement loss", async () => {
    await start("resend");
    click("Check original private link outcome");
    await screen.findByText(/No committed receipt was found/);
    loss = "after";
    click("Retry identical private link change");
    await screen.findByText("Fictional private-link acknowledgement loss");
    expect(
      (
        screen.getByRole("button", {
          name: "Retry identical private link change",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    click("Check original private link outcome");
    await waitFor(() =>
      expect(
        screen.queryByRole("region", {
          name: "Unconfirmed private link change",
        }),
      ).toBeNull(),
    );
    expect(commits).toBe(1);
    expect(writes()).toHaveLength(2);
  });
  it.each(["revision", "version", "form", "expired"] as const)(
    "blocks a stale %s during unaccepted recovery",
    async (change) => {
      await start("resend");
      if (change === "revision") rows = [{ ...rows[0], revision: 3 }];
      if (change === "version")
        form = {
          ...form,
          versions: [
            { ...form.versions[0], versionId: "fictional-later-publication" },
          ],
        };
      if (change === "form") form = { ...form, revision: 2 };
      if (change === "expired")
        vi.spyOn(Date, "now").mockReturnValue(Date.now() + 8 * 86400000);
      click("Check original private link outcome");
      if (change === "expired")
        await screen.findByText(/safe retry window ended/);
      else await screen.findByText(/target is no longer ready/);
      expect(
        (
          screen.getByRole("button", {
            name: "Retry identical private link change",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
      expect(writes()).toHaveLength(1);
    },
  );
  it.each([401, 403, 404])(
    "clears the approved audience and every private row on inspection denial %s",
    async (status) => {
      await start("create");
      inspectFailure = new ApiFailure(
        status,
        "NOT_FOUND",
        "Fictional denied private links",
      );
      click("Check original private link outcome");
      await waitFor(() => expect(handlers.onDenied).toHaveBeenCalledOnce());
      expect(screen.queryByText("fi…@example.test")).toBeNull();
      expect(
        screen.queryByRole("region", {
          name: "Unconfirmed private link change",
        }),
      ).toBeNull();
      expect(
        screen.queryByDisplayValue("fictional-approved@example.test"),
      ).toBeNull();
    },
  );
  it("retains proposal and current rows on a temporary read failure while pausing dependent changes", async () => {
    mount();
    await screen.findByText("fi…@example.test");
    fireEvent.change(screen.getByLabelText("Approved recipient emails"), {
      target: { value: "fictional-kept@example.test" },
    });
    readFailure = Error("Fictional private-link read outage");
    click("Refresh delivery status");
    await screen.findByText("Fictional private-link read outage");
    expect(
      screen.getByDisplayValue("fictional-kept@example.test"),
    ).toBeTruthy();
    expect(screen.getByText("fi…@example.test")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Resend" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    readFailure = undefined;
    click("Retry private links");
    await waitFor(() =>
      expect(
        screen.queryByText("Fictional private-link read outage"),
      ).toBeNull(),
    );
    expect(writes()).toHaveLength(0);
  });
  it("clears current denied inventory and reports parent denial", async () => {
    mount();
    await screen.findByText("fi…@example.test");
    readFailure = new ApiFailure(403, "FORBIDDEN", "Fictional revoked access");
    click("Refresh delivery status");
    await waitFor(() => expect(handlers.onDenied).toHaveBeenCalledOnce());
    expect(screen.queryByText("fi…@example.test")).toBeNull();
  });
  it("keeps malformed acknowledgements unconfirmed and reconciles the actual original receipt", async () => {
    malformed = true;
    await start("revoke", "after");
    click("Check original private link outcome");
    await waitFor(() =>
      expect(
        screen.queryByRole("region", {
          name: "Unconfirmed private link change",
        }),
      ).toBeNull(),
    );
    expect(commits).toBe(1);
  });
  it("disables verified-email token lifecycle controls and respects resend cooldown", async () => {
    rows = [{ ...seed(), token_type: "verified" }];
    const v = mount();
    await screen.findByText("fi…@example.test");
    expect(
      (screen.getByRole("button", { name: "Resend" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Revoke" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    rows = [{ ...seed(), last_sent_at: new Date().toISOString() }];
    v.unmount();
    mount();
    await screen.findByText("fi…@example.test");
    expect(
      (screen.getByRole("button", { name: "Resend" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Revoke" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });
  it("requires reviewed stopping and fresh inventory before releasing original intent", async () => {
    await start("create");
    click("Stop tracking this private link change");
    await waitFor(() =>
      expect(
        screen.queryByRole("region", {
          name: "Unconfirmed private link change",
        }),
      ).toBeNull(),
    );
    expect(
      screen.queryByDisplayValue("fictional-approved@example.test"),
    ).toBeNull();
    expect(commits).toBe(0);
    expect(writes()).toHaveLength(1);
  });
  it("requires current publication metadata and exact explicit scope for preparation", () => {
    const bad = {
      ...form,
      versions: [{ ...form.versions[0], versionId: undefined }],
    };
    expect(() =>
      prepareLinkWrite(bad, "create", undefined, ["fictional@example.test"]),
    ).toThrow(/Reload the current form/);
    expect(() =>
      prepareLinkWrite(form, "resend", { ...seed(), token_type: "verified" }),
    ).toThrow();
    expect(() =>
      prepareLinkWrite(form, "create", undefined, ["invalid"]),
    ).toThrow();
  });
  it("freezes absolute expiry and the normalized exact audience independently of later edits", () => {
    const addresses = [" Fictional@Example.test ", "fictional@example.test"];
    const i = prepareLinkWrite(form, "create", undefined, addresses, 3);
    addresses[0] = "later@example.test";
    const b = JSON.parse(i.body);
    expect(b.recipients).toEqual(["fictional@example.test"]);
    expect(Date.parse(b.expiresAt)).toBeGreaterThan(
      Date.now() + 2.99 * 86400000,
    );
    expect(Object.isFrozen(i)).toBe(true);
  });
  it("rejects substituted accepted outcome metadata without approving a retry", async () => {
    const i = prepareLinkWrite(form, "revoke", seed());
    transport.mockResolvedValue({
      formId: "wrong",
      committed: true,
      receipt: {
        formId,
        sourceId: targetId,
        action: "revoke",
        queued: 0,
        existing: 0,
        total: 1,
      },
    });
    await expect(inspectLinkWrite(i)).rejects.toMatchObject({
      code: "UNCONFIRMED_LINK",
    });
  });
});
