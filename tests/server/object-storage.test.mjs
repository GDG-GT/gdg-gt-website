import { afterEach, describe, it, expect, vi } from "vitest";
import { Readable } from "node:stream";
import {
  S3Client,
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { objectStorage } from "../../server/lib/object-storage.mjs";
const env = {
  NODE_ENV: "test",
  S3_ENDPOINT: "http://127.0.0.1:54361/storage/v1/s3",
  S3_REGION: "local",
  S3_ACCESS_KEY_ID: "fictional-unit-key",
  S3_SECRET_ACCESS_KEY: "fictional-unit-secret",
};
afterEach(() => vi.restoreAllMocks());
describe("SEC bounded private object-storage transport", () => {
  it("rejects missing configuration, remote plaintext and credential-bearing endpoints", () => {
    for (const change of [
      { S3_ENDPOINT: undefined },
      { S3_ENDPOINT: "not a URL" },
      { NODE_ENV: "production" },
      { S3_ENDPOINT: "http://remote.example.test" },
      { S3_ENDPOINT: "ftp://storage.example.test" },
      { S3_ENDPOINT: "https://user:password@storage.example.test" },
      { S3_ACCESS_KEY_ID: "" },
      { S3_SECRET_ACCESS_KEY: "" },
      { S3_REGION: "" },
    ])
      expect(() => objectStorage({ ...env, ...change })).toThrow(
        expect.objectContaining({ status: 503, code: "UPLOADS_NOT_READY" }),
      );
    for (const endpoint of [
      "http://localhost:9000",
      "http://[::1]:9000",
      "https://storage.example.test",
    ])
      objectStorage({ ...env, S3_ENDPOINT: endpoint }).close();
  });
  it("signs one-key uploads for 120 seconds with byte, MIME and checksum metadata constraints", async () => {
    const storage = objectStorage(env);
    try {
      const url = new URL(
        await storage.putUrl(
          "private-fixture",
          "quarantine/one-object",
          "application/pdf",
          123,
          "a".repeat(64),
        ),
      );
      expect(url.pathname).toBe(
        "/storage/v1/s3/private-fixture/quarantine/one-object",
      );
      expect(url.searchParams.get("X-Amz-Expires")).toBe("120");
      expect(url.searchParams.get("X-Amz-SignedHeaders")).toContain(
        "content-length",
      );
      expect(url.searchParams.get("X-Amz-SignedHeaders")).toContain(
        "content-type",
      );
      expect(url.searchParams.get("x-amz-meta-sha256")).toBe("a".repeat(64));
    } finally {
      storage.close();
    }
  });
  it("forces safe attachment filenames/types and permits only short raster previews", async () => {
    const storage = objectStorage(env);
    try {
      const download = new URL(
        await storage.downloadUrl(
          "private-fixture",
          "clean/one",
          'A"\r\n<script>' + "x".repeat(200) + ".pdf",
        ),
      );
      expect(download.searchParams.get("X-Amz-Expires")).toBe("60");
      expect(download.searchParams.get("response-content-type")).toBe(
        "application/octet-stream",
      );
      const disposition = download.searchParams.get(
        "response-content-disposition",
      );
      expect(disposition).toMatch(
        /^attachment; filename="[a-zA-Z0-9._-]{1,160}"$/,
      );
      for (const mime of ["image/png", "image/jpeg", "image/webp"]) {
        const url = new URL(
          await storage.previewUrl("private-fixture", "clean/one", mime),
        );
        expect(url.searchParams.get("X-Amz-Expires")).toBe("60");
        expect(url.searchParams.get("response-content-disposition")).toBe(
          "inline",
        );
        expect(url.searchParams.get("response-content-type")).toBe(mime);
      }
      for (const mime of [
        "image/svg+xml",
        "text/html",
        "application/pdf",
        "image/gif",
      ])
        expect(() => storage.previewUrl("fixture", "key", mime)).toThrow(
          expect.objectContaining({ code: "UNSAFE_FILE" }),
        );
    } finally {
      storage.close();
    }
  });
  it("sends actual SDK command contracts with bounded abort signals without a network dependency", async () => {
    const send = vi
        .spyOn(S3Client.prototype, "send")
        .mockResolvedValue({ ContentLength: 3 }),
      storage = objectStorage(env);
    try {
      await storage.head("bucket", "key");
      await storage.put("bucket", "key", Buffer.from("abc"), "text/plain");
      await storage.delete("bucket", "key");
      expect(send.mock.calls[0][0]).toBeInstanceOf(HeadObjectCommand);
      expect(send.mock.calls[1][0]).toBeInstanceOf(PutObjectCommand);
      expect(send.mock.calls[1][0].input).toMatchObject({
        Bucket: "bucket",
        Key: "key",
        ContentLength: 3,
        ContentType: "text/plain",
      });
      expect(send.mock.calls[2][0]).toBeInstanceOf(DeleteObjectCommand);
      for (const [, options] of send.mock.calls)
        expect(options.abortSignal).toBeInstanceOf(AbortSignal);
    } finally {
      storage.close();
    }
  });
  it("rejects missing or excessive declared lengths and closes the object stream", async () => {
    const send = vi.spyOn(S3Client.prototype, "send"),
      storage = objectStorage(env);
    try {
      for (const length of [undefined, 0, 11]) {
        const body = Readable.from([Buffer.from("abc")]);
        send.mockResolvedValueOnce({ ContentLength: length, Body: body });
        await expect(storage.bytes("bucket", "key", 10)).rejects.toMatchObject({
          code: "INVALID_UPLOAD",
        });
        expect(body.destroyed).toBe(true);
      }
      send.mockResolvedValueOnce({});
      await expect(storage.bytes("bucket", "key", 10)).rejects.toMatchObject({
        code: "INVALID_UPLOAD",
      });
    } finally {
      storage.close();
    }
  });
  it("caps actual streamed bytes even if metadata under-reports them and returns exact accepted bytes", async () => {
    const send = vi.spyOn(S3Client.prototype, "send"),
      storage = objectStorage(env);
    try {
      const oversized = Readable.from([Buffer.from("abc"), Buffer.from("def")]);
      send.mockResolvedValueOnce({ ContentLength: 2, Body: oversized });
      await expect(storage.bytes("bucket", "key", 4)).rejects.toMatchObject({
        code: "INVALID_UPLOAD",
      });
      expect(oversized.destroyed).toBe(true);
      send.mockResolvedValueOnce({
        ContentLength: 6,
        Body: Readable.from([Buffer.from("abc"), Buffer.from("def")]),
      });
      expect(await storage.bytes("bucket", "key", 6)).toEqual(
        Buffer.from("abcdef"),
      );
      expect(send.mock.calls[1][0]).toBeInstanceOf(GetObjectCommand);
    } finally {
      storage.close();
    }
  });
  it("propagates transport/stream failure instead of returning partial success", async () => {
    const send = vi.spyOn(S3Client.prototype, "send"),
      storage = objectStorage(env);
    try {
      send.mockRejectedValueOnce(Error("fictional transport failure"));
      await expect(storage.head("bucket", "key")).rejects.toThrow(
        "fictional transport failure",
      );
      const body = Readable.from(
        (async function* () {
          yield Buffer.from("a");
          throw Error("fictional stream failure");
        })(),
      );
      send.mockResolvedValueOnce({ ContentLength: 2, Body: body });
      await expect(storage.bytes("bucket", "key", 2)).rejects.toThrow(
        "fictional stream failure",
      );
    } finally {
      storage.close();
    }
  });
});
