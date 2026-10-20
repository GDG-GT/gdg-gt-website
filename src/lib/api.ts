// Same-origin application transport. Session cookies are HttpOnly and CSRF is
// held only in module memory; neither bearer material nor CSRF enters storage.
export class ApiFailure extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}
let csrf: string | undefined;
let refresh: Promise<void> | undefined;
export const clearApiSession = () => {
  csrf = undefined;
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event("gdg:session-cleared"));
};
export function acceptCsrf(value: unknown) {
  if (typeof value === "string") csrf = value;
}
type Options = {
  method?: string;
  body?: unknown;
  idempotencyKey?: string;
  signal?: AbortSignal;
  protected?: boolean;
  formAccessToken?: string;
};
export async function api<T>(path: string, options: Options = {}): Promise<T> {
  return execute<T>(path, options, true);
}
function refreshCsrf() {
  refresh ??= api<{ csrfToken: string }>("/auth/session")
    .then((result) => {
      acceptCsrf(result.csrfToken);
    })
    .finally(() => {
      refresh = undefined;
    });
  return refresh;
}
async function execute<T>(
  path: string,
  options: Options,
  retryCsrf: boolean,
): Promise<T> {
  if (!path.startsWith("/") || path.startsWith("//"))
    throw new Error("Use a relative API path.");
  const method = options.method || "GET",
    mutation = !["GET", "HEAD"].includes(method);
  if (options.protected && mutation && !csrf) {
    await refreshCsrf();
  }
  const response = await fetch("/api/v1" + path, {
    method,
    credentials: "same-origin",
    signal: options.signal,
    headers: {
      ...(options.body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      ...(options.idempotencyKey
        ? { "Idempotency-Key": options.idempotencyKey }
        : {}),
      ...(options.formAccessToken
        ? { "X-Form-Access": options.formAccessToken }
        : {}),
    },
    ...(options.body !== undefined
      ? { body: JSON.stringify(options.body) }
      : {}),
  });
  if (response.status === 204) return undefined as T;
  const result = await response.json().catch(() => null);
  if (
    response.status === 403 &&
    result?.error?.code === "CSRF_INVALID" &&
    mutation &&
    retryCsrf
  ) {
    // Every protected handler rejects CSRF before doing business work. Preserve
    // the body/idempotency key and retry only this pre-mutation failure once.
    await refreshCsrf();
    return execute<T>(path, options, false);
  }
  if (!response.ok) {
    if (response.status === 401) clearApiSession();
    throw new ApiFailure(
      response.status,
      result?.error?.code || "TEMPORARILY_UNAVAILABLE",
      result?.error?.message ||
        "This service is temporarily unavailable. Please try again.",
      result?.error?.fields,
    );
  }
  if (!result || !Object.prototype.hasOwnProperty.call(result, "data"))
    throw new ApiFailure(
      503,
      "TEMPORARILY_UNAVAILABLE",
      "This service returned an unreadable response. Please try again.",
    );
  acceptCsrf(result.data?.csrfToken);
  return result.data as T;
}
