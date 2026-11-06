import { z } from "zod";
import { isMaintenanceDestination } from "./site-status-policy.mjs";
export const maintenanceDestination = z
  .string()
  .trim()
  .max(2000)
  .refine(
    isMaintenanceDestination,
    "Use a local /l/ profile or an approved Georgia Tech/GDG HTTPS destination without query parameters.",
  );
export const siteStatusFields = z
  .object({
    is_live: z.boolean(),
    message: z
      .string()
      .trim()
      .min(2)
      .max(2000)
      .refine((v) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v)),
    redirect_url: maintenanceDestination,
    button_text: z.string().trim().min(2).max(80),
    auto_redirect: z.boolean(),
  })
  .strict()
  .refine((v) => !v.auto_redirect || v.redirect_url.startsWith("/l/"), {
    path: ["auto_redirect"],
    message:
      "Automatic redirects are limited to an approved local Linktree profile; external destinations are visitor-selected links.",
  });
export const siteStatusChange = z
  .object({
    revision: z.number().int().min(1),
    record: siteStatusFields,
    currentPassword: z.string().min(1).max(128),
    confirmation: z.enum(["LIVE", "MAINTENANCE"]),
  })
  .strict()
  .refine(
    (v) => v.confirmation === (v.record.is_live ? "LIVE" : "MAINTENANCE"),
  );
export { publicSiteStatus } from "./public-site-status.mjs";
export { maintenanceExemptPath } from "./site-status-policy.mjs";
