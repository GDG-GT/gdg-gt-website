import { z } from "zod";
import { ApiError } from "./http.mjs";
import { isIP } from "node:net";
export const uuid = z.string().uuid();
export const slug = z
  .string()
  .min(1)
  .max(150)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const safeUrl = z
  .string()
  .max(2000)
  .refine((value) => {
    if (value === "") return true;
    try {
      const u = new URL(value);
      const host = u.hostname.toLowerCase().replace(/\.$/, "");
      return (
        u.protocol === "https:" &&
        !u.username &&
        !u.password &&
        !isIP(host.replace(/^\[|\]$/g, "")) &&
        host.includes(".") &&
        !["localhost", "local", "internal", "test", "invalid"].some(
          (suffix) => host === suffix || host.endsWith("." + suffix),
        ) &&
        !Array.from(value).some(
          (char) => char.codePointAt(0) <= 32 || char.codePointAt(0) === 127,
        )
      );
    } catch {
      return false;
    }
  }, "Use an HTTPS URL without credentials.");
export const imageUrl = z
  .union([safeUrl, z.string().regex(/^\/assets\/[a-zA-Z0-9._-]+$/)])
  .nullable();
export const text = (max, min = 0) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine(
      (v) =>
        !Array.from(v).some((c) => {
          const n = c.codePointAt(0);
          return (n < 32 && ![9, 10, 13].includes(n)) || n === 127;
        }),
      "Remove control characters.",
    );
export function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ApiError(400, "VALIDATION_ERROR", "Check the supplied fields.");
  return result.data;
}
export function queryValues(params, schema) {
  const value = {};
  for (const [k, v] of params) {
    if (k in value)
      throw new ApiError(
        400,
        "BAD_REQUEST",
        "Repeated query parameters are not supported.",
      );
    value[k] = v;
  }
  return parse(schema, value);
}
export function idempotency(request) {
  const value = request.headers["idempotency-key"];
  if (typeof value !== "string" || !/^[-A-Za-z0-9_]{16,128}$/.test(value))
    throw new ApiError(
      400,
      "BAD_REQUEST",
      "A valid Idempotency-Key is required.",
    );
  return value;
}
export function databaseResult({ data, error }) {
  if (!error) return data;
  const codes = {
    NOT_FOUND: [404, "This record was not found."],
    DUPLICATE: [409, "This record already exists."],
    INVALID_STATE: [
      409,
      "This operation is not available in the current state.",
    ],
    EVENT_FULL: [409, "This event is full."],
    CONFLICT: [409, "This record changed. Reload before saving."],
    VALIDATION_ERROR: [400, "Check the supplied fields."],
  };
  Object.assign(codes, {
    PROJECT_RETAINED: [409, "Archive or restore projects; permanent deletion is disabled."],
    PROJECT_MEMBER_LIMIT: [409, "A project supports up to 100 active participants."],
    LINKTREE_RETAINED: [409, "Archive or restore this profile/link; permanent deletion is disabled."],
    LINKTREE_LIMIT: [409, "A profile supports up to 100 current links. Archive an unused link first."],
    BUDGET_UNAVAILABLE: [409, "Choose an active budget in this request's scope and date range."],
    BUDGET_EXCEEDED: [409, "This change exceeds the budget or conflicts with committed request dates."],
    BUDGET_IN_USE: [409, "Resolve pending or reserved requests before closing this budget."],
    FINANCE_RETAINED: [409, "Financial records are retained; deletion is disabled."],
    FINANCE_IMMUTABLE: [409, "Submitted financial details and final decisions cannot be rewritten."],
    EXPORT_TOO_LARGE: [409, "Narrow the export filters to at most 1,000 records and a smaller file."],
    TEAM_MANAGED_CHAT: [409,"Team chat access and moderation follow current team memberships. Manage them in Teams."],
    AUDIENCE_LIMIT: [409, "Choose an audience with 1–1,000 active recipients."],
    AUDIENCE_CHANGED: [409, "The audience changed. Preview it again before confirming."],
    PREVIEW_REQUIRED: [409, "A current audience preview from this session is required."],
    LAST_CHANNEL_OWNER: [
      409,
      "Assign another active room owner before removing the last owner.",
    ],
    INVITE_INVALID: [
      400,
      "This invitation is invalid, expired, or no longer available.",
    ],
    INVITE_SIGNIN_REQUIRED: [
      403,
      "Sign in with the account that received this invitation.",
    ],
    LAST_TEAM_LEAD: [
      409,
      "Assign another active team lead before removing this lead or disabling their account.",
    ],
    ACCOUNT_NOT_READY: [
      409,
      "Use an active, fully set up chapter account eligible for team membership.",
    ],
    LAST_SUPER_ADMIN: [
      409,
      "Keep at least one active Super Admin with completed account setup.",
    ],
    UPLOAD_QUOTA: [
      409,
      "This response or field has reached its file limit. Remove an unused file before trying again.",
    ],
    RESEND_COOLDOWN: [
      429,
      "Wait at least one minute before resending this invitation.",
    ],
    FORM_CLOSED: [409, "This form is not accepting responses."],
    FORM_FULL: [409, "This form has reached its response limit."],
    RETENTION_HOLD: [
      409,
      "This response is retained under an operational hold.",
    ],
    ACCESS_REQUIRED: [
      403,
      "A valid access link or authorized account is required.",
    ],
    INVALID_UPLOAD: [
      400,
      "A file is not ready or does not belong to this response.",
    ],
  });
  const name =
    error.code === "23505"
      ? "DUPLICATE"
      : Object.keys(codes).find((k) => error.message === k);
  if (name) throw new ApiError(codes[name][0], name, codes[name][1]);
  if (error.code === "42501")
    throw new ApiError(403, "FORBIDDEN", "This action is not allowed.");
  if (["23514", "23502", "22P02", "22023"].includes(error.code))
    throw new ApiError(400, "VALIDATION_ERROR", "Check the supplied fields.");
  throw new ApiError(
    503,
    "TEMPORARILY_UNAVAILABLE",
    "This service is temporarily unavailable. Please try again.",
  );
}
