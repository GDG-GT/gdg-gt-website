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
import {
  mediaFolderCreate,
  mediaFolderUpdate,
  mediaFolderRemove,
  mediaListQuery,
  mediaFileMutation,
} from "../shared/media.mjs";
export async function mediaRoutes(
  request,
  response,
  { db, store, config, requestId },
) {
  const url = new URL(request.url, config.origin),
    match = url.pathname.match(
      /^\/api\/v1\/admin\/media(?:\/(folders|files|events)(?:\/([^/]+))?)?$/,
    );
  if (!match) return false;
  const folder = match[2] ? parse(uuid, match[2]) : null;
  if (match[1] === "files" && folder) return false;
  allowMethod(
    request,
    response,
    !match[1] || match[1] === "events"
      ? ["GET"]
      : folder
        ? ["PATCH", "DELETE"]
        : ["POST"],
  );
  const session = await requireSession(request, store, config),
    args = { p_actor: session.user.id, p_session: session.sessionId };
  const rate = await store.rateLimit(
    request.method === "GET" ? "media.read" : "media.write",
    riskHash(session.user.id, config.riskSecret),
    request.method === "GET" ? 600 : 100,
    900,
  );
  if (!rate.allowed) {
    response.setHeader("Retry-After", String(rate.retryAfter));
    throw new ApiError(
      429,
      "RATE_LIMITED",
      "Wait before trying more media operations.",
    );
  }
  if (match[1] === "events") {
    if (folder)
      throw new ApiError(404, "NOT_FOUND", "This endpoint was not found.");
    const values = queryValues(
      url.searchParams,
      z
        .object({
          team: z.union([uuid, z.literal("chapter")]),
          q: z.string().trim().max(100).default(""),
        })
        .strict(),
    );
    sendJson(
      response,
      200,
      {
        items: checked(
          await db.rpc("read_media_event_options", {
            ...args,
            p_team: values.team === "chapter" ? null : values.team,
            p_query: values.q,
          }),
        ),
      },
      requestId,
    );
    return true;
  }
  if (request.method === "GET") {
    const {
        page,
        pageSize,
        team,
        folder: folderFilter,
        starred,
        ...query
      } = queryValues(url.searchParams, mediaListQuery),
      filters = {
        ...query,
        ...(team !== undefined
          ? { teamId: team === "chapter" ? null : team }
          : {}),
        ...(folderFilter !== undefined
          ? { folderId: folderFilter === "root" ? null : folderFilter }
          : {}),
        ...(starred ? { starred: starred === "true" } : {}),
      };
    sendJson(
      response,
      200,
      checked(
        await db.rpc("read_media_workspace", {
          ...args,
          p_filters: filters,
          p_page: page,
          p_size: pageSize,
        }),
      ),
      requestId,
    );
    return true;
  }
  await requireCsrf(request, session, store);
  queryValues(url.searchParams, z.object({}).strict());
  if (match[1] === "files") {
    const body = await jsonBody(request, mediaFileMutation, 32768);
    sendJson(
      response,
      200,
      checked(
        await db.rpc("mutate_media_files", {
          ...args,
          p_action: body.action,
          p_files: body.files,
          p_document: body.document,
          p_key_hash: tokenHash(idempotency(request)),
          p_request_hash: tokenHash(JSON.stringify(body)),
          p_request_id: requestId,
        }),
      ),
      requestId,
    );
    return true;
  }
  const body = await jsonBody(
      request,
      request.method === "DELETE"
        ? mediaFolderRemove
        : folder
          ? mediaFolderUpdate
          : mediaFolderCreate,
      4096,
    ),
    { action, revision, ...document } = body,
    result = checked(
      await db.rpc("mutate_media_folder", {
        ...args,
        p_folder: folder,
        p_action:
          request.method === "DELETE" ? "delete" : folder ? action : "create",
        p_revision: revision ?? null,
        p_document: document,
        p_request_id: requestId,
      }),
    );
  sendJson(response, 200, result, requestId);
  return true;
}
