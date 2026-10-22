import { AsyncLocalStorage } from "node:async_hooks";

const requests = new AsyncLocalStorage();
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const methods = new Set([
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
]);
const dependencies = new Set([
  "database",
  "storage",
  "mail",
  "push",
  "scanner",
]);
const safeErrors = new Set([
  "AUTH_REQUIRED",
  "GATE_REQUIRED",
  "SESSION_CHANGED",
  "CSRF_REQUIRED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "VALIDATION_ERROR",
  "BAD_REQUEST",
  "RATE_LIMITED",
  "METHOD_NOT_ALLOWED",
  "PAYLOAD_TOO_LARGE",
  "UNSUPPORTED_MEDIA_TYPE",
  "INTERNAL_ERROR",
  "TEMPORARILY_UNAVAILABLE",
  "EVENT_FULL",
  "FORM_FULL",
  "FORM_CLOSED",
  "JOB_LEASE_LOST",
  "RETENTION_BACKLOG_REMAINING",
  "RESPONSE_INTERRUPTED",
  "DELIVERY_RETRY",
  "PROVIDER_RETRY",
  "PUSH_RETRY",
  "SCANNER_UNAVAILABLE",
  "SCANNER_STALE",
  "INVALID_UPLOAD",
  "UPLOADS_NOT_READY",
  "FORM_EXPORT_RANGE",
  "FORM_EXPORT_QUOTA",
  "PRIVACY_REVIEW_REQUIRED",
  "PRIVACY_REVIEW_CHANGED",
  "RETENTION_HOLD",
]);
// Only source-controlled route names are serialized. Never log a URL, query,
// slug, token, uploaded filename, arbitrary segment, request body or headers.
const roots = new Set([
  "auth",
  "admin",
  "jobs",
  "events",
  "forms",
  "newsletter",
  "contact",
  "content",
  "gallery",
  "linktree",
  "site-status",
  "site-content",
  "csp-reports",
]);
const adminResources = new Set([
  "access",
  "overview",
  "profile",
  "notifications",
  "audit",
  "privacy",
  "operations",
  "events",
  "forms",
  "users",
  "teams",
  "members",
  "channels",
  "whiteboards",
  "tasks",
  "direct-messages",
  "announcements",
  "team-chat",
  "finances",
  "linktree",
  "projects",
  "site-status",
  "content",
  "site-content",
  "blog",
  "media",
  "newsletter",
  "contact",
  "resources",
  "sponsors",
  "team",
]);
const actions = new Set([
  "review",
  "commit",
  "status",
  "export",
  "exports",
  "responses",
  "versions",
  "history",
  "publish",
  "unpublish",
  "archive",
  "restore",
  "duplicate",
  "preview",
  "access",
  "drafts",
  "submissions",
  "uploads",
  "files",
  "download",
  "complete",
  "hold",
  "holds",
  "privacy",
  "deletion-review",
  "permanent-deletion",
  "registrations",
  "attendance",
  "calendar",
  "calendar.ics",
  "messages",
  "audience",
  "members",
  "invitations",
  "permissions",
  "delivery",
  "recipients",
  "test",
  "cancel",
  "send",
  "send-review",
  "verify",
  "push",
  "reminders",
  "subscribe",
  "unsubscribe",
  "confirm",
  "subscriptions",
  "folders",
  "publications",
  "usage",
  "bulk",
  "statistics",
  "analytics",
  "settings",
  "devices",
  "revoke",
  "respondent-copy",
  "delivery-review",
]);
const authActions = new Set([
  "gate",
  "login",
  "session",
  "csrf",
  "password",
  "sessions",
  "realtime-token",
]);
const jobNames = new Set([
  "form-schedules",
  "form-cleanup",
  "delivery",
  "task-overdue",
  "announcements",
  "newsletter-campaigns",
  "event-push",
  "session-cleanup",
  "notification-cleanup",
  "report-cache-cleanup",
  "operations-monitor",
]);
export function routeTemplate(rawUrl) {
  let parts;
  try {
    parts = new URL(rawUrl, "https://telemetry.invalid").pathname
      .split("/")
      .filter(Boolean);
  } catch {
    return "/unmatched";
  }
  if (parts[0] !== "api" || parts[1] !== "v1" || !roots.has(parts[2]))
    return "/unmatched";
  const root = parts[2],
    out = ["api", "v1", root];
  if (root === "auth")
    return (
      "/" +
      out
        .concat(
          authActions.has(parts[3]) ? parts[3] : ":action",
          ...parts.slice(4).map(() => ":id"),
        )
        .join("/")
    );
  if (root === "jobs")
    return (
      "/" + out.concat(jobNames.has(parts[3]) ? parts[3] : ":job").join("/")
    );
  if (root === "admin") {
    out.push(adminResources.has(parts[3]) ? parts[3] : ":resource");
    for (const part of parts.slice(4))
      out.push(actions.has(part) ? part : ":id");
  } else if (["events", "forms", "linktree"].includes(root)) {
    if (parts[3]) out.push(":slug");
    for (const part of parts.slice(4))
      out.push(actions.has(part) ? part : ":id");
  } else
    for (const part of parts.slice(3))
      out.push(actions.has(part) ? part : ":id");
  return "/" + out.slice(0, 12).join("/");
}
export function withRequestTelemetry(work) {
  return requests.run({ actorId: undefined, dependencies: {} }, work);
}
export function recordActor(id) {
  const state = requests.getStore();
  if (state && typeof id === "string" && uuid.test(id)) state.actorId = id;
}
export async function timeDependency(name, work) {
  if (!dependencies.has(name)) throw Error("Unknown telemetry dependency.");
  const state = requests.getStore(),
    started = performance.now();
  let failed = false;
  try {
    const result = await work();
    failed = result instanceof Response && !result.ok;
    return result;
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    if (state) {
      const elapsed = Math.max(
          0,
          Math.min(120000, performance.now() - started),
        ),
        prior = state.dependencies[name] || {
          count: 0,
          totalMs: 0,
          maxMs: 0,
          failures: 0,
        };
      state.dependencies[name] = {
        count: Math.min(10000, prior.count + 1),
        totalMs: Math.min(1200000, prior.totalMs + elapsed),
        maxMs: Math.max(prior.maxMs, elapsed),
        failures: Math.min(10000, prior.failures + (failed ? 1 : 0)),
      };
    }
  }
}
export function requestRecord(
  request,
  response,
  requestId,
  started,
  errorCode,
  env = process.env,
) {
  const state = requests.getStore(),
    status =
      Number.isInteger(response.statusCode) &&
      response.statusCode >= 100 &&
      response.statusCode <= 599
        ? response.statusCode
        : 500;
  return {
    timestamp: new Date().toISOString(),
    environment: ["development", "test", "production"].includes(env.NODE_ENV)
      ? env.NODE_ENV
      : "unknown",
    requestId,
    routeTemplate: routeTemplate(request.url),
    method: methods.has(request.method) ? request.method : "OTHER",
    status,
    latencyMs: Math.max(
      0,
      Math.min(120000, Math.round(performance.now() - started)),
    ),
    ...(state?.actorId ? { actorId: state.actorId } : {}),
    authorization:
      status === 401
        ? "unauthenticated"
        : status === 403
          ? "denied"
          : state?.actorId
            ? "allowed"
            : "public",
    ...(errorCode
      ? { errorCode: safeErrors.has(errorCode) ? errorCode : "API_ERROR" }
      : {}),
    dependencies: Object.fromEntries(
      Object.entries(state?.dependencies || {}).map(([name, value]) => [
        name,
        {
          ...value,
          totalMs: Math.round(value.totalMs),
          maxMs: Math.round(value.maxMs),
        },
      ]),
    ),
  };
}
export function requestCounters(record) {
  const counts = { requests: 1 },
    route = record.routeTemplate;
  if (record.status >= 500 || record.errorCode === 'RESPONSE_INTERRUPTED') counts.server_failures = 1;
  if (
    ["/api/v1/auth/gate", "/api/v1/auth/login"].includes(route) &&
    [401, 429].includes(record.status)
  )
    counts.auth_failures = 1;
  if (
    route.startsWith("/api/v1/events/") &&
    route.endsWith("/registrations") &&
    record.status === 409
  )
    counts.event_conflicts = 1;
  if (
    route.startsWith("/api/v1/forms/") &&
    route.endsWith("/submissions") &&
    record.status >= 400 &&
    record.status < 500
  )
    counts.form_rejections = 1;
  if (record.errorCode === "FORM_FULL") counts.form_limits = 1;
  if (record.dependencies.database?.failures)
    counts.database_failures = Math.min(
      1000,
      record.dependencies.database.failures,
    );
  if (record.dependencies.database?.maxMs >= 750) counts.database_slow = 1;
  if (record.dependencies.storage?.failures)
    counts.storage_failures = Math.min(
      1000,
      record.dependencies.storage.failures,
    );
  return counts;
}
export function createTelemetryLogger({ db, sink = console.info } = {}) {
  return async (record) => {
    // record is constructed from an explicit allowlist above. Never spread a
    // provider/request/error object into it, even for debug environments.
    sink(JSON.stringify(record));
    if (db) {
      try {
        await db
          .rpc("record_operational_metrics", {
            p_counts: requestCounters(record),
          })
          .abortSignal(AbortSignal.timeout(1500));
      } catch {
        /* Fixed stdout logs remain available during telemetry DB outages. */
      }
    }
  };
}
