import { describe, expect, it, vi } from "vitest";
import { applicationHandler } from "../../server/handler.mjs";
import { tokenHash } from "../../server/lib/security.mjs";
function fixture() {
  const db = {
      rpc: vi.fn(async () => ({
        data: { valid: true, applied: false },
        error: null,
      })),
    },
    store = {
      rateLimit: vi.fn(async () => ({ allowed: true, retryAfter: 60 })),
    },
    config = {
      origin: "https://chapter.example.test",
      riskSecret: "fictional-risk",
    },
    handler = applicationHandler({ db, store, config });
  return {
    db,
    store,
    async call(path, body = { token: "a".repeat(43) }, method = "POST") {
      const response = {
        statusCode: 200,
        headers: {},
        setHeader(k, v) {
          this.headers[k.toLowerCase()] = v;
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
            "content-type": "application/json",
          },
          socket: { remoteAddress: "127.0.0.1" },
        },
        response,
      );
      return response;
    },
  };
}
describe("Newsletter read-only token review", () => {
  it.each(["confirm", "unsubscribe"])(
    "validates %s without consuming or exposing identity",
    async (kind) => {
      const f = fixture(),
        r = await f.call(`/newsletter/${kind}/validate`);
      expect(r.statusCode).toBe(200);
      expect(r.headers["cache-control"]).toBe("no-store");
      expect(r.body.data).toEqual({ valid: true, applied: false });
      expect(f.db.rpc).toHaveBeenCalledExactlyOnceWith(
        "inspect_newsletter_token",
        { p_hash: tokenHash("a".repeat(43)), p_purpose: kind },
      );
      expect(JSON.stringify(r.body)).not.toContain("a".repeat(43));
    },
  );
  it("projects only safe booleans and never treats an invalid token as applied", async () => {
    const f = fixture();
    f.db.rpc.mockResolvedValueOnce({
      data: {
        valid: false,
        applied: true,
        email: "private@example.test",
        subscriberId: "private",
      },
    });
    const r = await f.call("/newsletter/confirm/validate");
    expect(r.body.data).toEqual({ valid: false, applied: false });
    expect(JSON.stringify(r.body)).not.toContain("private");
  });
  it("consumes only at the explicit action endpoint", async () => {
    const f = fixture();
    f.db.rpc.mockResolvedValueOnce({ data: true, error: null });
    const r = await f.call("/newsletter/confirm");
    expect(r.statusCode).toBe(200);
    expect(r.body.data).toEqual({ updated: true });
    expect(f.db.rpc).toHaveBeenCalledExactlyOnceWith(
      "consume_newsletter_token",
      { p_hash: tokenHash("a".repeat(43)), p_purpose: "confirm" },
    );
  });
  it("rejects GETs and malformed or extra input before token reads", async () => {
    const f = fixture();
    expect(
      (await f.call("/newsletter/confirm/validate", undefined, "GET"))
        .statusCode,
    ).toBe(405);
    for (const body of [
      { token: "short" },
      { token: "a".repeat(43), purpose: "unsubscribe" },
      { email: "arbitrary@example.test" },
    ])
      expect(
        (await f.call("/newsletter/confirm/validate", body)).statusCode,
      ).toBe(400);
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it("bounds token inspection and redacts database failures", async () => {
    const f = fixture();
    f.store.rateLimit.mockResolvedValueOnce({ allowed: false, retryAfter: 60 });
    expect((await f.call("/newsletter/unsubscribe/validate")).statusCode).toBe(
      429,
    );
    expect(f.db.rpc).not.toHaveBeenCalled();
    f.db.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "XX000", message: "private database trace" },
    });
    const r = await f.call("/newsletter/confirm/validate");
    expect(r.statusCode).toBeGreaterThanOrEqual(500);
    expect(JSON.stringify(r.body)).not.toContain("private database trace");
  });
});
