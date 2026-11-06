import { z } from "zod";
import { requireSession, requireCsrf } from "./auth.mjs";
import { ApiError, allowMethod, jsonBody, sendJson } from "./lib/http.mjs";
import {
  databaseResult as checked,
  parse,
  uuid,
  queryValues,
  idempotency,
} from "./lib/validation.mjs";
import { tokenHash } from "./lib/security.mjs";

const actions = [
  "view",
  "edit",
  "publish",
  "manage_access",
  "view_responses",
  "view_sensitive_responses",
  "export_responses",
  "delete",
];
const version = z.number().int().min(1).max(2147483647);
const expected = {
  userId: uuid,
  formRevision: version,
  grantId: uuid.nullable(),
  grantRevision: version.or(z.literal(0)),
};
const projection = (v) => ({
  committed: v.committed,
  canRetry: v.canRetry,
  formId: v.formId,
  userId: v.userId,
  formRevision: v.formRevision,
  canSave: v.canSave,
  canRemove: v.canRemove,
  allowedActions: v.allowedActions,
  grant: v.grant
    ? { id: v.grant.id, revision: v.grant.revision, actions: v.grant.actions }
    : null,
  receipt: v.receipt
    ? {
        formId: v.receipt.formId,
        userId: v.receipt.userId,
        action: v.receipt.action,
      }
    : null,
});
export async function formCollaboratorRoutes(
  request,
  response,
  { db, store, config, requestId },
) {
  const url = new URL(request.url, config.origin),
    match = url.pathname.match(
      /^\/api\/v1\/admin\/forms\/([^/]+)\/collaborators(?:\/(recovery))?$/,
    );
  if (!match) return false;
  allowMethod(
    request,
    response,
    match[2] ? ["GET"] : ["GET", "PATCH", "DELETE"],
  );
  const id = parse(uuid, match[1]),
    session = await requireSession(request, store, config);
  for (const action of ["view", "manage_access"]) {
    if (
      !checked(
        await db.rpc("can_operate_form", {
          p_actor: session.user.id,
          p_form: id,
          p_action: action,
        }),
      )
    )
      throw new ApiError(
        404,
        "NOT_FOUND",
        "This form's access management is not available.",
      );
  }
  const scope = {
    p_actor: session.user.id,
    p_session: session.sessionId,
    p_form: id,
  };
  if (match[2]) {
    const q = queryValues(
      url.searchParams,
      z.object({ action: z.enum(["save", "remove"]), userId: uuid }).strict(),
    );
    const result = checked(
      await db.rpc("inspect_form_collaborator_write", {
        ...scope,
        p_user: q.userId,
        p_action: q.action,
        p_key_hash: tokenHash(idempotency(request)),
        p_request_hash: null,
      }),
    );
    sendJson(response, 200, projection(result), requestId);
    return true;
  }
  if (request.method === "GET") {
    const q = queryValues(
      url.searchParams,
      z
        .object({
          page: z.coerce.number().int().min(1).max(10000).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(30),
          q: z.string().trim().max(100).default(""),
        })
        .strict(),
    );
    const v = checked(
      await db.rpc("read_form_collaborator_accounts", {
        ...scope,
        p_kind: "collaborators",
        p_page: q.page,
        p_size: q.pageSize,
        p_query: q.q || null,
      }),
    );
    sendJson(
      response,
      200,
      {
        items: v.items.map((c) => ({
          admin_user_id: c.admin_user_id,
          display_name: c.display_name,
          role: c.role,
          actions: c.actions,
          created_at: c.created_at,
          updated_at: c.updated_at,
          grantId: c.grantId,
          grantRevision: c.grantRevision,
        })),
        total: v.total,
        page: q.page,
        pageSize: q.pageSize,
      },
      requestId,
    );
    return true;
  }
  queryValues(url.searchParams, z.object({}).strict());
  await requireCsrf(request, session, store);
  const remove = request.method === "DELETE";
  const body = await jsonBody(
    request,
    z
      .object({
        ...expected,
        ...(remove ? {} : { actions: z.array(z.enum(actions)).min(1).max(8) }),
      })
      .strict()
      .superRefine((v, ctx) => {
        if (
          (v.grantId === null) !== (v.grantRevision === 0) ||
          (remove && v.grantId === null)
        )
          ctx.addIssue({
            code: "custom",
            message: "Review the current grant before changing it.",
          });
        if (
          !remove &&
          (!v.actions.includes("view") ||
            new Set(v.actions).size !== v.actions.length)
        )
          ctx.addIssue({
            code: "custom",
            message: "Choose unique actions including view access.",
          });
      }),
    4096,
  );
  const { userId, ...document } = body,
    action = remove ? "remove" : "save";
  const result = checked(
    await db.rpc("mutate_form_collaborator_write", {
      ...scope,
      p_user: userId,
      p_action: action,
      p_document: document,
      p_key_hash: tokenHash(idempotency(request)),
      p_request_hash: tokenHash(
        JSON.stringify({ formId: id, userId, action, body }),
      ),
      p_request_id: requestId,
    }),
  );
  sendJson(response, 200, projection(result), requestId);
  return true;
}
