import { describe, it, expect, vi } from "vitest";
import { applicationHandler } from "../../server/handler.mjs";
import { userRoutes } from "../../server/users.mjs";
import {
  token,
  tokenHash,
  hashSecret,
  verifySecret,
} from "../../server/lib/security.mjs";
import { decryptPayload } from "../../server/lib/encryption.mjs";
const actor = "fb000000-0000-4000-8000-000000000001",
  targetId = "fb000000-0000-4000-8000-000000000002",
  sid = "fb000000-0000-4000-8000-000000000003";
const password = "Fictional-unit-confirmation-2026!",
  encryptionSecret = "fictional-encryption-test-secret-".repeat(2),
  passwordHash = await hashSecret(password);
function fixture(role = "super_admin") {
  const raw = token(),
    csrf = token(),
    user = {
      id: actor,
      email: "fictional-actor@example.test",
      role,
      is_active: true,
    };
  const target = {
    id: targetId,
    email: "fictional-target@example.test",
    display_name: "Fictional Target",
    role: "team_member",
    is_active: true,
    revision: 2,
  };
  const account = { ...user, password_hash: passwordHash },
    config = {
      origin: "https://chapter.example.test",
      sessionCookie: "__Host-gdg_session",
      riskSecret: "fictional-user-risk-secret",
      encryptionSecret,
    };
  const store = {
    validateSession: vi.fn(async () => ({ sessionId: sid, user })),
    csrf: vi.fn(async () => ({
      token_hash: tokenHash(csrf),
      expires_at: new Date(Date.now() + 60000).toISOString(),
    })),
    rateLimit: vi.fn(async () => ({ allowed: true })),
    accountByEmail: vi.fn(async () => account),
    recordLoginFailure: vi.fn(),
    audit: vi.fn(),
  };
  const queries = [],
    db = {
      from: vi.fn((table) => {
        const query = { table, steps: [] };
        queries.push(query);
        const chain = {};
        for (const method of [
          "select",
          "eq",
          "is",
          "not",
          "gt",
          "order",
          "limit",
          "range",
          "ilike",
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
              : table === "admin_sessions"
                ? { data: [{ id: sid }], error: null }
                : query.steps.some(([method]) => method === "maybeSingle")
                  ? {
                      data: target.exists === false ? null : target,
                      error: null,
                    }
                  : { data: [target], count: 1, error: null },
          ).then(resolve, reject);
        return chain;
      }),
      rpc: vi.fn(async (name) => ({
        data: name === "complete_account_access" ? true : { ...target },
        error: null,
      })),
    };
  const handler = applicationHandler({ db, store, config });
  async function call(
    path = "/admin/users",
    method = "GET",
    body,
    headers = {},
  ) {
    const response = {
      statusCode: 200,
      headers: new Map(),
      setHeader(name, value) {
        this.headers.set(name.toLowerCase(), value);
      },
      end(value) {
        this.body = JSON.parse(value);
      },
    };
    await handler(
      {
        url: "/api/v1" + path,
        method,
        body,
        headers: {
          origin: config.origin,
          cookie: config.sessionCookie + "=" + raw,
          "x-csrf-token": csrf,
          "content-type": "application/json",
          ...headers,
        },
        socket: { remoteAddress: "127.0.0.1" },
      },
      response,
    );
    return response;
  }
  const record = {
    email: " New-Fictional@Example.test ",
    display_name: "Fictional New Officer",
    role: "team_member",
  };
  const create = (change = {}) =>
    call("/admin/users", "POST", {
      currentPassword: password,
      record,
      ...change,
    });
  const mutate = (action = "deactivate", change = {}) =>
    call("/admin/users/" + targetId, "POST", {
      currentPassword: password,
      revision: 2,
      action,
      confirmation: target.email,
      ...change,
    });
  return {
    call,
    create,
    mutate,
    user,
    target,
    account,
    config,
    db,
    store,
    queries,
    record,
    csrf,
  };
}
describe("AUTH/ADMIN account lifecycle route boundary", () => {
  it("rejects unrelated paths, anonymous/non-admin roles and forbidden methods before account lookup", async () => {
    const f = fixture();
    expect(
      await userRoutes({ url: "/api/v1/unrelated" }, {}, { config: f.config }),
    ).toBe(false);
    expect(
      (await f.call("/admin/users", "GET", undefined, { cookie: "" }))
        .statusCode,
    ).toBe(401);
    expect((await f.call("/admin/users", "DELETE")).statusCode).toBe(405);
    expect(
      (await f.call("/admin/users/" + targetId + "/sessions", "POST", {}))
        .statusCode,
    ).toBe(405);
    for (const role of ["team_member", "blog_editor"]) {
      f.user.role = role;
      expect((await f.call()).statusCode).toBe(403);
    }
    expect(f.db.from).not.toHaveBeenCalled();
  });
  it("lists safe directory fields with exact scope, escaped literal search and server pagination only for Super Admin", async () => {
    const f = fixture(),
      q = new URLSearchParams({
        q: "fic%_\\",
        state: "active",
        role: "team_member",
        page: "2",
        pageSize: "10",
      });
    const r = await f.call("/admin/users?" + q);
    expect(r.body.data).toMatchObject({
      total: 1,
      page: 2,
      pageSize: 10,
      actorId: actor,
    });
    const steps = f.queries[0].steps;
    expect(steps).toContainEqual(["is", "deleted_at", null]);
    expect(steps).toContainEqual(["eq", "is_active", true]);
    expect(steps).toContainEqual(["eq", "role", "team_member"]);
    expect(steps).toContainEqual(["ilike", "email", "%fic\\%\\_\\\\%"]);
    expect(steps).toContainEqual(["range", 10, 19]);
    expect(steps[0][1]).not.toMatch(/password_hash|token_hash/);
    f.user.role = "admin";
    expect((await f.call()).statusCode).toBe(403);
  });
  it("supports current, inactive and archived inventories but rejects duplicate/unknown/oversized filters", async () => {
    const f = fixture();
    await f.call();
    expect(f.queries.at(-1).steps).toContainEqual(["is", "deleted_at", null]);
    await f.call("/admin/users?state=inactive");
    expect(f.queries.at(-1).steps).toContainEqual(["eq", "is_active", false]);
    await f.call("/admin/users?state=archived");
    expect(f.queries.at(-1).steps).toContainEqual([
      "not",
      "deleted_at",
      "is",
      null,
    ]);
    for (const q of [
      "?state=unknown",
      "?role=owner",
      "?pageSize=101",
      "?q=a&q=b",
      "?includeSecrets=true",
    ])
      expect((await f.call("/admin/users" + q)).statusCode).toBe(400);
  });
  it("protects exact target/session reads and never returns another-account directory to ordinary Admin", async () => {
    const f = fixture("admin");
    expect((await f.call("/admin/users/" + targetId)).body.data.record.id).toBe(
      targetId,
    );
    const r = await f.call("/admin/users/" + targetId + "/sessions");
    expect(r.body.data.items).toEqual([{ id: sid }]);
    expect(f.queries.at(-1).steps).toContainEqual([
      "eq",
      "admin_user_id",
      targetId,
    ]);
    expect(f.queries.at(-1).steps).toContainEqual(["limit", 100]);
    expect(f.queries.at(-1).steps[0][1]).not.toContain("token");
    f.target.role = "admin";
    expect((await f.call("/admin/users/" + targetId)).statusCode).toBe(403);
    f.user.role = "super_admin";
    f.target.id = actor;
    expect((await f.call("/admin/users/" + targetId)).statusCode).toBe(403);
    f.target.exists = false;
    expect((await f.call("/admin/users/" + targetId)).statusCode).toBe(404);
    expect((await f.call("/admin/users/not-a-uuid")).statusCode).toBe(400);
  });
  it("requires CSRF and mutation quota before current-password verification", async () => {
    const f = fixture();
    expect(
      (
        await f.call(
          "/admin/users",
          "POST",
          { currentPassword: password, record: f.record },
          { "x-csrf-token": "" },
        )
      ).body.error.code,
    ).toBe("CSRF_INVALID");
    expect(f.store.accountByEmail).not.toHaveBeenCalled();
    f.store.rateLimit.mockResolvedValue({ allowed: false, retryAfter: 45 });
    const r = await f.create();
    expect(r.statusCode).toBe(429);
    expect(r.headers.get("retry-after")).toBe("45");
    expect(f.store.accountByEmail).not.toHaveBeenCalled();
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it("rejects injected role/ownership and passwordless or malformed mutations", async () => {
    const f = fixture();
    for (const change of [
      { currentPassword: "" },
      { record: { ...f.record, password: "injected" } },
      { record: { ...f.record, role: "owner" } },
      { created_by: actor },
    ])
      expect((await f.create(change)).statusCode).toBe(400);
    expect(
      (
        await f.call("/admin/users/" + targetId, "PATCH", {
          currentPassword: password,
          revision: 0,
          record: { display_name: "Fictional", role: "team_member" },
        })
      ).statusCode,
    ).toBe(400);
    expect((await f.mutate("delete")).statusCode).toBe(400);
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it("audits a failed confirmation without recording its password and rejects a missing/locked current account", async () => {
    const f = fixture();
    let r = await f.create({ currentPassword: "wrong fictional password" });
    expect(r.body.error.code).toBe("PASSWORD_CONFIRMATION_FAILED");
    expect(f.store.recordLoginFailure).toHaveBeenCalledWith(f.account);
    expect(f.store.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: actor,
        action: "users.confirmation_failed",
        result: "denied",
      }),
    );
    expect(JSON.stringify(f.store.audit.mock.calls)).not.toContain(
      "wrong fictional",
    );
    f.store.accountByEmail.mockResolvedValueOnce(null);
    r = await f.create();
    expect(r.statusCode).toBe(403);
    f.account.locked_until = new Date(Date.now() + 60000).toISOString();
    r = await f.create();
    expect(r.body.error.code).toBe("FORBIDDEN");
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it("creates an unusable random credential and encrypted intended-recipient setup capability, never a plaintext response", async () => {
    const f = fixture(),
      r = await f.create();
    expect(r.statusCode).toBe(200);
    expect(r.body.data.accessQueued).toBe(true);
    const [name, args] = f.db.rpc.mock.calls.at(-1);
    expect(name).toBe("mutate_account");
    expect(args).toMatchObject({
      p_actor: actor,
      p_session: sid,
      p_verified_hash: passwordHash,
      p_target: null,
      p_action: "create",
      p_revision: null,
    });
    expect(args.p_document).toMatchObject({
      email: "new-fictional@example.test",
      display_name: "Fictional New Officer",
      role: "team_member",
    });
    expect(await verifySecret(password, args.p_document.passwordHash)).toBe(
      false,
    );
    const secret = decryptPayload(args.p_secret, encryptionSecret);
    expect(secret.email).toBe("new-fictional@example.test");
    expect(tokenHash(secret.token)).toBe(args.p_token_hash);
    expect(JSON.stringify(r.body)).not.toContain(secret.token);
    expect(JSON.stringify(r.body)).not.toContain(args.p_secret);
    expect(JSON.stringify(r.body)).not.toContain("password_hash");
  });
  it("updates permitted target roles with current hash/revision and rejects subordinate promotion", async () => {
    const f = fixture("admin"),
      record = { display_name: "Fictional Updated", role: "blog_editor" };
    const r = await f.call("/admin/users/" + targetId, "PATCH", {
      currentPassword: password,
      revision: 2,
      record,
    });
    expect(r.statusCode).toBe(200);
    expect(r.body.data.accessQueued).toBe(false);
    expect(f.db.rpc).toHaveBeenLastCalledWith(
      "mutate_account",
      expect.objectContaining({
        p_action: "update",
        p_target: targetId,
        p_revision: 2,
        p_document: record,
        p_secret: null,
        p_token_hash: null,
      }),
    );
    expect(
      (
        await f.call("/admin/users/" + targetId, "PATCH", {
          currentPassword: password,
          revision: 2,
          record: { ...record, role: "admin" },
        })
      ).statusCode,
    ).toBe(403);
  });
  it("requires exact email confirmation for lifecycle actions and creates a separate reset-only capability", async () => {
    const f = fixture();
    expect(
      (await f.mutate("deactivate", { confirmation: "partial" })).statusCode,
    ).toBe(400);
    for (const operation of [
      "activate",
      "deactivate",
      "archive",
      "restore",
      "revoke_sessions",
      "reset",
    ]) {
      const r = await f.mutate(operation);
      expect(r.statusCode).toBe(200);
      expect(r.body.data.accessQueued).toBe(operation === "reset");
      const args = f.db.rpc.mock.calls.at(-1)[1];
      expect(args.p_action).toBe(operation);
      expect(args.p_document).toEqual({});
      if (operation === "reset") {
        const value = decryptPayload(args.p_secret, encryptionSecret);
        expect(value.email).toBe(f.target.email);
        expect(tokenHash(value.token)).toBe(args.p_token_hash);
      } else {
        expect(args.p_secret).toBeNull();
        expect(args.p_token_hash).toBeNull();
      }
    }
  });
  it("propagates current transactional account/revision/last-admin denials instead of false success", async () => {
    const f = fixture();
    f.db.rpc.mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "LAST_SUPER_ADMIN" },
    });
    const r = await f.mutate();
    expect(r.statusCode).toBe(409);
    expect(r.body.error.code).toBe("LAST_SUPER_ADMIN");
  });
  it("hashes setup capabilities and new credentials, normalizes recipient and does not create a session", async () => {
    const f = fixture(),
      raw = token(),
      newPassword = "Fictional-new-password!2026";
    const r = await f.call("/account/setup", "POST", {
      token: raw,
      email: " Intended@Example.test ",
      newPassword,
    });
    expect(r.body.data).toEqual({ completed: true });
    const [name, args] = f.db.rpc.mock.calls.at(-1);
    expect(name).toBe("complete_account_access");
    expect(args.p_hash).toBe(tokenHash(raw));
    expect(args.p_email).toBe("intended@example.test");
    expect(await verifySecret(newPassword, args.p_password_hash)).toBe(true);
    expect(f.store.rateLimit.mock.calls.map((c) => c[0])).toEqual([
      "account.setup.ip",
      "account.setup.token",
    ]);
    expect(f.store.validateSession).not.toHaveBeenCalled();
    expect(r.headers.has("set-cookie")).toBe(false);
  });
  it("rate-limits setup before hashing, rejects unsafe inputs and treats expired/replayed links uniformly", async () => {
    const f = fixture(),
      body = {
        token: token(),
        email: "fictional@example.test",
        newPassword: "Fictional-new-password!2026",
      };
    expect((await f.call("/account/setup", "GET")).statusCode).toBe(405);
    f.store.rateLimit.mockResolvedValueOnce({ allowed: false, retryAfter: 60 });
    expect((await f.call("/account/setup", "POST", body)).statusCode).toBe(429);
    expect(f.db.rpc).not.toHaveBeenCalled();
    for (const change of [
      { token: "short" },
      { newPassword: "short" },
      { role: "super_admin" },
    ])
      expect(
        (await f.call("/account/setup", "POST", { ...body, ...change }))
          .statusCode,
      ).toBe(400);
    f.store.rateLimit
      .mockResolvedValueOnce({ allowed: true })
      .mockResolvedValueOnce({ allowed: false, retryAfter: 60 });
    expect((await f.call("/account/setup", "POST", body)).statusCode).toBe(429);
    f.db.rpc.mockResolvedValue({ data: false, error: null });
    expect((await f.call("/account/setup", "POST", body)).body.error.code).toBe(
      "ACCESS_LINK_INVALID",
    );
  });
});
