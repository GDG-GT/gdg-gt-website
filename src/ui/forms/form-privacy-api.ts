import { api, ApiFailure } from "@/lib/api";
export type PrivacyState = {
  formId: string;
  revision: number;
  held: boolean;
  reason: string;
  draftDays: number;
  canRelease: boolean;
  totalResponses: number;
  heldResponses: number;
  dueResponses: number;
  nextExpiry: string | null;
  pendingFiles: number;
  responseId?: string;
  responseRevision?: number;
  responseHeld?: boolean;
  responseReason?: string;
  responseExpiresAt?: string;
  effectiveResponseHold?: boolean;
};
export type PrivacyIntent = {
  formId: string;
  responseId: string | null;
  path: string;
  body: string;
  key: string;
  startedAt: number;
  held: boolean;
  revision: number;
};
export type PrivacyInspection = {
  committed: boolean;
  canRetry: boolean;
  formId: string;
  responseId: string | null;
  currentRevision: number;
  held: boolean;
  canRelease: boolean;
  targetExists: boolean;
  receipt: {
    formId: string;
    responseId: string | null;
    revision: number;
  } | null;
};
export function privacyPath(formId: string, responseId?: string | null) {
  return `/admin/forms/${formId}${responseId ? "/responses/" + responseId : ""}/privacy`;
}
export function preparePrivacyWrite(
  state: PrivacyState,
  body: {
    revision: number;
    held: boolean;
    reason: string;
    confirmation: string;
    draftDays?: number;
  },
): PrivacyIntent {
  const responseId = state.responseId || null;
  if (
    !Number.isInteger(body.revision) ||
    body.revision < 0 ||
    body.revision !== (responseId ? state.responseRevision : state.revision) ||
    typeof body.held !== "boolean" ||
    typeof body.reason !== "string" ||
    body.reason.trim().length < 5 ||
    body.reason.length > 500 ||
    (!responseId &&
      (!Number.isInteger(body.draftDays) ||
        body.draftDays! < 1 ||
        body.draftDays! > 30)) ||
    ((responseId ? state.responseHeld : state.held) &&
      !body.held &&
      !state.canRelease) ||
    body.confirmation !== `HOLD ${responseId || state.formId}`
  )
    throw new ApiFailure(
      409,
      "STALE_PRIVACY",
      "Reload the current privacy policy and review the exact reference before confirming.",
    );
  return Object.freeze({
    formId: state.formId,
    responseId,
    path: privacyPath(state.formId, responseId),
    body: JSON.stringify({
      revision: body.revision,
      held: body.held,
      reason: body.reason,
      confirmation: body.confirmation,
      ...(!responseId ? { draftDays: body.draftDays } : {}),
    }),
    key: crypto.randomUUID(),
    startedAt: Date.now(),
    held: body.held,
    revision: body.revision,
  });
}
export async function submitPrivacyWrite(
  intent: PrivacyIntent,
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
    result.revision !== intent.revision + 1
  )
    throw new ApiFailure(
      503,
      "UNCONFIRMED_PRIVACY",
      "The privacy review result could not be verified. Check its original outcome.",
    );
  return result;
}
export async function inspectPrivacyWrite(
  intent: PrivacyIntent,
  signal?: AbortSignal,
) {
  const value = await api<PrivacyInspection>(intent.path + "/recovery", {
    idempotencyKey: intent.key,
    signal,
  });
  if (
    !value ||
    typeof value.committed !== "boolean" ||
    typeof value.canRetry !== "boolean" ||
    value.formId !== intent.formId ||
    value.responseId !== intent.responseId ||
    !Number.isInteger(value.currentRevision) ||
    value.currentRevision < 0 ||
    typeof value.held !== "boolean" ||
    typeof value.canRelease !== "boolean" ||
    typeof value.targetExists !== "boolean" ||
    (value.committed &&
      (!value.receipt ||
        value.receipt.formId !== intent.formId ||
        value.receipt.responseId !== intent.responseId ||
        !Number.isInteger(value.receipt.revision) ||
        value.receipt.revision !== intent.revision + 1))
  )
    throw new ApiFailure(
      503,
      "UNCONFIRMED_PRIVACY",
      "The original privacy outcome could not be verified. Recheck it before retrying.",
    );
  return value;
}
export function privacyRetryReady(
  intent: PrivacyIntent,
  value?: PrivacyInspection,
) {
  return (
    !!value &&
    !value.committed &&
    value.canRetry &&
    value.targetExists &&
    value.currentRevision === intent.revision &&
    (!value.held || intent.held || value.canRelease)
  );
}
