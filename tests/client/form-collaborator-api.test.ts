import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  prepareCollaboratorWrite,
  inspectCollaboratorWrite,
  submitCollaboratorWrite,
  validGrantVersion,
  collaboratorRetryReady,
  type CollaboratorInspection,
} from "../../src/ui/forms/form-collaborator-api";
const { transport } = vi.hoisted(() => ({ transport: vi.fn() }));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("../../src/lib/api")>()),
  api: transport,
}));
const create = () =>
  prepareCollaboratorWrite(
    "fictional-form",
    "fictional-peer",
    "Fictional peer",
    "save",
    3,
    { grantId: null, grantRevision: 0 },
    ["view"],
  );
const current = (): CollaboratorInspection => ({
  committed: false,
  canRetry: true,
  formId: "fictional-form",
  userId: "fictional-peer",
  formRevision: 3,
  canSave: true,
  canRemove: false,
  allowedActions: ["view", "edit"],
  grant: null,
  receipt: null,
});
beforeEach(() => transport.mockReset());
describe("Versioned collaborator request projection", () => {
  it("freezes the original permission array, body, key and target independently of later proposals", () => {
    const actions = ["view"];
    const v = prepareCollaboratorWrite(
      "fictional-form",
      "fictional-peer",
      "Fictional peer",
      "save",
      3,
      { grantId: null, grantRevision: 0 },
      actions,
    );
    actions.push("edit");
    expect(JSON.parse(v.body)).toEqual({
      userId: "fictional-peer",
      formRevision: 3,
      grantId: null,
      grantRevision: 0,
      actions: ["view"],
    });
    expect(Object.isFrozen(v)).toBe(true);
    expect(v.key).toBeTruthy();
  });
  it.each([
    { grantId: null, grantRevision: 1 },
    { grantId: "fictional-grant", grantRevision: 0 },
    { grantId: "", grantRevision: 1 },
    { grantId: null, grantRevision: -1 },
    { grantId: "fictional-grant", grantRevision: 1.5 },
  ])("rejects malformed reviewed grant versions", (grant) => {
    expect(validGrantVersion(grant)).toBe(false);
    expect(() =>
      prepareCollaboratorWrite("f", "u", "Fictional", "save", 1, grant, [
        "view",
      ]),
    ).toThrow(/Reload the current grant/);
  });
  it("rejects removal without an existing generation and invalid form revisions", () => {
    expect(() =>
      prepareCollaboratorWrite("f", "u", "Fictional", "remove", 1, {
        grantId: null,
        grantRevision: 0,
      }),
    ).toThrow();
    expect(() =>
      prepareCollaboratorWrite(
        "f",
        "u",
        "Fictional",
        "save",
        0,
        { grantId: null, grantRevision: 0 },
        ["view"],
      ),
    ).toThrow();
  });
  it("supports current missing grants without inventing a prior generation", () => {
    expect(collaboratorRetryReady(create(), current())).toBe(true);
    expect(collaboratorRetryReady(create())).toBe(false);
    expect(
      collaboratorRetryReady(create(), { ...current(), canRetry: false }),
    ).toBe(false);
  });
  it.each([
    ["wrong form", { formId: "wrong" }],
    ["wrong recipient", { userId: "wrong" }],
    ["missing actions", { allowedActions: undefined }],
    ["invalid grant", { grant: { id: "", revision: 1, actions: ["view"] } }],
    [
      "wrong receipt",
      {
        committed: true,
        receipt: { formId: "wrong", userId: "fictional-peer", action: "save" },
      },
    ],
    [
      "unaccepted receipt",
      {
        receipt: {
          formId: "fictional-form",
          userId: "fictional-peer",
          action: "save",
        },
      },
    ],
  ])("rejects malformed recovery %s", async (_name, patch) => {
    transport.mockResolvedValue({ ...current(), ...patch });
    await expect(inspectCollaboratorWrite(create())).rejects.toMatchObject({
      code: "UNCONFIRMED_GRANT",
    });
  });
  it("rejects a success response without a committed receipt", async () => {
    transport.mockResolvedValue(current());
    await expect(submitCollaboratorWrite(create())).rejects.toMatchObject({
      code: "UNCONFIRMED_GRANT",
    });
  });
  it("accepts an old minimal committed receipt alongside a later current grant", async () => {
    const intent = create(),
      r = {
        ...current(),
        committed: true,
        canRetry: false,
        grant: {
          id: "fictional-new-generation",
          revision: 1,
          actions: ["view", "edit"],
        },
        receipt: {
          formId: intent.formId,
          userId: intent.userId,
          action: intent.action,
        },
      };
    transport.mockResolvedValue(r);
    await expect(inspectCollaboratorWrite(intent)).resolves.toEqual(r);
    expect(collaboratorRetryReady(intent, r)).toBe(false);
  });
  it("removes only the reviewed generation without action injection", async () => {
    const intent = prepareCollaboratorWrite(
      "fictional-form",
      "fictional-peer",
      "Fictional",
      "remove",
      3,
      { grantId: "fictional-generation", grantRevision: 2 },
      ["view"],
    );
    expect(JSON.parse(intent.body)).not.toHaveProperty("actions");
    const r = {
      ...current(),
      committed: true,
      receipt: {
        formId: intent.formId,
        userId: intent.userId,
        action: intent.action,
      },
    };
    transport.mockResolvedValue(r);
    await submitCollaboratorWrite(intent);
    expect(transport).toHaveBeenCalledWith(
      "/admin/forms/fictional-form/collaborators",
      expect.objectContaining({
        method: "DELETE",
        idempotencyKey: intent.key,
        body: JSON.parse(intent.body),
      }),
    );
  });
});
