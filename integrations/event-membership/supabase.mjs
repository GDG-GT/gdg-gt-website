// Server-only entry point for a separate event's Supabase project.
import { createClient } from "@supabase/supabase-js";
import {
  createEventAdapter,
  createEventMembershipClient,
  createEventLinkHandler,
} from "./server.mjs";
export function createSupabaseEventIntegration({
  eventId,
  eventKey,
  eventOrigin,
  supabaseUrl,
  supabaseServiceRoleKey,
}) {
  if (!supabaseUrl || !supabaseServiceRoleKey)
    throw Error("Configure the event project server environment.");
  const db = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const client = createEventMembershipClient({ eventId, eventKey });
  const getAccount = async (request) => {
    const match = /^Bearer ([^\s]+)$/.exec(
      request.headers.get("authorization") || "",
    );
    if (!match || match[1].length > 8192) return null;
    const { data, error } = await db.auth.getUser(match[1]);
    return error ? null : data.user;
  };
  return {
    verifyRequest: createEventAdapter({ eventId, eventKey, db }),
    linkRequest: createEventLinkHandler({
      eventOrigin,
      client,
      db,
      getAccount,
    }),
    // Use only in the event backend; never send this object or its key to a browser.
    verifyMembership: client.verify,
  };
}
