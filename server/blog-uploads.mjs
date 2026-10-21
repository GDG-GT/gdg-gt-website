import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireSession, requireCsrf } from "./auth.mjs";
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
import { blogFileIntent, blogFileTypes } from "../shared/blog-uploads.mjs";
export async function blogUploadRoutes(
  request,
  response,
  { db, store, config, requestId },
) {
  const url = new URL(request.url, config.origin),
    match = url.pathname.match(
      /^\/api\/v1\/admin\/blog\/uploads(?:\/([^/]+)\/(complete|download))?$/,
    );
  if (!match) return false;
  const upload = match[1] ? parse(uuid, match[1]) : null,
    action = match[2];
  allowMethod(request, response, action === "download" ? ["GET"] : ["POST"]);
  const session = await requireSession(request, store, config),
    actor = session.user.id;
  if (request.method === "POST") await requireCsrf(request, session, store);
  const quota = await store.rateLimit(
    request.method === "GET" ? "blog.files.read" : "blog.files.write",
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
  queryValues(url.searchParams, z.object({}).strict());
  const reply = (data) => {
    sendJson(response, 200, data, requestId);
    return true;
  };
  let body, keyHash;
  if (request.method === "POST") {
    body = await jsonBody(
      request,
      action ? z.object({}).strict() : blogFileIntent,
      8192,
    );
    keyHash = tokenHash(idempotency(request));
    if (!action) {
      validateDeclaredFile(
        body.filename,
        body.mime,
        body.bytes,
        blogFileTypes,
        20971520,
      );
      if (process.env.UPLOADS_ENABLED !== "true")
        throw new ApiError(
          503,
          "UPLOADS_NOT_READY",
          "Private file uploads are not configured.",
        );
    }
  }
  const storage = objectStorage();
  try {
    if (action === "download") {
      const file = checked(
        await db.rpc("blog_file_download", {
          p_actor: actor,
          p_upload: upload,
          p_request_id: requestId,
        }),
      );
      return reply({
        url: await storage.downloadUrl(
          "blog-submissions",
          file.key,
          file.filename,
        ),
        filename: file.filename,
        expiresIn: 60,
      });
    }
    if (action === "complete") {
      const intent = checked(
        await db
          .from("upload_intents")
          .select("*")
          .eq("id", upload)
          .eq("purpose", "blog")
          .eq("owner_id", actor)
          .eq("owner_session", session.sessionId)
          .is("deleted_at", null)
          .maybeSingle(),
      );
      if (!intent)
        throw new ApiError(404, "NOT_FOUND", "This upload is not available.");
      const permitted = checked(
        await db.rpc("can_operate_blog", {
          p_actor: actor,
          p_kind: "submissions",
          p_id: intent.blog_submission_id,
          p_team: null,
          p_action: "read",
        }),
      );
      if (!permitted)
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
              "The private file has not finished uploading.",
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
          await db.rpc("mutate_blog_upload", {
            p_actor: actor,
            p_session: session.sessionId,
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
      await db.rpc("mutate_blog_upload", {
        p_actor: actor,
        p_session: session.sessionId,
        p_upload: null,
        p_action: "create",
        p_document: {
          ...body,
          key: "quarantine/" + randomUUID() + "/" + randomUUID(),
        },
        p_key_hash: keyHash,
        p_request_hash: tokenHash(JSON.stringify(body)),
        p_request_id: requestId,
      }),
    );
    const intent = checked(
      await db
        .from("upload_intents")
        .select("quarantine_key,expires_at,state,blog_submission_id")
        .eq("id", result.uploadId)
        .eq("purpose", "blog")
        .eq("owner_id", actor)
        .eq("owner_session", session.sessionId)
        .is("deleted_at", null)
        .maybeSingle(),
    );
    if (
      !intent ||
      intent.state !== "pending" ||
      Date.parse(intent.expires_at) - Date.now() < 120000
    )
      throw new ApiError(
        409,
        "CONFLICT",
        "This upload was completed or is expiring. Refresh and choose a fresh file.",
      );
    const sub = checked(
      await db
        .from("blog_submissions")
        .select("deleted_at")
        .eq("id", intent.blog_submission_id)
        .maybeSingle(),
    );
    if (
      !sub ||
      sub.deleted_at ||
      !checked(
        await db.rpc("can_operate_blog", {
          p_actor: actor,
          p_kind: "submissions",
          p_id: intent.blog_submission_id,
          p_team: null,
          p_action: "read",
        }),
      )
    )
      throw new ApiError(404, "NOT_FOUND", "This submission is not available.");
    return reply({
      uploadId: result.uploadId,
      submissionId: result.submissionId,
      url: await storage.putUrl(
        "blog-submissions",
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
