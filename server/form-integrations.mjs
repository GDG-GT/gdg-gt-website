import { z } from "zod";
import { requireSession, requireCsrf } from "./auth.mjs";
import { allowMethod, jsonBody, sendJson } from "./lib/http.mjs";
import { databaseResult as checked, parse, uuid, queryValues, idempotency, text } from "./lib/validation.mjs";
import { tokenHash } from "./lib/security.mjs";
export const formIntegrationInput = z.object({ revision: z.number().int().min(0),
  formId: uuid, versionPolicy: z.literal("latest_published"), label: text(80, 1) }).strict();
const removeInput = z.object({ revision: z.number().int().min(1) }).strict();
export async function formIntegrationRoutes(request, response, { db, store, config, requestId }) {
  const url = new URL(request.url, config.origin), match = url.pathname.match(/^\/api\/v1\/admin\/form-integrations\/(event|team|campaign)\/([^/]+)(?:\/(candidates|[a-z][a-z0-9-]{0,39}))?$/);
  if (!match) return false;
  const candidates = match[3] === "candidates", slot = candidates ? null : match[3];
  allowMethod(request, response, candidates || !slot ? ["GET"] : ["PUT", "DELETE"]);
  const query = queryValues(url.searchParams, candidates ? z.object({ q: text(100).default("") }).strict() : z.object({}).strict());
  const session = await requireSession(request, store, config), args = { p_actor: session.user.id, p_session: session.sessionId,
    p_kind: match[1], p_resource: parse(uuid, match[2]) };
  if (request.method === "GET") {
    const result = checked(await db.rpc(candidates ? "form_integration_candidates" : "read_form_integrations", { ...args, ...(candidates ? { p_query: query.q } : {}) }));
    sendJson(response, 200, result, requestId); return true;
  }
  await requireCsrf(request, session, store);
  const { revision, ...document } = await jsonBody(request, request.method === "DELETE" ? removeInput : formIntegrationInput, 2048),
    value = request.method === "DELETE" ? null : document;
  const result = checked(await db.rpc("mutate_form_integration", { ...args, p_slot: slot, p_revision: revision, p_document: value,
    p_key_hash: tokenHash(idempotency(request)), p_request_hash: tokenHash(JSON.stringify({ revision, document: value })), p_request_id: requestId }));
  sendJson(response, 200, result, requestId); return true;
}
