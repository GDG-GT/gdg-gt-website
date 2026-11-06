import { describe, it, expect } from "vitest";
import { fixture, ids } from "./form-routes-fixture.mjs";
import { tokenHash } from "../../server/lib/security.mjs";
const root = `/admin/forms/${ids.form}`;
function setup(responseId = null) {
  const f = fixture();
  f.results.set("inspect_form_privacy_write", {
    committed: false,
    canRetry: true,
    formId: ids.form,
    responseId,
    currentRevision: 2,
    held: true,
    canRelease: true,
    targetExists: true,
    reason: "Fictional private reason",
    answers: "Fictional private answers",
    password: "Fictional proof",
    receipt: null,
  });
  return f;
}
describe("Read-only privacy review outcome recovery", () => {
  for (const responseId of [null, ids.response]) {
    const path =
      root +
      (responseId ? "/responses/" + responseId : "") +
      "/privacy/recovery";
    it(
      "inspects only current metadata for " +
        (responseId ? "response" : "form"),
      async () => {
        const f = setup(responseId),
          r = await f.call(path);
        expect(r.statusCode).toBe(200);
        expect(r.body.data).toEqual({
          committed: false,
          canRetry: true,
          formId: ids.form,
          responseId,
          currentRevision: 2,
          held: true,
          canRelease: true,
          targetExists: true,
          receipt: null,
        });
        expect(f.db.rpc).toHaveBeenCalledWith("inspect_form_privacy_write", {
          p_actor: ids.actor,
          p_session: ids.session,
          p_form: ids.form,
          p_response: responseId,
          p_key_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
          p_request_hash: null,
        });
        expect(
          f.db.rpc.mock.calls.some(
            ([n]) => n === "read_form_privacy" || n === "review_form_privacy",
          ),
        ).toBe(false);
        expect(f.queries).toHaveLength(0);
      },
    );
    it(
      "requires the original explicit key for " +
        (responseId ? "response" : "form"),
      async () => {
        const f = setup(responseId);
        expect(
          (await f.call(path, "GET", undefined, { "idempotency-key": "" }))
            .statusCode,
        ).toBe(400);
        expect(
          f.db.rpc.mock.calls.some(([n]) => n === "inspect_form_privacy_write"),
        ).toBe(false);
      },
    );
    it(
      "acknowledges an original accepted receipt without another proof or write for " +
        (responseId ? "response" : "form"),
      async () => {
        const f = setup(responseId);
        f.results.set("inspect_form_privacy_write", {
          committed: true,
          canRetry: false,
          formId: ids.form,
          responseId,
          currentRevision: 3,
          held: false,
          canRelease: true,
          targetExists: !responseId,
          receipt: {
            formId: ids.form,
            responseId,
            revision: 2,
            reason: "Fictional private reason",
          },
        });
        const r = await f.call(path);
        expect(r.statusCode).toBe(200);
        expect(r.body.data.receipt).toEqual({
          formId: ids.form,
          responseId,
          revision: 2,
        });
        expect(JSON.stringify(r.body.data)).not.toContain("Fictional");
        expect(f.store.rateLimit).not.toHaveBeenCalled();
        expect(f.store.csrf).not.toHaveBeenCalled();
      },
    );
    for (const method of ["POST", "PATCH", "DELETE"])
      it(
        "rejects " +
          method +
          " on " +
          (responseId ? "response" : "form") +
          " read-only recovery",
        async () => {
          const f = setup(responseId);
          expect((await f.call(path, method, {})).statusCode).toBe(405);
          expect(f.db.rpc).not.toHaveBeenCalled();
        },
      );
    it(
      "rejects forged query controls for " + (responseId ? "response" : "form"),
      async () => {
        const f = setup(responseId);
        for (const q of [
          "?password=x",
          "?revision=1",
          "?responseId=" + ids.peer,
          "?sensitive=true",
        ])
          expect((await f.call(path + q)).statusCode).toBe(400);
        expect(f.db.rpc).not.toHaveBeenCalled();
      },
    );
  }
  for (const code of ["NOT_FOUND", "CONFLICT", "INVALID_STATE"])
    it("does not acknowledge " + code + " outcomes", async () => {
      const f = setup();
      f.results.set("inspect_form_privacy_write", {
        error: { code: "P0001", message: code },
      });
      const r = await f.call(root + "/privacy/recovery");
      expect(r.statusCode).toBe(code === "NOT_FOUND" ? 404 : 409);
      expect(r.body.data).toBeUndefined();
    });
  it("requires a current session before private receipt inspection", async () => {
    const f = setup();
    expect(
      (
        await f.call(root + "/privacy/recovery", "GET", undefined, {
          cookie: "",
        })
      ).statusCode,
    ).toBe(401);
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it("binds inspection to the provided original key rather than inventing intent", async () => {
    const f = setup(),
      key = "fictional-original-privacy-key";
    await f.call(root + "/privacy/recovery", "GET", undefined, {
      "idempotency-key": key,
    });
    expect(f.db.rpc).toHaveBeenCalledWith(
      "inspect_form_privacy_write",
      expect.objectContaining({ p_key_hash: tokenHash(key) }),
    );
  });
});
