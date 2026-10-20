import { describe, expect, it, vi } from "vitest";
import { publicSubmissionRoutes } from "../../server/public-submissions.mjs";
import { hashSecret } from "../../server/lib/security.mjs";

describe("email-shaped gate privacy", () => {
  it("never subscribes or emails a gate entry, without revealing its validity", async () => {
    const code = "fictional-officer@example.test";
    const db = { rpc: vi.fn(async () => ({ data: {}, error: null })) };
    const store = {
      rateLimit: async () => ({ allowed: true }),
      gateConfiguration: async () => ({ gate_hash: await hashSecret(code) }),
    };
    const responses = [];
    for (const email of [code, "fictional-student@example.test"]) {
      const response = {
        setHeader() {},
        end(value) {
          this.body = JSON.parse(value);
        },
      };
      await publicSubmissionRoutes(
        {
          url: "/api/v1/newsletter/subscriptions",
          method: "POST",
          socket: { remoteAddress: "127.0.0.1" },
          headers: {
            "content-type": "application/json",
            "idempotency-key": "10000000-0000-4000-8000-000000000001",
          },
          body: { email },
        },
        response,
        {
          db,
          store,
          config: {
            origin: "http://127.0.0.1:8080",
            riskSecret: "fictional-risk",
            encryptionSecret: "a".repeat(64),
          },
          requestId: "10000000-0000-4000-8000-000000000002",
        },
      );
      responses.push(response.body);
      if (email === code) expect(db.rpc).not.toHaveBeenCalled();
    }
    expect(db.rpc).toHaveBeenCalledTimes(1);
    expect(db.rpc.mock.calls[0][1].p_email).toBe(
      "fictional-student@example.test",
    );
    expect(responses[0]).toEqual(responses[1]);
  });
});
