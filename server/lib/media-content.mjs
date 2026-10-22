import sharp from "sharp";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { ApiError } from "./http.mjs";
import { normalizeUpload } from "./upload-content.mjs";
import { mediaTypes } from "../../shared/media.mjs";
import { hasControlCharacters } from "./validation.mjs";
const unsafe = (
  message = "The file does not match its permitted media type.",
) => {
  throw new ApiError(400, "UNSAFE_FILE", message);
};
export function validateMediaFile(filename, mime, bytes) {
  const rule = mediaTypes[mime];
  if (
    !rule ||
    !Number.isSafeInteger(bytes) ||
    bytes < 1 ||
    bytes > rule.limit ||
    typeof filename !== "string" ||
    filename.length > 180 ||
    !filename.trim() ||
    /[/\\]/.test(filename) ||
    hasControlCharacters(filename) ||
    !rule.extensions.includes(filename.split(".").at(-1)?.toLowerCase())
  )
    unsafe("Choose a supported media extension, MIME type and size.");
  return rule;
}
function zipDirectory(bytes) {
  // Reject encryption, ZIP64, multi-volume, symlinks, overlapping entries and
  // trailing polyglot bytes without expanding attacker-controlled content.
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (
      bytes.readUInt32LE(i) === 0x06054b50 &&
      i + 22 + bytes.readUInt16LE(i + 20) === bytes.length
    ) {
      end = i;
      break;
    }
  }
  if (end < 0 || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6))
    unsafe("Use a standard, unencrypted single-volume ZIP.");
  const count = bytes.readUInt16LE(end + 10),
    start = bytes.readUInt32LE(end + 16),
    size = bytes.readUInt32LE(end + 12),
    ranges = [];
  if (
    !count ||
    count > 1000 ||
    count !== bytes.readUInt16LE(end + 8) ||
    start + size !== end
  )
    unsafe();
  let cursor = start;
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50)
      unsafe();
    const flags = bytes.readUInt16LE(cursor + 8),
      method = bytes.readUInt16LE(cursor + 10),
      compressed = bytes.readUInt32LE(cursor + 20),
      nameLength = bytes.readUInt16LE(cursor + 28),
      extraLength = bytes.readUInt16LE(cursor + 30),
      commentLength = bytes.readUInt16LE(cursor + 32),
      offset = bytes.readUInt32LE(cursor + 42),
      next = cursor + 46 + nameLength + extraLength + commentLength;
    if (
      flags & 65 ||
      ![0, 8].includes(method) ||
      compressed === 0xffffffff ||
      bytes.readUInt32LE(cursor + 24) === 0xffffffff ||
      bytes.readUInt16LE(cursor + 34) ||
      ((bytes.readUInt32LE(cursor + 38) >>> 16) & 0xf000) === 0xa000 ||
      next > end ||
      offset + 30 > start ||
      bytes.readUInt32LE(offset) !== 0x04034b50 ||
      bytes.readUInt16LE(offset + 6) !== flags ||
      bytes.readUInt16LE(offset + 8) !== method ||
      bytes.readUInt16LE(offset + 26) !== nameLength
    )
      unsafe("Encrypted, linked or unusual ZIP entries are not supported.");
    const dataStart =
      offset + 30 + nameLength + bytes.readUInt16LE(offset + 28);
    if (
      dataStart + compressed > start ||
      !bytes
        .subarray(cursor + 46, cursor + 46 + nameLength)
        .equals(bytes.subarray(offset + 30, offset + 30 + nameLength))
    )
      unsafe();
    ranges.push([offset, dataStart + compressed]);
    cursor = next;
  }
  ranges.sort((a, b) => a[0] - b[0]);
  if (cursor !== end || ranges.some((r, i) => i > 0 && ranges[i - 1][1] > r[0]))
    unsafe();
}
async function probe(bytes, format, env) {
  // A private seekable temporary file permits safe inspection of MP4 files
  // whose metadata lives at the end. No user filename becomes a local path.
  const directory = await mkdtemp(join(tmpdir(), "gdg-media-probe-")),
    path = join(directory, "input");
  try {
    await writeFile(path, bytes, { mode: 0o600, flag: "wx" });
    return await new Promise((resolve, reject) => {
      const child = spawn(
        env.FFPROBE_PATH || "ffprobe",
        [
          "-v",
          "error",
          "-max_alloc",
          "67108864",
          "-protocol_whitelist",
          "file,pipe",
          "-probesize",
          "8388608",
          "-analyzeduration",
          "5000000",
          "-f",
          format,
          ...(format === "mov"
            ? ["-enable_drefs", "0", "-use_absolute_path", "0"]
            : []),
          "-i",
          path,
          "-show_entries",
          "stream=codec_type,width,height,duration:format=duration,format_name",
          "-of",
          "json",
        ],
        { stdio: ["ignore", "pipe", "pipe"], shell: false },
      );
      let output = "",
        errors = 0,
        settled = false;
      const done = (error, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve(value);
      };
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        done(
          new ApiError(
            400,
            "UNSAFE_FILE",
            "The media container could not be inspected within safe limits.",
          ),
        );
      }, 15000);
      child.on("error", () =>
        done(
          new ApiError(
            503,
            "MEDIA_PROBE_UNAVAILABLE",
            "The isolated media inspector is not configured.",
          ),
        ),
      );
      child.stdout.on("data", (chunk) => {
        output += chunk.toString();
        if (output.length > 65536) {
          child.kill("SIGKILL");
          done(
            new ApiError(
              400,
              "UNSAFE_FILE",
              "The media container is too complex.",
            ),
          );
        }
      });
      child.stderr.on("data", (chunk) => {
        errors += chunk.length;
        if (errors > 65536) child.kill("SIGKILL");
      });
      child.on("close", (code) => {
        if (code !== 0 || errors > 65536)
          return done(
            new ApiError(
              400,
              "UNSAFE_FILE",
              "This audio or video container is invalid.",
            ),
          );
        try {
          done(null, JSON.parse(output));
        } catch {
          done(
            new ApiError(400, "UNSAFE_FILE", "The media container is invalid."),
          );
        }
      });
    });
  } finally {
    await unlink(path).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
    await rmdir(directory);
  }
}
export async function normalizeMedia(bytes, filename, mime, env = process.env) {
  if (!(bytes instanceof Uint8Array)) unsafe();
  const rule = validateMediaFile(filename, mime, bytes.length);
  bytes = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (["image", "document"].includes(rule.kind)) {
    const result = await normalizeUpload(
      bytes,
      mime === "text/markdown" ? "document.txt" : filename,
      mime === "text/markdown" ? "text/plain" : mime,
    );
    if (result.bytes.length > rule.limit)
      unsafe("The normalized media exceeds its size limit.");
    const dimensions =
      rule.kind === "image" ? await sharp(result.bytes).metadata() : {};
    return {
      bytes: result.bytes,
      mime,
      kind: rule.kind,
      width: dimensions.width ?? null,
      height: dimensions.height ?? null,
      duration: null,
    };
  }
  if (rule.kind === "archive") {
    if (!bytes.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4]))) unsafe();
    zipDirectory(bytes);
    let total = 0,
      count = 0;
    const names = new Set(),
      allowed = new Set(
        Object.values(mediaTypes)
          .flatMap((v) => v.extensions)
          .filter((v) => v !== "zip"),
      );
    try {
      unzipSync(bytes, {
        filter(entry) {
          count++;
          total += entry.originalSize;
          const name = entry.name;
          if (
            !Number.isSafeInteger(entry.originalSize) ||
            entry.originalSize < 0 ||
            count > 1000 ||
            total > 104857600 ||
            entry.originalSize > 26214400 ||
            entry.originalSize > Math.max(entry.size * 200, 1048576) ||
            name.length > 240 ||
            /(^|\/)\.\.(\/|$)|^\/|\\|:/.test(name) ||
            hasControlCharacters(name) ||
            names.has(name.toLowerCase()) ||
            (!name.endsWith("/") &&
              !allowed.has(name.split(".").at(-1)?.toLowerCase()))
          )
            unsafe(
              "Use a ZIP with only supported files, no nested archives, and bounded expansion.",
            );
          names.add(name.toLowerCase());
          return false;
        },
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      unsafe("This ZIP archive is invalid or encrypted.");
    }
    if (!count) unsafe();
    return {
      bytes,
      mime,
      kind: rule.kind,
      width: null,
      height: null,
      duration: null,
    };
  }
  const signatures = {
    "video/mp4": () => bytes.subarray(4, 8).toString() === "ftyp",
    "video/webm": () =>
      bytes.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163])),
    "audio/mpeg": () =>
      bytes.subarray(0, 3).toString() === "ID3" ||
      (bytes[0] === 255 && (bytes[1] & 224) === 224),
    "audio/wav": () =>
      bytes.subarray(0, 4).toString() === "RIFF" &&
      bytes.subarray(8, 12).toString() === "WAVE",
    "audio/ogg": () => bytes.subarray(0, 4).toString() === "OggS",
  };
  if (!signatures[mime]?.()) unsafe();
  const value = await probe(
      bytes,
      {
        "video/mp4": "mov",
        "video/webm": "matroska",
        "audio/mpeg": "mp3",
        "audio/wav": "wav",
        "audio/ogg": "ogg",
      }[mime],
      env,
    ),
    streams = value.streams;
  if (
    !Array.isArray(streams) ||
    streams.length > 8 ||
    !streams.some((s) => s.codec_type === rule.kind) ||
    streams.some((s) => !["audio", "video"].includes(s.codec_type)) ||
    (rule.kind === "audio" && streams.some((s) => s.codec_type !== "audio"))
  )
    unsafe();
  const video = streams.find((s) => s.codec_type === "video"),
    duration = Number(
      value.format?.duration ?? streams.find((s) => s.duration)?.duration,
    );
  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > 86400 ||
    (video &&
      (!video.width ||
        !video.height ||
        video.width > 7680 ||
        video.height > 7680 ||
        video.width * video.height > 40000000))
  )
    unsafe("Choose media with a valid duration and safe dimensions.");
  return {
    bytes,
    mime,
    kind: rule.kind,
    width: video?.width ?? null,
    height: video?.height ?? null,
    duration,
  };
}
