import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startScopedRealtime } from "../../src/lib/scoped-realtime.ts";
import { ApiFailure } from "../../src/lib/api.ts";
const id = "10000000-0000-4000-8000-000000000001";
const scope = { kind: "channel", id };
const grant = () => ({
  token: "fictional-memory-token",
  expiresAt: Math.floor(Date.now() / 1000) + 300,
  topic: "gdg:channel:" + id,
  url: "http://127.0.0.1:54361",
  key: "fictional-publishable-key",
});
function fixture(issue = vi.fn(async () => grant())) {
  const clients = [],
    order = [];
  const load = vi.fn(async () => ({
    createClient: vi.fn((_url, _key, options) => {
      const state = { options };
      const channel = {
        teardown: vi.fn(),
        on: vi.fn((_event, _filter, callback) => {
          state.broadcast = callback;
          return channel;
        }),
        subscribe: vi.fn((callback) => {
          state.status = callback;
          order.push("subscribe");
          callback("SUBSCRIBED");
          return channel;
        }),
      };
      const client = {
        getChannels: () => [],
        realtime: {
          setAuth: vi.fn(async () => {
            order.push("auth");
          }),
          disconnect: vi.fn(),
        },
        channel: vi.fn(() => channel),
        removeAllChannels: vi.fn(async () => {}),
      };
      clients.push({
        ...state,
        client,
        channel,
        get broadcast() {
          return state.broadcast;
        },
        get status() {
          return state.status;
        },
      });
      return client;
    }),
  }));
  const options = {
    scope,
    onChange: vi.fn(),
    onDenied: vi.fn(),
    onStatus: vi.fn(),
  };
  const live = startScopedRealtime(options, { issue, load });
  return { live, clients, order, options, issue };
}
const settle = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-20T12:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});
describe("scoped browser Realtime lifecycle", () => {
  it("authenticates before private join and invalidates after every successful subscription", async () => {
    const f = fixture();
    await settle();
    expect(f.order).toEqual(["auth", "subscribe"]);
    expect(f.clients[0].client.channel).toHaveBeenCalledWith(
      "gdg:channel:" + id,
      { config: { private: true } },
    );
    expect(f.clients[0].options.auth.persistSession).toBe(false);
    expect(f.options.onChange).toHaveBeenCalledTimes(1);
    f.clients[0].broadcast({
      payload: { kind: "channel", id: "another-room" },
    });
    f.clients[0].broadcast({ payload: { kind: "notifications" } });
    expect(f.options.onChange).toHaveBeenCalledTimes(1);
    f.clients[0].broadcast({ payload: { kind: "channel", id } });
    expect(f.options.onChange).toHaveBeenCalledTimes(2);
    f.live.stop();
    expect(f.clients[0].client.realtime.disconnect).toHaveBeenCalledTimes(1);
    expect(await f.clients[0].options.accessToken()).toBe(null);
  });
  it("renews through protected issuance before expiry without widening the topic", async () => {
    const f = fixture();
    await settle();
    await vi.advanceTimersByTimeAsync(240000);
    expect(f.issue).toHaveBeenCalledTimes(2);
    expect(f.clients[0].client.realtime.setAuth).toHaveBeenCalledTimes(2);
    expect(f.clients).toHaveLength(1);
    f.live.stop();
  });
  it("disconnects and clears token memory on authorization loss without retry", async () => {
    const issue = vi
      .fn()
      .mockImplementationOnce(async () => grant())
      .mockRejectedValue(new ApiFailure(403, "FORBIDDEN", "Access ended"));
    const f = fixture(issue);
    await settle();
    await vi.advanceTimersByTimeAsync(240000);
    expect(f.options.onDenied).toHaveBeenCalledTimes(1);
    expect(f.options.onStatus).toHaveBeenLastCalledWith("denied");
    expect(f.clients[0].client.realtime.disconnect).toHaveBeenCalled();
    expect(await f.clients[0].options.accessToken()).toBe(null);
    await vi.advanceTimersByTimeAsync(600000);
    f.live.refresh();
    await settle();
    expect(issue).toHaveBeenCalledTimes(2);
    f.live.stop();
  });
  it("uses delayed private retries rather than an anonymous fallback", async () => {
    const f = fixture();
    await settle();
    f.clients[0].status("CHANNEL_ERROR");
    expect(f.options.onStatus).toHaveBeenLastCalledWith("fallback");
    expect(f.clients[0].client.realtime.disconnect).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(29999);
    expect(f.issue).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(f.issue).toHaveBeenCalledTimes(2);
    expect(f.clients[1].client.channel).toHaveBeenCalledWith(
      "gdg:channel:" + id,
      { config: { private: true } },
    );
    f.live.stop();
  });
  it("does not open a late socket after unmount during token issuance", async () => {
    let resolve;
    const f = fixture(
      vi.fn(
        () =>
          new Promise((r) => {
            resolve = r;
          }),
      ),
    );
    f.live.stop();
    resolve(grant());
    await settle();
    expect(f.clients).toHaveLength(0);
    expect(f.options.onChange).not.toHaveBeenCalled();
  });
  it("refuses wrong topics and overlong grants before any socket opens", async () => {
    for (const value of [
      { ...grant(), topic: "gdg:channel:wrong" },
      { ...grant(), expiresAt: Math.floor(Date.now() / 1000) + 301 },
    ]) {
      const f = fixture(vi.fn(async () => value));
      await settle();
      expect(f.clients).toHaveLength(0);
      expect(f.options.onStatus).toHaveBeenLastCalledWith("fallback");
      f.live.stop();
    }
  });
  it("cannot resurrect an old client through a refresh racing with a transport error", async () => {
    let resolve;
    const issue = vi
      .fn()
      .mockImplementationOnce(async () => grant())
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            resolve = r;
          }),
      );
    const f = fixture(issue);
    await settle();
    await vi.advanceTimersByTimeAsync(240000);
    f.clients[0].status("CLOSED");
    resolve(grant());
    await settle();
    expect(f.clients[0].client.realtime.setAuth).toHaveBeenCalledTimes(1);
    expect(f.options.onStatus).toHaveBeenLastCalledWith("fallback");
    f.live.stop();
  });
  it("immediately tears down a connected scope when access-change reauthorization is requested", async () => {
    const f = fixture();
    await settle();
    f.live.reauthorize();
    await settle();
    expect(f.clients[0].channel.teardown).toHaveBeenCalled();
    expect(f.issue).toHaveBeenCalledTimes(2);
    expect(f.clients).toHaveLength(2);
    f.live.stop();
  });
  it("does not lose an access-change request racing with initial issuance", async () => {
    let resolve;
    const issue = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            resolve = r;
          }),
      )
      .mockImplementation(async () => grant());
    const f = fixture(issue);
    f.live.reauthorize();
    resolve(grant());
    await settle();
    expect(issue).toHaveBeenCalledTimes(2);
    expect(f.clients).toHaveLength(1);
    f.live.stop();
  });
});
