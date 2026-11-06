import { beforeAll, describe, expect, it, vi } from "vitest";
import { fixture, ids } from "./form-routes-fixture.mjs";
import { formDeletionRoutes } from "../../server/form-deletion.mjs";
import { hashSecret, token, tokenHash } from "../../server/lib/security.mjs";
const root = `/admin/forms/${ids.form}`,
  password = "Fictional-deletion-proof";
let hash;
beforeAll(async () => {
  hash = await hashSecret(password);
});
function setup() {
  const f = fixture();
  f.store.validateSession.mockResolvedValue({
    sessionId: ids.session,
    user: {
      id: ids.actor,
      email: "fictional-purge@example.test",
      role: "super_admin",
      is_active: true,
    },
  });
  f.store.accountByEmail = vi.fn(async () => ({ password_hash: hash }));
  f.results.set("read_form_deletion", {
    formId: ids.form,
    revision: 3,
    archived: true,
  });
  f.results.set("review_form_deletion", {
    reviewId: ids.access,
    expiresAt: new Date(Date.now() + 300000).toISOString(),
    state: { formId: ids.form, revision: 3 },
  });
  f.results.set("permanently_delete_form", {
    formId: ids.form,
    reviewId: ids.access,
    deleted: true,
  });
  f.results.set("inspect_form_deletion_write", {
    formId: ids.form,
    reviewId: ids.access,
    committed: true,
    canRetry: false,
    revision: 4,
    reviewExpiresAt: null,
    receipt: { formId: ids.form, reviewId: ids.access, deleted: true },
    reviewToken: "private",
    state: { answers: ["private"] },
  });
  return f;
}
const body = () => ({
  revision: 3,
  reviewId: ids.access,
  reviewToken: token(),
  confirmation: `DELETE FORM ${ids.form}`,
  exportWarningAcknowledged: true,
  currentPassword: password,
});
describe("Permanent deletion current-session read-only recovery", () => {
  it("ignores unrelated routes and blocks mutations through recovery", async () => {
    const f = setup();
    expect(
      await formDeletionRoutes(
        { url: "/api/v1/unrelated" },
        {},
        { config: f.config },
      ),
    ).toBe(false);
    expect(
      (await f.call(root + "/permanent-deletion/recovery", "POST", body()))
        .statusCode,
    ).toBe(405);
    expect((await f.call(root + "/permanent-deletion", "GET")).statusCode).toBe(
      405,
    );
  });
  it("reads original minimal receipt after erasure without password work or another mutation", async () => {
    const f = setup();
    const r = await f.call(
      root + `/permanent-deletion/recovery?reviewId=${ids.access}`,
    );
    expect(r.statusCode).toBe(200);
    expect(r.body.data).toEqual({
      formId: ids.form,
      reviewId: ids.access,
      committed: true,
      canRetry: false,
      revision: 4,
      reviewExpiresAt: null,
      receipt: { formId: ids.form, reviewId: ids.access, deleted: true },
    });
    expect(f.db.rpc).toHaveBeenLastCalledWith("inspect_form_deletion_write", {
      p_actor: ids.actor,
      p_session: ids.session,
      p_form: ids.form,
      p_review: ids.access,
      p_key_hash: tokenHash(f.key),
      p_request_hash: null,
    });
    expect(f.store.accountByEmail).not.toHaveBeenCalled();
    expect(f.store.rateLimit).not.toHaveBeenCalled();
  });
  it("projects unaccepted inspection without inventing receipt or disclosing private counters", async () => {
    const f = setup();
    f.results.set("inspect_form_deletion_write", {
      formId: ids.form,
      reviewId: ids.access,
      committed: false,
      canRetry: true,
      revision: 3,
      reviewExpiresAt: new Date().toISOString(),
      receipt: null,
      state: { retainedResponses: 7 },
    });
    const r = await f.call(
      root + `/permanent-deletion/recovery?reviewId=${ids.access}`,
    );
    expect(r.body.data.receipt).toBeNull();
    expect(JSON.stringify(r.body)).not.toContain("retainedResponses");
  });
  it("retains current eligibility read and capability creation", async () => {
    const f = setup();
    expect((await f.call(root + "/deletion-review")).statusCode).toBe(200);
    const r = await f.call(root + "/deletion-review", "POST", { revision: 3 });
    expect(r.statusCode).toBe(200);
    expect(r.body.data.reviewToken).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(f.db.rpc).toHaveBeenLastCalledWith(
      "review_form_deletion",
      expect.objectContaining({
        p_actor: ids.actor,
        p_session: ids.session,
        p_form: ids.form,
        p_revision: 3,
        p_token_hash: tokenHash(r.body.data.reviewToken),
      }),
    );
  });
  it("binds permanent deletion to exact original review and body hash with current proof", async () => {
    const f = setup(),
      document = body();
    expect(
      (await f.call(root + "/permanent-deletion", "POST", document)).statusCode,
    ).toBe(200);
    expect(f.db.rpc).toHaveBeenLastCalledWith(
      "permanently_delete_form",
      expect.objectContaining({
        p_actor: ids.actor,
        p_session: ids.session,
        p_form: ids.form,
        p_verified_hash: hash,
        p_revision: 3,
        p_review: ids.access,
        p_token_hash: tokenHash(document.reviewToken),
        p_confirmation: document.confirmation,
        p_export_warning: true,
        p_key_hash: tokenHash(f.key),
        p_request_hash: tokenHash(
          JSON.stringify({
            reviewId: ids.access,
            revision: 3,
            confirmation: document.confirmation,
            exportWarningAcknowledged: true,
          }),
        ),
      }),
    );
  });
  it("keeps wrong password distinct from denied authority and performs no erasure", async () => {
    const f = setup();
    const r = await f.call(root + "/permanent-deletion", "POST", {
      ...body(),
      currentPassword: "wrong",
    });
    expect(r.body.error.code).toBe("PASSWORD_REQUIRED");
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it("rejects incorrect typed confirmation before proof work", async () => {
    const f = setup();
    expect(
      (
        await f.call(root + "/permanent-deletion", "POST", {
          ...body(),
          confirmation: "DELETE",
        })
      ).statusCode,
    ).toBe(400);
    expect(f.store.accountByEmail).not.toHaveBeenCalled();
  });
  it("retains the ten-review quota and retry-after without performing work", async () => {
    const f = setup();
    f.store.rateLimit.mockResolvedValue({ allowed: false, retryAfter: 15 });
    const r = await f.call(root + "/permanent-deletion", "POST", body());
    expect(r.statusCode).toBe(429);
    expect(r.headers.get("retry-after")).toBe("15");
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it("requires CSRF and Super Admin before proof or capabilities", async () => {
    const f = setup();
    expect(
      (
        await f.call(
          root + "/deletion-review",
          "POST",
          { revision: 3 },
          { "x-csrf-token": "" },
        )
      ).body.error.code,
    ).toBe("CSRF_INVALID");
    f.store.validateSession.mockResolvedValue({
      sessionId: ids.session,
      user: { id: ids.actor, role: "admin", is_active: true },
    });
    expect(
      (await f.call(root + "/permanent-deletion", "POST", body())).statusCode,
    ).toBe(404);
    expect(f.store.accountByEmail).not.toHaveBeenCalled();
  });
  it.each([
    "",
    `?reviewId=bad`,
    `?reviewId=${ids.access}&reviewId=${ids.access}`,
    `?reviewId=${ids.access}&ignoreHold=true`,
  ])("rejects malformed recovery query %s", async (q) => {
    const f = setup();
    expect(
      (await f.call(root + "/permanent-deletion/recovery" + q)).statusCode,
    ).toBe(400);
  });
  it("requires explicit recovery key and rejects invented eligibility recovery route", async () => {
    const f = setup();
    expect(
      (
        await f.call(
          root + `/permanent-deletion/recovery?reviewId=${ids.access}`,
          "GET",
          undefined,
          { "idempotency-key": "" },
        )
      ).statusCode,
    ).toBe(400);
    expect(
      (await f.call(root + `/deletion-review/recovery?reviewId=${ids.access}`))
        .statusCode,
    ).toBe(404);
  });
  it.each([
    ["NOT_FOUND", 404],
    ["CONFLICT", 409],
    ["INVALID_STATE", 409],
    ["FORM_DELETION_REVIEW", 409],
  ])("maps current inspection failure %s", async (message, status) => {
    const f = setup();
    f.results.set("inspect_form_deletion_write", {
      error: { code: "P0001", message },
    });
    expect(
      (
        await f.call(
          root + `/permanent-deletion/recovery?reviewId=${ids.access}`,
        )
      ).statusCode,
    ).toBe(status);
  });
});
