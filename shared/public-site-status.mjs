import * as z from "zod/mini";
import { isMaintenanceDestination } from "./site-status-policy.mjs";
// Keep the public projection independent of admin write/password schemas and
// the full schema-builder runtime. Server and browser consume this same parser.
export const publicSiteStatus = z
  .strictObject({
    revision: z.number().check(z.int(), z.minimum(1)),
    is_live: z.boolean(),
    message: z.union([
      z.string().check(
        z.trim(),
        z.minLength(2),
        z.maxLength(2000),
        z.refine(
          (v) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v),
        ),
      ),
      z.literal(""),
    ]),
    redirect_url: z
      .string()
      .check(z.trim(), z.maxLength(2000), z.refine(isMaintenanceDestination)),
    button_text: z.string().check(z.trim(), z.minLength(2), z.maxLength(80)),
    auto_redirect: z.boolean(),
  })
  .check(
    z.refine(
      (v) =>
        (!v.auto_redirect || v.redirect_url.startsWith("/l/")) &&
        (v.is_live || v.message.length >= 2),
      { message: "Invalid public maintenance configuration." },
    ),
  );
