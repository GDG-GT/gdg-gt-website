import { describe, it, expect, vi } from "vitest";
import { teamInvitationRoutes } from "../../server/team-invitations.mjs";
import { ApiError } from "../../server/lib/http.mjs";
import { token, tokenHash, hashSecret } from "../../server/lib/security.mjs";
const actor = "b1150000-0000-4000-8000-000000000001",
  sessionId = "b1150000-0000-4000-8000-000000000002",
  team = "b1150000-0000-4000-8000-000000000003",
  id = "b1150000-0000-4000-8000-000000000004",
  password = "Fictional invitation proof 2026!",
  hash = await hashSecret(password);
function fixture() {
  const cookie = token(),
    csrf = token(),
    config = {
      origin: "https://chapter.example.test",
      sessionCookie: "__Host-gdg_session",
      riskSecret: "fictional-risk",
      encryptionSecret: "fictional-invitation-encryption-secret",
    },
    account = {
      id: actor,
      email: "fictional-admin@example.test",
      role: "admin",
      is_active: true,
      password_hash: hash,
    },
    record = {
      id,
      team_id: team,
      email: "fictional-recipient@example.test",
      role: "member",
      status: "pending",
      expires_at: new Date(Date.now() + 60000).toISOString(),
      revision: 1,
    },
    store = {
      validateSession: vi.fn(async () => ({ sessionId, user: account })),
      csrf: vi.fn(async () => ({
        token_hash: tokenHash(csrf),
        expires_at: new Date(Date.now() + 60000).toISOString(),
      })),
      rateLimit: vi.fn(async () => ({ allowed: true })),
      accountByEmail: vi.fn(async () => account),
      recordLoginFailure: vi.fn(),
      audit: vi.fn(),
    },
    query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      order: () => query,
      range: vi.fn(async () => ({ data: [record], count: 1 })),
      maybeSingle: vi.fn(async () => ({ data: record })),
    },
    db = {
      from: vi.fn(() => query),
      rpc: vi.fn(async (name) => ({
        data: name === "can_operate_team" ? true : record,
      })),
    };
  async function call({
    method = "POST",
    suffix = "",
    body = { currentPassword: password, email: record.email, role: "member" },
    key = "fictional-invitation-retry-key-0001",
  } = {}) {
    const response = {
        setHeader() {},
        end(value) {
          this.body = JSON.parse(value);
        },
        statusCode: 200,
      },
      request = {
        url: "/api/v1/admin/teams/" + team + "/invitations" + suffix,
        method,
        body,
        headers: {
          origin: config.origin,
          cookie: config.sessionCookie + "=" + cookie,
          "x-csrf-token": csrf,
          "content-type": "application/json",
          ...(key === null ? {} : { "idempotency-key": key }),
        },
      };
    try {
      await teamInvitationRoutes(request, response, {
        db,
        store,
        config,
        requestId: id,
      });
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      response.statusCode = error.status;
      response.error = error;
    }
    return response;
  }
  return { call, db, store, query, record };
}
describe("Invitation mutation receipt transport", () => {
  it.each([null, "short", ["duplicated", "header"]])(
    "rejects retry identity %j without invoking a mutation",
    async (key) => {
      const f = fixture();
      expect((await f.call({ key })).statusCode).toBe(400);
      expect(
        f.db.rpc.mock.calls.some(
          ([name]) => name === "mutate_team_invite_workspace",
        ),
      ).toBe(false);
    },
  );
  it("binds trusted actor/proof and stable password-free intent despite rotating random capability material", async () => {
    const f = fixture();
    await f.call();
    await f.call();
    const args = f.db.rpc.mock.calls
      .filter(([name]) => name === "mutate_team_invite_workspace")
      .map(([, input]) => input);
    expect(args[0]).toMatchObject({
      p_actor: actor,
      p_session: sessionId,
      p_verified_hash: hash,
      p_team: team,
      p_id: null,
      p_action: "create",
      p_key_hash: tokenHash("fictional-invitation-retry-key-0001"),
    });
    expect(args[1].p_request_hash).toBe(args[0].p_request_hash);
    expect(args[1].p_hash).not.toBe(args[0].p_hash);
    expect(args[1].p_secret).not.toBe(args[0].p_secret);
    expect(JSON.stringify(args[0])).not.toContain(password);
    await f.call({
      body: {
        currentPassword: password,
        email: "changed@example.test",
        role: "member",
      },
    });
    expect(f.db.rpc.mock.calls.at(-1)[1].p_request_hash).not.toBe(
      args[0].p_request_hash,
    );
  });
  it.each(["resend", "revoke"])(
    "binds %s to the scoped invitation, action and original revision",
    async (action) => {
      const f = fixture();
      const response = await f.call({
        suffix: "/" + id,
        body: { currentPassword: password, action, revision: 1 },
      });
      expect(response.statusCode).toBe(200);
      expect(f.db.rpc.mock.calls.at(-1)[1]).toMatchObject({
        p_id: id,
        p_action: action,
        p_revision: 1,
        p_email: f.record.email,
      });
      expect(f.query.eq).toHaveBeenCalledWith("team_id", team);
    },
  );
  it("rejects a wrong current password before mutation and records only safe failure metadata", async () => {
    const f = fixture();
    const response = await f.call({
      body: {
        currentPassword: "Fictional wrong proof",
        email: f.record.email,
        role: "member",
      },
    });
    expect(response.statusCode).toBe(403);
    expect(response.error.code).toBe("PASSWORD_CONFIRMATION_FAILED");
    expect(f.store.recordLoginFailure).toHaveBeenCalledTimes(1);
    expect(
      f.db.rpc.mock.calls.some(
        ([name]) => name === "mutate_team_invite_workspace",
      ),
    ).toBe(false);
    expect(JSON.stringify(f.store.audit.mock.calls)).not.toContain(
      "wrong proof",
    );
  });
  it("rechecks a selected invitation with both team and ID boundaries and no retry identity", async () => {
    const f = fixture();
    const response = await f.call({
      method: "GET",
      suffix: "/" + id,
      key: null,
    });
    expect(response.statusCode).toBe(200);
    expect(response.body.data.record.id).toBe(id);
    expect(f.query.eq).toHaveBeenCalledWith("id", id);
    expect(f.query.eq).toHaveBeenCalledWith("team_id", team);
    expect(f.query.select.mock.calls[0][0]).not.toMatch(/token|secret/);
    expect(f.db.rpc.mock.calls).toHaveLength(1);
  });
  it("rechecks an exact normalized recipient with the ordinary private paging projection", async () => {
    const f = fixture();
    const response = await f.call({
      method: "GET",
      suffix: "?email=Fictional-Recipient%40example.test",
      key: null,
    });
    expect(response.statusCode).toBe(200);
    expect(f.query.eq).toHaveBeenCalledWith(
      "email",
      "fictional-recipient@example.test",
    );
    expect(response.body.data.items).toHaveLength(1);
    expect(f.db.rpc.mock.calls).toHaveLength(1);
  });
  it("conceals a selected invitation absent from the authorized team", async () => {
    const f = fixture();
    f.query.maybeSingle.mockResolvedValue({ data: null });
    expect((await f.call({ method: "GET", suffix: "/" + id })).statusCode).toBe(
      404,
    );
  });
  it("conceals all invitation reads and writes after current team authority is lost", async () => {
    const f = fixture();
    f.db.rpc.mockResolvedValue({ data: false });
    expect((await f.call()).statusCode).toBe(404);
    expect((await f.call({ method: "GET", suffix: "/" + id })).statusCode).toBe(
      404,
    );
    expect(f.db.from).not.toHaveBeenCalled();
  });
  it("rejects unknown selected-read query fields and invalid recipient lookup", async () => {
    const f = fixture();
    expect(
      (await f.call({ method: "GET", suffix: "/" + id + "?token=forbidden" }))
        .statusCode,
    ).toBe(400);
    expect(
      (await f.call({ method: "GET", suffix: "?email=not-an-email" }))
        .statusCode,
    ).toBe(400);
  });
});
