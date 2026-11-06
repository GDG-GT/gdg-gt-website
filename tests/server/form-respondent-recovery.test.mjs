import { describe, it, expect, afterEach, vi } from "vitest";
import { fixture, ids, address } from "./form-routes-fixture.mjs";
import { token, tokenHash } from "../../server/lib/security.mjs";
import { encryptPayload } from "../../server/lib/encryption.mjs";
const root = "/forms/fictional-route-fixture";
afterEach(() => vi.unstubAllEnvs());
const submissionBody = (f, accessToken) => ({
  versionId: ids.version,
  answers: f.answers,
  respondent: f.submission.respondent,
  copyRequested: false,
  ...(accessToken ? { accessToken } : {}),
  website: "",
});
function accepted(f, body) {
  const edit = token();
  f.single.set("form_responses", {
    id: ids.response,
    submitted_at: "2026-11-06T12:00:00Z",
    request_hash: tokenHash(JSON.stringify(body)),
    access_token_id: body.accessToken ? ids.access : null,
    edit_secret_encrypted: encryptPayload(
      { token: edit },
      f.config.encryptionSecret,
    ),
  });
  return edit;
}
const draftBody = (f) => ({
  versionId: ids.version,
  answers: f.answers,
  respondent: f.submission.respondent,
  copyRequested: false,
  resumeToken: token(),
  uploadToken: token(),
  draftRevision: 0,
});
const draftReceipt = {
  revision: 2,
  expiresAt: "2026-11-13T12:00:00Z",
  createdAt: "2026-11-06T12:00:00Z",
};
describe("Respondent original-request read-only reconciliation and versioned draft contracts", () => {
  it("reconciles an accepted submission read-only with only its own original receipt", async () => {
    const f = fixture(),
      body = submissionBody(f),
      edit = accepted(f, body);
    f.single.set("form_respondent_copies", { id: ids.peer });
    const r = await f.call(root + "/submissions/recovery", "POST", body);
    expect(r.statusCode).toBe(200);
    expect(r.body.data).toEqual({
      committed: true,
      canRetry: false,
      receipt: {
        responseId: ids.response,
        submittedAt: "2026-11-06T12:00:00Z",
        copyQueued: true,
        editToken: edit,
      },
    });
    expect(f.db.rpc).not.toHaveBeenCalled();
    expect(f.queries.some((q) => q.table === "form_versions")).toBe(false);
    expect(f.store.rateLimit.mock.calls.map(([name]) => name)).toEqual([
      "forms.read",
    ]);
  });
  it.each(["public", "internal"])(
    "checks current %s availability before accepted submission recovery",
    async (mode) => {
      const f = fixture(),
        body = submissionBody(f);
      accepted(f, body);
      f.row.access_mode = mode;
      f.row.state = "Archived";
      expect(
        (await f.call(root + "/submissions/recovery", "POST", body)).statusCode,
      ).toBe(404);
      expect(f.db.rpc).not.toHaveBeenCalled();
    },
  );
  it("requires the current internal session and CSRF before accepted receipt or edit-capability disclosure", async () => {
    const f = fixture(),
      body = submissionBody(f);
    accepted(f, body);
    f.row.access_mode = "internal";
    expect(
      (
        await f.call(root + "/submissions/recovery", "POST", body, {
          cookie: "",
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await f.call(root + "/submissions/recovery", "POST", body, {
          "x-csrf-token": "bad",
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (await f.call(root + "/submissions/recovery", "POST", body)).statusCode,
    ).toBe(200);
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it("denies a current internal member who lost the form's team membership even with an exact accepted body/key", async () => {
    const f = fixture(),
      body = submissionBody(f);
    accepted(f, body);
    f.row.access_mode = "internal";
    f.row.team_id = ids.team;
    f.store.validateSession.mockResolvedValue({
      sessionId: ids.session,
      user: {
        id: ids.actor,
        email: address,
        role: "team_member",
        is_active: true,
      },
    });
    f.store.memberships.mockResolvedValue([]);
    expect(
      (await f.call(root + "/submissions/recovery", "POST", body)).statusCode,
    ).toBe(403);
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it.each(["invited", "unlisted", "verified"])(
    "allows only the same current %s capability to reconcile its already consumed submission",
    async (mode) => {
      const f = fixture(),
        accessToken = token(),
        body = submissionBody(f, accessToken);
      accepted(f, body);
      f.row.access_mode = mode;
      f.single.set("form_access_tokens", {
        id: ids.access,
        used_count: 1,
        use_limit: 1,
      });
      expect(
        (await f.call(root + "/submissions/recovery", "POST", body)).statusCode,
      ).toBe(200);
      const query = f.queries.find((q) => q.table === "form_access_tokens");
      expect(query.steps).toEqual(
        expect.arrayContaining([
          ["eq", "id", ids.access],
          ["eq", "token_hash", tokenHash(accessToken)],
          ["eq", "form_id", ids.form],
          ["is", "revoked_at", null],
        ]),
      );
      expect(
        query.steps.some(
          ([name, column]) => name === "lt" && column === "used_count",
        ),
      ).toBe(false);
      f.single.set("form_access_tokens", null);
      expect(
        (await f.call(root + "/submissions/recovery", "POST", body)).statusCode,
      ).toBe(403);
      expect(f.db.rpc).not.toHaveBeenCalled();
    },
  );
  it("refuses missing current private capability on an exact formerly public receipt", async () => {
    const f = fixture(),
      body = submissionBody(f);
    accepted(f, body);
    f.row.access_mode = "invited";
    expect(
      (await f.call(root + "/submissions/recovery", "POST", body)).statusCode,
    ).toBe(403);
  });
  it.each(["current", "version", "opens", "closes", "closed"])(
    "reports unaccepted submission current metadata without inserting on %s inspection",
    async (condition) => {
      const f = fixture(),
        body = submissionBody(f);
      if (condition === "version") body.versionId = ids.peer;
      if (condition === "opens") f.row.opens_at = "2199-01-01T00:00:00Z";
      if (condition === "closes") f.row.closes_at = "2000-01-01T00:00:00Z";
      if (condition === "closed") f.row.state = "Closed";
      const r = await f.call(root + "/submissions/recovery", "POST", body);
      expect(r.statusCode).toBe(200);
      expect(r.body.data).toEqual({
        committed: false,
        canRetry: condition === "current",
        receipt: null,
      });
      expect(f.db.rpc).not.toHaveBeenCalled();
    },
  );
  it("rejects unsupported read/recovery route combinations, changed original bodies and missing original keys", async () => {
    const f = fixture(),
      body = submissionBody(f);
    accepted(f, body);
    for (const suffix of [
      "submissions/load",
      "preview/recovery",
      "preview/load",
    ])
      expect((await f.call(root + "/" + suffix, "POST", body)).statusCode).toBe(
        404,
      );
    expect(
      (
        await f.call(root + "/submissions/recovery", "POST", body, {
          "idempotency-key": "",
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await f.call(root + "/submissions/recovery", "POST", {
          ...body,
          answers: {},
        })
      ).statusCode,
    ).toBe(409);
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it("binds a versioned save and read-only inspection to the exact normalized body, fixed token and trusted current session", async () => {
    const f = fixture(),
      body = draftBody(f);
    f.row.access_mode = "internal";
    f.results.set("save_versioned_identified_form_draft", draftReceipt);
    f.results.set("inspect_identified_form_draft", {
      committed: true,
      canRetry: false,
      currentRevision: 4,
      receipt: {
        ...draftReceipt,
        answers: "must not project",
        resumeToken: "must not project",
      },
    });
    const saved = await f.call(root + "/drafts", "POST", body);
    expect(saved.statusCode).toBe(200);
    expect(saved.body.data).toMatchObject({
      resumeToken: body.resumeToken,
      revision: 2,
      expiresAt: draftReceipt.expiresAt,
    });
    const written = f.db.rpc.mock.calls.find(
      ([name]) => name === "save_versioned_identified_form_draft",
    )[1];
    expect(written).toMatchObject({
      p_session: ids.session,
      p_document: {
        actor: ids.actor,
        form: ids.form,
        version: ids.version,
        revision: 0,
        hash: tokenHash(body.resumeToken),
        uploadHash: tokenHash(body.uploadToken),
        respondent: body.respondent,
      },
    });
    f.db.rpc.mockClear();
    const inspected = await f.call(root + "/drafts/recovery", "POST", body);
    expect(inspected.statusCode).toBe(200);
    expect(inspected.body.data).toEqual({
      committed: true,
      canRetry: false,
      currentRevision: 4,
      receipt: draftReceipt,
    });
    expect(f.db.rpc.mock.calls).toEqual([
      ["inspect_identified_form_draft", written],
    ]);
  });
  it.each(["token", "revision"])(
    "requires original draft %s before a versioned save or outcome inspection",
    async (missing) => {
      const f = fixture(),
        body = draftBody(f);
      delete body[missing === "token" ? "resumeToken" : "draftRevision"];
      expect(
        (await f.call(root + "/drafts/recovery", "POST", body)).statusCode,
      ).toBe(400);
      if (missing === "token")
        expect((await f.call(root + "/drafts", "POST", body)).statusCode).toBe(
          400,
        );
      expect(f.db.rpc).not.toHaveBeenCalled();
    },
  );
  it("refuses stale/invalid versioned draft mutations without bypassing validation, while inspecting minimal committed history", async () => {
    const f = fixture(),
      body = draftBody(f);
    f.results.set("inspect_identified_form_draft", {
      committed: true,
      canRetry: false,
      currentRevision: 2,
      receipt: draftReceipt,
    });
    expect(
      (await f.call(root + "/drafts", "POST", { ...body, versionId: ids.peer }))
        .statusCode,
    ).toBe(409);
    expect(
      (
        await f.call(root + "/drafts", "POST", {
          ...body,
          answers: { [ids.peer]: "unknown" },
        })
      ).statusCode,
    ).toBe(400);
    expect(f.db.rpc).not.toHaveBeenCalled();
    const r = await f.call(root + "/drafts/recovery", "POST", {
      ...body,
      versionId: ids.peer,
    });
    expect(r.statusCode).toBe(200);
    expect(r.body.data.receipt).toEqual(draftReceipt);
  });
  it.each(["accepted", "unaccepted", "stale", "expired", "changed"])(
    "inspects %s response edits without recording another revision or copy",
    async (condition) => {
      const f = fixture(),
        editToken = token(),
        body = {
          editToken,
          versionId: ids.version,
          revision: 2,
          answers: f.answers,
          respondent: f.submission.respondent,
          copyRequested: false,
        };
      f.single.set("form_responses", {
        id: ids.response,
        version_id: ids.version,
        revision: condition === "stale" || condition === "accepted" ? 5 : 2,
        respondent_name: body.respondent.name,
        respondent_email: address,
        respondent_source: "self_reported",
      });
      if (!["unaccepted", "stale"].includes(condition))
        f.single.set("idempotency_keys", {
          request_hash:
            condition === "changed"
              ? "different"
              : tokenHash(JSON.stringify(body)),
          result: { responseId: ids.response, revision: 3 },
          expires_at:
            condition === "expired"
              ? "2000-01-01T00:00:00Z"
              : "2199-01-01T00:00:00Z",
        });
      f.single.set("form_respondent_copies", { id: ids.peer });
      const r = await f.call(root + "/edits/recovery", "POST", body);
      expect(f.db.rpc).not.toHaveBeenCalled();
      if (["expired", "changed"].includes(condition)) {
        expect(r.statusCode).toBe(409);
        return;
      }
      expect(r.statusCode).toBe(200);
      expect(r.body.data.committed).toBe(condition === "accepted");
      expect(r.body.data.canRetry).toBe(condition === "unaccepted");
      if (condition === "accepted") {
        expect(r.body.data.receipt).toEqual({
          responseId: ids.response,
          revision: 3,
          copyQueued: true,
        });
        expect(
          f.queries.find((q) => q.table === "form_respondent_copies").steps,
        ).toContainEqual(["eq", "revision", 3]);
      }
    },
  );
});
