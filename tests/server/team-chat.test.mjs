import { describe, expect, it } from "vitest";
import { teamChatSetup } from "../../shared/team-chat.mjs";
import { applicationHandler } from "../../server/handler.mjs";
import { token } from "../../server/lib/security.mjs";
describe("managed team chat input and routing", () => {
  it("requires an existing password and exact plain team-name confirmation", () => {
    expect(
      teamChatSetup.parse({
        currentPassword: "fixture",
        confirmation: " Fictional team ",
      }).confirmation,
    ).toBe("Fictional team");
    for (const body of [
      { currentPassword: "", confirmation: "Team" },
      { currentPassword: "fixture", confirmation: "Team\u0000" },
      { currentPassword: "fixture", confirmation: "Team", teamId: "forged" },
    ])
      expect(teamChatSetup.safeParse(body).success).toBe(false);
  });
  it("routes nested team chat to protected authentication and rejects origins/methods", async () => {
    const config = {
        origin: "https://chapter.example.test",
        sessionCookie: "__Host-gdg_session",
      },
      db = {
        rpc: () => {
          throw new Error("No anonymous business work");
        },
      },
      app = applicationHandler({ config, store: {}, db });
    for (const [method, origin, status] of [
      ["GET", config.origin, 401],
      ["POST", config.origin, 401],
      ["POST", "https://other.example.test", 403],
      ["DELETE", config.origin, 405],
    ]) {
      const r = {
        statusCode: 200,
        setHeader() {},
        end(value) {
          this.body = JSON.parse(value);
        },
      };
      await app(
        {
          url: "/api/v1/admin/teams/e1000000-0000-4000-8000-000000000001/chat",
          method,
          headers: { origin },
        },
        r,
      );
      expect(r.statusCode).toBe(status);
    }
  });
  it("rejects setup without CSRF before a team lookup or password comparison", async () => {
    const config = {
        origin: "https://chapter.example.test",
        sessionCookie: "__Host-gdg_session",
      },
      store = {
        validateSession: async () => ({
          sessionId: "fixture-session",
          user: { id: "fixture-user", is_active: true },
        }),
      },
      db = {
        rpc: () => {
          throw new Error("CSRF bypassed");
        },
      },
      app = applicationHandler({ config, store, db }),
      r = {
        statusCode: 200,
        setHeader() {},
        end(value) {
          this.body = JSON.parse(value);
        },
      };
    await app(
      {
        url: "/api/v1/admin/teams/e1000000-0000-4000-8000-000000000001/chat",
        method: "POST",
        headers: {
          origin: config.origin,
          cookie: config.sessionCookie + "=" + token(),
        },
        body: { currentPassword: "fixture", confirmation: "Fictional team" },
      },
      r,
    );
    expect(r.statusCode).toBe(403);
    expect(r.body.error.code).toBe("CSRF_INVALID");
  });
});
