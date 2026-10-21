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
import { riskHash, tokenHash } from "./lib/security.mjs";
import { objectStorage } from "./lib/object-storage.mjs";
import { validateMediaFile } from "./lib/media-content.mjs";
import { mediaUploadIntent } from "../shared/media.mjs";
export async function mediaUploadRoutes(
  request,
  response,
  { db, store, config, requestId },
) {
  const url = new URL(request.url, config.origin),
    uploadMatch = url.pathname.match(
      /^\/api\/v1\/admin\/media\/uploads(?:\/([^/]+)\/(complete))?$/,
    ),
    fileMatch = url.pathname.match(
      /^\/api\/v1\/admin\/media\/files\/([^/]+)\/(download|preview)$/,
    );
  if (!uploadMatch && !fileMatch) return false;
  const id = parse(uuid.nullable(), (uploadMatch || fileMatch)[1] || null),
    action = fileMatch?.[2] || uploadMatch?.[2] || "create";
  allowMethod(request, response, fileMatch ? ["GET"] : ["POST"]);
  const session = await requireSession(request, store, config),
    args = { p_actor: session.user.id, p_session: session.sessionId };
  if (!fileMatch) await requireCsrf(request, session, store);
  queryValues(url.searchParams, z.object({}).strict());
  const rate = await store.rateLimit(
    fileMatch ? "media.files.read" : "media.files.upload",
    riskHash(session.user.id, config.riskSecret),
    fileMatch ? 600 : 100,
    900,
  );
  if (!rate.allowed) {
    response.setHeader("Retry-After", String(rate.retryAfter));
    throw new ApiError(
      429,
      "RATE_LIMITED",
      "Wait before trying more media file operations.",
    );
  }
  let body, key;
  if (!fileMatch) {
    body = await jsonBody(
      request,
      action === "create" ? mediaUploadIntent : z.object({}).strict(),
      8192,
    );
    key = tokenHash(idempotency(request));
    if (action === "create") {
      validateMediaFile(body.filename, body.mime, body.bytes);
      if (process.env.UPLOADS_ENABLED !== "true")
        throw new ApiError(
          503,
          "UPLOADS_NOT_READY",
          "Private media uploads are not configured.",
        );
    }
  }
  const storage = objectStorage(),
    reply = (value) => {
      sendJson(response, 200, value, requestId);
      return true;
    };
  try {
    if (fileMatch) {
      const file = checked(
        await db.rpc("media_private_file", {
          ...args,
          p_file: id,
          p_request_id: requestId,
        }),
      );
      return reply({
        url:
          action === "preview"
            ? await storage.previewUrl("media", file.key, file.mime)
            : await storage.downloadUrl("media", file.key, file.filename),
        filename: file.filename,
        expiresIn: 60,
      });
    }
    if (action === "complete") {
      const intent = checked(
        await db
          .from("upload_intents")
          .select("*")
          .eq("id", id)
          .eq("purpose", "media")
          .eq("owner_id", session.user.id)
          .eq("owner_session", session.sessionId)
          .is("deleted_at", null)
          .maybeSingle(),
      );
      if (!intent)
        throw new ApiError(404, "NOT_FOUND", "This upload is not available.");
      const file = checked(
        await db
          .from("media_files")
          .select("id,team_id,deleted_at,file_type")
          .eq("id", intent.media_id)
          .maybeSingle(),
      );
      if (
        !file ||
        file.deleted_at ||
        !checked(
          await db.rpc("can_operate_media_file", {
            p_actor: session.user.id,
            p_team: file.team_id,
            p_action: "create",
            p_kind: file.file_type,
          }),
        )
      )
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
          head = await storage.head("media", intent.quarantine_key);
        } catch (error) {
          if (error?.$metadata?.httpStatusCode === 404)
            throw new ApiError(
              400,
              "INVALID_UPLOAD",
              "The private file has not finished uploading.",
            );
          throw error;
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
          await db.rpc("mutate_media_upload", {
            ...args,
            p_upload: id,
            p_action: "complete",
            p_document: {},
            p_key_hash: key,
            p_request_hash: tokenHash(JSON.stringify(body)),
            p_request_id: requestId,
          }),
        ),
      );
    }
    const result = checked(
      await db.rpc("mutate_media_upload", {
        ...args,
        p_upload: null,
        p_action: "create",
        p_document: {
          ...body,
          key: "quarantine/" + randomUUID() + "/" + randomUUID(),
        },
        p_key_hash: key,
        p_request_hash: tokenHash(JSON.stringify(body)),
        p_request_id: requestId,
      }),
    );
    const intent = checked(
      await db
        .from("upload_intents")
        .select("quarantine_key,state,expires_at")
        .eq("id", result.uploadId)
        .eq("purpose", "media")
        .eq("owner_id", session.user.id)
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
        "INVALID_STATE",
        "This upload intent is no longer pending.",
      );
    return reply({
      ...result,
      url: await storage.putUrl(
        "media",
        intent.quarantine_key,
        body.mime,
        body.bytes,
        body.sha256,
      ),
      method: "PUT",
      expiresIn: 120,
      headers: { "Content-Type": body.mime, "x-amz-meta-sha256": body.sha256 },
    });
  } finally {
    storage.close();
  }
}
