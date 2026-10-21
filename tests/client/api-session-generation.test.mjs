import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const A = "a".repeat(64),
  B = "b".repeat(64);
const ok = (data) => new Response(JSON.stringify({ data }), { status: 200 });
const error = (status, code) =>
  new Response(
    JSON.stringify({ error: { code, message: "Fictional failure" } }),
    { status },
  );
const session = (binding = A, csrfToken = "fictional-csrf-a") =>
  ok({ sessionBinding: binding, csrfToken });
function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
let api, clearApiSession, fetcher;
beforeEach(async () => {
  vi.resetModules();
  fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  ({ api, clearApiSession } = await import("../../src/lib/api.ts"));
});
afterEach(() => vi.unstubAllGlobals());
async function bind() {
  fetcher.mockResolvedValueOnce(session());
  await api("/auth/session");
}
describe("session-bound same-origin API transport", () => {
  it("initializes the binding before a private write and keeps its idempotency key", async () => {
    fetcher
      .mockResolvedValueOnce(session())
      .mockResolvedValueOnce(ok({ saved: true }));
    expect(
      await api("/admin/members", {
        protected: true,
        method: "post",
        body: { fictional: true },
        idempotencyKey: "same-key",
      }),
    ).toEqual({ saved: true });
    const options = fetcher.mock.calls[1][1];
    expect(options.method).toBe("POST");
    expect(options.headers["X-Session-Binding"]).toBe(A);
    expect(options.headers["Idempotency-Key"]).toBe("same-key");
  });
  it("retries only pre-mutation CSRF failure under the same binding", async () => {
    await bind();
    fetcher
      .mockResolvedValueOnce(error(403, "CSRF_INVALID"))
      .mockResolvedValueOnce(session(A, "refreshed-csrf"))
      .mockResolvedValueOnce(ok({ saved: true }));
    await api("/admin/members", {
      protected: true,
      method: "POST",
      body: { fictional: true },
      idempotencyKey: "same-key",
    });
    const first = fetcher.mock.calls[1][1],
      retry = fetcher.mock.calls[3][1];
    expect(retry.body).toBe(first.body);
    expect(retry.headers["Idempotency-Key"]).toBe(
      first.headers["Idempotency-Key"],
    );
    expect(retry.headers["X-Session-Binding"]).toBe(A);
    expect(retry.headers["X-CSRF-Token"]).toBe("refreshed-csrf");
  });
  it("does not replay a private body when a refresh detects another cookie generation", async () => {
    await bind();
    fetcher
      .mockResolvedValueOnce(error(403, "CSRF_INVALID"))
      .mockResolvedValueOnce(session(B));
    await expect(
      api("/admin/members", {
        protected: true,
        method: "POST",
        body: { privateDraft: true },
      }),
    ).rejects.toMatchObject({ code: "SESSION_CHANGED" });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("does not refresh or retry the server's explicit session mismatch", async () => {
    await bind();
    fetcher.mockResolvedValueOnce(error(409, "SESSION_CHANGED"));
    await expect(
      api("/admin/members", { protected: true, method: "POST" }),
    ).rejects.toMatchObject({ code: "SESSION_CHANGED" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("aborts an awaiting refresh and never sends its pending private body after session clear", async () => {
    const pending = deferred();
    fetcher.mockReturnValueOnce(pending.promise);
    const result = api("/admin/members", {
      protected: true,
      method: "POST",
      body: { oldPrivateDraft: true },
    });
    const checked = expect(result).rejects.toMatchObject({
      code: "SESSION_CHANGED",
    });
    clearApiSession();
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
    pending.resolve(session());
    await checked;
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("late old-session 401 cannot clear a newly established sign-in", async () => {
    await bind();
    const pending = deferred();
    fetcher.mockReturnValueOnce(pending.promise);
    const previous = api("/admin/members");
    const checked = expect(previous).rejects.toMatchObject({
      code: "SESSION_CHANGED",
    });
    fetcher.mockResolvedValueOnce(session(B, "new-login-csrf"));
    await api("/auth/login", { method: "POST", body: { fictional: true } });
    pending.resolve(error(401, "AUTH_REQUIRED"));
    await checked;
    fetcher.mockResolvedValueOnce(ok({ saved: true }));
    await api("/admin/members", { method: "POST", protected: true });
    expect(fetcher.mock.calls.at(-1)[1].headers["X-Session-Binding"]).toBe(B);
    expect(fetcher.mock.calls.at(-1)[1].headers["X-CSRF-Token"]).toBe(
      "new-login-csrf",
    );
  });
  it("does not accept a late decoded private response after session clear", async () => {
    await bind();
    const pending = deferred();
    fetcher.mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: () => pending.promise,
    });
    const result = api("/admin/members");
    const checked = expect(result).rejects.toMatchObject({
      code: "SESSION_CHANGED",
    });
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    clearApiSession();
    pending.resolve({ data: { privatePeople: ["fictional"] } });
    await checked;
  });
  it("shares concurrent refresh but never shares pending mutation bodies", async () => {
    const pending = deferred();
    fetcher
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(ok({ saved: true }))
      .mockResolvedValueOnce(ok({ saved: true }));
    const a = api("/admin/members", {
      method: "POST",
      protected: true,
      body: { id: "a" },
    });
    const b = api("/admin/members", {
      method: "POST",
      protected: true,
      body: { id: "b" },
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    pending.resolve(session());
    await Promise.all([a, b]);
    expect(
      fetcher.mock.calls.slice(1).map(([, options]) => options.body),
    ).toEqual(['{"id":"a"}', '{"id":"b"}']);
  });
  it("password rotation invalidates other pending results and uses the new generation", async () => {
    await bind();
    const pending = deferred();
    fetcher.mockReturnValueOnce(pending.promise);
    const previous = api("/admin/members");
    const checked = expect(previous).rejects.toMatchObject({
      code: "SESSION_CHANGED",
    });
    fetcher.mockResolvedValueOnce(session(B, "rotated-csrf"));
    await api("/auth/password", { method: "POST", protected: true });
    pending.resolve(ok({ oldPrivateResult: true }));
    await checked;
    fetcher.mockResolvedValueOnce(ok({ saved: true }));
    await api("/admin/members", { method: "POST", protected: true });
    expect(fetcher.mock.calls.at(-1)[1].headers["X-Session-Binding"]).toBe(B);
  });
  it("public failures and forged CSRF response fields cannot replace the private session", async () => {
    await bind();
    fetcher.mockResolvedValueOnce(error(401, "FORM_ACCESS_REQUIRED"));
    await expect(api("/forms/fictional")).rejects.toMatchObject({
      status: 401,
    });
    fetcher.mockResolvedValueOnce(ok({ csrfToken: "untrusted-public-token" }));
    await api("/site-content");
    fetcher.mockResolvedValueOnce(ok({ saved: true }));
    await api("/admin/members", { method: "POST", protected: true });
    expect(fetcher.mock.calls.at(-1)[1].headers["X-CSRF-Token"]).toBe(
      "fictional-csrf-a",
    );
  });
  it("combines caller cancellation with session cancellation", async () => {
    await bind();
    const caller = new AbortController();
    fetcher.mockResolvedValueOnce(ok({ items: [] }));
    await api("/admin/members", { signal: caller.signal });
    const signal = fetcher.mock.calls.at(-1)[1].signal;
    caller.abort();
    expect(signal.aborted).toBe(true);
  });
  it("rejects a missing binding from the private session bootstrap", async () => {
    fetcher.mockResolvedValueOnce(ok({ csrfToken: "fictional" }));
    await expect(
      api("/admin/members", { method: "POST", protected: true }),
    ).rejects.toMatchObject({ status: 503 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
