import { describe, it, expect, vi } from "vitest";
import { rewardEventRoutes } from "../../server/reward-events.mjs";
import {
  publicIPv4,
  eventAdapterRequest,
} from "../../server/reward-event-transport.mjs";
import { encryptPayload } from "../../server/lib/encryption.mjs";
import { tokenHash } from "../../server/lib/security.mjs";
import { EventEmitter } from "node:events";
const eid = "a2100000-0000-4000-8000-000000000001",
  mid = "a2100000-0000-4000-8000-000000000002",
  rid = "a2100000-0000-4000-8000-000000000003",
  secret = "A".repeat(43);
function fixture(role = "super_admin") {
  const config = {
    origin: "https://gdggt.dev",
    secureCookies: true,
    encryptionSecret: "fictional-event-encryption-secret-32",
    riskSecret: "fictional-event-risk-secret-at-least32",
    sessionCookie: "__Host-gdg_session",
  };
  const store = {
    rateLimit: vi.fn(async () => ({ allowed: true })),
    validateSession: vi.fn(async () => ({
      user: { id: mid, role, is_active: true },
      sessionId: rid,
    })),
    csrf: vi.fn(async () => ({
      token_hash: tokenHash(secret),
      expires_at: new Date(Date.now() + 60000).toISOString(),
    })),
  };
  const db = { rpc: vi.fn(async () => ({ data: {}, error: null })) },
    adapter = vi.fn(async () => ({
      status: "registered",
      checkedIn: false,
      checkinId: null,
    }));
  const response = {
    setHeader: vi.fn(),
    end: vi.fn(),
    headers: {},
    getHeader: vi.fn(),
  };
  const req = (path, body, headers = {}) => ({
    url: "/api/v1" + path,
    method: body ? "POST" : "GET",
    body,
    headers: {
      host: "gdggt.dev",
      cookie: "__Host-gdg_session=" + secret,
      "content-type": "application/json",
      "x-csrf-token": secret,
      "idempotency-key": "fictional-event-request-0001",
      ...headers,
    },
    socket: { remoteAddress: "127.0.0.1" },
  });
  const call = (r) =>
    rewardEventRoutes(r, response, {
      config,
      store,
      db,
      adapter,
      requestId: rid,
    });
  return { config, store, db, adapter, response, req, call };
}
describe("Cross-project event boundaries", () => {
  it.each(["admin", "team_member", "blog_editor"])(
    "rejects %s before reading connections",
    async (role) => {
      const f = fixture(role);
      await expect(f.call(f.req("/admin/reward-events"))).rejects.toMatchObject(
        { status: 403 },
      );
      expect(f.db.rpc).not.toHaveBeenCalled();
    },
  );
  it("rejects browser use of server credentials", async () => {
    const f = fixture();
    await expect(
      f.call(
        f.req(
          "/integrations/membership/verify",
          { memberRef: mid },
          {
            authorization: "Bearer " + eid + "." + secret,
            origin: "https://event.example.org",
          },
        ),
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("only permits event-scoped verification with no cookies or browser origin", async () => {
    const f = fixture(),
      r = f.req(
        "/integrations/membership/verify",
        { memberRef: mid },
        { authorization: "Bearer " + eid + "." + secret },
      );
    delete r.headers.cookie;
    f.db.rpc.mockResolvedValue({ data: { memberRef: mid, active: true } });
    await f.call(r);
    expect(f.db.rpc).toHaveBeenCalledWith("reward_event_external", {
      p_event: eid,
      p_key_hash: tokenHash(secret),
      p_action: "membership",
      p_document: { memberRef: mid },
    });
    expect(f.store.validateSession).not.toHaveBeenCalled();
  });
  it("hashes link codes and event account references before database writes", async () => {
    const f = fixture(),
      r = f.req(
        "/integrations/membership/redeem",
        { code: secret, accountId: "event-supabase-account" },
        { authorization: "Bearer " + eid + "." + secret },
      );
    delete r.headers.cookie;
    await f.call(r);
    const args = f.db.rpc.mock.calls[0][1];
    expect(args.p_document.codeHash).toBe(tokenHash(secret));
    expect(JSON.stringify(args)).not.toContain("event-supabase-account");
  });
  it("does not offer points writes to event keys", async () => {
    const f = fixture(),
      r = f.req(
        "/integrations/membership/points",
        { memberRef: mid },
        { authorization: "Bearer " + eid + "." + secret },
      );
    delete r.headers.cookie;
    await expect(f.call(r)).rejects.toMatchObject({ status: 404 });
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it("keeps an unlinked member distinct from an unregistered member and does not call the event", async () => {
    const f = fixture();
    f.db.rpc.mockResolvedValue({
      data: {
        event: { id: eid },
        member: { name: "Fictional Member" },
        memberRef: null,
      },
    });
    await f.call(
      f.req("/admin/reward-events/lookup", {
        eventId: eid,
        credential: secret,
      }),
    );
    expect(f.adapter).not.toHaveBeenCalled();
    expect(f.response.end.mock.calls[0][0]).toContain("unlinked");
  });
  it("reports event outages without creating an attendance review", async () => {
    const f = fixture();
    f.db.rpc.mockResolvedValue({
      data: {
        event: {
          id: eid,
          encrypted_key: encryptPayload({ secret }, f.config.encryptionSecret),
        },
        member: { name: "Fictional Member" },
        memberRef: mid,
      },
    });
    f.adapter.mockRejectedValue(Error("offline"));
    await expect(
      f.call(
        f.req("/admin/reward-events/lookup", {
          eventId: eid,
          credential: secret,
        }),
      ),
    ).rejects.toThrow("offline");
    expect(f.db.rpc).toHaveBeenCalledTimes(1);
  });
  it("checks registration live and creates a short-lived review for registered members", async () => {
    const f = fixture();
    f.db.rpc
      .mockResolvedValueOnce({
        data: {
          event: {
            id: eid,
            revision: 2,
            encrypted_key: encryptPayload(
              { secret },
              f.config.encryptionSecret,
            ),
          },
          member: { name: "Fictional Member" },
          memberRef: mid,
        },
      })
      .mockResolvedValueOnce({ data: { reviewId: rid } });
    await f.call(
      f.req("/admin/reward-events/lookup", {
        eventId: eid,
        credential: secret,
      }),
    );
    expect(f.db.rpc.mock.calls[1][1].p_action).toBe("review");
    expect(f.response.end.mock.calls[0][0]).not.toContain("encrypted_key");
  });
  it("never reviews a waitlisted registration", async () => {
    const f = fixture();
    f.db.rpc.mockResolvedValue({
      data: {
        event: {
          id: eid,
          encrypted_key: encryptPayload({ secret }, f.config.encryptionSecret),
        },
        member: { name: "Fictional" },
        memberRef: mid,
      },
    });
    f.adapter.mockResolvedValue({
      status: "waitlisted",
      checkedIn: false,
      checkinId: null,
    });
    await f.call(
      f.req("/admin/reward-events/lookup", {
        eventId: eid,
        credential: secret,
      }),
    );
    expect(f.db.rpc).toHaveBeenCalledTimes(1);
  });
  it("recovers completed attendance without sending a duplicate provider write", async () => {
    const f = fixture();
    f.db.rpc.mockResolvedValue({ data: { id: rid, state: "completed" } });
    await f.call(f.req("/admin/reward-events/confirm", { reviewId: rid }));
    expect(f.adapter).not.toHaveBeenCalled();
  });
  it("uses the durable pending attendance ID for remote idempotency then confirms locally", async () => {
    const f = fixture();
    f.db.rpc
      .mockResolvedValueOnce({
        data: {
          id: rid,
          state: "pending",
          event: {
            id: eid,
            encrypted_key: encryptPayload(
              { secret },
              f.config.encryptionSecret,
            ),
          },
          memberRef: mid,
        },
      })
      .mockResolvedValueOnce({ data: { id: rid, state: "completed" } });
    f.adapter.mockResolvedValue({
      status: "registered",
      checkedIn: true,
      checkinId: "remote-receipt",
    });
    await f.call(f.req("/admin/reward-events/confirm", { reviewId: rid }));
    expect(f.adapter.mock.calls[0][3]).toEqual({
      memberRef: mid,
      checkinId: rid,
    });
    expect(f.db.rpc.mock.calls[1][1].p_document.externalId).toBe(
      "remote-receipt",
    );
    expect(f.db.rpc.mock.calls[0][1].p_key_hash).toBe(
      f.db.rpc.mock.calls[1][1].p_key_hash,
    );
  });
  it("refuses member code creation without a current session cookie", async () => {
    const f = fixture(),
      r = f.req("/rewards/event-links/code", { eventId: eid });
    delete r.headers.cookie;
    await expect(f.call(r)).rejects.toMatchObject({ status: 401 });
  });
  it("rate limits before private reads", async () => {
    const f = fixture();
    f.store.rateLimit.mockResolvedValue({ allowed: false });
    await expect(f.call(f.req("/admin/reward-events"))).rejects.toMatchObject({
      status: 429,
    });
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
});
describe("Outbound event callback safety", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "192.168.1.1",
    "100.64.0.2",
    "198.18.0.1",
    "::1",
    "203.0.113.1",
  ])("rejects non-public address %s", (ip) =>
    expect(publicIPv4(ip)).toBe(false),
  );
  it("does not send credentials to private or mixed DNS answers", async () => {
    const request = vi.fn();
    await expect(
      eventAdapterRequest(
        { id: eid, origin: "https://event.example.org/" },
        secret,
        "lookup",
        {},
        { resolve: async () => ["8.8.8.8", "127.0.0.1"], request },
      ),
    ).rejects.toMatchObject({ status: 503 });
    expect(request).not.toHaveBeenCalled();
  });
  it("pins DNS, uses a fixed path and refuses redirects", async () => {
    let options;
    const request = vi.fn((url, opts, callback) => {
      options = opts;
      expect(url.pathname).toBe("/api/gdg-membership/v1");
      const req = new EventEmitter();
      req.destroy = () => req.emit("close");
      req.end = () => {
        const response = new EventEmitter();
        response.statusCode = 302;
        callback(response);
        response.emit("end");
        req.emit("close");
      };
      return req;
    });
    await expect(
      eventAdapterRequest(
        { id: eid, origin: "https://event.example.org/" },
        secret,
        "lookup",
        {},
        { resolve: async () => ["8.8.8.8"], request },
      ),
    ).rejects.toMatchObject({ status: 503 });
    await new Promise((resolve) =>
      options.lookup("event.example.org", {}, (err, address) => {
        expect(address).toBe("8.8.8.8");
        resolve();
      }),
    );
  });
  it("requires confirmed provider attendance after a checkin write", async () => {
    const request = (url, opts, callback) => {
      const req = new EventEmitter();
      req.destroy = () => req.emit("close");
      req.end = () => {
        const r = new EventEmitter();
        r.statusCode = 200;
        callback(r);
        r.emit(
          "data",
          Buffer.from(
            JSON.stringify({
              status: "registered",
              checkedIn: false,
              checkinId: null,
            }),
          ),
        );
        r.emit("end");
        req.emit("close");
      };
      return req;
    };
    await expect(
      eventAdapterRequest(
        { id: eid, origin: "https://event.example.org/" },
        secret,
        "checkin",
        {},
        { resolve: async () => ["8.8.8.8"], request },
      ),
    ).rejects.toMatchObject({ status: 503 });
  });
});

describe("Event key issuance and interrupted attendance recovery", () => {
  it("returns only the created server key and decrypts an idempotent issuance receipt", async () => {
    const f = fixture();
    f.db.rpc.mockResolvedValue({
      data: {
        id: eid,
        encryptedKey: encryptPayload({ secret }, f.config.encryptionSecret),
      },
    });
    await f.call(
      f.req("/admin/reward-events/save", {
        title: "Fictional Event",
        origin: "https://event.example.org/",
        opensAt: "2026-11-08T10:00:00Z",
        closesAt: "2026-11-08T18:00:00Z",
        active: false,
        activityId: null,
      }),
    );
    const output = JSON.parse(f.response.end.mock.calls[0][0]);
    expect(output.data.credential).toBe(eid + "." + secret);
    expect(output.data.encryptedKey).toBeUndefined();
    const d = f.db.rpc.mock.calls[0][1].p_document;
    expect(d.keyHash).toMatch(/^[a-f0-9]{64}$/);
    expect(d.encryptedKey).not.toContain(secret);
  });
  it("rejects overlong event windows before database changes", async () => {
    const f = fixture();
    await expect(
      f.call(
        f.req("/admin/reward-events/save", {
          title: "Fictional Event",
          origin: "https://event.example.org/",
          opensAt: "2026-11-08T10:00:00Z",
          closesAt: "2027-01-08T18:00:00Z",
          active: false,
          activityId: null,
        }),
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it("health checks do not need a member card and do not expose the stored key", async () => {
    const f = fixture();
    f.db.rpc.mockResolvedValue({
      data: {
        id: eid,
        encrypted_key: encryptPayload({ secret }, f.config.encryptionSecret),
      },
    });
    f.adapter.mockResolvedValue({ connected: true });
    await f.call(f.req("/admin/reward-events/health", { id: eid }));
    expect(f.db.rpc.mock.calls[0][1].p_action).toBe("connection");
    expect(f.adapter.mock.calls[0][2]).toBe("health");
    expect(f.response.end.mock.calls[0][0]).not.toContain(secret);
  });
  it("only reads existing remote attendance after an expired review", async () => {
    const f = fixture();
    f.db.rpc
      .mockResolvedValueOnce({
        data: {
          id: rid,
          state: "pending",
          recoveryOnly: true,
          event: {
            id: eid,
            encrypted_key: encryptPayload(
              { secret },
              f.config.encryptionSecret,
            ),
          },
          memberRef: mid,
        },
      })
      .mockResolvedValueOnce({ data: { state: "completed" } });
    f.adapter.mockResolvedValue({
      status: "registered",
      checkedIn: true,
      checkinId: "recovered-remote",
    });
    await f.call(f.req("/admin/reward-events/confirm", { reviewId: rid }));
    expect(f.adapter.mock.calls[0][2]).toBe("lookup");
    expect(f.adapter.mock.calls[0][3]).toEqual({ memberRef: mid });
    expect(f.db.rpc.mock.calls[1][1].p_document.externalId).toBe(
      "recovered-remote",
    );
  });
  it("does not mark an absent remote attendance record complete during recovery", async () => {
    const f = fixture();
    f.db.rpc.mockResolvedValue({
      data: {
        id: rid,
        state: "pending",
        recoveryOnly: true,
        event: {
          id: eid,
          encrypted_key: encryptPayload({ secret }, f.config.encryptionSecret),
        },
        memberRef: mid,
      },
    });
    await expect(
      f.call(f.req("/admin/reward-events/confirm", { reviewId: rid })),
    ).rejects.toMatchObject({ status: 409 });
    expect(f.db.rpc).toHaveBeenCalledTimes(1);
  });
  it("binds member code creation to both session and CSRF cookies and hashes them", async () => {
    const f = fixture();
    f.db.rpc.mockResolvedValue({
      data: {
        encryptedCode: encryptPayload(
          { code: secret },
          f.config.encryptionSecret,
        ),
        expiresAt: "2026-11-08T12:10:00Z",
      },
    });
    const r = f.req(
      "/rewards/event-links/code",
      { eventId: eid },
      {
        cookie:
          "__Host-gdg_rewards=" +
          secret +
          "; __Host-gdg_rewards_csrf=" +
          secret,
        "x-rewards-csrf": secret,
      },
    );
    await f.call(r);
    const args = f.db.rpc.mock.calls[0][1];
    expect(args.p_hash).toBe(tokenHash(secret));
    expect(args.p_csrf).toBe(tokenHash(secret));
    expect(args.p_document.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.parse(f.response.end.mock.calls[0][0]).data.code).toBe(secret);
  });
  it("rejects a mismatched member CSRF before code generation", async () => {
    const f = fixture();
    await expect(
      f.call(
        f.req(
          "/rewards/event-links/code",
          { eventId: eid },
          {
            cookie:
              "__Host-gdg_rewards=" +
              secret +
              "; __Host-gdg_rewards_csrf=" +
              secret,
            "x-rewards-csrf": "mismatch",
          },
        ),
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
});
