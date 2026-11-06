import { z } from "zod";
import {
  formDraftDefinitionSchema,
  formDefinitionSchema,
  validateSubmission,
} from "../shared/forms.ts";
import { ApiError, allowMethod, jsonBody, sendJson } from "./lib/http.mjs";
import { requireSession, requireCsrf } from "./auth.mjs";
import {
  databaseResult as checked,
  parse,
  queryValues,
  uuid,
  slug,
  idempotency,
} from "./lib/validation.mjs";
import { token, tokenHash, validToken, riskHash } from "./lib/security.mjs";
import { encryptPayload, decryptPayload } from "./lib/encryption.mjs";
import { mailConfig } from "./delivery.mjs";
import { draftDaysRemaining } from "./lib/form-lifetime.mjs";
import { formRespondentSchema } from "../shared/form-respondent.mjs";
import {
  formLibraryQuerySchema,
  formLibraryOptionsSchema,
  formTemplateSchema,
} from "../shared/form-library.mjs";

const draftSchema = z
  .object({
    slug,
    teamId: uuid.nullable().optional(),
    template: formTemplateSchema.optional(),
    definition: formDraftDefinitionSchema,
  })
  .strict();
const answer = z.union([
  z.string().max(20000),
  z.array(z.string().max(300)).max(100),
  z.record(
    z.string().max(300),
    z.union([z.string().max(300), z.array(z.string().max(300)).max(30)]),
  ),
]);
const tokenSchema = z.string().refine(validToken);
const responseSchema = z
  .object({
    versionId: uuid,
    answers: z.record(uuid, answer),
    respondent: formRespondentSchema,
    copyRequested: z.boolean().default(false),
    accessToken: tokenSchema.optional(),
    resumeToken: tokenSchema.optional(),
    uploadToken: tokenSchema.optional(),
    website: z.string().max(200).default(""),
  })
  .strict();
const allActions = [
  "view",
  "edit",
  "publish",
  "manage_access",
  "view_responses",
  "view_sensitive_responses",
  "export_responses",
  "delete",
];
function definitionBody(form) {
  return {
    title: form.title,
    description: form.description,
    fields: form.fields,
    sections: form.sections,
    settings: form.settings,
  };
}
export async function formRoutes(
  request,
  response,
  { db, store, config, requestId },
) {
  const url = new URL(request.url, config.origin),
    path = url.pathname;
  // Responses/analytics/views belong to formResponseRoutes, dispatched before
  // this handler. Keep one scoped reader rather than a shadowed legacy path.
  const admin = path.match(
    /^\/api\/v1\/admin\/forms(?:\/([^/]+)(?:\/(draft|validate|versions|publish|state|duplicate|restore|collaborators))?)?$/,
  );
  const publicRoute = path.match(
    /^\/api\/v1\/forms\/([^/]+)(?:\/(submissions|preview|drafts|edits)(?:\/(load))?)?$/,
  );
  if (!admin && !publicRoute) return false;
  const can = async (actor, id, action, team = null) =>
    checked(
      await db.rpc("can_operate_form", {
        p_actor: actor,
        p_form: id,
        p_action: action,
        p_team: team,
      }),
    );
  const versions = async (id) =>
    checked(
      await db
        .from("form_versions")
        .select("id,version,definition,published_at")
        .eq("form_id", id)
        .order("version"),
    );
  const project = async (row, actor) => ({
    ...row.draft_definition,
    id: row.id,
    slug: row.slug,
    status: row.state,
    updatedAt: row.updated_at,
    team: row.team_label || (row.team_id ? "Team-scoped" : "Chapter"),
    teamId: row.team_id,
    ownerId: row.owner_id,
    ownerLabel: row.owner_label || undefined,
    templateKey: row.template_key ?? null,
    canDuplicate: row.can_duplicate === true,
    revision: row.draft_revision,
    responseCount: Object.hasOwn(row, "response_count")
      ? row.response_count
      : (await can(actor, row.id, "view_responses"))
        ? (
            await db
              .from("form_responses")
              .select("id", { head: true, count: "exact" })
              .eq("form_id", row.id)
              .is("deleted_at", null)
          ).count
        : null,
    versions: (await versions(row.id)).map((v) => ({
      ...v.definition,
      version: v.version,
      publishedAt: v.published_at,
      versionId: v.id,
    })),
    actions:
      row.actions ||
      (
        await Promise.all(
          allActions.map(async (action) =>
            (await can(actor, row.id, action)) ? action : null,
          ),
        )
      ).filter(Boolean),
  });
  const mutate = async (session, id, action, revision, document, hash = null) =>
    checked(
      await db.rpc(
        ["draft", "publish"].includes(action)
          ? "mutate_form_authoring"
          : "mutate_form",
        {
          p_actor: session.user.id,
          ...(["draft", "publish"].includes(action)
            ? {
                p_session: session.sessionId,
                p_key_hash: tokenHash(idempotency(request)),
                p_request_hash: authoringHash,
              }
            : {}),
          p_id: id,
          p_action: action,
          p_revision: revision,
          p_document: document,
          p_schema_hash: hash,
          p_request_id: requestId,
        },
      ),
    );
  let authoringHash;
  const rate = async (scope, key, limit, seconds = 900) => {
    const r = await store.rateLimit(
      scope,
      riskHash(key, config.riskSecret),
      limit,
      seconds,
    );
    if (!r.allowed) {
      response.setHeader("Retry-After", String(r.retryAfter));
      throw new ApiError(
        429,
        "RATE_LIMITED",
        "Please wait before trying again.",
      );
    }
  };
  if (publicRoute) {
    const formSlug = parse(slug, publicRoute[1]),
      operation = publicRoute[2],
      loading = publicRoute[3] === "load";
    allowMethod(
      request,
      response,
      operation && operation !== "preview" ? ["POST"] : ["GET"],
    );
    await rate(
      "forms." + (operation === "submissions" ? "submit" : "read"),
      request.socket?.remoteAddress || "unknown",
      operation === "submissions" ? 30 : 120,
    );
    const form = checked(
      await db.from("forms").select("*").eq("slug", formSlug).maybeSingle(),
    );
    if (!form)
      throw new ApiError(404, "NOT_FOUND", "This form is not available.");
    if (operation === "preview") {
      const session = await requireSession(request, store, config);
      if (!(await can(session.user.id, form.id, "view")))
        throw new ApiError(404, "NOT_FOUND", "This form is not available.");
      sendJson(
        response,
        200,
        {
          form: {
            id: form.id,
            slug: form.slug,
            status: "Draft",
            ...form.draft_definition,
          },
          preview: true,
        },
        requestId,
      );
      return true;
    }
    let body, key, hash, editResponse;
    if (operation === "submissions") {
      body = await jsonBody(request, responseSchema, 512 * 1024);
      key = idempotency(request);
      hash = tokenHash(JSON.stringify(body));
      if (body.website)
        throw new ApiError(
          400,
          "VALIDATION_ERROR",
          "This submission could not be accepted.",
        );
      await rate(
        "forms.submit.form",
        form.id + ":" + (request.socket?.remoteAddress || "unknown"),
        20,
      );
      const existing = checked(
        await db
          .from("form_responses")
          .select("id,request_hash,submitted_at,edit_secret_encrypted")
          .eq("form_id", form.id)
          .eq("idempotency_key_hash", tokenHash(key))
          .maybeSingle(),
      );
      if (existing) {
        if (existing.request_hash !== hash)
          throw new ApiError(
            409,
            "INVALID_STATE",
            "Use a new submission key after changing your answers.",
          );
        sendJson(
          response,
          200,
          {
            responseId: existing.id,
            submittedAt: existing.submitted_at,
            copyQueued: !!checked(
              await db
                .from("form_respondent_copies")
                .select("id")
                .eq("response_id", existing.id)
                .eq("revision", 0)
                .maybeSingle(),
            ),
            ...(existing.edit_secret_encrypted
              ? {
                  editToken: decryptPayload(
                    existing.edit_secret_encrypted,
                    config.encryptionSecret,
                  ).token,
                }
              : {}),
          },
          requestId,
        );
        return true;
      }
    }
    if (operation === "drafts")
      body = await jsonBody(
        request,
        loading
          ? z
              .object({
                resumeToken: tokenSchema,
                accessToken: tokenSchema.optional(),
              })
              .strict()
          : z
              .object({
                versionId: uuid,
                answers: z.record(uuid, answer),
                respondent: formRespondentSchema,
                copyRequested: z.boolean().default(false),
                resumeToken: tokenSchema.optional(),
                accessToken: tokenSchema.optional(),
                uploadToken: tokenSchema.optional(),
              })
              .strict(),
        512 * 1024,
      );
    if (operation === "edits") {
      body = await jsonBody(
        request,
        loading
          ? z
              .object({
                editToken: tokenSchema,
                accessToken: tokenSchema.optional(),
              })
              .strict()
          : z
              .object({
                editToken: tokenSchema,
                versionId: uuid,
                revision: z.number().int().min(0),
                answers: z.record(uuid, answer),
                respondent: formRespondentSchema,
                copyRequested: z.boolean().default(false),
                accessToken: tokenSchema.optional(),
              })
              .strict(),
        512 * 1024,
      );
      editResponse = checked(
        await db
          .from("form_responses")
          .select(
            "id,version_id,revision,access_token_id,respondent_name,respondent_email,respondent_source",
          )
          .eq("form_id", form.id)
          .eq("edit_token_hash", tokenHash(body.editToken))
          .is("deleted_at", null)
          .is("redacted_at", null)
          .maybeSingle(),
      );
      if (
        !editResponse ||
        !form.settings.editing ||
        !["Open", "Scheduled"].includes(form.state)
      )
        throw new ApiError(
          404,
          "NOT_FOUND",
          "This response is not available for editing.",
        );
      if (editResponse.access_token_id) {
        const originalAccess = checked(
          await db
            .from("form_access_tokens")
            .select("revoked_at")
            .eq("id", editResponse.access_token_id)
            .single(),
        );
        if (originalAccess.revoked_at)
          throw new ApiError(
            403,
            "ACCESS_REQUIRED",
            "This access link has been revoked.",
          );
      }
    }
    if (
      !form.published_version_id ||
      ["Draft", "Archived"].includes(form.state)
    )
      throw new ApiError(404, "NOT_FOUND", "This form is not available.");
    let session = null,
      access = null;
    const rawAccess = body?.accessToken || request.headers["x-form-access"];
    if (form.access_mode === "internal") {
      session = await requireSession(request, store, config);
      if (request.method !== "GET") await requireCsrf(request, session, store);
      if (
        form.team_id &&
        !["super_admin", "admin"].includes(session.user.role) &&
        !(await store.memberships(session.user.id)).some(
          (m) => m.team_id === form.team_id && m.team?.is_active,
        )
      )
        throw new ApiError(
          403,
          "ACCESS_REQUIRED",
          "This form requires chapter access.",
        );
    } else if (form.access_mode !== "public" && !editResponse) {
      if (!validToken(rawAccess))
        throw new ApiError(
          403,
          "ACCESS_REQUIRED",
          "This form requires a valid access link.",
        );
      access = checked(
        await db
          .from("form_access_tokens")
          .select("id,email_hash,used_count,use_limit,intended_email_encrypted")
          .eq("form_id", form.id)
          .eq("token_type", form.access_mode)
          .eq("token_hash", tokenHash(rawAccess))
          .is("revoked_at", null)
          .gt("expires_at", new Date().toISOString())
          .maybeSingle(),
      );
      if (!access || access.used_count >= access.use_limit)
        throw new ApiError(
          403,
          "ACCESS_REQUIRED",
          "This form requires a valid access link.",
        );
    }
    const published = checked(
      await db
        .from("form_versions")
        .select("id,version,definition,schema_hash")
        .eq("id", editResponse?.version_id || form.published_version_id)
        .single(),
    );
    const definition = parse(formDefinitionSchema, published.definition);
    const email =
      editResponse?.respondent_email ||
      (session
        ? session.user.email
        : ["verified", "invited"].includes(form.access_mode) &&
            access?.intended_email_encrypted
          ? decryptPayload(
              access.intended_email_encrypted,
              config.encryptionSecret,
            ).email
          : undefined);
    const respondentContext = {
      ...(email ? { email } : {}),
      ...(editResponse?.respondent_name
        ? { name: editResponse.respondent_name, locked: true }
        : {}),
      source:
        editResponse?.respondent_source ||
        (session
          ? "account"
          : ["verified", "invited"].includes(form.access_mode) &&
              access?.intended_email_encrypted
            ? "email_verified"
            : "self_reported"),
    };
    let copyAvailable = false;
    try {
      copyAvailable = !!mailConfig(process.env);
    } catch {
      /* Submission remains available without SMTP. */
    }
    if (
      body?.respondent &&
      email &&
      body.respondent.email !== email.toLowerCase()
    )
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Use the email address associated with this form's access or original response.",
      );
    const identityDocument = body?.respondent
      ? {
          respondent: body.respondent,
          respondentHash: riskHash(
            "form-recipient:" + form.id + ":" + body.respondent.email,
            config.riskSecret,
          ),
          copyRequested: body.copyRequested && copyAvailable,
        }
      : {};
    if (!operation) {
      // No owner, collaborator, token, private rule, or response-count projection.
      const settings = { ...definition.settings, access: "public" };
      delete settings.hold;
      delete settings.retentionDays;
      delete settings.oneResponse;
      sendJson(
        response,
        200,
        {
          form: {
            id: form.id,
            slug: form.slug,
            status: form.state,
            ...definition,
            settings,
            versionId: published.id,
            version: published.version,
            respondentContext,
            copyAvailable,
          },
        },
        requestId,
      );
      return true;
    }
    if (operation === "drafts") {
      if (!definition.settings.resume)
        throw new ApiError(
          409,
          "INVALID_STATE",
          "Save and resume is not enabled for this form.",
        );
      if (loading) {
        const draft = checked(
          await db
            .from("form_response_drafts")
            .select(
              "answers,version_id,respondent_name,respondent_email,copy_requested",
            )
            .eq("form_id", form.id)
            .eq("resume_token_hash", tokenHash(body.resumeToken))
            .is("completed_at", null)
            .gt("expires_at", new Date().toISOString())
            .maybeSingle(),
        );
        if (!draft)
          throw new ApiError(
            404,
            "NOT_FOUND",
            "This saved draft is no longer available.",
          );
        if (draft.version_id !== published.id)
          throw new ApiError(
            409,
            "CONFLICT",
            "This form changed. Start a new response using the current questions.",
          );
        sendJson(
          response,
          200,
          {
            answers: draft.answers,
            versionId: draft.version_id,
            respondent: {
              name: draft.respondent_name || "",
              email: draft.respondent_email || email || "",
            },
            copyRequested: draft.copy_requested,
          },
          requestId,
        );
        return true;
      }
      if (body.versionId !== published.id)
        throw new ApiError(
          409,
          "CONFLICT",
          "This form changed. Reload before saving a draft.",
        );
      const errors = validateSubmission(definition, body.answers, true);
      if (Object.keys(errors).length)
        throw new ApiError(
          400,
          "VALIDATION_ERROR",
          "Check the draft answers.",
          errors,
        );
      const resume = body.resumeToken || token();
      checked(
        await db.rpc("save_identified_form_draft", {
          p_document: {
            ...identityDocument,
            form: form.id,
            version: published.id,
            hash: tokenHash(resume),
            answers: body.answers,
            access: access?.id || null,
            actor: session?.user.id || null,
            uploadHash: body.uploadToken ? tokenHash(body.uploadToken) : null,
          },
        }),
      );
      const lifetime = checked(
        await db
          .from("form_response_drafts")
          .select("expires_at,created_at")
          .eq("form_id", form.id)
          .eq("resume_token_hash", tokenHash(resume))
          .single(),
      );
      sendJson(
        response,
        200,
        {
          resumeToken: resume,
          expiresAt: lifetime.expires_at,
          expiresInDays: draftDaysRemaining(
            lifetime.created_at,
            lifetime.expires_at,
          ),
        },
        requestId,
      );
      return true;
    }
    if (operation === "edits") {
      if (loading) {
        const answers = checked(
          await db
            .from("form_answers")
            .select("field_id,value")
            .eq("response_id", editResponse.id),
        );
        sendJson(
          response,
          200,
          {
            responseId: editResponse.id,
            revision: editResponse.revision,
            answers: Object.fromEntries(
              answers.map((a) => [a.field_id, a.value]),
            ),
            respondent: {
              name: editResponse.respondent_name || "",
              email: editResponse.respondent_email || email || "",
            },
            form: {
              id: form.id,
              slug: form.slug,
              status: form.state,
              ...definition,
              versionId: published.id,
              version: published.version,
              respondentContext,
              copyAvailable,
            },
          },
          requestId,
        );
        return true;
      }
      const errors = validateSubmission(definition, body.answers);
      if (Object.keys(errors).length)
        throw new ApiError(
          400,
          "VALIDATION_ERROR",
          "Check the updated answers.",
          errors,
        );
      const result = checked(
        await db.rpc("edit_identified_form_response", {
          p_document: {
            ...identityDocument,
            form: form.id,
            response: editResponse.id,
            version: body.versionId,
            schemaHash: published.schema_hash,
            tokenHash: tokenHash(body.editToken),
            revision: body.revision,
            answers: body.answers,
            keyHash: tokenHash(idempotency(request)),
            requestHash: tokenHash(JSON.stringify(body)),
            actor: session?.user.id || null,
          },
        }),
      );
      sendJson(response, 200, result, requestId);
      return true;
    }
    if (body.versionId !== published.id)
      throw new ApiError(
        409,
        "CONFLICT",
        "This form changed. Reload it before submitting.",
      );
    const errors = validateSubmission(definition, body.answers);
    if (Object.keys(errors).length)
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Check your answers before submitting.",
        errors,
      );
    const edit = definition.settings.editing ? token() : null;
    const result = checked(
      await db.rpc("submit_identified_form_response", {
        p_document: {
          ...identityDocument,
          form: form.id,
          version: published.id,
          schemaHash: published.schema_hash,
          answers: body.answers,
          keyHash: tokenHash(key),
          requestHash: hash,
          accessHash: rawAccess ? tokenHash(rawAccess) : null,
          identityHash: session
            ? riskHash("form-identity:" + session.user.id, config.riskSecret)
            : access?.email_hash || null,
          actor: session?.user.id || null,
          editHash: edit ? tokenHash(edit) : null,
          editSecret: edit
            ? encryptPayload({ token: edit }, config.encryptionSecret)
            : null,
          resumeHash: body.resumeToken ? tokenHash(body.resumeToken) : null,
          uploadHash: body.uploadToken ? tokenHash(body.uploadToken) : null,
        },
      }),
    );
    sendJson(
      response,
      200,
      {
        responseId: result.responseId,
        submittedAt: result.submittedAt,
        copyQueued: result.copyQueued,
        ...(result.editSecret
          ? {
              editToken: decryptPayload(
                result.editSecret,
                config.encryptionSecret,
              ).token,
            }
          : {}),
      },
      requestId,
    );
    return true;
  }
  if (admin[1] === "filters" && !admin[2]) {
    allowMethod(request, response, ["GET"]);
    const session = await requireSession(request, store, config);
    const p = queryValues(url.searchParams, formLibraryOptionsSchema);
    const result = checked(
      await db.rpc("list_form_library_options", {
        p_actor: session.user.id,
        p_kind: p.kind,
        p_page: p.page,
        p_size: p.pageSize,
        p_query: p.q || null,
      }),
    );
    sendJson(response, 200, result, requestId);
    return true;
  }
  const [, rawId, operation] = admin,
    id = rawId ? parse(uuid, rawId) : null;
  allowMethod(
    request,
    response,
    operation === "collaborators"
      ? ["GET", "PATCH", "DELETE"]
      : operation === "draft"
        ? ["GET", "PATCH"]
        : operation === "validate" ||
            operation === "publish" ||
            operation === "state" ||
            operation === "duplicate" ||
            operation === "restore"
          ? ["POST"]
          : operation === "versions"
            ? ["GET"]
            : id
              ? ["GET", "PATCH", "DELETE"]
              : ["GET", "POST"],
  );
  const session = await requireSession(request, store, config);
  if (request.method !== "GET") await requireCsrf(request, session, store);
  if (!id) {
    if (request.method === "GET") {
      const p = queryValues(url.searchParams, formLibraryQuerySchema),
        data = checked(
          await db.rpc("list_form_library", {
            p_actor: session.user.id,
            p_page: p.page,
            p_size: p.pageSize,
            p_query: p.q || null,
            p_team: p.team && p.team !== "chapter" ? p.team : null,
            p_chapter: p.team === "chapter",
            p_owner: p.owner || null,
            p_state: p.state || null,
            p_from: p.updatedFrom || null,
            p_to: p.updatedTo || null,
            p_template: p.template || null,
          }),
        );
      data.items = await Promise.all(
        data.items.map((row) => project(row, session.user.id)),
      );
      sendJson(response, 200, data, requestId);
      return true;
    }
    const body = await jsonBody(request, draftSchema, 512 * 1024),
      row = checked(
        await db.rpc("create_form_from_template", {
          p_actor: session.user.id,
          p_request_id: requestId,
          p_template: body.template || null,
          p_document: {
            slug: body.slug,
            team_id: body.teamId || null,
            definition: body.definition,
          },
        }),
      );
    sendJson(
      response,
      200,
      { form: await project(row, session.user.id) },
      requestId,
    );
    return true;
  }
  if (!(await can(session.user.id, id, "view")))
    throw new ApiError(404, "NOT_FOUND", "This form is not available.");
  const row = checked(await db.from("forms").select("*").eq("id", id).single());
  if (request.method === "GET") {
    if (url.searchParams.has("mutation")) {
      if (operation)
        throw new ApiError(
          400,
          "VALIDATION_ERROR",
          "Use the selected form to recheck a write.",
        );
      const query = queryValues(
        url.searchParams,
        z.object({ mutation: z.enum(["draft", "publish"]) }).strict(),
      );
      const result = checked(
        await db.rpc("inspect_form_authoring_write", {
          p_actor: session.user.id,
          p_session: session.sessionId,
          p_id: id,
          p_action: query.mutation,
          p_key_hash: tokenHash(idempotency(request)),
          p_request_hash: null,
        }),
      );
      sendJson(
        response,
        200,
        { ...result, form: await project(result.form, session.user.id) },
        requestId,
      );
      return true;
    }
    if (operation === "versions") {
      sendJson(response, 200, { items: await versions(id) }, requestId);
      return true;
    }
    if (operation === "collaborators") {
      if (!(await can(session.user.id, id, "manage_access")))
        throw new ApiError(
          403,
          "FORBIDDEN",
          "You do not have permission to manage access.",
        );
      const p = queryValues(
        url.searchParams,
        z
          .object({
            page: z.coerce.number().int().min(1).max(10000).default(1),
            pageSize: z.coerce.number().int().min(1).max(100).default(30),
            q: z.string().trim().max(100).default(""),
          })
          .strict(),
      );
      sendJson(
        response,
        200,
        checked(
          await db.rpc("list_form_access_accounts", {
            p_actor: session.user.id,
            p_form: id,
            p_kind: "collaborators",
            p_page: p.page,
            p_size: p.pageSize,
            p_query: p.q || null,
          }),
        ),
        requestId,
      );
      return true;
    }
    sendJson(
      response,
      200,
      { form: await project(row, session.user.id) },
      requestId,
    );
    return true;
  }
  if (operation === "validate") {
    const body = await jsonBody(
        request,
        z.object({ definition: formDraftDefinitionSchema }).strict(),
        512 * 1024,
      ),
      valid = formDefinitionSchema.safeParse(body.definition);
    sendJson(
      response,
      200,
      {
        valid: valid.success,
        issues: valid.success
          ? []
          : valid.error.issues.map((i) => ({
              path: i.path.join("."),
              message: i.message,
            })),
      },
      requestId,
    );
    return true;
  }
  if (operation === "duplicate") {
    const body = await jsonBody(request, z.object({ slug }).strict(), 1024),
      copy = checked(
        await db.rpc("create_form_from_template", {
          p_actor: session.user.id,
          p_request_id: requestId,
          p_template: row.template_key,
          p_document: {
            slug: body.slug,
            team_id: row.team_id,
            definition: {
              ...row.draft_definition,
              title: row.title + " (copy)",
            },
          },
        }),
      );
    sendJson(
      response,
      200,
      { form: await project(copy, session.user.id) },
      requestId,
    );
    return true;
  }
  if (operation === "collaborators") {
    const body = await jsonBody(
      request,
      z
        .object({
          userId: uuid,
          actions: z.array(z.enum(allActions)).min(1).max(8).optional(),
        })
        .strict(),
      4096,
    );
    if (request.method === "PATCH" && !body.actions)
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Select explicit collaborator actions.",
      );
    checked(
      await db.rpc("mutate_form_collaborator", {
        p_actor: session.user.id,
        p_form: id,
        p_user: body.userId,
        p_actions: body.actions || [],
        p_delete: request.method === "DELETE",
        p_request_id: requestId,
      }),
    );
    sendJson(response, 200, { updated: true }, requestId);
    return true;
  }
  const body = await jsonBody(
    request,
    z
      .object({
        revision: z.number().int().min(1),
        slug: slug.optional(),
        teamId: uuid.nullable().optional(),
        definition: formDraftDefinitionSchema.optional(),
        state: z.enum(["Open", "Closed", "Scheduled"]).optional(),
      })
      .strict(),
    512 * 1024,
  );
  let action =
    operation === "publish"
      ? "publish"
      : operation === "state"
        ? "state"
        : operation === "restore"
          ? "restore"
          : request.method === "DELETE"
            ? "archive"
            : "draft";
  if (["draft", "publish"].includes(action)) {
    const key = idempotency(request);
    // Fingerprint the original validated intent, including its expected
    // revision, before deriving publication data from a potentially newer row.
    authoringHash = tokenHash(JSON.stringify({ id, action, body }));
    const existing = checked(
      await db.rpc("inspect_form_authoring_write", {
        p_actor: session.user.id,
        p_session: session.sessionId,
        p_id: id,
        p_action: action,
        p_key_hash: tokenHash(key),
        p_request_hash: authoringHash,
      }),
    );
    if (existing.committed) {
      sendJson(
        response,
        200,
        { form: await project(existing.form, session.user.id) },
        requestId,
      );
      return true;
    }
  }
  const definition =
    action === "publish"
      ? parse(formDefinitionSchema, row.draft_definition)
      : body.definition;
  if (action === "draft" && !definition)
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "A draft definition is required.",
    );
  if (
    action === "publish" &&
    definition.fields.some((f) => f.type === "file") &&
    process.env.UPLOADS_ENABLED !== "true"
  )
    throw new ApiError(
      409,
      "UPLOADS_NOT_READY",
      "File fields can be published after the private upload scanner is configured.",
    );
  if (action === "publish" && definition.settings.receipts) {
    mailConfig(process.env);
    if (
      !["verified", "invited", "internal"].includes(definition.settings.access)
    )
      throw new ApiError(
        409,
        "FORM_RECEIPT_IDENTITY",
        "Receipts require verified email, an individual invitation, or a signed-in chapter account.",
      );
    if (
      !checked(
        await db.rpc("form_receipt_ready", {
          p_form: id,
          p_hash: tokenHash(JSON.stringify(definition)),
        }),
      )
    )
      throw new ApiError(
        409,
        "FORM_DELIVERY_REVIEW_REQUIRED",
        "Save this draft, then review its delivery settings before publishing receipts.",
      );
  }
  const changed = await mutate(
    session,
    id,
    action,
    body.revision,
    {
      ...(definition ? { definition: definitionBody(definition) } : {}),
      ...(body.slug ? { slug: body.slug } : {}),
      ...(body.teamId !== undefined ? { team_id: body.teamId } : {}),
      ...(body.state ? { state: body.state } : {}),
    },
    action === "publish" ? tokenHash(JSON.stringify(definition)) : null,
  );
  sendJson(
    response,
    200,
    { form: await project(changed, session.user.id) },
    requestId,
  );
  return true;
}
