import { afterEach, describe, it, expect, vi } from "vitest";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
describe("browser API session transport", () => {
  it("refreshes a stale CSRF once without changing mutation idempotency", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          data: { csrfToken: "stale-token", sessionBinding: "a".repeat(64) },
        }),
      )
      .mockResolvedValueOnce(
        json({ error: { code: "CSRF_INVALID", message: "Refresh" } }, 403),
      )
      .mockResolvedValueOnce(
        json({
          data: { csrfToken: "fresh-token", sessionBinding: "a".repeat(64) },
        }),
      )
      .mockResolvedValueOnce(json({ data: { saved: true } }));
    vi.stubGlobal("fetch", fetch);
    const { api } = await import("../../src/lib/api.ts");
    await api("/auth/session");
    await expect(
      api("/admin/example", {
        method: "POST",
        protected: true,
        body: { title: "Example" },
        idempotencyKey: "stable-test-request-key",
      }),
    ).resolves.toEqual({ saved: true });
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(fetch.mock.calls[2][0]).toBe("/api/v1/auth/session");
    expect(fetch.mock.calls[1][1].body).toBe(fetch.mock.calls[3][1].body);
    expect(fetch.mock.calls[3][1].headers).toMatchObject({
      "X-CSRF-Token": "fresh-token",
      "Idempotency-Key": "stable-test-request-key",
    });
  });
  it("never loops on repeated CSRF failures or retries business failures", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        json({ data: { csrfToken: "old", sessionBinding: "a".repeat(64) } }),
      )
      .mockResolvedValueOnce(json({ error: { code: "CSRF_INVALID" } }, 403))
      .mockResolvedValueOnce(
        json({ data: { csrfToken: "fresh", sessionBinding: "a".repeat(64) } }),
      )
      .mockResolvedValueOnce(
        json(
          { error: { code: "CSRF_INVALID", message: "Reload required" } },
          403,
        ),
      );
    vi.stubGlobal("fetch", fetch);
    const { api } = await import("../../src/lib/api.ts");
    await api("/auth/session");
    await expect(
      api("/admin/example", { method: "PATCH", body: {} }),
    ).rejects.toMatchObject({ code: "CSRF_INVALID" });
    expect(fetch).toHaveBeenCalledTimes(4);
    fetch
      .mockReset()
      .mockResolvedValue(
        json({ error: { code: "CONFLICT", message: "Stale revision" } }, 409),
      );
    await expect(
      api("/admin/example", { method: "PATCH", body: {} }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("fails safely on malformed envelopes and rejects cross-origin API paths", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json({ unexpected: "value" })),
    );
    const { api } = await import("../../src/lib/api.ts");
    await expect(api("/public")).rejects.toMatchObject({
      code: "TEMPORARILY_UNAVAILABLE",
    });
    await expect(api("https://example.test")).rejects.toThrow(
      "relative API path",
    );
  });
});
