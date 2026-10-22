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
    CONTACT_UPLOAD_QUOTA: [
      429,
      "Up to three contact files may upload at once and ten may be requested per network per day. Wait or send your message without an attachment.",
    ],
    NEWSLETTER_EXPORT_LIMIT: [
      409,
      "Narrow your filters to at most 1,000 subscribers before exporting.",
    ],
    NEWSLETTER_AUDIENCE_LIMIT: [
      409,
      "Choose 1–1,000 confirmed, unsuppressed subscribers in this scope. Use a custom confirmed audience when the full list exceeds the cap.",
    ],
    NEWSLETTER_REVIEW_EXPIRED: [
      409,
      "This send review expired, was used, changed or belongs to another session. Preview the campaign again.",
    ],
    NEWSLETTER_REVIEW_LIMIT: [
      429,
      "Wait before generating more campaign reviews.",
    ],
    NEWSLETTER_SEND_LIMIT: [
      429,
      "Up to ten campaign approvals may be created per account per day. Wait before another send.",
    ],
    NEWSLETTER_TEST_LIMIT: [
      429,
      "Up to ten self-only test sends may be requested per account per day.",
    ],
    NEWSLETTER_LOCKED: [
      409,
      "Approved, scheduled or sent campaigns cannot be rewritten. Cancel active work or duplicate it into a new private draft.",
    ],
    NEWSLETTER_RETAINED: [
      409,
      "Subscriber identity and scope are retained. Deactivate or archive the existing record; a new address needs separate double opt-in.",
    ],
    MEDIA_CLEANUP_STARTED: [
      409,
      "Physical cleanup has begun for this archived file. Its original bytes can no longer be restored.",
    ],
    MEDIA_PUBLICATION_BLOCKED: [
      409,
      "Only a clean private raster image with meaningful alt text, an active scope and a published associated event can be approved for the gallery.",
    ],
    MEDIA_QUOTA: [
      409,
      "Media limits reached: five active uploads, 25 files/500 MiB per account per day, or 1 GiB/1,000 retained files per scope. Wait or ask an administrator to review retention.",
    ],
    MEDIA_IN_USE: [
      409,
      "Revoke publication and resolve usage references or active uploads before moving, editing or archiving this file.",
    ],
    MEDIA_FOLDER_CYCLE: [
      409,
      "Choose a destination outside this folder’s descendants and within eight levels.",
    ],
    MEDIA_FOLDER_NOT_EMPTY: [
      409,
      "Move or finish removing the folder’s files and child folders first.",
    ],
    FORM_DELETION_BLOCKED: [
      409,
      "Archive the form, resolve active references, and complete its retention/hold review before permanent deletion.",
    ],
    FORM_DELETION_REVIEW: [
      409,
      "The deletion review expired or belongs to another session. Start a new review.",
    ],
    FORM_RECEIPT_IDENTITY: [
      409,
      "Receipts require verified email, an individual invitation, or a signed-in chapter account.",
    ],
    FORM_DELIVERY_REVIEW_REQUIRED: [
      409,
      "Save this draft and review its delivery settings before enabling receipts.",
    ],
    FORM_EXPORT_QUOTA: [
      429,
      "Up to three exports may run at once and twenty may be created per day. Wait or cancel an unused export.",
    ],
    FORM_EXPORT_RANGE: [
      409,
      "Choose at most 20,000 responses. Exports above 10,000 also need both start and end date filters.",
    ],
    FORM_EXPORT_CHANGED: [
      409,
      "A response was edited, redacted or deleted. Create a new export of the current data.",
    ],
    BLOG_RETAINED: [
      409,
      "Archive or restore editorial records; permanent deletion is disabled.",
    ],
    MEMBER_RETAINED: [
      409,
      "Archive community records; permanent deletion is disabled.",
    ],
    MEMBER_IMPORT_REVIEW: [
      409,
      "This import review expired, was used or no longer matches. Review the same file and destination again.",
    ],
    MEMBER_EXPORT_RANGE: [
      409,
      "Narrow your member filters to at most 1,000 records and a smaller export.",
    ],
    MEMBER_LINK_REVIEW: [
      409,
      "Review and remove active project memberships and archive linked public profiles before merging this source.",
    ],
    MEMBER_REVIEW_EXPIRED: [
      409,
      "This merge review expired or was used. Generate a new review.",
    ],
    PROJECT_RETAINED: [
      409,
      "Archive or restore projects; permanent deletion is disabled.",
    ],
    PROJECT_MEMBER_LIMIT: [
      409,
      "A project supports up to 100 active participants.",
    ],
    LINKTREE_RETAINED: [
      409,
      "Archive or restore this profile/link; permanent deletion is disabled.",
    ],
    LINKTREE_LIMIT: [
      409,
      "A profile supports up to 100 current links. Archive an unused link first.",
    ],
    BUDGET_UNAVAILABLE: [
      409,
      "Choose an active budget in this request's scope and date range.",
    ],
    BUDGET_EXCEEDED: [
      409,
      "This change exceeds the budget or conflicts with committed request dates.",
    ],
    BUDGET_IN_USE: [
      409,
      "Resolve pending or reserved requests before closing this budget.",
    ],
    FINANCE_RETAINED: [
      409,
      "Financial records are retained; deletion is disabled.",
    ],
    FINANCE_IMMUTABLE: [
      409,
      "Submitted financial details and final decisions cannot be rewritten.",
    ],
    EXPORT_TOO_LARGE: [
      409,
      "Narrow the export filters to at most 1,000 records and a smaller file.",
    ],
    TEAM_MANAGED_CHAT: [
      409,
      "Team chat access and moderation follow current team memberships. Manage them in Teams.",
    ],
    AUDIENCE_LIMIT: [409, "Choose an audience with 1–1,000 active recipients."],
    AUDIENCE_CHANGED: [
      409,
      "The audience changed. Preview it again before confirming.",
    ],
    PREVIEW_REQUIRED: [
      409,
      "A current audience preview from this session is required.",
    ],
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
  if (["40P01", "40001"].includes(error.code))
    throw new ApiError(
      409,
      "CONFLICT",
      "A concurrent change interrupted this operation. Reload before retrying.",
    );
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
