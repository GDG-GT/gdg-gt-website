import { z } from "zod";
const uuid = z.string().uuid(), revision = z.number().int().min(1);
const label = z.string().trim().min(1).max(100).refine((v) => !/[\x00-\x1f\x7f]/.test(v));
const description = z.string().trim().max(1000).refine((v) => !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v)).default("");
export const mediaFolderCreate = z.object({ name: label, description, teamId: uuid.nullable(), parentId: uuid.nullable() }).strict();
export const mediaFolderUpdate = z.discriminatedUnion("action", [
  z.object({ action: z.literal("update"), revision, name: label, description }).strict(),
  z.object({ action: z.literal("move"), revision, parentId: uuid.nullable() }).strict(),
]);
export const mediaFolderRemove = z.object({ revision }).strict();
export const mediaListQuery = z.object({ page: z.coerce.number().int().min(1).max(10000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(30),
  q: z.string().trim().max(100).optional(), team: z.union([uuid,z.literal("chapter")]).optional(), folder: z.union([uuid,z.literal("root")]).optional(),
  type: z.enum(["image","video","audio","document","archive","other"]).optional(), state: z.enum(["current","trash"]).default("current"),
  starred: z.enum(["true","false"]).optional(), tag: z.string().trim().max(40).optional() }).strict();
