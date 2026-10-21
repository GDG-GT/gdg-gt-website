import { z } from "zod";
import { linktreeUrl } from "./linktree.mjs";
const text = (max, min = 0) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((v) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v));
const url = z.union([linktreeUrl, z.literal("")]).default("");
const date = z
  .union([
    z
      .string()
      .regex(/^[1-9]\d{3}-\d{2}-\d{2}$/)
      .refine(
        (v) =>
          !Number.isNaN(Date.parse(v)) &&
          new Date(v).toISOString().slice(0, 10) === v,
      ),
    z.literal(""),
  ])
  .default("");
const labels = (max) =>
  z
    .array(text(50, 1))
    .max(max)
    .refine(
      (v) => new Set(v.map((s) => s.toLowerCase())).size === v.length,
      "Remove duplicate labels.",
    );
export const projectRecord = z
  .object({
    title: text(200, 2),
    description: text(20000, 2),
    short_description: text(500).default(""),
    image_url: z
      .union([url, z.string().regex(/^\/assets\/[a-zA-Z0-9._-]+$/)])
      .default(""),
    github_url: url,
    demo_url: url,
    tech_stack: labels(50).default([]),
    tags: labels(30).default([]),
    category: text(100, 1).default("web"),
    status: z
      .enum(["active", "completed", "on_hold", "archived"])
      .default("active"),
    difficulty_level: z
      .enum(["beginner", "intermediate", "advanced"])
      .default("intermediate"),
    team_size: z.number().int().min(1).max(1000).default(1),
    start_date: date,
    end_date: date,
    is_featured: z.boolean().default(false),
    is_open_source: z.boolean().default(true),
  })
  .strict()
  .refine((v) => !v.start_date || !v.end_date || v.end_date >= v.start_date, {
    message: "The end date must follow the start date.",
    path: ["end_date"],
  });
const revision = z.number().int().min(1);
export const projectCreate = z
  .object({ record: projectRecord, teamId: z.string().uuid().nullable() })
  .strict();
export const projectMutation = z.discriminatedUnion("action", [
  z
    .object({ action: z.literal("update"), revision, record: projectRecord })
    .strict(),
  z
    .object({
      action: z.enum(["archive", "restore"]),
      revision,
      currentPassword: z.string().min(1).max(128),
      confirmation: text(200, 2),
    })
    .strict(),
  z
    .object({
      action: z.literal("member_save"),
      revision,
      email: z.string().trim().toLowerCase().email().max(254),
      role: text(100, 1),
    })
    .strict(),
  z
    .object({
      action: z.literal("member_remove"),
      revision,
      memberId: z.string().uuid(),
    })
    .strict(),
]);
