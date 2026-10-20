import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ApiError } from "./http.mjs";
export function objectStorage(env = process.env) {
  let endpoint;
  try {
    endpoint = new URL(env.S3_ENDPOINT);
  } catch {
    throw new ApiError(
      503,
      "UPLOADS_NOT_READY",
      "Private file storage is not configured.",
    );
  }
  if (
    (endpoint.protocol !== "https:" &&
      !(
        env.NODE_ENV !== "production" &&
        endpoint.protocol === "http:" &&
        ["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname)
      )) ||
    endpoint.username ||
    endpoint.password ||
    !env.S3_ACCESS_KEY_ID ||
    !env.S3_SECRET_ACCESS_KEY ||
    !env.S3_REGION
  )
    throw new ApiError(
      503,
      "UPLOADS_NOT_READY",
      "Private file storage is not configured.",
    );
  const client = new S3Client({
    endpoint: endpoint.href,
    region: env.S3_REGION,
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return {
    close: () => client.destroy(),
    putUrl: (bucket, key, mime, bytes, sha256) =>
      getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          ContentType: mime,
          ContentLength: bytes,
          Metadata: { sha256 },
        }),
        {
          expiresIn: 120,
          signableHeaders: new Set(["content-type", "content-length"]),
        },
      ),
    downloadUrl: (bucket, key, filename) =>
      getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
          ResponseContentDisposition:
            'attachment; filename="' +
            filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 160) +
            '"',
          ResponseContentType: "application/octet-stream",
        }),
        { expiresIn: 60 },
      ),
    head: (bucket, key) =>
      client.send(new HeadObjectCommand({ Bucket: bucket, Key: key })),
    async bytes(bucket, key, maxBytes) {
      const value = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key }),
      );
      if (!value.ContentLength || value.ContentLength > maxBytes) {
        value.Body?.destroy();
        throw new ApiError(
          400,
          "INVALID_UPLOAD",
          "The file size does not match its upload intent.",
        );
      }
      const chunks = [];
      let length = 0;
      for await (const chunk of value.Body) {
        length += chunk.length;
        if (length > maxBytes) {
          value.Body.destroy();
          throw new ApiError(
            400,
            "INVALID_UPLOAD",
            "The uploaded file is too large.",
          );
        }
        chunks.push(chunk);
      }
      return Buffer.concat(chunks, length);
    },
    put: (bucket, key, bytes, mime) =>
      client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: bytes,
          ContentType: mime,
          ContentLength: bytes.length,
        }),
      ),
    delete: (bucket, key) =>
      client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })),
  };
}
