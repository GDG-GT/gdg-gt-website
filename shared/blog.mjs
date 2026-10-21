import { z } from "zod";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import remarkGfm from "remark-gfm";
import { linktreeUrl } from "./linktree.mjs";

const text = (max, min = 0) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((v) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v));
const url = z.union([linktreeUrl, z.literal("")]).default("");
const slug = z
  .string()
  .min(1)
  .max(150)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const markdown = unified().use(remarkParse).use(remarkGfm).use(remarkStringify);

// Parse Markdown, never HTML: remove raw HTML nodes, unsafe destinations and
// auto-loading images. Code snippets remain literal escaped code on render.
export function safeBlogMarkdown(source) {
  const tree = markdown.parse(source);
  function clean(parent) {
    if (!parent.children) return;
    parent.children = parent.children.flatMap((node) => {
      if (node.type === "html") return [];
      if (node.type === "image" || node.type === "imageReference")
        return [
          {
            type: "text",
            value: node.alt ? `[Image: ${node.alt}]` : "[Image]",
          },
        ];
      clean(node);
      if (
        ["link", "definition"].includes(node.type) &&
        !linktreeUrl.safeParse(node.url).success
      )
        return node.type === "link" ? node.children : [];
      return [node];
    });
  }
  clean(tree);
  return markdown.stringify(tree).trim();
}
export const blogPostRecord = z
  .object({
    title: text(200, 2),
    slug,
    excerpt: text(1000).default(""),
    content: text(150000, 2)
      .transform(safeBlogMarkdown)
      .refine(
        (s) => s.length >= 2 && s.length <= 180000,
        "Write safe Markdown content.",
      ),
    author_name: text(100, 1),
    author_email: z
      .union([z.string().trim().toLowerCase().email().max(254), z.literal("")])
      .default(""),
    featured_image_url: url,
    author_avatar_url: url,
    category_id: z.string().uuid().nullable().default(null),
    tags: z
      .array(text(50, 1))
      .max(30)
      .default([])
      .refine((v) => new Set(v.map((s) => s.toLowerCase())).size === v.length),
    read_time_minutes: z.number().int().min(1).max(180).default(5),
    is_featured: z.boolean().default(false),
  })
  .strict();
export const blogCategoryRecord = z
  .object({
    name: text(100, 2),
    slug,
    description: text(2000).default(""),
    color: z
      .string()
      .regex(/^#[a-fA-F0-9]{6}$/)
      .default("#c4473b"),
    is_active: z.boolean().default(true),
    order_index: z.number().int().min(0).max(100000).default(0),
  })
  .strict();
const revision = z.number().int().positive();
const confirmation = {
  currentPassword: z.string().min(1).max(128),
  confirmation: z.string().regex(/^BLOG-[A-F0-9]{32}$/),
};
export function blogCreate(kind) {
  return z
    .object({
      record: kind === "posts" ? blogPostRecord : blogCategoryRecord,
      teamId: z.string().uuid().nullable(),
    })
    .strict()
    .refine(
      (v) => kind === "posts" || v.teamId === null,
      "Categories are chapter-wide.",
    );
}
export function blogMutation(kind) {
  if (kind === "posts")
    return z.discriminatedUnion("action", [
      z
        .object({
          action: z.literal("update"),
          revision,
          record: blogPostRecord,
          summary: text(1000).default(""),
        })
        .strict(),
      z
        .object({
          action: z.literal("submit"),
          revision,
          summary: text(1000, 2),
        })
        .strict(),
      z
        .object({
          action: z.enum([
            "approve",
            "reject",
            "publish",
            "unpublish",
            "archive",
            "restore",
          ]),
          revision,
          ...confirmation,
          reason: text(2000).default(""),
        })
        .strict(),
      z
        .object({
          action: z.literal("assign"),
          revision,
          ...confirmation,
          editorId: z.string().uuid().nullable(),
        })
        .strict(),
    ]);
  if (kind === "categories")
    return z.discriminatedUnion("action", [
      z
        .object({
          action: z.literal("update"),
          revision,
          record: blogCategoryRecord,
        })
        .strict(),
      z
        .object({
          action: z.enum(["archive", "restore"]),
          revision,
          ...confirmation,
        })
        .strict(),
    ]);
  if (kind === "submissions")
    return z.discriminatedUnion("action", [
      z
        .object({
          action: z.literal("comment"),
          revision,
          comment: text(5000, 1),
          type: z.enum(["general", "feedback", "internal"]).default("general"),
        })
        .strict(),
      z
        .object({
          action: z.literal("review"),
          revision,
          ...confirmation,
          status: z.enum(["reviewed", "approved", "rejected"]),
          notes: text(5000).default(""),
        })
        .strict(),
      z
        .object({
          action: z.literal("assign"),
          revision,
          ...confirmation,
          editorId: z.string().uuid().nullable(),
        })
        .strict(),
      z
        .object({
          action: z.enum(["archive", "restore"]),
          revision,
          ...confirmation,
        })
        .strict(),
    ]);
  return z
    .object({
      action: z.enum([
        "approve",
        "hide",
        "flag",
        "unflag",
        "archive",
        "restore",
      ]),
      revision,
      ...confirmation,
    })
    .strict();
}
export const blogReference = (id) =>
  "BLOG-" + id.replaceAll("-", "").toUpperCase();
