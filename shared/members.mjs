import { z } from "zod";
const text = (max, min = 0) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((v) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v));
export const memberCategories = [
  "founder",
  "organizer",
  "lead",
  "active",
  "member",
  "alumni",
];
export const communityMemberRecord = z
  .object({
    name: text(100, 2),
    email: z.string().trim().toLowerCase().email().max(254),
    phone: text(50).default(""),
    year: text(50).default(""),
    major: text(150).default(""),
    category: z.enum(memberCategories).default("member"),
    interests: z
      .array(
        text(100, 1).refine(
          (v) => !/[\r\n]/.test(v),
          "Use one interest per line.",
        ),
      )
      .max(30)
      .refine(
        (v) => new Set(v.map((s) => s.toLowerCase())).size === v.length,
        "Remove duplicate interests.",
      )
      .default([]),
    is_active: z.boolean().default(true),
    is_core_team: z.boolean().default(false),
    team_section: text(100, 1).default("Active Members"),
  })
  .strict();
const revision = z.number().int().min(1),
  uuid = z.string().uuid(),
  confirmation = text(40, 1),
  currentPassword = z.string().min(1).max(128);
export const communityMemberCreate = z
  .object({ record: communityMemberRecord, teamId: uuid.nullable() })
  .strict();
export const communityMemberMutation = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("update"),
      revision,
      record: communityMemberRecord,
    })
    .strict(),
  z
    .object({
      action: z.enum(["archive", "restore", "sync_profile", "unmerge"]),
      revision,
      confirmation,
      currentPassword,
      profileRevision: revision.optional(),
    })
    .strict(),
]);
export const communityMemberInspection = z.union([
  communityMemberMutation.options[0],
  communityMemberMutation.options[1].omit({ currentPassword: true }),
]);
export const memberMergePreview = z
  .object({
    sourceId: uuid,
    targetId: uuid,
    sourceRevision: revision,
    targetRevision: revision,
  })
  .strict()
  .refine((v) => v.sourceId !== v.targetId);
export const memberMergeCommit = z
  .object({
    reviewId: uuid,
    reviewToken: z.string().regex(/^[a-zA-Z0-9_-]{43}$/),
    sourceConfirmation: confirmation,
    targetConfirmation: confirmation,
    currentPassword,
  })
  .strict();

export const memberMergeInspection = memberMergeCommit.omit({
  currentPassword: true,
});
