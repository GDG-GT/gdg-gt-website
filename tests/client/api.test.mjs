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

describe('bounded navigation reads', () => {
  it('turns a stalled read into a retryable failure without retrying or clearing the session', async () => {
    const deadline = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal);
    const fetcher = vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason), { once:true });
    }));
    vi.stubGlobal('fetch', fetcher);
    const { api, API_READ_TIMEOUT_MS } = await import('../../src/lib/api.ts');
    const pending = api('/admin/forms');
    const rejected = expect(pending).rejects.toMatchObject({ status:504,code:'READ_TIMEOUT' });
    deadline.abort(new DOMException('Read deadline', 'TimeoutError'));
    await rejected;
    expect(timeout).toHaveBeenCalledWith(API_READ_TIMEOUT_MS);
    expect(fetcher).toHaveBeenCalledTimes(1);
    timeout.mockRestore();
  });
  it('keeps the read deadline active until the body finishes', async () => {
    const deadline = new AbortController();
    const timeout = vi.spyOn(AbortSignal,'timeout').mockReturnValue(deadline.signal);
    vi.stubGlobal('fetch', vi.fn(async (_url,options) => ({ status:200,ok:true,json:() => new Promise((_resolve,reject) => {
      options.signal.addEventListener('abort',() => reject(options.signal.reason),{once:true});
    }) })));
    const {api} = await import('../../src/lib/api.ts');
    const pending=api('/events');
    const rejected=expect(pending).rejects.toMatchObject({code:'READ_TIMEOUT'});
    await Promise.resolve();
    deadline.abort(new DOMException('Read deadline','TimeoutError'));
    await rejected;
    timeout.mockRestore();
  });
  it('keeps explicit navigation cancellation distinct from a timeout', async () => {
    const controller=new AbortController();
    vi.stubGlobal('fetch',vi.fn((_url,options) => new Promise((_resolve,reject) => {
      options.signal.addEventListener('abort',() => reject(options.signal.reason),{once:true});
    })));
    const {api}=await import('../../src/lib/api.ts');
    const pending=api('/events',{signal:controller.signal});
    const rejected=expect(pending).rejects.toMatchObject({name:'AbortError'});
    controller.abort();
    await rejected;
  });
});
