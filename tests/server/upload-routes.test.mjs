import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  S3Client,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { applicationHandler } from "../../server/handler.mjs";
import { uploadRoutes } from "../../server/uploads.mjs";
import { token, tokenHash } from "../../server/lib/security.mjs";
const actor = "ff000000-0000-4000-8000-000000000001",
  sid = "ff000000-0000-4000-8000-000000000002",
  formId = "ff000000-0000-4000-8000-000000000003",
  versionId = "ff000000-0000-4000-8000-000000000004",
  fieldId = "ff000000-0000-4000-8000-000000000005",
  uploadId = "ff000000-0000-4000-8000-000000000006",
  responseId = "ff000000-0000-4000-8000-000000000007",
  teamId = "ff000000-0000-4000-8000-000000000008";
beforeEach(() => {
  for (const [key, value] of Object.entries({
    UPLOADS_ENABLED: "true",
    S3_ENDPOINT: "http://127.0.0.1:54361/storage/v1/s3",
    S3_REGION: "local",
    S3_ACCESS_KEY_ID: "fictional-unit-key",
    S3_SECRET_ACCESS_KEY: "fictional-unit-secret",
  }))
    vi.stubEnv(key, value);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
function fixture() {
  const raw = token(),
    csrf = token(),
    proof = token(),
    access = token(),
    user = {
      id: actor,
      email: "fictional-upload@example.test",
      role: "team_member",
      is_active: true,
    },
    config = {
      origin: "https://chapter.example.test",
      sessionCookie: "__Host-gdg_session",
      riskSecret: "fictional-upload-risk-secret",
    };
  const field = {
    id: fieldId,
    type: "file",
    sensitive: false,
    allowedMime: ["application/pdf"],
    maxFileBytes: 1048576,
  };
  const form = {
    id: formId,
    published_version_id: versionId,
    state: "Open",
    access_mode: "public",
    team_id: null,
  };
  const intent = {
    id: uploadId,
    bucket: "form-uploads",
    quarantine_key: "quarantine/fictional-one-object",
    clean_key: null,
    state: "pending",
    expires_at: new Date(Date.now() + 60000).toISOString(),
    expected_bytes: 123,
    declared_mime: "application/pdf",
    expected_sha256: "a".repeat(64),
  };
  const rows = new Map([
      ["forms", form],
      ["form_versions", { definition: { fields: [field] } }],
      ["upload_intents", intent],
      [
        "form_uploads",
        {
          id: uploadId,
          private_object_key: "clean/fictional-one-object",
          original_filename: "Fictional document.pdf",
          field_id: fieldId,
          version_id: versionId,
          scan_state: "clean",
          byte_size: 123,
        },
      ],
      [
        "form_responses",
        {
          id: responseId,
          version_id: versionId,
          deleted_at: null,
          redacted_at: null,
        },
      ],
      ["form_access_tokens", { id: uploadId, used_count: 0, use_limit: 1 }],
    ]),
    queries = [],
    rpcResults = new Map([
      ["can_operate_form", true],
      ["create_form_upload", uploadId],
      ["queue_upload_scan", {}],
      ["remove_form_upload", {}],
    ]);
  const store = {
    validateSession: vi.fn(async () => ({ sessionId: sid, user })),
    csrf: vi.fn(async () => ({
      token_hash: tokenHash(csrf),
      expires_at: new Date(Date.now() + 60000).toISOString(),
    })),
    memberships: vi.fn(async () => [
      { team_id: teamId, is_active: true, team: { is_active: true } },
    ]),
    rateLimit: vi.fn(async () => ({ allowed: true })),
    audit: vi.fn(),
  };
  const db = {
      rpc: vi.fn(async (name) => ({
        data: rpcResults.get(name),
        error: null,
      })),
      from: vi.fn((table) => {
        const query = { table, steps: [] };
        queries.push(query);
        const chain = {};
        for (const method of [
          "select",
          "eq",
          "is",
          "gt",
          "single",
          "maybeSingle",
        ])
          chain[method] = (...args) => {
            query.steps.push([method, ...args]);
            return chain;
          };
        chain.then = (resolve, reject) =>
          Promise.resolve({ data: rows.get(table) ?? null, error: null }).then(
            resolve,
            reject,
          );
        return chain;
      }),
    },
    send = vi
      .spyOn(S3Client.prototype, "send")
      .mockImplementation(async (command) =>
        command instanceof HeadObjectCommand
          ? {
              ContentLength: 123,
              ContentType: "application/pdf; charset=binary",
              Metadata: { sha256: "a".repeat(64) },
            }
          : {},
      ),
    app = applicationHandler({ db, store, config });
  async function call(
    path = "/forms/fictional/uploads",
    body,
    method = "POST",
    headers = {},
  ) {
    const r = {
      statusCode: 200,
      headers: new Map(),
      setHeader(name, value) {
        this.headers.set(name.toLowerCase(), value);
      },
      end(value) {
        this.body = value ? JSON.parse(value) : undefined;
      },
    };
    await app(
      {
        url: "/api/v1" + path,
        method,
        body,
        headers: {
          origin: config.origin,
          cookie: config.sessionCookie + "=" + raw,
          "x-csrf-token": csrf,
          "content-type": "application/json",
          ...headers,
        },
        socket: { remoteAddress: "127.0.0.1" },
      },
      r,
    );
    return r;
  }
  const base = { versionId, uploadToken: proof },
    body = {
      ...base,
      fieldId,
      filename: "fictional.pdf",
      mime: "application/pdf",
      bytes: 123,
      sha256: "a".repeat(64),
    },
    privatePath = `/admin/forms/${formId}/responses/${responseId}/files/${uploadId}`;
  return {
    call,
    db,
    store,
    config,
    user,
    field,
    form,
    intent,
    rows,
    queries,
    rpcResults,
    send,
    base,
    body,
    proof,
    access,
    privatePath,
  };
}
describe("FORM-016 private intent, scanner state and exact response-file dispatch", () => {
  it("ignores unrelated routes and rejects foreign origins, wrong methods and invalid public inputs", async () => {
    const f = fixture();
    expect(
      await uploadRoutes(
        { url: "/api/v1/unrelated" },
        {},
        { config: f.config },
      ),
    ).toBe(false);
    expect(
      (
        await f.call(undefined, f.body, "POST", {
          origin: "https://other.example.test",
        })
      ).statusCode,
    ).toBe(403);
    expect((await f.call(undefined, undefined, "GET")).statusCode).toBe(405);
    for (const change of [
      { uploadToken: "short" },
      { versionId: "invalid" },
      { bucket: "media" },
      { sha256: "invalid" },
      { bytes: 26214401 },
      { filename: "../file.pdf" },
    ])
      expect(
        (await f.call(undefined, { ...f.body, ...change })).statusCode,
      ).toBe(400);
    expect(f.send).not.toHaveBeenCalled();
  });
  it("enforces separate bounded intent and status quotas before private storage access", async () => {
    const f = fixture();
    f.store.rateLimit.mockResolvedValue({ allowed: false, retryAfter: 90 });
    let r = await f.call(undefined, f.body);
    expect(r.statusCode).toBe(429);
    expect(r.headers.get("retry-after")).toBe("90");
    expect(f.store.rateLimit).toHaveBeenLastCalledWith(
      "uploads.intent.ip",
      expect.any(String),
      100,
      900,
    );
    r = await f.call(`/forms/fictional/uploads/${uploadId}/status`, f.base);
    expect(r.statusCode).toBe(429);
    expect(f.store.rateLimit).toHaveBeenLastCalledWith(
      "uploads.status.ip",
      expect.any(String),
      600,
      900,
    );
    expect(f.db.from).not.toHaveBeenCalled();
  });
  it("rejects unpublished/archived/missing forms or stale version IDs before allocating any object", async () => {
    const f = fixture();
    for (const change of [
      { state: "Draft" },
      { state: "Archived" },
      { published_version_id: null },
    ]) {
      f.rows.set("forms", { ...f.form, ...change });
      expect((await f.call(undefined, f.body)).statusCode).toBe(404);
    }
    f.rows.delete("forms");
    expect((await f.call(undefined, f.body)).statusCode).toBe(404);
    f.rows.set("forms", f.form);
    expect(
      (await f.call(undefined, { ...f.body, versionId: responseId }))
        .statusCode,
    ).toBe(409);
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it("requires current internal session/CSRF/team access, while current chapter administrators retain global scope", async () => {
    const f = fixture();
    f.form.access_mode = "internal";
    f.form.team_id = teamId;
    expect(
      (await f.call(undefined, f.body, "POST", { cookie: "" })).statusCode,
    ).toBe(401);
    expect(
      (await f.call(undefined, f.body, "POST", { "x-csrf-token": "" })).body
        .error.code,
    ).toBe("CSRF_INVALID");
    f.store.memberships.mockResolvedValueOnce([]);
    expect((await f.call(undefined, f.body)).body.error.code).toBe(
      "ACCESS_REQUIRED",
    );
    f.store.memberships.mockResolvedValueOnce([
      { team_id: teamId, team: { is_active: false } },
    ]);
    expect((await f.call(undefined, f.body)).statusCode).toBe(403);
    expect((await f.call(undefined, f.body)).statusCode).toBe(200);
    f.user.role = "admin";
    expect((await f.call(undefined, f.body)).statusCode).toBe(200);
    f.form.team_id = null;
    f.user.role = "team_member";
    expect((await f.call(undefined, f.body)).statusCode).toBe(200);
  });
  it("checks invitations against form/type, revocation/expiry and remaining uses", async () => {
    const f = fixture();
    f.form.access_mode = "invited";
    expect((await f.call(undefined, f.body)).body.error.code).toBe(
      "ACCESS_REQUIRED",
    );
    const body = { ...f.body, accessToken: f.access };
    f.rows.set("form_access_tokens", null);
    expect((await f.call(undefined, body)).statusCode).toBe(403);
    f.rows.set("form_access_tokens", { used_count: 1, use_limit: 1 });
    expect((await f.call(undefined, body)).statusCode).toBe(403);
    f.rows.set("form_access_tokens", {
      id: uploadId,
      used_count: 0,
      use_limit: 1,
    });
    expect((await f.call(undefined, body)).statusCode).toBe(200);
    const query = f.queries.find((q) => q.table === "form_access_tokens");
    expect(query.steps).toContainEqual([
      "eq",
      "token_hash",
      tokenHash(f.access),
    ]);
    expect(query.steps).toContainEqual(["eq", "form_id", formId]);
    expect(query.steps).toContainEqual(["eq", "token_type", "invited"]);
    expect(query.steps).toContainEqual(["is", "revoked_at", null]);
    expect(query.steps).toContainEqual([
      "gt",
      "expires_at",
      expect.any(String),
    ]);
  });
  it("creates only a server-owned quarantine key with a 120-second one-object MIME/checksum signature", async () => {
    const f = fixture(),
      r = await f.call(undefined, f.body);
    expect(r.statusCode).toBe(200);
    expect(r.body.data).toMatchObject({
      uploadId,
      expiresIn: 120,
      headers: {
        "Content-Type": "application/pdf",
        "x-amz-meta-sha256": "a".repeat(64),
      },
    });
    const args = f.db.rpc.mock.calls.find(
      ([name]) => name === "create_form_upload",
    )[1];
    expect(args).toMatchObject({
      p_form: formId,
      p_version: versionId,
      p_field: fieldId,
      p_proof: tokenHash(f.proof),
      p_document: {
        filename: "fictional.pdf",
        mime: "application/pdf",
        bytes: 123,
        sha256: "a".repeat(64),
      },
    });
    expect(args.p_document.key).toMatch(
      /^quarantine\/[a-f0-9-]{36}\/[a-f0-9-]{36}$/,
    );
    const url = new URL(r.body.data.url);
    expect(url.searchParams.get("X-Amz-Expires")).toBe("120");
    expect(decodeURIComponent(url.pathname)).toContain(args.p_document.key);
    expect(f.send).not.toHaveBeenCalled();
  });
  it("refuses disabled uploads, non-file fields, bad MIME and field-specific size limits", async () => {
    const f = fixture();
    vi.stubEnv("UPLOADS_ENABLED", "false");
    expect((await f.call(undefined, f.body)).body.error.code).toBe(
      "UPLOADS_NOT_READY",
    );
    vi.stubEnv("UPLOADS_ENABLED", "true");
    f.field.type = "short";
    expect((await f.call(undefined, f.body)).body.error.code).toBe(
      "INVALID_UPLOAD",
    );
    f.field.type = "file";
    expect(
      (await f.call(undefined, { ...f.body, bytes: 1048577 })).body.error.code,
    ).toBe("UNSAFE_FILE");
    expect(
      (
        await f.call(undefined, {
          ...f.body,
          mime: "text/plain",
          filename: "fictional.txt",
        })
      ).statusCode,
    ).toBe(400);
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it("scopes status proof to exact form/version/upload and exposes no storage path or proof hash", async () => {
    const f = fixture(),
      r = await f.call(`/forms/fictional/uploads/${uploadId}/status`, f.base);
    expect(r.body.data).toMatchObject({
      uploadId,
      state: "pending",
      scanState: "clean",
      filename: "Fictional document.pdf",
      bytes: 123,
    });
    const query = f.queries.find((q) => q.table === "upload_intents");
    for (const step of [
      ["eq", "id", uploadId],
      ["eq", "form_id", formId],
      ["eq", "version_id", versionId],
      ["eq", "proof_hash", tokenHash(f.proof)],
      ["is", "deleted_at", null],
    ])
      expect(query.steps).toContainEqual(step);
    expect(JSON.stringify(r.body)).not.toContain("quarantine");
    expect(JSON.stringify(r.body)).not.toContain(f.proof);
    expect(f.send).not.toHaveBeenCalled();
    f.intent.state = "rejected";
    expect(
      (await f.call(`/forms/fictional/uploads/${uploadId}/status`, f.base)).body
        .data.message,
    ).toContain("did not pass");
    f.rows.delete("upload_intents");
    expect(
      (await f.call(`/forms/fictional/uploads/${uploadId}/status`, f.base))
        .statusCode,
    ).toBe(404);
  });
  it("checks actual completion metadata before queueing scan and never claims the queued file is clean", async () => {
    const f = fixture(),
      path = `/forms/fictional/uploads/${uploadId}/complete`;
    const r = await f.call(path, f.base);
    expect(r.statusCode).toBe(200);
    expect(r.body.data.state).toBe("queued");
    expect(f.send.mock.calls[0][0]).toBeInstanceOf(HeadObjectCommand);
    expect(f.db.rpc).toHaveBeenLastCalledWith("queue_upload_scan", {
      p_id: uploadId,
      p_proof: tokenHash(f.proof),
    });
    f.db.rpc.mockClear();
    expect((await f.call(path, f.base)).statusCode).toBe(200);
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it("fails completion for expiry, missing object, metadata mismatch or provider failure", async () => {
    const f = fixture(),
      path = `/forms/fictional/uploads/${uploadId}/complete`;
    f.intent.expires_at = new Date(Date.now() - 60000).toISOString();
    expect((await f.call(path, f.base)).body.error.code).toBe("INVALID_UPLOAD");
    f.intent.expires_at = new Date(Date.now() + 60000).toISOString();
    f.send.mockRejectedValueOnce({ $metadata: { httpStatusCode: 404 } });
    expect((await f.call(path, f.base)).body.error.code).toBe("INVALID_UPLOAD");
    for (const value of [
      {
        ContentLength: 124,
        ContentType: "application/pdf",
        Metadata: { sha256: "a".repeat(64) },
      },
      {
        ContentLength: 123,
        ContentType: "text/plain",
        Metadata: { sha256: "a".repeat(64) },
      },
      { ContentLength: 123, Metadata: { sha256: "a".repeat(64) } },
      { ContentLength: 123, ContentType: "application/pdf" },
    ]) {
      f.send.mockResolvedValueOnce(value);
      expect((await f.call(path, f.base)).statusCode).toBe(400);
    }
    f.send.mockRejectedValueOnce(Error("fictional private provider detail"));
    const failed = await f.call(path, f.base);
    expect(failed.statusCode).toBe(500);
    expect(JSON.stringify(failed.body)).not.toContain("provider detail");
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it("refuses missing scanner-file rows and removes both assigned quarantine/promoted objects only after authorized mutation", async () => {
    const f = fixture(),
      path = `/forms/fictional/uploads/${uploadId}/status`;
    f.rows.delete("form_uploads");
    expect((await f.call(path, f.base)).statusCode).toBe(404);
    f.intent.clean_key = "clean/fictional-one-object";
    const r = await f.call(
      `/forms/fictional/uploads/${uploadId}/remove`,
      f.base,
    );
    expect(r.body.data).toEqual({ removed: true });
    expect(f.db.rpc).toHaveBeenLastCalledWith("remove_form_upload", {
      p_form: formId,
      p_id: uploadId,
      p_proof: tokenHash(f.proof),
    });
    const deletes = f.send.mock.calls.map(([command]) => command);
    expect(deletes).toHaveLength(2);
    for (const command of deletes)
      expect(command).toBeInstanceOf(DeleteObjectCommand);
    expect(deletes.map((command) => command.input.Key)).toEqual([
      "quarantine/fictional-one-object",
      "clean/fictional-one-object",
    ]);
    f.intent.clean_key = null;
    f.send.mockClear();
    await f.call(`/forms/fictional/uploads/${uploadId}/remove`, f.base);
    expect(f.send).toHaveBeenCalledTimes(1);
  });
  it("requires exact reviewer authorization and live undeleted/unredacted response/file association", async () => {
    const f = fixture();
    expect(
      (await f.call(f.privatePath, undefined, "GET", { cookie: "" }))
        .statusCode,
    ).toBe(401);
    f.rpcResults.set("can_operate_form", false);
    expect((await f.call(f.privatePath, undefined, "GET")).statusCode).toBe(
      404,
    );
    f.rpcResults.set("can_operate_form", true);
    const response = f.rows.get("form_responses");
    for (const change of [
      { deleted_at: "fictional-time" },
      { redacted_at: "fictional-time" },
    ]) {
      f.rows.set("form_responses", { ...response, ...change });
      expect((await f.call(f.privatePath, undefined, "GET")).statusCode).toBe(
        404,
      );
    }
    f.rows.delete("form_responses");
    expect((await f.call(f.privatePath, undefined, "GET")).statusCode).toBe(
      404,
    );
    f.rows.set("form_responses", response);
    f.rows.delete("form_uploads");
    expect((await f.call(f.privatePath, undefined, "GET")).statusCode).toBe(
      404,
    );
    expect(f.store.audit).not.toHaveBeenCalled();
  });
  it("opens a clean PDF in one authenticated click and refuses denied or expired access", async () => {
    const f = fixture();
    f.rows.get("form_uploads").detected_mime = "application/pdf";
    let r = await f.call(f.privatePath + "/open", undefined, "GET");
    expect(r.statusCode).toBe(302);
    const url = new URL(r.headers.get("location"));
    expect(url.searchParams.get("response-content-type")).toBe("application/pdf");
    expect(url.searchParams.get("response-content-disposition")).toMatch(/^inline/);
    expect(url.searchParams.get("X-Amz-Expires")).toBe("60");
    expect(r.headers.get("cache-control")).toContain("no-store");
    expect((await f.call(f.privatePath + "/open", undefined, "GET", { cookie: "" })).statusCode).toBe(401);
    f.rpcResults.set("can_operate_form", false);
    expect((await f.call(f.privatePath + "/open", undefined, "GET")).statusCode).toBe(404);
  });
  it("rechecks sensitive field permission against the exact immutable version before signing a private attachment download", async () => {
    const f = fixture();
    f.rows.set("form_versions", { definition: { fields: [] } });
    expect((await f.call(f.privatePath, undefined, "GET")).statusCode).toBe(
      404,
    );
    f.rows.set("form_versions", { definition: { fields: [f.field] } });
    f.field.sensitive = true;
    f.db.rpc.mockImplementation(async (name, args) => ({
      data:
        name === "can_operate_form" &&
        args.p_action === "view_sensitive_responses"
          ? false
          : true,
      error: null,
    }));
    expect((await f.call(f.privatePath, undefined, "GET")).statusCode).toBe(
      404,
    );
    f.db.rpc.mockResolvedValue({ data: true, error: null });
    const r = await f.call(f.privatePath, undefined, "GET");
    expect(r.statusCode).toBe(200);
    expect(r.body.data.expiresIn).toBe(60);
    const url = new URL(r.body.data.url);
    expect(url.searchParams.get("response-content-type")).toBe(
      "application/octet-stream",
    );
    expect(url.searchParams.get("X-Amz-Expires")).toBe("60");
    expect(f.store.audit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        actorId: actor,
        action: "forms.file_downloaded",
        targetId: responseId,
        metadata: { formId, fileId: uploadId, versionId },
      }),
    );
    expect(JSON.stringify(f.store.audit.mock.calls)).not.toContain("clean/");
    expect((await f.call(f.privatePath, undefined, "POST")).statusCode).toBe(
      405,
    );
  });
});

function preparationFixture() {
  const f = fixture();
  f.rpcResults.set("prepare_form_upload", uploadId);
  f.rpcResults.set("inspect_form_upload_preparation", {
    committed: true,
    canRetry: false,
    uploadId,
    state: "pending",
    url: "must-not-project",
    proof: "must-not-project",
  });
  return f;
}
const originalPreparation = {
  "idempotency-key": "fictional-original-upload-key",
};
describe("Original respondent upload preparation and read-only outcome", () => {
  it("freezes normalized metadata/proof/key and signs the original persisted object on replay", async () => {
    const f = preparationFixture(),
      r = await f.call(
        "/forms/fictional/uploads/prepare",
        f.body,
        "POST",
        originalPreparation,
      );
    expect(r.statusCode).toBe(200);
    expect(r.body.data).toMatchObject({
      uploadId,
      state: "pending",
      expiresIn: 120,
    });
    const args = f.db.rpc.mock.calls.find(
      ([n]) => n === "prepare_form_upload",
    )[1];
    expect(args).toMatchObject({
      p_form: formId,
      p_version: versionId,
      p_field: fieldId,
      p_proof: tokenHash(f.proof),
      p_key_hash: tokenHash(originalPreparation["idempotency-key"]),
      p_request_hash: tokenHash(JSON.stringify(f.body)),
      p_actor: null,
      p_session: null,
      p_access_hash: null,
    });
    expect(args.p_document.key).not.toBe(f.intent.quarantine_key);
    expect(r.body.data.url).toContain("quarantine/fictional-one-object");
  });
  it("inspects a minimal original outcome without signing, creating or scanning anything", async () => {
    const f = preparationFixture(),
      r = await f.call(
        "/forms/fictional/uploads/recovery",
        f.body,
        "POST",
        originalPreparation,
      );
    expect(r.statusCode).toBe(200);
    expect(r.body.data).toEqual({
      committed: true,
      canRetry: false,
      uploadId,
      state: "pending",
    });
    expect(f.db.rpc.mock.calls.map(([n]) => n)).toEqual([
      "inspect_form_upload_preparation",
    ]);
    expect(f.send).not.toHaveBeenCalled();
    expect(f.store.rateLimit.mock.calls[0].slice(0, 1)).toEqual([
      "uploads.status.ip",
    ]);
  });
  it.each(["prepare", "recovery"])(
    "requires an explicit original key and rejects invalid %s paths",
    async (operation) => {
      const f = preparationFixture();
      expect(
        (await f.call("/forms/fictional/uploads/" + operation, f.body))
          .statusCode,
      ).toBe(400);
      expect(
        (
          await f.call(
            "/forms/fictional/uploads/" + operation + "/status",
            f.body,
            "POST",
            originalPreparation,
          )
        ).statusCode,
      ).toBe(404);
      expect(
        (
          await f.call(
            "/forms/fictional/uploads/" + uploadId,
            f.body,
            "POST",
            originalPreparation,
          )
        ).statusCode,
      ).toBe(404);
      expect(f.db.rpc).not.toHaveBeenCalled();
    },
  );
  it.each(["queued", "clean"])(
    "does not issue a new upload URL for an already %s intent",
    async (state) => {
      const f = preparationFixture();
      f.intent.state = state;
      const r = await f.call(
        "/forms/fictional/uploads/prepare",
        f.body,
        "POST",
        originalPreparation,
      );
      expect(r.statusCode).toBe(200);
      expect(r.body.data).toEqual({ uploadId, state });
      expect(f.send).not.toHaveBeenCalled();
    },
  );
  it.each(["missing", "deleted", "expired", "rejected", "pending-expired"])(
    "refuses unavailable %s original preparation instead of allocating again",
    async (condition) => {
      const f = preparationFixture();
      if (condition === "missing") f.rows.delete("upload_intents");
      else if (condition === "deleted")
        f.intent.deleted_at = new Date().toISOString();
      else if (condition === "pending-expired")
        f.intent.expires_at = new Date(Date.now() - 1000).toISOString();
      else f.intent.state = condition;
      const r = await f.call(
        "/forms/fictional/uploads/prepare",
        f.body,
        "POST",
        originalPreparation,
      );
      expect(r.statusCode).toBe(400);
      expect(r.body.error.code).toBe("INVALID_UPLOAD");
      expect(
        f.db.rpc.mock.calls.filter(([n]) => n === "prepare_form_upload"),
      ).toHaveLength(1);
    },
  );
  it.each(["prepare", "recovery"])(
    "checks current internal session/CSRF/team before %s and binds trusted identity",
    async (operation) => {
      const f = preparationFixture();
      f.form.access_mode = "internal";
      const r = await f.call(
        "/forms/fictional/uploads/" + operation,
        f.body,
        "POST",
        originalPreparation,
      );
      expect(r.statusCode).toBe(200);
      expect(f.db.rpc.mock.calls[0][1]).toMatchObject({
        p_actor: actor,
        p_session: sid,
        p_access_hash: null,
      });
      f.form.team_id = teamId;
      f.store.memberships.mockResolvedValue([]);
      const denied = await f.call(
        "/forms/fictional/uploads/" + operation,
        f.body,
        "POST",
        originalPreparation,
      );
      expect(denied.statusCode).toBe(403);
    },
  );
  it.each(["prepare", "recovery"])(
    "checks current private access before %s and binds its hash only",
    async (operation) => {
      const f = preparationFixture();
      f.form.access_mode = "invited";
      expect(
        (
          await f.call(
            "/forms/fictional/uploads/" + operation,
            f.body,
            "POST",
            originalPreparation,
          )
        ).statusCode,
      ).toBe(403);
      const body = { ...f.body, accessToken: f.access };
      const r = await f.call(
        "/forms/fictional/uploads/" + operation,
        body,
        "POST",
        originalPreparation,
      );
      expect(r.statusCode).toBe(200);
      expect(f.db.rpc.mock.calls[0][1]).toMatchObject({
        p_access_hash: tokenHash(f.access),
        p_request_hash: tokenHash(
          JSON.stringify({
            ...f.base,
            accessToken: f.access,
            fieldId,
            filename: "fictional.pdf",
            mime: "application/pdf",
            bytes: 123,
            sha256: "a".repeat(64),
          }),
        ),
      });
      expect(JSON.stringify(f.db.rpc.mock.calls[0])).not.toContain(f.access);
    },
  );
});
