import { emailDocument, escapeEmail, safeEmailLink } from "./email.mjs";
import { z } from "zod";
const uuid = z.string().uuid(),
  revision = z.number().int().min(1),
  line = (max, min = 0) =>
    z
      .string()
      .trim()
      .min(min)
      .max(max)
      .refine((v) => !/[\x00-\x1f\x7f]/.test(v)),
  prose = z
    .string()
    .trim()
    .min(1)
    .max(30000)
    .refine((v) => !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v));
export const sendReview = z.object({ revision }).strict();
export const sendCommit = z
  .object({
    reviewId: uuid,
    reviewToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    currentPassword: z.string().min(1).max(1024),
    confirmation: line(30, 1),
    scheduledAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict();
export const sendCancel = z
  .object({
    revision,
    currentPassword: z.string().min(1).max(1024),
    confirmation: z.literal("CANCEL SEND"),
  })
  .strict();
export const sendTest = z
  .object({
    revision,
    currentPassword: z.string().min(1).max(1024),
    confirmation: z.literal("SEND TEST"),
  })
  .strict();
export const subscriberBulk = z
  .object({
    action: z.enum(["archive", "restore", "deactivate"]),
    records: z
      .array(z.object({ id: uuid, revision }).strict())
      .min(1)
      .max(50)
      .refine((items) => new Set(items.map((r) => r.id)).size === items.length),
    confirmation: line(30, 1),
    currentPassword: z.string().min(1).max(1024),
  })
  .strict();
export const newsletterList = z
  .object({
    team: z.union([uuid, z.literal("chapter")]).optional(),
    q: line(100).default(""),
    state: z.enum(["current", "trash"]).default("current"),
    status: z
      .enum([
        "pending",
        "active",
        "unsubscribed",
        "draft",
        "scheduled",
        "sending",
        "sent",
        "failed",
        "cancelled",
      ])
      .optional(),
    page: z.coerce.number().int().min(1).max(10000).default(1),
  })
  .strict();
export const subscriberCreate = z
  .object({
    teamId: uuid.nullable(),
    email: z.string().trim().toLowerCase().email().max(254),
    name: line(100).default(""),
    consentAcknowledged: z.literal(true),
  })
  .strict();
export const subscriberMutation = z.discriminatedUnion("action", [
  z.object({ action: z.literal("update"), revision, name: line(100) }).strict(),
  z
    .object({ action: z.enum(["deactivate", "archive", "restore"]), revision })
    .strict(),
]);
export const newsletterTemplate = z
  .object({
    name: line(150, 1),
    description: line(1000).default(""),
    content: prose,
  })
  .strict();
export const newsletterCampaign = z
  .object({
    subject: line(200, 1),
    content: prose,
    audience: z.enum(["all", "custom"]),
    recipientIds: z
      .array(uuid)
      .max(1000)
      .refine((ids) => new Set(ids).size === ids.length),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      (v.audience === "all" && v.recipientIds.length) ||
      (v.audience === "custom" && !v.recipientIds.length)
    )
      ctx.addIssue({
        code: "custom",
        message: "Select existing confirmed subscribers for a custom audience.",
        path: ["recipientIds"],
      });
  });
export const templateCreate = z
  .object({ teamId: uuid.nullable(), record: newsletterTemplate })
  .strict();
export const campaignCreate = z
  .object({ teamId: uuid.nullable(), record: newsletterCampaign })
  .strict();
export const templateMutation = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("update"),
      revision,
      record: newsletterTemplate,
    })
    .strict(),
  z.object({ action: z.enum(["archive", "restore"]), revision }).strict(),
]);
export const campaignMutation = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("update"),
      revision,
      record: newsletterCampaign,
    })
    .strict(),
  z
    .object({ action: z.enum(["archive", "restore", "duplicate"]), revision })
    .strict(),
]);
export function newsletterPreview(subject, content, unsubscribe = null) {
  const footerHtml =
    unsubscribe && safeEmailLink(unsubscribe)
      ? `<a href="${escapeEmail(unsubscribe)}" style="color:#9b3326">Unsubscribe from this newsletter</a>`
      : "Chapter news and events · gdggt.dev";
  return emailDocument({ subject, content, footerHtml });
}
