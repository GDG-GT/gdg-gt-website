import { describe, it, expect } from "vitest";
import { authorizeJob } from "../../server/jobs.mjs";
describe("scheduled job authentication", () => {
  const env = { CRON_SECRET: "test-only-random-job-key-".repeat(3) },
    headers = {
      authorization: "Bearer " + "test-only-random-job-key-".repeat(3),
    };
  it("accepts only a purpose-specific server bearer credential", () => {
    expect(() => authorizeJob({ headers }, env)).not.toThrow();
    for (const authorization of [undefined, "", "Basic abc", "Bearer wrong"])
      expect(() => authorizeJob({ headers: { authorization } }, env)).toThrow();
  });
  it("rejects browser origins, cookies and cross-site requests even with the job key", () => {
    for (const extra of [
      { origin: "http://127.0.0.1:8080" },
      { cookie: "session=opaque" },
      { "sec-fetch-site": "same-origin" },
      { "sec-fetch-site": "cross-site" },
    ])
      expect(() =>
        authorizeJob({ headers: { ...headers, ...extra } }, env),
      ).toThrow();
  });
  it("fails closed when its separate cron secret is not configured", () => {
    expect(() => authorizeJob({ headers }, {})).toThrow();
  });
});
