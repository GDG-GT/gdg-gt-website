import { describe, it, expect } from "vitest";
import { fixture, ids } from "./form-routes-fixture.mjs";
import { tokenHash } from "../../server/lib/security.mjs";
const base = `/admin/forms/${ids.form}`;
function operation(f, action) {
  if (action === "create")
    return {
      path: "/admin/forms",
      method: "POST",
      body: {
        slug: "fictional-library-new",
        teamId: null,
        template: "interest",
        definition: f.definition,
      },
    };
  if (action === "duplicate")
    return {
      path: base + "/duplicate",
      method: "POST",
      body: { slug: "fictional-library-copy", revision: 3 },
    };
  if (action === "archive")
    return { path: base, method: "DELETE", body: { revision: 3 } };
  return {
    path: base + "/" + action,
    method: "POST",
    body: { revision: 3, ...(action === "state" ? { state: "Closed" } : {}) },
  };
}
describe("Private form-library mutation receipt routes", () => {
  it("rejects a missing availability state before the transaction", async () => {
    const f = fixture();
    expect(
      (await f.call(base + "/state", "POST", { revision: 3 })).statusCode,
    ).toBe(400);
    expect(
      f.db.rpc.mock.calls.some(([name]) => name === "mutate_form_library"),
    ).toBe(false);
  });
  it.each(["create", "duplicate", "archive", "restore", "state"])(
    "requires explicit retry intent for %s before its business transaction",
    async (action) => {
      const f = fixture(),
        { path, method, body } = operation(f, action);
      expect(
        (await f.call(path, method, body, { "idempotency-key": "" }))
          .statusCode,
      ).toBe(400);
      expect(
        f.db.rpc.mock.calls.some(([name]) => name === "mutate_form_library"),
      ).toBe(false);
    },
  );
  it.each(["create", "duplicate", "archive", "restore", "state"])(
    "binds %s to current session, original source/revision and validated body",
    async (action) => {
      const f = fixture(),
        { path, method, body } = operation(f, action),
        id = action === "create" ? null : ids.form;
      expect((await f.call(path, method, body)).statusCode).toBe(200);
      const args = f.db.rpc.mock.calls.find(
        ([name]) => name === "mutate_form_library",
      )[1];
      expect(args).toMatchObject({
        p_actor: ids.actor,
        p_session: ids.session,
        p_source: id,
        p_action: action,
        p_revision: action === "create" ? null : 3,
        p_key_hash: tokenHash(f.key),
        p_request_hash: tokenHash(JSON.stringify({ id, action, body })),
      });
      expect(
        f.db.rpc.mock.calls.some(
          ([name]) =>
            name === "mutate_form" || name === "create_form_from_template",
        ),
      ).toBe(false);
    },
  );
  it("does not derive duplicate content or provenance from an unlocked stale route row", async () => {
    const f = fixture();
    f.row.template_key = "survey";
    f.row.title = "Stale route row";
    expect(
      (
        await f.call(base + "/duplicate", "POST", {
          slug: "fictional-library-copy",
          revision: 3,
        })
      ).statusCode,
    ).toBe(200);
    expect(f.db.rpc).toHaveBeenCalledWith(
      "mutate_form_library",
      expect.objectContaining({
        p_action: "duplicate",
        p_template: null,
        p_document: { slug: "fictional-library-copy" },
      }),
    );
  });
  it("inspects a missing creation receipt without inventing a form or performing a write", async () => {
    const f = fixture();
    f.results.set("inspect_form_library_write", {
      committed: false,
      canCreate: true,
      form: null,
    });
    const r = await f.call(
      "/admin/forms/recovery?action=create&team=" + ids.team,
    );
    expect(r.body.data).toEqual({
      committed: false,
      canCreate: true,
      form: null,
    });
    expect(f.db.rpc).toHaveBeenCalledWith("inspect_form_library_write", {
      p_actor: ids.actor,
      p_session: ids.session,
      p_source: null,
      p_action: "create",
      p_key_hash: tokenHash(f.key),
      p_request_hash: null,
      p_team: ids.team,
    });
    expect(f.queries).toHaveLength(0);
  });
  it.each(["duplicate", "archive", "restore", "state"])(
    "rechecks %s with current private projection and no mutation",
    async (action) => {
      const f = fixture();
      f.results.set("inspect_form_library_write", {
        committed: true,
        canCreate: action === "duplicate",
        receipt: { id: ids.form, action, revision: 3 },
        form: {
          ...f.row,
          draft_revision: 9,
          title: "Current private form",
          draft_definition: { ...f.definition, title: "Current private form" },
        },
      });
      const r = await f.call(
        `/admin/forms/recovery?action=${action}&source=${ids.form}`,
      );
      expect(r.body.data).toMatchObject({
        committed: true,
        receipt: { revision: 3 },
        form: { revision: 9, title: "Current private form" },
      });
      expect(
        f.db.rpc.mock.calls.some(([name]) => name.startsWith("mutate_")),
      ).toBe(false);
    },
  );
  it("rejects ambiguous recovery actions, sources, teams, keys and non-read methods", async () => {
    const f = fixture();
    for (const query of [
      "action=create&source=" + ids.form,
      "action=duplicate",
      "action=draft",
      "action=create&extra=1",
      "action=create&action=create",
      `action=state&source=${ids.form}&team=${ids.team}`,
    ])
      expect((await f.call("/admin/forms/recovery?" + query)).statusCode).toBe(
        400,
      );
    expect(
      (
        await f.call("/admin/forms/recovery?action=create", "GET", undefined, {
          "idempotency-key": "",
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await f.call("/admin/forms/recovery?action=create", "POST", {}))
        .statusCode,
    ).toBe(405);
    expect(
      (
        await f.call("/admin/forms/recovery?action=create", "GET", undefined, {
          cookie: "",
        })
      ).statusCode,
    ).toBe(401);
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it("requires a source revision and rejects caller-injected copy contents or ownership", async () => {
    const f = fixture();
    for (const body of [
      { slug: "fictional-copy" },
      { slug: "fictional-copy", revision: 0 },
      { slug: "fictional-copy", revision: 3, definition: f.definition },
      { slug: "fictional-copy", revision: 3, ownerId: ids.peer },
    ])
      expect((await f.call(base + "/duplicate", "POST", body)).statusCode).toBe(
        400,
      );
    expect(
      f.db.rpc.mock.calls.some(([name]) => name === "mutate_form_library"),
    ).toBe(false);
  });
  it.each([
    ["P0001", "NOT_FOUND", 404],
    ["P0001", "CONFLICT", 409],
    ["42501", "", 403],
  ])(
    "fails closed on private recovery error %s/%s",
    async (code, message, status) => {
      const f = fixture();
      f.results.set("inspect_form_library_write", { error: { code, message } });
      const r = await f.call("/admin/forms/recovery?action=create");
      expect(r.statusCode).toBe(status);
      expect(r.body.data).toBeUndefined();
    },
  );
});
