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
let binding: string | undefined;
let epoch = 0;
let sessionRequests = new AbortController();
export const clearApiSession = () => {
  epoch++;
  sessionRequests.abort();
  sessionRequests = new AbortController();
  csrf = undefined;
  binding = undefined;
  refresh = undefined;
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event("gdg:session-cleared"));
};
function acceptCsrf(value: unknown) {
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
  // Explicit sign-in abandons every previous private request/intent first.
  if (path === "/auth/login" && options.method?.toUpperCase() === "POST")
    clearApiSession();
  return execute<T>(path, options, true, epoch);
}
function refreshCsrf() {
  if (!refresh) {
    const pending = api("/auth/session")
      .then(() => undefined)
      .finally(() => {
        if (refresh === pending) refresh = undefined;
      });
    refresh = pending;
  }
  return refresh;
}
const sessionChanged = () =>
  new ApiFailure(
    409,
    "SESSION_CHANGED",
    "Your sign-in changed. Reload the workspace before continuing.",
  );
function assertEpoch(expected: number) {
  if (epoch !== expected) throw sessionChanged();
}
async function execute<T>(
  path: string,
  options: Options,
  retryCsrf: boolean,
  expectedEpoch: number,
): Promise<T> {
  if (!path.startsWith("/") || path.startsWith("//"))
    throw new Error("Use a relative API path.");
  const method = (options.method || "GET").toUpperCase(),
    mutation = !["GET", "HEAD"].includes(method),
    scoped =
      options.protected ||
      path.startsWith("/admin/") ||
      path.startsWith("/auth/");
  if (scoped) assertEpoch(expectedEpoch);
  if (
    scoped &&
    mutation &&
    !["/auth/gate", "/auth/login"].includes(path) &&
    (!csrf || !binding)
  ) {
    await refreshCsrf();
    assertEpoch(expectedEpoch);
    if (!csrf || !binding)
      throw new ApiFailure(
        503,
        "TEMPORARILY_UNAVAILABLE",
        "Your session could not be verified. Reload and try again.",
      );
  }
  let response: Response;
  try {
    response = await fetch("/api/v1" + path, {
      method,
      credentials: "same-origin",
      signal: scoped
        ? options.signal
          ? AbortSignal.any([options.signal, sessionRequests.signal])
          : sessionRequests.signal
        : options.signal,
      headers: {
        ...(options.body !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
        ...(csrf ? { "X-CSRF-Token": csrf } : {}),
        ...(scoped && binding ? { "X-Session-Binding": binding } : {}),
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
  } catch (error) {
    if (scoped) assertEpoch(expectedEpoch);
    throw error;
  }
  if (scoped) assertEpoch(expectedEpoch);
  if (response.status === 204) return undefined as T;
  const result = await response.json().catch(() => null);
  if (scoped) assertEpoch(expectedEpoch);
  if (scoped && result?.error?.code === "SESSION_CHANGED") {
    clearApiSession();
    throw sessionChanged();
  }
  if (
    response.status === 403 &&
    result?.error?.code === "CSRF_INVALID" &&
    mutation &&
    retryCsrf
  ) {
    // Every protected handler rejects CSRF before doing business work. Preserve
    // the body/idempotency key and retry only this pre-mutation failure once.
    await refreshCsrf();
    if (scoped) assertEpoch(expectedEpoch);
    return execute<T>(path, options, false, expectedEpoch);
  }
  if (!response.ok) {
    if (response.status === 401 && scoped) clearApiSession();
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
  if (["/auth/session", "/auth/login", "/auth/password"].includes(path)) {
    const next = result.data?.sessionBinding;
    if (typeof next !== "string" || !/^[a-f0-9]{64}$/.test(next))
      throw new ApiFailure(
        503,
        "TEMPORARILY_UNAVAILABLE",
        "Your session could not be verified. Reload and try again.",
      );
    if (binding && next !== binding) {
      if (path !== "/auth/password") {
        clearApiSession();
        throw sessionChanged();
      }
      // Password rotation replaces this cookie generation; discard other work
      // in flight without falsely logging out this successful operation.
      epoch++;
      sessionRequests.abort();
      sessionRequests = new AbortController();
      refresh = undefined;
    }
    binding = next;
    acceptCsrf(result.data?.csrfToken);
  }
  return result.data as T;
}
