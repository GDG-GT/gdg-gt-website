import { z } from "zod";
export const teamChatSetup = z
  .object({
    currentPassword: z.string().min(1).max(128),
    confirmation: z
      .string()
      .trim()
      .min(2)
      .max(100)
      .refine(
        (v) => !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v),
        "Remove control characters.",
      ),
  })
  .strict();
