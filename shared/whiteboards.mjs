import { z } from "zod";
const uuid = z.string().uuid();
const text = (max, min = 0) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine(
      (v) =>
        !Array.from(v).some((c) => {
          const n = c.codePointAt(0);
          return (n < 32 && ![9, 10, 13].includes(n)) || n === 127;
        }),
      "Remove control characters.",
    );
const safeUrl = z
  .string()
  .max(2000)
  .refine((value) => {
    if (value === "") return true;
    try {
      const u = new URL(value),
        host = u.hostname.toLowerCase().replace(/\.$/, "");
      return (
        u.protocol === "https:" &&
        !u.username &&
        !u.password &&
        host.includes(".") &&
        !host.includes(":") &&
        !/^[0-9.]+$/.test(host) &&
        !["localhost", "local", "internal", "test", "invalid"].some(
          (s) => host === s || host.endsWith("." + s),
        ) &&
        !Array.from(value).some(
          (c) => c.codePointAt(0) <= 32 || c.codePointAt(0) === 127,
        )
      );
    } catch {
      return false;
    }
  }, "Use an HTTPS URL without credentials.");
const color = z.string().regex(/^(#[0-9a-f]{3,8}|transparent)$/i);
const shapeTypes = new Set([
  "rectangle",
  "ellipse",
  "diamond",
  "line",
  "arrow",
  "freedraw",
  "text",
  "frame",
]);
export const boardDocument = z
  .object({
    elements: z.array(z.record(z.string(), z.unknown())).max(2000),
    appState: z.object({ viewBackgroundColor: color }).strict(),
  })
  .strict()
  .superRefine((doc, ctx) => {
    function reject(message) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    }
    const ids = new Set();
    for (const element of doc.elements) {
      if (
        !shapeTypes.has(element.type) ||
        typeof element.id !== "string" ||
        !/^[-a-zA-Z0-9_]{1,100}$/.test(element.id) ||
        ids.has(element.id)
      )
        reject("Use uniquely identified supported drawing elements.");
      ids.add(element.id);
      if (
        element.type === "text" &&
        (typeof element.text !== "string" ||
          (element.originalText !== undefined &&
            typeof element.originalText !== "string"))
      )
        reject("Text elements require plain text.");
      for (const [field, maximum] of [
        ["opacity", 100],
        ["strokeWidth", 100],
        ["roughness", 10],
      ]) {
        if (
          element[field] !== undefined &&
          (typeof element[field] !== "number" ||
            element[field] < 0 ||
            element[field] > maximum)
        )
          reject("Drawing style is out of range.");
      }
      for (const field of ["strokeColor", "backgroundColor"])
        if (
          element[field] !== undefined &&
          !color.safeParse(element[field]).success
        )
          reject("Use supported drawing colors.");
      for (const key of ["x", "y", "width", "height", "angle"])
        if (
          typeof element[key] !== "number" ||
          !Number.isFinite(element[key]) ||
          Math.abs(element[key]) > 10000000
        )
          reject("Drawing coordinates are out of range.");
      if (
        element.fontSize !== undefined &&
        (typeof element.fontSize !== "number" ||
          element.fontSize < 1 ||
          element.fontSize > 2000)
      )
        reject("Font size is out of range.");
      if (
        element.link !== undefined &&
        element.link !== null &&
        !safeUrl.safeParse(element.link).success
      )
        reject("Use safe HTTPS links.");
    }
    function inspect(value, depth = 0) {
      if (depth > 20) {
        reject("Drawing is too deeply nested.");
        return;
      }
      if (
        typeof value === "number" &&
        (!Number.isFinite(value) || Math.abs(value) > 1e16)
      )
        reject("Invalid numeric value.");
      if (typeof value === "string" && value.length > 20000)
        reject("Drawing text is too long.");
      if (Array.isArray(value)) {
        if (value.length > 10000) reject("Drawing detail exceeds the limit.");
        value.forEach((v) => inspect(v, depth + 1));
      } else if (value && typeof value === "object")
        for (const [key, item] of Object.entries(value)) {
          if (
            [
              "__proto__",
              "constructor",
              "prototype",
              "fileId",
              "customData",
              "src",
              "html",
            ].includes(key)
          )
            reject("Embedded content is not supported.");
          inspect(item, depth + 1);
        }
    }
    inspect(doc);
    if (new TextEncoder().encode(JSON.stringify(doc)).length > 2000000)
      reject("Drawing exceeds the save limit.");
  });
export const boardCreate = z
  .object({ name: text(100, 2), teamId: uuid.nullable().default(null) })
  .strict();
const version = {
  version: z.number().int().positive(),
  updatedAt: z.string().datetime({ offset: true }),
};
export const boardMutation = z.discriminatedUnion("action", [
  z
    .object({ action: z.literal("save"), ...version, document: boardDocument })
    .strict(),
  z
    .object({ action: z.literal("rename"), ...version, name: text(100, 2) })
    .strict(),
  z
    .object({
      action: z.enum(["archive", "restore"]),
      ...version,
      confirmation: text(100, 2),
    })
    .strict(),
  z
    .object({
      action: z.enum(["share", "unshare"]),
      ...version,
      currentPassword: z.string().min(1).max(128),
      email: z.string().trim().toLowerCase().email().max(255),
      role: z.enum(["viewer", "editor"]).default("viewer"),
    })
    .strict(),
]);
