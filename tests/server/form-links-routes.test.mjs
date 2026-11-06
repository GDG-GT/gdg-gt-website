import { describe, it, expect } from "vitest";
import { formLinkRoutes } from "../../server/form-links.mjs";
import { fixture, ids } from "./form-routes-fixture.mjs";
import {
  encryptPayload,
  decryptPayload,
} from "../../server/lib/encryption.mjs";
import { tokenHash, riskHash } from "../../server/lib/security.mjs";
const root = `/admin/forms/${ids.form}/invitations`,
  email = "fictional-recipient@example.test",
  expiry = "2026-11-12T12:00:00Z",
  expected = { formRevision: 3, publishedVersionId: ids.version };
const batch = () => ({
  ...expected,
  type: "invited",
  recipients: [email],
  expiresAt: expiry,
  confirmed: true,
});
const actionBody = (action) => ({
  ...expected,
  revision: 2,
  action,
  ...(action === "resend" ? { expiresAt: expiry } : {}),
});
function setup() {
  const f = fixture();
  f.results.set("inspect_form_access_link_write", { committed: false });
  f.results.set(
    "mutate_form_access_link_write",
    ({ p_action, p_id, p_prepared }) => ({
      formId: ids.form,
      sourceId: p_id,
      action: p_action,
      queued:
        p_action === "revoke"
          ? 0
          : Array.isArray(p_prepared)
            ? p_prepared.length
            : 1,
      existing: 0,
      total: Array.isArray(p_prepared) ? p_prepared.length : 1,
    }),
  );
  f.results.set("read_form_access_links", {
    items: [
      {
        id: ids.access,
        revision: 2,
        token_type: "invited",
        intended_email_encrypted: encryptPayload(
          { email },
          f.config.encryptionSecret,
        ),
        used_count: 0,
        use_limit: 1,
        delivery_state: "pending",
        last_sent_at: null,
        expires_at: expiry,
        revoked_at: null,
        created_at: "2026-11-05T12:00:00Z",
        token_hash: "private-token-hash",
      },
    ],
    total: 150,
  });
  f.single.set("form_access_tokens", {
    intended_email_encrypted: encryptPayload(
      { email },
      f.config.encryptionSecret,
    ),
  });
  return f;
}
const receipt = (action = "create") => ({
  formId: ids.form,
  sourceId: action === "create" ? null : ids.access,
  action,
  queued: action === "revoke" ? 0 : 1,
  existing: 0,
  total: 1,
});
describe("Private-link current-session/versioned mutation boundary", () => {
  it("ignores unrelated routes, rejects invalid methods and validates IDs", async () => {
    const f = setup();
    expect(
      await formLinkRoutes(
        { url: "/api/v1/unrelated" },
        {},
        { config: f.config },
      ),
    ).toBe(false);
    expect((await f.call(root + "/recovery", "PATCH", {})).statusCode).toBe(
      405,
    );
    expect((await f.call(root + "/" + ids.access)).statusCode).toBe(405);
    expect((await f.call("/admin/forms/bad/invitations")).statusCode).toBe(400);
    expect(
      (await f.call(root + "/bad", "PATCH", actionBody("revoke"))).statusCode,
    ).toBe(400);
  });
  it.each(["view", "manage_access"])(
    "requires current %s before inventory, recovery and mutation",
    async (action) => {
      const f = setup();
      f.results.set("can_operate_form", ({ p_action }) => p_action !== action);
      expect((await f.call(root)).statusCode).toBe(404);
      expect((await f.call(root + "/recovery?action=create")).statusCode).toBe(
        404,
      );
      expect((await f.call(root, "POST", batch())).statusCode).toBe(404);
      expect(f.db.rpc.mock.calls.every(([n]) => n === "can_operate_form")).toBe(
        true,
      );
    },
  );
  it("scopes counts/paging to the current session and exposes only masked recipient metadata", async () => {
    const f = setup();
    const r = await f.call(root + "?page=4&pageSize=25");
    expect(r.body.data).toMatchObject({
      total: 150,
      page: 4,
      pageSize: 25,
      items: [
        { id: ids.access, revision: 2, recipientHint: "fi…@example.test" },
      ],
    });
    expect(f.db.rpc).toHaveBeenLastCalledWith("read_form_access_links", {
      p_actor: ids.actor,
      p_session: ids.session,
      p_form: ids.form,
      p_page: 4,
      p_size: 25,
    });
    expect(JSON.stringify(r.body)).not.toMatch(
      /fictional-recipient|intended_email_encrypted|private-token-hash/,
    );
  });
  it("keeps erased recipient references generic instead of failing or exposing old identity", async () => {
    const f = setup();
    f.results.set("read_form_access_links", {
      items: [
        {
          id: ids.access,
          token_type: "invited",
          revision: 3,
          intended_email_encrypted: null,
          used_count: 1,
          revoked_at: expiry,
        },
      ],
      total: 1,
    });
    const r = await f.call(root);
    expect(r.statusCode).toBe(200);
    expect(r.body.data.items[0]).toMatchObject({
      recipientHint: "Unavailable recipient",
      responded: true,
      revision: 3,
    });
  });
  it("fails a malformed decrypted identity instead of returning an unverified hint", async () => {
    const f = setup();
    f.results.set("read_form_access_links", {
      items: [
        {
          intended_email_encrypted: encryptPayload(
            { email: "bad" },
            f.config.encryptionSecret,
          ),
        },
      ],
      total: 1,
    });
    expect((await f.call(root)).statusCode).toBe(503);
  });
  it("freezes original absolute expiry and binds normalized audience to the request hash; no plaintext token/address in result", async () => {
    const f = setup(),
      body = {
        ...batch(),
        recipients: [" Fictional-Recipient@Example.test ", email],
      };
    const r = await f.call(root, "POST", body);
    expect(r.body.data).toEqual(receipt());
    const args = f.db.rpc.mock.calls.at(-1)[1];
    expect(args).toMatchObject({
      p_actor: ids.actor,
      p_session: ids.session,
      p_form: ids.form,
      p_id: null,
      p_action: "create",
      p_form_revision: 3,
      p_version: ids.version,
      p_target_revision: null,
      p_key_hash: tokenHash(f.key),
      p_document: { ...batch(), recipients: [email] },
    });
    expect(args.p_request_hash).toBe(
      tokenHash(
        JSON.stringify({
          formId: ids.form,
          sourceId: null,
          action: "create",
          body: { ...batch(), recipients: [email] },
        }),
      ),
    );
    expect(args.p_prepared).toHaveLength(1);
    const prepared = args.p_prepared[0],
      secret = decryptPayload(
        prepared.secretEncrypted,
        f.config.encryptionSecret,
      );
    expect(prepared.expiresAt).toBe(expiry);
    expect(secret.email).toBe(email);
    expect(prepared.tokenHash).toBe(tokenHash(secret.token));
    expect(prepared.emailHash).toBe(
      riskHash("form-recipient:" + ids.form + ":" + email, f.config.riskSecret),
    );
    expect(JSON.stringify(r.body)).not.toContain(email);
    expect(JSON.stringify(r.body)).not.toContain(secret.token);
  });
  it.each(["resend", "revoke"])(
    "binds %s to original selected revision and fixed expiry without reading raw tokens",
    async (action) => {
      const f = setup();
      const r = await f.call(
        root + "/" + ids.access,
        "PATCH",
        actionBody(action),
      );
      expect(r.body.data).toEqual(receipt(action));
      const args = f.db.rpc.mock.calls.at(-1)[1];
      expect(args).toMatchObject({
        p_id: ids.access,
        p_action: action,
        p_form_revision: 3,
        p_target_revision: 2,
        p_version: ids.version,
        p_document: actionBody(action),
      });
      if (action === "revoke") {
        expect(args.p_prepared).toBeNull();
        expect(f.queries).toHaveLength(0);
      } else {
        const secret = decryptPayload(
          args.p_prepared.secretEncrypted,
          f.config.encryptionSecret,
        );
        expect(secret.email).toBe(email);
        expect(tokenHash(secret.token)).toBe(args.p_prepared.tokenHash);
        expect(f.queries[0].steps).toContainEqual(["eq", "form_id", ids.form]);
        expect(f.queries[0].steps[0][1]).not.toContain("token_hash");
      }
    },
  );
  it("acknowledges accepted POST before decrypting a subsequently erased recipient or generating another job", async () => {
    const f = setup();
    f.results.set("inspect_form_access_link_write", {
      committed: true,
      receipt: receipt("resend"),
    });
    f.single.set("form_access_tokens", null);
    const r = await f.call(
      root + "/" + ids.access,
      "PATCH",
      actionBody("resend"),
    );
    expect(r.body.data).toEqual(receipt("resend"));
    expect(f.queries).toHaveLength(0);
    expect(f.db.rpc.mock.calls.some(([n]) => n.startsWith("mutate_"))).toBe(
      false,
    );
  });
  it("keeps recovery read-only with no mutation quota or plaintext audience", async () => {
    const f = setup();
    f.results.set("inspect_form_access_link_write", {
      formId: ids.form,
      sourceId: ids.access,
      action: "revoke",
      committed: true,
      canRetry: false,
      formRevision: 4,
      publishedVersionId: ids.version,
      accessType: "invited",
      archived: true,
      target: {
        id: ids.access,
        revision: 3,
        type: "invited",
        responded: false,
        revoked: true,
        expiresAt: expiry,
        cooldownUntil: null,
        email,
        tokenHash: "private",
      },
      receipt: receipt("revoke"),
      recipients: [email],
    });
    const r = await f.call(
      root + `/recovery?action=revoke&sourceId=${ids.access}`,
    );
    expect(r.statusCode).toBe(200);
    expect(r.body.data.receipt).toEqual(receipt("revoke"));
    expect(JSON.stringify(r.body)).not.toMatch(/fictional-recipient|tokenHash/);
    expect(f.store.rateLimit).not.toHaveBeenCalled();
    expect(f.db.rpc).toHaveBeenLastCalledWith(
      "inspect_form_access_link_write",
      {
        p_actor: ids.actor,
        p_session: ids.session,
        p_form: ids.form,
        p_id: ids.access,
        p_action: "revoke",
        p_key_hash: tokenHash(f.key),
        p_request_hash: null,
      },
    );
  });
  it("returns current unaccepted batch metadata without a receipt, target or recipient data", async () => {
    const f = setup();
    f.results.set("inspect_form_access_link_write", {
      formId: ids.form,
      sourceId: null,
      action: "create",
      committed: false,
      canRetry: true,
      formRevision: 3,
      publishedVersionId: ids.version,
      accessType: "invited",
      archived: false,
      target: null,
      receipt: null,
      recipients: [email],
    });
    const r = await f.call(root + "/recovery?action=create");
    expect(r.statusCode).toBe(200);
    expect(r.body.data).toEqual({
      formId: ids.form,
      sourceId: null,
      action: "create",
      committed: false,
      canRetry: true,
      formRevision: 3,
      publishedVersionId: ids.version,
      accessType: "invited",
      archived: false,
      target: null,
      receipt: null,
    });
    expect(f.store.rateLimit).not.toHaveBeenCalled();
  });
  it.each([
    "?action=create&sourceId=" + ids.access,
    "?action=resend",
    "?action=rotate",
    "?action=create&actor=" + ids.actor,
    "?action=create&action=revoke",
  ])("rejects invalid original-outcome scope %s", async (q) => {
    const f = setup();
    expect((await f.call(root + "/recovery" + q)).statusCode).toBe(400);
  });
  it.each([
    { formRevision: 0 },
    { publishedVersionId: "wrong" },
    { recipients: [] },
    { recipients: Array(101).fill(email) },
    { confirmed: false },
    { expiresAt: "bad" },
    { type: "verified" },
    { actor: ids.actor },
    { expiresInDays: 7 },
  ])("rejects an unreviewed or injected batch field", async (patch) => {
    const f = setup();
    expect(
      (await f.call(root, "POST", { ...batch(), ...patch })).statusCode,
    ).toBe(400);
    expect(f.db.rpc.mock.calls.some(([n]) => n.startsWith("mutate_"))).toBe(
      false,
    );
  });
  it("requires key/CSRF, preserves quota, and handles unavailable selected recipient without a mutation", async () => {
    const f = setup();
    expect(
      (await f.call(root, "POST", batch(), { "idempotency-key": "" }))
        .statusCode,
    ).toBe(400);
    expect(
      (await f.call(root, "POST", batch(), { "x-csrf-token": "" })).body.error
        .code,
    ).toBe("CSRF_INVALID");
    f.store.rateLimit.mockResolvedValueOnce({ allowed: false, retryAfter: 25 });
    const rate = await f.call(root, "POST", batch());
    expect(rate.statusCode).toBe(429);
    expect(rate.headers.get("retry-after")).toBe("25");
    f.single.set("form_access_tokens", { intended_email_encrypted: null });
    expect(
      (await f.call(root + "/" + ids.access, "PATCH", actionBody("resend")))
        .statusCode,
    ).toBe(409);
    f.single.set("form_access_tokens", null);
    expect(
      (await f.call(root + "/" + ids.access, "PATCH", actionBody("resend")))
        .statusCode,
    ).toBe(409);
  });
  it.each([
    ["CONFLICT", 409],
    ["INVALID_STATE", 409],
    ["NOT_FOUND", 404],
    ["RESEND_COOLDOWN", 429],
  ])(
    "preserves transactional %s and never falls back to a legacy write",
    async (message, status) => {
      const f = setup();
      f.results.set("mutate_form_access_link_write", {
        error: { code: "P0001", message },
      });
      expect((await f.call(root, "POST", batch())).statusCode).toBe(status);
      expect(
        f.db.rpc.mock.calls.filter(([n]) => n.startsWith("mutate_")),
      ).toHaveLength(1);
      expect(
        f.db.rpc.mock.calls.some(([n]) =>
          ["queue_form_access", "change_form_access"].includes(n),
        ),
      ).toBe(false);
    },
  );
});
