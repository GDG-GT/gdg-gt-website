import sharp from "sharp";
import { unzipSync, strFromU8 } from "fflate";
import { ApiError } from "./http.mjs";
export const uploadTypes = {
  "application/pdf": ["pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    "docx",
  ],
  "text/plain": ["txt"],
  "image/png": ["png"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/webp": ["webp"],
};
function invalid(
  message = "The file content does not match its allowed type.",
) {
  throw new ApiError(400, "UNSAFE_FILE", message);
}
export function validateDeclaredFile(
  filename,
  mime,
  bytes,
  allowed = Object.keys(uploadTypes),
  max = 26214400,
) {
  const extension = filename.split(".").pop()?.toLowerCase();
  if (
    !allowed.includes(mime) ||
    !uploadTypes[mime]?.includes(extension) ||
    !Number.isSafeInteger(bytes) ||
    bytes < 1 ||
    bytes > max ||
    /[/\\]/.test(filename) ||
    Array.from(filename).some(
      (c) => c.codePointAt(0) < 32 || c.codePointAt(0) === 127,
    ) ||
    filename.length > 180
  )
    invalid("Choose an allowed file type and size.");
}
export async function normalizeUpload(bytes, filename, mime) {
  if (!(bytes instanceof Uint8Array) || bytes.length > 26214400) invalid();
  if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes);
  validateDeclaredFile(filename, mime, bytes.length);
  let detected;
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    detected = "image/png";
  else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    detected = "image/jpeg";
  else if (
    bytes.subarray(0, 4).toString() === "RIFF" &&
    bytes.subarray(8, 12).toString() === "WEBP"
  )
    detected = "image/webp";
  else if (bytes.subarray(0, 5).toString() === "%PDF-") {
    if (!bytes.subarray(-2048).toString("latin1").includes("%%EOF"))
      invalid("This PDF is incomplete.");
    detected = "application/pdf";
  } else if (bytes.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4]))) {
    if (
      mime !==
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
      invalid();
    let total = 0,
      count = 0;
    const names = [];
    let content;
    try {
      content = unzipSync(bytes, {
        filter(entry) {
          total += entry.originalSize;
          count++;
          names.push(entry.name);
          if (
            !Number.isSafeInteger(entry.originalSize) ||
            entry.originalSize < 0 ||
            count > 1000 ||
            total > 100 * 1024 * 1024 ||
            entry.originalSize > 25 * 1024 * 1024 ||
            /(^|\/)\.\.(\/|$)|^\/|\\/.test(entry.name)
          )
            invalid("This document archive exceeds safe limits.");
          return (
            ["[Content_Types].xml", "word/document.xml"].includes(entry.name) ||
            entry.name.endsWith(".rels")
          );
        },
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      invalid("This document archive is invalid.");
    }
    if (
      !content["[Content_Types].xml"] ||
      !content["word/document.xml"] ||
      names.some((n) => /vbaproject|activex|embeddings\//i.test(n)) ||
      Object.entries(content).some(
        ([name, value]) =>
          (name.endsWith(".rels") &&
            /TargetMode\s*=\s*["']External/i.test(strFromU8(value))) ||
          (name === "[Content_Types].xml" &&
            /macroEnabled|vbaProject/i.test(strFromU8(value))),
      )
    )
      invalid(
        "Use a document without macros, embedded programs, or external relationships.",
      );
    detected = mime;
  } else {
    let value;
    try {
      value = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      invalid();
    }
    if (
      Array.from(value).some((c) => {
        const n = c.codePointAt(0);
        return (n < 32 && ![9, 10, 13].includes(n)) || n === 127;
      }) ||
      /<\s*(?:!doctype|html\b|svg\b|script\b)/i.test(value)
    )
      invalid();
    detected = "text/plain";
  }
  if (detected !== mime) invalid();
  if (mime.startsWith("image/")) {
    try {
      const image = sharp(bytes, {
          limitInputPixels: 40000000,
          animated: false,
          failOn: "warning",
        }),
        metadata = await image.metadata();
      if (
        (metadata.pages || 1) > 1 ||
        !metadata.width ||
        !metadata.height ||
        metadata.width > 16000 ||
        metadata.height > 16000
      )
        invalid("Choose a single-frame image with safe dimensions.");
      const clean = await image
        .rotate()
        .toFormat(mime.split("/")[1] === "jpeg" ? "jpeg" : mime.split("/")[1])
        .toBuffer();
      if (clean.length > 26214400) invalid();
      return { bytes: clean, mime };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      invalid("The image could not be safely decoded.");
    }
  }
  return { bytes, mime };
}
