import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { zipSync, strToU8 } from "fflate";
import {
  normalizeMedia,
  validateMediaFile,
} from "../../server/lib/media-content.mjs";
import { mediaFileMutation, mediaUploadIntent } from "../../shared/media.mjs";
const id = "a7500000-0000-4000-8000-000000000001";
describe("General media policy", () => {
  it("uses category-specific limits, extensions and strict input schemas", () => {
    expect(validateMediaFile("fixture.mp4", "video/mp4", 262144000).kind).toBe(
      "video",
    );
    for (const values of [
      ["fixture.png", "image/png", 20971521],
      ["../x.txt", "text/plain", 10],
      ["x.svg", "image/svg+xml", 10],
      ["x.mp4", "image/png", 10],
      ["x.zip", "application/zip", 26214401],
    ])
      expect(() => validateMediaFile(...values)).toThrow();
    expect(
      mediaUploadIntent.safeParse({
        teamId: null,
        folderId: null,
        filename: "a.png",
        mime: "image/png",
        bytes: 1,
        sha256: "a".repeat(64),
        is_public: true,
      }).success,
    ).toBe(false);
    expect(
      mediaFileMutation.safeParse({
        action: "star",
        files: [
          { id, revision: 1 },
          { id, revision: 1 },
        ],
        document: { starred: true },
      }).success,
    ).toBe(false);
  });
  it("normalizes raster images and returns real oriented dimensions", async () => {
    const bytes = await sharp({
      create: { width: 32, height: 16, channels: 3, background: "#dd7766" },
    })
      .png()
      .withMetadata()
      .toBuffer();
    const result = await normalizeMedia(bytes, "fixture.png", "image/png");
    expect([result.width, result.height, result.kind]).toEqual([
      32,
      16,
      "image",
    ]);
    expect((await sharp(result.bytes).metadata()).exif).toBeUndefined();
    await expect(
      normalizeMedia(Buffer.from("<svg></svg>"), "fixture.png", "image/png"),
    ).rejects.toMatchObject({ code: "UNSAFE_FILE" });
  });
  it("rejects unsafe archive paths, nested archives, scripts and expansion bombs", async () => {
    const safe = zipSync({ "notes.txt": strToU8("Fictional fixture only") });
    expect(
      (await normalizeMedia(safe, "fixture.zip", "application/zip")).kind,
    ).toBe("archive");
    for (const name of [
      "../secret.txt",
      "nested.zip",
      "script.js",
      "page.html",
      "C:/x.txt",
    ])
      await expect(
        normalizeMedia(
          zipSync({ [name]: strToU8("fixture") }),
          "fixture.zip",
          "application/zip",
        ),
      ).rejects.toMatchObject({ code: "UNSAFE_FILE" });
    await expect(
      normalizeMedia(
        zipSync({ "bomb.txt": new Uint8Array(2097152) }),
        "fixture.zip",
        "application/zip",
      ),
    ).rejects.toMatchObject({ code: "UNSAFE_FILE" });
  });
  it("rejects encrypted and polyglot ZIP directory records", async () => {
    const safe = Buffer.from(
        zipSync({ "notes.txt": strToU8("Fictional fixture") }),
      ),
      encrypted = Buffer.from(safe);
    encrypted.writeUInt16LE(1, 6);
    const end = encrypted.length - 22,
      central = encrypted.readUInt32LE(end + 16);
    encrypted.writeUInt16LE(1, central + 8);
    for (const value of [
      encrypted,
      Buffer.concat([safe, Buffer.from("trailing payload")]),
    ])
      await expect(
        normalizeMedia(value, "fixture.zip", "application/zip"),
      ).rejects.toMatchObject({ code: "UNSAFE_FILE" });
  });
  it("allows safe Markdown as an attachment, not embedded HTML", async () => {
    expect(
      (
        await normalizeMedia(
          Buffer.from("# Fictional notes"),
          "notes.md",
          "text/markdown",
        )
      ).mime,
    ).toBe("text/markdown");
    await expect(
      normalizeMedia(
        Buffer.from("<script>bad</script>"),
        "notes.md",
        "text/markdown",
      ),
    ).rejects.toMatchObject({ code: "UNSAFE_FILE" });
  });
  it("rejects forged audiovisual signatures before launching the external probe", async () => {
    for (const [filename, mime] of [
      ["f.mp4", "video/mp4"],
      ["f.webm", "video/webm"],
      ["f.mp3", "audio/mpeg"],
      ["f.wav", "audio/wav"],
      ["f.ogg", "audio/ogg"],
    ])
      await expect(
        normalizeMedia(Buffer.from("not media"), filename, mime),
      ).rejects.toMatchObject({ code: "UNSAFE_FILE" });
  });
});
