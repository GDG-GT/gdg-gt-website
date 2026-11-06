import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireSession, requireCsrf } from "./auth.mjs";
import { ApiError, allowMethod, jsonBody, sendJson } from "./lib/http.mjs";
import {
  databaseResult as checked,
  parse,
  uuid,
  slug,
  idempotency,
} from "./lib/validation.mjs";
import { tokenHash, validToken, riskHash } from "./lib/security.mjs";
import { objectStorage } from "./lib/object-storage.mjs";
import { validateDeclaredFile } from "./lib/upload-content.mjs";
const proof = z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  base = { versionId: uuid, uploadToken: proof, accessToken: proof.optional() };
export async function uploadRoutes(
  request,
  response,
  { db, store, config, requestId },
) {
  const url = new URL(request.url, config.origin),
    publicMatch = url.pathname.match(
      /^\/api\/v1\/forms\/([^/]+)\/uploads(?:\/(prepare|recovery|[^/]+)(?:\/(complete|status|remove))?)?$/,
    ),
    protectedMatch = url.pathname.match(
      /^\/api\/v1\/admin\/forms\/([^/]+)\/responses\/([^/]+)\/files\/([^/]+)$/,
    );
  if (!publicMatch && !protectedMatch) return false;
  if (protectedMatch) {
    allowMethod(request, response, ["GET"]);
    const [formId, responseId, fileId] = protectedMatch
        .slice(1)
        .map((v) => parse(uuid, v)),
      session = await requireSession(request, store, config);
    if (
      !checked(
        await db.rpc("can_operate_form", {
          p_actor: session.user.id,
          p_form: formId,
          p_action: "view_responses",
        }),
      )
    )
      throw new ApiError(404, "NOT_FOUND", "This file is not available.");
    const record = checked(
      await db
        .from("form_uploads")
        .select("id,private_object_key,original_filename,field_id,version_id")
        .eq("id", fileId)
        .eq("form_id", formId)
        .eq("response_id", responseId)
        .eq("scan_state", "clean")
        .is("deleted_at", null)
        .maybeSingle(),
    );
    const answer = checked(
      await db
        .from("form_responses")
        .select("id,version_id,deleted_at,redacted_at")
        .eq("id", responseId)
        .eq("form_id", formId)
        .maybeSingle(),
    );
    if (!record || !answer || answer.deleted_at || answer.redacted_at)
      throw new ApiError(404, "NOT_FOUND", "This file is not available.");
    const version = checked(
        await db
          .from("form_versions")
          .select("definition")
          .eq("id", answer.version_id)
          .single(),
      ),
      field = version.definition.fields.find((f) => f.id === record.field_id);
    if (
      !field ||
      (field.sensitive &&
        !checked(
          await db.rpc("can_operate_form", {
            p_actor: session.user.id,
            p_form: formId,
            p_action: "view_sensitive_responses",
          }),
        ))
    )
      throw new ApiError(404, "NOT_FOUND", "This file is not available.");
    const storage = objectStorage();
    try {
      const signed = await storage.downloadUrl(
        "form-uploads",
        record.private_object_key,
        record.original_filename,
      );
      await store.audit({
        actorId: session.user.id,
        action: "forms.file_downloaded",
        targetType: "form_response",
        targetId: responseId,
        requestId,
        metadata: { formId, fileId, versionId: answer.version_id },
      });
      sendJson(
        response,
        200,
        { url: signed, expiresIn: 60, filename: record.original_filename },
        requestId,
      );
    } finally {
      storage.close();
    }
    return true;
  }
  allowMethod(request, response, ["POST"]);
  const preparation = ["prepare", "recovery"].includes(publicMatch[2]),
    recovering = publicMatch[2] === "recovery",
    statusRead = publicMatch[3] === "status" || recovering;
  if (
    (publicMatch[2] && !preparation && !publicMatch[3]) ||
    (preparation && publicMatch[3])
  )
    throw new ApiError(
      404,
      "NOT_FOUND",
      "This upload operation is not available.",
    );
  const quota = await store.rateLimit(
    statusRead ? "uploads.status.ip" : "uploads.intent.ip",
    riskHash(request.socket?.remoteAddress || "unknown", config.riskSecret),
    statusRead ? 600 : 100,
    900,
  );
  if (!quota.allowed) {
    response.setHeader("Retry-After", String(quota.retryAfter));
    throw new ApiError(
      429,
      "RATE_LIMITED",
      "Please wait before uploading more files.",
    );
  }
  const formSlug = parse(slug, publicMatch[1]),
    operation = publicMatch[3],
    id = publicMatch[2] && !preparation ? parse(uuid, publicMatch[2]) : null;
  const body = await jsonBody(
    request,
    operation
      ? z.object(base).strict()
      : z
          .object({
            ...base,
            fieldId: uuid,
            filename: z.string().min(1).max(180),
            mime: z.string().max(150),
            bytes: z.number().int().min(1).max(26214400),
            sha256: z.string().regex(/^[a-f0-9]{64}$/),
          })
          .strict(),
    8192,
  );
  const form = checked(
    await db
      .from("forms")
      .select(
        "id,published_version_id,state,access_mode,team_id,opens_at,closes_at",
      )
      .eq("slug", formSlug)
      .maybeSingle(),
  );
  if (
    !form ||
    !form.published_version_id ||
    ["Draft", "Archived"].includes(form.state)
  )
    throw new ApiError(404, "NOT_FOUND", "This form is not available.");
  let session;
  if (form.access_mode === "internal") {
    session = await requireSession(request, store, config);
    await requireCsrf(request, session, store);
    if (
      form.team_id &&
      !["admin", "super_admin"].includes(session.user.role) &&
      !(await store.memberships(session.user.id)).some(
        (m) => m.team_id === form.team_id && m.team?.is_active,
      )
    )
      throw new ApiError(403, "ACCESS_REQUIRED", "Chapter access is required.");
  } else if (form.access_mode !== "public") {
    if (!validToken(body.accessToken))
      throw new ApiError(
        403,
        "ACCESS_REQUIRED",
        "A valid private form link is required.",
      );
    const access = checked(
      await db
        .from("form_access_tokens")
        .select("id,used_count,use_limit")
        .eq("form_id", form.id)
        .eq("token_type", form.access_mode)
        .eq("token_hash", tokenHash(body.accessToken))
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle(),
    );
    if (!access || access.used_count >= access.use_limit)
      throw new ApiError(
        403,
        "ACCESS_REQUIRED",
        "A valid private form link is required.",
      );
  }
  if (form.published_version_id !== body.versionId)
    throw new ApiError(
      409,
      "CONFLICT",
      "This form changed. Reload before uploading.",
    );
  const group = tokenHash(body.uploadToken),
    preparationArgs = preparation
      ? {
          p_form: form.id,
          p_version: body.versionId,
          p_field: body.fieldId,
          p_proof: group,
          p_actor: session?.user.id || null,
          p_session: session?.sessionId || null,
          p_access_hash: body.accessToken ? tokenHash(body.accessToken) : null,
          p_key_hash: tokenHash(idempotency(request)),
          p_request_hash: tokenHash(JSON.stringify(body)),
        }
      : undefined;
  if (recovering) {
    const value = checked(
      await db.rpc("inspect_form_upload_preparation", preparationArgs),
    );
    sendJson(
      response,
      200,
      {
        committed: value.committed,
        canRetry: value.canRetry,
        uploadId: value.uploadId,
        state: value.state,
      },
      requestId,
    );
    return true;
  }
  const storage = objectStorage();
  try {
    if (operation) {
      const record = checked(
        await db
          .from("upload_intents")
          .select("*")
          .eq("id", id)
          .eq("form_id", form.id)
          .eq("version_id", body.versionId)
          .eq("proof_hash", group)
          .is("deleted_at", null)
          .maybeSingle(),
      );
      if (!record)
        throw new ApiError(
          404,
          "UPLOAD_NOT_FOUND",
          "This upload is not available.",
        );
      if (operation === "remove") {
        checked(
          await db.rpc("remove_form_upload", {
            p_form: form.id,
            p_id: id,
            p_proof: group,
          }),
        );
        await storage.delete(record.bucket, record.quarantine_key);
        if (record.clean_key)
          await storage.delete(record.bucket, record.clean_key);
        sendJson(response, 200, { removed: true }, requestId);
        return true;
      }
      if (operation === "complete" && record.state === "pending") {
        if (new Date(record.expires_at) <= new Date())
          throw new ApiError(
            400,
            "INVALID_UPLOAD",
            "This upload intent expired. Choose the file again.",
          );
        let head;
        try {
          head = await storage.head(record.bucket, record.quarantine_key);
        } catch (error) {
          if (error?.$metadata?.httpStatusCode === 404)
            throw new ApiError(
              400,
              "INVALID_UPLOAD",
              "The file has not finished uploading.",
            );
          throw error;
        }
        if (
          head.ContentLength !== record.expected_bytes ||
          head.ContentType?.split(";")[0].trim().toLowerCase() !==
            record.declared_mime ||
          head.Metadata?.sha256 !== record.expected_sha256
        )
          throw new ApiError(
            400,
            "INVALID_UPLOAD",
            "The uploaded file does not match its intent.",
          );
        checked(
          await db.rpc("queue_upload_scan", { p_id: id, p_proof: group }),
        );
        record.state = "queued";
      }
      const file = checked(
        await db
          .from("form_uploads")
          .select("scan_state,original_filename,byte_size")
          .eq("id", id)
          .is("deleted_at", null)
          .maybeSingle(),
      );
      if (!file)
        throw new ApiError(
          404,
          "UPLOAD_NOT_FOUND",
          "This upload is not available.",
        );
      sendJson(
        response,
        200,
        {
          uploadId: id,
          state:
            record.state === "pending" &&
            new Date(record.expires_at) <= new Date()
              ? "expired"
              : record.state,
          scanState: file.scan_state,
          filename: file.original_filename,
          bytes: file.byte_size,
          ...(record.state === "rejected"
            ? {
                message:
                  "This file did not pass security validation. Choose a different file.",
              }
            : {}),
        },
        requestId,
      );
      return true;
    }
    if (process.env.UPLOADS_ENABLED !== "true")
      throw new ApiError(
        503,
        "UPLOADS_NOT_READY",
        "File uploads are not configured.",
      );
    const version = checked(
        await db
          .from("form_versions")
          .select("definition")
          .eq("id", body.versionId)
          .eq("form_id", form.id)
          .single(),
      ),
      field = version.definition.fields.find(
        (f) => f.id === body.fieldId && f.type === "file",
      );
    if (!field)
      throw new ApiError(
        400,
        "INVALID_UPLOAD",
        "This field does not accept files.",
      );
    validateDeclaredFile(
      body.filename,
      body.mime,
      body.bytes,
      field.allowedMime,
      field.maxFileBytes,
    );
    const objectKey = "quarantine/" + randomUUID() + "/" + randomUUID(),
      uploadId = checked(
        await db.rpc(
          preparation ? "prepare_form_upload" : "create_form_upload",
          {
            p_form: form.id,
            p_version: body.versionId,
            p_field: body.fieldId,
            p_proof: group,
            ...(preparation
              ? {
                  p_actor: preparationArgs.p_actor,
                  p_session: preparationArgs.p_session,
                  p_access_hash: preparationArgs.p_access_hash,
                  p_key_hash: preparationArgs.p_key_hash,
                  p_request_hash: preparationArgs.p_request_hash,
                }
              : {}),
            p_document: {
              key: objectKey,
              filename: body.filename,
              mime: body.mime,
              bytes: body.bytes,
              sha256: body.sha256,
            },
          },
        ),
      );
    const prepared = preparation
      ? checked(
          await db
            .from("upload_intents")
            .select("id,state,expires_at,quarantine_key,deleted_at")
            .eq("id", uploadId)
            .eq("form_id", form.id)
            .eq("version_id", body.versionId)
            .eq("field_id", body.fieldId)
            .eq("proof_hash", group)
            .maybeSingle(),
        )
      : null;
    if (
      preparation &&
      (!prepared ||
        prepared.deleted_at ||
        prepared.state === "expired" ||
        prepared.state === "rejected" ||
        (prepared.state === "pending" &&
          new Date(prepared.expires_at) <= new Date()))
    )
      throw new ApiError(
        400,
        "INVALID_UPLOAD",
        "This upload is no longer available. Choose the file again.",
      );
    if (prepared && prepared.state !== "pending") {
      sendJson(response, 200, { uploadId, state: prepared.state }, requestId);
      return true;
    }
    const signed = await storage.putUrl(
      "form-uploads",
      prepared ? prepared.quarantine_key : objectKey,
      body.mime,
      body.bytes,
      body.sha256,
    );
    sendJson(
      response,
      200,
      {
        uploadId,
        state: "pending",
        url: signed,
        expiresIn: 120,
        headers: {
          "Content-Type": body.mime,
          "x-amz-meta-sha256": body.sha256,
        },
      },
      requestId,
    );
  } finally {
    storage.close();
  }
  return true;
}
