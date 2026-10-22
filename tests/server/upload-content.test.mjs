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
  it("recognizes PDF, PNG and WebP signatures and safely converts typed byte arrays", async () => {
    const text = new Uint8Array(Buffer.from("Fictional typed text"));
    expect(
      (await normalizeUpload(text, "fictional.txt", "text/plain")).bytes,
    ).toEqual(Buffer.from(text));
    const pdf = Buffer.from("%PDF-1.7\nFictional signature fixture\n%%EOF");
    expect(
      (await normalizeUpload(pdf, "fictional.pdf", "application/pdf")).bytes,
    ).toEqual(pdf);
    for (const format of ["png", "webp"]) {
      const bytes = await sharp({
        create: { width: 16, height: 16, channels: 3, background: "#df7768" },
      })
        .toFormat(format)
        .toBuffer();
      const result = await normalizeUpload(
        bytes,
        "fictional." + format,
        "image/" + format,
      );
      expect(result.mime).toBe("image/" + format);
      expect((await sharp(result.bytes).metadata()).width).toBe(16);
    }
    await expect(
      normalizeUpload({}, "fictional.txt", "text/plain"),
    ).rejects.toThrow();
  });
  it("refuses wrong archive types, malformed ZIPs, traversal and excessive entry counts before expanding them", async () => {
    const mime =
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      base = {
        "[Content_Types].xml": strToU8("<Types/>"),
        "word/document.xml": strToU8("<document/>"),
      };
    await expect(
      normalizeUpload(zipSync(base), "fictional.txt", "text/plain"),
    ).rejects.toThrow();
    await expect(
      normalizeUpload(
        Buffer.from([80, 75, 3, 4, 0, 0, 0, 0]),
        "fictional.docx",
        mime,
      ),
    ).rejects.toThrow();
    await expect(
      normalizeUpload(
        zipSync({ ...base, "../fictional.txt": strToU8("fixture") }),
        "fictional.docx",
        mime,
      ),
    ).rejects.toThrow();
    const entries = Object.fromEntries(
      Array.from({ length: 1001 }, (_, index) => [
        "fixture-" + index,
        strToU8("x"),
      ]),
    );
    await expect(
      normalizeUpload(zipSync({ ...base, ...entries }), "fictional.docx", mime),
    ).rejects.toThrow();
  });
  it("rejects unsafe image dimensions and decoder errors instead of preserving raw bytes", async () => {
    const oversized = await sharp({
      create: { width: 16001, height: 1, channels: 3, background: "#df7768" },
    })
      .png()
      .toBuffer();
    await expect(
      normalizeUpload(oversized, "fictional.png", "image/png"),
    ).rejects.toThrow("safe dimensions");
    await expect(
      normalizeUpload(
        Buffer.from([255, 216, 255, 1, 2, 3]),
        "fictional.jpg",
        "image/jpeg",
      ),
    ).rejects.toThrow("safely decoded");
  });
});
