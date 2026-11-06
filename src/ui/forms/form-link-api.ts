import { api, ApiFailure } from "@/lib/api";
import type { PreviewForm } from "./store";
export type PrivateFormLink = {
  id: string;
  token_type: "invited" | "unlisted" | "verified";
  revision: number;
  recipientHint: string;
  responded: boolean;
  revoked_at: string | null;
  expires_at: string;
  last_sent_at: string | null;
  delivery_state: string;
};
export type LinkAction = "create" | "resend" | "revoke";
export type LinkIntent = {
  formId: string;
  sourceId: string | null;
  action: LinkAction;
  label: string;
  type: "invited" | "unlisted";
  body: string;
  key: string;
  startedAt: number;
};
export type LinkReceipt = {
  formId: string;
  sourceId: string | null;
  action: LinkAction;
  queued: number;
  existing: number;
  total: number;
};
export type LinkInspection = {
  formId: string;
  sourceId: string | null;
  action: LinkAction;
  committed: boolean;
  canRetry: boolean;
  formRevision: number;
  publishedVersionId: string | null;
  accessType: string;
  archived: boolean;
  target: {
    id: string;
    revision: number;
    type: string;
    responded: boolean;
    revoked: boolean;
    expiresAt: string;
    cooldownUntil: string | null;
  } | null;
  receipt: LinkReceipt | null;
};
export const validPrivateLink = (r: PrivateFormLink) =>
  !!r &&
  typeof r.id === "string" &&
  !!r.id &&
  Number.isInteger(r.revision) &&
  r.revision >= 1 &&
  ["invited", "unlisted", "verified"].includes(r.token_type) &&
  typeof r.recipientHint === "string" &&
  typeof r.responded === "boolean" &&
  (r.revoked_at === null || typeof r.revoked_at === "string") &&
  Number.isFinite(Date.parse(r.expires_at)) &&
  (r.last_sent_at === null || Number.isFinite(Date.parse(r.last_sent_at)));
const stale = () =>
  new ApiFailure(
    409,
    "STALE_LINK",
    "Reload the current form and private link before reviewing this request.",
  );
export function prepareLinkWrite(
  form: PreviewForm,
  action: LinkAction,
  row?: PrivateFormLink,
  recipients: string[] = [],
  days = 7,
): LinkIntent {
  const version = form.versions.at(-1),
    publishedVersionId = version?.versionId || null,
    type = action === "create" ? version?.settings.access : row?.token_type;
  if (
    !Number.isInteger(form.revision) ||
    (form.revision || 0) < 1 ||
    !form.actions?.includes("view") ||
    !form.actions.includes("manage_access") ||
    !["invited", "unlisted"].includes(type || "")
  )
    throw stale();
  if (action !== "create" && (!row || !validPrivateLink(row) || row.revoked_at))
    throw stale();
  if (
    action !== "revoke" &&
    (!publishedVersionId ||
      form.status === "Archived" ||
      version?.settings.access !== type ||
      (action === "resend" && row?.responded))
  )
    throw stale();
  const addresses = [...new Set(recipients.map((s) => s.trim().toLowerCase()))];
  if (
    action === "create" &&
    (!Number.isInteger(days) ||
      days < 1 ||
      days > 30 ||
      !addresses.length ||
      addresses.length > 100 ||
      addresses.some(
        (s) => s.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s),
      ))
  )
    throw new ApiFailure(
      400,
      "INVALID_RECIPIENTS",
      "Review one to 100 valid approved addresses and an expiry of one to 30 days.",
    );
  const body = {
    formRevision: form.revision,
    publishedVersionId,
    ...(action === "create"
      ? {
          type,
          recipients: addresses,
          expiresAt: new Date(Date.now() + days * 86400000).toISOString(),
          confirmed: true,
        }
      : {
          revision: row!.revision,
          action,
          ...(action === "resend"
            ? { expiresAt: new Date(Date.now() + 7 * 86400000).toISOString() }
            : {}),
        }),
  };
  return Object.freeze({
    formId: form.id,
    sourceId: action === "create" ? null : row!.id,
    action,
    type: type as "invited" | "unlisted",
    label: action === "create" ? form.title : row!.recipientHint,
    body: JSON.stringify(body),
    key: crypto.randomUUID(),
    startedAt: Date.now(),
  });
}
function validReceipt(
  r: LinkReceipt | undefined | null,
  i: LinkIntent,
): r is LinkReceipt {
  return (
    !!r &&
    r.formId === i.formId &&
    r.sourceId === i.sourceId &&
    r.action === i.action &&
    [r.queued, r.existing, r.total].every(
      (n) => Number.isInteger(n) && n >= 0,
    ) &&
    (i.action === "revoke" || r.queued + r.existing === r.total) &&
    (i.action === "create"
      ? r.total === JSON.parse(i.body).recipients.length
      : i.action === "resend"
        ? r.queued === 1 && r.total === 1
        : r.queued === 0 && r.existing === 0 && r.total === 1)
  );
}
const unconfirmed = () =>
  new ApiFailure(
    503,
    "UNCONFIRMED_LINK",
    "The private-link outcome could not be verified. Check the original outcome before retrying.",
  );
export async function submitLinkWrite(i: LinkIntent, signal?: AbortSignal) {
  const r = await api<LinkReceipt>(
    `/admin/forms/${i.formId}/invitations${i.sourceId ? "/" + i.sourceId : ""}`,
    {
      method: i.action === "create" ? "POST" : "PATCH",
      protected: true,
      idempotencyKey: i.key,
      body: JSON.parse(i.body),
      signal,
    },
  );
  if (!validReceipt(r, i)) throw unconfirmed();
  return r;
}
export async function inspectLinkWrite(i: LinkIntent, signal?: AbortSignal) {
  const r = await api<LinkInspection>(
    `/admin/forms/${i.formId}/invitations/recovery?action=${i.action}${i.sourceId ? "&sourceId=" + i.sourceId : ""}`,
    { idempotencyKey: i.key, signal },
  );
  if (
    !r ||
    r.formId !== i.formId ||
    r.sourceId !== i.sourceId ||
    r.action !== i.action ||
    typeof r.committed !== "boolean" ||
    typeof r.canRetry !== "boolean" ||
    !Number.isInteger(r.formRevision) ||
    r.formRevision < 1 ||
    (r.publishedVersionId !== null &&
      typeof r.publishedVersionId !== "string") ||
    !["public", "internal", "invited", "unlisted", "verified"].includes(
      r.accessType,
    ) ||
    typeof r.archived !== "boolean" ||
    (r.target !== null &&
      (!r.target ||
        r.target.id !== i.sourceId ||
        !Number.isInteger(r.target.revision) ||
        r.target.revision < 1 ||
        typeof r.target.responded !== "boolean" ||
        typeof r.target.revoked !== "boolean")) ||
    (r.committed ? !validReceipt(r.receipt, i) : r.receipt !== null)
  )
    throw unconfirmed();
  return r;
}
export function linkRetryReady(i: LinkIntent, r?: LinkInspection) {
  if (!r || r.committed || !r.canRetry) return false;
  const b = JSON.parse(i.body);
  if (
    r.formRevision !== b.formRevision ||
    r.publishedVersionId !== b.publishedVersionId ||
    (b.expiresAt && Date.parse(b.expiresAt) <= Date.now())
  )
    return false;
  return i.action === "create"
    ? !r.archived && r.accessType === i.type
    : !!r.target &&
        r.target.id === i.sourceId &&
        r.target.revision === b.revision &&
        !r.target.revoked &&
        (i.action === "revoke" ||
          (!r.archived && !r.target.responded && r.accessType === i.type));
}
