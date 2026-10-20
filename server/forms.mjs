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
  text,
  idempotency,
} from "./lib/validation.mjs";
import { token, tokenHash, validToken, riskHash } from "./lib/security.mjs";
import { encryptPayload, decryptPayload } from "./lib/encryption.mjs";

const pageSchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(30),
    q: text(100).optional(),
    team: uuid.optional(),
    owner: uuid.optional(),
    state: z
      .enum(["Draft", "Open", "Scheduled", "Closed", "Archived"])
      .optional(),
  })
  .strict();
const draftSchema = z
  .object({
    slug,
    teamId: uuid.nullable().optional(),
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
export function projectResponse(
  response,
  answers,
  definition,
  sensitive = false,
) {
  const permitted = new Set(
    definition.fields.filter((f) => sensitive || !f.sensitive).map((f) => f.id),
  );
  return {
    id: response.id,
    formId: response.form_id,
    versionId: response.version_id,
    version: response.version,
    submittedAt: response.submitted_at,
    redacted: !!response.redacted_at,
    status: response.status,
    answers: Object.fromEntries(
      answers
        .filter((a) => permitted.has(a.field_id))
        .map((a) => [a.field_id, a.value]),
    ),
  };
}
export async function formRoutes(
  request,
  response,
  { db, store, config, requestId },
) {
  const url = new URL(request.url, config.origin),
    path = url.pathname;
  const admin = path.match(
    /^\/api\/v1\/admin\/forms(?:\/([^/]+)(?:\/(draft|validate|versions|publish|state|duplicate|restore|responses|collaborators)(?:\/([^/]+))?)?)?$/,
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
    team: row.team_id ? "Team-scoped" : "Chapter",
    teamId: row.team_id,
    ownerId: row.owner_id,
    revision: row.draft_revision,
    responseCount:
      row.response_count ??
      ((await can(actor, row.id, "view_responses"))
        ? (
            await db
              .from("form_responses")
              .select("id", { head: true, count: "exact" })
              .eq("form_id", row.id)
              .is("deleted_at", null)
          ).count
        : null),
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
      await db.rpc("mutate_form", {
        p_actor: session.user.id,
        p_id: id,
        p_action: action,
        p_revision: revision,
        p_document: document,
        p_schema_hash: hash,
        p_request_id: requestId,
      }),
    );
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
                resumeToken: tokenSchema.optional(),
                accessToken: tokenSchema.optional(),
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
                accessToken: tokenSchema.optional(),
              })
              .strict(),
        512 * 1024,
      );
      editResponse = checked(
        await db
          .from("form_responses")
          .select("id,version_id,revision,access_token_id")
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
          .select("id,email_hash,used_count,use_limit")
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
            .select("answers,version_id")
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
          { answers: draft.answers, versionId: draft.version_id },
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
        await db.rpc("save_form_draft", {
          p_form: form.id,
          p_version: published.id,
          p_hash: tokenHash(resume),
          p_answers: body.answers,
          p_access: access?.id || null,
          p_actor: session?.user.id || null,
        }),
      );
      sendJson(
        response,
        200,
        { resumeToken: resume, expiresInDays: 7 },
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
            form: {
              id: form.id,
              slug: form.slug,
              status: form.state,
              ...definition,
              versionId: published.id,
              version: published.version,
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
        await db.rpc("edit_form_response", {
          p_form: form.id,
          p_response: editResponse.id,
          p_version: body.versionId,
          p_schema_hash: published.schema_hash,
          p_token_hash: tokenHash(body.editToken),
          p_revision: body.revision,
          p_answers: body.answers,
          p_key_hash: tokenHash(idempotency(request)),
          p_request_hash: tokenHash(JSON.stringify(body)),
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
      await db.rpc("submit_form_response", {
        p_form: form.id,
        p_version: published.id,
        p_schema_hash: published.schema_hash,
        p_answers: body.answers,
        p_key_hash: tokenHash(key),
        p_request_hash: hash,
        p_access_hash: rawAccess ? tokenHash(rawAccess) : null,
        p_identity_hash: session
          ? riskHash("form-identity:" + session.user.id, config.riskSecret)
          : access?.email_hash || null,
        p_actor: session?.user.id || null,
        p_edit_hash: edit ? tokenHash(edit) : null,
        p_edit_secret: edit
          ? encryptPayload({ token: edit }, config.encryptionSecret)
          : null,
        p_resume_hash: body.resumeToken ? tokenHash(body.resumeToken) : null,
        p_upload_hash: body.uploadToken ? tokenHash(body.uploadToken) : null,
      }),
    );
    sendJson(
      response,
      200,
      {
        responseId: result.responseId,
        submittedAt: result.submittedAt,
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
  const [, rawId, operation, childId] = admin,
    id = rawId ? parse(uuid, rawId) : null;
  allowMethod(
    request,
    response,
    operation === "responses"
      ? ["GET"]
      : operation === "collaborators"
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
      const p = queryValues(url.searchParams, pageSchema),
        data = checked(
          await db.rpc("list_forms", {
            p_actor: session.user.id,
            p_page: p.page,
            p_size: p.pageSize,
            p_query: p.q || null,
            p_team: p.team || null,
            p_owner: p.owner || null,
            p_state: p.state || null,
          }),
        );
      data.items = await Promise.all(
        data.items.map((row) => project(row, session.user.id)),
      );
      sendJson(response, 200, data, requestId);
      return true;
    }
    const body = await jsonBody(request, draftSchema, 512 * 1024),
      row = await mutate(session, null, "create", null, {
        slug: body.slug,
        team_id: body.teamId || null,
        definition: body.definition,
      });
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
  if (operation === "responses") {
    if (!(await can(session.user.id, id, "view_responses")))
      throw new ApiError(
        403,
        "FORBIDDEN",
        "You do not have access to these responses.",
      );
    const p = queryValues(
      url.searchParams,
      z
        .object({
          page: z.coerce.number().int().min(1).max(10000).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(30),
          version: z.coerce.number().int().min(1).optional(),
          sensitive: z.enum(["true", "false"]).default("false"),
        })
        .strict(),
    );
    const sensitive = p.sensitive === "true";
    if (
      sensitive &&
      !(await can(session.user.id, id, "view_sensitive_responses"))
    )
      throw new ApiError(
        403,
        "FORBIDDEN",
        "Sensitive answers require a separate permission.",
      );
    const defs = await versions(id),
      versionIds = defs
        .filter((v) => !p.version || v.version === p.version)
        .map((v) => v.id);
    if (!versionIds.length) {
      sendJson(
        response,
        200,
        { items: [], total: 0, page: p.page, pageSize: p.pageSize },
        requestId,
      );
      return true;
    }
    let query = db
      .from("form_responses")
      .select(
        "id,form_id,version_id,submitted_at,status,redacted_at,last_edited_at",
        { count: "exact" },
      )
      .eq("form_id", id)
      .in("version_id", versionIds)
      .is("deleted_at", null);
    if (childId) query = query.eq("id", parse(uuid, childId));
    const result = await query
      .order("submitted_at", { ascending: false })
      .order("id")
      .range((p.page - 1) * p.pageSize, p.page * p.pageSize - 1);
    checked(result);
    if (childId && !result.data.length)
      throw new ApiError(404, "NOT_FOUND", "This response was not found.");
    const answers = result.data.length
      ? checked(
          await db
            .from("form_answers")
            .select("response_id,field_id,value")
            .in(
              "response_id",
              result.data.map((r) => r.id),
            ),
        )
      : [];
    const items = result.data.map((r) => {
      const v = defs.find((v) => v.id === r.version_id);
      return projectResponse(
        { ...r, version: v.version },
        answers.filter((a) => a.response_id === r.id),
        v.definition,
        sensitive,
      );
    });
    await store.audit({
      actorId: session.user.id,
      action: sensitive ? "forms.sensitive_viewed" : "forms.responses_viewed",
      targetType: "form",
      targetId: id,
      requestId,
      metadata: {
        responseId: childId || null,
        version: p.version || null,
        count: items.length,
      },
    });
    sendJson(
      response,
      200,
      { items, total: result.count, page: p.page, pageSize: p.pageSize },
      requestId,
    );
    return true;
  }
  if (request.method === "GET") {
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
      sendJson(
        response,
        200,
        {
          items: checked(
            await db
              .from("form_collaborators")
              .select("admin_user_id,actions,created_at,updated_at")
              .eq("form_id", id),
          ),
        },
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
      copy = await mutate(session, null, "create", null, {
        slug: body.slug,
        team_id: row.team_id,
        definition: { ...row.draft_definition, title: row.title + " (copy)" },
      });
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
  if (action === "publish" && definition.fields.some((f) => f.type === "file"))
    throw new ApiError(
      409,
      "UPLOADS_NOT_READY",
      "File fields can be published after the private upload scanner is configured.",
    );
  if (action === "publish" && definition.settings.receipts)
    throw new ApiError(
      409,
      "RECEIPTS_NOT_READY",
      "Response receipts require verified-email delivery configuration.",
    );
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
