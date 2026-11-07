import { z } from "zod";
const uuid = z.string().uuid(),
  revision = z.number().int().min(1);
const label = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine((v) => !/[\x00-\x1f\x7f]/.test(v));
const description = z
  .string()
  .trim()
  .max(1000)
  .refine((v) => !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v))
  .default("");
export const mediaTypes = {
  "image/png": { extensions: ["png"], kind: "image", limit: 20971520 },
  "image/jpeg": { extensions: ["jpg", "jpeg"], kind: "image", limit: 20971520 },
  "image/webp": { extensions: ["webp"], kind: "image", limit: 20971520 },
  "video/mp4": { extensions: ["mp4"], kind: "video", limit: 262144000 },
  "video/webm": { extensions: ["webm"], kind: "video", limit: 262144000 },
  "audio/mpeg": { extensions: ["mp3"], kind: "audio", limit: 52428800 },
  "audio/wav": { extensions: ["wav"], kind: "audio", limit: 52428800 },
  "audio/ogg": { extensions: ["ogg", "oga"], kind: "audio", limit: 52428800 },
  "application/pdf": { extensions: ["pdf"], kind: "document", limit: 26214400 },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    extensions: ["docx"],
    kind: "document",
    limit: 26214400,
  },
  "text/plain": { extensions: ["txt"], kind: "document", limit: 26214400 },
  "text/markdown": {
    extensions: ["md", "markdown"],
    kind: "document",
    limit: 26214400,
  },
  "application/zip": { extensions: ["zip"], kind: "archive", limit: 26214400 },
};
export const mediaUploadIntent = z
  .object({
    teamId: uuid.nullable(),
    folderId: uuid.nullable(),
    filename: z.string().trim().min(1).max(180),
    mime: z.string().refine((v) => Object.hasOwn(mediaTypes, v)),
    bytes: z.number().int().min(1).max(262144000),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const mediaPublication = z
  .object({
    action: z.enum(["publish", "revoke"]),
    revision,
    currentPassword: z.string().min(1).max(1024),
    confirmation: z.string().max(80),
  })
  .strict();
export const mediaFolderCreate = z
  .object({
    name: label,
    description,
    teamId: uuid.nullable(),
    parentId: uuid.nullable(),
  })
  .strict();
export const mediaFolderUpdate = z.discriminatedUnion("action", [
  z
    .object({ action: z.literal("update"), revision, name: label, description })
    .strict(),
  z
    .object({ action: z.literal("move"), revision, parentId: uuid.nullable() })
    .strict(),
]);
export const mediaFolderRemove = z.object({ revision }).strict();
const selected = z
  .array(z.object({ id: uuid, revision }).strict())
  .min(1)
  .max(50)
  .refine(
    (items) => new Set(items.map((item) => item.id)).size === items.length,
  );
const metadata = z
  .object({
    name: label,
    alt: z
      .string()
      .trim()
      .max(300)
      .refine((v) => !/[\x00-\x1f\x7f]/.test(v)),
    description,
    tags: z
      .array(
        z
          .string()
          .trim()
          .min(1)
          .max(40)
          .refine((v) => !/[\x00-\x1f\x7f]/.test(v)),
      )
      .max(20)
      .refine(
        (items) =>
          new Set(items.map((v) => v.toLowerCase())).size === items.length,
      ),
    eventId: uuid.nullable(),
    order: z.number().int().min(0).max(1000000),
    allowDownload: z.boolean(),
    seoTitle: z
      .string()
      .trim()
      .max(255)
      .refine((v) => !/[\x00-\x1f\x7f]/.test(v))
      .default(""),
    seoDescription: description,
  })
  .strict();
export const mediaFileMutation = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("tags"),
      files: selected,
      document: z
        .object({
          mode: z.enum(["add", "remove", "replace"]),
          tags: metadata.shape.tags,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      action: z.literal("metadata"),
      files: selected.refine((items) => items.length === 1),
      document: metadata,
    })
    .strict(),
  z
    .object({
      action: z.literal("star"),
      files: selected,
      document: z.object({ starred: z.boolean() }).strict(),
    })
    .strict(),
  z
    .object({
      action: z.literal("move"),
      files: selected,
      document: z
        .object({ teamId: uuid.nullable(), folderId: uuid.nullable() })
        .strict(),
    })
    .strict(),
  z
    .object({
      action: z.literal("archive"),
      files: selected,
      document: z.object({}).strict(),
    })
    .strict(),
  z
    .object({
      action: z.literal("restore"),
      files: selected,
      document: z.object({}).strict(),
    })
    .strict(),
]);
export const mediaListQuery = z
  .object({
    view: z.enum(["library", "gallery"]).default("library"),
    cursor: z.string().regex(/^[A-Za-z0-9_-]+$/).max(512).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).default(30),
    q: z.string().trim().max(100).optional(),
    team: z.union([uuid, z.literal("chapter")]).optional(),
    folder: z.union([uuid, z.literal("root")]).optional(),
    type: z
      .enum(["image", "video", "audio", "document", "archive", "other"])
      .optional(),
    state: z.enum(["current", "trash"]).default("current"),
    starred: z.enum(["true", "false"]).optional(),
    tag: z.string().trim().max(40).optional(),
  })
  .strict();
