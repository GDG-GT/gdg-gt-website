import { api } from "@/lib/api";
import type { Review, Member } from "./types";
export type MergeReceipt =
  | Review
  | { id: string; revision: number; sourceId: string };
export type MergeWriteIntent = {
  path: string;
  action: "preview" | "commit";
  body: string;
  key: string;
  startedAt: number;
  needsProof: boolean;
  sourceId: string;
  targetId: string;
  sourceRevision: number;
  targetRevision: number;
};
export type MergeInspection = {
  committed: boolean;
  canRetry: boolean;
  receipt: MergeReceipt | null;
};
export const mergeIntent = (
  action: "preview" | "commit",
  document: Record<string, unknown>,
  source: Member,
  target: Member,
): MergeWriteIntent =>
  Object.freeze({
    path:
      "/admin/members/" + (action === "preview" ? "merge-preview" : "merge"),
    action,
    body: JSON.stringify(document),
    key: crypto.randomUUID(),
    startedAt: Date.now(),
    needsProof: action === "commit",
    sourceId: source.id,
    targetId: target.id,
    sourceRevision: source.revision,
    targetRevision: target.revision,
  });
const memberShape = (v: Member) =>
  !!v &&
  ["name", "email", "category", "team_section", "reference"].every(
    (k) => typeof v[k as keyof Member] === "string",
  ) &&
  ["phone", "year", "major"].every(
    (k) =>
      v[k as keyof Member] === null || typeof v[k as keyof Member] === "string",
  ) &&
  Array.isArray(v.interests) &&
  v.interests.every((i) => typeof i === "string") &&
  typeof v.is_active === "boolean" &&
  typeof v.is_core_team === "boolean";
export function validMergeReceipt(
  value: MergeReceipt,
  intent: MergeWriteIntent,
) {
  if (!value) return false;
  if (intent.action === "preview") {
    const v = value as Review;
    return (
      typeof v.reviewId === "string" &&
      v.reviewId.length > 0 &&
      typeof v.reviewToken === "string" &&
      /^[a-zA-Z0-9_-]{43}$/.test(v.reviewToken) &&
      typeof v.expiresAt === "string" &&
      Date.parse(v.expiresAt) > Date.now() &&
      typeof v.policy === "string" &&
      memberShape(v.source) &&
      memberShape(v.target) &&
      v.source.id === intent.sourceId &&
      v.target.id === intent.targetId &&
      v.source.revision === intent.sourceRevision &&
      v.target.revision === intent.targetRevision
    );
  }
  const v = value as { id: string; revision: number; sourceId: string };
  return (
    v.id === intent.targetId &&
    v.sourceId === intent.sourceId &&
    Number.isInteger(v.revision) &&
    v.revision > intent.targetRevision
  );
}
export async function submitMergeWrite(
  intent: MergeWriteIntent,
  signal: AbortSignal,
  password?: string,
) {
  const value = await api<MergeReceipt>(intent.path, {
    method: "POST",
    protected: true,
    body: {
      ...JSON.parse(intent.body),
      ...(intent.needsProof ? { currentPassword: password } : {}),
    },
    idempotencyKey: intent.key,
    signal,
  });
  if (!validMergeReceipt(value, intent))
    throw Error(
      "The original merge request could not be confirmed. Check its outcome before making changes.",
    );
  return value;
}
export async function inspectMergeWrite(
  intent: MergeWriteIntent,
  signal: AbortSignal,
) {
  const value = await api<MergeInspection>(intent.path + "/recovery", {
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
      ? value.canRetry || !validMergeReceipt(value.receipt!, intent)
      : value.receipt !== null)
  )
    throw Error(
      "The original merge outcome could not be verified. Check it again before retrying.",
    );
  return value;
}
export const mergeRetryWindow = (intent: MergeWriteIntent) =>
  Date.now() >= intent.startedAt &&
  Date.now() - intent.startedAt < 47 * 60 * 60 * 1000;
