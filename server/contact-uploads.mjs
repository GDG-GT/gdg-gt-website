import { randomUUID } from "node:crypto";
import { z } from "zod";
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
import {
  contactUploadIntent,
  contactUploadProof,
  contactFileTypes,
} from "../shared/contact.mjs";
export async function contactUploadRoutes(
  request,
  response,
  { db, store, config, requestId },
) {
  const url = new URL(request.url, config.origin),
    match = url.pathname.match(
      /^\/api\/v1\/contact\/(upload-intents|uploads\/([^/]+)(?:\/(complete|status))?)$/,
    );
  if (!match) return false;
  const upload = match[2] ? parse(uuid, match[2]) : null,
    action = upload ? match[3] || "remove" : "create";
  allowMethod(request, response, action === "remove" ? ["DELETE"] : ["POST"]);
  queryValues(url.searchParams, z.object({}).strict());
  const body = await jsonBody(
      request,
      action === "create" ? contactUploadIntent : contactUploadProof,
      8192,
    ),
    proof = tokenHash(body.uploadToken),
    risk = riskHash(
      request.socket?.remoteAddress || "unknown",
      config.riskSecret,
    );
  const rate = await store.rateLimit(
    "contact.files." + (action === "create" ? "create" : "read"),
    risk,
    action === "create" ? 10 : 600,
    900,
  );
  if (!rate.allowed) {
    response.setHeader("Retry-After", String(rate.retryAfter));
    throw new ApiError(
      429,
      "RATE_LIMITED",
      "Please wait before another contact upload request.",
    );
  }
  const args = {
    p_upload: upload,
    p_proof: proof,
    p_risk: risk,
    p_action: action,
    p_document: {},
    p_key_hash: action === "status" ? null : tokenHash(idempotency(request)),
    p_request_hash:
      action === "status" ? null : tokenHash(JSON.stringify(body)),
  };
  const reply = (value) => {
    sendJson(response, 200, value, requestId);
    return true;
  };
  if (action === "status" || action === "remove")
    return reply(checked(await db.rpc("mutate_contact_upload", args)));
  if (process.env.UPLOADS_ENABLED !== "true")
    throw new ApiError(
      503,
      "UPLOADS_NOT_READY",
      "Private attachment uploads are not configured.",
    );
  if (action === "create")
    validateDeclaredFile(
      body.filename,
      body.mime,
      body.bytes,
      contactFileTypes,
      10485760,
    );
  const storage = objectStorage();
  try {
    if (action === "create") {
      const {
        uploadToken: ignoredToken,
        website: ignoredTrap,
        ...document
      } = body;
      void ignoredToken;
      void ignoredTrap;
      const result = checked(
        await db.rpc("mutate_contact_upload", {
          ...args,
          p_document: {
            ...document,
            key: `quarantine/${randomUUID()}/${randomUUID()}`,
          },
        }),
      );
      const intent = checked(
        await db
          .from("upload_intents")
          .select("quarantine_key,expires_at,state,contact_id,deleted_at")
          .eq("id", result.uploadId)
          .eq("purpose", "contact")
          .eq("proof_hash", proof)
          .maybeSingle(),
      );
      if (
        !intent ||
        intent.state !== "pending" ||
        intent.contact_id ||
        intent.deleted_at ||
        Date.parse(intent.expires_at) - Date.now() < 120000
      )
        throw new ApiError(
          409,
          "CONFLICT",
          "This upload is completed or expiring. Choose the file again.",
        );
      return reply({
        uploadId: result.uploadId,
        url: await storage.putUrl(
          "contact-attachments",
          intent.quarantine_key,
          body.mime,
          body.bytes,
          body.sha256,
        ),
        headers: {
          "Content-Type": body.mime,
          "x-amz-meta-sha256": body.sha256,
        },
        expiresIn: 120,
      });
    }
    const intent = checked(
      await db
        .from("upload_intents")
        .select(
          "bucket,quarantine_key,expected_bytes,declared_mime,expected_sha256,expires_at,state,deleted_at,contact_id",
        )
        .eq("id", upload)
        .eq("purpose", "contact")
        .eq("proof_hash", proof)
        .maybeSingle(),
    );
    if (!intent || intent.deleted_at || intent.contact_id)
      throw new ApiError(
        404,
        "NOT_FOUND",
        "This attachment upload is unavailable.",
      );
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
            "The attachment has not finished uploading.",
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
          "The attachment does not match its upload intent.",
        );
    }
    return reply(checked(await db.rpc("mutate_contact_upload", args)));
  } finally {
    storage.close();
  }
}
