import { z } from "zod";
import { ApiError, jsonBody, sendJson } from "./lib/http.mjs";
import {
  databaseResult as checked,
  parse,
  queryValues,
  uuid,
  text,
  idempotency,
} from "./lib/validation.mjs";
import { tokenHash } from "./lib/security.mjs";
const revision = z.number().int().min(1).max(2147483647);
const values = {
  name: text(100, 1),
  filters: z
    .object({
      q: text(100).optional(),
      version: z.coerce.number().int().min(1).optional(),
      from: z.string().datetime({ offset: true }).optional(),
      to: z.string().datetime({ offset: true }).optional(),
      status: z.enum(["complete", "redacted", "held"]).optional(),
    })
    .strict(),
  columns: z.array(uuid).max(200),
};
export const formViewCreateInput = z.object(values).strict();
export const formViewReplaceInput = z.object({ ...values, revision }).strict();
export const formViewRemoveInput = z.object({ revision }).strict();
const viewDto = (v) =>
  v
    ? {
        id: v.id,
        name: v.name,
        revision: v.revision,
        filters: v.filters,
        columns: v.columns,
        updated_at: v.updated_at,
      }
    : null;
const writeDto = (v) => ({
  committed: v.committed,
  canRetry: v.canRetry,
  ...(v.receipt
    ? {
        receipt: {
          id: v.receipt.id,
          formId: v.receipt.formId,
          sourceId: v.receipt.sourceId,
          action: v.receipt.action,
        },
      }
    : {}),
  view: viewDto(v.view),
});
export async function formViewOperation(
  request,
  response,
  { db, session, id, child, recovering, url, requestId },
) {
  const recovery = child === "recovery" || recovering,
    viewId = child && child !== "recovery" ? parse(uuid, child) : null;
  if (recovery) {
    const p = queryValues(
      url.searchParams,
      z.object({ action: z.enum(["create", "replace", "remove"]) }).strict(),
    );
    if ((p.action === "create") !== (viewId === null))
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Check the saved view action and target.",
      );
    const result = checked(
      await db.rpc("inspect_form_view_write", {
        p_actor: session.user.id,
        p_session: session.sessionId,
        p_form: id,
        p_view: viewId,
        p_action: p.action,
        p_key_hash: tokenHash(idempotency(request)),
        p_request_hash: null,
      }),
    );
    sendJson(response, 200, writeDto(result), requestId);
    return true;
  }
  if (request.method === "GET") {
    const p = queryValues(
      url.searchParams,
      z
        .object({
          q: text(100).default(""),
          page: z.coerce.number().int().min(1).max(10000).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(30),
        })
        .strict(),
    );
    let query = db
      .from("form_saved_views")
      .select("id,name,revision,filters,columns,updated_at", { count: "exact" })
      .eq("form_id", id)
      .eq("owner_id", session.user.id);
    if (p.q)
      query = query.ilike("name", "%" + p.q.replace(/[\\%_]/g, "\\$&") + "%");
    const result = await query
        .order("name")
        .order("id")
        .range((p.page - 1) * p.pageSize, p.page * p.pageSize - 1),
      items = checked(result);
    sendJson(
      response,
      200,
      {
        items: items.map(viewDto),
        total: result.count || 0,
        page: p.page,
        pageSize: p.pageSize,
      },
      requestId,
    );
    return true;
  }
  queryValues(url.searchParams, z.object({}).strict());
  const action =
      request.method === "DELETE" ? "remove" : viewId ? "replace" : "create",
    body = await jsonBody(
      request,
      action === "remove"
        ? formViewRemoveInput
        : action === "replace"
          ? formViewReplaceInput
          : formViewCreateInput,
      8192,
    );
  if (
    body.filters?.from &&
    body.filters?.to &&
    new Date(body.filters.from) > new Date(body.filters.to)
  )
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "The start date must not follow the end date.",
    );
  const result = checked(
    await db.rpc("mutate_form_view_write", {
      p_actor: session.user.id,
      p_session: session.sessionId,
      p_form: id,
      p_view: viewId,
      p_action: action,
      p_document: body,
      p_key_hash: tokenHash(idempotency(request)),
      p_request_hash: tokenHash(
        JSON.stringify({ formId: id, viewId, action, body }),
      ),
      p_request_id: requestId,
    }),
  );
  sendJson(response, 200, writeDto(result), requestId);
  return true;
}
