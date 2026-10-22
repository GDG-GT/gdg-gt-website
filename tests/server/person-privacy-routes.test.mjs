import { describe, it, expect, vi } from "vitest";
import { applicationHandler } from "../../server/handler.mjs";
import { personPrivacyRoutes } from "../../server/person-privacy.mjs";
import {
  token,
  tokenHash,
  riskHash,
  hashSecret,
} from "../../server/lib/security.mjs";
import {
  encryptPayload,
  decryptPayload,
} from "../../server/lib/encryption.mjs";
const actor = "fc000000-0000-4000-8000-000000000001",
  sid = "fc000000-0000-4000-8000-000000000002",
  reviewId = "fc000000-0000-4000-8000-000000000003",
  form = "fc000000-0000-4000-8000-000000000004";
const password = "Fictional-privacy-unit-password!2026",
  hash = await hashSecret(password),
  secret = "fictional-privacy-encryption-secret-".repeat(2);
function fixture() {
  const raw = token(),
    csrf = token(),
    reviewToken = token(),
    user = {
      id: actor,
      email: "fictional-reviewer@example.test",
      role: "super_admin",
      is_active: true,
    };
  const config = {
      origin: "https://chapter.example.test",
      sessionCookie: "__Host-gdg_session",
      riskSecret: "fictional-risk-hmac-unit-secret",
      encryptionSecret: secret,
    },
    store = {
      validateSession: vi.fn(async () => ({ sessionId: sid, user })),
      csrf: vi.fn(async () => ({
        token_hash: tokenHash(csrf),
        expires_at: new Date(Date.now() + 60000).toISOString(),
      })),
      rateLimit: vi.fn(async () => ({ allowed: true })),
      accountByEmail: vi.fn(async () => ({ password_hash: hash })),
    },
    queries = [],
    returns = new Map([
      ["person_privacy_form_keys", [form]],
      ["read_person_privacy_requests", []],
      ["review_person_privacy", { reviewId, count: 2 }],
      ["commit_person_privacy", { action: "export", records: [] }],
    ]);
  let review = {
    email_encrypted: encryptPayload(
      { email: "fictional-subject@example.test" },
      secret,
    ),
  };
  const db = {
      rpc: vi.fn(async (name) =>
        returns.get(name)?.error
          ? { data: null, error: returns.get(name).error }
          : { data: returns.get(name), error: null },
      ),
      from: vi.fn((table) => {
        const query = { table, steps: [] };
        queries.push(query);
        const chain = {};
        for (const method of ["select", "eq", "maybeSingle"])
          chain[method] = (...args) => {
            query.steps.push([method, ...args]);
            return chain;
          };
        chain.then = (resolve, reject) =>
          Promise.resolve({ data: review, error: null }).then(resolve, reject);
        return chain;
      }),
    },
    app = applicationHandler({ store, config, db });
  async function call(
    path = "/admin/privacy",
    method = "GET",
    body,
    headers = {},
  ) {
    const r = {
      statusCode: 200,
      headers: new Map(),
      setHeader(name, value) {
        this.headers.set(name.toLowerCase(), value);
      },
      end(value) {
        this.body = JSON.parse(value);
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
          "idempotency-key": "fictional-privacy-idempotency",
          "content-type": "application/json",
          ...headers,
        },
      },
      r,
    );
    return r;
  }
  const reviewBody = {
    currentPassword: password,
    email: " Fictional-Subject@Example.test ",
    action: "export",
    purpose: "Fictional independently verified privacy request.",
    identityVerified: true,
  };
  const commitBody = {
    currentPassword: password,
    reviewId,
    reviewToken,
    confirmation: "EXPORT 2 RECORDS",
  };
  return {
    call,
    db,
    store,
    user,
    config,
    queries,
    returns,
    reviewBody,
    commitBody,
    setReview: (value) => {
      review = value;
    },
  };
}
describe("SEC exact session-bound person privacy dispatch", () => {
  it("rejects unrelated paths, anonymous/ordinary roles, foreign origin and unsupported methods before private lookup", async () => {
    const f = fixture();
    expect(
      await personPrivacyRoutes(
        { url: "/api/v1/unrelated" },
        {},
        { config: f.config },
      ),
    ).toBe(false);
    expect(
      (await f.call("/admin/privacy", "GET", undefined, { cookie: "" }))
        .statusCode,
    ).toBe(401);
    expect(
      (
        await f.call("/admin/privacy", "GET", undefined, {
          origin: "https://other.example.test",
        })
      ).statusCode,
    ).toBe(403);
    for (const role of ["admin", "team_member", "blog_editor"]) {
      f.user.role = role;
      expect((await f.call()).statusCode).toBe(403);
    }
    expect((await f.call("/admin/privacy", "DELETE")).statusCode).toBe(405);
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it("loads only current reviewer/session request status and validates exact status route shape", async () => {
    const f = fixture();
    f.returns.set("read_person_privacy_requests", [
      { id: reviewId, state: "reviewed" },
    ]);
    expect((await f.call()).body.data.items).toHaveLength(1);
    expect(f.db.rpc).toHaveBeenLastCalledWith("read_person_privacy_requests", {
      p_actor: actor,
      p_session: sid,
      p_review: null,
    });
    expect((await f.call("/admin/privacy/status/" + reviewId)).statusCode).toBe(
      200,
    );
    expect(f.db.rpc).toHaveBeenLastCalledWith("read_person_privacy_requests", {
      p_actor: actor,
      p_session: sid,
      p_review: reviewId,
    });
    expect((await f.call("/admin/privacy/status")).statusCode).toBe(404);
    expect((await f.call("/admin/privacy/status/not-an-id")).statusCode).toBe(
      400,
    );
    expect(
      (await f.call("/admin/privacy/review/" + reviewId, "POST", f.reviewBody))
        .statusCode,
    ).toBe(404);
    expect(
      (await f.call("/admin/privacy?email=private@example.test")).statusCode,
    ).toBe(400);
  });
  it("requires CSRF, operation quota and current password before matching any subject records", async () => {
    const f = fixture();
    expect(
      (
        await f.call("/admin/privacy/review", "POST", f.reviewBody, {
          "x-csrf-token": "",
        })
      ).body.error.code,
    ).toBe("CSRF_INVALID");
    f.store.rateLimit.mockResolvedValueOnce({ allowed: false, retryAfter: 60 });
    const limited = await f.call("/admin/privacy/review", "POST", f.reviewBody);
    expect(limited.statusCode).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    expect(f.store.accountByEmail).not.toHaveBeenCalled();
    expect(
      (
        await f.call("/admin/privacy/review", "POST", {
          ...f.reviewBody,
          currentPassword: "wrong fictional password",
        })
      ).body.error.code,
    ).toBe("PASSWORD_REQUIRED");
    f.store.accountByEmail.mockResolvedValueOnce(null);
    expect(
      (await f.call("/admin/privacy/review", "POST", f.reviewBody)).statusCode,
    ).toBe(403);
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it("derives actor/session/current-hash, exact scoped identity HMACs and encrypted review recipient server-side", async () => {
    const f = fixture(),
      r = await f.call("/admin/privacy/review", "POST", f.reviewBody);
    expect(r.statusCode).toBe(200);
    expect(r.body.data.reviewId).toBe(reviewId);
    const [name, args] = f.db.rpc.mock.calls.at(-1);
    expect(name).toBe("review_person_privacy");
    expect(args).toMatchObject({
      p_actor: actor,
      p_session: sid,
      p_password: hash,
      p_email: "fictional-subject@example.test",
      p_action: "export",
      p_ids: [],
      p_sensitive: false,
    });
    expect(args.p_token_hash).toBe(tokenHash(r.body.data.reviewToken));
    expect(args.p_hashes).toEqual([
      {
        formId: form,
        emailHash: riskHash(
          "form-recipient:" + form + ":fictional-subject@example.test",
          f.config.riskSecret,
        ),
      },
    ]);
    expect(decryptPayload(args.p_encrypted_email, secret)).toEqual({
      email: "fictional-subject@example.test",
    });
    expect(args.p_subject_hash).toBe(
      riskHash(
        "privacy-subject:fictional-subject@example.test",
        f.config.riskSecret,
      ),
    );
    expect(JSON.stringify(r.body)).not.toContain(
      "fictional-subject@example.test",
    );
    expect(f.store.rateLimit).toHaveBeenCalledWith(
      "person.privacy.review",
      expect.any(String),
      10,
      900,
    );
  });
  it("refuses forged source selection, missing identity attestation and unreviewed sensitive erasure", async () => {
    const f = fixture();
    for (const change of [
      { identityVerified: false },
      { actorId: actor },
      { recordIds: [form] },
      { includeFinance: true },
      { action: "delete", includeSensitive: true },
    ])
      expect(
        (
          await f.call("/admin/privacy/review", "POST", {
            ...f.reviewBody,
            ...change,
          })
        ).statusCode,
      ).toBe(400);
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it("exchanges only the current actor/session/review-token bound record and hashes idempotent commit input", async () => {
    const f = fixture(),
      r = await f.call("/admin/privacy/commit", "POST", f.commitBody);
    expect(r.statusCode).toBe(200);
    expect(f.queries[0]).toEqual({
      table: "person_privacy_reviews",
      steps: [
        ["select", "email_encrypted"],
        ["eq", "id", reviewId],
        ["eq", "actor_id", actor],
        ["eq", "session_id", sid],
        ["eq", "token_hash", tokenHash(f.commitBody.reviewToken)],
        ["maybeSingle"],
      ],
    });
    expect(f.db.rpc).toHaveBeenLastCalledWith(
      "commit_person_privacy",
      expect.objectContaining({
        p_actor: actor,
        p_session: sid,
        p_password: hash,
        p_review: reviewId,
        p_token_hash: tokenHash(f.commitBody.reviewToken),
        p_email: "fictional-subject@example.test",
        p_confirmation: "EXPORT 2 RECORDS",
        p_key_hash: tokenHash("fictional-privacy-idempotency"),
        p_request_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
    expect(f.store.rateLimit).toHaveBeenCalledWith(
      "person.privacy.commit",
      expect.any(String),
      20,
      900,
    );
  });
  it("cannot select a different email/scope or commit without a saved current review and idempotency key", async () => {
    const f = fixture();
    expect(
      (
        await f.call("/admin/privacy/commit", "POST", {
          ...f.commitBody,
          email: "replacement@example.test",
        })
      ).statusCode,
    ).toBe(400);
    f.setReview(null);
    expect(
      (await f.call("/admin/privacy/commit", "POST", f.commitBody)).body.error
        .code,
    ).toBe("PRIVACY_REVIEW_REQUIRED");
    expect(f.db.rpc).not.toHaveBeenCalled();
    f.setReview({ email_encrypted: null });
    expect(
      (
        await f.call("/admin/privacy/commit", "POST", f.commitBody, {
          "idempotency-key": "",
        })
      ).statusCode,
    ).toBe(400);
    expect(f.db.rpc).not.toHaveBeenCalled();
    expect(
      (await f.call("/admin/privacy/commit", "POST", f.commitBody)).statusCode,
    ).toBe(200);
    expect(f.db.rpc.mock.calls.at(-1)[1].p_email).toBeNull();
  });
  it("refuses expired artifacts, changed records, oversized exports or corrupted encrypted review state", async () => {
    const f = fixture();
    f.returns.set("commit_person_privacy", { downloadExpired: true });
    expect(
      (await f.call("/admin/privacy/commit", "POST", f.commitBody)).body.error
        .code,
    ).toBe("PRIVACY_REVIEW_REQUIRED");
    f.returns.set("commit_person_privacy", {
      payload: "x".repeat(4 * 1024 * 1024),
    });
    expect(
      (await f.call("/admin/privacy/commit", "POST", f.commitBody)).body.error
        .code,
    ).toBe("PRIVACY_EXPORT_LIMIT");
    f.returns.set("commit_person_privacy", {
      error: { code: "P0001", message: "PRIVACY_REVIEW_CHANGED" },
    });
    expect(
      (await f.call("/admin/privacy/commit", "POST", f.commitBody)).body.error
        .code,
    ).toBe("PRIVACY_REVIEW_CHANGED");
    f.setReview({ email_encrypted: "v0.invalid" });
    expect(
      (await f.call("/admin/privacy/commit", "POST", f.commitBody)).statusCode,
    ).toBe(503);
  });
});
