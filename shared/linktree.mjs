import { z } from "zod";
const text = (max, min = 0) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine(
      (v) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v),
      "Remove control characters.",
    );
export const linktreeUsername = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(50)
  .regex(/^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/);
export const linktreeUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((value) => {
    try {
      const u = new URL(value),
        host = u.hostname.toLowerCase().replace(/\.$/, "");
      const forbidden = (key) =>
        /^(?:access|resume|edit|token|access_token|api_key|secret|signature|x-amz-.+)$/i.test(
          key,
        );
      return (
        u.protocol === "https:" &&
        !u.username &&
        !u.password &&
        !u.port &&
        host.includes(".") &&
        !host.includes(":") &&
        !/^[\d.]+$/.test(host) &&
        !/(^|\.)(localhost|local|internal|test|invalid)$/.test(host) &&
        !/[\u0000-\u0020\u007f]/.test(value) &&
        ![
          ...u.searchParams.keys(),
          ...new URLSearchParams(u.hash.slice(1)).keys(),
        ].some(forbidden)
      );
    } catch {
      return false;
    }
  }, "Use a public HTTPS URL without credentials.")
  .transform((v) => new URL(v).href);
const image = z.union([
  linktreeUrl,
  z.string().regex(/^\/assets\/[a-zA-Z0-9._-]+$/),
  z.literal(""),
]);
export const linktreeColor = z
  .string()
  .regex(/^#[a-fA-F0-9]{6}$/)
  .transform((v) => v.toLowerCase());
export const linktreeBackground = z.discriminatedUnion("type", [
  z.object({ type: z.literal("color"), value: linktreeColor }).strict(),
  z
    .object({
      type: z.literal("gradient"),
      from: linktreeColor,
      to: linktreeColor,
      angle: z.number().int().min(0).max(360).default(135),
    })
    .strict(),
  z
    .object({ type: z.literal("image"), value: image.refine((v) => !!v) })
    .strict(),
]);
export const linktreeProfile = z
  .object({
    username: linktreeUsername,
    displayName: text(100, 2),
    bio: text(2000).default(""),
    avatarUrl: image.default(""),
    background: linktreeBackground.default({ type: "color", value: "#f8d8c6" }),
    theme: z.enum(["light", "dark", "auto"]).default("light"),
  })
  .strict();
export function embedUrl(value, type) {
  if (type === "none") return null;
  const parsed = linktreeUrl.safeParse(value);
  if (!parsed.success) return null;
  const u = new URL(parsed.data),
    host = u.hostname;
  if (type === "google_form" && host === "docs.google.com") {
    const m = u.pathname.match(
      /^\/forms\/d\/(e\/)?([A-Za-z0-9_-]{10,200})\/(?:viewform|edit)\/?$/,
    );
    if (m)
      return `https://docs.google.com/forms/d/${m[1] || ""}${m[2]}/viewform?embedded=true`;
  }
  if (type === "youtube") {
    let id;
    if (host === "youtu.be") id = u.pathname.slice(1);
    else if (
      ["youtube.com", "www.youtube.com", "www.youtube-nocookie.com"].includes(
        host,
      )
    )
      id =
        u.pathname === "/watch"
          ? u.searchParams.get("v")
          : u.pathname.match(
              /^\/(?:embed|shorts)\/([A-Za-z0-9_-]{11})\/?$/,
            )?.[1];
    if (/^[A-Za-z0-9_-]{11}$/.test(id || ""))
      return `https://www.youtube-nocookie.com/embed/${id}?rel=0`;
  }
  return null;
}
export function colorContrast(a, b) {
  const luminance = (hex) => {
    const values = [1, 3, 5]
      .map((p) => parseInt(hex.slice(p, p + 2), 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
  };
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export const linktreeLink = z
  .object({
    title: text(100, 1),
    url: z.union([
      linktreeUrl,
      z
        .string()
        .regex(
          /^\/(?:forms\/[a-z0-9]+(?:-[a-z0-9]+)*|events\/[a-z0-9]+(?:-[a-z0-9]+)*|team|resources|sponsors|gallery|contact)$/,
        ),
    ]),
    description: text(1000).default(""),
    icon: z
      .enum(["link", "code", "calendar", "video", "form", "community", "mail"])
      .default("link"),
    buttonStyle: z
      .enum(["default", "outline", "filled", "minimal"])
      .default("default"),
    buttonColor: linktreeColor.default("#f4f5f7"),
    textColor: linktreeColor.default("#25282f"),
    embedType: z.enum(["none", "google_form", "youtube"]).default("none"),
    showClickCount: z.boolean().default(false),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.embedType !== "none" && !embedUrl(v.url, v.embedType))
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["url"],
        message:
          "Choose a full Google Forms or YouTube URL for this embed type.",
      });
    if (colorContrast(v.buttonColor, v.textColor) < 4.5)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["textColor"],
        message: "Button text needs at least 4.5:1 contrast.",
      });
  });
export const linktreeCreate = z
  .object({
    record: linktreeProfile,
    teamId: z.string().uuid().nullable().default(null),
  })
  .strict();
const decision = {
    confirmation: text(150, 1),
    currentPassword: z.string().min(1).max(128),
  },
  revision = z.number().int().positive();
export const linktreeMutation = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("update"),
      revision,
      record: linktreeProfile,
      confirmation: text(150).optional(),
      currentPassword: z.string().min(1).max(128).optional(),
    })
    .strict(),
  z
    .object({
      action: z.enum(["publish", "unpublish", "archive", "restore"]),
      revision,
      ...decision,
    })
    .strict(),
  z
    .object({
      action: z.literal("link_create"),
      revision,
      record: linktreeLink,
    })
    .strict(),
  z
    .object({
      action: z.literal("link_update"),
      linkId: z.string().uuid(),
      revision,
      record: linktreeLink,
      confirmation: text(150).optional(),
      currentPassword: z.string().min(1).max(128).optional(),
    })
    .strict(),
  z
    .object({
      action: z.enum([
        "link_publish",
        "link_unpublish",
        "link_archive",
        "link_restore",
      ]),
      linkId: z.string().uuid(),
      revision,
      ...decision,
    })
    .strict(),
  z
    .object({
      action: z.literal("move"),
      revision,
      linkId: z.string().uuid(),
      direction: z.enum(["up", "down"]),
      confirmation: text(150).optional(),
      currentPassword: z.string().min(1).max(128).optional(),
    })
    .strict(),
]);
