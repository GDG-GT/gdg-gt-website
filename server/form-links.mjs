import { z } from "zod";
import { requireSession, requireCsrf } from "./auth.mjs";
import { ApiError, allowMethod, jsonBody, sendJson } from "./lib/http.mjs";
import {
  databaseResult as checked,
  parse,
  queryValues,
  uuid,
  idempotency,
} from "./lib/validation.mjs";
import { token, tokenHash, riskHash } from "./lib/security.mjs";
import { encryptPayload, decryptPayload } from "./lib/encryption.mjs";
const email = z.string().trim().toLowerCase().email().max(254),
  revision = z.number().int().min(1).max(2147483647),
  base = { formRevision: revision, publishedVersionId: uuid.nullable() };
const receipt = (v) => ({
  formId: v.formId,
  sourceId: v.sourceId,
  action: v.action,
  queued: v.queued,
  existing: v.existing,
  total: v.total,
});
const inspection = (v) => ({
  formId: v.formId,
  sourceId: v.sourceId,
  action: v.action,
  committed: v.committed,
  canRetry: v.canRetry,
  formRevision: v.formRevision,
  publishedVersionId: v.publishedVersionId,
  accessType: v.accessType,
  archived: v.archived,
  target: v.target
    ? {
        id: v.target.id,
        revision: v.target.revision,
        type: v.target.type,
        responded: v.target.responded,
        revoked: v.target.revoked,
        expiresAt: v.target.expiresAt,
        cooldownUntil: v.target.cooldownUntil,
      }
    : null,
  receipt: v.receipt ? receipt(v.receipt) : null,
});
export async function formLinkRoutes(
  request,
  response,
  { db, store, config, requestId },
) {
  const url = new URL(request.url, config.origin),
    match = url.pathname.match(
      /^\/api\/v1\/admin\/forms\/([^/]+)\/invitations(?:\/(recovery|[^/]+))?$/,
    );
  if (!match) return false;
  const recovering = match[2] === "recovery";
  allowMethod(
    request,
    response,
    recovering ? ["GET"] : match[2] ? ["PATCH"] : ["GET", "POST"],
  );
  const formId = parse(uuid, match[1]),
    sourceId = match[2] && !recovering ? parse(uuid, match[2]) : null,
    session = await requireSession(request, store, config),
    args = {
      p_actor: session.user.id,
      p_session: session.sessionId,
      p_form: formId,
    };
  for (const action of ["view", "manage_access"])
    if (
      !checked(
        await db.rpc("can_operate_form", {
          p_actor: session.user.id,
          p_form: formId,
          p_action: action,
        }),
      )
    )
      throw new ApiError(
        404,
        "NOT_FOUND",
        "This form's private links are not available.",
      );
  if (recovering) {
    const q = queryValues(
      url.searchParams,
      z
        .object({
          action: z.enum(["create", "resend", "revoke"]),
          sourceId: uuid.optional(),
        })
        .strict(),
    );
    if ((q.action === "create") !== !q.sourceId)
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Select the original private-link request.",
      );
    const v = checked(
      await db.rpc("inspect_form_access_link_write", {
        ...args,
        p_id: q.sourceId || null,
        p_action: q.action,
        p_key_hash: tokenHash(idempotency(request)),
        p_request_hash: null,
      }),
    );
    sendJson(response, 200, inspection(v), requestId);
    return true;
  }
  if (request.method === "GET") {
    const q = queryValues(
        url.searchParams,
        z
          .object({
            page: z.coerce.number().int().min(1).max(10000).default(1),
            pageSize: z.coerce.number().int().min(1).max(100).default(30),
          })
          .strict(),
      ),
      result = checked(
        await db.rpc("read_form_access_links", {
          ...args,
          p_page: q.page,
          p_size: q.pageSize,
        }),
      );
    const items = result.items.map((row) => {
      let hint = "Unavailable recipient";
      if (row.intended_email_encrypted) {
        const address = decryptPayload(
          row.intended_email_encrypted,
          config.encryptionSecret,
        ).email;
        if (typeof address !== "string" || !email.safeParse(address).success)
          throw new ApiError(
            503,
            "UNAVAILABLE",
            "This private-link inventory could not be verified.",
          );
        const [local, domain] = address.split("@");
        hint = local.slice(0, 2) + "…@" + domain;
      }
      return {
        id: row.id,
        token_type: row.token_type,
        revision: row.revision,
        recipientHint: hint,
        responded: row.used_count > 0,
        used_count: row.used_count,
        use_limit: row.use_limit,
        delivery_state: row.delivery_state,
        last_sent_at: row.last_sent_at,
        expires_at: row.expires_at,
        revoked_at: row.revoked_at,
        created_at: row.created_at,
      };
    });
    await store.audit({
      actorId: session.user.id,
      action: "forms.access_viewed",
      targetType: "form",
      targetId: formId,
      requestId,
      metadata: { count: items.length },
    });
    sendJson(
      response,
      200,
      { items, total: result.total, page: q.page, pageSize: q.pageSize },
      requestId,
    );
    return true;
  }
  queryValues(url.searchParams, z.object({}).strict());
  await requireCsrf(request, session, store);
  const quota = await store.rateLimit(
    "forms.access.admin",
    riskHash(session.user.id, config.riskSecret),
    20,
    900,
  );
  if (!quota.allowed) {
    response.setHeader("Retry-After", String(quota.retryAfter));
    throw new ApiError(429, "RATE_LIMITED", "Please wait before trying again.");
  }
  const expiresAt = z.iso.datetime({ offset: true }),
    body = await jsonBody(
      request,
      sourceId
        ? z.discriminatedUnion("action", [
            z
              .object({
                ...base,
                revision,
                action: z.literal("resend"),
                expiresAt,
              })
              .strict(),
            z
              .object({ ...base, revision, action: z.literal("revoke") })
              .strict(),
          ])
        : z
            .object({
              ...base,
              type: z.enum(["invited", "unlisted"]),
              recipients: z.array(email).min(1).max(100),
              expiresAt,
              confirmed: z.literal(true),
            })
            .strict(),
      32768,
    );
  if (!sourceId) body.recipients = [...new Set(body.recipients)];
  const action = sourceId ? body.action : "create",
    keyHash = tokenHash(idempotency(request)),
    requestHash = tokenHash(JSON.stringify({ formId, sourceId, action, body }));
  const prior = checked(
    await db.rpc("inspect_form_access_link_write", {
      ...args,
      p_id: sourceId,
      p_action: action,
      p_key_hash: keyHash,
      p_request_hash: requestHash,
    }),
  );
  if (prior.committed) {
    sendJson(response, 200, receipt(prior.receipt), requestId);
    return true;
  }
  const prepare = (address) => {
    const raw = token();
    return {
      emailHash: riskHash(
        "form-recipient:" + formId + ":" + address,
        config.riskSecret,
      ),
      emailEncrypted: encryptPayload(
        { email: address },
        config.encryptionSecret,
      ),
      tokenHash: tokenHash(raw),
      secretEncrypted: encryptPayload(
        { token: raw, email: address },
        config.encryptionSecret,
      ),
    };
  };
  let prepared = null;
  if (action === "create")
    prepared = body.recipients.map((address) => ({
      ...prepare(address),
      expiresAt: body.expiresAt,
    }));
  else if (action === "resend") {
    const record = checked(
      await db
        .from("form_access_tokens")
        .select("intended_email_encrypted")
        .eq("id", sourceId)
        .eq("form_id", formId)
        .maybeSingle(),
    );
    if (!record?.intended_email_encrypted)
      throw new ApiError(
        409,
        "INVALID_STATE",
        "This link no longer has an available recipient.",
      );
    const address = decryptPayload(
      record.intended_email_encrypted,
      config.encryptionSecret,
    ).email;
    parse(email, address);
    prepared = prepare(address);
  }
  const result = checked(
    await db.rpc("mutate_form_access_link_write", {
      ...args,
      p_id: sourceId,
      p_action: action,
      p_form_revision: body.formRevision,
      p_version: body.publishedVersionId,
      p_target_revision: sourceId ? body.revision : null,
      p_document: body,
      p_prepared: prepared,
      p_key_hash: keyHash,
      p_request_hash: requestHash,
      p_request_id: requestId,
    }),
  );
  sendJson(response, 200, receipt(result), requestId);
  return true;
}
