import { z } from "zod";
const token = z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  uuid = z.string().uuid();
const text = (max, min = 0) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((v) => !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v));
export const contactFileTypes = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
];
export const contactUploadIntent = z
  .object({
    filename: text(180, 1),
    mime: z.enum(contactFileTypes),
    bytes: z.number().int().min(1).max(10485760),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    uploadToken: token,
    website: z.literal("").default(""),
  })
  .strict();
export const contactUploadProof = z.object({ uploadToken: token }).strict();
export const contactSubmission = z
  .object({
    name: text(100, 2),
    email: z.string().trim().toLowerCase().email().max(254),
    type: z.enum([
      "general",
      "membership",
      "event",
      "sponsorship",
      "speaker",
      "accessibility",
    ]),
    message: text(5000, 20),
    interests: z.array(text(100)).max(20).default([]),
    website: z.literal("").default(""),
    attachment: z
      .object({ uploadId: uuid, uploadToken: token })
      .strict()
      .optional(),
  })
  .strict();
export const contactInboxQuery = z
  .object({
    q: text(100).default(""),
    status: z.enum(["new", "in_progress", "resolved", "redacted"]).optional(),
    page: z.coerce.number().int().min(1).max(10000).default(1),
  })
  .strict();
export const contactMutation = z
  .discriminatedUnion("action", [
    z
      .object({
        action: z.literal("status"),
        revision: z.number().int().positive(),
        status: z.enum(["new", "in_progress", "resolved"]),
      })
      .strict(),
    z
      .object({
        action: z.literal("hold"),
        revision: z.number().int().positive(),
        enabled: z.boolean(),
        reason: text(1000).default(""),
        currentPassword: z.string().min(1).max(1024),
        confirmation: z.enum(["HOLD CONTACT", "RELEASE HOLD"]),
      })
      .strict(),
  ])
  .superRefine((v, ctx) => {
    if (
      v.action === "hold" &&
      (v.confirmation !== (v.enabled ? "HOLD CONTACT" : "RELEASE HOLD") ||
        (v.enabled && v.reason.length < 10))
    )
      ctx.addIssue({
        code: "custom",
        message: "Confirm this hold action and explain an enabled hold.",
        path: ["confirmation"],
      });
  });
export const contactMutationInspection = z
  .discriminatedUnion("action", [
    contactMutation.options[0],
    contactMutation.options[1].omit({ currentPassword: true }),
  ])
  .superRefine((v, ctx) => {
    if (
      v.action === "hold" &&
      (v.confirmation !== (v.enabled ? "HOLD CONTACT" : "RELEASE HOLD") ||
        (v.enabled && v.reason.length < 10))
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Review the retention hold and confirmation again.",
      });
  });
