import { z } from "zod";
export function approvedPushEndpoint(value) {
  try {
    const u = new URL(value),
      host = u.hostname;
    return (
      !/[\u0000-\u0020\u007f]/.test(value) &&
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.hash &&
      (!u.port || u.port === "443") &&
      (host === "fcm.googleapis.com" ||
        host === "updates.push.services.mozilla.com" ||
        host === "web.push.apple.com" ||
        host.endsWith(".web.push.apple.com") ||
        host === "notify.windows.com" ||
        host.endsWith(".notify.windows.com"))
    );
  } catch {
    return false;
  }
}
export const browserPushSubscription = z
  .object({
    endpoint: z
      .string()
      .max(4096)
      .refine(approvedPushEndpoint, "This push service is not supported."),
    expirationTime: z.number().finite().nonnegative().nullable().optional(),
    keys: z
      .object({
        p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}$/),
        auth: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
      })
      .strict(),
  })
  .strict();
export const pushDeviceAction = z
  .object({ eventId: z.string().uuid(), subscription: browserPushSubscription })
  .strict();
export const pushSubscribe = pushDeviceAction
  .extend({
    registrationToken: z
      .string()
      .regex(/^[A-Za-z0-9_-]{43}$/)
      .optional(),
  })
  .strict();
export const pushVerificationRequest = z
  .object({
    slug: z
      .string()
      .min(1)
      .max(150)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    email: z.string().trim().toLowerCase().email().max(255),
    website: z.string().max(200).default(""),
  })
  .strict();
export const pushVerificationProof = z
  .object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
  .strict();
export { pushNotification, canonicalPushClick } from "./push-policy.mjs";
