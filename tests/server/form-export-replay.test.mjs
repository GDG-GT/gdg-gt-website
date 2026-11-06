import { describe, it, expect, vi, afterEach } from "vitest";
import { fixture, ids } from "./form-routes-fixture.mjs";
import { tokenHash } from "../../server/lib/security.mjs";
const base = `/admin/forms/${ids.form}/exports`;
const job = {
  id: ids.response,
  form_id: ids.form,
  requester_id: ids.actor,
  session_id: ids.session,
  format: "csv",
  state: "pending",
  response_count: 3,
  include_sensitive: false,
  byte_size: null,
  error_code: null,
  created_at: "2026-11-06T12:00:00Z",
  expires_at: "2099-11-07T12:00:00Z",
  filters: { q: "Fictional private filter" },
  private_object_key: "private/fictional-export",
  request_hash: "fictional-private-request",
};
function setup() {
  const f = fixture();
  f.results.set("mutate_form_export_write", job);
  f.results.set("inspect_form_export_write", {
    committed: false,
    canRetry: true,
    job: null,
  });
  f.single.set("form_export_jobs", job);
  f.lists.set("form_export_jobs", [job]);
  return f;
}
afterEach(() => vi.unstubAllEnvs());
describe("Current-session private export write recovery routes", () => {
  for (const action of ["create", "cancel"]) {
    const path = action === "create" ? base : base + "/" + ids.response,
      method = action === "create" ? "POST" : "DELETE",
      body = action === "create" ? { format: "csv" } : undefined;
    it(`requires explicit ${action} intent before its transaction`, async () => {
      const f = setup();
      expect(
        (await f.call(path, method, body, { "idempotency-key": "" }))
          .statusCode,
      ).toBe(400);
      expect(
        f.db.rpc.mock.calls.some(
          ([name]) => name === "mutate_form_export_write",
        ),
      ).toBe(false);
    });
    it(`binds ${action} to the current session, target and original normalized body`, async () => {
      const f = setup();
      expect((await f.call(path, method, body)).statusCode).toBe(200);
      const normalized =
        action === "create"
          ? { format: "csv", filters: {}, sensitive: false }
          : {};
      expect(f.db.rpc).toHaveBeenCalledWith(
        "mutate_form_export_write",
        expect.objectContaining({
          p_actor: ids.actor,
          p_session: ids.session,
          p_form: ids.form,
          p_action: action,
          p_job: action === "create" ? null : ids.response,
          p_key_hash: tokenHash(f.key),
          p_document: normalized,
          p_document_hash:
            action === "create" ? tokenHash(JSON.stringify(normalized)) : null,
          p_request_hash: tokenHash(
            JSON.stringify({
              formId: ids.form,
              action,
              jobId: action === "create" ? null : ids.response,
              body: normalized,
            }),
          ),
        }),
      );
      expect(
        f.db.rpc.mock.calls.some(([name]) =>
          ["create_form_export", "cancel_form_export"].includes(name),
        ),
      ).toBe(false);
    });
    it(`projects ${action} results without exposing storage, filters or session material`, async () => {
      const f = setup(),
        result = await f.call(path, method, body);
      expect(result.body.data.job.id).toBe(job.id);
      expect(JSON.stringify(result.body.data)).not.toMatch(
        /Fictional private|private\/|session_id|request_hash|private_object_key/,
      );
      expect(f.queries).toHaveLength(0);
    });
  }
  it("inspects an unaccepted creation without a business write or phantom job", async () => {
    const f = setup(),
      result = await f.call(base + "/recovery?action=create");
    expect(result.statusCode).toBe(200);
    expect(result.body.data).toEqual({
      committed: false,
      canRetry: true,
      job: null,
    });
    expect(f.db.rpc).toHaveBeenCalledWith("inspect_form_export_write", {
      p_actor: ids.actor,
      p_session: ids.session,
      p_form: ids.form,
      p_action: "create",
      p_job: null,
      p_sensitive: false,
      p_key_hash: tokenHash(f.key),
      p_request_hash: null,
    });
    expect(f.queries).toHaveLength(0);
  });
  it("projects an accepted cancellation receipt and its current job without private fields", async () => {
    const f = setup();
    f.results.set("inspect_form_export_write", {
      committed: true,
      canRetry: false,
      receipt: {
        id: job.id,
        formId: ids.form,
        sourceId: job.id,
        action: "cancel",
        filters: "fictional-private",
      },
      job: { ...job, state: "cancelled" },
    });
    const r = await f.call(base + "/recovery?action=cancel&job=" + job.id);
    expect(r.statusCode).toBe(200);
    expect(r.body.data.job.state).toBe("cancelled");
    expect(Object.keys(r.body.data.receipt)).toEqual([
      "id",
      "formId",
      "sourceId",
      "action",
    ]);
    expect(JSON.stringify(r.body.data)).not.toMatch(
      /fictional-private|private\/|session_id|request_hash/,
    );
    expect(
      f.db.rpc.mock.calls.some(([name]) => name === "mutate_form_export_write"),
    ).toBe(false);
  });
  for (const query of [
    "",
    "?action=unknown",
    "?action=create&job=" + ids.response,
    "?action=cancel",
    "?action=cancel&job=" + ids.response + "&sensitive=true",
    "?action=create&owner=" + ids.actor,
    "?action=create&action=cancel",
  ]) {
    it(`rejects malformed recovery controls ${query}`, async () => {
      const f = setup();
      expect((await f.call(base + "/recovery" + query)).statusCode).toBe(400);
      expect(
        f.db.rpc.mock.calls.some(
          ([name]) => name === "inspect_form_export_write",
        ),
      ).toBe(false);
    });
  }
  it("rejects missing recovery intent and mutating recovery methods", async () => {
    const f = setup();
    expect(
      (
        await f.call(base + "/recovery?action=create", "GET", undefined, {
          "idempotency-key": "",
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await f.call(base + "/recovery?action=create", "POST", {})).statusCode,
    ).toBe(405);
  });
  it("rechecks sensitive export rights for both creation and read-only inspection", async () => {
    const f = setup();
    f.results.set(
      "can_operate_form",
      (args) => args.p_action !== "view_sensitive_responses",
    );
    expect(
      (await f.call(base, "POST", { format: "json", sensitive: true }))
        .statusCode,
    ).toBe(403);
    expect(
      (await f.call(base + "/recovery?action=create&sensitive=true"))
        .statusCode,
    ).toBe(403);
    expect(
      f.db.rpc.mock.calls.some(([name]) =>
        ["mutate_form_export_write", "inspect_form_export_write"].includes(
          name,
        ),
      ),
    ).toBe(false);
  });
  it("denies export access before inspecting a request key", async () => {
    const f = setup();
    f.results.set("can_operate_form", false);
    expect((await f.call(base + "/recovery?action=create")).statusCode).toBe(
      404,
    );
    expect(f.db.rpc).toHaveBeenCalledTimes(1);
  });
  it("filters sensitive job inventory when the current session loses that capability", async () => {
    const f = setup();
    f.results.set(
      "can_operate_form",
      (args) => args.p_action !== "view_sensitive_responses",
    );
    expect((await f.call(base)).statusCode).toBe(200);
    expect(f.queries[0].steps).toContainEqual([
      "eq",
      "include_sensitive",
      false,
    ]);
  });
  it("reads one owned-session job and conceals a missing target", async () => {
    const f = setup();
    expect((await f.call(base + "/" + job.id)).body.data.job.id).toBe(job.id);
    expect(f.queries[0].steps).toContainEqual([
      "eq",
      "session_id",
      ids.session,
    ]);
    f.single.set("form_export_jobs", null);
    expect((await f.call(base + "/" + job.id)).statusCode).toBe(404);
  });
  it("rejects reversed export filters before the atomic writer", async () => {
    const f = setup();
    expect(
      (
        await f.call(base, "POST", {
          format: "json",
          filters: { from: "2026-11-07T00:00:00Z", to: "2026-11-06T00:00:00Z" },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      f.db.rpc.mock.calls.some(([name]) => name === "mutate_form_export_write"),
    ).toBe(false);
  });
  it("rejects recovery download substitution before reading a receipt", async () => {
    const f = setup();
    expect(
      (await f.call(base + "/recovery/download?action=create")).statusCode,
    ).toBe(400);
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it("authorizes a download through the current snapshot RPC and closes its signer without returning internal metadata", async () => {
    for (const [name, value] of Object.entries({
      NODE_ENV: "test",
      S3_ENDPOINT: "https://storage.example.test",
      S3_REGION: "fictional-region",
      S3_ACCESS_KEY_ID: "fictional-export-access",
      S3_SECRET_ACCESS_KEY: "fictional-export-secret",
    }))
      vi.stubEnv(name, value);
    const f = setup();
    f.results.set("form_export_download", {
      key: "exports/fictional.csv",
      filename: "fictional-export.csv",
    });
    const r = await f.call(base + "/" + job.id + "/download", "POST", {});
    expect(r.statusCode).toBe(200);
    expect(r.body.data.expiresIn).toBe(60);
    const url = new URL(r.body.data.url);
    expect(url.searchParams.get("X-Amz-Expires")).toBe("60");
    expect(url.searchParams.get("response-content-type")).toBe(
      "application/octet-stream",
    );
    expect(f.db.rpc).toHaveBeenCalledWith(
      "form_export_download",
      expect.objectContaining({
        p_actor: ids.actor,
        p_session: ids.session,
        p_form: ids.form,
        p_job: job.id,
      }),
    );
    expect(Object.keys(r.body.data)).toEqual(["url", "expiresIn"]);
  });
  it("rejects a malformed download body before snapshot authorization", async () => {
    const f = setup();
    expect(
      (
        await f.call(base + "/" + job.id + "/download", "POST", {
          objectKey: "forged",
        })
      ).statusCode,
    ).toBe(400);
    expect(
      f.db.rpc.mock.calls.some(([name]) => name === "form_export_download"),
    ).toBe(false);
  });
  it("rejects GET job downloads and unsupported export inventory writes", async () => {
    const f = setup();
    expect(
      (await f.call(base + "/" + job.id + "/download", "GET")).statusCode,
    ).toBe(405);
    expect((await f.call(base, "DELETE")).statusCode).toBe(405);
  });
  it("preserves current-session inventory projection and rejects ordinary URL query forgery", async () => {
    const f = setup();
    const r = await f.call(base);
    expect(r.statusCode).toBe(200);
    expect(r.body.data.items).toHaveLength(1);
    const q = f.queries.find((entry) => entry.table === "form_export_jobs");
    expect(q.steps).toContainEqual(["eq", "requester_id", ids.actor]);
    expect(q.steps).toContainEqual(["eq", "session_id", ids.session]);
    expect((await f.call(base + "?filters=private")).statusCode).toBe(400);
  });
});
