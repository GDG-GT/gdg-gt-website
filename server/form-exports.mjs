import { z } from "zod";
import { requireSession, requireCsrf } from "./auth.mjs";
import { ApiError, allowMethod, jsonBody, sendJson } from "./lib/http.mjs";
import {
  databaseResult as checked,
  parse,
  uuid,
  idempotency,
  queryValues,
} from "./lib/validation.mjs";
import { tokenHash } from "./lib/security.mjs";
import { objectStorage } from "./lib/object-storage.mjs";
import { formResponseFilterShape } from "./form-responses.mjs";

export const formExportInput = z
  .object({
    format: z.enum(["csv", "xlsx", "json"]),
    filters: z
      .object({
        ...formResponseFilterShape,
        selected: z.array(uuid).min(1).max(100).optional(),
      })
      .strict()
      .default({}),
    columns: z.array(uuid).max(200).optional(),
    sensitive: z.boolean().default(false),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      v.filters.from &&
      v.filters.to &&
      new Date(v.filters.from) > new Date(v.filters.to)
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The end date must follow the start date.",
      });
  });
const publicColumns =
  "id,format,state,response_count,include_sensitive,byte_size,error_code,created_at,expires_at";
export function exportJobDto(j) {
  return {
    id: j.id,
    format: j.format,
    state: new Date(j.expires_at) <= new Date() ? "expired" : j.state,
    count: j.response_count,
    sensitive: j.include_sensitive,
    bytes: j.byte_size,
    errorCode: j.error_code,
    createdAt: j.created_at,
    expiresAt: j.expires_at,
  };
}
export async function formExportRoutes(
  request,
  response,
  { db, store, config, requestId },
) {
  const url = new URL(request.url, config.origin),
    match = url.pathname.match(
      /^\/api\/v1\/admin\/forms\/([^/]+)\/exports(?:\/([^/]+))?(?:\/(download))?$/,
    );
  if (!match) return false;
  const formId = parse(uuid, match[1]),
    recovering = match[2] === "recovery",
    jobId = match[2] && !recovering ? parse(uuid, match[2]) : null;
  allowMethod(
    request,
    response,
    recovering
      ? ["GET"]
      : match[3]
        ? ["POST"]
        : jobId
          ? ["GET", "DELETE"]
          : ["GET", "POST"],
  );
  if (recovering && match[3])
    throw new ApiError(400, "BAD_REQUEST", "Use the export recovery endpoint.");
  if (!recovering && [...url.searchParams].length)
    throw new ApiError(
      400,
      "BAD_REQUEST",
      "Export queries are supplied in the request body.",
    );
  const session = await requireSession(request, store, config);
  if (request.method !== "GET") await requireCsrf(request, session, store);
  const can = async (action) =>
    checked(
      await db.rpc("can_operate_form", {
        p_actor: session.user.id,
        p_form: formId,
        p_action: action,
      }),
    );
  if (
    !(await can("view")) ||
    !(await can("view_responses")) ||
    !(await can("export_responses"))
  )
    throw new ApiError(404, "NOT_FOUND", "This form is not available.");
  const canSensitive = await can("view_sensitive_responses");
  const ownJobs = () => {
    let q = db
      .from("form_export_jobs")
      .select(publicColumns)
      .eq("form_id", formId)
      .eq("requester_id", session.user.id)
      .eq("session_id", session.sessionId);
    if (!canSensitive) q = q.eq("include_sensitive", false);
    return q;
  };
  if (recovering) {
    const p = queryValues(
      url.searchParams,
      z
        .object({
          action: z.enum(["create", "cancel"]),
          job: uuid.optional(),
          sensitive: z.enum(["true", "false"]).default("false"),
        })
        .strict(),
    );
    if (
      (p.action === "create") !== (p.job === undefined) ||
      (p.action === "cancel" && p.sensitive === "true")
    )
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Choose the original export action and target.",
      );
    if (p.sensitive === "true" && !canSensitive)
      throw new ApiError(
        403,
        "FORBIDDEN",
        "Sensitive exports require a separate permission.",
      );
    const result = checked(
      await db.rpc("inspect_form_export_write", {
        p_actor: session.user.id,
        p_session: session.sessionId,
        p_form: formId,
        p_action: p.action,
        p_job: p.job || null,
        p_sensitive: p.sensitive === "true",
        p_key_hash: tokenHash(idempotency(request)),
        p_request_hash: null,
      }),
    );
    sendJson(
      response,
      200,
      {
        committed: result.committed,
        canRetry: result.canRetry,
        ...(result.receipt
          ? {
              receipt: {
                id: result.receipt.id,
                formId: result.receipt.formId,
                sourceId: result.receipt.sourceId,
                action: result.receipt.action,
              },
            }
          : {}),
        job: result.job ? exportJobDto(result.job) : null,
      },
      requestId,
    );
  } else if (!jobId && request.method === "POST") {
    const body = await jsonBody(request, formExportInput, 16384);
    if (body.sensitive && !canSensitive)
      throw new ApiError(
        403,
        "FORBIDDEN",
        "Sensitive exports require a separate permission.",
      );
    const record = checked(
      await db.rpc("mutate_form_export_write", {
        p_actor: session.user.id,
        p_session: session.sessionId,
        p_form: formId,
        p_action: "create",
        p_job: null,
        p_document: body,
        p_document_hash: tokenHash(JSON.stringify(body)),
        p_key_hash: tokenHash(idempotency(request)),
        p_request_hash: tokenHash(
          JSON.stringify({ formId, action: "create", jobId: null, body }),
        ),
        p_request_id: requestId,
      }),
    );
    sendJson(response, 200, { job: exportJobDto(record) }, requestId);
  } else if (match[3]) {
    await jsonBody(request, z.object({}).strict(), 1024);
    const artifact = checked(
      await db.rpc("form_export_download", {
        p_actor: session.user.id,
        p_session: session.sessionId,
        p_form: formId,
        p_job: jobId,
        p_request_id: requestId,
      }),
    );
    const storage = objectStorage();
    try {
      const link = await storage.downloadUrl(
        "form-exports",
        artifact.key,
        artifact.filename,
      );
      sendJson(response, 200, { url: link, expiresIn: 60 }, requestId);
    } finally {
      storage.close();
    }
  } else if (request.method === "DELETE") {
    const record = checked(
      await db.rpc("mutate_form_export_write", {
        p_actor: session.user.id,
        p_session: session.sessionId,
        p_form: formId,
        p_action: "cancel",
        p_job: jobId,
        p_document: {},
        p_document_hash: null,
        p_key_hash: tokenHash(idempotency(request)),
        p_request_hash: tokenHash(
          JSON.stringify({ formId, action: "cancel", jobId, body: {} }),
        ),
        p_request_id: requestId,
      }),
    );
    sendJson(
      response,
      200,
      { cancelled: true, job: exportJobDto(record) },
      requestId,
    );
  } else if (jobId) {
    const record = checked(await ownJobs().eq("id", jobId).maybeSingle());
    if (!record)
      throw new ApiError(404, "NOT_FOUND", "This export is not available.");
    sendJson(response, 200, { job: exportJobDto(record) }, requestId);
  } else {
    const records = checked(
      await ownJobs().order("created_at", { ascending: false }).limit(20),
    );
    sendJson(response, 200, { items: records.map(exportJobDto) }, requestId);
  }
  return true;
}
