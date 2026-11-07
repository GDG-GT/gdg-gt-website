import { describe, expect, it, vi } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { runtimeOrigin, scheduledJobs, dueJobs, invokeScheduledJob } from "../../scripts/lib/runtime-plan.mjs";
describe("production runtime packaging", () => {
  it("requires a matching production HTTPS origin without credentials or insecure cookies", () => {
    const env = { NODE_ENV: "production", APP_ORIGIN: "https://fictional.example.test" };
    expect(runtimeOrigin(env, env.APP_ORIGIN)).toBe(env.APP_ORIGIN);
    for (const change of [{ NODE_ENV: "development" }, { APP_ORIGIN: "http://localhost" }, { APP_ORIGIN: "https://user:password@fictional.example.test" }, { ALLOW_INSECURE_LOCAL_COOKIES: "true" }, { APP_ORIGIN: "https://fictional.example.test/path" }]) expect(() => runtimeOrigin({ ...env, ...change }, env.APP_ORIGIN)).toThrow();
    expect(() => runtimeOrigin(env, "https://another.example.test")).toThrow();
  });
  it("includes all eleven scheduled jobs with individual cadence", () => {
    expect(new Set(scheduledJobs.map(([name]) => name)).size).toBe(11);
    const due = new Map(scheduledJobs.map(([name]) => [name, 200])); due.set("delivery", 10);
    expect(dueJobs(due, 100).map(([name]) => name)).toEqual(["delivery"]);
    expect(dueJobs(due, 200)).toHaveLength(11);
  });
  it("uses a server credential without forwarding cookies, allows no redirect, and exposes only safe results", async () => {
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ data: { runId: "fictional-run", counts: { done: 1 }, secret: "discarded" } }) }));
    const result = await invokeScheduledJob("delivery", { origin: "https://fictional.example.test", secret: "f".repeat(32), fetcher });
    expect(result).toEqual({ runId: "fictional-run", counts: { done: 1 }, skipped: undefined });
    expect(fetcher.mock.calls[0][1]).toMatchObject({ method: "POST", redirect: "error", headers: { Authorization: "Bearer " + "f".repeat(32) } });
    expect(fetcher.mock.calls[0][1].headers.Cookie).toBeUndefined();
    await expect(invokeScheduledJob("unknown", { origin: "https://fictional.example.test", secret: "f".repeat(32), fetcher })).rejects.toThrow();
    await expect(invokeScheduledJob("delivery", { origin: "https://fictional.example.test", secret: "short", fetcher })).rejects.toThrow();
  });
  it("fails on rejected jobs and unreadable successes", async () => {
    for (const response of [{ ok: false }, { ok: true, json: async () => ({ data: {} }) }]) await expect(invokeScheduledJob("delivery", { origin: "https://fictional.example.test", secret: "f".repeat(32), fetcher: async () => response })).rejects.toThrow();
  });
  it("both CLI plans run with no credentials or network configuration", async () => {
    for (const script of ["runtime-workers.mjs", "bootstrap-owner.mjs"]) {
      const result = await promisify(execFile)(process.execPath, ["scripts/" + script, "--plan"], { env: { PATH: process.env.PATH } });
      expect(result.stderr).toBe(""); expect(result.stdout.toLowerCase()).toContain("plan");
    }
  });
});
