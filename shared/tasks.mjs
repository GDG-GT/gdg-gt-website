import { z } from "zod";
const text = (max, min = 0) =>
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
export const taskDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(value + "T00:00:00.000Z");
    return (
      Number.isFinite(date.getTime()) &&
      date.getUTCFullYear() > 0 &&
      date.toISOString().slice(0, 10) === value
    );
  }, "Choose a valid calendar date.");
export const taskDetails = z
  .object({
    title: text(200, 2),
    description: text(10000).default(""),
    dueDate: taskDate.nullable().default(null),
    priority: z.enum(["low", "medium", "high"]).default("medium"),
    tags: z.array(text(40, 1)).max(12).default([]),
  })
  .strict();
export const taskCreate = taskDetails
  .extend({
    teamId: z.string().uuid().nullable().default(null),
    assigneeEmail: z.string().trim().toLowerCase().email().max(255).optional(),
  })
  .strict();
export const taskMutation = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("update"),
      revision: z.number().int().positive(),
      record: taskDetails,
    })
    .strict(),
  z
    .object({
      action: z.literal("status"),
      revision: z.number().int().positive(),
      status: z.enum(["pending", "in-progress", "completed"]),
    })
    .strict(),
  z
    .object({
      action: z.enum(["archive", "restore"]),
      revision: z.number().int().positive(),
      confirmation: text(200, 2),
    })
    .strict(),
  z
    .object({
      action: z.literal("assign"),
      revision: z.number().int().positive(),
      assigneeEmail: z.string().trim().toLowerCase().email().max(255),
      currentPassword: z.string().min(1).max(128),
      confirmation: text(200, 2),
    })
    .strict(),
]);
export const taskComment = z.object({ comment: text(5000, 1) }).strict();
export const taskCommentMutation = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("edit"),
      revision: z.number().int().positive(),
      comment: text(5000, 1),
    })
    .strict(),
  z
    .object({
      action: z.literal("delete"),
      revision: z.number().int().positive(),
    })
    .strict(),
]);
