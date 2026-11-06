import { z } from "zod";
import { requireSession, requireCsrf } from "./auth.mjs";
import { ApiError, allowMethod, jsonBody, sendJson } from "./lib/http.mjs";
import {
  databaseResult as checked,
  parse,
  uuid,
  queryValues,
  idempotency,
  text,
} from "./lib/validation.mjs";
import { tokenHash } from "./lib/security.mjs";
const revision = z.number().int().min(0).max(2147483647);
export const formIntegrationInput = z
  .object({
    revision,
    referenceId: uuid.nullable(),
    formId: uuid,
    formRevision: revision.refine((v) => v >= 1),
    publishedVersionId: uuid,
    versionPolicy: z.literal("latest_published"),
    label: text(80, 1),
  })
  .strict()
  .superRefine((v, ctx) => {
    if ((v.referenceId === null) !== (v.revision === 0))
      ctx.addIssue({
        code: "custom",
        message: "Review the current link record before changing it.",
      });
  });
const removeInput = z
  .object({ revision: revision.refine((v) => v >= 1), referenceId: uuid })
  .strict();
const receipt = (v) => ({
  kind: v.kind,
  resourceId: v.resourceId,
  slot: v.slot,
  sourceId: v.sourceId,
  action: v.action,
  id: v.id,
});
export async function formIntegrationRoutes(
  request,
  response,
  { db, store, config, requestId },
) {
  const url = new URL(request.url, config.origin),
    match = url.pathname.match(
      /^\/api\/v1\/admin\/form-integrations\/(event|team|campaign)\/([^/]+)(?:\/(candidates|[a-z][a-z0-9-]{0,39})(?:\/(recovery))?)?$/,
    );
  if (!match) return false;
  const candidates = match[3] === "candidates",
    slot = candidates ? null : match[3],
    recovering = !!match[4];
  allowMethod(
    request,
    response,
    recovering || candidates || !slot ? ["GET"] : ["PUT", "DELETE"],
  );
  if (recovering && candidates)
    throw new ApiError(404, "NOT_FOUND", "This record was not found.");
  const query = queryValues(
    url.searchParams,
    recovering
      ? z
          .object({
            action: z.enum(["save", "remove"]),
            sourceId: uuid.optional(),
            targetId: uuid.optional(),
          })
          .strict()
      : candidates
        ? z
            .object({
              q: text(100).default(""),
              selected: uuid.optional(),
              page: z.coerce.number().int().min(1).max(10000).default(1),
              pageSize: z.coerce.number().int().min(1).max(100).default(30),
            })
            .strict()
        : z.object({}).strict(),
  );
  const session = await requireSession(request, store, config),
    args = {
      p_actor: session.user.id,
      p_session: session.sessionId,
      p_kind: match[1],
      p_resource: parse(uuid, match[2]),
    };
  if (recovering) {
    if (
      (query.action === "remove" && (!query.sourceId || query.targetId)) ||
      (query.action === "save" && !query.targetId)
    )
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Select the original linked-form request.",
      );
    const v = checked(
      await db.rpc("inspect_form_integration_write", {
        ...args,
        p_slot: slot,
        p_source: query.sourceId || null,
        p_action: query.action,
        p_target: query.targetId || null,
        p_key_hash: tokenHash(idempotency(request)),
        p_request_hash: null,
      }),
    );
    sendJson(
      response,
      200,
      {
        kind: v.kind,
        resourceId: v.resourceId,
        slot: v.slot,
        sourceId: v.sourceId,
        action: v.action,
        committed: v.committed,
        canRetry: v.canRetry,
        reference: v.reference
          ? { id: v.reference.id, revision: v.reference.revision }
          : null,
        target: v.target
          ? {
              id: v.target.id,
              formRevision: v.target.formRevision,
              publishedVersionId: v.target.publishedVersionId,
            }
          : null,
        receipt: v.receipt ? receipt(v.receipt) : null,
      },
      requestId,
    );
    return true;
  }
  if (request.method === "GET") {
    if (candidates) {
      const v = checked(
        await db.rpc("read_form_integration_candidates", {
          ...args,
          p_page: query.page,
          p_size: query.pageSize,
          p_query: query.q,
          p_selected: query.selected || null,
        }),
      );
      sendJson(
        response,
        200,
        {
          kind: args.p_kind,
          resourceId: args.p_resource,
          items: v.items.map((f) => ({
            id: f.id,
            title: f.title,
            formRevision: f.formRevision,
            publishedVersionId: f.publishedVersionId,
            version: f.version,
            access: f.access,
          })),
          total: v.total,
          page: query.page,
          pageSize: query.pageSize,
        },
        requestId,
      );
    } else {
      const v = checked(await db.rpc("read_form_integrations", args));
      sendJson(
        response,
        200,
        {
          kind: args.p_kind,
          resourceId: args.p_resource,
          canEdit: v.canEdit,
          canLink: v.canLink,
          items: v.items.map((r) => ({
            id: r.id,
            slot: r.slot,
            formId: r.formId,
            label: r.label,
            title: r.title,
            href: r.href,
            revision: r.revision,
            versionPolicy: r.versionPolicy,
          })),
        },
        requestId,
      );
    }
    return true;
  }
  await requireCsrf(request, session, store);
  const { revision, referenceId, ...document } = await jsonBody(
      request,
      request.method === "DELETE" ? removeInput : formIntegrationInput,
      2048,
    ),
    value = request.method === "DELETE" ? null : document;
  const v = checked(
    await db.rpc("mutate_form_integration_write", {
      ...args,
      p_slot: slot,
      p_source: referenceId,
      p_revision: revision,
      p_document: value,
      p_key_hash: tokenHash(idempotency(request)),
      p_request_hash: tokenHash(
        JSON.stringify({
          kind: args.p_kind,
          resourceId: args.p_resource,
          slot,
          revision,
          referenceId,
          document: value,
        }),
      ),
      p_request_id: requestId,
    }),
  );
  sendJson(response, 200, receipt(v), requestId);
  return true;
}
