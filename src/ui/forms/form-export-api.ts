import { api, ApiFailure } from "@/lib/api";
export type ExportJob = {
  id: string;
  format: "csv" | "xlsx" | "json";
  state: "pending" | "running" | "ready" | "failed" | "cancelled" | "expired";
  count: number;
  sensitive: boolean;
  bytes: number | null;
  errorCode: string | null;
  createdAt: string;
  expiresAt: string;
};
export type ExportRequest = {
  format: ExportJob["format"];
  filters: Record<string, string>;
  selected: string[];
  columns: string[];
  sensitive: boolean;
};
export type ExportIntent = {
  formId: string;
  action: "create" | "cancel";
  jobId: string | null;
  body: string;
  key: string;
  startedAt: number;
  description: string;
  sensitive: boolean;
};
export function validExportJob(value: unknown): value is ExportJob {
  if (!value || typeof value !== "object") return false;
  const j = value as ExportJob;
  return (
    typeof j.id === "string" &&
    !!j.id &&
    j.id.length <= 100 &&
    ["csv", "xlsx", "json"].includes(j.format) &&
    ["pending", "running", "ready", "failed", "cancelled", "expired"].includes(
      j.state,
    ) &&
    Number.isInteger(j.count) &&
    j.count >= 0 &&
    j.count <= 20000 &&
    typeof j.sensitive === "boolean" &&
    (j.bytes === null || (Number.isSafeInteger(j.bytes) && j.bytes >= 0)) &&
    (j.errorCode === null || typeof j.errorCode === "string") &&
    typeof j.createdAt === "string" &&
    Number.isFinite(Date.parse(j.createdAt)) &&
    typeof j.expiresAt === "string" &&
    Number.isFinite(Date.parse(j.expiresAt))
  );
}
export function prepareExportCreation(
  formId: string,
  request: ExportRequest,
): ExportIntent {
  const filters = Object.fromEntries(
      Object.entries(request.filters).filter(([key]) =>
        ["q", "version", "from", "to", "status"].includes(key),
      ),
    ),
    selected = [...new Set(request.selected)],
    columns = [...new Set(request.columns)];
  return Object.freeze({
    formId,
    action: "create",
    jobId: null,
    body: JSON.stringify({
      format: request.format,
      filters: { ...filters, ...(selected.length ? { selected } : {}) },
      ...(columns.length ? { columns } : {}),
      sensitive: request.sensitive,
    }),
    key: crypto.randomUUID(),
    startedAt: Date.now(),
    sensitive: request.sensitive,
    description: `${request.format.toUpperCase()} for ${selected.length ? `${selected.length} selected responses matching the original filters` : "all responses matching the original filters"}, with ${columns.length ? `${columns.length} selected answer columns` : "all permitted answer columns"}. ${request.sensitive ? "Sensitive answers included." : "Sensitive answers excluded."}`,
  });
}
export function prepareExportCancellation(
  formId: string,
  job: ExportJob,
): ExportIntent {
  return Object.freeze({
    formId,
    action: "cancel",
    jobId: job.id,
    body: "{}",
    key: crypto.randomUUID(),
    startedAt: Date.now(),
    sensitive: false,
    description: `Remove ${job.format.toUpperCase()} export ${job.id}, containing ${job.count} responses. Source responses stay unchanged. Previously issued links can remain usable for up to 60 seconds.`,
  });
}
function matchesCommittedIntent(intent: ExportIntent, job: ExportJob) {
  if (intent.action === "cancel")
    return (
      job.id === intent.jobId && ["cancelled", "expired"].includes(job.state)
    );
  const body = JSON.parse(intent.body);
  return job.format === body.format && job.sensitive === body.sensitive;
}
const unconfirmed = () =>
  new ApiFailure(
    503,
    "UNCONFIRMED_EXPORT",
    "The export result could not be verified. Recheck the original change before retrying.",
  );
export async function submitExportWrite(
  intent: ExportIntent,
  signal?: AbortSignal,
) {
  const result = await api<{ job: ExportJob }>(
    `/admin/forms/${intent.formId}/exports${intent.jobId ? "/" + intent.jobId : ""}`,
    {
      method: intent.action === "create" ? "POST" : "DELETE",
      protected: true,
      idempotencyKey: intent.key,
      body: JSON.parse(intent.body),
      signal,
    },
  );
  if (
    !validExportJob(result?.job) ||
    !matchesCommittedIntent(intent, result.job)
  )
    throw unconfirmed();
  return result.job;
}
export async function inspectExportWrite(
  intent: ExportIntent,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({
      action: intent.action,
      ...(intent.jobId ? { job: intent.jobId } : {}),
      ...(intent.sensitive ? { sensitive: "true" } : {}),
    }),
    result = await api<{
      committed: boolean;
      canRetry: boolean;
      receipt?: {
        id: string;
        formId: string;
        sourceId: string | null;
        action: string;
      };
      job: ExportJob | null;
    }>(`/admin/forms/${intent.formId}/exports/recovery?${query}`, {
      signal,
      idempotencyKey: intent.key,
    });
  if (
    !result ||
    typeof result.committed !== "boolean" ||
    typeof result.canRetry !== "boolean" ||
    (result.job !== null && !validExportJob(result.job)) ||
    (intent.jobId && result.job?.id !== intent.jobId) ||
    (result.committed &&
      (!result.job ||
        !matchesCommittedIntent(intent, result.job) ||
        result.receipt?.id !== result.job.id ||
        result.receipt.formId !== intent.formId ||
        result.receipt.sourceId !== intent.jobId ||
        result.receipt.action !== intent.action))
  )
    throw unconfirmed();
  return result;
}
