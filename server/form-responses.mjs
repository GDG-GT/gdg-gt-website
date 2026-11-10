import { choiceSelection } from "../shared/form-choice.ts";
import { orderedFormFields } from "../shared/forms.ts";
import { z } from "zod";
import { requireSession, requireCsrf } from "./auth.mjs";
import { ApiError, allowMethod, jsonBody, sendJson } from "./lib/http.mjs";
import {
  databaseResult as checked,
  parse,
  queryValues,
  uuid,
  text,
  idempotency,
} from "./lib/validation.mjs";
import { tokenHash } from "./lib/security.mjs";
import { formViewOperation } from "./form-views.mjs";
import { responseCsv, responseXlsx, safeCell } from "../shared/form-export.ts";
export const formResponseFilterShape = {
  q: text(100).optional(),
  version: z.coerce.number().int().min(1).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  status: z.enum(["complete", "redacted", "held"]).optional(),
};
const filterShape = formResponseFilterShape;
const pagination = {
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
};
const filters = z.object(filterShape).strict();
const responseWriteShape = {
  revision: z.number().int().min(0).max(2147483647),
  status: z.enum(["complete", "redacted", "held"]),
  redacted: z.boolean(),
};
export const responseDeleteInput = z
  .object({ ...responseWriteShape, confirmation: z.literal("DELETE") })
  .strict();
export const responseRedactInput = z
  .object({
    ...responseWriteShape,
    confirmation: z.literal("REDACT"),
    action: z.literal("redact"),
  })
  .strict();
function responseWriteDto(value) {
  return {
    committed: value.committed,
    canRetry: value.canRetry,
    ...(typeof value.held === "boolean" ? { held: value.held } : {}),
    ...(value.receipt
      ? {
          receipt: {
            id: value.receipt.id,
            formId: value.receipt.formId,
            action: value.receipt.action,
          },
        }
      : {}),
    response: {
      id: value.response.id,
      revision: value.response.revision,
      status: value.response.status,
      redacted: value.response.redacted,
      deleted: value.response.deleted,
    },
  };
}

function assertDateRange(p) {
  if (p.from && p.to && new Date(p.from) > new Date(p.to))
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "The end date must follow the start date.",
    );
}
export function summarizeResponses(items, versions) {
  const summaries = [];
  for (const version of versions)
    for (const field of orderedFormFields(version.definition.fields, version.definition.sections)) {
      if (
        field.sensitive ||
        ["title", "description", "image", "divider"].includes(field.type)
      )
        continue;
      const values = items
        .filter(
          (r) =>
            r.version === version.version &&
            r.answers[field.id] !== undefined &&
            r.answers[field.id] !== "[Identity redacted]",
        )
        .map((r) => r.answers[field.id]);
      const counts = {};
      const add = (value) => {
        if (
          field.options.includes(value) ||
          field.columns?.includes(value) ||
          ["Agreed"].includes(value)
        )
          counts[value] = (counts[value] || 0) + 1;
      };
      if (["radio", "dropdown", "checkbox", "consent"].includes(field.type))
        for (const value of values) {
          const selected = choiceSelection(value);
          for (const v of Array.isArray(selected) ? selected : [selected]) add(v);
        }
      const numbers = ["number", "rating", "scale"].includes(field.type)
        ? values.map(Number).filter(Number.isFinite)
        : [];
      const grid = {};
      if (["likert", "grid"].includes(field.type))
        for (const row of field.options) {
          grid[row] = {};
          for (const value of values) {
            const answer = value[row];
            for (const column of Array.isArray(answer) ? answer : [answer])
              if (
                (field.columns || ["Disagree", "Neutral", "Agree"]).includes(
                  column,
                )
              )
                grid[row][column] = (grid[row][column] || 0) + 1;
          }
        }
      const ranking = {};
      if (field.type === "ranking")
        for (const option of field.options) {
          const positions = values
            .filter(Array.isArray)
            .map((v) => v.indexOf(option) + 1)
            .filter((v) => v > 0);
          ranking[option] = positions.length
            ? positions.reduce((a, b) => a + b, 0) / positions.length
            : null;
        }
      summaries.push({
        fieldId: field.id,
        label: field.label,
        type: field.type,
        version: version.version,
        answered: values.length,
        counts,
        grid,
        ranking,
        ...(numbers.length
          ? {
              numeric: {
                count: numbers.length,
                mean: numbers.reduce((a, b) => a + b, 0) / numbers.length,
                min: Math.min(...numbers),
                max: Math.max(...numbers),
              },
            }
          : {}),
      });
    }
  return { responseCount: items.length, fields: summaries };
}
export async function formResponseRoutes(
  request,
  response,
  { db, store, config, requestId },
) {
  const url = new URL(request.url, config.origin),
    match = url.pathname.match(
      /^\/api\/v1\/admin\/forms\/([^/]+)\/(responses|analytics|views)(?:\/([^/]+))?(?:\/(recovery))?$/,
    );
  if (!match) return false;
  const id = parse(uuid, match[1]),
    operation = match[2],
    child = match[3],
    exported = operation === "responses" && child === "export",
    recovering = match[4] === "recovery";
  if (
    recovering &&
    ((operation !== "responses" && operation !== "views") ||
      !child ||
      exported ||
      child === "recovery")
  )
    throw new ApiError(404, "NOT_FOUND", "This record was not found.");
  allowMethod(
    request,
    response,
    recovering || (operation === "views" && child === "recovery")
      ? ["GET"]
      : operation === "views"
        ? child
          ? ["PATCH", "DELETE"]
          : ["GET", "POST"]
        : operation === "responses" && child && !exported
          ? ["GET", "PATCH", "DELETE"]
          : ["GET"],
  );
  const session = await requireSession(request, store, config);
  if (request.method !== "GET") await requireCsrf(request, session, store);
  const can = async (action) =>
    checked(
      await db.rpc("can_operate_form", {
        p_actor: session.user.id,
        p_form: id,
        p_action: action,
      }),
    );
  if (!(await can("view")) || !(await can("view_responses")))
    throw new ApiError(404, "NOT_FOUND", "This form is not available.");
  if (operation === "views")
    return formViewOperation(request, response, {
      db,
      session,
      id,
      child,
      recovering,
      url,
      requestId,
    });
  if (recovering) {
    const p = queryValues(
      url.searchParams,
      z.object({ action: z.enum(["delete", "redact"]) }).strict(),
    );
    if (!(await can("delete")))
      throw new ApiError(404, "NOT_FOUND", "This response is not available.");
    const result = checked(
      await db.rpc("inspect_form_response_write", {
        p_actor: session.user.id,
        p_session: session.sessionId,
        p_form: id,
        p_response: parse(uuid, child),
        p_action: p.action,
        p_key_hash: tokenHash(idempotency(request)),
        p_request_hash: null,
      }),
    );
    sendJson(response, 200, responseWriteDto(result), requestId);
    return true;
  }
  const form = checked(
    await db.from("forms").select("slug,settings,state").eq("id", id).single(),
  );
  if (child && !exported && request.method !== "GET") {
    const responseId = parse(uuid, child);
    if (!(await can("delete")))
      throw new ApiError(404, "NOT_FOUND", "This response is not available.");
    queryValues(url.searchParams, z.object({}).strict());
    const action = request.method === "DELETE" ? "delete" : "redact",
      body = await jsonBody(
        request,
        action === "delete" ? responseDeleteInput : responseRedactInput,
        2048,
      ),
      { revision, status, redacted, confirmation } = body,
      result = checked(
        await db.rpc("mutate_form_response_write", {
          p_actor: session.user.id,
          p_session: session.sessionId,
          p_form: id,
          p_response: responseId,
          p_action: action,
          p_document: { revision, status, redacted, confirmation },
          p_key_hash: tokenHash(idempotency(request)),
          p_request_hash: tokenHash(
            JSON.stringify({ formId: id, responseId, action, body }),
          ),
          p_request_id: requestId,
        }),
      );
    sendJson(
      response,
      200,
      { updated: true, ...responseWriteDto(result) },
      requestId,
    );
    return true;
  }
  const p = queryValues(
    url.searchParams,
    z
      .object({
        ...filterShape,
        ...pagination,
        sensitive: z.enum(["true", "false"]).optional(),
        ...(exported
          ? {
              format: z.enum(["csv", "xlsx", "json"]).default("csv"),
              selected: z.string().max(4000).optional(),
              columns: z.string().max(8000).optional(),
            }
          : {}),
      })
      .strict(),
  );
  assertDateRange(p);
  const canSensitive = await can("view_sensitive_responses"),
    sensitive = p.sensitive === undefined ? !!canSensitive : p.sensitive === "true";
  if (sensitive && !canSensitive)
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Sensitive answers require a separate permission.",
    );
  if (exported && !(await can("export_responses")))
    throw new ApiError(403, "FORBIDDEN", "You do not have export permission.");
  const scopedFilters = {
    ...parse(
      filters,
      Object.fromEntries(
        Object.entries(p).filter(([key]) => key in filterShape),
      ),
    ),
    ...(child && !exported ? { id: parse(uuid, child) } : {}),
    ...(p.selected
      ? {
          selected: parse(z.array(uuid).min(1).max(100), p.selected.split(",")),
        }
      : {}),
  };
  const read = async (page = 1, size = 100) =>
    checked(
      await db.rpc("read_form_responses", {
        p_actor: session.user.id,
        p_form: id,
        p_page: page,
        p_size: size,
        p_filters: scopedFilters,
        p_sensitive: sensitive,
      }),
    );
  if (!exported && operation !== "analytics") {
    const result = await read(p.page, p.pageSize);
    if (child && !result.items.length)
      throw new ApiError(404, "NOT_FOUND", "This response was not found.");
    await store.audit({
      actorId: session.user.id,
      action: sensitive ? "forms.sensitive_viewed" : "forms.responses_viewed",
      targetType: "form",
      targetId: id,
      requestId,
      metadata: {
        filterHash: tokenHash(JSON.stringify(scopedFilters)),
        count: result.items.length,
        responseId: child || null,
      },
    });
    sendJson(response, 200, result, requestId);
    return true;
  }
  const first = await read(1, 1),
    limit = exported ? 1000 : 10000;
  if (first.total > limit)
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      `Narrow your filters to ${limit.toLocaleString()} responses or fewer for this ${exported ? "download" : "summary"}.`,
    );
  const items = [];
  let bytes = 0;
  for (let page = 1; items.length < first.total; page++) {
    const result = await read(page, 100);
    if (!result.items.length) break;
    bytes += Buffer.byteLength(JSON.stringify(result.items));
    if (bytes > 16 * 1024 * 1024)
      throw new ApiError(
        413,
        "PAYLOAD_TOO_LARGE",
        "Narrow your filters to a smaller response set.",
      );
    items.push(...result.items);
  }
  const versions = checked(
    await db
      .from("form_versions")
      .select("version,definition")
      .eq("form_id", id)
      .order("version"),
  );
  const auditResult = () =>
    store.audit({
      actorId: session.user.id,
      action: exported
        ? sensitive
          ? "forms.sensitive_exported"
          : "forms.responses_exported"
        : "forms.analytics_viewed",
      targetType: "form",
      targetId: id,
      requestId,
      metadata: {
        filterHash: tokenHash(JSON.stringify(scopedFilters)),
        count: items.length,
        ...(exported ? { format: p.format } : {}),
      },
    });
  if (!exported) {
    await auditResult();
    sendJson(response, 200, summarizeResponses(items, versions), requestId);
    return true;
  }
  const columns = p.columns
    ? parse(z.array(uuid).max(200), p.columns.split(","))
    : null;
  const rows = items.map((r) => {
    const version = versions.find((v) => v.version === r.version);
    return {
      formId: id,
      version: r.version,
      responseId: r.id,
      submittedAt: r.submittedAt,
      completionState: r.status,
      respondentName: r.respondent?.name ?? "",
      respondentEmail: r.respondent?.email ?? "",
      respondentSource: r.respondent?.source || "legacy_unknown",
      ...Object.fromEntries(
        Object.entries(r.answers)
          .filter(([field]) => !columns || columns.includes(field))
          .map(([field, value]) => [
            `${version.definition.fields.find((f) => f.id === field)?.label || field} [${field}] v${r.version}`,
            value,
          ]),
      ),
    };
  });
  if (
    p.format === "xlsx" &&
    rows.some((row) =>
      Object.entries(row).some(
        ([key, value]) => key.length > 32767 || safeCell(value).length > 32767,
      ),
    )
  )
    throw new ApiError(
      413,
      "PAYLOAD_TOO_LARGE",
      "A cell exceeds Excel's text limit. Use CSV or JSON instead.",
    );
  const content =
    p.format === "xlsx"
      ? responseXlsx(rows)
      : p.format === "json"
        ? JSON.stringify(rows, null, 2)
        : "\uFEFF" + responseCsv(rows);
  // Keep lightweight API responses below the serverless transport ceiling.
  // Background exports use private object storage instead of this response.
  if (Buffer.byteLength(content) > 3 * 1024 * 1024)
    throw new ApiError(
      413,
      "PAYLOAD_TOO_LARGE",
      "Use a background export for this response set.",
    );
  await auditResult();
  response.statusCode = 200;
  response.setHeader(
    "Content-Type",
    p.format === "xlsx"
      ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      : p.format === "json"
        ? "application/json; charset=utf-8"
        : "text/csv; charset=utf-8",
  );
  response.setHeader(
    "Content-Disposition",
    `attachment; filename="${form.slug}-responses.${p.format}"`,
  );
  response.end(content);
  return true;
}
