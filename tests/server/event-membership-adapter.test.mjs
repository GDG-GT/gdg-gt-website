import { describe, it, expect, vi } from "vitest";
import {
  createEventAdapter,
  createEventMembershipClient,
  createEventLinkHandler,
} from "../../integrations/event-membership/server.mjs";
const eventId = "a3100000-0000-4000-8000-000000000001",
  memberRef = "a3100000-0000-4000-8000-000000000002",
  accountId = "a3100000-0000-4000-8000-000000000003",
  checkinId = "a3100000-0000-4000-8000-000000000004",
  eventKey = eventId + "." + "A".repeat(43);
const request = (body, headers = {}) =>
  new Request("https://event.example.org/api/gdg-membership/v1", {
    method: "POST",
    headers: {
      authorization: "Bearer " + eventKey,
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
describe("Standalone event adapter", () => {
  it("checks protocol without reading registrations", async () => {
    const db = { rpc: vi.fn() },
      adapter = createEventAdapter({ eventId, eventKey, db });
    const r = await adapter(request({ eventId, action: "health" }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ eventId, protocol: "gdg-membership-v1" });
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it.each([
    { origin: "https://event.example.org" },
    { cookie: "session=fictional" },
    { "sec-fetch-site": "same-origin" },
    { authorization: "Bearer invalid" },
  ])("refuses browser headers and invalid credentials %s", async (headers) => {
    const db = { rpc: vi.fn() };
    expect(
      (
        await createEventAdapter({ eventId, eventKey, db })(
          request({ eventId, action: "lookup", memberRef }, headers),
        )
      ).status,
    ).toBe(401);
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it("reads registrations with its own server database", async () => {
    const db = {
      rpc: vi.fn(async () => ({
        data: { status: "waitlisted", checkedIn: false, checkinId: null },
      })),
    };
    const r = await createEventAdapter({ eventId, eventKey, db })(
      request({ eventId, action: "lookup", memberRef }),
    );
    expect(await r.json()).toEqual({
      status: "waitlisted",
      checkedIn: false,
      checkinId: null,
    });
    expect(db.rpc).toHaveBeenCalledWith("gdg_event_attendance", {
      p_member: memberRef,
      p_request: null,
    });
  });
  it("passes a stable request ID to atomic attendance SQL", async () => {
    const db = {
      rpc: vi.fn(async () => ({
        data: { status: "registered", checkedIn: true, checkinId },
      })),
    };
    expect(
      (
        await createEventAdapter({ eventId, eventKey, db })(
          request({ eventId, action: "checkin", memberRef, checkinId }),
        )
      ).status,
    ).toBe(200);
    expect(db.rpc.mock.calls[0][1].p_request).toBe(checkinId);
  });
  it("rejects event mismatch, injected fields and oversized bodies", async () => {
    const db = { rpc: vi.fn() },
      handler = createEventAdapter({ eventId, eventKey, db });
    for (const body of [
      { eventId: memberRef, action: "lookup", memberRef },
      { eventId, action: "checkin", memberRef, checkinId, points: 1000 },
      { eventId, action: "lookup", memberRef, extra: "x".repeat(3000) },
    ])
      expect((await handler(request(body))).status).toBeGreaterThanOrEqual(400);
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it("never exposes database failures or keys", async () => {
    const db = { rpc: vi.fn(async () => ({ error: { message: eventKey } })) };
    const r = await createEventAdapter({ eventId, eventKey, db })(
      request({ eventId, action: "lookup", memberRef }),
    );
    expect(r.status).toBe(503);
    expect(await r.text()).not.toContain(eventKey);
  });
  it("uses the main server API without cookies, redirects or browser keys", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ data: { memberRef, active: true } }), {
          status: 200,
        }),
    );
    const c = createEventMembershipClient({ eventId, eventKey, fetchImpl });
    await c.redeem("B".repeat(43), accountId);
    await c.verify(memberRef);
    expect(fetchImpl.mock.calls[0][0]).toBe(
      "https://gdggt.dev/api/v1/integrations/membership/redeem",
    );
    expect(fetchImpl.mock.calls[0][1].redirect).toBe("error");
    expect(fetchImpl.mock.calls[0][1].headers.cookie).toBeUndefined();
  });
  it("refuses a changed main API destination", () =>
    expect(() =>
      createEventMembershipClient({
        eventId,
        eventKey,
        mainOrigin: "https://elsewhere.example.org",
      }),
    ).toThrow());
});
function linkFixture() {
  const db = {
      rpc: vi.fn(async () => ({ error: null })),
      from: vi.fn(() => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { account_id: accountId } }),
          }),
        }),
      })),
    },
    client = { redeem: vi.fn(async () => ({ active: true, memberRef })) },
    getAccount = vi.fn(async () => ({ id: accountId }));
  return {
    db,
    client,
    getAccount,
    handler: createEventLinkHandler({
      eventOrigin: "https://event.example.org",
      db,
      client,
      getAccount,
    }),
  };
}
describe("Event account linking", () => {
  it("uses the authenticated account rather than browser identity claims", async () => {
    const f = linkFixture();
    let r = await f.handler(
      request(
        { code: "B".repeat(43) },
        { origin: "https://event.example.org" },
      ),
    );
    expect(r.status).toBe(200);
    expect(f.client.redeem).toHaveBeenCalledWith("B".repeat(43), accountId);
    expect(f.db.rpc).toHaveBeenCalledWith("gdg_event_bind", {
      p_account: accountId,
      p_member: memberRef,
    });
    r = await f.handler(
      request(
        { code: "B".repeat(43), accountId: memberRef },
        { origin: "https://event.example.org" },
      ),
    );
    expect(r.status).toBe(400);
    expect(f.client.redeem).toHaveBeenCalledTimes(1);
  });
  it("rejects cross-site linking and signed-out event users", async () => {
    const f = linkFixture();
    expect(
      (
        await f.handler(
          request(
            { code: "B".repeat(43) },
            { origin: "https://evil.example.org" },
          ),
        )
      ).status,
    ).toBe(403);
    expect(f.client.redeem).not.toHaveBeenCalled();
    f.getAccount.mockResolvedValue(null);
    expect(
      (
        await f.handler(
          request(
            { code: "B".repeat(43) },
            { origin: "https://event.example.org" },
          ),
        )
      ).status,
    ).toBe(401);
  });
  it("does not consume a code before an event registration exists", async () => {
    const f = linkFixture();
    f.db.from.mockReturnValue({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null }) }),
      }),
    });
    expect(
      (
        await f.handler(
          request(
            { code: "B".repeat(43) },
            { origin: "https://event.example.org" },
          ),
        )
      ).status,
    ).toBe(409);
    expect(f.client.redeem).not.toHaveBeenCalled();
  });
  it("reports a lost bind response as retryable with the same code", async () => {
    const f = linkFixture();
    f.db.rpc.mockResolvedValue({ error: { message: "fictional failure" } });
    const r = await f.handler(
      request(
        { code: "B".repeat(43) },
        { origin: "https://event.example.org" },
      ),
    );
    expect(r.status).toBe(503);
    expect((await r.json()).error).toContain("same code");
  });
});
