import { api, ApiFailure } from "@/lib/api";
export type IntegrationKind = "event" | "team" | "campaign";
export type FormReference = {
  id: string;
  slot: string;
  formId: string;
  label: string;
  title: string | null;
  href: string | null;
  revision: number;
  versionPolicy: "latest_published";
};
export type IntegrationCandidate = {
  id: string;
  title: string;
  formRevision: number;
  publishedVersionId: string;
  version: number;
  access: string;
};
export type IntegrationWorkspace = {
  kind: IntegrationKind;
  resourceId: string;
  items: FormReference[];
  canEdit: boolean;
  canLink: boolean;
};
export type IntegrationCandidates = {
  kind: IntegrationKind;
  resourceId: string;
  items: IntegrationCandidate[];
  total: number;
  page: number;
  pageSize: number;
};
export type IntegrationIntent = {
  kind: IntegrationKind;
  resourceId: string;
  slot: string;
  sourceId: string | null;
  action: "save" | "remove";
  label: string;
  body: string;
  key: string;
  startedAt: number;
};
export type IntegrationReceipt = {
  kind: IntegrationKind;
  resourceId: string;
  slot: string;
  sourceId: string | null;
  action: "save" | "remove";
  id: string;
};
export type IntegrationInspection = Omit<IntegrationReceipt, "id"> & {
  committed: boolean;
  canRetry: boolean;
  reference: { id: string; revision: number } | null;
  target: {
    id: string;
    formRevision: number;
    publishedVersionId: string;
  } | null;
  receipt: IntegrationReceipt | null;
};
const positive = (n: unknown) => Number.isInteger(n) && (n as number) >= 1;
export const validReference = (r: FormReference) =>
  !!r &&
  typeof r.id === "string" &&
  !!r.id &&
  /^[a-z][a-z0-9-]{0,39}$/.test(r.slot) &&
  typeof r.formId === "string" &&
  !!r.formId &&
  typeof r.label === "string" &&
  !!r.label.trim() &&
  r.versionPolicy === "latest_published" &&
  positive(r.revision) &&
  (r.title === null || typeof r.title === "string") &&
  (r.href === null || /^\/forms\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(r.href));
export const validCandidate = (r: IntegrationCandidate) =>
  !!r &&
  typeof r.id === "string" &&
  !!r.id &&
  typeof r.title === "string" &&
  !!r.title &&
  positive(r.formRevision) &&
  typeof r.publishedVersionId === "string" &&
  !!r.publishedVersionId &&
  positive(r.version) &&
  ["public", "internal", "invited", "unlisted", "verified"].includes(r.access);
export const validIntegrationWorkspace = (
  w: IntegrationWorkspace | undefined,
  kind: IntegrationKind,
  resourceId: string,
): w is IntegrationWorkspace =>
  !!w &&
  ["event", "team", "campaign"].includes(w.kind) &&
  w.kind === kind &&
  w.resourceId === resourceId &&
  typeof w.canEdit === "boolean" &&
  typeof w.canLink === "boolean" &&
  Array.isArray(w.items) &&
  w.items.length <= 5 &&
  w.items.every(validReference) &&
  new Set(w.items.map((r) => r.slot)).size === w.items.length;
export const validIntegrationCandidates = (
  r: IntegrationCandidates | undefined,
  kind: IntegrationKind,
  resourceId: string,
): r is IntegrationCandidates =>
  !!r &&
  r.kind === kind &&
  r.resourceId === resourceId &&
  Array.isArray(r.items) &&
  r.items.every(validCandidate) &&
  Number.isInteger(r.total) &&
  r.total >= r.items.length &&
  positive(r.page) &&
  positive(r.pageSize);
const stale = () =>
  new ApiFailure(
    409,
    "STALE_REFERENCE",
    "Reload current links and the selected published form before reviewing a change.",
  );
export function prepareIntegrationWrite(
  w: IntegrationWorkspace,
  action: "save" | "remove",
  label: string,
  target?: IntegrationCandidate,
  source?: FormReference,
): IntegrationIntent {
  if (
    !validIntegrationWorkspace(w, w.kind, w.resourceId) ||
    !w.canEdit ||
    (action === "save" && (!w.canLink || !target || !validCandidate(target))) ||
    (action === "remove" && !source)
  )
    throw stale();
  const slot =
    source?.slot ||
    ["primary", "form-2", "form-3", "form-4", "form-5"].find(
      (s) => !w.items.some((r) => r.slot === s),
    );
  if (
    !slot ||
    (source &&
      (!validReference(source) ||
        !w.items.some(
          (r) =>
            r.id === source.id &&
            r.revision === source.revision &&
            r.slot === source.slot,
        )))
  )
    throw stale();
  if (action === "save" && (!label.trim() || label.trim().length > 80))
    throw new ApiFailure(
      400,
      "INVALID_LABEL",
      "Enter a link label between one and 80 characters.",
    );
  const body = {
    revision: source?.revision || 0,
    referenceId: source?.id || null,
    ...(action === "save"
      ? {
          formId: target!.id,
          formRevision: target!.formRevision,
          publishedVersionId: target!.publishedVersionId,
          versionPolicy: "latest_published",
          label: label.trim(),
        }
      : {}),
  };
  return Object.freeze({
    kind: w.kind,
    resourceId: w.resourceId,
    slot,
    sourceId: source?.id || null,
    action,
    label: action === "remove" ? source!.label : label.trim(),
    body: JSON.stringify(body),
    key: crypto.randomUUID(),
    startedAt: Date.now(),
  });
}
const root = (i: IntegrationIntent) =>
  `/admin/form-integrations/${i.kind}/${i.resourceId}/${i.slot}`;
const validReceipt = (
  r: IntegrationReceipt | null | undefined,
  i: IntegrationIntent,
) =>
  !!r &&
  r.kind === i.kind &&
  r.resourceId === i.resourceId &&
  r.slot === i.slot &&
  r.sourceId === i.sourceId &&
  r.action === i.action &&
  typeof r.id === "string" &&
  !!r.id &&
  (!i.sourceId || r.id === i.sourceId);
const unconfirmed = () =>
  new ApiFailure(
    503,
    "UNCONFIRMED_REFERENCE",
    "The linked-form outcome could not be verified. Check the original outcome before retrying.",
  );
export async function submitIntegrationWrite(
  i: IntegrationIntent,
  signal?: AbortSignal,
) {
  const r = await api<IntegrationReceipt>(root(i), {
    method: i.action === "save" ? "PUT" : "DELETE",
    protected: true,
    body: JSON.parse(i.body),
    idempotencyKey: i.key,
    signal,
  });
  if (!validReceipt(r, i)) throw unconfirmed();
  return r;
}
export async function inspectIntegrationWrite(
  i: IntegrationIntent,
  signal?: AbortSignal,
) {
  const b = JSON.parse(i.body),
    q = new URLSearchParams({
      action: i.action,
      ...(i.sourceId ? { sourceId: i.sourceId } : {}),
      ...(i.action === "save" ? { targetId: b.formId } : {}),
    });
  const r = await api<IntegrationInspection>(root(i) + "/recovery?" + q, {
    idempotencyKey: i.key,
    signal,
  });
  if (
    !r ||
    r.kind !== i.kind ||
    r.resourceId !== i.resourceId ||
    r.slot !== i.slot ||
    r.sourceId !== i.sourceId ||
    r.action !== i.action ||
    typeof r.committed !== "boolean" ||
    typeof r.canRetry !== "boolean" ||
    (r.reference !== null &&
      (!r.reference ||
        typeof r.reference.id !== "string" ||
        !r.reference.id ||
        !positive(r.reference.revision))) ||
    (r.target !== null &&
      (!r.target ||
        r.target.id !== b.formId ||
        !positive(r.target.formRevision) ||
        typeof r.target.publishedVersionId !== "string" ||
        !r.target.publishedVersionId)) ||
    (r.committed ? !validReceipt(r.receipt, i) : r.receipt !== null)
  )
    throw unconfirmed();
  return r;
}
export function integrationRetryReady(
  i: IntegrationIntent,
  r?: IntegrationInspection,
) {
  if (!r || r.committed || !r.canRetry) return false;
  const b = JSON.parse(i.body);
  return (
    (r.reference?.id || null) === i.sourceId &&
    (r.reference?.revision || 0) === b.revision &&
    (i.action === "remove" ||
      (!!r.target &&
        r.target.id === b.formId &&
        r.target.formRevision === b.formRevision &&
        r.target.publishedVersionId === b.publishedVersionId))
  );
}
