import { api, ApiFailure } from "@/lib/api";
export type GrantVersion = { grantId: string | null; grantRevision: number };
export type CollaboratorIntent = {
  formId: string;
  userId: string;
  action: "save" | "remove";
  label: string;
  body: string;
  key: string;
  startedAt: number;
};
export type CollaboratorInspection = {
  committed: boolean;
  canRetry: boolean;
  formId: string;
  userId: string;
  formRevision: number;
  canSave: boolean;
  canRemove: boolean;
  allowedActions: string[];
  grant: { id: string; revision: number; actions: string[] } | null;
  receipt: { formId: string; userId: string; action: "save" | "remove" } | null;
};
export const validGrantVersion = (v: GrantVersion) =>
  (v.grantId === null && v.grantRevision === 0) ||
  (typeof v.grantId === "string" &&
    !!v.grantId &&
    Number.isInteger(v.grantRevision) &&
    v.grantRevision >= 1);
export function prepareCollaboratorWrite(
  formId: string,
  userId: string,
  label: string,
  action: CollaboratorIntent["action"],
  formRevision: number,
  grant: GrantVersion,
  actions: string[] = [],
): CollaboratorIntent {
  if (
    !validGrantVersion(grant) ||
    (action === "remove" && grant.grantId === null) ||
    !Number.isInteger(formRevision) ||
    formRevision < 1
  )
    throw new ApiFailure(
      409,
      "STALE_GRANT",
      "Reload the current grant before reviewing a change.",
    );
  return Object.freeze({
    formId,
    userId,
    label,
    action,
    key: crypto.randomUUID(),
    startedAt: Date.now(),
    body: JSON.stringify({
      userId,
      formRevision,
      grantId: grant.grantId,
      grantRevision: grant.grantRevision,
      ...(action === "save" ? { actions: [...actions] } : {}),
    }),
  });
}
function verified(r: CollaboratorInspection, intent: CollaboratorIntent) {
  return (
    !!r &&
    typeof r.committed === "boolean" &&
    typeof r.canRetry === "boolean" &&
    r.formId === intent.formId &&
    r.userId === intent.userId &&
    Number.isInteger(r.formRevision) &&
    r.formRevision >= 1 &&
    typeof r.canSave === "boolean" &&
    typeof r.canRemove === "boolean" &&
    Array.isArray(r.allowedActions) &&
    r.allowedActions.every((a) => typeof a === "string") &&
    (r.grant === null ||
      (!!r.grant &&
        validGrantVersion({
          grantId: r.grant.id,
          grantRevision: r.grant.revision,
        }) &&
        Array.isArray(r.grant.actions) &&
        r.grant.actions.every((a) => typeof a === "string"))) &&
    (r.committed
      ? !!r.receipt &&
        r.receipt.formId === intent.formId &&
        r.receipt.userId === intent.userId &&
        r.receipt.action === intent.action
      : r.receipt === null)
  );
}
const unconfirmed = () =>
  new ApiFailure(
    503,
    "UNCONFIRMED_GRANT",
    "The collaborator change could not be verified. Check the original outcome before retrying.",
  );
export async function submitCollaboratorWrite(
  intent: CollaboratorIntent,
  signal?: AbortSignal,
) {
  const r = await api<CollaboratorInspection>(
    `/admin/forms/${intent.formId}/collaborators`,
    {
      method: intent.action === "save" ? "PATCH" : "DELETE",
      protected: true,
      body: JSON.parse(intent.body),
      idempotencyKey: intent.key,
      signal,
    },
  );
  if (!verified(r, intent) || !r.committed) throw unconfirmed();
  return r;
}
export async function inspectCollaboratorWrite(
  intent: CollaboratorIntent,
  signal?: AbortSignal,
) {
  const r = await api<CollaboratorInspection>(
    `/admin/forms/${intent.formId}/collaborators/recovery?action=${intent.action}&userId=${intent.userId}`,
    { idempotencyKey: intent.key, signal },
  );
  if (!verified(r, intent)) throw unconfirmed();
  return r;
}
export function collaboratorRetryReady(
  intent: CollaboratorIntent,
  r?: CollaboratorInspection,
) {
  if (!r || r.committed || !r.canRetry) return false;
  const body = JSON.parse(intent.body);
  return (
    r.formRevision === body.formRevision &&
    (r.grant?.id ?? null) === body.grantId &&
    (r.grant?.revision ?? 0) === body.grantRevision &&
    (intent.action === "remove"
      ? r.canRemove
      : r.canSave &&
        body.actions.every((a: string) => r.allowedActions.includes(a)))
  );
}
