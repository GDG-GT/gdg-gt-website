import { api } from "@/lib/api";
export type RespondentWriteAction = "submissions" | "edits" | "drafts";
export type RespondentWriteIntent = {
  slug: string;
  action: RespondentWriteAction;
  body: string;
  key: string;
  startedAt: number;
  protected: boolean;
  responseId?: string;
};
export type RespondentWriteReceipt = {
  responseId?: string;
  revision?: number;
  submittedAt?: string;
  editToken?: string;
  copyQueued?: boolean;
  expiresAt?: string;
  createdAt?: string;
  resumeToken?: string;
};
export type RespondentWriteInspection = {
  committed: boolean;
  canRetry: boolean;
  currentRevision?: number;
  receipt: RespondentWriteReceipt | null;
};
const positive = (n: unknown) => Number.isInteger(n) && (n as number) >= 1,
  text = (v: unknown) => typeof v === "string" && v.length > 0,
  time = (v: unknown) =>
    typeof v === "string" && Number.isFinite(Date.parse(v));
export function validRespondentReceipt(
  intent: RespondentWriteIntent,
  value: RespondentWriteReceipt,
  recovery = false,
) {
  if (!value) return false;
  const body = JSON.parse(intent.body);
  if (intent.action === "drafts")
    return (
      positive(value.revision) &&
      value.revision! > body.draftRevision &&
      time(value.expiresAt) &&
      (recovery
        ? time(value.createdAt)
        : value.resumeToken === body.resumeToken)
    );
  return (
    text(value.responseId) &&
    (!intent.responseId || value.responseId === intent.responseId) &&
    typeof value.copyQueued === "boolean" &&
    (intent.action !== "edits" ||
      (positive(value.revision) && value.revision! > body.revision)) &&
    (value.editToken === undefined ||
      /^[A-Za-z0-9_-]{43}$/.test(value.editToken))
  );
}
export function prepareRespondentWrite(
  slug: string,
  action: RespondentWriteAction,
  body: Record<string, unknown>,
  authenticated: boolean,
  responseId?: string,
): RespondentWriteIntent {
  return Object.freeze({
    slug,
    action,
    body: JSON.stringify(body),
    key: crypto.randomUUID(),
    startedAt: Date.now(),
    protected: authenticated,
    responseId,
  });
}
export async function submitRespondentWrite(
  intent: RespondentWriteIntent,
  signal: AbortSignal,
) {
  const value = await api<RespondentWriteReceipt>(
    `/forms/${intent.slug}/${intent.action}`,
    {
      method: "POST",
      body: JSON.parse(intent.body),
      idempotencyKey: intent.key,
      signal,
      protected: intent.protected,
    },
  );
  if (!validRespondentReceipt(intent, value))
    throw Error(
      "The server reply could not confirm the original form request. Check its original outcome before continuing.",
    );
  return value;
}
export async function inspectRespondentWrite(
  intent: RespondentWriteIntent,
  signal: AbortSignal,
) {
  const value = await api<RespondentWriteInspection>(
    `/forms/${intent.slug}/${intent.action}/recovery`,
    {
      method: "POST",
      body: JSON.parse(intent.body),
      idempotencyKey: intent.key,
      signal,
      protected: intent.protected,
    },
  );
  if (
    !value ||
    typeof value.committed !== "boolean" ||
    typeof value.canRetry !== "boolean" ||
    (value.committed
      ? value.canRetry ||
        !value.receipt ||
        !validRespondentReceipt(intent, value.receipt, true)
      : value.receipt !== null) ||
    (intent.action !== "submissions" &&
      (!Number.isInteger(value.currentRevision) || value.currentRevision! < 0))
  )
    throw Error(
      "The original form outcome could not be verified. Check it again before retrying.",
    );
  return value;
}
export const respondentRetryWindow = (intent: RespondentWriteIntent) =>
  Date.now() >= intent.startedAt &&
  Date.now() - intent.startedAt < 47 * 60 * 60 * 1000;
