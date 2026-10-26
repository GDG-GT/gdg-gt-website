import { describe, it, expect, vi } from "vitest";
import { applicationHandler } from "../../server/handler.mjs";
function fixture() {
  const queries = [],
    rpc = vi.fn(async () => ({
      data: { items: [], page: 2, pageSize: 12, total: 0 },
      error: null,
    })),
    store = { rateLimit: vi.fn(async () => ({ allowed: true })) };
  const db = {
      rpc,
      from: vi.fn((table) => {
        const query = { table, steps: [] };
        queries.push(query);
        const chain = {};
        for (const name of [
          "select",
          "eq",
          "is",
          "order",
          "ilike",
          "contains",
          "range",
          "in",
          "gte",
          "limit",
        ])
          chain[name] = (...args) => {
            query.steps.push([name, ...args]);
            return chain;
          };
        chain.then = (resolve) =>
          Promise.resolve({ data: [], count: 0, error: null }).then(resolve);
        return chain;
      }),
    },
    config = {
      origin: "https://chapter.example.test",
      riskSecret: "fictional-public-test-risk",
    },
    handler = applicationHandler({ db, store, config });
  async function call(path, method = "GET") {
    const response = {
      statusCode: 200,
      headers: new Map(),
      setHeader(name, value) {
        this.headers.set(name.toLowerCase(), value);
      },
      end(value) {
        if (value) this.body = JSON.parse(value);
      },
    };
    await handler(
      {
        url: "/api/v1" + path,
        method,
        headers: { origin: config.origin },
        socket: { remoteAddress: "127.0.0.1" },
      },
      response,
    );
    return response;
  }
  return { call, queries, db, store };
}
describe("CONTENT-TEST public collection filtering and pagination", () => {
  it("preserves approved gallery event choices and builds only mediated image/download URLs", async () => {
    const f = fixture(),
      id = "f1080000-0000-4000-8000-000000000001";
    f.db.rpc.mockResolvedValueOnce({
      data: {
        items: [
          { id, width: 960, alt_text: "Fictional image", allow_download: true },
        ],
        total: 1,
        events: [
          {
            id: "f1080000-0000-4000-8000-000000000002",
            title: "Fictional event",
            discarded: "not a public field",
          },
        ],
      },
      error: null,
    });
    const r = await f.call("/gallery?page=2&event=" + id);
    expect(r.statusCode).toBe(200);
    expect(f.db.rpc).toHaveBeenCalledWith("read_public_gallery", {
      p_event: id,
      p_page: 2,
    });
    expect(r.body.data.events).toEqual([
      { id: "f1080000-0000-4000-8000-000000000002", title: "Fictional event" },
    ]);
    expect(r.body.data.items[0]).toMatchObject({
      url: "/api/v1/media/public/" + id,
      downloadUrl: `/api/v1/media/public/${id}?width=1920&download=true`,
    });
    expect(r.body.data.items[0].srcSet).toContain("?width=360 360w");
  });
  it("sorts actual event availability and start time before pagination in one bounded projection read", async () => {
    const f = fixture();
    const response = await f.call(
      "/events?sort=availability&page=2&pageSize=12",
    );
    expect(response.statusCode).toBe(200);
    expect(f.queries).toHaveLength(1);
    const query = f.queries[0];
    expect(query.table).toBe("public_event_inventory");
    const selection = query.steps.find(([name]) => name === "select");
    expect(selection[1]).toContain("registration_state");
    expect(selection[1]).not.toContain("registration_priority");
    expect(selection[1]).not.toContain("attendee_email");
    expect(query.steps.filter(([name]) => name === "order")).toEqual([
      ["order", "registration_priority", { ascending: true }],
      ["order", "start_at"],
      ["order", "id"],
    ]);
    expect(query.steps).toContainEqual(["range", 12, 23]);
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it("bounds homepage partner selections and excludes archived team and sponsor records", async () => {
    const f = fixture();
    const response = await f.call("/public/home");
    expect(response.statusCode).toBe(200);
    for (const table of ["team_members", "sponsors"]) {
      const query = f.queries.find((q) => q.table === table);
      expect(query.steps).toContainEqual(["is", "deleted_at", null]);
      expect(query.steps).toContainEqual(["order", "id"]);
    }
    expect(f.queries.find((q) => q.table === "sponsors").steps).toContainEqual([
      "limit",
      12,
    ]);
  });
  it("applies resource status/tag/type/level/search before deterministic pagination and omits archived rows", async () => {
    const f = fixture(),
      r = await f.call(
        "/resources?page=2&pageSize=12&q=Cloud&type=study_jam&level=Beginner&status=Available&tag=Cloud",
      );
    expect(r.statusCode).toBe(200);
    expect(f.queries[0].steps).toEqual(
      expect.arrayContaining([
        ["eq", "is_active", true],
        ["is", "deleted_at", null],
        ["eq", "status", "Available"],
        ["eq", "type", "study_jam"],
        ["eq", "level", "Beginner"],
        ["contains", "tags", ["Cloud"]],
        ["ilike", "title", "%Cloud%"],
        ["range", 12, 23],
      ]),
    );
    expect(r.body.data).toMatchObject({ page: 2, pageSize: 12, total: 0 });
    expect(r.headers.get("etag")).toBeTruthy();
    expect(r.headers.get("cache-control")).toBe(
      "public, max-age=0, s-maxage=0, must-revalidate",
    );
  });
  it("routes sponsor inventory through the pre-pagination tier-order transaction", async () => {
    const f = fixture(),
      r = await f.call("/sponsors?page=2&pageSize=12&q=Partner");
    expect(r.statusCode).toBe(200);
    expect(f.db.rpc).toHaveBeenCalledWith("read_public_sponsor_library", {
      p_page: 2,
      p_size: 12,
      p_query: "Partner",
    });
    expect(f.db.from).not.toHaveBeenCalled();
    await f.call("/sponsors");
    expect(f.db.rpc).toHaveBeenLastCalledWith("read_public_sponsor_library", {
      p_page: 1,
      p_size: 50,
      p_query: null,
    });
  });
  it.each(["/sponsors/tiers", "/sponsors/impact-stats"])(
    "keeps archived content out of the legacy public alias %s",
    async (path) => {
      const f = fixture(),
        response = await f.call(path);
      expect(response.statusCode).toBe(200);
      expect(f.queries).toHaveLength(1);
      expect(f.queries[0].steps).toContainEqual(["eq", "is_active", true]);
      expect(f.queries[0].steps).toContainEqual(["is", "deleted_at", null]);
      expect(f.queries[0].steps.filter(([step]) => step === "order")).toEqual([
        ["order", "order_index"],
        ["order", "id"],
      ]);
      expect(f.queries[0].steps[0][1]).not.toContain("deleted_at");
      expect(response.headers.get("cache-control")).toBe(
        "public, max-age=0, s-maxage=0, must-revalidate",
      );
    },
  );
  it("pages team profiles and the complete approved impact inventory independently", async () => {
    const f = fixture();
    expect((await f.call("/team?page=5&pageSize=24")).statusCode).toBe(200);
    expect(f.queries[0].steps).toContainEqual(["range", 96, 119]);
    expect(f.queries[0].steps[0][1]).not.toContain("email");
    expect((await f.call("/sponsor-stats?page=2&pageSize=12")).statusCode).toBe(
      200,
    );
    expect(f.queries[1].steps).toContainEqual(["range", 12, 23]);
  });
  it("rejects repeated/unknown/bad list filters and unsupported methods before reads", async () => {
    const f = fixture();
    for (const path of [
      "/resources?page=0",
      "/resources?page=1&page=2",
      "/team?pageSize=101",
      "/sponsors?private=true",
    ])
      expect((await f.call(path)).statusCode).toBe(400);
    expect((await f.call("/resources", "POST")).statusCode).toBe(405);
    expect(f.db.from).not.toHaveBeenCalled();
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it("counts only a valid resource ID through the shared per-resource quota without trusting a supplied count", async () => {
    const f = fixture();
    expect((await f.call("/resources/not-an-id/view", "POST")).statusCode).toBe(
      404,
    );
    const id = "f1000000-0000-4000-8000-000000000009";
    expect((await f.call(`/resources/${id}/view`, "POST")).statusCode).toBe(
      204,
    );
    expect(f.db.rpc).toHaveBeenCalledWith("increment_resource_views", {
      p_resource_id: id,
    });
    f.db.rpc.mockClear();
    f.store.rateLimit.mockResolvedValue({ allowed: false });
    expect((await f.call(`/resources/${id}/view`, "POST")).statusCode).toBe(
      204,
    );
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
});
