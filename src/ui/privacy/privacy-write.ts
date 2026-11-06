import { api } from "@/lib/api";
export type PrivacyRecord = {
  kind: string;
  id: string;
  parentId: string | null;
  held: boolean;
  source: string;
  label: string;
};
export type PrivacyReview = {
  reviewId: string;
  reviewToken: string;
  action: string;
  expiresAt: string;
  count: number;
  heldCount: number;
  records: PrivacyRecord[];
};
export type PrivacyResult = {
  action: string;
  count: number;
  pendingFiles?: number;
  pendingExports?: number;
  remainingMatches?: number;
  export?: unknown[];
  downloadExpired?: boolean;
};
export type PrivacyReceipt = PrivacyReview | PrivacyResult;
export type PrivacyIntent = {
  path: string;
  action: "review" | "commit";
  body: string;
  key: string;
  startedAt: number;
  needsProof: true;
  requestedAction: string;
  count?: number;
};
export type PrivacyInspection = {
  committed: boolean;
  canRetry: boolean;
  receipt: PrivacyReceipt | null;
};
export const privacyIntent = (
  action: "review" | "commit",
  document: Record<string, unknown>,
  requestedAction: string,
  count?: number,
): PrivacyIntent =>
  Object.freeze({
    path: "/admin/privacy/" + action,
    action,
    body: JSON.stringify(document),
    key: crypto.randomUUID(),
    startedAt: Date.now(),
    needsProof: true,
    requestedAction,
    count,
  });
const natural = (n: unknown) => Number.isInteger(n) && Number(n) >= 0;
export function validPrivacyReceipt(
  value: PrivacyReceipt,
  intent: PrivacyIntent,
  inspection = false,
) {
  if (
    !value ||
    value.action !== intent.requestedAction ||
    !natural(value.count) ||
    value.count > 500
  )
    return false;
  if (intent.action === "review") {
    const v = value as PrivacyReview;
    return (
      typeof v.reviewId === "string" &&
      v.reviewId.length > 0 &&
      typeof v.reviewToken === "string" &&
      /^[A-Za-z0-9_-]{43}$/.test(v.reviewToken) &&
      typeof v.expiresAt === "string" &&
      Date.parse(v.expiresAt) > Date.now() &&
      natural(v.heldCount) &&
      v.heldCount <= v.count &&
      Array.isArray(v.records) &&
      v.records.length === v.count &&
      v.records.every(
        (r) =>
          !!r &&
          ["kind", "id", "source", "label"].every(
            (k) => typeof r[k as keyof PrivacyRecord] === "string",
          ) &&
          (r.parentId === null || typeof r.parentId === "string") &&
          typeof r.held === "boolean",
      ) &&
      v.records.filter((r) => r.held).length === v.heldCount
    );
  }
  const v = value as PrivacyResult;
  return (
    v.count === intent.count &&
    ["pendingFiles", "pendingExports", "remainingMatches"].every(
      (k) =>
        v[k as keyof PrivacyResult] === undefined ||
        natural(v[k as keyof PrivacyResult]),
    ) &&
    (!inspection || !("export" in v)) &&
    (v.action !== "export" ||
      v.downloadExpired === true ||
      (!inspection && Array.isArray(v.export) && v.export.length === v.count))
  );
}
export async function submitPrivacyWrite(
  intent: PrivacyIntent,
  signal: AbortSignal,
  password?: string,
) {
  const value = await api<PrivacyReceipt>(intent.path, {
    method: "POST",
    protected: true,
    body: { ...JSON.parse(intent.body), currentPassword: password },
    idempotencyKey: intent.key,
    signal,
  });
  if (!validPrivacyReceipt(value, intent))
    throw Error(
      "The original privacy request could not be confirmed. Check its outcome before making changes.",
    );
  return value;
}
export async function inspectPrivacyWrite(
  intent: PrivacyIntent,
  signal: AbortSignal,
) {
  const value = await api<PrivacyInspection>(intent.path + "/recovery", {
    method: "POST",
    protected: true,
    body: JSON.parse(intent.body),
    idempotencyKey: intent.key,
    signal,
  });
  if (
    !value ||
    typeof value.committed !== "boolean" ||
    typeof value.canRetry !== "boolean" ||
    (value.committed
      ? value.canRetry || !validPrivacyReceipt(value.receipt!, intent, true)
      : value.receipt !== null)
  )
    throw Error(
      "The original privacy outcome could not be verified. Check it again before retrying.",
    );
  return value;
}
export const privacyRetryWindow = (intent: PrivacyIntent) =>
  Date.now() >= intent.startedAt &&
  Date.now() - intent.startedAt < 47 * 60 * 60 * 1000;
