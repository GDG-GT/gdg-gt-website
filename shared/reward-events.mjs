import { presentedCredential } from "./card-presentation.mjs";
import { z } from "zod";
const id = z.string().uuid();
export const eventConnection = z
  .object({
    id: id.optional(),
    revision: z.number().int().positive().optional(),
    title: z.string().trim().min(2).max(120),
    origin: z
      .string()
      .url()
      .max(300)
      .refine((v) => {
        try {
          const u = new URL(v);
          return (
            u.protocol === "https:" &&
            u.href === u.origin + "/" &&
            !u.username &&
            !u.password &&
            !u.port &&
            !u.hostname.endsWith(".") &&
            u.hostname.includes(".")
          );
        } catch {
          return false;
        }
      }, "Use an HTTPS origin ending in /."),
    opensAt: z.string().datetime(),
    closesAt: z.string().datetime(),
    active: z.boolean(),
    activityId: id.nullable(),
  })
  .strict()
  .refine((v) => !v.id || !!v.revision)
  .refine(
    (v) =>
      Date.parse(v.closesAt) > Date.parse(v.opensAt) &&
      Date.parse(v.closesAt) - Date.parse(v.opensAt) <= 31 * 86400000,
  );
export const eventAdminInputs = {
  save: eventConnection,
  rotate: z.object({ id, revision: z.number().int().positive() }).strict(),
  revoke: z.object({ id, revision: z.number().int().positive() }).strict(),
  lookup: z
    .object({
      eventId: id,
      credential: presentedCredential,
    })
    .strict(),
  confirm: z.object({ reviewId: id }).strict(),
  points: z.object({ checkinId: id }).strict(),
};
export const adapterResult = z
  .object({
    status: z.enum(["registered", "waitlisted", "cancelled", "not_registered"]),
    checkedIn: z.boolean(),
    checkinId: z.string().min(1).max(100).nullable(),
  })
  .strict()
  .refine((v) => !v.checkedIn || (v.status === "registered" && !!v.checkinId));
