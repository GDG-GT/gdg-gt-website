import { api, ApiFailure } from "@/lib/api";
import type { FormResponse } from "./store";
export type ResponseAction = "delete" | "redact";
export type ResponseIntent = {
  formId: string;
  responseId: string;
  action: ResponseAction;
  body: string;
  key: string;
  startedAt: number;
  description: string;
};
export type ResponseMetadata = {
  id: string;
  revision: number;
  status: string;
  redacted: boolean;
  deleted: boolean;
};
export type ResponseInspection = {
  committed: boolean;
  canRetry: boolean;
  held?: boolean;
  receipt?: { id: string; formId: string; action: ResponseAction };
  response: ResponseMetadata;
};
export function reviewableResponse(row: FormResponse) {
  return (
    typeof row.id === "string" &&
    !!row.id &&
    Number.isInteger(row.revision) &&
    row.revision! >= 0 &&
    ["complete", "redacted", "held"].includes(row.status || "") &&
    typeof row.redacted === "boolean"
  );
}
export function prepareResponseWrite(
  formId: string,
  row: FormResponse,
  action: ResponseAction,
  confirmation: string,
): ResponseIntent {
  if (!reviewableResponse(row))
    throw new ApiFailure(
      409,
      "STALE_RESPONSE",
      "Reload the current response before reviewing a privacy action.",
    );
  if (confirmation !== action.toUpperCase())
    throw new ApiFailure(
      400,
      "VALIDATION_ERROR",
      "Type the displayed response action exactly.",
    );
  return Object.freeze({
    formId,
    responseId: row.id,
    action,
    body: JSON.stringify({
      revision: row.revision,
      status: row.status,
      redacted: row.redacted,
      confirmation,
      ...(action === "redact" ? { action } : {}),
    }),
    key: crypto.randomUUID(),
    startedAt: Date.now(),
    description: `${action === "delete" ? "Delete" : "Redact identity in"} response ${row.id}, published form version ${row.version}, response revision ${row.revision}. ${action === "delete" ? "Answer values and their revision history are permanently removed; the audit record remains." : "Identity and sensitive values in current and historical answers are permanently replaced; the audit record remains."}`,
  });
}
function verified(
  result: unknown,
  intent: ResponseIntent,
): result is ResponseInspection {
  if (!result || typeof result !== "object") return false;
  const v = result as ResponseInspection,
    r = v.response;
  return (
    typeof v.committed === "boolean" &&
    typeof v.canRetry === "boolean" &&
    (v.committed || typeof v.held === "boolean") &&
    !!r &&
    r.id === intent.responseId &&
    Number.isInteger(r.revision) &&
    r.revision >= 0 &&
    ["complete", "redacted", "held", "deleted"].includes(r.status) &&
    typeof r.redacted === "boolean" &&
    typeof r.deleted === "boolean" &&
    (!v.committed ||
      (!!v.receipt &&
        v.receipt.id === intent.responseId &&
        v.receipt.formId === intent.formId &&
        v.receipt.action === intent.action &&
        (intent.action === "delete" ? r.deleted : r.redacted || r.deleted)))
  );
}
const unconfirmed = () =>
  new ApiFailure(
    503,
    "UNCONFIRMED_RESPONSE_ACTION",
    "The response action result could not be verified. Check the original outcome before retrying.",
  );
export async function submitResponseWrite(
  intent: ResponseIntent,
  signal?: AbortSignal,
) {
  const result = await api<ResponseInspection>(
    `/admin/forms/${intent.formId}/responses/${intent.responseId}`,
    {
      method: intent.action === "delete" ? "DELETE" : "PATCH",
      protected: true,
      body: JSON.parse(intent.body),
      idempotencyKey: intent.key,
      signal,
    },
  );
  if (!verified(result, intent) || !result.committed) throw unconfirmed();
  return result;
}
export async function inspectResponseWrite(
  intent: ResponseIntent,
  signal?: AbortSignal,
) {
  const result = await api<ResponseInspection>(
    `/admin/forms/${intent.formId}/responses/${intent.responseId}/recovery?action=${intent.action}`,
    { idempotencyKey: intent.key, signal },
  );
  if (!verified(result, intent)) throw unconfirmed();
  return result;
}
export function responseRetryReady(
  intent: ResponseIntent,
  result: ResponseInspection | undefined,
) {
  if (
    !result ||
    result.committed ||
    !result.canRetry ||
    result.held ||
    result.response.deleted
  )
    return false;
  const body = JSON.parse(intent.body);
  return (
    result.response.revision === body.revision &&
    result.response.status === body.status &&
    result.response.redacted === body.redacted
  );
}
