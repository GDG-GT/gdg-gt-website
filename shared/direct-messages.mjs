import { z } from "zod";
const plain = (max, min = 1) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine(
      (v) => !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v),
      "Remove control characters.",
    );
export const directCreate = z
  .object({
    recipientEmail: z.string().trim().toLowerCase().email().max(255),
    subject: plain(200),
    message: plain(10000),
  })
  .strict();
export const directReply = z
  .object({
    message: plain(10000),
    replyToId: z.string().uuid().nullable().default(null),
  })
  .strict();
export const directEdit = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("edit"),
      revision: z.number().int().positive(),
      message: plain(10000),
    })
    .strict(),
  z
    .object({
      action: z.literal("delete"),
      revision: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      action: z.literal("restore"),
      revision: z.number().int().positive(),
    })
    .strict(),
]);
export const directThreadAction = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("archive"),
      revision: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      action: z.literal("restore"),
      revision: z.number().int().positive(),
    })
    .strict(),
  z
    .object({ action: z.literal("read"), throughId: z.string().uuid() })
    .strict(),
]);
export const directReview = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("start"),
      reason: plain(500, 10),
      currentPassword: z.string().min(1).max(256),
    })
    .strict(),
  z.object({ action: z.literal("stop") }).strict(),
]);
