import { describe, expect, it } from "vitest";
import { applicationHandler } from "../../server/handler.mjs";
function response() {
  return {
    statusCode: 200,
    setHeader() {},
    end(value) {
      this.body = JSON.parse(value);
    },
  };
}
const config = {
  origin: "https://chapter.example.test",
  sessionCookie: "__Host-gdg_session",
};
describe("Realtime token API routing", () => {
  it("routes the PRD auth endpoint and compatibility path to protected issuance", async () => {
    const app = applicationHandler({ config, store: {} });
    for (const path of ["/auth/realtime-token", "/realtime/token"]) {
      const r = response();
      await app(
        {
          url: "/api/v1" + path,
          method: "POST",
          headers: {
            origin: config.origin,
            "content-type": "application/json",
          },
          body: { kind: "notifications" },
        },
        r,
      );
      expect(r.statusCode).toBe(401);
      expect(r.body.error.code).not.toBe("NOT_FOUND");
    }
  });
  it("rejects other origins and incorrect methods before token issuance", async () => {
    const app = applicationHandler({ config, store: {} });
    for (const [method, origin, expected] of [
      ["GET", config.origin, 405],
      ["POST", "https://other.example.test", 403],
    ]) {
      const r = response();
      await app(
        { url: "/api/v1/auth/realtime-token", method, headers: { origin } },
        r,
      );
      expect(r.statusCode).toBe(expected);
    }
  });
});
