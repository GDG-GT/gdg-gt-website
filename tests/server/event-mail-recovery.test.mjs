import { describe, it, expect, vi } from "vitest";
import { eventRoutes } from "../../server/events.mjs";
import { ApiError } from "../../server/lib/http.mjs";
import { token, tokenHash } from "../../server/lib/security.mjs";
const actor = "b1170000-0000-4000-8000-000000000001",
  sessionId = "b1170000-0000-4000-8000-000000000002",
  event = "b1170000-0000-4000-8000-000000000003",
  review = "b1170000-0000-4000-8000-000000000004";
function fixture() {
  const raw = token(),
    config = {
      origin: "https://chapter.example.test",
      sessionCookie: "__Host-gdg_session",
    },
    store = {
      validateSession: vi.fn(async () => ({
        sessionId,
        user: { id: actor, role: "admin", is_active: true },
      })),
    },
    query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      order: vi.fn(() => query),
      range: vi.fn(async () => ({
        data: [
          {
            id: review,
            subject: "Fictional history",
            message: "Fictional body",
            recipient_count: 2,
            created_at: "2026-11-05T12:00:00Z",
          },
        ],
        count: 21,
      })),
      maybeSingle: async () => ({ data: { id: event, team_id: null } }),
      is: async () => ({ data: [], count: 2 }),
    },
    db = {
      from: vi.fn(() => query),
      rpc: vi.fn(async (name) => ({
        data: name.startsWith("can_")
          ? true
          : { state: "queued", receipt: { queued: true, recipientCount: 2 } },
      })),
    };
  async function call({
    query = "?reviewId=" + review,
    key = "fictional-email-recovery-key-001",
    operation = "email",
  } = {}) {
    const request = {
        url: "/api/v1/admin/events/" + event + "/" + operation + query,
        method: "GET",
        headers: {
          origin: config.origin,
          cookie: config.sessionCookie + "=" + raw,
          ...(key === null ? {} : { "idempotency-key": key }),
        },
      },
      response = {
        statusCode: 200,
        setHeader() {},
        end(value) {
          this.body = JSON.parse(value);
        },
      };
    try {
      await eventRoutes(request, response, {
        db,
        store,
        config,
        requestId: review,
      });
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      response.statusCode = error.status;
      response.error = error;
    }
    return response;
  }
  return { db, call, store, query };
}
describe("Read-only event email recovery transport", () => {
  it("pages only the current sender’s event message history with safe columns", async () => {
    const f = fixture(),
      response = await f.call({ query: "?history=true&page=2", key: null });
    expect(response.statusCode).toBe(200);
    expect(response.body.data.total).toBe(21);
    expect(response.body.data.page).toBe(2);
    expect(f.query.eq).toHaveBeenCalledWith("created_by", actor);
    expect(f.query.eq).toHaveBeenCalledWith("event_id", event);
    expect(f.query.range).toHaveBeenCalledWith(20, 39);
    expect(f.query.select.mock.calls.at(-1)[0]).not.toMatch(
      /hash|recipient_email/,
    );
    expect(
      f.db.rpc.mock.calls.some(
        ([name]) => name === "inspect_event_mail_recovery",
      ),
    ).toBe(false);
  });
  it.each([
    "?history=true&reviewId=" + review,
    "?history=false",
    "?history=true&page=0",
  ])("rejects invalid history/review combinations %s", async (query) => {
    const f = fixture();
    expect((await f.call({ query })).statusCode).toBe(400);
    expect(f.query.range).not.toHaveBeenCalled();
  });
  it("binds a saved review and hashed retry identity to the current account/session/event", async () => {
    const f = fixture(),
      response = await f.call();
    expect(response.statusCode).toBe(200);
    expect(response.body.data.receipt.recipientCount).toBe(2);
    expect(f.db.rpc).toHaveBeenCalledWith("inspect_event_mail_recovery", {
      p_actor: actor,
      p_session: sessionId,
      p_event: event,
      p_review: review,
      p_key_hash: tokenHash("fictional-email-recovery-key-001"),
    });
    expect(
      f.db.rpc.mock.calls.some(([name]) =>
        /commit|review_event|queue/.test(name),
      ),
    ).toBe(false);
  });
  it.each([null, "short", ["duplicate", "header"]])(
    "rejects missing/invalid recovery identity %j before receipt lookup",
    async (key) => {
      const f = fixture();
      expect((await f.call({ key })).statusCode).toBe(400);
      expect(
        f.db.rpc.mock.calls.some(
          ([name]) => name === "inspect_event_mail_recovery",
        ),
      ).toBe(false);
    },
  );
  it("preserves the existing count-only read without requiring a retry key", async () => {
    const f = fixture(),
      response = await f.call({ query: "", key: null });
    expect(response.statusCode).toBe(200);
    expect(response.body.data).toEqual({ recipientCount: 2, maxBatch: 1000 });
    expect(
      f.db.rpc.mock.calls.some(
        ([name]) => name === "inspect_event_mail_recovery",
      ),
    ).toBe(false);
  });
  it("does not expose a receipt after email capability is revoked", async () => {
    const f = fixture();
    f.db.rpc.mockImplementation(async (name) => ({
      data: name === "can_event_audience" ? false : true,
    }));
    expect((await f.call()).statusCode).toBe(403);
    expect(
      f.db.rpc.mock.calls.some(
        ([name]) => name === "inspect_event_mail_recovery",
      ),
    ).toBe(false);
  });
  it("conceals session/event/review mismatch returned by SQL", async () => {
    const f = fixture();
    f.db.rpc.mockImplementation(async (name) =>
      name === "inspect_event_mail_recovery"
        ? { error: { code: "P0001", message: "NOT_FOUND" } }
        : { data: true },
    );
    expect((await f.call()).statusCode).toBe(404);
  });
  it.each([
    "?reviewId=invalid",
    "?reviewId=" + review + "&secret=forbidden",
    "?reviewId=" + review + "&reviewId=" + review,
  ])("rejects invalid or ambiguous recovery query %s", async (query) => {
    const f = fixture();
    expect((await f.call({ query })).statusCode).toBe(400);
    expect(
      f.db.rpc.mock.calls.some(
        ([name]) => name === "inspect_event_mail_recovery",
      ),
    ).toBe(false);
  });
  it("refuses a review lookup on the preparation route", async () => {
    const f = fixture();
    expect((await f.call({ operation: "email-review" })).statusCode).toBe(405);
  });
});
