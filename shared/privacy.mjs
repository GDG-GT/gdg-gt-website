import { z } from "zod";
const text = (min, max) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine(
      (value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),
      "Remove control characters.",
    );
export const personPrivacyReview = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    action: z.enum(["export", "redact", "delete"]),
    purpose: text(20, 500),
    identityVerified: z.literal(true),
    responseIds: z
      .array(z.string().uuid())
      .max(20)
      .default([])
      .refine(
        (ids) => new Set(ids).size === ids.length,
        "Select each response once.",
      ),
    includeSensitive: z.boolean().default(false),
    currentPassword: z.string().min(1).max(1024),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.action !== "export" && value.includeSensitive)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["includeSensitive"],
        message: "Sensitive-answer export is separate from erasure.",
      });
  });
export const personPrivacyCommit = z
  .object({
    reviewId: z.string().uuid(),
    reviewToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    confirmation: text(1, 80),
    currentPassword: z.string().min(1).max(1024),
  })
  .strict();
export function privacyConfirmation(action, count) {
  if (
    !["export", "redact", "delete"].includes(action) ||
    !Number.isSafeInteger(count) ||
    count < 0 ||
    count > 500
  )
    throw Error("Invalid privacy confirmation");
  return `${action.toUpperCase()} ${count} RECORDS`;
}
