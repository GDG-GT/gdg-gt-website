import { z } from "zod";
const id = z.string().uuid(),
  title = z.string().trim().min(2).max(120),
  revision = z.number().int().positive();
const edit = { id: id.optional(), revision: revision.optional() };
const requireRevision = (v) => !v.id || !!v.revision;
export const rewardAdminSchemas = {
  rule: z
    .object({
      ...edit,
      title,
      points: z.number().int().min(1).max(10000),
      active: z.boolean(),
    })
    .strict()
    .refine(requireRevision),
  activity: z.union([
    z
      .object({
        title: z.string().trim().min(2).max(160),
        ruleId: id,
        opensAt: z.string().datetime(),
        closesAt: z.string().datetime(),
      })
      .strict()
      .refine(
        (v) =>
          Date.parse(v.closesAt) > Date.parse(v.opensAt) &&
          Date.parse(v.closesAt) - Date.parse(v.opensAt) <= 31 * 86400000,
      ),
    z.object({ id, revision, active: z.boolean() }).strict(),
  ]),
  perk: z
    .object({
      ...edit,
      title,
      description: z.string().trim().min(2).max(2000),
      threshold: z.number().int().min(0).max(1000000),
      inventory: z.number().int().min(0).max(100000).nullable(),
      active: z.boolean(),
    })
    .strict()
    .refine(requireRevision),
  credential: z
    .object({
      memberId: id,
      kind: z.enum(["card", "qr", "wallet"]),
      label: z.string().trim().min(1).max(80),
    })
    .strict(),
  revoke: z.object({ id }).strict(),
  award: z
    .object({ memberId: id, activityId: id, credentialId: id.optional() })
    .strict(),
  adjust: z
    .object({
      memberId: id,
      points: z
        .number()
        .int()
        .min(-10000)
        .max(10000)
        .refine((v) => v !== 0),
      reason: z.string().trim().min(2).max(500),
    })
    .strict(),
  reverse: z.object({ id, reason: z.string().trim().min(2).max(500) }).strict(),
  claim_status: z
    .object({
      id,
      revision,
      status: z.enum(["approved", "rejected", "fulfilled"]),
    })
    .strict(),
};
export const rewardMemberSchemas = {
  profile: z
    .object({
      alias: z
        .string()
        .trim()
        .max(40)
        .refine((v) => !v || v.length >= 2),
      public: z.boolean(),
    })
    .strict()
    .refine((v) => !v.public || v.alias.length >= 2),
  claim: z.object({ perkId: id }).strict(),
  cancel: z.object({ id }).strict(),
};
export function parseCardPayload(value, origin = "https://gdggt.dev") {
  if (typeof value !== "string" || value.length > 300) return null;
  if (/^[A-Za-z0-9_-]{43}$/.test(value)) return value;
  try {
    const u = new URL(value);
    if (
      u.origin !== origin ||
      u.pathname !== "/tap" ||
      u.search ||
      u.username ||
      u.password
    )
      return null;
    const p = new URLSearchParams(u.hash.slice(1));
    const tokens = p.getAll("card");
    if ([...p.keys()].some((k) => k !== "card") || tokens.length !== 1)
      return null;
    return /^[A-Za-z0-9_-]{43}$/.test(tokens[0]) ? tokens[0] : null;
  } catch {
    return null;
  }
}
export function cardUrl(origin, credential) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(credential)) throw Error("Invalid card");
  return new URL("/tap#card=" + credential, origin).href;
}
