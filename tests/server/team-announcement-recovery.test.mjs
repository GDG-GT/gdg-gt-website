import { describe, it, expect, vi } from "vitest";
import { teamAnnouncementRoutes } from "../../server/team-announcements.mjs";
import { ApiError } from "../../server/lib/http.mjs";
import { token, tokenHash } from "../../server/lib/security.mjs";
const actor = "b1160000-0000-4000-8000-000000000001",
  sessionId = "b1160000-0000-4000-8000-000000000002",
  team = "b1160000-0000-4000-8000-000000000003",
  id = "b1160000-0000-4000-8000-000000000004",
  record = {
    title: "Fictional announcement",
    message: "Fictional private body",
  };
function fixture() {
  const cookie = token(),
    csrf = token(),
    config = {
      origin: "https://chapter.example.test",
      sessionCookie: "__Host-gdg_session",
      riskSecret: "fictional-risk",
    },
    store = {
      validateSession: vi.fn(async () => ({
        sessionId,
        user: { id: actor, role: "team_member", is_active: true },
      })),
      csrf: vi.fn(async () => ({
        token_hash: tokenHash(csrf),
        expires_at: new Date(Date.now() + 60000).toISOString(),
      })),
      rateLimit: vi.fn(async () => ({ allowed: true })),
    },
    db = { rpc: vi.fn(async () => ({ data: { id, revision: 2 } })) };
  async function call({
    method = "POST",
    suffix = "",
    body = { record },
    key = "fictional-announcement-retry-key-001",
  } = {}) {
    const response = {
        setHeader() {},
        end(value) {
          this.body = JSON.parse(value);
        },
        statusCode: 200,
      },
      request = {
        url: "/api/v1/admin/teams/" + team + "/announcements" + suffix,
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
      await teamAnnouncementRoutes(request, response, {
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
  return { call, db, store };
}
describe("Team announcement receipt transport", () => {
  it.each([null, "short", ["duplicate", "header"]])(
    "rejects missing/invalid retry identity %j",
    async (key) => {
      const f = fixture();
      expect((await f.call({ key })).statusCode).toBe(400);
      expect(f.db.rpc).not.toHaveBeenCalled();
    },
  );
  it("binds normalized stable draft intent to the current actor/session and distinct changed intent", async () => {
    const f = fixture();
    await f.call();
    await f.call();
    const args = f.db.rpc.mock.calls.map(([, input]) => input);
    expect(f.db.rpc.mock.calls[0][0]).toBe(
      "mutate_team_announcement_workspace",
    );
    expect(args[0]).toMatchObject({
      p_actor: actor,
      p_session: sessionId,
      p_team: team,
      p_id: null,
      p_action: "create",
      p_revision: null,
      p_key_hash: tokenHash("fictional-announcement-retry-key-001"),
      p_document: {
        ...record,
        pinned: false,
        priority: "normal",
        scheduledFor: null,
        expiresAt: null,
      },
    });
    expect(args[1].p_request_hash).toBe(args[0].p_request_hash);
    await f.call({
      body: { record: { ...record, message: "Changed private intent" } },
    });
    expect(f.db.rpc.mock.calls.at(-1)[1].p_request_hash).not.toBe(
      args[0].p_request_hash,
    );
  });
  it.each([
    "update",
    "publish",
    "unpublish",
    "archive",
    "restore",
    "pin",
    "read",
  ])(
    "binds %s to its scoped current target and original document/revision",
    async (action) => {
      const f = fixture(),
        body =
          action === "update"
            ? { revision: 1, record, confirmation: record.title }
            : action === "read"
              ? { action }
              : {
                  action,
                  revision: 1,
                  ...(action === "pin"
                    ? { pinned: true }
                    : { confirmation: record.title }),
                };
      const response = await f.call({
        suffix: "/" + id,
        method: action === "update" ? "PATCH" : "POST",
        body,
      });
      expect(response.statusCode).toBe(200);
      expect(f.db.rpc.mock.calls[0][1]).toMatchObject({
        p_team: team,
        p_id: id,
        p_action: action,
        p_revision: action === "read" ? null : 1,
      });
      if (!["pin", "read"].includes(action))
        expect(f.db.rpc.mock.calls[0][1].p_document.confirmation).toBe(
          record.title,
        );
    },
  );
  it.each(["publish", "unpublish", "archive", "restore"])(
    "refuses %s without a typed target confirmation",
    async (action) => {
      const f = fixture();
      expect(
        (await f.call({ suffix: "/" + id, body: { action, revision: 1 } }))
          .statusCode,
      ).toBe(400);
      expect(f.db.rpc).not.toHaveBeenCalled();
    },
  );
  it("rechecks one exact current authorized post without a mutation key", async () => {
    const f = fixture();
    expect(
      (await f.call({ method: "GET", suffix: "/" + id, key: null })).statusCode,
    ).toBe(200);
    expect(f.db.rpc.mock.calls).toEqual([
      ["team_announcement_record", { p_actor: actor, p_team: team, p_id: id }],
    ]);
  });
  it("passes an exact normalized title before database pagination without inferring private counts", async () => {
    const f = fixture();
    await f.call({
      method: "GET",
      suffix: "?state=drafts&page=2&title=Fictional%20announcement",
      key: null,
    });
    expect(f.db.rpc.mock.calls).toEqual([
      [
        "list_team_announcements_filtered",
        {
          p_actor: actor,
          p_team: team,
          p_page: 2,
          p_state: "drafts",
          p_title: record.title,
        },
      ],
    ]);
  });
  it("conceals selected records and receipts when the current SQL authority check denies them", async () => {
    const f = fixture();
    f.db.rpc.mockResolvedValue({
      error: { code: "P0001", message: "NOT_FOUND" },
    });
    expect((await f.call()).statusCode).toBe(404);
    expect((await f.call({ method: "GET", suffix: "/" + id })).statusCode).toBe(
      404,
    );
  });
  it("rejects forged audience/author/read-revision fields and unknown lookup parameters", async () => {
    const f = fixture();
    for (const body of [
      { record, audience: [actor] },
      { record: { ...record, author_id: actor } },
    ])
      expect((await f.call({ body })).statusCode).toBe(400);
    expect(
      (
        await f.call({
          suffix: "/" + id,
          body: { action: "read", revision: 1 },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await f.call({ method: "GET", suffix: "/" + id + "?token=forbidden" }))
        .statusCode,
    ).toBe(400);
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
});
