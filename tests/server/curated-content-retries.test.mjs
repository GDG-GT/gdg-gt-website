import { describe, it, expect, vi } from "vitest";
import { siteContentRoutes } from "../../server/site-content.mjs";
import { contentRecordRoutes } from "../../server/content-records.mjs";
import { ApiError } from "../../server/lib/http.mjs";
import { token, tokenHash } from "../../server/lib/security.mjs";
const actor = "c1110000-0000-4000-8000-000000000001",
  sessionId = "c1110000-0000-4000-8000-000000000002",
  recordId = "c1110000-0000-4000-8000-000000000003";
function fixture() {
  const raw = token(),
    csrf = token(),
    config = {
      origin: "https://chapter.example.test",
      sessionCookie: "__Host-gdg_session",
    };
  const store = {
    validateSession: vi.fn(async () => ({
      sessionId,
      user: { id: actor, role: "admin", is_active: true },
    })),
    csrf: vi.fn(async () => ({
      token_hash: tokenHash(csrf),
      expires_at: new Date(Date.now() + 60000).toISOString(),
    })),
  };
  const db = {
    rpc: vi.fn(async (name) => ({
      data:
        name === "can_manage_site_content"
          ? true
          : { id: recordId, revision: 1, is_active: false },
    })),
  };
  async function call(namespace, key, extra = {}) {
    const site = namespace === "site",
      record = site
        ? { label: "Fictional retry navigation", href: "/events" }
        : {
            title: "Fictional retry resource",
            description: "Fictional content only",
            type: "documentation",
          },
      request = {
        url: site
          ? "/api/v1/admin/site-content/navigation"
          : "/api/v1/admin/content-records/resources",
        method: "POST",
        body: site ? { record, ...extra } : { teamId: null, record, ...extra },
        headers: {
          origin: config.origin,
          "content-type": "application/json",
          cookie: config.sessionCookie + "=" + raw,
          "x-csrf-token": csrf,
          ...(key === undefined ? {} : { "idempotency-key": key }),
        },
      },
      response = {
        statusCode: 200,
        setHeader() {},
        end(body) {
          this.body = JSON.parse(body);
        },
      };
    try {
      await (site ? siteContentRoutes : contentRecordRoutes)(
        request,
        response,
        { db, store, config, requestId: recordId },
      );
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      response.statusCode = e.status;
      response.error = e;
    }
    return response;
  }
  return { call, db };
}
describe("Curated mutation retry transport", () => {
  it.each(["site", "collection"])(
    "rejects missing and malformed %s retry keys before invoking a mutation",
    async (ns) => {
      const f = fixture();
      for (const key of [undefined, "short", ["duplicated", "selector"]]) {
        expect((await f.call(ns, key)).statusCode).toBe(400);
      }
      expect(
        f.db.rpc.mock.calls.some(([name]) => name === "mutate_curated_content"),
      ).toBe(false);
    },
  );
  it.each(["site", "collection"])(
    "binds %s retry receipts to trusted actor/session and hashes the key",
    async (ns) => {
      const f = fixture(),
        key = "fictional-key-00000001",
        r = await f.call(ns, key);
      expect(r.statusCode).toBe(200);
      const mutation = f.db.rpc.mock.calls.find(
        ([name]) => name === "mutate_curated_content",
      );
      expect(mutation[1]).toMatchObject({
        p_actor: actor,
        p_session: sessionId,
        p_namespace: ns,
        p_action: "create",
        p_id: null,
        p_key_hash: tokenHash(key),
        p_request_id: recordId,
      });
      expect(mutation[1].p_request_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(JSON.stringify(mutation[1])).not.toContain(key);
    },
  );
  it("fingerprints namespace and validated intent rather than only the retry key", async () => {
    const f = fixture(),
      key = "fictional-key-00000001";
    await f.call("site", key);
    await f.call("collection", key);
    const mutations = f.db.rpc.mock.calls.filter(
      ([name]) => name === "mutate_curated_content",
    );
    expect(mutations[0][1].p_request_hash).not.toBe(
      mutations[1][1].p_request_hash,
    );
    expect(mutations[0][1].p_key_hash).toBe(mutations[1][1].p_key_hash);
  });
  it.each(["site", "collection"])(
    "rejects client actor/session injection in %s writes",
    async (ns) => {
      const f = fixture();
      expect(
        (
          await f.call(ns, "fictional-key-00000001", {
            actorId: recordId,
            sessionId: recordId,
          })
        ).statusCode,
      ).toBe(400);
      expect(
        f.db.rpc.mock.calls.some(([name]) => name === "mutate_curated_content"),
      ).toBe(false);
    },
  );
});
