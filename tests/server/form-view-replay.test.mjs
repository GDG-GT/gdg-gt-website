import { describe, it, expect } from "vitest";
import { fixture, ids } from "./form-routes-fixture.mjs";
import { tokenHash } from "../../server/lib/security.mjs";
const root = `/admin/forms/${ids.form}/views`,
  viewId = ids.response;
const view = {
  id: viewId,
  name: "Fictional private saved view",
  revision: 2,
  filters: { q: "Fictional private query" },
  columns: [ids.version],
  updated_at: "2026-11-06T12:00:00Z",
  owner_id: ids.actor,
  form_id: ids.form,
  private_token: "fictional-secret",
};
function setup(action = "create") {
  const f = fixture(),
    receipt = {
      id: viewId,
      formId: ids.form,
      sourceId: action === "create" ? null : viewId,
      action,
      filters: "fictional-private-receipt",
    };
  f.lists.set("form_saved_views", [view]);
  f.results.set("inspect_form_view_write", {
    committed: false,
    canRetry: true,
    view: action === "create" ? null : view,
  });
  f.results.set("mutate_form_view_write", {
    committed: true,
    canRetry: false,
    receipt,
    view: action === "remove" ? null : view,
  });
  return f;
}
const body = (action) =>
  action === "remove"
    ? { revision: 2 }
    : {
        name: "Fictional private saved view",
        filters: { version: 1 },
        columns: [ids.version],
        ...(action === "replace" ? { revision: 2 } : {}),
      };
describe("Private revision-bound saved view transactions", () => {
  for (const action of ["create", "replace", "remove"]) {
    const method =
        action === "create"
          ? "POST"
          : action === "replace"
            ? "PATCH"
            : "DELETE",
      path = root + (action === "create" ? "" : "/" + viewId),
      recovery =
        root +
        (action === "create" ? "" : "/" + viewId) +
        "/recovery?action=" +
        action;
    it(`binds ${action} to actor/session/form/target and original body hash`, async () => {
      const f = setup(action),
        document = body(action),
        r = await f.call(path, method, document);
      expect(r.statusCode).toBe(200);
      expect(f.db.rpc).toHaveBeenCalledWith(
        "mutate_form_view_write",
        expect.objectContaining({
          p_actor: ids.actor,
          p_session: ids.session,
          p_form: ids.form,
          p_view: action === "create" ? null : viewId,
          p_action: action,
          p_document: document,
          p_request_hash: tokenHash(
            JSON.stringify({
              formId: ids.form,
              viewId: action === "create" ? null : viewId,
              action,
              body: document,
            }),
          ),
        }),
      );
      expect(r.body.data.receipt).toEqual({
        id: viewId,
        formId: ids.form,
        sourceId: action === "create" ? null : viewId,
        action,
      });
      expect(JSON.stringify(r.body.data)).not.toMatch(
        /owner_id|private_token|fictional-private-receipt/,
      );
    });
    it(`requires an explicit ${action} retry key`, async () => {
      const f = setup(action);
      expect(
        (await f.call(path, method, body(action), { "idempotency-key": "" }))
          .statusCode,
      ).toBe(400);
      expect(
        f.db.rpc.mock.calls.some(([n]) => n === "mutate_form_view_write"),
      ).toBe(false);
    });
    it(`inspects ${action} outcomes without a mutation or private answer read`, async () => {
      const f = setup(action),
        r = await f.call(recovery);
      expect(r.statusCode).toBe(200);
      expect(f.db.rpc).toHaveBeenCalledWith(
        "inspect_form_view_write",
        expect.objectContaining({
          p_actor: ids.actor,
          p_session: ids.session,
          p_form: ids.form,
          p_view: action === "create" ? null : viewId,
          p_action: action,
          p_request_hash: null,
        }),
      );
      expect(f.queries).toHaveLength(0);
      expect(
        f.db.rpc.mock.calls.some(([n]) => n === "mutate_form_view_write"),
      ).toBe(false);
      expect((await f.call(recovery, "POST", {})).statusCode).toBe(405);
    });
    it(`rejects ${action} when current source permission is gone`, async () => {
      const f = setup(action);
      f.results.set("can_operate_form", false);
      expect((await f.call(recovery)).statusCode).toBe(404);
      expect((await f.call(path, method, body(action))).statusCode).toBe(404);
      expect(
        f.db.rpc.mock.calls.some(([n]) =>
          /^(inspect|mutate)_form_view_write$/.test(n),
        ),
      ).toBe(false);
    });
  }
  it("returns owner-scoped search/pagination/revisions with no fetched-membership ceiling", async () => {
    const f = setup(),
      r = await f.call(root + "?q=%25_%5C&page=4&pageSize=25");
    expect(r.statusCode).toBe(200);
    expect(r.body.data).toMatchObject({ total: 1, page: 4, pageSize: 25 });
    const q = f.queries.find((q) => q.table === "form_saved_views");
    expect(q.steps).toContainEqual(["eq", "owner_id", ids.actor]);
    expect(q.steps).toContainEqual(["eq", "form_id", ids.form]);
    expect(q.steps).toContainEqual([
      "select",
      "id,name,revision,filters,columns,updated_at",
      { count: "exact" },
    ]);
    expect(q.steps).toContainEqual(["range", 75, 99]);
    expect(q.steps).toContainEqual(["ilike", "name", "%\\%\\_\\\\%"]);
    expect(q.steps.some(([name]) => name === "limit")).toBe(false);
    expect(r.body.data.items[0]).toMatchObject({ revision: 2 });
    expect(JSON.stringify(r.body.data)).not.toMatch(/owner_id|private_token/);
  });
  for (const q of ["page=0", "page=1&page=2", "unknown=true", "pageSize=101"])
    it("rejects malformed inventory " + q, async () => {
      const f = setup();
      expect((await f.call(root + "?" + q)).statusCode).toBe(400);
      expect(f.queries).toHaveLength(0);
    });
  for (const q of [
    "action=remove",
    "action=create&action=create",
    "action=create&owner=x",
    "",
  ])
    it("rejects substituted recovery " + q, async () => {
      const f = setup();
      expect((await f.call(root + "/recovery?" + q)).statusCode).toBe(400);
      expect(
        f.db.rpc.mock.calls.some(([n]) => n === "inspect_form_view_write"),
      ).toBe(false);
    });
  for (const revision of [undefined, 0, 1.5, "2"])
    it(
      "requires current integer revision " +
        revision +
        " for replacing/removing",
      async () => {
        const f = setup();
        for (const method of ["PATCH", "DELETE"])
          expect(
            (
              await f.call(
                root + "/" + viewId,
                method,
                method === "PATCH"
                  ? { ...body("replace"), revision }
                  : { revision },
              )
            ).statusCode,
          ).toBe(400);
      },
    );
  it("rejects unreviewed scope, paging or sensitive preferences", async () => {
    const f = setup();
    for (const changes of [
      { owner_id: ids.peer },
      { filters: { sensitive: true } },
      { filters: { page: 2 } },
      { columns: ["not-a-field"] },
      { name: "   " },
    ])
      expect(
        (await f.call(root, "POST", { ...body("create"), ...changes }))
          .statusCode,
      ).toBe(400);
  });
  it("rejects invalid date order before writing preferences", async () => {
    const f = setup();
    expect(
      (
        await f.call(root, "POST", {
          ...body("create"),
          filters: { from: "2026-11-07T00:00:00Z", to: "2026-11-06T00:00:00Z" },
        })
      ).statusCode,
    ).toBe(400);
  });
  for (const code of ["CONFLICT", "DUPLICATE", "INVALID_STATE", "NOT_FOUND"])
    it("keeps " + code + " atomic failures unacknowledged", async () => {
      const f = setup();
      f.results.set("mutate_form_view_write", {
        error: { code: "P0001", message: code },
      });
      const r = await f.call(root, "POST", body("create"));
      expect(r.statusCode).toBe(code === "NOT_FOUND" ? 404 : 409);
      expect(r.body.data).toBeUndefined();
    });
  it("recovers accepted removal with only a minimal receipt after the row is gone", async () => {
    const f = setup("remove");
    f.results.set("inspect_form_view_write", {
      committed: true,
      canRetry: false,
      receipt: {
        id: viewId,
        formId: ids.form,
        sourceId: viewId,
        action: "remove",
        filters: { q: "fictional-private-query" },
      },
      view: null,
    });
    const r = await f.call(root + "/" + viewId + "/recovery?action=remove");
    expect(r.statusCode).toBe(200);
    expect(r.body.data.view).toBeNull();
    expect(r.body.data.committed).toBe(true);
    expect(JSON.stringify(r.body.data)).not.toContain(
      "fictional-private-query",
    );
  });
});
