import { describe, it, expect, vi } from "vitest";
import { eventRoutes } from "../../server/events.mjs";
import { ApiError } from "../../server/lib/http.mjs";
import { token, tokenHash } from "../../server/lib/security.mjs";
const actor = "e1120000-0000-4000-8000-000000000001",
  sessionId = "e1120000-0000-4000-8000-000000000002",
  eventId = "e1120000-0000-4000-8000-000000000003",
  attendee = "e1120000-0000-4000-8000-000000000004";
function fixture() {
  const raw = token(),
    csrf = token(),
    config = {
      origin: "https://chapter.example.test",
      sessionCookie: "__Host-gdg_session",
    };
  const store = {
    validateSession: vi.fn(async () => ({
      sessionId,
      user: { id: actor, role: "admin", is_active: true },
    })),
    csrf: vi.fn(async () => ({
      token_hash: tokenHash(csrf),
      expires_at: new Date(Date.now() + 60000).toISOString(),
    })),
  };
  const event = {
    id: eventId,
    revision: 2,
    team_id: null,
    start_at: "2099-12-31T18:00:00Z",
    end_at: null,
  };
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data: event }),
  };
  const db = {
    from: vi.fn(() => query),
    rpc: vi.fn(async (name) => ({
      data: name === "can_operate_event" ? true : event,
    })),
  };
  async function call({
    suffix = "",
    method = "POST",
    key = "fictional-event-retry-000001",
    body = {
      event: {
        title: "Fictional retry event",
        slug: "fictional-retry-event",
        description: "Fictional private event",
        start_at: "2099-12-31T18:00:00Z",
        location: "Fictional room",
      },
    },
  } = {}) {
    const request = {
      url: "/api/v1/admin/events" + suffix,
      method,
      body,
      headers: {
        origin: config.origin,
        "content-type": "application/json",
        cookie: config.sessionCookie + "=" + raw,
        "x-csrf-token": csrf,
        ...(key === null ? {} : { "idempotency-key": key }),
      },
    };
    const response = {
      statusCode: 200,
      setHeader() {},
      end(body) {
        this.body = JSON.parse(body);
      },
    };
    try {
      await eventRoutes(request, response, {
        db,
        store,
        config,
        requestId: eventId,
      });
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      response.statusCode = e.status;
      response.error = e;
    }
    return response;
  }
  return { db, call };
}
describe("Scoped event workspace mutation transport", () => {
  it.each([null, "short", ["duplicated", "header"]])(
    "rejects invalid retry identity %j",
    async (key) => {
      const f = fixture();
      expect((await f.call({ key })).statusCode).toBe(400);
      expect(
        f.db.rpc.mock.calls.some(([name]) => name === "mutate_event_workspace"),
      ).toBe(false);
    },
  );
  it("binds creation to trusted actor/session and hashes key and validated intent", async () => {
    const f = fixture();
    expect((await f.call()).statusCode).toBe(200);
    const input = f.db.rpc.mock.calls.find(
      ([name]) => name === "mutate_event_workspace",
    )[1];
    expect(input).toMatchObject({
      p_actor: actor,
      p_session: sessionId,
      p_id: null,
      p_action: "create",
      p_revision: null,
      p_registration: null,
      p_updated_at: null,
      p_key_hash: tokenHash("fictional-event-retry-000001"),
    });
    expect(input.p_request_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(input)).not.toContain("fictional-event-retry-000001");
  });
  it.each(["publish", "unpublish", "cancel", "duplicate", "archive", "update"])(
    "includes %s target/action/revision in receipt identity",
    async (action) => {
      const f = fixture(),
        method =
          action === "archive"
            ? "DELETE"
            : action === "update"
              ? "PATCH"
              : "POST";
      const suffix =
        "/" +
        eventId +
        (["archive", "update"].includes(action) ? "" : "/" + action);
      expect(
        (await f.call({ suffix, method, body: { revision: 2, event: {} } }))
          .statusCode,
      ).toBe(200);
      const input = f.db.rpc.mock.calls.find(
        ([name]) => name === "mutate_event_workspace",
      )[1];
      expect(input).toMatchObject({
        p_action: action,
        p_id: eventId,
        p_revision: 2,
        p_session: sessionId,
      });
    },
  );
  it.each(["PATCH", "DELETE"])(
    "requires an observed attendee timestamp for %s",
    async (method) => {
      const f = fixture(),
        suffix = `/${eventId}/attendees/${attendee}`;
      expect((await f.call({ suffix, method, body: {} })).statusCode).toBe(400);
      expect(
        (
          await f.call({
            suffix,
            method,
            body: {
              updatedAt: "2099-12-31T17:00:00Z",
              ...(method === "PATCH" ? { attended: true } : {}),
            },
          })
        ).statusCode,
      ).toBe(200);
      expect(
        f.db.rpc.mock.calls.find(
          ([name]) => name === "mutate_event_workspace",
        )[1],
      ).toMatchObject({
        p_action: method === "PATCH" ? "attendee.update" : "attendee.remove",
        p_registration: attendee,
        p_updated_at: "2099-12-31T17:00:00Z",
        p_document: method === "PATCH" ? { attended: true } : {},
      });
    },
  );
  it("rejects client identity injection and edit properties on removal", async () => {
    const f = fixture();
    expect(
      (await f.call({ body: { actorId: actor, sessionId, event: {} } }))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await f.call({
          suffix: `/${eventId}/attendees/${attendee}`,
          method: "DELETE",
          body: { updatedAt: "2099-12-31T17:00:00Z", notes: "unexpected edit" },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      f.db.rpc.mock.calls.some(([name]) => name === "mutate_event_workspace"),
    ).toBe(false);
  });
});
