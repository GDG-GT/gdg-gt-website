import { describe, expect, it } from "vitest";
import { createPublicQueue, queueDocument, queueOutcome, QUEUE_TTL } from "../../shared/public-queue.mjs";
function fixture(fetcher = async () => new Response(JSON.stringify({ data: { accepted: true } }))) {
  const rows = new Map(); let epoch = 0, now = 1000000;
  const transact = async (operation) => operation({ items: [...rows.values()].map((r) => structuredClone(r)), epoch,
    put: (r) => rows.set(r.id, structuredClone(r)), remove: (id) => rows.delete(id), setEpoch: (v) => { epoch = v; } });
  const queue = createPublicQueue({ transact, fetcher, clock: () => now });
  return { queue, rows, advance: (ms) => { now += ms; } };
}
const newsletter = { email: "fictional-queue@example.test", website: "" }, event = { slug: "fictional-event", name: "Fictional Person", email: "fictional-queue@example.test", consent: true, notes: "Fixture", website: "" };
describe("Public offline submission queue", () => {
  it("accepts only minimal public event/newsletter payloads, never Forms, IDs or capabilities", () => {
    expect(queueDocument("event", event).slug).toBe("fictional-event");
    expect(queueDocument("newsletter", newsletter).email).toBe(newsletter.email);
    for (const [kind, payload] of [["forms", {}], ["event", { ...event, userId: "forged" }], ["event", { ...event, accessToken: "secret" }], ["event", { ...event, consent: false }], ["newsletter", { ...newsletter, password: "secret" }]]) expect(() => queueDocument(kind, payload)).toThrow();
  });
  it("retries only network/5xx, not any 4xx or unconfirmed 2xx", () => {
    for (const status of [0, 500, 503]) expect(queueOutcome("event", status).state).toBe("pending");
    for (const status of [400, 401, 403, 404, 409, 410, 422, 429]) expect(queueOutcome("event", status).state).toBe("failed");
    expect(queueOutcome("newsletter", 200, { gateValid: true }).state).toBe("failed");
    expect(queueOutcome("event", 200, {}).state).toBe("failed");
  });
  it("does not label a saved entry registered until an actual accepted server result", async () => {
    let calls = 0; const f = fixture(async (url, options) => { calls++; expect(url).toBe("/api/v1/events/fictional-event/registrations"); expect(options.credentials).toBe("omit"); expect(options.headers["Idempotency-Key"]).toMatch(/^[a-f0-9-]{36}$/); expect(JSON.parse(options.body).slug).toBeUndefined(); return new Response(JSON.stringify({ data: { status: "registered", registrationId: "fixture-reference" } })); });
    const saved = await f.queue.add("event", event); expect(saved.state).toBe("pending");
    await Promise.all([f.queue.replay(), f.queue.replay()]); expect(calls).toBe(1); expect((await f.queue.list())[0].state).toBe("accepted"); expect(f.rows.get(saved.id).payload).toEqual({});
  });
  it("expires and erases the payload after exactly 48 hours", async () => {
    let calls = 0; const f = fixture(async () => { calls++; throw Error("offline"); }), row = await f.queue.add("newsletter", newsletter);
    f.advance(QUEUE_TTL); await f.queue.replay(); expect(calls).toBe(0); expect((await f.queue.list())[0].state).toBe("expired"); expect(f.rows.get(row.id).payload).toEqual({});
  });
  it("uses bounded backoff and stops after eight attempts", async () => {
    let calls = 0; const f = fixture(async () => { calls++; return new Response("", { status: 503 }); }); await f.queue.add("newsletter", newsletter);
    await f.queue.replay(); await f.queue.replay(); expect(calls).toBe(1);
    for (let i = 1; i < 8; i++) { f.advance(31 * 60000); await f.queue.replay(); }
    expect(calls).toBe(8); expect((await f.queue.list())[0].state).toBe("failed"); await f.queue.replay(); expect(calls).toBe(8);
  });
  it("permanent validation/capacity failures stop automatic replay and erase local payload", async () => {
    let calls = 0; const f = fixture(async () => { calls++; return new Response("{}", { status: 409 }); }), row = await f.queue.add("event", event);
    await f.queue.replay(); f.advance(3600000); await f.queue.replay(); expect(calls).toBe(1); expect(f.rows.get(row.id).payload).toEqual({});
    await expect(f.queue.retry(row.id)).rejects.toThrow();
  });
  it("clearing on logout fences a late network result from resurrecting private queue entries", async () => {
    let release; const wait = new Promise((resolve) => { release = resolve; });
    const f = fixture(async () => { await wait; return new Response(JSON.stringify({ data: { accepted: true } })); });
    await f.queue.add("newsletter", newsletter); const running = f.queue.replay(); await new Promise((resolve) => setTimeout(resolve, 0));
    await f.queue.clear(); release(); await running; expect(await f.queue.list()).toEqual([]);
  });
  it("reuses the same key for unchanged queued retries and rejects payload substitution", async () => {
    const f = fixture(), row = await f.queue.add("newsletter", newsletter);
    expect((await f.queue.add("newsletter", newsletter, row.id)).id).toBe(row.id);
    await expect(f.queue.add("newsletter", { ...newsletter, email: "other@example.test" }, row.id)).rejects.toThrow();
    await f.queue.discard(row.id); expect(await f.queue.list()).toEqual([]);
  });
});
