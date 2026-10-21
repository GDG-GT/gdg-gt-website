import { z } from "zod";
import { requireSession, requireCsrf } from "./auth.mjs";
import { ApiError, allowMethod, jsonBody, sendJson } from "./lib/http.mjs";
import { databaseResult as checked, parse, uuid, queryValues } from "./lib/validation.mjs";
import { riskHash } from "./lib/security.mjs";
import { mediaFolderCreate, mediaFolderUpdate, mediaFolderRemove, mediaListQuery } from "../shared/media.mjs";
export async function mediaRoutes(request, response, { db, store, config, requestId }) {
  const url = new URL(request.url, config.origin), match = url.pathname.match(/^\/api\/v1\/admin\/media(?:\/(folders)(?:\/([^/]+))?)?$/);
  if (!match) return false;
  const folder = match[2] ? parse(uuid, match[2]) : null;
  allowMethod(request, response, !match[1] ? ["GET"] : folder ? ["PATCH", "DELETE"] : ["POST"]);
  const session = await requireSession(request, store, config), args = { p_actor: session.user.id, p_session: session.sessionId };
  const rate = await store.rateLimit(request.method === "GET" ? "media.read" : "media.write", riskHash(session.user.id, config.riskSecret), request.method === "GET" ? 600 : 100, 900);
  if (!rate.allowed) { response.setHeader("Retry-After", String(rate.retryAfter)); throw new ApiError(429, "RATE_LIMITED", "Wait before trying more media operations."); }
  if (request.method === "GET") {
    const { page, pageSize, team, folder: folderFilter, starred, ...query } = queryValues(url.searchParams, mediaListQuery),
      filters = { ...query, ...(team !== undefined ? { teamId: team === "chapter" ? null : team } : {}),
        ...(folderFilter !== undefined ? { folderId: folderFilter === "root" ? null : folderFilter } : {}), ...(starred ? { starred: starred === "true" } : {}) };
    sendJson(response, 200, checked(await db.rpc("read_media_workspace", { ...args, p_filters: filters, p_page: page, p_size: pageSize })), requestId); return true;
  }
  await requireCsrf(request, session, store); queryValues(url.searchParams, z.object({}).strict());
  const body = await jsonBody(request, request.method === "DELETE" ? mediaFolderRemove : folder ? mediaFolderUpdate : mediaFolderCreate, 4096),
    { action, revision, ...document } = body,
    result = checked(await db.rpc("mutate_media_folder", { ...args, p_folder: folder, p_action: request.method === "DELETE" ? "delete" : folder ? action : "create",
      p_revision: revision ?? null, p_document: document, p_request_id: requestId }));
  sendJson(response, 200, result, requestId); return true;
}
