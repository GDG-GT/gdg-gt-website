import { z } from "zod";
const plain = (max, min = 0) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine(
      (v) => !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v),
      "Remove control characters.",
    );
const unique = (values) => new Set(values).size === values.length;
const instant = z
  .string()
  .datetime({ offset: true })
  .refine(
    (v) => Number.isFinite(Date.parse(v)) && Number(v.slice(0, 4)) > 0,
    "Choose a valid calendar instant.",
  );
export const announcementAudience = z.discriminatedUnion("type", [
  z.object({ type: z.literal("all") }).strict(),
  z
    .object({
      type: z.literal("roles"),
      roles: z
        .array(z.enum(["super_admin", "admin", "team_member", "blog_editor"]))
        .min(1)
        .max(4)
        .refine(unique, "Remove duplicate roles."),
    })
    .strict(),
  z
    .object({
      type: z.literal("teams"),
      teamIds: z
        .array(z.string().uuid())
        .min(1)
        .max(20)
        .refine(unique, "Remove duplicate teams."),
    })
    .strict(),
  z
    .object({
      type: z.literal("users"),
      emails: z
        .array(z.string().trim().toLowerCase().email().max(255))
        .min(1)
        .max(100)
        .refine(unique, "Remove duplicate emails."),
    })
    .strict(),
]);
export const chapterAnnouncementRecord = z
  .object({
    title: plain(200, 2),
    message: plain(10000, 2),
    priority: z.enum(["low", "medium", "high"]).default("medium"),
    pinned: z.boolean().default(false),
    audience: announcementAudience,
    scheduledFor: instant.nullable().default(null),
    expiresAt: instant.nullable().default(null),
    emailEnabled: z.boolean().default(false),
  })
  .strict()
  .refine(
    (v) =>
      !v.scheduledFor ||
      !v.expiresAt ||
      Date.parse(v.expiresAt) > Date.parse(v.scheduledFor),
    "Expiry must follow publication time.",
  );
export const chapterAnnouncementCreate = z
  .object({ record: chapterAnnouncementRecord })
  .strict();
export const chapterAnnouncementAction = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("update"),
      revision: z.number().int().positive(),
      record: chapterAnnouncementRecord,
    })
    .strict(),
  z
    .object({
      action: z.enum(["unpublish", "cancel_schedule", "archive", "restore"]),
      revision: z.number().int().positive(),
      confirmation: plain(200, 2),
    })
    .strict(),
  z
    .object({
      action: z.literal("pin"),
      revision: z.number().int().positive(),
      pinned: z.boolean(),
    })
    .strict(),
  z
    .object({
      action: z.literal("read"),
      publicationVersion: z.number().int().positive(),
    })
    .strict(),
]);
export const chapterAnnouncementPreview = z
  .object({ revision: z.number().int().positive() })
  .strict();
export const chapterAnnouncementConfirm = z
  .object({
    revision: z.number().int().positive(),
    previewId: z.string().uuid(),
    confirmation: plain(200, 2),
    currentPassword: z.string().min(1).max(128),
  })
  .strict();
