import { describe, it, expect, vi } from "vitest";
import { authorizeJob, jobRoutes } from "../../server/jobs.mjs";
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
  it("daily retention uses only its saved current lease and bounded counters", async () => {
    vi.stubEnv("CRON_SECRET", env.CRON_SECRET);
    try {
      for (const name of [
        "session-cleanup",
        "notification-cleanup",
        "report-cache-cleanup",
      ]) {
        const calls = [],
          response = {
            setHeader() {},
            end(value) {
              this.body = JSON.parse(value);
            },
          },
          db = {
            rpc: async (rpc, args) => {
              calls.push([rpc, args]);
              return {
                data:
                  rpc === "begin_scheduled_job"
                    ? { runId: "fixture-run", lease: "fixture-lease" }
                    : rpc === "run_operational_retention"
                      ? { expired: 2 }
                      : true,
              };
            },
          };
        expect(
          await jobRoutes(
            { url: `/api/v1/jobs/${name}`, method: "POST", headers },
            response,
            {
              db,
              config: { origin: "http://127.0.0.1:8080" },
              requestId: "fixture-request",
            },
          ),
        ).toBe(true);
        expect(calls).toEqual([
          [
            "begin_scheduled_job",
            { p_name: name, p_request: "fixture-request" },
          ],
          [
            "run_operational_retention",
            { p_run: "fixture-run", p_lease: "fixture-lease", p_limit: 1000 },
          ],
          [
            "finish_scheduled_job",
            {
              p_id: "fixture-run",
              p_lease: "fixture-lease",
              p_success: true,
              p_counts: { expired: 2 },
              p_error: null,
            },
          ],
        ]);
        expect(response.body.data.counts).toEqual({ expired: 2 });
      }
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it("does not execute a completed occurrence or accept caller-selected retention windows", async () => {
    vi.stubEnv("CRON_SECRET", env.CRON_SECRET);
    try {
      const db = {
          rpc: vi.fn(async () => ({ data: { skipped: "already_completed" } })),
        },
        response = {
          setHeader() {},
          end(value) {
            this.body = JSON.parse(value);
          },
        },
        context = {
          db,
          config: { origin: "http://127.0.0.1:8080" },
          requestId: "fixture-request",
        };
      await jobRoutes(
        { url: "/api/v1/jobs/session-cleanup", method: "POST", headers },
        response,
        context,
      );
      expect(db.rpc).toHaveBeenCalledTimes(1);
      expect(response.body.data.skipped).toBe("already_completed");
      await expect(
        jobRoutes(
          {
            url: "/api/v1/jobs/session-cleanup?days=0",
            method: "POST",
            headers,
          },
          response,
          context,
        ),
      ).rejects.toMatchObject({ status: 400 });
      expect(db.rpc).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
