import { describe, it, expect } from "vitest";
import { formCollaboratorRoutes } from "../../server/form-collaborators.mjs";
import { tokenHash } from "../../server/lib/security.mjs";
import { fixture, ids } from "./form-routes-fixture.mjs";
const root = `/admin/forms/${ids.form}/collaborators`;
const initial = {
  userId: ids.peer,
  formRevision: 3,
  grantId: null,
  grantRevision: 0,
  actions: ["view", "edit"],
};
const existing = {
  userId: ids.peer,
  formRevision: 3,
  grantId: ids.access,
  grantRevision: 2,
};
const snapshot = (action = "save") => ({
  committed: true,
  canRetry: false,
  formId: ids.form,
  userId: ids.peer,
  formRevision: 3,
  canSave: true,
  canRemove: true,
  allowedActions: ["view", "edit"],
  grant: { id: ids.access, revision: 3, actions: ["view"] },
  receipt: { formId: ids.form, userId: ids.peer, action },
  email: "private@example.test",
  password: "private",
  answers: ["private"],
});
describe("Collaborator original-request API contracts", () => {
  it("ignores unrelated routes and limits recovery to read-only GET", async () => {
    const f = fixture();
    expect(
      await formCollaboratorRoutes(
        { url: "/api/v1/unrelated" },
        {},
        { config: f.config },
      ),
    ).toBe(false);
    expect(
      (await f.call(root + "/recovery", "PATCH", initial)).statusCode,
    ).toBe(405);
  });
  it.each(["view", "manage_access"])(
    "requires current %s authority before all recovery or inventory metadata",
    async (action) => {
      const f = fixture();
      f.results.set("can_operate_form", ({ p_action }) => p_action !== action);
      expect((await f.call(root)).statusCode).toBe(404);
      expect(
        (await f.call(root + `/recovery?action=save&userId=${ids.peer}`))
          .statusCode,
      ).toBe(404);
      expect(f.db.rpc.mock.calls.some(([n]) => n.startsWith("inspect_"))).toBe(
        false,
      );
    },
  );
  it("binds reviewed create to current session and normalized original body hash", async () => {
    const f = fixture();
    const r = await f.call(root, "PATCH", initial);
    expect(r.statusCode).toBe(200);
    expect(f.db.rpc).toHaveBeenLastCalledWith(
      "mutate_form_collaborator_write",
      expect.objectContaining({
        p_actor: ids.actor,
        p_session: ids.session,
        p_form: ids.form,
        p_user: ids.peer,
        p_action: "save",
        p_key_hash: tokenHash(f.key),
        p_request_hash: tokenHash(
          JSON.stringify({
            formId: ids.form,
            userId: ids.peer,
            action: "save",
            body: initial,
          }),
        ),
        p_document: {
          formRevision: 3,
          grantId: null,
          grantRevision: 0,
          actions: ["view", "edit"],
        },
      }),
    );
  });
  it("binds removal to the reviewed grant generation and projects only safe current metadata", async () => {
    const f = fixture();
    f.results.set("mutate_form_collaborator_write", snapshot("remove"));
    const r = await f.call(root, "DELETE", existing);
    expect(r.statusCode).toBe(200);
    expect(f.db.rpc).toHaveBeenLastCalledWith(
      "mutate_form_collaborator_write",
      expect.objectContaining({
        p_action: "remove",
        p_document: { formRevision: 3, grantId: ids.access, grantRevision: 2 },
      }),
    );
    expect(r.body.data.receipt).toEqual({
      formId: ids.form,
      userId: ids.peer,
      action: "remove",
    });
    expect(JSON.stringify(r.body)).not.toMatch(/private|password|answers/);
  });
  it("checks original outcome with explicit key and no mutation or private identities", async () => {
    const f = fixture();
    f.results.set("inspect_form_collaborator_write", snapshot());
    const r = await f.call(root + `/recovery?action=save&userId=${ids.peer}`);
    expect(r.statusCode).toBe(200);
    expect(f.db.rpc).toHaveBeenLastCalledWith(
      "inspect_form_collaborator_write",
      {
        p_actor: ids.actor,
        p_session: ids.session,
        p_form: ids.form,
        p_user: ids.peer,
        p_action: "save",
        p_key_hash: tokenHash(f.key),
        p_request_hash: null,
      },
    );
    expect(f.db.rpc.mock.calls.some(([n]) => n.startsWith("mutate_"))).toBe(
      false,
    );
    expect(JSON.stringify(r.body)).not.toMatch(/private|password|answers/);
  });
  it("projects a current unaccepted inspection without inventing a receipt or grant", async () => {
    const f = fixture();
    f.results.set("inspect_form_collaborator_write", {
      ...snapshot(),
      committed: false,
      canRetry: true,
      grant: null,
      receipt: null,
    });
    const r = await f.call(root + `/recovery?action=save&userId=${ids.peer}`);
    expect(r.statusCode).toBe(200);
    expect(r.body.data).toMatchObject({
      committed: false,
      canRetry: true,
      grant: null,
      receipt: null,
    });
  });
  it("projects scoped inventory without account secrets", async () => {
    const f = fixture();
    f.results.set("read_form_collaborator_accounts", {
      items: [
        {
          admin_user_id: ids.peer,
          display_name: "Fictional Peer",
          role: "team_member",
          actions: ["view"],
          grantId: ids.access,
          grantRevision: 2,
          email: "private@example.test",
          password_hash: "private",
        },
      ],
      total: 130,
    });
    const r = await f.call(root + "?page=4&pageSize=25&q=%20Fictional%20");
    expect(r.body.data.total).toBe(130);
    expect(r.body.data.items[0]).toMatchObject({
      grantId: ids.access,
      grantRevision: 2,
    });
    expect(JSON.stringify(r.body)).not.toMatch(/private|password_hash/);
    expect(f.db.rpc).toHaveBeenLastCalledWith(
      "read_form_collaborator_accounts",
      {
        p_actor: ids.actor,
        p_session: ids.session,
        p_form: ids.form,
        p_kind: "collaborators",
        p_page: 4,
        p_size: 25,
        p_query: "Fictional",
      },
    );
  });
  it.each([
    ["missing versions", { userId: ids.peer, actions: ["view"] }],
    [
      "invalid absent generation",
      { ...initial, grantId: null, grantRevision: 1 },
    ],
    [
      "invalid existing generation",
      { ...initial, grantId: ids.access, grantRevision: 0 },
    ],
    ["zero form revision", { ...initial, formRevision: 0 }],
    ["overflow form revision", { ...initial, formRevision: 2147483648 }],
    ["overflow grant revision", { ...initial, grantRevision: 2147483648 }],
    ["duplicate actions", { ...initial, actions: ["view", "view"] }],
    ["missing view", { ...initial, actions: ["edit"] }],
    ["unknown action", { ...initial, actions: ["view", "own"] }],
    ["identity injection", { ...initial, actor: ids.actor }],
    ["wrong grant ID", { ...initial, grantId: "wrong" }],
  ])("rejects %s before a write", async (_label, body) => {
    const f = fixture();
    expect((await f.call(root, "PATCH", body)).statusCode).toBe(400);
    expect(f.db.rpc.mock.calls.some(([n]) => n.startsWith("mutate_"))).toBe(
      false,
    );
  });
  it.each([{ ...initial }, { ...existing, actions: ["view"] }])(
    "rejects absent-target or injected-actions removals",
    async (body) => {
      const f = fixture();
      expect((await f.call(root, "DELETE", body)).statusCode).toBe(400);
    },
  );
  it.each([
    "",
    "?action=save",
    `?action=save&userId=${ids.peer}&action=remove`,
    `?action=create&userId=${ids.peer}`,
    `?action=save&userId=${ids.peer}&actor=${ids.actor}`,
  ])("rejects malformed recovery query %s", async (q) => {
    const f = fixture();
    expect((await f.call(root + "/recovery" + q)).statusCode).toBe(400);
  });
  it("requires explicit keys and CSRF", async () => {
    const f = fixture();
    expect(
      (await f.call(root, "PATCH", initial, { "idempotency-key": "" }))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await f.call(
          root + `/recovery?action=save&userId=${ids.peer}`,
          "GET",
          undefined,
          { "idempotency-key": "" },
        )
      ).statusCode,
    ).toBe(400);
    expect(
      (await f.call(root, "DELETE", existing, { "x-csrf-token": "" })).body
        .error.code,
    ).toBe("CSRF_INVALID");
  });
  it.each([
    ["CONFLICT", 409],
    ["INVALID_STATE", 409],
    ["NOT_FOUND", 404],
  ])(
    "maps transactional %s without fallback writes",
    async (message, status) => {
      const f = fixture();
      f.results.set("mutate_form_collaborator_write", {
        error: { code: "P0001", message },
      });
      expect((await f.call(root, "PATCH", initial)).statusCode).toBe(status);
      expect(
        f.db.rpc.mock.calls.filter(([n]) => n.startsWith("mutate_")),
      ).toHaveLength(1);
    },
  );
});
