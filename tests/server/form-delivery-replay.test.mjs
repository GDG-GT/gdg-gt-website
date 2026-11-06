import { afterEach, describe, it, expect, vi } from "vitest";
import { fixture, ids, withLocalMail } from "./form-routes-fixture.mjs";
import { tokenHash } from "../../server/lib/security.mjs";
import { formDraftDefinitionSchema } from "../../shared/forms.ts";
const base = `/admin/forms/${ids.form}/delivery`;
afterEach(() => vi.unstubAllEnvs());
function setup() {
  const f = fixture();
  f.results.set("read_form_delivery_candidates", {
    items: [
      {
        id: ids.peer,
        display_name: "Fictional delivery recipient",
        role: "admin",
        email: "fictional-private@example.test",
        password_hash: "private",
      },
    ],
    total: 215,
  });
  f.results.set("read_form_delivery_selection", [
    {
      id: ids.peer,
      display_name: "Unavailable chapter account",
      role: null,
      eligible: false,
      private_secret: "fictional",
    },
  ]);
  f.results.set("read_form_delivery_current", false);
  f.single.set("form_delivery_policies", {
    revision: 2,
    schema_hash: tokenHash(
      JSON.stringify(formDraftDefinitionSchema.parse(f.definition)),
    ),
    receipts: false,
    receipt_answers: false,
    notification_users: [ids.peer],
    chapter_inbox: false,
    notification_answers: false,
    reviewed_at: "2026-11-06T12:00:00Z",
  });
  f.results.set("inspect_form_delivery_write", {
    committed: false,
    canRetry: true,
    formId: ids.form,
    formRevision: 3,
    policyRevision: 2,
    editable: true,
    selectedValid: true,
    canReviewAnswers: true,
    receipt: null,
    notificationUsers: [ids.peer],
    password: "fictional-private-proof",
  });
  return f;
}
describe("Scoped delivery intent recovery and complete recipient inventory", () => {
  it("server-pages/searches eligible identities before projecting private fields", async () => {
    const f = setup(),
      r = await f.call(
        base + "/candidates?q=Fictional%20delivery&page=8&pageSize=30",
      );
    expect(r.statusCode).toBe(200);
    expect(r.body.data).toEqual({
      items: [
        {
          id: ids.peer,
          display_name: "Fictional delivery recipient",
          role: "admin",
        },
      ],
      total: 215,
      page: 8,
      pageSize: 30,
    });
    expect(f.db.rpc).toHaveBeenCalledWith("read_form_delivery_candidates", {
      p_actor: ids.actor,
      p_session: ids.session,
      p_form: ids.form,
      p_page: 8,
      p_size: 30,
      p_query: "Fictional delivery",
    });
    expect(f.queries).toHaveLength(0);
    expect(
      f.db.rpc.mock.calls.some(([n]) => n === "form_delivery_candidates"),
    ).toBe(false);
  });
  it("preserves configured unavailable recipient IDs for explicit removal", async () => {
    const f = setup(),
      r = await f.call(base);
    expect(r.statusCode).toBe(200);
    expect(r.body.data.notificationUsers).toEqual([ids.peer]);
    expect(r.body.data.selectedAccounts).toEqual([
      {
        id: ids.peer,
        display_name: "Unavailable chapter account",
        role: null,
        eligible: false,
      },
    ]);
    expect(r.body.data.eligible).toEqual([]);
    expect(JSON.stringify(r.body.data)).not.toContain("private_secret");
    expect(r.body.data.matchesDraft).toBe(false);
    expect(f.db.rpc).toHaveBeenCalledWith("read_form_delivery_selection", {
      p_actor: ids.actor,
      p_session: ids.session,
      p_form: ids.form,
    });
    expect(f.db.rpc).toHaveBeenCalledWith(
      "read_form_delivery_current",
      expect.objectContaining({
        p_actor: ids.actor,
        p_session: ids.session,
        p_form: ids.form,
      }),
    );
  });
  it("requires a current review rather than schema hash alone", async () => {
    const f = setup();
    f.results.set("read_form_delivery_current", true);
    const r = await f.call(base);
    expect(r.statusCode).toBe(200);
    expect(r.body.data.matchesDraft).toBe(true);
  });
  it("returns metadata only for read-only original-outcome inspection", async () => {
    const f = setup(),
      key = "fictional-original-delivery-key",
      r = await f.call(base + "/recovery?users=" + ids.peer, "GET", undefined, {
        "idempotency-key": key,
      });
    expect(r.statusCode).toBe(200);
    expect(r.body.data).toMatchObject({
      committed: false,
      canRetry: true,
      formId: ids.form,
      formRevision: 3,
      policyRevision: 2,
      editable: true,
      selectedValid: true,
      receipt: null,
    });
    expect(r.body.data.notificationUsers).toBeUndefined();
    expect(r.body.data.password).toBeUndefined();
    expect(f.db.rpc).toHaveBeenCalledWith("inspect_form_delivery_write", {
      p_actor: ids.actor,
      p_session: ids.session,
      p_form: ids.form,
      p_key_hash: tokenHash(key),
      p_request_hash: null,
      p_users: [ids.peer],
    });
    expect(f.queries).toHaveLength(0);
    expect(f.store.rateLimit).not.toHaveBeenCalled();
    expect(
      f.db.rpc.mock.calls.some(([n]) => n === "review_form_delivery"),
    ).toBe(false);
  });
  it("acknowledges an original accepted review without requiring proof again", async () => {
    const f = setup();
    f.results.set("inspect_form_delivery_write", {
      committed: true,
      canRetry: false,
      formId: ids.form,
      formRevision: 4,
      policyRevision: 3,
      editable: false,
      selectedValid: false,
      canReviewAnswers: true,
      receipt: { formId: ids.form, revision: 2, notificationUsers: [ids.peer] },
    });
    const r = await f.call(base + "/recovery");
    expect(r.statusCode).toBe(200);
    expect(r.body.data.receipt).toEqual({ formId: ids.form, revision: 2 });
    expect(r.body.data.committed).toBe(true);
    expect(f.store.csrf).not.toHaveBeenCalled();
    expect(f.store.rateLimit).not.toHaveBeenCalled();
  });
  it("reports provider availability without performing a provider send", async () => {
    withLocalMail();
    const f = setup(),
      r = await f.call(base + "/recovery");
    expect(r.statusCode).toBe(200);
    expect(r.body.data.mailReady).toBe(true);
    expect(
      f.db.rpc.mock.calls.some(([n]) => /queue|deliveryMessage|send/i.test(n)),
    ).toBe(false);
  });
  for (const suffix of ["/recovery", "/candidates"]) {
    it("requires current form rights for " + suffix, async () => {
      const f = setup();
      f.results.set("can_operate_form", false);
      expect((await f.call(base + suffix)).statusCode).toBe(404);
      expect(
        f.db.rpc.mock.calls.some(([n]) =>
          /^inspect_form_delivery|^read_form_delivery/.test(n),
        ),
      ).toBe(false);
    });
    it("requires a current session for " + suffix, async () => {
      const f = setup();
      expect(
        (await f.call(base + suffix, "GET", undefined, { cookie: "" }))
          .statusCode,
      ).toBe(401);
      expect(f.db.rpc).not.toHaveBeenCalled();
    });
    for (const method of ["POST", "PATCH", "DELETE"])
      it("refuses " + method + " on read-only " + suffix, async () => {
        const f = setup();
        expect((await f.call(base + suffix, method, {})).statusCode).toBe(405);
        expect(f.db.rpc).not.toHaveBeenCalled();
      });
  }
  for (const q of ["page=0", "pageSize=101", "q=a&q=b", "unknown=true"])
    it("rejects invalid candidate controls " + q, async () => {
      const f = setup();
      expect((await f.call(base + "/candidates?" + q)).statusCode).toBe(400);
      expect(f.db.rpc).not.toHaveBeenCalled();
    });
  for (const q of [
    "users=not-a-user",
    "users=" + Array.from({ length: 11 }, () => ids.peer).join(","),
    "password=x",
    "users=&users=",
  ])
    it("rejects invalid original-inspection controls " + q, async () => {
      const f = setup();
      expect((await f.call(base + "/recovery?" + q)).statusCode).toBe(400);
      expect(
        f.db.rpc.mock.calls.some(([n]) => n === "inspect_form_delivery_write"),
      ).toBe(false);
    });
  it("requires the explicit original key before inspecting a receipt", async () => {
    const f = setup();
    expect(
      (
        await f.call(base + "/recovery", "GET", undefined, {
          "idempotency-key": "",
        })
      ).statusCode,
    ).toBe(400);
    expect(
      f.db.rpc.mock.calls.some(([n]) => n === "inspect_form_delivery_write"),
    ).toBe(false);
  });
  for (const code of ["CONFLICT", "INVALID_STATE", "NOT_FOUND"])
    it("leaves " + code + " inspection outcomes unacknowledged", async () => {
      const f = setup();
      f.results.set("inspect_form_delivery_write", {
        error: { code: "P0001", message: code },
      });
      const r = await f.call(base + "/recovery");
      expect(r.statusCode).toBe(code === "NOT_FOUND" ? 404 : 409);
      expect(r.body.data).toBeUndefined();
    });
});
