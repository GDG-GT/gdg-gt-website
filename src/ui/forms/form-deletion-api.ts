import { api, ApiFailure } from "@/lib/api";
export type DeletionState = {
  formId: string;
  revision: number;
  archived: boolean;
  purged: boolean;
  formHeld: boolean;
  heldResponses: number;
  unexpiredResponses: number;
  retainedResponses: number;
  activeReferences: number;
  drafts: number;
  filesAwaitingCleanup: number;
  exportsAwaitingCleanup: number;
  activeExports: number;
  publishedVersions: number;
};
export type DeletionReview = {
  reviewId: string;
  reviewToken: string;
  expiresAt: string;
  state: DeletionState;
};
export type DeletionIntent = {
  formId: string;
  reviewId: string;
  body: string;
  key: string;
  startedAt: number;
  reviewExpiresAt: string;
};
export type DeletionInspection = {
  formId: string;
  reviewId: string;
  committed: boolean;
  canRetry: boolean;
  revision: number;
  reviewExpiresAt: string | null;
  receipt: { formId: string; reviewId: string; deleted: true } | null;
};
export const deletionEligible = (s?: DeletionState) =>
  !!s &&
  s.archived &&
  !s.purged &&
  !s.formHeld &&
  !s.heldResponses &&
  !s.unexpiredResponses &&
  !s.activeReferences;
export function validDeletionState(
  s: DeletionState | undefined,
  formId: string,
): s is DeletionState {
  return (
    !!s &&
    s.formId === formId &&
    Number.isInteger(s.revision) &&
    s.revision >= 1 &&
    ["archived", "purged", "formHeld"].every(
      (k) => typeof s[k as keyof DeletionState] === "boolean",
    ) &&
    [
      "heldResponses",
      "unexpiredResponses",
      "retainedResponses",
      "activeReferences",
      "drafts",
      "filesAwaitingCleanup",
      "exportsAwaitingCleanup",
      "activeExports",
      "publishedVersions",
    ].every(
      (k) =>
        Number.isInteger(s[k as keyof DeletionState]) &&
        (s[k as keyof DeletionState] as number) >= 0,
    )
  );
}
export function prepareDeletionWrite(
  formId: string,
  review: DeletionReview,
): DeletionIntent {
  if (
    !validDeletionState(review.state, formId) ||
    !deletionEligible(review.state) ||
    !review.reviewId ||
    !review.reviewToken ||
    !Number.isFinite(Date.parse(review.expiresAt)) ||
    Date.parse(review.expiresAt) <= Date.now()
  )
    throw new ApiFailure(
      409,
      "FORM_DELETION_REVIEW",
      "Obtain a current eligible deletion review before continuing.",
    );
  return Object.freeze({
    formId,
    reviewId: review.reviewId,
    reviewExpiresAt: review.expiresAt,
    key: crypto.randomUUID(),
    startedAt: Date.now(),
    body: JSON.stringify({
      revision: review.state.revision,
      reviewId: review.reviewId,
      reviewToken: review.reviewToken,
      confirmation: `DELETE FORM ${formId}`,
      exportWarningAcknowledged: true,
    }),
  });
}
const unconfirmed = () =>
  new ApiFailure(
    503,
    "UNCONFIRMED_DELETION",
    "The permanent deletion outcome could not be verified. Check the original outcome before retrying.",
  );
export async function submitDeletionWrite(
  intent: DeletionIntent,
  currentPassword: string,
  signal?: AbortSignal,
) {
  const r = await api<{ formId: string; reviewId: string; deleted: boolean }>(
    `/admin/forms/${intent.formId}/permanent-deletion`,
    {
      method: "POST",
      protected: true,
      idempotencyKey: intent.key,
      signal,
      body: { ...JSON.parse(intent.body), currentPassword },
    },
  );
  if (
    !r ||
    r.formId !== intent.formId ||
    r.reviewId !== intent.reviewId ||
    r.deleted !== true
  )
    throw unconfirmed();
  return r;
}
export async function inspectDeletionWrite(
  intent: DeletionIntent,
  signal?: AbortSignal,
) {
  const r = await api<DeletionInspection>(
    `/admin/forms/${intent.formId}/permanent-deletion/recovery?reviewId=${intent.reviewId}`,
    { idempotencyKey: intent.key, signal },
  );
  if (
    !r ||
    r.formId !== intent.formId ||
    r.reviewId !== intent.reviewId ||
    typeof r.committed !== "boolean" ||
    typeof r.canRetry !== "boolean" ||
    !Number.isInteger(r.revision) ||
    r.revision < 1 ||
    (r.committed
      ? !r.receipt ||
        r.receipt.formId !== intent.formId ||
        r.receipt.reviewId !== intent.reviewId ||
        r.receipt.deleted !== true ||
        r.revision !== JSON.parse(intent.body).revision + 1
      : r.receipt !== null ||
        !Number.isFinite(Date.parse(r.reviewExpiresAt || "")))
  )
    throw unconfirmed();
  return r;
}
export function deletionRetryReady(
  intent: DeletionIntent,
  r?: DeletionInspection,
) {
  return (
    !!r &&
    !r.committed &&
    r.canRetry &&
    r.revision === JSON.parse(intent.body).revision &&
    r.reviewExpiresAt === intent.reviewExpiresAt &&
    Date.parse(intent.reviewExpiresAt) > Date.now()
  );
}
