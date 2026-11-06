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
import { riskHash, verifySecret, tokenHash } from "./lib/security.mjs";
import { objectStorage } from "./lib/object-storage.mjs";
import {
  contactInboxQuery,
  contactMutation,
  contactMutationInspection,
} from "../shared/contact.mjs";
export async function contactInboxRoutes(
  request,
  response,
  { db, store, config, requestId },
) {
  const url = new URL(request.url, config.origin),
    match = url.pathname.match(
      /^\/api\/v1\/admin\/contact-submissions(?:\/([^/]+)(?:\/(attachment|recovery))?)?$/,
    );
  if (!match) return false;
  const id = match[1] ? parse(uuid, match[1]) : null,
    download = match[2] === "attachment",
    recovering = match[2] === "recovery";
  allowMethod(
    request,
    response,
    recovering ? ["POST"] : download || !id ? ["GET"] : ["GET", "POST"],
  );
  const session = await requireSession(request, store, config),
    args = { p_actor: session.user.id, p_session: session.sessionId };
  if (request.method === "POST") await requireCsrf(request, session, store);
  const rate = await store.rateLimit(
    "contact.inbox",
    riskHash(session.user.id, config.riskSecret),
    300,
    900,
  );
  if (!rate.allowed)
    throw new ApiError(
      429,
      "RATE_LIMITED",
      "Please wait before more contact inbox requests.",
    );
  if (request.method === "GET") {
    const { page, ...filters } = queryValues(
      url.searchParams,
      id ? z.object({}).strict() : contactInboxQuery,
    );
    if (download) {
      const file = checked(
          await db.rpc("contact_attachment_download", {
            ...args,
            p_contact: id,
            p_request_id: requestId,
          }),
        ),
        storage = objectStorage();
      try {
        sendJson(
          response,
          200,
          {
            url: await storage.downloadUrl(
              "contact-attachments",
              file.key,
              file.filename,
            ),
            filename: file.filename,
            expiresIn: 60,
          },
          requestId,
        );
      } finally {
        storage.close();
      }
    } else
      sendJson(
        response,
        200,
        checked(
          await db.rpc("contact_inbox", {
            ...args,
            p_id: id,
            p_filters: filters,
            p_page: page || 1,
          }),
        ),
        requestId,
      );
  } else {
    queryValues(url.searchParams, z.object({}).strict());
    const key = idempotency(request),
      body = await jsonBody(
        request,
        recovering ? contactMutationInspection : contactMutation,
        8192,
      ),
      { currentPassword, ...original } = body,
      { action, revision, ...document } = original;
    const argsWrite = {
      ...args,
      p_id: id,
      p_revision: revision,
      p_action: action,
      p_document: document,
      p_key_hash: tokenHash(key),
      p_request_hash: tokenHash(JSON.stringify(original)),
    };
    if (recovering) {
      sendJson(
        response,
        200,
        checked(await db.rpc("inspect_contact_write", argsWrite)),
        requestId,
      );
      return true;
    }
    let hash = null;
    if (action === "hold") {
      const account = await store.accountByEmail(session.user.email);
      if (!(await verifySecret(currentPassword, account?.password_hash)))
        throw new ApiError(
          403,
          "PASSWORD_REQUIRED",
          "Confirm your current password before changing the retention hold.",
        );
      hash = account.password_hash;
    }
    sendJson(
      response,
      200,
      checked(
        await db.rpc("mutate_contact_write", {
          ...argsWrite,
          p_verified_hash: hash,
          p_request_id: requestId,
        }),
      ),
      requestId,
    );
  }
  return true;
}
