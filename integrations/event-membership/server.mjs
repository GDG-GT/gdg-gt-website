// Server-only adapter for a separate event project. No main database key required.
import { timingSafeEqual } from "node:crypto";
const id = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
const valid = (supplied, expected) =>
  typeof supplied === "string" &&
  Buffer.byteLength(supplied) === Buffer.byteLength(expected) &&
  timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
async function body(request) {
  if (
    !/^application\/json(?:;\s*charset=utf-8)?$/i.test(
      request.headers.get("content-type") || "",
    )
  )
    throw Error();
  const reader = request.body?.getReader();
  if (!reader) throw Error();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 2048) {
        await reader.cancel();
        throw Error();
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks).toString());
}
export function createEventAdapter({ eventId, eventKey, db }) {
  if (
    !id.test(eventId) ||
    !new RegExp("^" + eventId + "\\.[A-Za-z0-9_-]{43}$").test(eventKey)
  )
    throw Error("Configure this event’s server credential.");
  return async (request) => {
    if (request.method !== "POST")
      return json({ error: "Method not allowed" }, 405);
    if (
      request.headers.has("origin") ||
      request.headers.has("cookie") ||
      request.headers.has("sec-fetch-site") ||
      !valid(request.headers.get("authorization"), "Bearer " + eventKey)
    )
      return json({ error: "Unauthorized" }, 401);
    try {
      const d = await body(request);
      if (
        d.eventId !== eventId ||
        !["health", "lookup", "checkin"].includes(d.action) ||
        Object.keys(d).some(
          (k) => !["eventId", "action", "memberRef", "checkinId"].includes(k),
        )
      )
        return json({ error: "Invalid request" }, 400);
      if (d.action === "health")
        return json({ eventId, protocol: "gdg-membership-v1" });
      if (
        !id.test(d.memberRef) ||
        (d.action === "checkin" && !id.test(d.checkinId)) ||
        (d.action === "lookup" && d.checkinId !== undefined)
      )
        return json({ error: "Invalid request" }, 400);
      const result = await db.rpc("gdg_event_attendance", {
        p_member: d.memberRef,
        p_request: d.action === "checkin" ? d.checkinId : null,
      });
      if (result.error) throw Error();
      return json(result.data);
    } catch {
      return json({ error: "Event verification unavailable" }, 503);
    }
  };
}
export function createEventMembershipClient({
  eventId,
  eventKey,
  mainOrigin = "https://gdggt.dev",
  fetchImpl = fetch,
}) {
  if (
    !id.test(eventId) ||
    !new RegExp("^" + eventId + "\\.[A-Za-z0-9_-]{43}$").test(eventKey) ||
    mainOrigin !== "https://gdggt.dev"
  )
    throw Error("Invalid membership server configuration.");
  const call = async (action, data) => {
    const r = await fetchImpl(
      mainOrigin + "/api/v1/integrations/membership/" + action,
      {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(5000),
        headers: {
          authorization: "Bearer " + eventKey,
          "content-type": "application/json",
        },
        body: JSON.stringify(data),
      },
    );
    if (!r.ok)
      throw Error(
        "Membership verification unavailable. Retry the same request.",
      );
    const value = await r.json();
    if (
      !id.test(value.data?.memberRef) ||
      typeof value.data?.active !== "boolean"
    )
      throw Error("Invalid membership response.");
    return value.data;
  };
  return {
    verify: (memberRef) => call("verify", { memberRef }),
    redeem: (code, accountId) => call("redeem", { code, accountId }),
  };
}
// getAccount MUST validate the event site's existing logged-in user server-side
// (e.g. Supabase auth.getUser). Never return an account ID from request JSON.
export function createEventLinkHandler({
  eventOrigin,
  client,
  db,
  getAccount,
}) {
  const u = new URL(eventOrigin);
  if (u.protocol !== "https:" || u.origin !== eventOrigin)
    throw Error("Use the exact HTTPS event origin without a trailing slash.");
  return async (request) => {
    if (request.method !== "POST")
      return json({ error: "Method not allowed" }, 405);
    if (
      request.headers.get("origin") !== eventOrigin ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      return json({ error: "Forbidden" }, 403);
    try {
      const account = await getAccount(request);
      if (!id.test(account?.id))
        return json({ error: "Sign in to this event first" }, 401);
      const d = await body(request);
      if (
        Object.keys(d).length !== 1 ||
        !String(d.code || "").match(/^[A-Za-z0-9_-]{43}$/)
      )
        return json({ error: "Enter your event link code" }, 400);
      // Check event account exists before consuming a chapter-issued code.
      const row = await db
        .from("gdg_event_registrations")
        .select("account_id")
        .eq("account_id", account.id)
        .maybeSingle();
      if (row.error) throw Error();
      if (!row.data)
        return json({ error: "Register for this event first" }, 409);
      const linked = await client.redeem(d.code, account.id);
      if (!linked.active)
        return json({ error: "Active chapter membership required" }, 403);
      const result = await db.rpc("gdg_event_bind", {
        p_account: account.id,
        p_member: linked.memberRef,
      });
      if (result.error) throw Error();
      return json({ linked: true });
    } catch {
      return json(
        { error: "Linking could not be confirmed. Retry with the same code." },
        503,
      );
    }
  };
}
