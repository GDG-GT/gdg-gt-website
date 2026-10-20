import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { zipSync, strToU8 } from "fflate";
import {
  validateDeclaredFile,
  normalizeUpload,
} from "../../server/lib/upload-content.mjs";
describe("private upload content validation", () => {
  it("rejects path traversal, disallowed extensions, declared size and MIME mismatches", () => {
    for (const args of [
      ["../file.txt", "text/plain", 10],
      ["image.svg", "image/svg+xml", 10],
      ["file.pdf", "text/plain", 10],
      ["empty.txt", "text/plain", 0],
      ["big.txt", "text/plain", 26214401],
    ])
      expect(() => validateDeclaredFile(...args)).toThrow();
  });
  it("requires detected bytes to match the declared type", async () => {
    await expect(
      normalizeUpload(Buffer.from("<svg>test</svg>"), "file.txt", "text/plain"),
    ).rejects.toThrow();
    await expect(
      normalizeUpload(
        Buffer.from("<html>test</html>"),
        "file.txt",
        "text/plain",
      ),
    ).rejects.toThrow();
    await expect(
      normalizeUpload(Buffer.from("not a pdf"), "file.pdf", "application/pdf"),
    ).rejects.toThrow();
    await expect(
      normalizeUpload(Buffer.from([0, 255, 0, 255]), "file.txt", "text/plain"),
    ).rejects.toThrow();
    await expect(
      normalizeUpload(
        Buffer.from("%PDF-1.7\ntruncated"),
        "file.pdf",
        "application/pdf",
      ),
    ).rejects.toThrow();
  });
  it("accepts bounded UTF-8 text including tab and newline", async () => {
    const bytes = Buffer.from("Fictional café\tcolumn\nSecond line");
    expect(
      (await normalizeUpload(bytes, "file.txt", "text/plain")).bytes,
    ).toEqual(bytes);
  });
  it("rejects macro and external relationships in document containers", async () => {
    const mime =
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const base = {
      "[Content_Types].xml": strToU8("<Types/>"),
      "word/document.xml": strToU8("<document/>"),
    };
    await expect(
      normalizeUpload(
        zipSync({ ...base, "word/vbaProject.bin": strToU8("test") }),
        "test.docx",
        mime,
      ),
    ).rejects.toThrow();
    await expect(
      normalizeUpload(
        zipSync({
          ...base,
          "word/_rels/document.xml.rels": strToU8(
            '<Relationship TargetMode="External"/>',
          ),
        }),
        "test.docx",
        mime,
      ),
    ).rejects.toThrow();
    expect((await normalizeUpload(zipSync(base), "test.docx", mime)).mime).toBe(
      mime,
    );
  });
  it("decodes images and strips metadata rather than copying untrusted bytes", async () => {
    const bytes = await sharp({
      create: { width: 16, height: 16, channels: 3, background: "#e6705f" },
    })
      .jpeg()
      .withMetadata({ exif: { IFD0: { Artist: "Fictional metadata" } } })
      .toBuffer();
    const result = await normalizeUpload(bytes, "test.jpg", "image/jpeg"),
      metadata = await sharp(result.bytes).metadata();
    expect(metadata.width).toBe(16);
    expect(metadata.exif).toBeUndefined();
    expect(result.bytes).not.toEqual(bytes);
  });
});
