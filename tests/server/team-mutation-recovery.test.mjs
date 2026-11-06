import { describe, it, expect, vi } from "vitest";
import { teamRoutes } from "../../server/teams.mjs";
import { ApiError } from "../../server/lib/http.mjs";
import { token, tokenHash, hashSecret } from "../../server/lib/security.mjs";
const actor = "b1140000-0000-4000-8000-000000000001",
  sessionId = "b1140000-0000-4000-8000-000000000002",
  teamId = "b1140000-0000-4000-8000-000000000003",
  memberId = "b1140000-0000-4000-8000-000000000004",
  destinationId = "b1140000-0000-4000-8000-000000000005",
  password = "Fictional-team-proof-2026!",
  hash = await hashSecret(password);
function fixture() {
  const raw = token(),
    csrf = token(),
    config = {
      origin: "https://chapter.example.test",
      sessionCookie: "__Host-gdg_session",
      riskSecret: "fictional-team-risk",
    };
  const account = {
    id: actor,
    email: "fictional-team@example.test",
    role: "admin",
    is_active: true,
    password_hash: hash,
  };
  const store = {
    validateSession: vi.fn(async () => ({ sessionId, user: account })),
    csrf: vi.fn(async () => ({
      token_hash: tokenHash(csrf),
      expires_at: new Date(Date.now() + 60000).toISOString(),
    })),
    rateLimit: vi.fn(async () => ({ allowed: true })),
    accountByEmail: vi.fn(async () => account),
    recordLoginFailure: vi.fn(),
    audit: vi.fn(),
  };
  const query = {
    select: () => query,
    eq: () => query,
    single: async () => ({ data: { name: "Fictional team" } }),
  };
  const db = {
    from: vi.fn(() => query),
    rpc: vi.fn(async (name) => ({
      data:
        name === "can_operate_team"
          ? true
          : {
              team: { id: teamId, name: "Fictional team", revision: 2 },
              actions: { permissions: true },
              members: [],
            },
    })),
  };
  const record = {
    name: "Fictional team",
    slug: "fictional-team",
    leadId: actor,
  };
  async function call({
    method = "POST",
    suffix = "",
    body = { currentPassword: password, record },
    key = "fictional-team-retry-key-000001",
  } = {}) {
    const response = {
      statusCode: 200,
      setHeader() {},
      end(value) {
        this.body = JSON.parse(value);
      },
    };
    const request = {
      url: "/api/v1/admin/teams" + suffix,
      method,
      body,
      headers: {
        origin: config.origin,
        cookie: config.sessionCookie + "=" + raw,
        "x-csrf-token": csrf,
        "content-type": "application/json",
        ...(key === null ? {} : { "idempotency-key": key }),
      },
    };
    try {
      await teamRoutes(request, response, {
        db,
        store,
        config,
        requestId: teamId,
      });
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      response.statusCode = error.status;
      response.error = error;
    }
    return response;
  }
  return { call, db, record, store };
}
describe("Team mutation receipt transport", () => {
  it.each([null, "short", ["duplicated", "header"]])(
    "rejects retry identity %j before business mutation",
    async (key) => {
      const f = fixture();
      expect((await f.call({ key })).statusCode).toBe(400);
      expect(
        f.db.rpc.mock.calls.some(([name]) => name === "mutate_team_workspace"),
      ).toBe(false);
    },
  );
  it("binds trusted actor/session/password proof and hashes stable password-free intent", async () => {
    const f = fixture();
    await f.call();
    await f.call();
    const inputs = f.db.rpc.mock.calls
      .filter(([name]) => name === "mutate_team_workspace")
      .map(([, input]) => input);
    expect(inputs[0]).toMatchObject({
      p_actor: actor,
      p_session: sessionId,
      p_verified_hash: hash,
      p_team: null,
      p_action: "create",
      p_revision: null,
      p_key_hash: tokenHash("fictional-team-retry-key-000001"),
    });
    expect(inputs[0].p_request_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(inputs[1].p_request_hash).toBe(inputs[0].p_request_hash);
    expect(JSON.stringify(inputs[0].p_document)).not.toContain(password);
    await f.call({
      body: {
        currentPassword: password,
        record: { ...f.record, name: "Changed intent" },
      },
    });
    expect(f.db.rpc.mock.calls.at(-1)[1].p_request_hash).not.toBe(
      inputs[0].p_request_hash,
    );
  });
  it.each([
    ["archive", { confirmation: "Fictional team" }],
    ["restore", { confirmation: "Fictional team" }],
    ["permissions", { confirmation: "Fictional team", grants: [] }],
    ["member_add", { email: "fictional-member@example.test", role: "member" }],
    [
      "member_remove",
      { membershipId: memberId, membershipRevision: 3, role: "member" },
    ],
    [
      "member_role",
      { membershipId: memberId, membershipRevision: 3, role: "co_lead" },
    ],
    [
      "member_transfer",
      {
        membershipId: memberId,
        membershipRevision: 3,
        destinationId,
        reason: "Fictional reviewed transfer",
      },
    ],
  ])(
    "binds %s revision/target/document into a current-authority receipt",
    async (action, extra) => {
      const f = fixture();
      expect(
        (
          await f.call({
            suffix: "/" + teamId,
            body: { currentPassword: password, action, revision: 2, ...extra },
          })
        ).statusCode,
      ).toBe(200);
      expect(
        f.db.rpc.mock.calls.find(
          ([name]) => name === "mutate_team_workspace",
        )[1],
      ).toMatchObject({
        p_team: teamId,
        p_action: action,
        p_revision: 2,
        p_document: extra,
        p_session: sessionId,
      });
    },
  );
  it("keeps failed password proof distinct from a hierarchy denial and never invokes mutation", async () => {
    const f = fixture();
    expect(
      (
        await f.call({
          body: { currentPassword: "wrong fictional proof", record: f.record },
        })
      ).error.code,
    ).toBe("PASSWORD_CONFIRMATION_FAILED");
    expect(f.store.recordLoginFailure).toHaveBeenCalled();
    expect(
      f.db.rpc.mock.calls.some(([name]) => name === "mutate_team_workspace"),
    ).toBe(false);
  });
});
