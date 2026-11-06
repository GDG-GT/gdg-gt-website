import { describe, it, expect } from "vitest";
import { fixture, ids } from "./form-routes-fixture.mjs";
import { tokenHash } from "../../server/lib/security.mjs";
const base = `/admin/forms/${ids.form}/responses/${ids.response}`;
const metadata = {
  id: ids.response,
  revision: 2,
  status: "complete",
  redacted: false,
  deleted: false,
  answers: "Fictional private answers",
  respondent_email: "fictional-private@example.test",
};
const document = (action) => ({
  revision: 2,
  status: "complete",
  redacted: false,
  confirmation: action.toUpperCase(),
  ...(action === "redact" ? { action } : {}),
});
function setup(action = "delete") {
  const f = fixture(),
    receipt = {
      id: ids.response,
      formId: ids.form,
      action,
      answers: "Fictional private answers",
    };
  f.results.set("inspect_form_response_write", {
    committed: false,
    canRetry: true,
    held: false,
    response: metadata,
  });
  f.results.set("mutate_form_response_write", {
    committed: true,
    canRetry: false,
    receipt,
    response: {
      ...metadata,
      status: action === "delete" ? "deleted" : "redacted",
      deleted: action === "delete",
      redacted: action === "redact",
    },
  });
  return f;
}
describe("Revision-bound private response mutation receipts", () => {
  for (const action of ["delete", "redact"]) {
    const method = action === "delete" ? "DELETE" : "PATCH";
    it(`requires explicit retry intent for ${action}`, async () => {
      const f = setup(action);
      expect(
        (
          await f.call(base, method, document(action), {
            "idempotency-key": "",
          })
        ).statusCode,
      ).toBe(400);
      expect(
        f.db.rpc.mock.calls.some(
          ([name]) => name === "mutate_form_response_write",
        ),
      ).toBe(false);
    });
    it(`binds ${action} to current session, reviewed revision/privacy state and normalized confirmation`, async () => {
      const f = setup(action),
        body = document(action);
      const r = await f.call(base, method, body);
      expect(r.statusCode).toBe(200);
      expect(f.db.rpc).toHaveBeenCalledWith(
        "mutate_form_response_write",
        expect.objectContaining({
          p_actor: ids.actor,
          p_session: ids.session,
          p_form: ids.form,
          p_response: ids.response,
          p_action: action,
          p_document: {
            revision: 2,
            status: "complete",
            redacted: false,
            confirmation: action.toUpperCase(),
          },
          p_key_hash: tokenHash(f.key),
          p_request_hash: tokenHash(
            JSON.stringify({
              formId: ids.form,
              responseId: ids.response,
              action,
              body,
            }),
          ),
        }),
      );
      expect(
        f.db.rpc.mock.calls.some(([name]) => name === "mutate_form_response"),
      ).toBe(false);
      expect(r.body.data.updated).toBe(true);
      expect(r.body.data.receipt.action).toBe(action);
      expect(JSON.stringify(r.body.data)).not.toMatch(
        /Fictional private|fictional-private|answers|respondent_email/,
      );
    });
    it(`inspects ${action} read-only with the original key and no answer query`, async () => {
      const f = setup(action),
        r = await f.call(base + "/recovery?action=" + action);
      expect(r.statusCode).toBe(200);
      expect(f.db.rpc).toHaveBeenCalledWith("inspect_form_response_write", {
        p_actor: ids.actor,
        p_session: ids.session,
        p_form: ids.form,
        p_response: ids.response,
        p_action: action,
        p_key_hash: tokenHash(f.key),
        p_request_hash: null,
      });
      expect(f.queries).toHaveLength(0);
      expect(r.body.data.response.id).toBe(ids.response);
      expect(JSON.stringify(r.body.data)).not.toMatch(
        /answers|respondent_email|Fictional private/,
      );
    });
    it(`denies ${action} without current delete capability`, async () => {
      const f = setup(action);
      f.results.set("can_operate_form", (args) => args.p_action !== "delete");
      expect((await f.call(base, method, document(action))).statusCode).toBe(
        404,
      );
      expect(
        (await f.call(base + "/recovery?action=" + action)).statusCode,
      ).toBe(404);
      expect(
        f.db.rpc.mock.calls.some(
          ([name]) =>
            name === "mutate_form_response_write" ||
            name === "inspect_form_response_write",
        ),
      ).toBe(false);
    });
  }
  for (const bad of [
    {},
    { ...document("delete"), revision: -1 },
    { ...document("delete"), revision: 1.5 },
    { ...document("delete"), revision: 2147483648 },
    { ...document("delete"), status: "deleted" },
    { ...document("delete"), redacted: "false" },
    { ...document("delete"), confirmation: "delete" },
    { ...document("delete"), answers: {} },
  ]) {
    it(`rejects invalid irreversible review ${JSON.stringify(bad)}`, async () => {
      const f = setup();
      expect((await f.call(base, "DELETE", bad)).statusCode).toBe(400);
      expect(
        f.db.rpc.mock.calls.some(
          ([name]) => name === "mutate_form_response_write",
        ),
      ).toBe(false);
    });
  }
  it("requires both the redaction action and its exact confirmation", async () => {
    const f = setup("redact"),
      missing = { ...document("redact") };
    delete missing.action;
    expect((await f.call(base, "PATCH", missing)).statusCode).toBe(400);
    expect(
      (
        await f.call(base, "PATCH", {
          ...document("redact"),
          confirmation: "DELETE",
        })
      ).statusCode,
    ).toBe(400);
    expect((await f.call(base, "DELETE", document("redact"))).statusCode).toBe(
      400,
    );
  });
  for (const query of [
    "",
    "?action=unknown",
    "?action=delete&answers=true",
    "?action=delete&action=redact",
  ]) {
    it(`rejects forged response recovery controls ${query}`, async () => {
      const f = setup();
      expect((await f.call(base + "/recovery" + query)).statusCode).toBe(400);
      expect(
        f.db.rpc.mock.calls.some(
          ([name]) => name === "inspect_form_response_write",
        ),
      ).toBe(false);
    });
  }
  it("projects accepted deletion receipts even after content is erased", async () => {
    const f = setup();
    f.results.set("inspect_form_response_write", {
      committed: true,
      canRetry: false,
      receipt: {
        id: ids.response,
        formId: ids.form,
        action: "delete",
        private: "Fictional value",
      },
      response: { ...metadata, status: "deleted", deleted: true },
    });
    const r = await f.call(base + "/recovery?action=delete");
    expect(r.statusCode).toBe(200);
    expect(r.body.data.committed).toBe(true);
    expect(r.body.data.response.deleted).toBe(true);
    expect(Object.keys(r.body.data.receipt)).toEqual([
      "id",
      "formId",
      "action",
    ]);
    expect(JSON.stringify(r.body.data)).not.toMatch(
      /Fictional|answers|private/,
    );
  });
  it("rejects mutating recovery methods and response write query substitution", async () => {
    const f = setup();
    expect(
      (
        await f.call(
          base + "/recovery?action=delete",
          "DELETE",
          document("delete"),
        )
      ).statusCode,
    ).toBe(405);
    expect(
      (await f.call(base + "?sensitive=true", "DELETE", document("delete")))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await f.call(
          `/admin/forms/${ids.form}/views/${ids.response}/recovery?action=delete`,
        )
      ).statusCode,
    ).toBe(404);
  });
  for (const code of [
    "CONFLICT",
    "RETENTION_HOLD",
    "INVALID_STATE",
    "NOT_FOUND",
  ]) {
    it(`preserves atomic ${code} failures without falsely acknowledging an action`, async () => {
      const f = setup();
      f.results.set("mutate_form_response_write", {
        error: { code: "P0001", message: code },
      });
      const r = await f.call(base, "DELETE", document("delete"));
      expect(r.statusCode).toBe(code === "NOT_FOUND" ? 404 : 409);
      expect(r.body.data).toBeUndefined();
    });
  }
});
