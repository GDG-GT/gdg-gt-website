import { describe, it, expect } from "vitest";
import { fixture, ids } from "./form-routes-fixture.mjs";
import { tokenHash } from "../../server/lib/security.mjs";
const base = `/admin/forms/${ids.form}`;
describe("Private form authoring write receipts", () => {
  it.each(["draft", "publish"])(
    "requires an explicit key for %s before any business mutation",
    async (action) => {
      const f = fixture();
      const r = await f.call(
        base + "/" + action,
        action === "draft" ? "PATCH" : "POST",
        {
          revision: 3,
          ...(action === "draft" ? { definition: f.definition } : {}),
        },
        { "idempotency-key": "" },
      );
      expect(r.statusCode).toBe(400);
      expect(
        f.db.rpc.mock.calls.some(([name]) => name === "mutate_form_authoring"),
      ).toBe(false);
    },
  );
  it.each(["draft", "publish"])(
    "binds %s to the current session and original validated revision/body",
    async (action) => {
      const f = fixture(),
        body = {
          revision: 3,
          ...(action === "draft"
            ? { teamId: null, definition: f.definition }
            : {}),
        };
      expect(
        (
          await f.call(
            base + "/" + action,
            action === "draft" ? "PATCH" : "POST",
            body,
          )
        ).statusCode,
      ).toBe(200);
      const args = f.db.rpc.mock.calls.find(
        ([name]) => name === "mutate_form_authoring",
      )[1];
      expect(args).toMatchObject({
        p_actor: ids.actor,
        p_session: ids.session,
        p_id: ids.form,
        p_action: action,
        p_revision: 3,
        p_key_hash: tokenHash(f.key),
        p_request_hash: tokenHash(
          JSON.stringify({ id: ids.form, action, body }),
        ),
      });
      expect(
        f.db.rpc.mock.calls.find(
          ([name]) => name === "inspect_form_authoring_write",
        )[1].p_request_hash,
      ).toBe(args.p_request_hash);
    },
  );
  it("replays an accepted publication before validating a newer invalid saved draft", async () => {
    const f = fixture();
    const current = {
      ...f.row,
      draft_revision: 7,
      draft_definition: {
        ...f.definition,
        title: "Current private draft",
        fields: [],
      },
    };
    f.row.draft_definition = current.draft_definition;
    f.results.set("inspect_form_authoring_write", {
      committed: true,
      form: current,
    });
    const r = await f.call(base + "/publish", "POST", { revision: 3 });
    expect(r.statusCode).toBe(200);
    expect(r.body.data.form).toMatchObject({
      title: "Current private draft",
      revision: 7,
    });
    expect(
      f.db.rpc.mock.calls.some(
        ([name]) =>
          name === "mutate_form_authoring" || name === "form_receipt_ready",
      ),
    ).toBe(false);
  });
  it("returns a current saved projection after draft replay without performing another write", async () => {
    const f = fixture();
    f.results.set("inspect_form_authoring_write", {
      committed: true,
      form: { ...f.row, draft_revision: 9 },
    });
    expect(
      (
        await f.call(base + "/draft", "PATCH", {
          revision: 3,
          definition: f.definition,
        })
      ).body.data.form.revision,
    ).toBe(9);
    expect(
      f.db.rpc.mock.calls.some(([name]) => name === "mutate_form_authoring"),
    ).toBe(false);
  });
  it.each(["draft", "publish"])(
    "reads the private %s receipt and current form without a mutation",
    async (action) => {
      const f = fixture();
      f.results.set("inspect_form_authoring_write", {
        committed: true,
        receipt: { revision: 4, versionId: ids.version },
        form: f.row,
      });
      const r = await f.call(base + "?mutation=" + action);
      expect(r.body.data).toMatchObject({
        committed: true,
        receipt: { revision: 4 },
        form: { id: ids.form },
      });
      expect(f.db.rpc).toHaveBeenCalledWith("inspect_form_authoring_write", {
        p_actor: ids.actor,
        p_session: ids.session,
        p_id: ids.form,
        p_action: action,
        p_key_hash: tokenHash(f.key),
        p_request_hash: null,
      });
      expect(
        f.db.rpc.mock.calls.some(([name]) => name.startsWith("mutate_")),
      ).toBe(false);
    },
  );
  it("rejects ambiguous/invalid receipt reads and missing keys", async () => {
    const f = fixture();
    for (const suffix of [
      "?mutation=archive",
      "?mutation=draft&mutation=publish",
      "?mutation=draft&extra=1",
      "/draft?mutation=draft",
    ])
      expect((await f.call(base + suffix)).statusCode).toBe(400);
    expect(
      (
        await f.call(base + "?mutation=draft", "GET", undefined, {
          "idempotency-key": "",
        })
      ).statusCode,
    ).toBe(400);
  });
  it.each([
    ["P0001", "CONFLICT", 409],
    ["P0001", "NOT_FOUND", 404],
    ["42501", "", 403],
  ])("fails closed on receipt error %s/%s", async (code, message, status) => {
    const f = fixture();
    f.results.set("inspect_form_authoring_write", { error: { code, message } });
    expect(
      (await f.call(base + "/publish", "POST", { revision: 3 })).statusCode,
    ).toBe(status);
    expect(
      f.db.rpc.mock.calls.some(([name]) => name === "mutate_form_authoring"),
    ).toBe(false);
  });
});
