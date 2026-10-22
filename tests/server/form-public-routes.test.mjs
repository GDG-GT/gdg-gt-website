import { afterEach, describe, it, expect, vi } from "vitest";
import { token, tokenHash, riskHash } from "../../server/lib/security.mjs";
import {
  encryptPayload,
  decryptPayload,
} from "../../server/lib/encryption.mjs";
import {
  fixture,
  ids,
  address,
  withLocalMail,
} from "./form-routes-fixture.mjs";
afterEach(() => vi.unstubAllEnvs());
const base = "/forms/fictional-route-fixture";
const admin = `/admin/forms/${ids.form}`;
function editRecord(f, overrides = {}) {
  const record = {
    id: ids.response,
    version_id: ids.version,
    revision: 0,
    respondent_name: "Fictional Respondent",
    respondent_email: address,
    respondent_source: "self_reported",
    ...overrides,
  };
  f.single.set("form_responses", record);
  return record;
}
describe("Forms public, draft, submission and own-response editing route contracts", () => {
  it("validates methods and publication availability without revealing private definitions", async () => {
    const f = fixture();
    expect((await f.call(base, "POST", {})).statusCode).toBe(405);
    f.single.set("forms", null);
    expect((await f.call(base)).statusCode).toBe(404);
    f.single.set("forms", f.row);
    for (const state of ["Draft", "Archived"]) {
      f.row.state = state;
      expect((await f.call(base)).statusCode).toBe(404);
    }
    f.row.state = "Open";
    f.row.published_version_id = null;
    expect((await f.call(base)).statusCode).toBe(404);
  });
  it("applies IP and per-form quotas with truthful retry headers and no mutation after denial", async () => {
    const f = fixture();
    f.store.rateLimit.mockResolvedValueOnce({ allowed: false, retryAfter: 42 });
    const r = await f.call(base, "GET", undefined, {}, undefined);
    expect(r.statusCode).toBe(429);
    expect(r.headers.get("retry-after")).toBe("42");
    expect(f.queries).toHaveLength(0);
    f.store.rateLimit
      .mockResolvedValueOnce({ allowed: true })
      .mockResolvedValueOnce({ allowed: false, retryAfter: 30 });
    expect(
      (await f.call(base + "/submissions", "POST", f.submission)).statusCode,
    ).toBe(429);
    expect(f.db.rpc).not.toHaveBeenCalled();
    await f.call(base, "GET", undefined, {}, null);
    expect(f.store.rateLimit).toHaveBeenCalledWith(
      "forms.read",
      riskHash("unknown", f.config.riskSecret),
      120,
      900,
    );
  });
  it("returns only the public definition and declared provenance when mail is unavailable", async () => {
    const f = fixture();
    vi.stubEnv("MAIL_MODE", "disabled");
    const r = await f.call(base);
    expect(r.statusCode).toBe(200);
    expect(r.body.data.form).toMatchObject({
      versionId: ids.version,
      respondentContext: { source: "self_reported" },
      copyAvailable: false,
    });
    for (const name of [
      "owner_id",
      "ownerId",
      "responseCount",
      "draft_definition",
      "published_version_id",
    ])
      expect(r.body.data.form).not.toHaveProperty(name);
    for (const name of ["hold", "retentionDays", "oneResponse"])
      expect(r.body.data.form.settings).not.toHaveProperty(name);
    expect(r.body.data.form.settings.access).toBe("public");
  });
  it("allows draft preview only for current authorized sessions, without pretending it is published", async () => {
    const f = fixture();
    f.row.state = "Draft";
    f.row.published_version_id = null;
    expect(
      (await f.call(base + "/preview", "GET", undefined, { cookie: "" }))
        .statusCode,
    ).toBe(401);
    f.results.set("can_operate_form", false);
    expect((await f.call(base + "/preview")).statusCode).toBe(404);
    f.results.set("can_operate_form", true);
    const r = await f.call(base + "/preview");
    expect(r.body.data).toMatchObject({
      preview: true,
      form: { status: "Draft", title: f.definition.title },
    });
    expect(f.queries.every((q) => q.table === "forms")).toBe(true);
    expect((await f.call(admin + "/draft/extra")).statusCode).toBe(404);
  });
  it("requires current internal account/team access and CSRF; locks identity to the account", async () => {
    const f = fixture();
    f.row.access_mode = "internal";
    f.row.team_id = ids.team;
    expect(
      (await f.call(base, "GET", undefined, { cookie: "" })).statusCode,
    ).toBe(401);
    f.store.validateSession.mockResolvedValue({
      sessionId: ids.session,
      user: {
        id: ids.actor,
        email: address,
        role: "team_member",
        is_active: true,
      },
    });
    f.store.memberships.mockResolvedValueOnce([]);
    expect((await f.call(base)).statusCode).toBe(403);
    f.store.memberships.mockResolvedValueOnce([
      { team_id: ids.team, team: { is_active: false } },
    ]);
    expect((await f.call(base)).statusCode).toBe(403);
    expect((await f.call(base)).body.data.form.respondentContext).toEqual({
      email: address,
      source: "account",
    });
    expect(
      (
        await f.call(base + "/submissions", "POST", f.submission, {
          "x-csrf-token": "",
        })
      ).body.error.code,
    ).toBe("CSRF_INVALID");
    expect(
      (
        await f.call(base + "/submissions", "POST", {
          ...f.submission,
          respondent: {
            ...f.submission.respondent,
            email: "other@example.test",
          },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await f.call(base + "/submissions", "POST", f.submission)).statusCode,
    ).toBe(200);
    expect(f.db.rpc).toHaveBeenCalledWith("submit_identified_form_response", {
      p_document: expect.objectContaining({
        actor: ids.actor,
        identityHash: riskHash(
          "form-identity:" + ids.actor,
          f.config.riskSecret,
        ),
      }),
    });
    f.row.team_id = null;
    expect((await f.call(base)).statusCode).toBe(200);
  });
  it("checks private-form ownership, expiry/revocation filters and exact recipient identity", async () => {
    const f = fixture(),
      accessToken = token();
    f.row.access_mode = "invited";
    expect((await f.call(base)).statusCode).toBe(403);
    expect(
      (await f.call(base, "GET", undefined, { "x-form-access": accessToken }))
        .statusCode,
    ).toBe(403);
    const access = {
      id: ids.access,
      email_hash: "fictional-identity-hash",
      used_count: 1,
      use_limit: 1,
      intended_email_encrypted: encryptPayload(
        { email: address },
        f.config.encryptionSecret,
      ),
    };
    f.single.set("form_access_tokens", access);
    expect(
      (await f.call(base, "GET", undefined, { "x-form-access": accessToken }))
        .statusCode,
    ).toBe(403);
    access.used_count = 0;
    const r = await f.call(base, "GET", undefined, {
      "x-form-access": accessToken,
    });
    expect(r.body.data.form.respondentContext).toEqual({
      email: address,
      source: "email_verified",
    });
    expect(
      f.queries.findLast((q) => q.table === "form_access_tokens").steps,
    ).toEqual(
      expect.arrayContaining([
        ["eq", "form_id", ids.form],
        ["eq", "token_type", "invited"],
        ["eq", "token_hash", tokenHash(accessToken)],
        ["is", "revoked_at", null],
      ]),
    );
    expect(
      (
        await f.call(base + "/submissions", "POST", {
          ...f.submission,
          accessToken,
          respondent: {
            ...f.submission.respondent,
            email: "other@example.test",
          },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await f.call(base + "/submissions", "POST", {
          ...f.submission,
          accessToken,
        })
      ).statusCode,
    ).toBe(200);
    expect(f.db.rpc).toHaveBeenCalledWith("submit_identified_form_response", {
      p_document: expect.objectContaining({
        accessHash: tokenHash(accessToken),
        identityHash: access.email_hash,
      }),
    });
    f.row.access_mode = "unlisted";
    access.intended_email_encrypted = null;
    expect(
      (await f.call(base, "GET", undefined, { "x-form-access": accessToken }))
        .body.data.form.respondentContext,
    ).toEqual({ source: "self_reported" });
    f.row.access_mode = "verified";
    expect(
      (await f.call(base, "GET", undefined, { "x-form-access": accessToken }))
        .body.data.form.respondentContext,
    ).toEqual({ source: "self_reported" });
  });
  it("rejects anonymous, forged, stale, invalid and honeypot submissions before transaction execution", async () => {
    const f = fixture();
    for (const body of [
      { ...f.submission, respondent: undefined },
      {
        ...f.submission,
        respondent: { ...f.submission.respondent, source: "account" },
      },
      { ...f.submission, website: "spam" },
      { ...f.submission, answers: {} },
      { ...f.submission, answers: { [ids.peer]: "Unknown field" } },
    ])
      expect(
        (await f.call(base + "/submissions", "POST", body)).statusCode,
      ).toBe(400);
    expect(
      (
        await f.call(base + "/submissions", "POST", {
          ...f.submission,
          versionId: ids.peer,
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await f.call(base + "/submissions", "POST", f.submission, {
          "idempotency-key": "short",
        })
      ).statusCode,
    ).toBe(400);
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it("binds submissions to normalized identity, exact version/schema and hashed capabilities, returning only their own edit capability", async () => {
    withLocalMail();
    const f = fixture(),
      resumeToken = token(),
      uploadToken = token();
    f.results.set("submit_identified_form_response", ({ p_document }) => ({
      responseId: ids.response,
      submittedAt: "now",
      copyQueued: p_document.copyRequested,
      editSecret: p_document.editSecret,
    }));
    const r = await f.call(base + "/submissions", "POST", {
      ...f.submission,
      resumeToken,
      uploadToken,
      copyRequested: true,
    });
    expect(r.statusCode).toBe(200);
    expect(r.body.data.copyQueued).toBe(true);
    const doc = f.db.rpc.mock.calls.find(
      ([name]) => name === "submit_identified_form_response",
    )[1].p_document;
    expect(doc).toMatchObject({
      form: ids.form,
      version: ids.version,
      schemaHash: f.published.schema_hash,
      respondent: f.submission.respondent,
      respondentHash: riskHash(
        "form-recipient:" + ids.form + ":" + address,
        f.config.riskSecret,
      ),
      copyRequested: true,
      resumeHash: tokenHash(resumeToken),
      uploadHash: tokenHash(uploadToken),
      keyHash: tokenHash(f.key),
      accessHash: null,
      identityHash: null,
      actor: null,
    });
    expect(doc.editHash).toBe(tokenHash(r.body.data.editToken));
    expect(decryptPayload(doc.editSecret, f.config.encryptionSecret)).toEqual({
      token: r.body.data.editToken,
    });
    expect(r.body.data).not.toHaveProperty("editSecret");
    f.definition.settings.editing = false;
    const noEdit = await f.call(base + "/submissions", "POST", f.submission);
    expect(noEdit.body.data).not.toHaveProperty("editToken");
    expect(f.db.rpc).toHaveBeenLastCalledWith(
      "submit_identified_form_response",
      {
        p_document: expect.objectContaining({
          editHash: null,
          editSecret: null,
          resumeHash: null,
          uploadHash: null,
        }),
      },
    );
  });
  it("replays only exact idempotent submissions, without re-consuming access or generating another edit token", async () => {
    const f = fixture(),
      editToken = token();
    const existing = {
      id: ids.response,
      submitted_at: "now",
      request_hash: tokenHash(
        JSON.stringify({ ...f.submission, copyRequested: false, website: "" }),
      ),
      edit_secret_encrypted: encryptPayload(
        { token: editToken },
        f.config.encryptionSecret,
      ),
    };
    f.single.set("form_responses", existing);
    f.single.set("form_respondent_copies", { id: ids.peer });
    let r = await f.call(base + "/submissions", "POST", f.submission);
    expect(r.body.data).toEqual({
      responseId: ids.response,
      submittedAt: "now",
      copyQueued: true,
      editToken,
    });
    expect(f.db.rpc).not.toHaveBeenCalled();
    expect(f.queries.some((q) => q.table === "form_versions")).toBe(false);
    expect(
      (
        await f.call(base + "/submissions", "POST", {
          ...f.submission,
          answers: { ...f.answers, [f.definition.fields[0].id]: "Changed" },
        })
      ).statusCode,
    ).toBe(409);
    existing.edit_secret_encrypted = null;
    f.single.set("form_respondent_copies", null);
    r = await f.call(base + "/submissions", "POST", f.submission);
    expect(r.body.data).toEqual({
      responseId: ids.response,
      submittedAt: "now",
      copyQueued: false,
    });
  });
  it("requires resume enablement, current version and well-formed optional answers", async () => {
    const f = fixture();
    f.definition.settings.resume = false;
    expect(
      (await f.call(base + "/drafts", "POST", f.submission)).statusCode,
    ).toBe(409);
    f.definition.settings.resume = true;
    expect(
      (
        await f.call(base + "/drafts", "POST", {
          ...f.submission,
          versionId: ids.peer,
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await f.call(base + "/drafts", "POST", {
          ...f.submission,
          answers: { [ids.peer]: "Invented" },
        })
      ).statusCode,
    ).toBe(400);
    expect(f.db.rpc).not.toHaveBeenCalled();
  });
  it("saves partial identified drafts with generated or reused capabilities, expiry and no raw-token persistence", async () => {
    const f = fixture(),
      uploadToken = token();
    let r = await f.call(base + "/drafts", "POST", {
      ...f.submission,
      answers: {},
      uploadToken,
      copyRequested: true,
    });
    expect(r.statusCode).toBe(200);
    expect(r.body.data.expiresInDays).toBe(1);
    expect(f.db.rpc).toHaveBeenCalledWith("save_identified_form_draft", {
      p_document: expect.objectContaining({
        hash: tokenHash(r.body.data.resumeToken),
        uploadHash: tokenHash(uploadToken),
        answers: {},
        actor: null,
        access: null,
        respondent: f.submission.respondent,
      }),
    });
    const resumeToken = r.body.data.resumeToken;
    r = await f.call(base + "/drafts", "POST", {
      ...f.submission,
      resumeToken,
    });
    expect(r.body.data.resumeToken).toBe(resumeToken);
    f.row.access_mode = "internal";
    expect(
      (await f.call(base + "/drafts", "POST", f.submission)).statusCode,
    ).toBe(200);
    expect(f.db.rpc).toHaveBeenLastCalledWith("save_identified_form_draft", {
      p_document: expect.objectContaining({ actor: ids.actor }),
    });
    f.row.access_mode = "invited";
    const accessToken = token();
    f.single.set("form_access_tokens", {
      id: ids.access,
      used_count: 0,
      use_limit: 1,
    });
    expect(
      (await f.call(base + "/drafts", "POST", { ...f.submission, accessToken }))
        .statusCode,
    ).toBe(200);
    expect(f.db.rpc).toHaveBeenLastCalledWith("save_identified_form_draft", {
      p_document: expect.objectContaining({ access: ids.access }),
    });
  });
  it("loads only unexpired, incomplete same-form drafts of the current version", async () => {
    const f = fixture(),
      resumeToken = token();
    f.single.set("form_response_drafts", null);
    expect(
      (await f.call(base + "/drafts/load", "POST", { resumeToken })).statusCode,
    ).toBe(404);
    const draft = {
      answers: f.answers,
      version_id: ids.peer,
      respondent_name: "Fictional Respondent",
      respondent_email: address,
      copy_requested: true,
    };
    f.single.set("form_response_drafts", draft);
    expect(
      (await f.call(base + "/drafts/load", "POST", { resumeToken })).statusCode,
    ).toBe(409);
    draft.version_id = ids.version;
    const r = await f.call(base + "/drafts/load", "POST", { resumeToken });
    expect(r.body.data).toEqual({
      answers: f.answers,
      versionId: ids.version,
      respondent: f.submission.respondent,
      copyRequested: true,
    });
    expect(
      f.queries.findLast((q) => q.table === "form_response_drafts").steps,
    ).toEqual(
      expect.arrayContaining([
        ["eq", "form_id", ids.form],
        ["eq", "resume_token_hash", tokenHash(resumeToken)],
        ["is", "completed_at", null],
      ]),
    );
    draft.respondent_name = null;
    draft.respondent_email = null;
    expect(
      (await f.call(base + "/drafts/load", "POST", { resumeToken })).body.data
        .respondent,
    ).toEqual({ name: "", email: "" });
    f.row.access_mode = "internal";
    expect(
      (await f.call(base + "/drafts/load", "POST", { resumeToken })).body.data
        .respondent.email,
    ).toBe(address);
  });
  it("denies unavailable/closed/disabled/deleted edits and revoked original invitations", async () => {
    const f = fixture(),
      body = { editToken: token() };
    expect((await f.call(base + "/edits/load", "POST", body)).statusCode).toBe(
      404,
    );
    const edit = editRecord(f);
    f.row.settings.editing = false;
    expect((await f.call(base + "/edits/load", "POST", body)).statusCode).toBe(
      404,
    );
    f.row.settings.editing = true;
    f.row.state = "Closed";
    expect((await f.call(base + "/edits/load", "POST", body)).statusCode).toBe(
      404,
    );
    f.row.state = "Open";
    edit.access_token_id = ids.access;
    f.single.set("form_access_tokens", { revoked_at: "now" });
    expect((await f.call(base + "/edits/load", "POST", body)).statusCode).toBe(
      403,
    );
    f.single.set("form_access_tokens", { revoked_at: null });
    expect((await f.call(base + "/edits/load", "POST", body)).statusCode).toBe(
      200,
    );
    expect(
      f.queries.findLast((q) => q.table === "form_responses").steps,
    ).toEqual(
      expect.arrayContaining([
        ["eq", "form_id", ids.form],
        ["eq", "edit_token_hash", tokenHash(body.editToken)],
        ["is", "deleted_at", null],
        ["is", "redacted_at", null],
      ]),
    );
  });
  it("loads the original response version/answers and locks its own identity without exposing edit hashes", async () => {
    const f = fixture(),
      editToken = token(),
      record = editRecord(f);
    f.row.published_version_id = ids.peer;
    f.row.access_mode = "invited";
    f.lists.set("form_answers", [
      {
        field_id: f.definition.fields[0].id,
        value: "Fictional original answer",
      },
    ]);
    let r = await f.call(base + "/edits/load", "POST", { editToken });
    expect(r.statusCode).toBe(200);
    expect(r.body.data).toMatchObject({
      responseId: ids.response,
      revision: 0,
      respondent: f.submission.respondent,
      answers: { [f.definition.fields[0].id]: "Fictional original answer" },
      form: {
        versionId: ids.version,
        respondentContext: {
          email: address,
          name: "Fictional Respondent",
          locked: true,
          source: "self_reported",
        },
      },
    });
    expect(
      f.queries.findLast((q) => q.table === "form_versions").steps,
    ).toContainEqual(["eq", "id", ids.version]);
    expect(JSON.stringify(r.body)).not.toContain("edit_token_hash");
    record.respondent_name = null;
    record.respondent_email = null;
    record.respondent_source = null;
    r = await f.call(base + "/edits/load", "POST", { editToken });
    expect(r.body.data.respondent).toEqual({ name: "", email: "" });
    expect(r.body.data.form.respondentContext).toEqual({
      source: "self_reported",
    });
    f.row.access_mode = "internal";
    expect(
      (await f.call(base + "/edits/load", "POST", { editToken })).body.data
        .respondent.email,
    ).toBe(address);
  });
  it("revalidates edited answers and binds current revision, identity, capability, request hash and actor to the transaction", async () => {
    const f = fixture(),
      editToken = token();
    editRecord(f);
    const body = { ...f.submission, editToken, revision: 0 };
    expect(
      (await f.call(base + "/edits", "POST", { ...body, answers: {} }))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await f.call(base + "/edits", "POST", {
          ...body,
          respondent: { ...body.respondent, email: "other@example.test" },
        })
      ).statusCode,
    ).toBe(400);
    expect((await f.call(base + "/edits", "POST", body)).body.data).toEqual({
      responseId: ids.response,
      revision: 1,
    });
    expect(f.db.rpc).toHaveBeenCalledWith("edit_identified_form_response", {
      p_document: expect.objectContaining({
        form: ids.form,
        response: ids.response,
        version: ids.version,
        schemaHash: f.published.schema_hash,
        tokenHash: tokenHash(editToken),
        revision: 0,
        answers: f.answers,
        keyHash: tokenHash(f.key),
        requestHash: tokenHash(
          JSON.stringify({
            editToken,
            versionId: ids.version,
            revision: 0,
            answers: f.answers,
            respondent: f.submission.respondent,
            copyRequested: false,
          }),
        ),
        actor: null,
      }),
    });
    f.row.access_mode = "internal";
    expect((await f.call(base + "/edits", "POST", body)).statusCode).toBe(200);
    expect(f.db.rpc).toHaveBeenLastCalledWith("edit_identified_form_response", {
      p_document: expect.objectContaining({ actor: ids.actor }),
    });
    f.results.set("edit_identified_form_response", {
      error: { code: "40001" },
    });
    expect((await f.call(base + "/edits", "POST", body)).statusCode).toBe(409);
  });
});
