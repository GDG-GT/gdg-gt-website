import { z } from "zod";
export const maintenanceDestination = z
  .string()
  .trim()
  .max(2000)
  .refine((value) => {
    if (
      value === "" ||
      /^\/l\/[a-z0-9](?:[a-z0-9_-]{0,48}[a-z0-9])?$/.test(value)
    )
      return true;
    try {
      const u = new URL(value);
      return (
        u.protocol === "https:" &&
        ["gatech.edu", "www.gatech.edu", "gdg.community.dev"].includes(
          u.hostname,
        ) &&
        !u.username &&
        !u.password &&
        !u.port &&
        !u.search &&
        !u.hash &&
        !/[\u0000-\u0020\u007f]/.test(value) &&
        !/%(?:0[0-9a-f]|1[0-9a-f]|7f|2f|5c)/i.test(u.pathname)
      );
    } catch {
      return false;
    }
  }, "Use a local /l/ profile or an approved Georgia Tech/GDG HTTPS destination without query parameters.");
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
export const publicSiteStatus = z
  .object({
    revision: z.number().int().min(1),
    ...siteStatusFields.shape,
    message: siteStatusFields.shape.message.or(z.literal("")),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      !siteStatusFields.safeParse({
        is_live: v.is_live,
        message: v.is_live && v.message === "" ? "Live" : v.message,
        redirect_url: v.redirect_url,
        button_text: v.button_text,
        auto_redirect: v.auto_redirect,
      }).success
    )
      ctx.addIssue({
        code: "custom",
        message: "Invalid public maintenance configuration.",
      });
  });
export const maintenanceExemptPath = (path) =>
  /^\/admin(?:\/|$)/.test(path) ||
  /^\/l\/[a-z0-9_-]+$/.test(path) ||
  [
    "/maintenance",
    "/offline",
    "/privacy",
    "/accessibility",
    "/newsletter/confirm",
    "/newsletter/unsubscribe",
    "/account/setup",
    "/team/join",
  ].includes(path);
