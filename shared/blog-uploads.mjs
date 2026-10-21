import { z } from "zod";
export const blogFileTypes = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "image/png",
  "image/jpeg",
  "image/webp",
];
export const blogFileIntent = z
  .object({
    teamId: z.string().uuid().nullable(),
    filename: z.string().min(1).max(180),
    mime: z.enum(blogFileTypes),
    bytes: z.number().int().min(1).max(20971520),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
