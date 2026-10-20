import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireCsrf, requireSession } from "./auth.mjs";
import { ApiError, allowMethod, jsonBody, sendJson } from "./lib/http.mjs";
import {
  databaseResult as checked,
  parse,
  uuid,
  queryValues,
  idempotency,
} from "./lib/validation.mjs";
import { tokenHash, riskHash } from "./lib/security.mjs";
import { objectStorage } from "./lib/object-storage.mjs";
import { validateDeclaredFile } from "./lib/upload-content.mjs";
export const financeFileTypes = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
];
export const financeUploadIntent = z
  .object({
    revision: z.number().int().positive(),
    filename: z.string().min(1).max(180),
    mime: z.enum(financeFileTypes),
    bytes: z.number().int().min(1).max(10485760),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export async function financeUploadRoutes(
  request,
  response,
  { db, store, config, requestId },
) {
  const url = new URL(request.url, config.origin);
  const match = url.pathname.match(
    /^\/api\/v1\/admin\/finances\/([^/]+)\/attachments(?:\/([^/]+)\/(complete|download))?$/,
  );
  if (!match) return false;
  const finance = parse(uuid, match[1]),
    upload = match[2] ? parse(uuid, match[2]) : null,
    action = match[3];
  allowMethod(
    request,
    response,
    action === "download"
      ? ["GET"]
      : action === "complete"
        ? ["POST"]
        : ["GET", "POST"],
  );
  const session = await requireSession(request, store, config),
    actor = session.user.id;
  if (request.method === "POST") await requireCsrf(request, session, store);
  const permitted = checked(
    await db.rpc("can_operate_finance", {
      p_actor: actor,
      p_id: finance,
      p_action: request.method === "GET" ? "read" : "upload",
    }),
  );
  if (!permitted)
    throw new ApiError(
      404,
      "NOT_FOUND",
      "This request or attachment is not available.",
    );
  const quota = await store.rateLimit(
    request.method === "GET" ? "finances.files.read" : "finances.files.write",
    riskHash(actor, config.riskSecret),
    request.method === "GET" ? 600 : 100,
    900,
  );
  if (!quota.allowed) {
    response.setHeader("Retry-After", String(quota.retryAfter));
    throw new ApiError(
      429,
      "RATE_LIMITED",
      "Please wait before trying more file operations.",
    );
  }
  const reply = (data) => {
    sendJson(response, 200, data, requestId);
    return true;
  };
  if (request.method === "GET" && !action) {
    const q = queryValues(
      url.searchParams,
      z
        .object({ page: z.coerce.number().int().min(1).max(10000).default(1) })
        .strict(),
    );
    return reply(
      checked(
        await db.rpc("finance_attachment_list", {
          p_actor: actor,
          p_finance: finance,
          p_page: q.page,
        }),
      ),
    );
  }
  let body, keyHash;
  if (request.method === "POST") {
    body = await jsonBody(
      request,
      action ? z.object({}).strict() : financeUploadIntent,
      8192,
    );
    keyHash = tokenHash(idempotency(request));
    if (!action) {
      validateDeclaredFile(
        body.filename,
        body.mime,
        body.bytes,
        financeFileTypes,
        10485760,
      );
      if (process.env.UPLOADS_ENABLED !== "true")
        throw new ApiError(
          503,
          "UPLOADS_NOT_READY",
          "File uploads are not configured.",
        );
    }
  }
  const storage = objectStorage();
  try {
    if (action === "download") {
      queryValues(url.searchParams, z.object({}).strict());
      const record = checked(
        await db.rpc("finance_attachment_download", {
          p_actor: actor,
          p_finance: finance,
          p_upload: upload,
          p_request_id: requestId,
        }),
      );
      return reply({
        url: await storage.downloadUrl(
          "finance-attachments",
          record.key,
          record.filename,
        ),
        filename: record.filename,
        expiresIn: 60,
      });
    }
    if (action === "complete") {
      const intent = checked(
        await db
          .from("upload_intents")
          .select("*")
          .eq("id", upload)
          .eq("finance_id", finance)
          .eq("purpose", "finance")
          .eq("owner_id", actor)
          .eq("owner_session", session.sessionId)
          .is("deleted_at", null)
          .maybeSingle(),
      );
      if (!intent)
        throw new ApiError(404, "NOT_FOUND", "This upload is not available.");
      if (intent.state === "pending") {
        if (Date.parse(intent.expires_at) <= Date.now())
          throw new ApiError(
            400,
            "INVALID_UPLOAD",
            "This upload expired. Choose the file again.",
          );
        let head;
        try {
          head = await storage.head(intent.bucket, intent.quarantine_key);
        } catch (e) {
          if (e?.$metadata?.httpStatusCode === 404)
            throw new ApiError(
              400,
              "INVALID_UPLOAD",
              "The file has not finished uploading.",
            );
          throw e;
        }
        if (
          head.ContentLength !== intent.expected_bytes ||
          head.ContentType?.split(";")[0].trim().toLowerCase() !==
            intent.declared_mime ||
          head.Metadata?.sha256 !== intent.expected_sha256
        )
          throw new ApiError(
            400,
            "INVALID_UPLOAD",
            "The uploaded file does not match its intent.",
          );
      }
      return reply(
        checked(
          await db.rpc("mutate_finance_upload", {
            p_actor: actor,
            p_session: session.sessionId,
            p_finance: finance,
            p_upload: upload,
            p_action: "complete",
            p_document: {},
            p_key_hash: keyHash,
            p_request_hash: tokenHash(JSON.stringify(body)),
            p_request_id: requestId,
          }),
        ),
      );
    }
    const result = checked(
      await db.rpc("mutate_finance_upload", {
        p_actor: actor,
        p_session: session.sessionId,
        p_finance: finance,
        p_upload: null,
        p_action: "create",
        p_document: {
          ...body,
          key: `quarantine/${randomUUID()}/${randomUUID()}`,
        },
        p_key_hash: keyHash,
        p_request_hash: tokenHash(JSON.stringify(body)),
        p_request_id: requestId,
      }),
    );
    const intent = checked(
      await db
        .from("upload_intents")
        .select("quarantine_key,expires_at,state,finance_revision")
        .eq("id", result.uploadId)
        .eq("finance_id", finance)
        .eq("owner_id", actor)
        .eq("owner_session", session.sessionId)
        .is("deleted_at", null)
        .maybeSingle(),
    );
    if (
      !intent ||
      intent.state !== "pending" ||
      Date.parse(intent.expires_at) <= Date.now()
    )
      throw new ApiError(
        409,
        "CONFLICT",
        "This upload was already completed or expired. Refresh the attachment list.",
      );
    // Never extend a direct-upload URL beyond its original intent lifetime.
    if (Date.parse(intent.expires_at) - Date.now() < 120000)
      throw new ApiError(
        409,
        "CONFLICT",
        "This upload is expiring. Choose the file again.",
      );
    return reply({
      uploadId: result.uploadId,
      url: await storage.putUrl(
        "finance-attachments",
        intent.quarantine_key,
        body.mime,
        body.bytes,
        body.sha256,
      ),
      expiresIn: 120,
      headers: { "Content-Type": body.mime, "x-amz-meta-sha256": body.sha256 },
    });
  } finally {
    storage.close();
  }
}
