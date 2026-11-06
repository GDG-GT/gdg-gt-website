import { describe, it, expect, vi } from "vitest";
import { applicationHandler } from "../../server/handler.mjs";
import { formAccessRoutes } from "../../server/form-access.mjs";
import { token, tokenHash, riskHash } from "../../server/lib/security.mjs";
import {
  encryptPayload,
  decryptPayload,
} from "../../server/lib/encryption.mjs";
const actor = "fe000000-0000-4000-8000-000000000001",
  sid = "fe000000-0000-4000-8000-000000000002",
  form = "fe000000-0000-4000-8000-000000000003",
  invite = "fe000000-0000-4000-8000-000000000004",
  team = "fe000000-0000-4000-8000-000000000005",
  peer = "fe000000-0000-4000-8000-000000000006",
  publishedVersion = "fe000000-0000-4000-8000-000000000007";
const expected = { formRevision: 1, publishedVersionId: publishedVersion };
const expiresAt = () => new Date(Date.now() + 3 * 86400000).toISOString();
const linkBody = (action) => ({
  ...expected,
  revision: 1,
  action,
  ...(action === "resend" ? { expiresAt: expiresAt() } : {}),
});
const secret = "fictional-form-access-encryption-".repeat(2),
  address = "fictional-recipient@example.test";
function fixture() {
  const raw = token(),
    csrf = token(),
    config = {
      origin: "https://chapter.example.test",
      sessionCookie: "__Host-gdg_session",
      riskSecret: "fictional-form-access-risk",
      encryptionSecret: secret,
    },
    store = {
      validateSession: vi.fn(async () => ({
        sessionId: sid,
        user: {
          id: actor,
          email: "fictional-officer@example.test",
          role: "admin",
          is_active: true,
        },
      })),
      csrf: vi.fn(async () => ({
        token_hash: tokenHash(csrf),
        expires_at: new Date(Date.now() + 60000).toISOString(),
      })),
      rateLimit: vi.fn(async () => ({ allowed: true })),
      audit: vi.fn(),
    },
    queries = [],
    single = new Map([
      ["forms", { id: form, team_id: team, owner_id: actor }],
      [
        "form_access_tokens",
        {
          intended_email_encrypted: encryptPayload({ email: address }, secret),
        },
      ],
    ]),
    lists = new Map([
      ["team_memberships", [{ admin_user_id: peer }]],
      [
        "admin_users",
        [
          { id: peer, display_name: "Fictional Member", role: "team_member" },
          { id: actor, role: "admin" },
          { id: team, display_name: "Fictional Outsider", role: "team_member" },
          { id: invite, display_name: "Fictional Admin", role: "super_admin" },
        ],
      ],
      [
        "form_access_tokens",
        [
          {
            id: invite,
            token_type: "invited",
            intended_email_encrypted: encryptPayload(
              { email: address },
              secret,
            ),
            used_count: 1,
          },
        ],
      ],
    ]),
    results = new Map([
      ["can_operate_form", true],
      [
        "read_form_collaborator_accounts",
        {
          items: [
            {
              id: peer,
              display_name: "Fictional Member",
              role: "team_member",
              actions: [],
            },
          ],
          total: 130,
          page: 1,
          pageSize: 30,
        },
      ],
      ["request_form_verification", {}],
      ["inspect_form_access_link_write", { committed: false }],
      [
        "mutate_form_access_link_write",
        ({ p_id, p_action, p_prepared }) => ({
          formId: form,
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
      ],
      [
        "read_form_access_links",
        () => ({
          items: lists.get("form_access_tokens"),
          total: lists.get("form_access_tokens").length,
        }),
      ],
    ]);
  const db = {
      rpc: vi.fn(async (name, args) => {
        const v = results.get(name),
          r = typeof v === "function" ? v(args) : v;
        return r?.error
          ? { data: null, error: r.error }
          : { data: r, error: null };
      }),
      from: vi.fn((table) => {
        const query = { table, steps: [] };
        queries.push(query);
        const chain = {};
        for (const method of [
          "select",
          "eq",
          "neq",
          "or",
          "order",
          "range",
          "limit",
          "single",
          "maybeSingle",
        ])
          chain[method] = (...args) => {
            query.steps.push([method, ...args]);
            return chain;
          };
        chain.then = (resolve, reject) =>
          Promise.resolve(
            query.error
              ? { data: null, error: query.error }
              : query.steps.some(([method]) =>
                    ["single", "maybeSingle"].includes(method),
                  )
                ? { data: single.get(table), error: null }
                : {
                    data: lists.get(table) || [],
                    count: (lists.get(table) || []).length,
                    error: null,
                  },
          ).then(resolve, reject);
        return chain;
      }),
    },
    app = applicationHandler({ db, store, config });
  async function call(
    path = `/admin/forms/${form}/invitations`,
    method = "GET",
    body,
    headers = {},
  ) {
    const r = {
      statusCode: 200,
      headers: new Map(),
      setHeader(name, value) {
        this.headers.set(name.toLowerCase(), value);
      },
      end(value) {
        this.body = JSON.parse(value);
      },
    };
    await app(
      {
        url: "/api/v1" + path,
        method,
        body,
        headers: {
          origin: config.origin,
          cookie: config.sessionCookie + "=" + raw,
          "x-csrf-token": csrf,
          "idempotency-key": "fictional-form-access-idempotency",
          "content-type": "application/json",
          ...headers,
        },
        socket: { remoteAddress: "127.0.0.1" },
      },
      r,
    );
    return r;
  }
  return { call, store, db, queries, single, lists, results, config };
}
describe("FORM-008/030 private invitation and verification route boundary", () => {
  it("ignores unrelated routes and rejects invalid methods, anonymous clients and foreign origin before private lookups", async () => {
    const f = fixture();
    expect(
      await formAccessRoutes(
        { url: "/api/v1/unrelated" },
        {},
        { config: f.config },
      ),
    ).toBe(false);
    expect(
      (await f.call(undefined, "GET", undefined, { cookie: "" })).statusCode,
    ).toBe(401);
    expect(
      (
        await f.call(
          undefined,
          "POST",
          {},
          { origin: "https://other.example.test" },
        )
      ).statusCode,
    ).toBe(403);
    expect((await f.call(undefined, "DELETE")).statusCode).toBe(405);
    expect((await f.call("/forms/fictional/verify", "GET")).statusCode).toBe(
      405,
    );
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it("requires current manage-access permission and CSRF for writes; quota denial cannot queue invitations", async () => {
    const f = fixture();
    f.results.set("can_operate_form", false);
    expect((await f.call()).statusCode).toBe(404);
    f.results.set("can_operate_form", true);
    expect(
      (await f.call(undefined, "POST", {}, { "x-csrf-token": "" })).body.error
        .code,
    ).toBe("CSRF_INVALID");
    f.store.rateLimit.mockResolvedValueOnce({ allowed: false, retryAfter: 60 });
    const r = await f.call(undefined, "POST", {});
    expect(r.statusCode).toBe(429);
    expect(r.headers.get("retry-after")).toBe("60");
    expect(
      f.db.rpc.mock.calls.every(([name]) => name === "can_operate_form"),
    ).toBe(true);
  });
  it("masks recipient inventory, scopes before pagination and audits identifiers/count only", async () => {
    const f = fixture(),
      r = await f.call(`/admin/forms/${form}/invitations?page=2&pageSize=10`);
    expect(r.statusCode).toBe(200);
    expect(r.body.data).toMatchObject({
      total: 1,
      page: 2,
      pageSize: 10,
      items: [
        { id: invite, recipientHint: "fi…@example.test", responded: true },
      ],
    });
    expect(JSON.stringify(r.body)).not.toContain(address);
    expect(JSON.stringify(r.body)).not.toContain("intended_email_encrypted");
    expect(f.db.rpc).toHaveBeenLastCalledWith("read_form_access_links", {
      p_actor: actor,
      p_session: sid,
      p_form: form,
      p_page: 2,
      p_size: 10,
    });
    expect(f.queries).toHaveLength(0);
    expect(f.store.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: actor,
        targetId: form,
        metadata: { count: 1 },
      }),
    );
    expect(JSON.stringify(f.store.audit.mock.calls)).not.toContain(address);
    f.lists.set("form_access_tokens", [
      { ...f.lists.get("form_access_tokens")[0], used_count: 0 },
    ]);
    expect((await f.call()).body.data.items[0].responded).toBe(false);
  });
  it("delegates bounded candidate search/paging to the actor-bound scoped inventory", async () => {
    const f = fixture(),
      path = `/admin/forms/${form}/collaborator-candidates`,
      r = await f.call(path);
    expect(r.body.data.total).toBe(130);
    expect(f.db.rpc).toHaveBeenLastCalledWith(
      "read_form_collaborator_accounts",
      {
        p_actor: actor,
        p_form: form,
        p_session: sid,
        p_kind: "candidates",
        p_page: 1,
        p_size: 30,
        p_query: null,
      },
    );
    await f.call(path + "?page=4&pageSize=25&q=%20Fictional%20%25%20");
    expect(f.db.rpc).toHaveBeenLastCalledWith(
      "read_form_collaborator_accounts",
      {
        p_actor: actor,
        p_form: form,
        p_session: sid,
        p_kind: "candidates",
        p_page: 4,
        p_size: 25,
        p_query: "Fictional %",
      },
    );
    expect(f.queries).toHaveLength(0);
    for (const query of [
      "page=0",
      "page=10001",
      "pageSize=101",
      "q=" + "x".repeat(101),
      "actor=" + peer,
      "page=1&page=2",
    ])
      expect((await f.call(path + "?" + query)).statusCode).toBe(400);
    f.results.set("read_form_collaborator_accounts", {
      error: { code: "P0001", message: "NOT_FOUND" },
    });
    expect((await f.call(path)).statusCode).toBe(404);
  });
  it("normalizes/deduplicates approved recipients and sends only hashed/encrypted server-generated capabilities to the atomic queue", async () => {
    const f = fixture(),
      body = {
        type: "invited",
        recipients: [" Fictional-Recipient@Example.test ", address],
        confirmed: true,
        ...expected,
        expiresAt: expiresAt(),
      };
    const r = await f.call(undefined, "POST", body);
    expect(r.body.data).toEqual({
      formId: form,
      sourceId: null,
      action: "create",
      queued: 1,
      existing: 0,
      total: 1,
    });
    const [name, args] = f.db.rpc.mock.calls.at(-1);
    expect(name).toBe("mutate_form_access_link_write");
    expect(args).toMatchObject({
      p_actor: actor,
      p_form: form,
      p_action: "create",
      p_session: sid,
      p_form_revision: 1,
      p_version: publishedVersion,
      p_key_hash: tokenHash("fictional-form-access-idempotency"),
    });
    expect(args.p_prepared).toHaveLength(1);
    const recipient = args.p_prepared[0],
      value = decryptPayload(recipient.secretEncrypted, secret);
    expect(value.email).toBe(address);
    expect(tokenHash(value.token)).toBe(recipient.tokenHash);
    expect(recipient.emailHash).toBe(
      riskHash("form-recipient:" + form + ":" + address, f.config.riskSecret),
    );
    expect(decryptPayload(recipient.emailEncrypted, secret)).toEqual({
      email: address,
    });
    expect(recipient.expiresAt).toBe(body.expiresAt);
    expect(JSON.stringify(r.body)).not.toContain(value.token);
    expect(JSON.stringify(r.body)).not.toContain(address);
  });
  it("rejects unconfirmed/malformed/oversized/mass-assigned recipients and missing idempotency before queue mutation", async () => {
    const f = fixture(),
      body = {
        ...expected,
        type: "unlisted",
        recipients: [address],
        expiresAt: expiresAt(),
        confirmed: true,
      };
    for (const change of [
      { confirmed: false },
      { recipients: [] },
      { recipients: Array(101).fill(address) },
      { expiresInDays: 31 },
      { expiresAt: "bad" },
      { formRevision: 0 },
      { type: "verified" },
      { actorId: actor },
    ])
      expect(
        (await f.call(undefined, "POST", { ...body, ...change })).statusCode,
      ).toBe(400);
    expect(
      (await f.call(undefined, "POST", body, { "idempotency-key": "" }))
        .statusCode,
    ).toBe(400);
    expect(
      f.db.rpc.mock.calls.every(([name]) => name === "can_operate_form"),
    ).toBe(true);
    for (const path of [
      `/admin/forms/${form}/invitations?page=1&page=2`,
      `/admin/forms/${form}/invitations?pageSize=101`,
      `/admin/forms/${form}/invitations?includeTokens=true`,
    ])
      expect((await f.call(path)).statusCode).toBe(400);
  });
  it("revokes without reading raw token material and rotates resend only for the exact form/invitation", async () => {
    const f = fixture(),
      path = `/admin/forms/${form}/invitations/${invite}`;
    expect((await f.call(path, "PATCH", linkBody("revoke"))).body.data).toEqual(
      {
        formId: form,
        sourceId: invite,
        action: "revoke",
        queued: 0,
        existing: 0,
        total: 1,
      },
    );
    expect(f.db.from).not.toHaveBeenCalled();
    expect(f.db.rpc).toHaveBeenLastCalledWith(
      "mutate_form_access_link_write",
      expect.objectContaining({
        p_actor: actor,
        p_form: form,
        p_id: invite,
        p_action: "revoke",
        p_session: sid,
        p_target_revision: 1,
        p_prepared: null,
      }),
    );
    expect((await f.call(path, "PATCH", linkBody("resend"))).statusCode).toBe(
      200,
    );
    const args = f.db.rpc.mock.calls.at(-1)[1],
      value = decryptPayload(args.p_prepared.secretEncrypted, secret);
    expect(tokenHash(value.token)).toBe(args.p_prepared.tokenHash);
    expect(value.email).toBe(address);
    expect(f.queries[0].steps).toContainEqual(["eq", "id", invite]);
    expect(f.queries[0].steps).toContainEqual(["eq", "form_id", form]);
    f.single.set("form_access_tokens", null);
    expect((await f.call(path, "PATCH", linkBody("resend"))).statusCode).toBe(
      409,
    );
    expect((await f.call(path, "PATCH", { action: "reveal" })).statusCode).toBe(
      400,
    );
    expect((await f.call(path, "GET")).statusCode).toBe(405);
  });
  it("verification always returns the same generic response for missing forms, honeypots or email cooldown", async () => {
    const f = fixture(),
      path = "/forms/fictional/verify",
      body = { email: address };
    f.single.set("forms", null);
    const missing = await f.call(path, "POST", body);
    expect(missing.statusCode).toBe(200);
    expect(f.db.rpc).not.toHaveBeenCalled();
    f.store.rateLimit.mockImplementation(async (scope) => ({
      allowed: scope !== "forms.verify.email",
    }));
    const limited = await f.call(path, "POST", body);
    expect(limited.body.data).toEqual(missing.body.data);
    f.store.rateLimit.mockResolvedValue({ allowed: true });
    const honeypot = await f.call(path, "POST", {
      ...body,
      website: "fictional bot value",
    });
    expect(honeypot.body.data).toEqual(missing.body.data);
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it("applies IP then email quotas and prepares a purpose-bound verification link without authenticating a visitor", async () => {
    const f = fixture(),
      r = await f.call(
        "/forms/fictional/verify",
        "POST",
        { email: " Fictional-Recipient@Example.test " },
        { cookie: "" },
      );
    expect(r.statusCode).toBe(200);
    expect(f.store.validateSession).not.toHaveBeenCalled();
    expect(f.store.rateLimit.mock.calls.map((c) => [c[0], c[2]])).toEqual([
      ["forms.verify.ip", 20],
      ["forms.verify.email", 5],
    ]);
    const [name, args] = f.db.rpc.mock.calls.at(-1);
    expect(name).toBe("request_form_verification");
    expect(args.p_form).toBe(form);
    const payload = decryptPayload(args.p_secret, secret);
    expect(tokenHash(payload.token)).toBe(args.p_token_hash);
    expect(payload.email).toBe(address);
    expect(JSON.stringify(r.body)).not.toContain(address);
  });
  it("blocks verification IP abuse and handles invalid slugs and transactional invitation failures safely", async () => {
    const f = fixture();
    f.store.rateLimit.mockResolvedValueOnce({ allowed: false, retryAfter: 90 });
    expect(
      (await f.call("/forms/fictional/verify", "POST", { email: address }))
        .statusCode,
    ).toBe(429);
    expect(f.db.rpc).not.toHaveBeenCalled();
    expect(
      (await f.call("/forms/INVALID/verify", "POST", { email: address }))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await f.call("/forms/fictional/verify", "POST", {
          email: address,
          verified: true,
        })
      ).statusCode,
    ).toBe(400);
    f.results.set("mutate_form_access_link_write", {
      error: { code: "P0001", message: "RESEND_COOLDOWN" },
    });
    expect(
      (
        await f.call(`/admin/forms/${form}/invitations/${invite}`, "PATCH", {
          ...linkBody("resend"),
        })
      ).body.error.code,
    ).toBe("RESEND_COOLDOWN");
  });
});
