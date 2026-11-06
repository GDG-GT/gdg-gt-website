import { api, ApiFailure } from "@/lib/api";
export type DeliveryAccount = {
  id: string;
  display_name: string;
  role: string | null;
  eligible: boolean;
};
export type DeliveryPolicy = {
  formId: string;
  formRevision: number;
  revision: number;
  matchesDraft: boolean;
  editable: boolean;
  reviewedAt: string | null;
  receipts: boolean;
  receiptAnswers: boolean;
  notificationUsers: string[];
  chapterInbox: boolean;
  notificationAnswers: boolean;
  canReviewAnswers: boolean;
  mailReady: boolean;
  chapterInboxAvailable: boolean;
  selectedAccounts: DeliveryAccount[];
  reference: string;
};
export type DeliveryChoices = Pick<
  DeliveryPolicy,
  | "receipts"
  | "receiptAnswers"
  | "notificationUsers"
  | "chapterInbox"
  | "notificationAnswers"
>;
export type DeliveryIntent = {
  formId: string;
  path: string;
  body: string;
  key: string;
  startedAt: number;
  formRevision: number;
  policyRevision: number;
};
export type DeliveryInspection = {
  committed: boolean;
  canRetry: boolean;
  formId: string;
  formRevision: number;
  policyRevision: number;
  editable: boolean;
  selectedValid: boolean;
  canReviewAnswers: boolean;
  mailReady: boolean;
  chapterInboxAvailable: boolean;
  receipt: { formId: string; revision: number } | null;
};
export const deliveryChoices = (policy: DeliveryPolicy): DeliveryChoices => ({
  receipts: policy.receipts,
  receiptAnswers: policy.receiptAnswers,
  notificationUsers: [...policy.notificationUsers],
  chapterInbox: policy.chapterInbox,
  notificationAnswers: policy.notificationAnswers,
});
export function validDeliveryPolicy(
  policy: DeliveryPolicy | undefined,
  formId: string,
): policy is DeliveryPolicy {
  return (
    !!policy &&
    policy.formId === formId &&
    Number.isInteger(policy.formRevision) &&
    policy.formRevision >= 1 &&
    Number.isInteger(policy.revision) &&
    policy.revision >= 0 &&
    policy.reference === "DELIVERY " + formId &&
    [
      "receipts",
      "receiptAnswers",
      "chapterInbox",
      "notificationAnswers",
      "canReviewAnswers",
      "mailReady",
      "chapterInboxAvailable",
      "editable",
      "matchesDraft",
    ].every(
      (key) => typeof policy[key as keyof DeliveryPolicy] === "boolean",
    ) &&
    Array.isArray(policy.notificationUsers) &&
    policy.notificationUsers.length <= 10 &&
    new Set(policy.notificationUsers).size ===
      policy.notificationUsers.length &&
    policy.notificationUsers.every((id) => typeof id === "string" && !!id) &&
    Array.isArray(policy.selectedAccounts) &&
    policy.selectedAccounts.length === policy.notificationUsers.length &&
    new Set(policy.selectedAccounts.map((account) => account.id)).size ===
      policy.notificationUsers.length &&
    policy.selectedAccounts.every(
      (account) =>
        policy.notificationUsers.includes(account.id) &&
        typeof account.display_name === "string" &&
        typeof account.eligible === "boolean" &&
        (typeof account.role === "string" || account.role === null),
    )
  );
}
export function prepareDeliveryWrite(
  policy: DeliveryPolicy,
  draft: DeliveryChoices,
  confirmation: string,
  identityReady: boolean,
): DeliveryIntent {
  const wantsMail =
    draft.receipts || draft.notificationUsers.length > 0 || draft.chapterInbox;
  if (
    !validDeliveryPolicy(policy, policy.formId) ||
    !policy.editable ||
    confirmation !== policy.reference ||
    draft.notificationUsers.length > 10 ||
    new Set(draft.notificationUsers).size !== draft.notificationUsers.length ||
    policy.selectedAccounts.some(
      (account) =>
        !account.eligible && draft.notificationUsers.includes(account.id),
    ) ||
    (wantsMail && !policy.mailReady) ||
    (draft.chapterInbox && !policy.chapterInboxAvailable) ||
    ((draft.receiptAnswers || draft.notificationAnswers) &&
      !policy.canReviewAnswers) ||
    (draft.receipts && !identityReady) ||
    (draft.receiptAnswers && !draft.receipts)
  )
    throw new ApiFailure(
      409,
      "DELIVERY_REVIEW_CHANGED",
      "Recheck current delivery settings, selected recipients and the exact confirmation before reviewing.",
    );
  const body = {
    receipts: draft.receipts,
    receiptAnswers: draft.receiptAnswers,
    notificationUsers: [...draft.notificationUsers],
    chapterInbox: draft.chapterInbox,
    notificationAnswers: draft.notificationAnswers,
    formRevision: policy.formRevision,
    policyRevision: policy.revision,
    confirmation,
  };
  return Object.freeze({
    formId: policy.formId,
    path: "/admin/forms/" + policy.formId + "/delivery",
    body: JSON.stringify(body),
    key: crypto.randomUUID(),
    startedAt: Date.now(),
    formRevision: policy.formRevision,
    policyRevision: policy.revision,
  });
}
export async function submitDeliveryWrite(
  intent: DeliveryIntent,
  currentPassword: string,
  signal?: AbortSignal,
) {
  const result = await api<{ revision: number }>(intent.path, {
    method: "POST",
    protected: true,
    body: { ...JSON.parse(intent.body), currentPassword },
    idempotencyKey: intent.key,
    signal,
  });
  if (
    !result ||
    !Number.isInteger(result.revision) ||
    result.revision !== intent.policyRevision + 1
  )
    throw new ApiFailure(
      503,
      "UNCONFIRMED_DELIVERY",
      "The original delivery review outcome could not be verified. Check it before retrying.",
    );
  return result;
}
export async function inspectDeliveryWrite(
  intent: DeliveryIntent,
  signal?: AbortSignal,
) {
  const users = JSON.parse(intent.body).notificationUsers as string[],
    query = new URLSearchParams({ users: users.join(",") });
  const value = await api<DeliveryInspection>(
    intent.path + "/recovery?" + query,
    { idempotencyKey: intent.key, signal },
  );
  if (
    !value ||
    value.formId !== intent.formId ||
    !Number.isInteger(value.formRevision) ||
    value.formRevision < 1 ||
    !Number.isInteger(value.policyRevision) ||
    value.policyRevision < 0 ||
    [
      "committed",
      "canRetry",
      "editable",
      "selectedValid",
      "canReviewAnswers",
      "mailReady",
      "chapterInboxAvailable",
    ].some(
      (key) => typeof value[key as keyof DeliveryInspection] !== "boolean",
    ) ||
    (value.committed &&
      (!value.receipt ||
        value.receipt.formId !== intent.formId ||
        !Number.isInteger(value.receipt.revision) ||
        value.receipt.revision !== intent.policyRevision + 1))
  )
    throw new ApiFailure(
      503,
      "UNCONFIRMED_DELIVERY",
      "The original delivery outcome did not match this review. Recheck before retrying.",
    );
  return value;
}
export function deliveryRetryReady(
  intent: DeliveryIntent,
  value?: DeliveryInspection,
) {
  if (
    !value ||
    value.committed ||
    !value.canRetry ||
    !value.editable ||
    !value.selectedValid ||
    value.formRevision !== intent.formRevision ||
    value.policyRevision !== intent.policyRevision
  )
    return false;
  const document = JSON.parse(intent.body) as DeliveryChoices;
  return (
    (!(
      document.receipts ||
      document.notificationUsers.length ||
      document.chapterInbox
    ) ||
      value.mailReady) &&
    (!document.chapterInbox || value.chapterInboxAvailable) &&
    (!(document.receiptAnswers || document.notificationAnswers) ||
      value.canReviewAnswers)
  );
}
