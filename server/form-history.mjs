import { z } from "zod";
import { requireSession } from "./auth.mjs";
import { allowMethod, sendJson } from "./lib/http.mjs";
import { databaseResult as checked, parse, uuid, queryValues } from "./lib/validation.mjs";
export async function formHistoryRoutes(request, response, { db, store, config, requestId }) {
  const url = new URL(request.url, config.origin),
    match = url.pathname.match(/^\/api\/v1\/admin\/forms\/([^/]+)\/responses\/([^/]+)\/history(?:\/(\d+))?$/);
  if (!match) return false;
  allowMethod(request, response, ["GET"]);
  const session = await requireSession(request, store, config),
    query = queryValues(url.searchParams, z.object({
      page: z.coerce.number().int().min(1).max(10000).default(1),
      sensitive: z.enum(["true", "false"]).default("false"),
    }).strict());
  const result = checked(await db.rpc("review_form_response_history", {
    p_actor: session.user.id, p_session: session.sessionId,
    p_form: parse(uuid, match[1]), p_response: parse(uuid, match[2]),
    p_revision: match[3] === undefined ? null : parse(z.coerce.number().int().min(0).max(2147483647), match[3]),
    p_page: query.page, p_sensitive: match[3] !== undefined && query.sensitive === "true", p_request_id: requestId,
  }));
  sendJson(response, 200, result, requestId);
  return true;
}
