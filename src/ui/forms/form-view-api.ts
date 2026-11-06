import { api, ApiFailure } from "@/lib/api";
export type SavedResponseView = {
  id: string;
  name: string;
  revision: number;
  filters: Record<string, string | number>;
  columns: string[];
  updated_at?: string;
};
export type ViewAction = "create" | "replace" | "remove";
export type ViewIntent = {
  formId: string;
  sourceId: string | null;
  action: ViewAction;
  name: string;
  body: string;
  key: string;
  startedAt: number;
};
export type ViewInspection = {
  committed: boolean;
  canRetry: boolean;
  receipt?: {
    id: string;
    formId: string;
    sourceId: string | null;
    action: ViewAction;
  };
  view: SavedResponseView | null;
};
export const validSavedView = (
  v: SavedResponseView | null | undefined,
): v is SavedResponseView =>
  !!v &&
  typeof v.id === "string" &&
  !!v.id &&
  typeof v.name === "string" &&
  !!v.name &&
  Number.isInteger(v.revision) &&
  v.revision >= 1 &&
  !!v.filters &&
  typeof v.filters === "object" &&
  !Array.isArray(v.filters) &&
  Array.isArray(v.columns) &&
  v.columns.every((c) => typeof c === "string");
export function prepareViewWrite(
  formId: string,
  action: ViewAction,
  name: string,
  filters: Record<string, string | number>,
  columns: string[],
  source?: SavedResponseView,
): ViewIntent {
  if (action !== "create" && !validSavedView(source))
    throw new ApiFailure(
      409,
      "STALE_VIEW",
      "Reload the selected saved view before reviewing a change.",
    );
  const picked = Object.fromEntries(
    Object.entries(filters).filter(([key]) =>
      ["q", "version", "from", "to", "status"].includes(key),
    ),
  );
  const body = {
    ...(action === "remove"
      ? {}
      : { name: name.trim(), filters: picked, columns: [...columns] }),
    ...(source && action !== "create" ? { revision: source.revision } : {}),
  };
  return Object.freeze({
    formId,
    sourceId: action === "create" ? null : source!.id,
    action,
    name: action === "remove" ? source!.name : name.trim(),
    body: JSON.stringify(body),
    key: crypto.randomUUID(),
    startedAt: Date.now(),
  });
}
const unconfirmed = () =>
  new ApiFailure(
    503,
    "UNCONFIRMED_VIEW",
    "The saved view outcome could not be verified. Check the original outcome before retrying.",
  );
function verified(value: unknown, intent: ViewIntent): value is ViewInspection {
  if (!value || typeof value !== "object") return false;
  const r = value as ViewInspection;
  return (
    typeof r.committed === "boolean" &&
    typeof r.canRetry === "boolean" &&
    (r.view === null || validSavedView(r.view)) &&
    (!r.committed ||
      (!!r.receipt &&
        typeof r.receipt.id === "string" &&
        !!r.receipt.id &&
        r.receipt.formId === intent.formId &&
        r.receipt.sourceId === intent.sourceId &&
        r.receipt.action === intent.action &&
        (!intent.sourceId || r.receipt.id === intent.sourceId) &&
        (!r.view || r.view.id === r.receipt.id))) &&
    (r.committed ||
      (intent.action === "create"
        ? r.view === null
        : !!r.view && r.view.id === intent.sourceId))
  );
}
export async function submitViewWrite(
  intent: ViewIntent,
  signal?: AbortSignal,
) {
  const result = await api<ViewInspection>(
    `/admin/forms/${intent.formId}/views${intent.sourceId ? "/" + intent.sourceId : ""}`,
    {
      method:
        intent.action === "create"
          ? "POST"
          : intent.action === "replace"
            ? "PATCH"
            : "DELETE",
      protected: true,
      body: JSON.parse(intent.body),
      idempotencyKey: intent.key,
      signal,
    },
  );
  if (!verified(result, intent) || !result.committed) throw unconfirmed();
  return result;
}
export async function inspectViewWrite(
  intent: ViewIntent,
  signal?: AbortSignal,
) {
  const result = await api<ViewInspection>(
    `/admin/forms/${intent.formId}/views${intent.sourceId ? "/" + intent.sourceId : ""}/recovery?action=${intent.action}`,
    { idempotencyKey: intent.key, signal },
  );
  if (!verified(result, intent)) throw unconfirmed();
  return result;
}
export function viewRetryReady(intent: ViewIntent, r?: ViewInspection) {
  return (
    !!r &&
    !r.committed &&
    r.canRetry &&
    (intent.action === "create" ||
      (r.view?.id === intent.sourceId &&
        r.view?.revision === JSON.parse(intent.body).revision))
  );
}
